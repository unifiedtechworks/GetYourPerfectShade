import { requireAccount } from "@/lib/auth/account";
import styles from "./app.module.css";

export default async function DashboardPage() {
  const { user, membership } = await requireAccount();
  return (
    <>
      <h1>Dashboard</h1>
      <p className={styles.muted}>Signed in as {user.email}</p>
      {!membership && (
        <p className={styles.warning}>
          Your sign-in is valid, but it is not attached to an active company membership.
          Ask an administrator to finish account setup.
        </p>
      )}
      <section className={styles.panel}>
        <h2>Workspace foundation ready</h2>
        <p>Customers, projects, and estimates will be added in a future implementation pass.</p>
      </section>
    </>
  );
}
