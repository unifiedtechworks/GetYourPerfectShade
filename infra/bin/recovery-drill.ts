#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { loadRecoveryAccessConfig, RECOVERY_ACCOUNT, RECOVERY_REGION } from "../lib/recovery-access-config";
import { cliDirectoryReader, verifyRecoveryDirectory } from "../lib/recovery-directory-verification";
import { PerfectShadeRecoveryDrillStack } from "../lib/perfect-shade-recovery-drill-stack";

async function main() {
  const app = new App();
  if (app.node.tryGetContext("confirmRecoveryDrillSynthesis") !== "true") {
    throw new Error("Explicit recovery-drill synthesis guard required; not billable-resource approval.");
  }
  const config = loadRecoveryAccessConfig(app);
  const prepareEmergencyPath = app.node.tryGetContext("prepareDrillEmergencyPath") ?? "false";
  if (prepareEmergencyPath !== "true" && prepareEmergencyPath !== "false") throw new Error("Explicit drill emergency boolean required.");
  const consoleCliLogin = app.node.tryGetContext("enableDrillEmergencyConsoleCliLogin") ?? "false";
  if (consoleCliLogin !== "true" && consoleCliLogin !== "false") throw new Error("Explicit drill CLI boolean required.");
  if (config.assignments) await verifyRecoveryDirectory(config, cliDirectoryReader(app.node.tryGetContext("recoveryProvisionerProfile") ?? ""));
  new PerfectShadeRecoveryDrillStack(app, "PerfectShadeRecoveryDrill", {
    env: { account: RECOVERY_ACCOUNT, region: RECOVERY_REGION },
    config: { ...config, runId: app.node.tryGetContext("recoveryDrillRunId") ?? "",
      sesFromEmail: app.node.tryGetContext("recoveryDrillSesFromEmail") ?? "",
      sesReplyToEmail: app.node.tryGetContext("recoveryDrillReplyToEmail") ?? "", prepareEmergencyPath: prepareEmergencyPath === "true",
      emergencyConsoleCliLogin: consoleCliLogin === "true", emergencyCliAuthenticationReviewReference: app.node.tryGetContext("drillEmergencyCliAuthenticationReviewReference") },
    description: "Opt-in disposable Cognito recovery drill; separate billable-resource authorization required",
  });
  app.synth();
}
main().catch(() => { console.error("Recovery drill synthesis denied; no private details printed."); process.exitCode = 1; });
