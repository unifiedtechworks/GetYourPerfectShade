import type { AccountApiResponse } from "../../lib/aws/api/account-contracts";
import type { SqlRow, TransactionDatabase } from "../shared/database";
import { parameters } from "../shared/database";

export class AccountServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AccountServiceError";
  }
}

export const ESTABLISH_ACCOUNT_CONTEXT_SQL = `
select actor_id, organization_id::text, organization_name, role
from app_private.establish_account_context(:subject)
`;

const GET_PROFILE_SQL = `
select email_snapshot, display_name
from app.profiles
where user_id = :subject
`;

function required(row: SqlRow, field: string): string {
  const value = row[field];
  if (!value) {
    throw new AccountServiceError(
      "database_contract_error",
      "The account data contract is invalid.",
      500,
    );
  }
  return value;
}

export class AccountService {
  constructor(private readonly database: TransactionDatabase) {}

  private async rollback(transactionId: string): Promise<void> {
    try {
      await this.database.rollbackTransaction(transactionId);
    } catch {
      // Preserve the original error. The adapter/runtime logs rollback failures.
    }
  }

  async getAccount(subject: string): Promise<AccountApiResponse> {
    const transactionId = await this.database.beginTransaction();
    try {
      const rows = await this.database.execute({
        sql: ESTABLISH_ACCOUNT_CONTEXT_SQL,
        parameters: parameters({ subject }),
        transactionId,
      });
      if (rows.length !== 1) {
        throw new AccountServiceError(
          "active_membership_required",
          "An active organization membership is required.",
          403,
        );
      }
      const role = required(rows[0], "role");
      if (role !== "owner" && role !== "admin" && role !== "staff") {
        throw new AccountServiceError(
          "active_membership_required",
          "An active organization membership is required.",
          403,
        );
      }
      const account = {
        organizationId: required(rows[0], "organization_id"),
        organizationName: required(rows[0], "organization_name"),
        role,
        profile: { displayName: "", email: "" },
      } satisfies AccountApiResponse;
      const profiles = await this.database.execute({
        sql: GET_PROFILE_SQL,
        parameters: parameters({ subject }),
        transactionId,
      });
      if (profiles.length !== 1) {
        throw new AccountServiceError(
          "database_contract_error",
          "The account data contract is invalid.",
          500,
        );
      }
      account.profile = {
        displayName: profiles[0].display_name ?? "",
        email: required(profiles[0], "email_snapshot"),
      };
      await this.database.commitTransaction(transactionId);
      return account;
    } catch (error) {
      await this.rollback(transactionId);
      throw error;
    }
  }
}
