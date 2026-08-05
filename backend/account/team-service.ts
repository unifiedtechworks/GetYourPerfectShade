import type {
  InviteTeamMemberResponse,
  ManagedOrganizationRole,
  MembershipStatus,
  OrganizationRole,
  TeamListResponse,
  TeamMember,
  UpdateProfileResponse,
  UpdateTeamMemberResponse,
} from "../../lib/aws/api/account-contracts";
import type { SqlRow, TransactionDatabase } from "../shared/database";
import { parameters } from "../shared/database";
import {
  CognitoDirectoryError,
  type CognitoDirectoryUser,
  type StaffIdentityDirectory,
} from "./cognito-admin";
import {
  AccountServiceError,
  ESTABLISH_ACCOUNT_CONTEXT_SQL,
} from "./service";

type ManagerContext = Readonly<{
  actorId: string;
  organizationId: string;
  role: "owner" | "admin";
}>;

type MembershipAction = "disable" | "enable" | "remove";

const FIND_TEAM_EMAIL_SQL = `
select m.id::text
from app.organization_memberships m
join app.profiles p on p.user_id = m.user_id
where m.organization_id = :organizationId::uuid
  and lower(p.email_snapshot) = :email
limit 1
`;

const LIST_TEAM_SQL = `
select m.id::text as membership_id, m.user_id, p.email_snapshot,
       p.display_name, m.role, m.status, m.created_at::text,
       m.updated_at::text
from app.organization_memberships m
join app.profiles p on p.user_id = m.user_id
where m.organization_id = :organizationId::uuid
order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,
         lower(p.email_snapshot), m.created_at
`;

const CREATE_STAFF_MEMBERSHIP_SQL = `
select outcome, membership_id::text, membership_role, membership_status,
       membership_created_at::text, membership_updated_at::text
from app_private.create_staff_membership(
  :subject, :cognitoSubject, :email, :targetRole, :requestId, :recovered::boolean
)
`;

const UPDATE_STAFF_ROLE_SQL = `
select outcome, membership_id::text, membership_role, membership_status
from app_private.update_staff_membership_role(
  :subject, :membershipId::uuid, :targetRole, :requestId
)
`;

const UPDATE_STAFF_STATUS_SQL = `
select outcome, membership_id::text, membership_role, membership_status
from app_private.update_staff_membership_status(
  :subject, :membershipId::uuid, :requestedAction, :requestId
)
`;

const UPDATE_PROFILE_SQL = `
select outcome, display_name, email_snapshot
from app_private.update_own_profile(:subject, :displayName, :requestId)
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

function isRole(value: string): value is OrganizationRole {
  return value === "owner" || value === "admin" || value === "staff";
}

function isStatus(value: string): value is MembershipStatus {
  return value === "active" || value === "disabled" || value === "removed";
}

function outcomeError(outcome: string): AccountServiceError {
  switch (outcome) {
    case "active_membership_required":
      return new AccountServiceError(
        outcome,
        "An active organization membership is required.",
        403,
      );
    case "membership_management_forbidden":
      return new AccountServiceError(
        outcome,
        "You do not have permission to manage this membership.",
        403,
      );
    case "target_role_forbidden":
      return new AccountServiceError(
        outcome,
        "That role cannot be assigned through staff administration.",
        403,
      );
    case "self_action_forbidden":
      return new AccountServiceError(
        outcome,
        "You cannot perform that membership action on yourself.",
        403,
      );
    case "owner_protected":
      return new AccountServiceError(
        outcome,
        "Owner membership cannot be changed through staff administration.",
        403,
      );
    case "last_owner_protected":
      return new AccountServiceError(
        outcome,
        "The organization must retain an active owner.",
        409,
      );
    case "duplicate_membership":
    case "duplicate_email":
      return new AccountServiceError(
        outcome,
        "That staff account or membership already exists.",
        409,
      );
    case "membership_state_conflict":
      return new AccountServiceError(
        outcome,
        "That membership is not in a state that allows this action.",
        409,
      );
    case "target_not_found":
      return new AccountServiceError(
        outcome,
        "The requested membership was not found.",
        404,
      );
    default:
      return new AccountServiceError(
        "database_contract_error",
        "The account service returned an invalid result.",
        500,
      );
  }
}

function directoryError(error: CognitoDirectoryError): AccountServiceError {
  if (error.code === "existing_user") {
    return new AccountServiceError(
      "existing_cognito_user",
      "A Cognito account already exists for that email. Use the documented recovery option only after verifying it has no membership.",
      409,
    );
  }
  if (error.code === "configuration") {
    return new AccountServiceError(
      "cognito_configuration_unavailable",
      "Staff provisioning is not configured.",
      503,
    );
  }
  return new AccountServiceError(
    "cognito_unavailable",
    "The staff identity service is unavailable.",
    503,
  );
}

export class TeamService {
  constructor(
    private readonly database: TransactionDatabase,
    private readonly directory: StaffIdentityDirectory,
  ) {}

  private async rollback(transactionId: string): Promise<void> {
    try {
      await this.database.rollbackTransaction(transactionId);
    } catch {
      // Preserve the original safe operation error.
    }
  }

  private async managerContext(
    transactionId: string,
    subject: string,
  ): Promise<ManagerContext> {
    const rows = await this.database.execute({
      sql: ESTABLISH_ACCOUNT_CONTEXT_SQL,
      parameters: parameters({ subject }),
      transactionId,
    });
    if (rows.length !== 1) {
      throw outcomeError("active_membership_required");
    }
    const role = required(rows[0], "role");
    if (role !== "owner" && role !== "admin") {
      throw outcomeError("membership_management_forbidden");
    }
    return {
      actorId: required(rows[0], "actor_id"),
      organizationId: required(rows[0], "organization_id"),
      role,
    };
  }

  private async preflightInvitation(
    subject: string,
    email: string,
    targetRole: ManagedOrganizationRole,
    resumeExistingUser: boolean,
  ): Promise<void> {
    const transactionId = await this.database.beginTransaction();
    try {
      const manager = await this.managerContext(transactionId, subject);
      if (manager.role === "admin" && targetRole !== "staff") {
        throw outcomeError("target_role_forbidden");
      }
      const duplicate = await this.database.execute({
        sql: FIND_TEAM_EMAIL_SQL,
        parameters: parameters({
          organizationId: manager.organizationId,
          email,
        }),
        transactionId,
      });
      if (duplicate.length > 0 && !resumeExistingUser) {
        throw outcomeError("duplicate_email");
      }
      await this.database.commitTransaction(transactionId);
    } catch (error) {
      await this.rollback(transactionId);
      throw error;
    }
  }

  private async createMembership(
    subject: string,
    user: CognitoDirectoryUser,
    targetRole: ManagedOrganizationRole,
    requestId: string,
    recovered: boolean,
  ) {
    const transactionId = await this.database.beginTransaction();
    try {
      const rows = await this.database.execute({
        sql: CREATE_STAFF_MEMBERSHIP_SQL,
        parameters: parameters({
          subject,
          cognitoSubject: user.subject,
          email: user.email,
          targetRole,
          requestId,
          recovered: String(recovered),
        }),
        transactionId,
      });
      if (rows.length !== 1) throw outcomeError("database_contract_error");
      const outcome = required(rows[0], "outcome");
      if (outcome !== "created" && outcome !== "already_complete") {
        throw outcomeError(outcome);
      }
      const role = required(rows[0], "membership_role");
      const status = required(rows[0], "membership_status");
      if ((role !== "admin" && role !== "staff") || status !== "active") {
        throw outcomeError("database_contract_error");
      }
      const result = {
        membershipId: required(rows[0], "membership_id"),
        role,
        status,
        recovered,
        alreadyComplete: outcome === "already_complete",
      } satisfies InviteTeamMemberResponse["data"];
      await this.database.commitTransaction(transactionId);
      return result;
    } catch (error) {
      await this.rollback(transactionId);
      throw error;
    }
  }

  async list(subject: string): Promise<TeamListResponse> {
    const transactionId = await this.database.beginTransaction();
    let rows: readonly SqlRow[];
    try {
      const manager = await this.managerContext(transactionId, subject);
      rows = await this.database.execute({
        sql: LIST_TEAM_SQL,
        parameters: parameters({ organizationId: manager.organizationId }),
        transactionId,
      });
      await this.database.commitTransaction(transactionId);
    } catch (error) {
      await this.rollback(transactionId);
      throw error;
    }

    let directoryUsers: readonly CognitoDirectoryUser[] = [];
    let cognitoStatusAvailable = true;
    try {
      directoryUsers = await this.directory.list();
    } catch {
      cognitoStatusAvailable = false;
    }
    const bySubject = new Map(directoryUsers.map((user) => [user.subject, user]));
    const data = rows.map((row): TeamMember => {
      const role = required(row, "role");
      const status = required(row, "status");
      if (!isRole(role) || !isStatus(status)) {
        throw outcomeError("database_contract_error");
      }
      const cognito = bySubject.get(required(row, "user_id"));
      return {
        membershipId: required(row, "membership_id"),
        email: required(row, "email_snapshot"),
        displayName: row.display_name ?? "",
        role,
        status,
        createdAt: required(row, "created_at"),
        updatedAt: required(row, "updated_at"),
        cognitoStatus: cognito?.status ?? null,
        cognitoEnabled: cognito?.enabled ?? null,
        cognitoCreatedAt: cognito?.createdAt ?? null,
        cognitoUpdatedAt: cognito?.updatedAt ?? null,
        pendingInvitation: cognito?.status === "FORCE_CHANGE_PASSWORD",
        disabled: status !== "active" || cognito?.enabled === false,
      };
    });
    return { data, cognitoStatusAvailable };
  }

  async invite(
    subject: string,
    email: string,
    targetRole: ManagedOrganizationRole,
    requestId: string,
    resumeExistingUser: boolean,
  ): Promise<InviteTeamMemberResponse["data"]> {
    if (targetRole !== "admin" && targetRole !== "staff") {
      throw outcomeError("target_role_forbidden");
    }
    await this.preflightInvitation(
      subject,
      email,
      targetRole,
      resumeExistingUser,
    );

    let user: CognitoDirectoryUser | null;
    try {
      user = await this.directory.findByEmail(email);
    } catch (error) {
      throw error instanceof CognitoDirectoryError
        ? directoryError(error)
        : directoryError(new CognitoDirectoryError("unavailable"));
    }

    if (user && !resumeExistingUser) {
      throw directoryError(new CognitoDirectoryError("existing_user"));
    }
    if (!user && resumeExistingUser) {
      throw new AccountServiceError(
        "recovery_user_not_found",
        "The Cognito account required for recovery was not found.",
        409,
      );
    }

    let cognitoCreated = false;
    if (!user) {
      try {
        user = await this.directory.create(email);
        cognitoCreated = true;
      } catch (error) {
        throw error instanceof CognitoDirectoryError
          ? directoryError(error)
          : directoryError(new CognitoDirectoryError("unavailable"));
      }
    }
    if (!user.emailVerified || !user.enabled || user.email !== email) {
      if (cognitoCreated) {
        throw new AccountServiceError(
          "cognito_created_database_failed",
          "Cognito created the staff account, but database setup could not continue. Do not create another user; inspect the Cognito identity and use the documented recovery procedure.",
          502,
        );
      }
      throw new AccountServiceError(
        "existing_cognito_user_ineligible",
        "The existing Cognito account is not eligible for membership recovery.",
        409,
      );
    }

    try {
      return await this.createMembership(
        subject,
        user,
        targetRole,
        requestId,
        resumeExistingUser,
      );
    } catch (error) {
      if (cognitoCreated) {
        throw new AccountServiceError(
          "cognito_created_database_failed",
          "Cognito created the staff account, but database setup failed. Do not create another user; correct the database issue and retry with recovery enabled.",
          502,
        );
      }
      throw error;
    }
  }

  private async membershipMutation(
    sql: string,
    values: Readonly<Record<string, string>>,
  ): Promise<UpdateTeamMemberResponse["data"]> {
    const transactionId = await this.database.beginTransaction();
    try {
      const rows = await this.database.execute({
        sql,
        parameters: parameters(values),
        transactionId,
      });
      if (rows.length !== 1) throw outcomeError("database_contract_error");
      const outcome = required(rows[0], "outcome");
      if (outcome !== "updated" && outcome !== "already_complete") {
        throw outcomeError(outcome);
      }
      const role = required(rows[0], "membership_role");
      const status = required(rows[0], "membership_status");
      if (!isRole(role) || !isStatus(status)) {
        throw outcomeError("database_contract_error");
      }
      const result = {
        membershipId: required(rows[0], "membership_id"),
        role,
        status,
      } satisfies UpdateTeamMemberResponse["data"];
      await this.database.commitTransaction(transactionId);
      return result;
    } catch (error) {
      await this.rollback(transactionId);
      throw error;
    }
  }

  changeRole(
    subject: string,
    membershipId: string,
    targetRole: ManagedOrganizationRole,
    requestId: string,
  ) {
    if (targetRole !== "admin" && targetRole !== "staff") {
      return Promise.reject(outcomeError("target_role_forbidden"));
    }
    return this.membershipMutation(UPDATE_STAFF_ROLE_SQL, {
      subject,
      membershipId,
      targetRole,
      requestId,
    });
  }

  changeStatus(
    subject: string,
    membershipId: string,
    requestedAction: MembershipAction,
    requestId: string,
  ) {
    return this.membershipMutation(UPDATE_STAFF_STATUS_SQL, {
      subject,
      membershipId,
      requestedAction,
      requestId,
    });
  }

  async updateProfile(
    subject: string,
    displayName: string,
    requestId: string,
  ): Promise<UpdateProfileResponse["data"]> {
    const transactionId = await this.database.beginTransaction();
    try {
      const rows = await this.database.execute({
        sql: UPDATE_PROFILE_SQL,
        parameters: parameters({ subject, displayName, requestId }),
        transactionId,
      });
      if (rows.length !== 1 || required(rows[0], "outcome") !== "updated") {
        throw outcomeError(rows[0]?.outcome ?? "database_contract_error");
      }
      const result = {
        displayName: required(rows[0], "display_name"),
        email: required(rows[0], "email_snapshot"),
      } satisfies UpdateProfileResponse["data"];
      await this.database.commitTransaction(transactionId);
      return result;
    } catch (error) {
      await this.rollback(transactionId);
      throw error;
    }
  }
}
