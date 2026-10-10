import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const mailpitUrl = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";

for (const variant of ["560", "580"] as const) {
  test(`S${variant} preset exposes equipment controls and saves a private sedan hunt`, async ({ page, request }, testInfo) => {
    await signIn(page, request, "admin@example.test");
    await page.getByRole("button", { name: `Use S${variant} preset` }).click();
    await expect(page.getByLabel("Max price", { exact: true })).toHaveValue("40000");
    await expect(page.getByLabel("Minimum model year")).toHaveValue(variant === "580" ? "2021" : "2018");
    await expect(page.getByLabel("Maximum model year")).toHaveValue(variant === "580" ? "2025" : "2020");
    await expect(page.getByLabel("Body style", { exact: true })).toHaveValue("sedan");
    await expect(page.getByRole("checkbox", { name: "Apple CarPlay", exact: true })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Ventilated front seats", exact: true })).toBeChecked();
    if (variant === "580") {
      await expect(page.getByRole("checkbox", { name: "Rear-axle steering", exact: true })).toBeChecked();
      await expect(page.getByRole("checkbox", { name: "MAGIC BODY CONTROL", exact: true })).not.toBeChecked();
    }
    await page.locator(".search-form").screenshot({ path: testInfo.outputPath(`s${variant}-preset.png`) });
    await page.getByLabel("Search name").fill(`S${variant} value ${testInfo.project.name}`);
    await page.getByLabel("ZIP code").fill("10001");
    await page.getByRole("button", { name: /add saved search/i }).click();
    await expect(page.getByRole("status")).toContainText("now on the radar");
    await page.reload();
    const saved = page.locator(".saved-search", { hasText: `S${variant} value ${testInfo.project.name}` });
    await expect(saved).toContainText("sedan");
    await expect(saved).toContainText("$40,000");
    await expect(saved).toContainText(variant === "580" ? "2021–2025" : "2018–2020");
    await page.getByRole("link", { name: "S-Class buying guide" }).first().click();
    await expect(page.getByRole("heading", { name: "The S-Class value hunt" })).toBeVisible();
    await expect(page.getByText(/independent inspection/i).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "S580: the newer W223" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("w222-guide.png"), fullPage: true });
  });
}

test("anonymous visitors are sent to the invite-only magic-link screen", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("heading", { level: 1, name: /family car search, without the noise/i })).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /email me a sign-in link/i })).toBeVisible();
  await page.goto("/guides/w222");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await page.goto("/reports");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await page.goto("/reports/00000000-0000-4000-8000-000000000000");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});

test("a password session for an invited address is refused and never claims the invitation", async ({ browser, request }, testInfo) => {
  const email = `password-probe-${testInfo.project.name}@example.test`;
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, request, "admin@example.test");
  await adminPage.getByLabel("Name", { exact: true }).fill(`Probe ${testInfo.project.name}`);
  await adminPage.getByLabel("Email", { exact: true }).fill(email);
  await adminPage.getByRole("button", { name: "Allow magic-link access" }).click();
  await expect(adminPage.getByRole("status")).toContainText("can now request an AutoHunter magic link");

  // Sign-up auto-confirms, so anyone who knows an invited address can register it with a password
  // and receive a session without access to that inbox (ADR-022).
  const signUp = await passwordSignUp(request, email);
  if (signUp.session) {
    const attackerContext = await browser.newContext();
    await attackerContext.addCookies(sessionCookies(signUp.supabaseUrl, signUp.session));
    const attackerPage = await attackerContext.newPage();
    await attackerPage.goto("/");
    await expect(attackerPage).toHaveURL(/\/login(?:\?|$)/);
    await attackerPage.goto("/reports");
    await expect(attackerPage).toHaveURL(/\/login(?:\?|$)/);
    await attackerContext.close();
  }

  await adminPage.reload();
  await expect(adminPage.locator(".person-row", { hasText: email })).toContainText("Invite pending");
  await adminContext.close();
});

test("an invited user can complete a real magic-link flow and sign out", async ({ page, request }) => {
  await signIn(page, request, "admin@example.test");

  await expect(page.getByRole("heading", { level: 1, name: /your deals/i })).toBeVisible();
  await expect(page.getByRole("region", { name: "Hunt snapshot" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "AutoHunter account" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Review queue" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Vehicle lanes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /saved searches/i })).toBeVisible();
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});

test("searches, listings, and review decisions remain isolated per user", async ({ browser, request }) => {
  const adminContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const memberPage = await memberContext.newPage();

  await signIn(adminPage, request, "admin@example.test");
  await signIn(memberPage, request, "member@example.test");

  await expect(adminPage.locator(".saved-search-list").getByText("Member X5 family", { exact: true })).toHaveCount(0);
  await expect(memberPage.locator(".saved-search-list").getByText("Member X5 family", { exact: true })).toBeVisible();
  await expect(adminPage.getByRole("heading", { name: "2024 Lexus TX 350 Premium" })).toHaveCount(0);
  await expect(memberPage.getByRole("heading", { name: "2024 Lexus TX 350 Premium" })).toBeVisible();

  const adminX5 = adminPage.locator("article.listing-card", { hasText: "2024 BMW X5 xDrive40i" });
  const memberX5 = memberPage.locator("article.listing-card", { hasText: "2024 BMW X5 xDrive40i" });
  await expect(adminX5).toBeVisible();
  await expect(memberX5).toBeVisible();
  await adminX5.scrollIntoViewIfNeeded();
  const box = await adminX5.boundingBox();
  if (!box) throw new Error("admin X5 card has no swipeable bounds");
  await adminPage.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.35);
  await adminPage.mouse.down();
  await adminPage.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.35, { steps: 5 });
  await adminPage.mouse.up();
  await expect(adminX5).toHaveCount(0);

  await memberPage.reload();
  await expect(memberX5).toBeVisible();
  await expect(memberX5.getByRole("button", { name: "Interested" })).toBeVisible();

  await adminPage.goto("/?view=interested");
  await expect(adminPage.getByRole("heading", { name: "2024 BMW X5 xDrive40i" })).toBeVisible();
  await adminPage.locator("article.listing-card", { hasText: "2024 BMW X5 xDrive40i" }).getByRole("button", { name: "Back to review" }).click();
  await expect(adminPage.getByRole("heading", { name: "2024 BMW X5 xDrive40i" })).toHaveCount(0);

  await adminContext.close();
  await memberContext.close();
});

test("queue price caps use shareable URL filters", async ({ page, request }) => {
  await signIn(page, request, "admin@example.test");

  await expect(page.getByRole("heading", { name: "2024 BMW X5 xDrive40i" })).toBeVisible();
  await page.getByLabel("Max purchase price").fill("57000");
  await page.getByRole("button", { name: "Apply price caps" }).click();

  await expect(page).toHaveURL(/maxPrice=57000/);
  await expect(page.getByRole("heading", { name: "2024 BMW X5 xDrive40i" })).toHaveCount(0);
  await page.getByRole("link", { name: "Clear price caps" }).click();
  await expect(page.getByRole("heading", { name: "2024 BMW X5 xDrive40i" })).toBeVisible();
});

test("the review queue trusts only matches confirmed under a search's current definition", async ({ page, request }) => {
  await signIn(page, request, "member@example.test");

  // Seeded: the member's SQ7 search changed after its Premium Plus matches were last confirmed.
  await expect(page.getByRole("heading", { name: "2022 Audi SQ7 Prestige" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "2022 Audi SQ7 Premium Plus" })).toHaveCount(0);

  // A decision the member already made survives the change.
  await page.goto("/?view=interested");
  await expect(page.getByRole("heading", { name: "2021 Audi SQ7 Premium Plus" })).toBeVisible();
});

test("a re-ingested listing shows the trim and title it was last judged on", async ({ page, request }) => {
  const ingestSecret = process.env.INGEST_SECRET;
  if (!ingestSecret) throw new Error("INGEST_SECRET is required for ingest stories");
  const image = "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1200&q=80";
  const listing = {
    source: "auto_dev",
    sourceListingId: "e2e-audi-sq7-relabelled",
    searchId: "99999999-9999-4999-8999-999999999999",
    url: "https://dealer.example/audi-sq7-relabelled",
    vin: "WA1VWBF70PD000003",
    year: 2023,
    make: "Audi",
    model: "SQ7",
    price: 59990,
    mileage: 21000,
    distanceMiles: 61,
    location: "Quakertown, PA",
    transmissionClaim: "Automatic",
    imageUrls: [image],
    primaryImageUrl: image,
    requiresManualVerification: false,
  };

  // The provider first labels the car Premium Plus, then relabels it Prestige on a later run.
  for (const trim of ["4.0T Premium Plus", "Prestige"]) {
    const response = await request.post("/api/ingest", {
      headers: { authorization: `Bearer ${ingestSecret}` },
      data: { candidates: [{ ...listing, trim, title: `2023 Audi SQ7 ${trim}` }] },
    });
    expect(response.status()).toBe(200);
  }

  await signIn(page, request, "member@example.test");
  await expect(page.getByRole("heading", { name: "2023 Audi SQ7 Prestige" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "2023 Audi SQ7 4.0T Premium Plus" })).toHaveCount(0);
});

test("a used car is priced against comparable listings and placeholder prices stay out", async ({ page, request }, testInfo) => {
  const ingestSecret = process.env.INGEST_SECRET;
  if (!ingestSecret) throw new Error("INGEST_SECRET is required for ingest stories");
  const run = testInfo.project.name;
  const image = "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1200&q=80";
  const sq7 = {
    source: "auto_dev",
    searchId: "99999999-9999-4999-8999-999999999999",
    year: 2024,
    make: "Audi",
    model: "SQ7",
    trim: "Prestige",
    title: "2024 Audi SQ7 Prestige",
    mileage: 15000,
    distanceMiles: 40,
    location: "Doylestown, PA",
    transmissionClaim: "Automatic",
    imageUrls: [image],
    primaryImageUrl: image,
    requiresManualVerification: false,
  };
  const listing = (name: string, price: number) => ({
    ...sq7,
    price,
    sourceListingId: `e2e-market-${run}-${name}`,
    url: `https://dealer.example/market-${run}-${name}`,
  });
  // Six comparable cars around $66,000, then one priced well below them and one carrying a
  // placeholder in its price field.
  const comparables = [65000, 65500, 66000, 66500, 67000, 67500].map((price, index) => listing(`comparable-${index}`, price));
  for (const candidates of [comparables, [listing("target", 58990), listing("placeholder", 2150)]]) {
    const response = await request.post("/api/ingest", {
      headers: { authorization: `Bearer ${ingestSecret}` },
      data: { candidates },
    });
    expect(response.status()).toBe(200);
  }

  await signIn(page, request, "member@example.test");
  const card = (name: string) => page.locator("article.listing-card", {
    has: page.locator(`a[href="https://dealer.example/market-${run}-${name}"]`),
  });
  await expect(card("target")).toContainText(/\$[\d,]+ below similar cars \(\d+ compared\)/);
  await expect(card("placeholder")).toHaveCount(0);
});

test("a member can create a private search and listing cards keep real images and source links", async ({ page, request }, testInfo) => {
  await signIn(page, request, "member@example.test");

  const lexus = page.locator("article.listing-card", { hasText: "2024 Lexus TX 350 Premium" });
  await expect(lexus.locator("img")).toHaveAttribute("src", /^https:\/\//);
  await expect(lexus.getByRole("link", { name: /view listing/i })).toHaveAttribute("href", "https://dealer.example/lexus-tx");
  await expect(lexus.getByRole("link", { name: /view listing/i })).toHaveAttribute("target", "_blank");

  const searchName = `Member R1S ${testInfo.project.name}`;
  await page.getByLabel("Search name").fill(searchName);
  await page.getByLabel("Make").fill("Rivian");
  await page.getByLabel("Model", { exact: true }).fill("R1S");
  await page.getByLabel("ZIP code").fill("10001");
  await page.getByLabel("Radius in miles").fill("100");
  await page.getByLabel("Max price").fill("65000");
  await page.getByRole("button", { name: /add saved search/i }).click();

  await expect(page.getByText(searchName, { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("now on the radar");
});

test("an admin can invite household members and transfer a starter search", async ({ browser, request }) => {
  const adminContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const memberPage = await memberContext.newPage();

  await signIn(adminPage, request, "admin@example.test");
  await expect(adminPage.getByRole("heading", { name: "Household access" })).toBeVisible();
  await adminPage.getByLabel("Name", { exact: true }).fill("Alex");
  await adminPage.getByLabel("Email", { exact: true }).fill("alex@example.test");
  await adminPage.getByRole("button", { name: "Allow magic-link access" }).click();
  await expect(adminPage.getByRole("status")).toContainText("can now request an AutoHunter magic link");
  await expect(adminPage.locator(".person-row", { hasText: "Alex" })).toContainText("Invite pending");

  const ownership = adminPage.getByLabel("Owner for Rivian R1S");
  await ownership.selectOption({ label: "Member" });
  await ownership.locator("xpath=ancestor::form").getByRole("button", { name: "Assign" }).click();
  await expect(ownership).toHaveValue("22222222-2222-4222-8222-222222222222");

  await signIn(memberPage, request, "member@example.test");
  await expect(memberPage.locator(".saved-search strong").filter({ hasText: /^Rivian R1S$/ })).toHaveCount(1);

  await adminPage.reload();
  const restoredOwnership = adminPage.getByLabel("Owner for Rivian R1S");
  const adminOwnerId = await restoredOwnership.locator("option", { hasText: "Admin" }).getAttribute("value");
  if (!adminOwnerId) throw new Error("Admin owner option is missing");
  await restoredOwnership.selectOption({ label: "Admin" });
  await restoredOwnership.locator("xpath=ancestor::form").getByRole("button", { name: "Assign" }).click();
  await expect(restoredOwnership).toHaveValue(adminOwnerId);

  await adminContext.close();
  await memberContext.close();
});

test("report history and report details remain private to their owner", async ({ browser, request }) => {
  const adminContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const memberPage = await memberContext.newPage();

  await signIn(adminPage, request, "admin@example.test");
  await adminPage.goto("/reports");
  await expect(adminPage.getByRole("heading", { level: 1, name: "Reports", exact: true })).toBeVisible();
  await expect(adminPage.getByRole("link", { name: /august 9, 2026/i })).toBeVisible();
  await expect(adminPage.getByRole("link", { name: /august 8, 2026/i })).toHaveCount(0);

  await adminPage.getByRole("link", { name: /august 9, 2026/i }).click();
  await expect(adminPage.getByRole("heading", { level: 1, name: /august 9, 2026/i })).toBeVisible();
  await expect(adminPage.getByRole("heading", { name: "2024 BMW X5 xDrive40i" })).toBeVisible();
  await expect(adminPage.getByText("2024 Lexus TX 350 Premium", { exact: true })).toHaveCount(0);

  const forbidden = await adminPage.goto("/reports/88888888-8888-4888-8888-888888888888");
  expect(forbidden?.status()).toBe(404);
  await expect(adminPage.getByText("2024 Lexus TX 350 Premium", { exact: true })).toHaveCount(0);

  await signIn(memberPage, request, "member@example.test");
  await memberPage.goto("/reports");
  await expect(memberPage.getByRole("link", { name: /august 8, 2026/i })).toBeVisible();
  await expect(memberPage.getByRole("link", { name: /august 9, 2026/i })).toHaveCount(0);

  await adminContext.close();
  await memberContext.close();
});

async function signIn(page: Page, request: APIRequestContext, email: string) {
  await request.delete(`${mailpitUrl}/api/v1/messages`, { data: {} });
  // Local Auth sends one link per address per second (`max_frequency`), and back-to-back stories
  // that sign in the same person can ask sooner on a fast machine. Ask again after the window, from
  // a fresh form so the previous attempt's message cannot be mistaken for the new answer.
  for (let attempt = 1; ; attempt += 1) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: /email me a sign-in link/i }).click();
    const status = page.getByRole("status");
    await expect(status).toContainText(/one-time sign-in link|could not send a sign-in link/);
    if ((await status.textContent())?.includes("one-time sign-in link")) break;
    if (attempt === 3) throw new Error("local Auth kept refusing the sign-in link");
    await page.waitForTimeout(1_500);
  }

  await expect.poll(async () => {
    const response = await request.get(`${mailpitUrl}/api/v1/messages`);
    const body = await response.json() as Mailbox;
    return body.messages.find((message) => message.To.some((recipient) => recipient.Address === email))?.ID ?? null;
  }, { timeout: 10_000 }).not.toBeNull();

  const listResponse = await request.get(`${mailpitUrl}/api/v1/messages`);
  const mailbox = await listResponse.json() as Mailbox;
  const id = mailbox.messages.find((message) => message.To.some((recipient) => recipient.Address === email))?.ID;
  if (!id) throw new Error("magic-link email was not captured");
  const messageResponse = await request.get(`${mailpitUrl}/api/v1/message/${encodeURIComponent(id)}`);
  const message = await messageResponse.json() as { HTML: string };
  const href = message.HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/)?.[1]?.replaceAll("&amp;", "&");
  if (!href) throw new Error("magic-link email did not contain the expected callback");

  // Local Auth builds links from its configured site URL; follow the callback on this run's server.
  const callback = new URL(href);
  await page.goto(`${callback.pathname}${callback.search}`);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("navigation", { name: "Review queue" })).toBeVisible();
}

async function passwordSignUp(request: APIRequestContext, email: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) throw new Error("local Supabase Auth settings are missing");
  const response = await request.post(`${supabaseUrl}/auth/v1/signup`, {
    headers: { apikey: publishableKey },
    data: { email, password: `E2e-${crypto.randomUUID()}` },
  });
  expect(response.ok()).toBe(true);
  const body = await response.json() as { access_token?: string };
  // With confirmations required, sign-up returns no session and the provider has already refused.
  return { supabaseUrl, session: body.access_token ? body : null };
}

// Writes a session the way @supabase/ssr stores it: a base64url value behind the `base64-` prefix,
// split into numbered chunks when it exceeds the 3,180-character cookie budget.
function sessionCookies(supabaseUrl: string, session: object) {
  const appUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
  const name = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const chunks = value.match(/.{1,3180}/g) ?? [];
  return chunks.length === 1
    ? [{ name, value, url: appUrl }]
    : chunks.map((chunk, index) => ({ name: `${name}.${index}`, value: chunk, url: appUrl }));
}

interface Mailbox {
  messages: Array<{ ID: string; To: Array<{ Address: string }> }>;
}
