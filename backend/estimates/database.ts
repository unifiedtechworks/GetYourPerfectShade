export type SqlParameter = Readonly<{
  name: string;
  value: string;
}>;

export type SqlRow = Readonly<Record<string, string | null>>;

export type SqlStatement = Readonly<{
  sql: string;
  parameters?: readonly SqlParameter[];
  transactionId: string;
}>;

/**
 * Chat 5 supplies the thin RDSDataClient adapter for this contract.
 * Business code intentionally has no dependency on CDK or generated resource names.
 */
export interface EstimateDatabase {
  beginTransaction(): Promise<string>;
  execute(statement: SqlStatement): Promise<readonly SqlRow[]>;
  commitTransaction(transactionId: string): Promise<void>;
  rollbackTransaction(transactionId: string): Promise<void>;
}

export function parameters(
  values: Readonly<Record<string, string>>,
): readonly SqlParameter[] {
  return Object.entries(values).map(([name, value]) => ({ name, value }));
}
