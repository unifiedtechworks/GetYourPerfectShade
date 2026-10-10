import Link from "next/link";
import { cookies } from "next/headers";
import { AUTH_COOKIES, decodeChallenge } from "@/lib/auth/cognito/cookies";
import { chooseMfaMethod } from "./actions";
import styles from "../../../auth.module.css";

export const dynamic = "force-dynamic";

export default async function SelectMfaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const challenge = decodeChallenge(
    (await cookies()).get(AUTH_COOKIES.challenge)?.value,
  );
  const { error } = await searchParams;
  const methods = challenge?.kind === "mfa-selection" ? challenge.mfaMethods ?? [] : [];

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Link className={styles.brand} href="/">Perfect Shade</Link>
        <h1>Choose a verification method</h1>
        <p>Complete the required second verification step before accessing your staff account.</p>
        {methods.length === 0 && (
          <p className={styles.message} role="alert">
            The verification choice is missing or expired. Return to sign in and start again.
          </p>
        )}
        {methods.length > 0 && error && (
          <p className={styles.message} role="alert">
            {error === "configuration"
              ? "Authentication has not been configured for this environment."
              : "That verification method could not be started. Restart sign in and try again."}
          </p>
        )}
        {methods.length > 0 && (
          <div className={styles.methodChoices}>
            {methods.includes("email") && (
              <form action={chooseMfaMethod}>
                <input type="hidden" name="method" value="email" />
                <button type="submit">Email verification code</button>
              </form>
            )}
            {methods.includes("software-token") && (
              <form action={chooseMfaMethod}>
                <input type="hidden" name="method" value="software-token" />
                <button type="submit">Authenticator application</button>
              </form>
            )}
          </div>
        )}
        <div className={styles.links}><Link href="/sign-in">Restart sign in</Link></div>
      </section>
    </main>
  );
}
