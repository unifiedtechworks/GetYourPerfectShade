import Link from "next/link";
import { updatePassword } from "./actions";
import styles from "../auth.module.css";

type Props = { searchParams: Promise<{ error?: string; email?: string; sent?: string }> };

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { error, email, sent } = await searchParams;
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <span className={styles.brand}>Perfect Shade</span>
        <h1>Choose a new password</h1>
        <p>
          Enter the code sent to your verified email. Choose at least 12 characters with an
          uppercase letter, lowercase letter, number, and symbol.
        </p>
        {sent && <p className={styles.message}>If the account exists, Cognito sent a recovery code.</p>}
        {error && <p className={styles.message} role="alert">
          {error === "length"
            ? "The password must be at least 12 characters."
            : error === "complexity"
              ? "Add an uppercase letter, lowercase letter, number, and symbol."
              : error === "mismatch"
                ? "The password confirmation does not match."
            : error === "configuration"
              ? "Authentication has not been configured for this environment."
              : "The recovery code is invalid or expired."}
        </p>}
        <form className={styles.form} action={updatePassword}>
          <label>Email<input name="email" type="email" autoComplete="email" defaultValue={email} required /></label>
          <label>Recovery code<input name="code" inputMode="numeric" autoComplete="one-time-code" required /></label>
          <label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label>
          <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required /></label>
          <button type="submit">Update password</button>
        </form>
        <div className={styles.links}><Link href="/sign-in">Back to sign in</Link></div>
      </section>
    </main>
  );
}
