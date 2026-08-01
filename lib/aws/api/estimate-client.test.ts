import { describe, expect, it, vi } from "vitest";
import { createEstimateApiClient } from "./estimate-client";

describe("estimate API client", () => {
  it("sends bearer auth, idempotency, and canonical string money without tenant IDs", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) =>
      new Response(
        JSON.stringify({
          data: {
            estimateId: "estimate-id",
            status: "draft",
            replayed: false,
          },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    await createEstimateApiClient({
      accessToken: "access-token",
      baseUrl: "https://api.example.test/",
      fetchImpl: fetchImpl as typeof fetch,
    }).createDraft(
      {
        customerName: "Acme",
        projectName: "Atrium",
        projectLocation: "",
        preparedFor: "Morgan",
        contactInformation: "",
        documentType: "Bid Proposal",
        estimateNumber: "",
        pricingDescription: "",
        pricingAmountMinor: "9223372036854775807",
        depositPercent: "12.5",
      },
      "request-key-123456",
    );

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.example.test/v1/estimates/drafts");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer access-token",
      "idempotency-key": "request-key-123456",
    });
    const body = JSON.parse(String(init?.body));
    expect(body.pricingAmountMinor).toBe("9223372036854775807");
    expect(body).not.toHaveProperty("organizationId");
    expect(body).not.toHaveProperty("actorId");
  });
});
