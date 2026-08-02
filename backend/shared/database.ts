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

export interface TransactionDatabase {
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
