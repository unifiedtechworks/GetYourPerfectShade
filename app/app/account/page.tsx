import { accountDisplayName, requireAccount } from "@/lib/auth/account";
import { updateDisplayName } from "./actions";
import styles from "../app.module.css";

const errorMessages: Readonly<Record<string, string>> = {
  invalid_display_name: "Display name must be between 1 and 120 characters.",
  account_api_not_configured: "Account editing is not configured in this environment.",
  account_api_error: "The profile could not be updated. Please try again.",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string; error?: string }>;
}) {
  const { user, membership, accountAvailability } = await requireAccount();
  const { updated, error } = await searchParams;
  const availabilityMessage = accountAvailability === "api-unconfigured"
    ? "Account data is not configured in this environment."
    : accountAvailability === "api-unavailable"
      ? "Account data is temporarily unavailable. Profile changes are disabled."
      : accountAvailability === "no-membership"
        ? "No active organization membership is available for this account."
        : null;
  return (
    <>
      <h1>Account settings</h1>
      {updated === "profile" && (
        <p className={styles.success} role="status">Profile updated.</p>
      )}
      {error && (
        <p className={styles.warning} role="alert">
          {errorMessages[error] ?? "The profile could not be updated safely."}
        </p>
      )}
      {availabilityMessage && (
        <p className={styles.warning} role="alert">{availabilityMessage}</p>
      )}
      <section className={styles.panel}>
        <h2>Profile</h2>
        <p><strong>Identity:</strong> {accountDisplayName(user)}</p>
        <p><strong>Email verified:</strong> {user.emailVerified ? "Yes" : "No"}</p>
        <p><strong>Organization:</strong> {membership?.organizationName ?? "No active organization"}</p>
        <p><strong>Role:</strong> {membership?.role ?? "No active membership"}</p>
        {membership && (
          <form action={updateDisplayName} className={styles.formStack}>
            <label htmlFor="displayName">Display name</label>
            <input
              id="displayName"
              name="displayName"
              defaultValue={membership.profile?.displayName ?? ""}
              maxLength={120}
              required
            />
            <button type="submit">Save display name</button>
          </form>
        )}
        <p className={styles.muted}>
          Organization identity and ownership are intentionally not editable here.
        </p>
      </section>
    </>
  );
}
