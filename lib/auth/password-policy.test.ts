import { describe, expect, it } from "vitest";
import { validateStaffPassword } from "./password-policy";

describe("staff password acceptance policy", () => {
  it("accepts matching passwords that satisfy the deployed Cognito policy", () => {
    expect(validateStaffPassword("Correct-Horse7", "Correct-Horse7")).toBeNull();
  });

  it.each([
    ["Short-7", "Short-7", "length"],
    ["alllowercase-7", "alllowercase-7", "complexity"],
    ["ALLUPPERCASE-7", "ALLUPPERCASE-7", "complexity"],
    ["NoNumbers-Here", "NoNumbers-Here", "complexity"],
    ["NoSymbolsHere7", "NoSymbolsHere7", "complexity"],
    ["EmojiOnlyHere7🙂", "EmojiOnlyHere7🙂", "complexity"],
    ["Correct-Horse7", "Different-Horse7", "mismatch"],
  ])("rejects invalid password input without returning it", (password, confirmation, error) => {
    expect(validateStaffPassword(password, confirmation)).toBe(error);
  });
});
