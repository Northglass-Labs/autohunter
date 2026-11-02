const CALLBACK_PATH = "/.well-known/ebay-deletion";

function jsonResponse(body: object, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname !== CALLBACK_PATH) {
    return new Response("Not Found", { status: 404 });
  }

  if (!env.EBAY_DELETION_VERIFICATION_TOKEN) {
    console.error(
      JSON.stringify({
        event: "ebay_account_deletion_configuration_error",
        reason: "missing_secret_binding",
      }),
    );
    return jsonResponse({ error: "configuration error" }, 500);
  }

  if (request.method === "GET") {
    const challenge = url.searchParams.get("challenge_code");
    if (!challenge) {
      return jsonResponse({ error: "missing challenge_code" }, 400);
    }

    const endpointUrl = url.origin + url.pathname;
    const input = new TextEncoder().encode(
      challenge + env.EBAY_DELETION_VERIFICATION_TOKEN + endpointUrl,
    );
    const digest = await crypto.subtle.digest("SHA-256", input);

    return jsonResponse({ challengeResponse: toHex(digest) }, 200);
  }

  if (request.method === "POST") {
    console.log(
      JSON.stringify({
        event: "ebay_account_deletion_notification_acknowledged",
        received_at: new Date().toISOString(),
        path: url.pathname,
      }),
    );
    return new Response(null, { status: 200 });
  }

  return new Response("Method Not Allowed", {
    status: 405,
    headers: { allow: "GET, POST" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "ebay_account_deletion_unhandled_error",
          error: error instanceof Error ? error.name : "UnknownError",
        }),
      );
      return jsonResponse({ error: "internal error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
