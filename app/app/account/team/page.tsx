import { redirect } from "next/navigation";
import { createAccountApiClient } from "@/lib/aws/api/account-client";
import type { TeamMember } from "@/lib/aws/api/account-contracts";
import { requireOrganizationAccount } from "@/lib/auth/account";
import {
  changeTeamMemberRole,
  changeTeamMemberStatus,
  inviteTeamMember,
} from "../actions";
import styles from "./team.module.css";

const successMessages: Readonly<Record<string, string>> = {
  invited: "Staff invitation created. Cognito will deliver the temporary-password email.",
  role: "Membership role updated.",
  disable: "Membership disabled.",
  enable: "Membership re-enabled.",
  remove: "Membership removed without deleting the Cognito user.",
};

const errorMessages: Readonly<Record<string, string>> = {
  invalid_email: "Enter a valid staff email address.",
  target_role_forbidden: "That role cannot be assigned by your account.",
  membership_management_forbidden: "You do not have permission to manage that membership.",
  self_action_forbidden: "You cannot perform that membership action on yourself.",
  owner_protected: "Owner membership cannot be changed through this workflow.",
  last_owner_protected: "The organization must retain its active owner.",
  duplicate_membership: "That staff membership already exists.",
  duplicate_email: "That staff email already has a membership.",
  existing_cognito_user: "A Cognito user already exists. Verify it has no membership before using recovery mode.",
  existing_cognito_user_ineligible: "The existing Cognito user is not eligible for safe recovery.",
  recovery_user_not_found: "Recovery mode could not find the existing Cognito user.",
  cognito_created_database_failed: "Cognito created the user, but database setup failed. Do not invite again normally; correct the database issue and retry once with recovery mode.",
  cognito_configuration_unavailable: "Cognito staff provisioning is not configured.",
  cognito_unavailable: "Cognito staff provisioning is temporarily unavailable.",
  membership_state_conflict: "That membership state does not allow the requested action.",
  target_not_found: "The requested membership was not found in this organization.",
  account_api_not_configured: "Team administration is not configured in this environment.",
  account_api_error: "The account service could not complete the request.",
};

function date(value: string | null) {
  if (!value) return "Not available";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "Not available" : parsed.toLocaleDateString();
}

function accountState(member: TeamMember, statusAvailable: boolean) {
  if (member.pendingInvitation) return "Invitation pending";
  if (member.disabled) return "Disabled";
  if (!statusAvailable) return "Cognito status unavailable";
  return member.cognitoStatus?.replaceAll("_", " ").toLowerCase() ?? "Unknown";
}

export default async function TeamManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string; error?: string }>;
}) {
  const account = await requireOrganizationAccount();
  if (account.membership.role === "staff") redirect("/app/account");

  let members: readonly TeamMember[] = [];
  let cognitoStatusAvailable = false;
  let loadFailed = false;
  try {
    const result = await createAccountApiClient({
      accessToken: account.accessToken,
    }).listTeam();
    members = result.data;
    cognitoStatusAvailable = result.cognitoStatusAvailable;
  } catch {
    loadFailed = true;
  }
  const { updated, error } = await searchParams;
  const canManage = (member: TeamMember) =>
    member.role !== "owner" &&
    (account.membership.role === "owner" || member.role === "staff");

  return (
    <>
      <div className={styles.heading}>
        <div>
          <h1>Team management</h1>
          <p>Internal staff access for {account.membership.organizationName}.</p>
        </div>
        <span className={styles.actorRole}>Your role: {account.membership.role}</span>
      </div>

      {updated && (
        <p className={styles.success} role="status">
          {successMessages[updated] ?? "Team membership updated."}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {errorMessages[error] ?? "The team operation failed safely."}
        </p>
      )}

      <section className={styles.panel}>
        <h2>Invite staff</h2>
        <p>
          Cognito generates and emails the temporary password. It is never returned to this
          application.
        </p>
        <form action={inviteTeamMember} className={styles.inviteForm}>
          <label htmlFor="email">Staff email</label>
          <input id="email" name="email" type="email" autoComplete="off" required />
          <label htmlFor="role">Role</label>
          <select id="role" name="role" required>
            {account.membership.role === "owner" && <option value="admin">Admin</option>}
            <option value="staff">Staff</option>
          </select>
          <label className={styles.recovery}>
            <input name="resumeExistingUser" type="checkbox" />
            Recovery only: link a verified existing Cognito user after a documented partial
            provisioning failure
          </label>
          <button type="submit">Send staff invitation</button>
        </form>
      </section>

      <section className={styles.panel}>
        <h2>Organization team</h2>
        {!cognitoStatusAvailable && !loadFailed && (
          <p className={styles.notice} role="status">
            Memberships loaded, but Cognito account status is temporarily unavailable.
          </p>
        )}
        {loadFailed ? (
          <p className={styles.error} role="alert">
            Team membership data could not be loaded. No changes were made.
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Role</th>
                  <th>Membership</th>
                  <th>Account state</th>
                  <th>Created</th>
                  <th>Last state</th>
                  <th>Controls</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.membershipId}>
                    <td>
                      <strong>{member.displayName || member.email}</strong>
                      {member.displayName && <span>{member.email}</span>}
                    </td>
                    <td>{member.role}</td>
                    <td>{member.status}</td>
                    <td>{accountState(member, cognitoStatusAvailable)}</td>
                    <td>{date(member.createdAt)}</td>
                    <td>{date(member.cognitoUpdatedAt ?? member.updatedAt)}</td>
                    <td>
                      {canManage(member) ? (
                        <div className={styles.controls}>
                          {account.membership.role === "owner" && member.status !== "removed" && (
                            <form action={changeTeamMemberRole}>
                              <input type="hidden" name="membershipId" value={member.membershipId} />
                              <select name="role" defaultValue={member.role} aria-label={`Role for ${member.email}`}>
                                <option value="admin">Admin</option>
                                <option value="staff">Staff</option>
                              </select>
                              <button type="submit">Change role</button>
                            </form>
                          )}
                          {member.status === "active" && (
                            <MembershipAction member={member} action="disable" label="Disable" />
                          )}
                          {member.status === "disabled" && (
                            <MembershipAction member={member} action="enable" label="Re-enable" />
                          )}
                          {member.status !== "removed" && (
                            <MembershipAction member={member} action="remove" label="Remove" />
                          )}
                        </div>
                      ) : (
                        <span className={styles.protected}>Protected</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function MembershipAction({
  member,
  action,
  label,
}: {
  member: TeamMember;
  action: "disable" | "enable" | "remove";
  label: string;
}) {
  return (
    <form action={changeTeamMemberStatus}>
      <input type="hidden" name="membershipId" value={member.membershipId} />
      <input type="hidden" name="action" value={action} />
      <button className={action === "remove" ? styles.danger : undefined} type="submit">
        {label}
      </button>
    </form>
  );
}
