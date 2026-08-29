#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { loadDevelopmentConfig } from "../lib/config";
import { PerfectShadeDevelopmentStack } from "../lib/perfect-shade-development-stack";
import { PerfectShadeProductionStack } from "../lib/perfect-shade-production-stack";
import { loadProductionConfig } from "../lib/production-config";

const app = new cdk.App();
const environment = app.node.tryGetContext("perfectShadeEnvironment") ?? "development";
if (environment === "development") {
  const config = loadDevelopmentConfig(app);
  new PerfectShadeDevelopmentStack(app, "PerfectShadeDevelopment", {
    config,
    env: { region: config.region },
    description: "Perfect Shade AWS-native development backend foundation",
  });
} else if (environment === "production") {
  const config = loadProductionConfig(app);
  new PerfectShadeProductionStack(app, "PerfectShadeProduction", {
    config,
    env: { region: config.region },
    description: "Perfect Shade isolated production backend foundation",
  });
} else {
  throw new Error("perfectShadeEnvironment must be development or production.");
}

app.synth();
