import Link from "next/link";
import { requireAccount } from "@/lib/auth/account";
import { signOut } from "./actions";
import styles from "./app.module.css";

export const dynamic = "force-dynamic";

export default async function ApplicationLayout({ children }: { children: React.ReactNode }) {
  const { membership } = await requireAccount();
  const organization = membership?.organizations as unknown as { name?: string } | null;
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div>
          <Link className={styles.brand} href="/app">Perfect Shade</Link>
          <p className={styles.org}>{organization?.name ?? "Account setup required"}</p>
        </div>
        <nav className={styles.nav} aria-label="Application navigation">
          <Link href="/app">Dashboard</Link>
          <Link href="/app/account">Account settings</Link>
        </nav>
        <form action={signOut}><button className={styles.signOut} type="submit">Sign out</button></form>
      </aside>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
