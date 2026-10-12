#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { PerfectShadeEmergencyRecoveryStack } from "../lib/perfect-shade-emergency-recovery-stack";
import { RECOVERY_ACCOUNT, RECOVERY_REGION } from "../lib/recovery-access-config";

try {
  const app = new App();
  const boolean = (key: string) => {
    const value = app.node.tryGetContext(key) ?? "false";
    if (value !== "true" && value !== "false") throw new Error("Explicit boolean required.");
    return value === "true";
  };
  const enabled = boolean("enableEmergencyRecoveryResources");
  const consoleCliLogin = boolean("enableEmergencyConsoleCliLogin");
  const prepareAlerts = boolean("prepareEmergencyAlerts");
  if ((consoleCliLogin || prepareAlerts) && !enabled) throw new Error("Authentication/alerts require separately enabled resources.");
  if (enabled && (app.node.tryGetContext("confirmEmergencyRecoverySynthesis") !== "true" || app.node.tryGetContext("recoveryTargetAccount") !== RECOVERY_ACCOUNT)) {
    throw new Error("Explicit synthesis/account guard required; not deployment approval.");
  }
  new PerfectShadeEmergencyRecoveryStack(app, "PerfectShadeEmergencyRecovery", {
    env: { account: RECOVERY_ACCOUNT, region: RECOVERY_REGION }, enabled, consoleCliLogin, prepareAlerts,
    trailLogGroupName: app.node.tryGetContext("emergencyTrailLogGroupName"), operationsTopicArn: app.node.tryGetContext("emergencyOperationsTopicArn"),
    accountAuthorizationReference: app.node.tryGetContext("emergencyAccountAuthorizationReference"),
    cliAuthenticationReviewReference: app.node.tryGetContext("emergencyCliAuthenticationReviewReference"),
  });
  app.synth();
} catch { console.error("Emergency recovery synthesis denied; no private details printed."); process.exitCode = 1; }
