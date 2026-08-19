import { describe, expect, it, vi } from "vitest";
import {
  createEstimateCommandKeyTracker,
  resolveIdempotencyKey,
} from "./idempotency";

describe("estimate command idempotency", () => {
  it("preserves a valid form key and replaces missing or malformed values", () => {
    const createKey = vi.fn(() => "fallback-key-1234567890");
    expect(resolveIdempotencyKey(" request-key-1234567890 ", createKey)).toBe(
      "request-key-1234567890",
    );
    expect(resolveIdempotencyKey("short", createKey)).toBe(
      "fallback-key-1234567890",
    );
    expect(resolveIdempotencyKey(undefined, createKey)).toBe(
      "fallback-key-1234567890",
    );
    expect(createKey).toHaveBeenCalledTimes(2);
  });

  it("fails closed if a fallback key generator is invalid", () => {
    expect(() => resolveIdempotencyKey(undefined, () => "invalid key"))
      .toThrow("Could not create a valid estimate command key.");
  });

  it("reuses a command key across retries and rotates it only after clearing", () => {
    let sequence = 0;
    const tracker = createEstimateCommandKeyTracker(
      () => `command-key-${String(++sequence).padStart(12, "0")}`,
    );

    const first = tracker.keyFor("generate-pdf");
    expect(tracker.keyFor("generate-pdf")).toBe(first);
    expect(tracker.keyFor("issue")).not.toBe(first);

    tracker.clear("generate-pdf");
    expect(tracker.keyFor("generate-pdf")).not.toBe(first);
  });
});
