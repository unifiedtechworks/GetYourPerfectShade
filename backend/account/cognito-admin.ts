import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  type AttributeType,
  type UserType,
} from "@aws-sdk/client-cognito-identity-provider";

type CognitoClient = Readonly<{
  send(command: unknown): Promise<unknown>;
}>;

export type CognitoDirectoryUser = Readonly<{
  subject: string;
  email: string;
  emailVerified: boolean;
  status: string | null;
  enabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}>;

export interface StaffIdentityDirectory {
  findByEmail(email: string): Promise<CognitoDirectoryUser | null>;
  create(email: string): Promise<CognitoDirectoryUser>;
  list(): Promise<readonly CognitoDirectoryUser[]>;
}

export class CognitoDirectoryError extends Error {
  constructor(readonly code: "configuration" | "existing_user" | "unavailable") {
    super("The staff identity directory could not complete the request.");
    this.name = "CognitoDirectoryError";
  }
}

function attribute(attributes: readonly AttributeType[] | undefined, name: string) {
  return attributes?.find((candidate) => candidate.Name === name)?.Value?.trim() ?? "";
}

function timestamp(value: Date | undefined): string | null {
  return value instanceof Date && !Number.isNaN(value.valueOf())
    ? value.toISOString()
    : null;
}

function parsedUser(user: UserType | undefined): CognitoDirectoryUser | null {
  if (!user) return null;
  const subject = attribute(user.Attributes, "sub");
  const email = attribute(user.Attributes, "email").toLowerCase();
  if (!subject || !email) return null;
  return {
    subject,
    email,
    emailVerified: attribute(user.Attributes, "email_verified") === "true",
    status: user.UserStatus ?? null,
    enabled: user.Enabled !== false,
    createdAt: timestamp(user.UserCreateDate),
    updatedAt: timestamp(user.UserLastModifiedDate),
  };
}

function parsedAdminUser(value: Readonly<{
  UserAttributes?: readonly AttributeType[];
  UserStatus?: UserType["UserStatus"];
  Enabled?: boolean;
  UserCreateDate?: Date;
  UserLastModifiedDate?: Date;
}>): CognitoDirectoryUser | null {
  return parsedUser({
    Attributes: value.UserAttributes as AttributeType[] | undefined,
    UserStatus: value.UserStatus,
    Enabled: value.Enabled,
    UserCreateDate: value.UserCreateDate,
    UserLastModifiedDate: value.UserLastModifiedDate,
  });
}

function isNamedError(error: unknown, name: string): boolean {
  return typeof error === "object" && error !== null &&
    "name" in error && (error as { name?: unknown }).name === name;
}

export class CognitoStaffIdentityDirectory implements StaffIdentityDirectory {
  private readonly client: CognitoClient;

  constructor(
    private readonly userPoolId = process.env.COGNITO_USER_POOL_ID?.trim() ?? "",
    client: CognitoClient = new CognitoIdentityProviderClient({}),
  ) {
    this.client = client;
  }

  private requireConfiguration() {
    if (!this.userPoolId) throw new CognitoDirectoryError("configuration");
  }

  async findByEmail(email: string): Promise<CognitoDirectoryUser | null> {
    this.requireConfiguration();
    try {
      const response = await this.client.send(new AdminGetUserCommand({
        UserPoolId: this.userPoolId,
        Username: email,
      })) as Parameters<typeof parsedAdminUser>[0];
      const user = parsedAdminUser(response);
      if (!user) throw new CognitoDirectoryError("unavailable");
      return user;
    } catch (error) {
      if (isNamedError(error, "UserNotFoundException")) return null;
      if (error instanceof CognitoDirectoryError) throw error;
      throw new CognitoDirectoryError("unavailable");
    }
  }

  async create(email: string): Promise<CognitoDirectoryUser> {
    this.requireConfiguration();
    try {
      const response = await this.client.send(new AdminCreateUserCommand({
        UserPoolId: this.userPoolId,
        Username: email,
        DesiredDeliveryMediums: ["EMAIL"],
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "email_verified", Value: "true" },
        ],
      })) as { User?: UserType };
      const user = parsedUser(response.User);
      if (user) return user;

      const resolved = await this.findByEmail(email);
      if (resolved) return resolved;
      throw new CognitoDirectoryError("unavailable");
    } catch (error) {
      if (isNamedError(error, "UsernameExistsException")) {
        throw new CognitoDirectoryError("existing_user");
      }
      if (error instanceof CognitoDirectoryError) throw error;
      throw new CognitoDirectoryError("unavailable");
    }
  }

  async list(): Promise<readonly CognitoDirectoryUser[]> {
    this.requireConfiguration();
    const users: CognitoDirectoryUser[] = [];
    let paginationToken: string | undefined;
    try {
      for (let page = 0; page < 20; page += 1) {
        const response = await this.client.send(new ListUsersCommand({
          UserPoolId: this.userPoolId,
          Limit: 60,
          ...(paginationToken ? { PaginationToken: paginationToken } : {}),
        })) as { Users?: UserType[]; PaginationToken?: string };
        for (const user of response.Users ?? []) {
          const parsed = parsedUser(user);
          if (parsed) users.push(parsed);
        }
        paginationToken = response.PaginationToken;
        if (!paginationToken) return users;
      }
      throw new CognitoDirectoryError("unavailable");
    } catch (error) {
      if (error instanceof CognitoDirectoryError) throw error;
      throw new CognitoDirectoryError("unavailable");
    }
  }
}
