#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { loadDevelopmentConfig } from "../lib/config";
import { PerfectShadeDevelopmentStack } from "../lib/perfect-shade-development-stack";

const app = new cdk.App();
const config = loadDevelopmentConfig(app);

new PerfectShadeDevelopmentStack(app, "PerfectShadeDevelopment", {
  config,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: config.region,
  },
  description: "Perfect Shade AWS-native development backend foundation",
});

app.synth();
