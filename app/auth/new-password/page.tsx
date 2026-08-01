import Link from "next/link";
import { setInitialPassword } from "./actions";
import styles from "../../auth.module.css";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function NewPasswordPage({ searchParams }: Props) {
  const { error } = await searchParams;
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Link className={styles.brand} href="/">Perfect Shade</Link>
        <h1>Set your permanent password</h1>
        <p>Your administrator created this staff account. Choose a password of at least 12 characters.</p>
        {error && <p className={styles.message} role="alert">
          {error === "length"
            ? "The password must be at least 12 characters."
            : error === "configuration"
              ? "Authentication has not been configured for this environment."
              : "The temporary sign-in session expired. Start again from sign in."}
        </p>}
        <form className={styles.form} action={setInitialPassword}>
          <label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label>
          <button type="submit">Set password and continue</button>
        </form>
        <div className={styles.links}><Link href="/sign-in">Back to sign in</Link></div>
      </section>
    </main>
  );
}
