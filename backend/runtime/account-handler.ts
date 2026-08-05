import { createAccountHandler } from "../account";
import { CognitoStaffIdentityDirectory } from "../account/cognito-admin";
import { RdsDataDatabase } from "../shared/rds-data";

export const handler = createAccountHandler(
  new RdsDataDatabase(),
  new CognitoStaffIdentityDirectory(),
);
