import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { prepareReplyToMaintenance } from "../lib/profile-email-reply-to-maintenance";

// No AWS dependencies or subprocesses. Reads an operator-supplied deployed template on stdin.
if (process.argv.length !== 3) throw new Error("Usage: pipe deployed get-template JSON to ts-node bin/prepare-profile-email-reply-to.ts <NEW-output-directory>");
const plan = prepareReplyToMaintenance(JSON.parse(readFileSync(0, "utf8").replace(/^\uFEFF/, "")));
const output = path.resolve(process.argv[2]!);
mkdirSync(output, { mode: 0o700 }); // Never overwrite earlier reviewed artifacts.
for (const [name, value] of [["original.json", plan.original], ["reply-to-correction.json", plan.updated]] as const) {
  writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}
console.log(JSON.stringify({ logicalId: plan.logicalId, propertyPath: plan.propertyPath,
  originalSha256: plan.originalSha256, updatedSha256: plan.updatedSha256,
  offlineOnly: true, deploymentAuthorized: false }));
