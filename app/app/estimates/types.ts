export type CreateEstimateState = Readonly<{
  message: string;
  fields?: Readonly<Record<string, string>>;
}>;

export type SaveEstimateState = Readonly<{
  status: "idle" | "success" | "error" | "stale" | "readonly";
  message: string;
  fields?: Readonly<Record<string, string>>;
  rowVersion?: string;
  savedAt?: string;
  saveSequence: number;
}>;
