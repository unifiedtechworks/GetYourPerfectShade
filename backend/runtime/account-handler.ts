import { createAccountHandler } from "../account";
import { RdsDataDatabase } from "../shared/rds-data";

export const handler = createAccountHandler(new RdsDataDatabase());
