#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { loadRecoveryAccessConfig, RECOVERY_ACCOUNT, RECOVERY_REGION } from "../lib/recovery-access-config";
import { cliDirectoryReader, verifyRecoveryDirectory } from "../lib/recovery-directory-verification";
import { PerfectShadeRecoveryAccessStack } from "../lib/perfect-shade-recovery-access-stack";

async function main() {
  const app = new App();
  const config = loadRecoveryAccessConfig(app);
  if (config.assignments) {
    await verifyRecoveryDirectory(config, cliDirectoryReader(app.node.tryGetContext("recoveryProvisionerProfile") ?? ""));
  }
  new PerfectShadeRecoveryAccessStack(app, "PerfectShadeRecoveryAccess", {
    config, env: { account: RECOVERY_ACCOUNT, region: RECOVERY_REGION },
    description: "Opt-in Perfect Shade Identity Center access only; no backend changes",
  });
  app.synth();
}
main().catch(() => { console.error("Recovery access synthesis denied. Review configuration and read-only identity verification; no private details printed."); process.exitCode = 1; });
