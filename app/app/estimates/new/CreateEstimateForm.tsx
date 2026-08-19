"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createEstimate } from "../actions";
import type { CreateEstimateState } from "../types";
import { DEFAULT_DEPOSIT_PERCENT } from "@/lib/estimates/editor";
import styles from "../estimates.module.css";

const INITIAL_STATE: CreateEstimateState = { message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className={styles.primaryButton} disabled={pending} type="submit">
      {pending ? "Creating draft..." : "Create draft estimate"}
    </button>
  );
}

export function CreateEstimateForm({
  idempotencyKey,
}: Readonly<{ idempotencyKey: string }>) {
  const [state, action] = useActionState(createEstimate, INITIAL_STATE);
  const values = state.fields ?? {};
  return (
    <form action={action} className={styles.form}>
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      {state.message && (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      )}

      <fieldset className={styles.fieldset}>
        <legend>Project information</legend>
        <label>
          Customer Name *
          <input
            defaultValue={values.customerName}
            name="customerName"
            required
          />
        </label>
        <label>
          Project Name *
          <input
            defaultValue={values.projectName}
            name="projectName"
            required
          />
        </label>
        <label>
          Project Location
          <input defaultValue={values.projectLocation} name="projectLocation" />
        </label>
        <label>
          Architect *
          <input defaultValue={values.preparedFor} name="preparedFor" required />
        </label>
        <label>
          Owner
          <textarea
            defaultValue={values.contactInformation}
            name="contactInformation"
            rows={3}
          />
        </label>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Draft estimate</legend>
        <label>
          Document Type
          <select
            defaultValue={values.documentType || "Bid Proposal"}
            name="documentType"
          >
            <option>Bid Proposal</option>
            <option>Estimate</option>
          </select>
        </label>
        <label>
          Bid Number
          <input defaultValue={values.estimateNumber} name="estimateNumber" />
        </label>
        <label>
          First Pricing Description
          <input
            defaultValue={values.pricingDescription}
            name="pricingDescription"
          />
        </label>
        <label>
          First Pricing Amount *
          <input
            defaultValue={values.pricingAmount}
            inputMode="decimal"
            name="pricingAmount"
            placeholder="$0.00"
            required
          />
        </label>
        <label>
          Deposit %
          <input
            defaultValue={values.depositPercent ?? DEFAULT_DEPOSIT_PERCENT}
            inputMode="decimal"
            name="depositPercent"
          />
        </label>
      </fieldset>

      <p className={styles.help}>
        This creates the customer, project, draft estimate, and first pricing
        row. You will continue in the full draft editor after creation.
      </p>
      <SubmitButton />
    </form>
  );
}
