import Link from "next/link";
import { requireOrganizationAccount } from "@/lib/auth/account";
import { CreateEstimateForm } from "./CreateEstimateForm";
import styles from "../estimates.module.css";

export default async function NewEstimatePage() {
  await requireOrganizationAccount();
  return (
    <>
      <Link className={styles.backLink} href="/app/estimates">
        Back to estimates
      </Link>
      <h1>New estimate</h1>
      <p className={styles.intro}>
        Start a protected draft with the same required project and Architect
        fields as the desktop Bid Generator.
      </p>
      <CreateEstimateForm />
    </>
  );
}
