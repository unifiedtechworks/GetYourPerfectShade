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

  it("gets and updates one estimate without sending tenant identity", async () => {
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ data: { id: "estimate-id" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = createEstimateApiClient({
      accessToken: "access-token",
      baseUrl: "https://api.example.test",
      fetchImpl: fetchImpl as typeof fetch,
    });
    await client.get("estimate/id");
    await client.updateDraft("estimate-id", {
      expectedRowVersion: "2",
      documentType: "Bid Proposal",
      estimateNumber: "",
      estimateDate: "",
      validThrough: "",
      bidDue: "",
      projectName: "Atrium",
      projectLocation: "",
      preparedFor: "Morgan",
      contactInformation: "",
      depositPercent: "0",
      includeAlternatePricing: false,
      scopeItems: [],
      pricingLines: [{ description: "Base", amountMinor: "100" }],
      alternatePricingLines: [],
    });

    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://api.example.test/v1/estimates/estimate%2Fid",
    );
    const [url, init] = fetchImpl.mock.calls[1];
    expect(url).toBe("https://api.example.test/v1/estimates/estimate-id");
    expect(init?.method).toBe("PUT");
    expect(init?.headers).toMatchObject({ authorization: "Bearer access-token" });
    const body = JSON.parse(String(init?.body));
    expect(body.expectedRowVersion).toBe("2");
    expect(body.pricingLines[0].amountMinor).toBe("100");
    expect(body).not.toHaveProperty("organizationId");
  });
});
