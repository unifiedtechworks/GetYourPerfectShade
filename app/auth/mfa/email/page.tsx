import Link from "next/link";
import { cookies } from "next/headers";
import { AUTH_COOKIES, decodeChallenge } from "@/lib/auth/cognito/cookies";
import { verifyEmailMfaCode } from "./actions";
import styles from "../../../auth.module.css";

export const dynamic = "force-dynamic";

export default async function EmailMfaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const challenge = decodeChallenge(
    (await cookies()).get(AUTH_COOKIES.challenge)?.value,
  );
  const { error } = await searchParams;
  const challengeValid = challenge?.kind === "email-mfa";

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Link className={styles.brand} href="/">Perfect Shade</Link>
        <h1>Enter your email verification code</h1>
        <p>Cognito sent a six-digit verification code to your registered staff email.</p>
        {!challengeValid && (
          <p className={styles.message} role="alert">
            The email verification session is missing or expired. Restart sign in to request a
            new code.
          </p>
        )}
        {challengeValid && error && (
          <p className={styles.message} role="alert">
            {error === "configuration"
              ? "Authentication has not been configured for this environment."
              : "The code was incorrect or expired. Check the latest email, or restart sign in to request a new code."}
          </p>
        )}
        {challengeValid && (
          <form className={styles.form} action={verifyEmailMfaCode}>
            <label>
              Six-digit code
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
              />
            </label>
            <button type="submit">Verify and continue</button>
          </form>
        )}
        <div className={styles.links}><Link href="/sign-in">Restart sign in</Link></div>
      </section>
    </main>
  );
}
