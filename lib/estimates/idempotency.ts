const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,200}$/;

export function resolveIdempotencyKey(
  value: unknown,
  createKey: () => string,
): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (IDEMPOTENCY_KEY_PATTERN.test(candidate)) return candidate;
  const generated = createKey().trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(generated)) {
    throw new Error("Could not create a valid estimate command key.");
  }
  return generated;
}

export type EstimateCommandKeyTracker = Readonly<{
  keyFor(command: string): string;
  clear(command: string): void;
}>;

export function createEstimateCommandKeyTracker(
  createKey: () => string,
): EstimateCommandKeyTracker {
  const keys = new Map<string, string>();
  return {
    keyFor(command) {
      const existing = keys.get(command);
      if (existing) return existing;
      const key = resolveIdempotencyKey(undefined, createKey);
      keys.set(command, key);
      return key;
    },
    clear(command) {
      keys.delete(command);
    },
  };
}
