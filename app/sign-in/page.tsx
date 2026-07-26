import Link from "next/link";
import { signIn } from "./actions";
import styles from "../auth.module.css";

type Props = { searchParams: Promise<{ error?: string; next?: string }> };

export default async function SignInPage({ searchParams }: Props) {
  const { error, next } = await searchParams;
  const message = error === "configuration"
    ? "Authentication has not been configured for this environment."
    : error
      ? "The email or password was not accepted."
      : null;

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Link className={styles.brand} href="/">Perfect Shade</Link>
        <h1>Staff sign in</h1>
        <p>Access estimates and company workspaces.</p>
        {message && <p className={styles.message} role="alert">{message}</p>}
        <form className={styles.form} action={signIn}>
          <input type="hidden" name="next" value={next ?? "/app"} />
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          <button type="submit">Sign in</button>
        </form>
        <div className={styles.links}>
          <Link href="/">Return to website</Link>
          <Link href="/forgot-password">Forgot password?</Link>
        </div>
      </section>
    </main>
  );
}
