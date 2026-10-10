import Link from "next/link";
import { requestPasswordReset } from "./actions";
import styles from "../auth.module.css";
import { getPasswordRecoveryPolicy } from "@/lib/auth/cognito/config";

type Props = { searchParams: Promise<{ error?: string; recovery?: string }> };

export default async function ForgotPasswordPage({ searchParams }: Props) {
  const { error, recovery } = await searchParams;
  const policy = getPasswordRecoveryPolicy();
  const administratorOnly = policy === "administrator-only" || recovery === "administrator";
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Link className={styles.brand} href="/">Perfect Shade</Link>
        <h1>{administratorOnly ? "Staff account recovery" : "Reset your password"}</h1>
        {administratorOnly ? (
          <p>
            Production password recovery is administrator-assisted because email is an MFA
            factor. Contact an active Perfect Shade owner or approved operational administrator
            through the support channel. They must verify your identity before recovery.
          </p>
        ) : (
          <p>Enter your staff email. If it matches an account, we’ll send a recovery code.</p>
        )}
        {(error || policy === "configuration-error") && !administratorOnly && (
          <p className={styles.message} role="alert">
            Authentication has not been configured for this environment.
          </p>
        )}
        {policy === "self-service-email" && (
          <form className={styles.form} action={requestPasswordReset}>
            <label>Email<input name="email" type="email" autoComplete="email" required /></label>
            <button type="submit">Send recovery code</button>
          </form>
        )}
        <div className={styles.links}><Link href="/sign-in">Back to sign in</Link></div>
      </section>
    </main>
  );
}
