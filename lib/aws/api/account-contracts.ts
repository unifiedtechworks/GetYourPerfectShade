export type OrganizationRole = "owner" | "admin" | "staff";

export type ManagedOrganizationRole = Exclude<OrganizationRole, "owner">;
export type MembershipStatus = "active" | "disabled" | "removed";

export type AccountProfile = Readonly<{
  displayName: string;
  email: string;
}>;

export type AccountApiResponse = Readonly<{
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
  profile?: AccountProfile;
}>;

export type TeamMember = Readonly<{
  membershipId: string;
  email: string;
  displayName: string;
  role: OrganizationRole;
  status: MembershipStatus;
  createdAt: string;
  updatedAt: string;
  cognitoStatus: string | null;
  cognitoEnabled: boolean | null;
  cognitoCreatedAt: string | null;
  cognitoUpdatedAt: string | null;
  pendingInvitation: boolean;
  disabled: boolean;
}>;

export type TeamListResponse = Readonly<{
  data: readonly TeamMember[];
  cognitoStatusAvailable: boolean;
}>;

export type InviteTeamMemberRequest = Readonly<{
  email: string;
  role: ManagedOrganizationRole;
  resumeExistingUser?: boolean;
}>;

export type InviteTeamMemberResponse = Readonly<{
  data: Readonly<{
    membershipId: string;
    role: ManagedOrganizationRole;
    status: "active";
    recovered: boolean;
    alreadyComplete: boolean;
  }>;
}>;

export type UpdateTeamMemberRoleRequest = Readonly<{
  role: ManagedOrganizationRole;
}>;

export type UpdateTeamMemberResponse = Readonly<{
  data: Readonly<{
    membershipId: string;
    role: OrganizationRole;
    status: MembershipStatus;
  }>;
}>;

export type UpdateProfileRequest = Readonly<{ displayName: string }>;

export type UpdateProfileResponse = Readonly<{
  data: AccountProfile;
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

export function isManagedOrganizationRole(
  value: unknown,
): value is ManagedOrganizationRole {
  return value === "admin" || value === "staff";
}

export function isMembershipStatus(value: unknown): value is MembershipStatus {
  return value === "active" || value === "disabled" || value === "removed";
}
