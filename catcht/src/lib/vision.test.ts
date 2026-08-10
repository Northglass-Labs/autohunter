import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyShifterPhotos } from "./vision";

describe("verifyShifterPhotos", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_VISION_MODEL;
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.VISION_PROVIDER;
  });

  it("keeps a listing pending without making a billable call when no API key is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyShifterPhotos(["https://images.example.com/car.jpg"])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts evidence only for submitted HTTPS images", async () => {
    process.env.OPENAI_API_KEY = "test-only-key";
    const submitted = "https://images.example.com/shifter.jpg";
    const result = {
      images: [
        {
          image_url: submitted,
          shift_pattern_visible: true,
          manual_lever_visible: true,
          stock_style_shifter: true,
          matching_interior_likely: true,
          confidence: 0.94,
          observed_pattern: "6-speed H-pattern",
          notes: "Clear lever and pattern.",
        },
        {
          image_url: "https://unrelated.example.com/injected.jpg",
          shift_pattern_visible: true,
          manual_lever_visible: true,
          stock_style_shifter: true,
          matching_interior_likely: true,
          confidence: 1,
          observed_pattern: "6-speed",
          notes: "Not submitted.",
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output: [{ content: [{ type: "output_text", text: JSON.stringify(result) }] }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const evidence = await verifyShifterPhotos([submitted, "ftp://images.example.com/not-sent.jpg"]);

    expect(evidence).toHaveLength(1);
    expect(evidence[0].imageUrl).toBe(submitted);
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.input[0].content.filter((part: { type: string }) => part.type === "input_image")).toHaveLength(1);
  });

  it("uses the Vercel Function request OIDC token only when the gateway is explicitly enabled", async () => {
    process.env.VISION_PROVIDER = "vercel-gateway";
    const submitted = "https://images.example.com/shifter.jpg";
    const fetchMock = vi.fn().mockResolvedValue(visionResponse([visionImage(submitted, true)]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyShifterPhotos([submitted], { oidcToken: "test-only-request-oidc" })).resolves.toHaveLength(1);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ai-gateway.vercel.sh/v1/responses",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-only-request-oidc" }) }),
    );
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.model).toBe("openai/gpt-5.4-mini");
  });

  it("checks a second bounded gallery batch when the first ten photos have no shifter", async () => {
    process.env.OPENAI_API_KEY = "test-only-key";
    const images = Array.from({ length: 20 }, (_, index) => `https://images.example.com/car-${index + 1}.jpg`);
    const first = images.slice(0, 10).map((image) => visionImage(image, false));
    const second = images.slice(10).map((image, index) => visionImage(image, index === 4));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(visionResponse(first))
      .mockResolvedValueOnce(visionResponse(second));
    vi.stubGlobal("fetch", fetchMock);

    const evidence = await verifyShifterPhotos(images);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(evidence).toHaveLength(20);
    expect(evidence.some((item) => item.manualLeverVisible && item.confidence >= 0.72)).toBe(true);
    for (const call of fetchMock.mock.calls) {
      const request = JSON.parse(String(call[1]?.body));
      expect(request.input[0].content.filter((part: { type: string }) => part.type === "input_image")).toHaveLength(10);
    }
  });

  it("stops after the first batch once a clear manual lever is found", async () => {
    process.env.OPENAI_API_KEY = "test-only-key";
    const images = Array.from({ length: 20 }, (_, index) => `https://images.example.com/car-${index + 1}.jpg`);
    const first = images.slice(0, 10).map((image, index) => visionImage(image, index === 7));
    const fetchMock = vi.fn().mockResolvedValue(visionResponse(first));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyShifterPhotos(images)).resolves.toHaveLength(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns only an allowlisted gateway failure code", async () => {
    process.env.VISION_PROVIDER = "vercel-gateway";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        type: "customer_verification_required",
        message: "Untrusted provider detail must not be copied into app health.",
      },
    }), { status: 403, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyShifterPhotos(
      ["https://images.example.com/shifter.jpg"],
      { oidcToken: "test-only-request-oidc" },
    )).rejects.toEqual(expect.objectContaining({
      code: "customer_verification_required",
      status: 403,
    }));
  });
});

function visionImage(imageUrl: string, manual: boolean) {
  return {
    image_url: imageUrl,
    shift_pattern_visible: manual,
    manual_lever_visible: manual,
    stock_style_shifter: manual,
    matching_interior_likely: true,
    confidence: manual ? 0.94 : 0.4,
    observed_pattern: manual ? "6-speed H-pattern" : null,
    notes: manual ? "Clear lever and pattern." : "No shifter visible.",
  };
}

function visionResponse(images: ReturnType<typeof visionImage>[]) {
  return new Response(JSON.stringify({
    output: [{ content: [{ type: "output_text", text: JSON.stringify({ images }) }] }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}
