import { updatePassword } from "./actions";
import styles from "../auth.module.css";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { error } = await searchParams;
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <span className={styles.brand}>Perfect Shade</span>
        <h1>Choose a new password</h1>
        <p>Use at least 12 characters.</p>
        {error && <p className={styles.message} role="alert">
          {error === "length" ? "The password must be at least 12 characters." : "The reset link is invalid or expired."}
        </p>}
        <form className={styles.form} action={updatePassword}>
          <label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label>
          <button type="submit">Update password</button>
        </form>
      </section>
    </main>
  );
}
