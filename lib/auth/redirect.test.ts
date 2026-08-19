import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it("allows local absolute paths", () => {
    expect(safeNextPath("/app/account?tab=profile")).toBe("/app/account?tab=profile");
  });

  it.each([
    undefined,
    null,
    "",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/app\r\nLocation: https://evil.example",
  ])(
    "rejects unsafe redirect %s",
    (value) => expect(safeNextPath(value)).toBe("/app")
  );
});
