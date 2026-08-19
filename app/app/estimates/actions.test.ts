import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class EstimateApiError extends Error {
    constructor(readonly code: string, message: string) {
      super(message);
    }
  }
  return {
    createDraft: vi.fn(),
    redirect: vi.fn(),
    EstimateApiError,
  };
});

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/aws/api/estimate-identity", () => ({
  requireEstimateApiIdentity: vi.fn(async () => ({ accessToken: "token" })),
}));
vi.mock("@/lib/aws/api/estimate-client", () => ({
  EstimateApiError: mocks.EstimateApiError,
  createEstimateApiClient: () => ({ createDraft: mocks.createDraft }),
}));
vi.mock("@/lib/estimates/calculations", () => ({
  calculateEstimateTotals: () => ({ totalMinor: 10000n }),
  compareDecimal: () => 0,
  decimalToString: () => "50",
  parseDecimal: () => ({ coefficient: 0n, scale: 0 }),
  parseMoneyToMinorUnits: () => 10000n,
  parsePercent: () => ({ coefficient: 50n, scale: 0 }),
}));
vi.mock("@/lib/estimates/editor", () => ({
  DEFAULT_DEPOSIT_PERCENT: "50",
  validateEstimateEditor: vi.fn(),
}));
vi.mock("@/lib/estimates/idempotency", () => ({
  resolveIdempotencyKey: (value: unknown) => String(value),
}));

import { createEstimate } from "./actions";

function validForm(): FormData {
  const form = new FormData();
  form.set("customerName", "Acceptance Customer");
  form.set("projectName", "Acceptance Project");
  form.set("preparedFor", "Acceptance Architect");
  form.set("documentType", "Bid Proposal");
  form.set("pricingAmount", "100.00");
  form.set("depositPercent", "50");
  form.set("idempotencyKey", "create-key-1234567890");
  return form;
}

describe("estimate creation action", () => {
  beforeEach(() => {
    mocks.createDraft.mockReset();
    mocks.redirect.mockReset();
  });

  it("reuses the form-scoped idempotency key for duplicate submissions", async () => {
    mocks.createDraft.mockResolvedValue({ data: { estimateId: "estimate-id" } });
    const form = validForm();

    await createEstimate({ message: "" }, form);
    await createEstimate({ message: "" }, form);

    expect(mocks.createDraft).toHaveBeenCalledTimes(2);
    expect(mocks.createDraft.mock.calls.map((call) => call[1])).toEqual([
      "create-key-1234567890",
      "create-key-1234567890",
    ]);
  });

  it("returns the API's stable safe message instead of a generic failure", async () => {
    mocks.createDraft.mockRejectedValue(
      new mocks.EstimateApiError(
        "active_membership_required",
        "An active membership is required.",
      ),
    );

    await expect(createEstimate({ message: "" }, validForm())).resolves.toMatchObject({
      message: "An active membership is required.",
    });
  });
});
