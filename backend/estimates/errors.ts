export class EstimateServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly fields?: Readonly<Record<string, string>>,
  ) {
    super(message);
    this.name = "EstimateServiceError";
  }
}

export function invalidRequest(
  message: string,
  fields?: Readonly<Record<string, string>>,
): EstimateServiceError {
  return new EstimateServiceError("invalid_request", message, 400, fields);
}
