import Link from "next/link";
import { requestPasswordReset } from "./actions";
import styles from "../auth.module.css";

type Props = { searchParams: Promise<{ sent?: string }> };

export default async function ForgotPasswordPage({ searchParams }: Props) {
  const { sent } = await searchParams;
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Link className={styles.brand} href="/">Perfect Shade</Link>
        <h1>Reset your password</h1>
        <p>Enter your staff email. If it matches an account, we’ll send a reset link.</p>
        {sent && <p className={styles.message}>Check your email for the reset link.</p>}
        <form className={styles.form} action={requestPasswordReset}>
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <button type="submit">Send reset link</button>
        </form>
        <div className={styles.links}><Link href="/sign-in">Back to sign in</Link></div>
      </section>
    </main>
  );
}
