#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { prepareOperationsAlertMaintenance } from "../lib/operations-alert-maintenance";

// Local artifact generator only. No AWS subprocesses or SDK calls, even with ambient credentials.
const args = process.argv.slice(2);
if (args.length !== 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args[0]!)) {
  throw new Error("Usage: pipe read-only get-template JSON to ts-node bin/prepare-operations-alert-maintenance.ts <reviewed-recipient> <NEW-output-directory>");
}
const input = readFileSync(0, "utf8").replace(/^\uFEFF/, "");
const plan = prepareOperationsAlertMaintenance(JSON.parse(input), args[0]!);
const output = path.resolve(args[1]!);
mkdirSync(output); // Fail on reuse: never overwrite a previous reviewed maintenance/rollback snapshot.
for (const [name, value] of [
  ["original.json", JSON.parse(input)],
  ["01-detach-missing-subscriptions.json", plan.detach],
  ["02-restore-subscriptions.json", plan.restore],
] as const) {
  const body = name === "original.json"
    ? ((value as Record<string, unknown>).TemplateBody ?? value) : value;
  const encoded = JSON.stringify(typeof body === "string" ? JSON.parse(body) : body, null, 2) + "\n";
  writeFileSync(path.join(output, name), encoded, { flag: "wx" });
  console.log(`${name} SHA256 ${createHash("sha256").update(encoded).digest("hex")}`);
}
console.log(JSON.stringify({ policyId: plan.policyId, subscriptionIds: plan.subscriptionIds,
  warning: "OFFLINE PLAN ONLY. No authorization to execute; both live subscriptions must still be absent." }));
