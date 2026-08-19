export type PasswordValidationError = "length" | "complexity" | "mismatch";

const COGNITO_SYMBOLS = "^$*.[]{}()?\"!@#%&/\\,><':;|_~`=+-";

function hasCognitoSymbol(password: string) {
  return [...password].some((character) => COGNITO_SYMBOLS.includes(character)) ||
    password.slice(1, -1).includes(" ");
}

export function validateStaffPassword(
  password: string,
  confirmation: string,
): PasswordValidationError | null {
  if (password.length < 12) return "length";
  if (
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !hasCognitoSymbol(password)
  ) return "complexity";
  if (password !== confirmation) return "mismatch";
  return null;
}
