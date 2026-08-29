"use client";

import { useActionState } from "react";
import {
  startMfaSetup,
  verifyMfaSetup,
  type MfaSetupStartState,
  type MfaSetupVerifyState,
} from "./actions";
import styles from "../../../auth.module.css";

const initialStart: MfaSetupStartState = { status: "idle" };
const initialVerify: MfaSetupVerifyState = { status: "idle" };

export function MfaSetupForm({ startAllowed }: { startAllowed: boolean }) {
  const [startState, startAction, starting] = useActionState(startMfaSetup, initialStart);
  const [verifyState, verifyAction, verifying] = useActionState(verifyMfaSetup, initialVerify);

  if (!startAllowed && startState.status !== "ready") {
    return (
      <p className={styles.message} role="alert">
        The setup page was refreshed or the challenge expired. Return to sign in and start again.
      </p>
    );
  }

  if (startState.status === "error") {
    const message = startState.error === "configuration"
      ? "Authentication has not been configured for this environment."
      : startState.error === "setup"
        ? "Authenticator setup could not start. Return to sign in and try again."
        : "The setup challenge expired. Return to sign in and start again.";
    return <p className={styles.message} role="alert">{message}</p>;
  }

  if (startState.status !== "ready") {
    return (
      <form className={styles.form} action={startAction}>
        <button type="submit" disabled={starting}>
          {starting ? "Starting setup…" : "Start authenticator setup"}
        </button>
      </form>
    );
  }

  return (
    <div>
      <p>In your authenticator app, add a setup key for this Perfect Shade staff account.</p>
      <p className={styles.setupSecret}>
        <strong>Setup key</strong>
        <code aria-label="Authenticator setup key">{startState.secret}</code>
      </p>
      <p>Do not save this key in notes, screenshots, tickets, or password fields.</p>
      {verifyState.status === "error" && (
        <p className={styles.message} role="alert">
          {verifyState.error === "configuration"
            ? "Authentication has not been configured for this environment."
            : verifyState.error === "challenge"
              ? "The setup challenge expired. Return to sign in and start again."
              : "The six-digit code was not accepted. Check the authenticator time and try again."}
        </p>
      )}
      <form className={styles.form} action={verifyAction}>
        <label>
          Six-digit code
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
          />
        </label>
        <button type="submit" disabled={verifying}>
          {verifying ? "Verifying…" : "Verify and continue"}
        </button>
      </form>
    </div>
  );
}
