import Link from "next/link";
import { cookies } from "next/headers";
import { AUTH_COOKIES, decodeChallenge } from "@/lib/auth/cognito/cookies";
import { MfaSetupForm } from "./MfaSetupForm";
import styles from "../../../auth.module.css";

export const dynamic = "force-dynamic";

export default async function MfaSetupPage() {
  const challenge = decodeChallenge(
    (await cookies()).get(AUTH_COOKIES.challenge)?.value,
  );
  const startAllowed = challenge?.kind === "mfa-setup";

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Link className={styles.brand} href="/">Perfect Shade</Link>
        <h1>Protect your staff account</h1>
        <p>
          Set up the authenticator application you selected for this required verification step.
          Perfect Shade does not store your authenticator setup key.
        </p>
        <MfaSetupForm startAllowed={startAllowed} />
        <div className={styles.links}><Link href="/sign-in">Restart sign in</Link></div>
      </section>
    </main>
  );
}
