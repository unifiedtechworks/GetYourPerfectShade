import { requireAccount } from "@/lib/auth/account";
import styles from "../app.module.css";

export default async function AccountPage() {
  const { user, membership } = await requireAccount();
  return (
    <>
      <h1>Account settings</h1>
      <section className={styles.panel}>
        <h2>Profile</h2>
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>Role:</strong> {membership?.role ?? "No active membership"}</p>
        <p className={styles.muted}>Profile and organization editing will be enabled in a later pass.</p>
      </section>
    </>
  );
}
