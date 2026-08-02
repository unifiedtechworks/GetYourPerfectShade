import { accountDisplayName, requireAccount } from "@/lib/auth/account";
import styles from "./app.module.css";

export default async function DashboardPage() {
  const { user, membership, accountAvailability } = await requireAccount();
  return (
    <>
      <h1>Dashboard</h1>
      <p className={styles.muted}>Signed in as {accountDisplayName(user)}</p>
      {!membership && (
        <p className={styles.warning}>
          {accountAvailability === "no-membership"
            ? "Your sign-in is valid, but it is not attached to an active company membership. Ask an administrator to finish account setup."
            : "Your Cognito sign-in is valid, but the AWS account API is not available in this environment yet."}
        </p>
      )}
      <section className={styles.panel}>
        <h2>AWS workspace</h2>
        <p>
          Use Estimates to review or create Phase 1 drafts. Account settings shows the active
          Cognito identity and Aurora membership resolved by the account API.
        </p>
      </section>
    </>
  );
}
