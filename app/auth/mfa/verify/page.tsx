import Link from "next/link";
import { cookies } from "next/headers";
import { AUTH_COOKIES, decodeChallenge } from "@/lib/auth/cognito/cookies";
import { verifyMfaCode } from "./actions";
import styles from "../../../auth.module.css";

export const dynamic = "force-dynamic";

export default async function MfaVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const challenge = decodeChallenge(
    (await cookies()).get(AUTH_COOKIES.challenge)?.value,
  );
  const { error } = await searchParams;
  const challengeValid = challenge?.kind === "software-token-mfa";

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Link className={styles.brand} href="/">Perfect Shade</Link>
        <h1>Enter your authenticator code</h1>
        <p>Enter the current six-digit code from your authenticator app.</p>
        {!challengeValid && (
          <p className={styles.message} role="alert">
            The MFA challenge is missing or expired. Return to sign in and start again.
          </p>
        )}
        {challengeValid && error && (
          <p className={styles.message} role="alert">
            {error === "configuration"
              ? "Authentication has not been configured for this environment."
              : "The code was invalid or expired. Check the authenticator time and try again."}
          </p>
        )}
        {challengeValid && (
          <form className={styles.form} action={verifyMfaCode}>
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
