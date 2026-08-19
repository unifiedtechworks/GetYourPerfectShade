import Link from "next/link";
import { requestPasswordReset } from "./actions";
import styles from "../auth.module.css";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function ForgotPasswordPage({ searchParams }: Props) {
  const { error } = await searchParams;
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Link className={styles.brand} href="/">Perfect Shade</Link>
        <h1>Reset your password</h1>
        <p>Enter your staff email. If it matches an account, we’ll send a recovery code.</p>
        {error && <p className={styles.message} role="alert">
          Authentication has not been configured for this environment.
        </p>}
        <form className={styles.form} action={requestPasswordReset}>
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <button type="submit">Send recovery code</button>
        </form>
        <div className={styles.links}><Link href="/sign-in">Back to sign in</Link></div>
      </section>
    </main>
  );
}
