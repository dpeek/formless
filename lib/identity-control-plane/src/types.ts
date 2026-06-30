/**
 * Versioned public identity control-plane contract declarations.
 *
 * Version 1 covers runtime-neutral schema identity constants, identity entity
 * names, and first-pass runtime role keys. Runtime execution and private auth
 * state remain outside this package contract.
 */
export const IDENTITY_CONTROL_PLANE_PUBLIC_CONTRACT_VERSION = 1;

export const IDENTITY_CONTROL_PLANE_SCHEMA_KEY = "identity-control-plane";
export const IDENTITY_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY = "auth";
export const IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY = "instance:identity";
export const IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX = "/api/formless/identity";
export const IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_PATH = "/access-summary";
export const IDENTITY_COLLABORATOR_INVITATIONS_API_PATH = "/collaborator-invitations";

export type IdentityControlPlaneSchemaKey = typeof IDENTITY_CONTROL_PLANE_SCHEMA_KEY;
export type IdentityControlPlaneBoundarySchemaKey =
  typeof IDENTITY_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY;
export type IdentityControlPlaneStorageIdentity = typeof IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY;
export type IdentityControlPlaneApiRoutePrefix = typeof IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX;
export type IdentityAccessManagementSummaryApiPath =
  typeof IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_PATH;
export type IdentityCollaboratorInvitationsApiPath =
  typeof IDENTITY_COLLABORATOR_INVITATIONS_API_PATH;

export const identityControlPlaneEntityNames = [
  "principal",
  "principal-email",
  "group",
  "organization",
  "membership",
  "role",
  "role-assignment",
  "app-registration",
  "invitation",
] as const;

export type IdentityControlPlaneEntityName = (typeof identityControlPlaneEntityNames)[number];

export const identityControlPlaneRoleKeys = [
  "instance.owner",
  "instance.admin",
  "app.admin",
  "app.editor",
  "app.viewer",
  "app.user",
] as const;

export type IdentityControlPlaneRoleKey = (typeof identityControlPlaneRoleKeys)[number];

export type IdentityPrincipalKind = "human" | "service";
export type IdentityPrincipalStatus = "active" | "disabled" | "invited";
export type IdentityPrincipalEmailVerificationStatus = "unverified" | "verified";
export type IdentityContainerStatus = "active" | "disabled";
export type IdentityMembershipTargetKind = "group" | "organization";
export type IdentityMembershipStatus = "active" | "disabled" | "invited";
export type IdentityRoleStatus = "active" | "disabled";
export type IdentityRoleAssignmentTargetKind = "group" | "organization" | "principal";
export type IdentityRoleAssignmentScopeKind = "app-install" | "instance" | "organization";
export type IdentityRoleAssignmentStatus = "active" | "disabled";
export type IdentityAppRegistrationTargetKind = "organization" | "principal";
export type IdentityAppRegistrationStatus = "active" | "disabled" | "pending";
export type IdentityInvitationTargetSurface = "app-install" | "instance" | "organization";
export type IdentityInvitationStatus = "accepted" | "expired" | "pending" | "revoked";

export type IdentityPrincipalValues = {
  displayName: string;
  kind: IdentityPrincipalKind;
  status: IdentityPrincipalStatus;
};

export type IdentityPrincipalEmailValues = {
  principal: string;
  displayEmail: string;
  normalizedEmail: string;
  verificationStatus: IdentityPrincipalEmailVerificationStatus;
  primary: boolean;
  recovery: boolean;
  verifiedAt?: string;
};

export type IdentityGroupValues = {
  displayName: string;
  status: IdentityContainerStatus;
};

export type IdentityOrganizationValues = {
  displayName: string;
  status: IdentityContainerStatus;
};

export type IdentityMembershipValues = {
  principal: string;
  targetKind: IdentityMembershipTargetKind;
  targetGroup?: string;
  targetOrganization?: string;
  status: IdentityMembershipStatus;
};

export type IdentityRoleValues = {
  key: IdentityControlPlaneRoleKey;
  displayLabel: string;
  status: IdentityRoleStatus;
};

export type IdentityRoleAssignmentValues = {
  role: string;
  targetKind: IdentityRoleAssignmentTargetKind;
  targetPrincipal?: string;
  targetGroup?: string;
  targetOrganization?: string;
  scopeKind: IdentityRoleAssignmentScopeKind;
  appInstallId?: string;
  scopeOrganization?: string;
  status: IdentityRoleAssignmentStatus;
};

export type IdentityAppRegistrationValues = {
  appInstallId: string;
  targetKind: IdentityAppRegistrationTargetKind;
  targetPrincipal?: string;
  targetOrganization?: string;
  status: IdentityAppRegistrationStatus;
  selectedOrganization?: string;
};

export type IdentityInvitationValues = {
  targetEmail: string;
  targetSurface: IdentityInvitationTargetSurface;
  targetAppInstallId?: string;
  targetOrganization?: string;
  invitedPrincipal?: string;
  inviterPrincipal?: string;
  status: IdentityInvitationStatus;
  expiresAt: string;
  acceptedAt?: string;
};

export type IdentityControlPlaneRecordValuesByEntity = {
  group: IdentityGroupValues;
  invitation: IdentityInvitationValues;
  membership: IdentityMembershipValues;
  organization: IdentityOrganizationValues;
  principal: IdentityPrincipalValues;
  "principal-email": IdentityPrincipalEmailValues;
  role: IdentityRoleValues;
  "role-assignment": IdentityRoleAssignmentValues;
  "app-registration": IdentityAppRegistrationValues;
};

export const identityControlPlaneImmutableFields = {
  principal: ["kind"],
  "principal-email": ["principal", "normalizedEmail"],
  group: ["displayName"],
  organization: ["displayName"],
  membership: ["principal", "targetKind", "targetGroup", "targetOrganization"],
  role: ["key"],
  "role-assignment": [
    "role",
    "targetKind",
    "targetPrincipal",
    "targetGroup",
    "targetOrganization",
    "scopeKind",
    "appInstallId",
    "scopeOrganization",
  ],
  "app-registration": ["appInstallId", "targetKind", "targetPrincipal", "targetOrganization"],
  invitation: ["targetEmail", "targetSurface", "targetAppInstallId", "targetOrganization"],
} as const satisfies Record<IdentityControlPlaneEntityName, readonly string[]>;

export type IdentityAccessPrimaryEmailSummary = {
  displayEmail: string;
  normalizedEmail: string;
  principalEmailId: string;
  verificationStatus: IdentityPrincipalEmailVerificationStatus;
  verifiedAt?: string;
};

export type IdentityAccessPersonSummary = {
  createdAt: string;
  displayName: string;
  kind: IdentityPrincipalKind;
  primaryEmail?: IdentityAccessPrimaryEmailSummary;
  principalId: string;
  status: IdentityPrincipalStatus;
  updatedAt: string;
};

export type IdentityAccessRoleSummary = {
  appInstallId?: string;
  createdAt: string;
  displayLabel: string;
  roleAssignmentId: string;
  roleId: string;
  roleKey: IdentityControlPlaneRoleKey;
  scopeKind: IdentityRoleAssignmentScopeKind;
  scopeOrganizationId?: string;
  status: IdentityRoleAssignmentStatus;
  targetGroupId?: string;
  targetKind: IdentityRoleAssignmentTargetKind;
  targetOrganizationId?: string;
  targetPrincipalId?: string;
  updatedAt: string;
};

export type IdentityAccessAppRegistrationSummary = {
  appInstallId: string;
  appRegistrationId: string;
  createdAt: string;
  selectedOrganizationId?: string;
  status: IdentityAppRegistrationStatus;
  targetKind: IdentityAppRegistrationTargetKind;
  targetOrganizationId?: string;
  targetPrincipalId?: string;
  updatedAt: string;
};

export type IdentityAccessMembershipSummary = {
  createdAt: string;
  membershipId: string;
  principalId: string;
  status: IdentityMembershipStatus;
  targetGroupId?: string;
  targetKind: IdentityMembershipTargetKind;
  targetOrganizationId?: string;
  updatedAt: string;
};

export type IdentityAccessOrganizationSummary = {
  createdAt: string;
  displayName: string;
  organizationId: string;
  status: IdentityContainerStatus;
  updatedAt: string;
};

export type IdentityAccessGroupSummary = {
  createdAt: string;
  displayName: string;
  groupId: string;
  status: IdentityContainerStatus;
  updatedAt: string;
};

export type IdentityAccessInvitationSummary = {
  acceptedAt?: string;
  createdAt: string;
  expiresAt: string;
  invitedPrincipalId?: string;
  invitationId: string;
  inviterPrincipalId?: string;
  status: IdentityInvitationStatus;
  targetAppInstallId?: string;
  targetEmail: string;
  targetOrganizationId?: string;
  targetSurface: IdentityInvitationTargetSurface;
  updatedAt: string;
};

export type IdentityAccessInvitationGrantAuthoritySummary = {
  instanceAdmin: boolean;
  instanceOwner: boolean;
};

export type IdentityAccessInvitationRoleGrantOption = {
  displayLabel: string;
  roleKey: IdentityControlPlaneRoleKey;
  scopeKind: IdentityRoleAssignmentScopeKind;
};

export type IdentityAccessInvitationMembershipGrantOption = {
  displayLabel: string;
  targetGroupId?: string;
  targetKind: IdentityMembershipTargetKind;
  targetOrganizationId?: string;
};

export type IdentityAccessInvitationGrantOptions = {
  authority: IdentityAccessInvitationGrantAuthoritySummary;
  memberships: IdentityAccessInvitationMembershipGrantOption[];
  roles: IdentityAccessInvitationRoleGrantOption[];
};

export type IdentityAccessManagementSummary = {
  appRegistrations: IdentityAccessAppRegistrationSummary[];
  groups: IdentityAccessGroupSummary[];
  invitationGrantOptions: IdentityAccessInvitationGrantOptions;
  invitations: IdentityAccessInvitationSummary[];
  memberships: IdentityAccessMembershipSummary[];
  organizations: IdentityAccessOrganizationSummary[];
  people: IdentityAccessPersonSummary[];
  roles: IdentityAccessRoleSummary[];
};
