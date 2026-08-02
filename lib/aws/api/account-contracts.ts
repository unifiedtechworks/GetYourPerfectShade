export type OrganizationRole = "owner" | "admin" | "staff";

export type AccountApiResponse = Readonly<{
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
}>;

export type AccountApiErrorBody = Readonly<{
  error: Readonly<{
    code: string;
    message: string;
    requestId: string;
  }>;
}>;

export function isOrganizationRole(value: unknown): value is OrganizationRole {
  return value === "owner" || value === "admin" || value === "staff";
}
