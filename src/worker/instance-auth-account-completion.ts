import {
  identityControlPlaneRoleKeys,
  type IdentityControlPlaneRoleKey,
  type IdentityInvitationTargetSurface,
} from "@dpeek/formless-identity-control-plane";
import {
  INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
} from "@dpeek/formless-instance-control-plane";
import type { AppInstallRegistrationPolicy } from "@dpeek/formless-installed-apps";
import type { StoredRecord } from "@dpeek/formless-storage";

import {
  parseAccountCompletionGate,
  parseAccountCompletionGateResolutionResult,
  parseAccountCompletionGateTarget,
  type AccountCompletionGate,
  type AccountCompletionGateOperationReference,
  type AccountCompletionGatePolicyReference,
  type AccountCompletionGateResolutionResult,
  type AccountCompletionGateTarget,
  type AccountCompletionRoleScopeKind,
} from "../shared/instance-auth.ts";
import { readInternalAccountCompletionIdentityState } from "./identity-owner-internal.ts";
import type {
  AccountCompletionIdentityState,
  IdentityOwnerInternalEnv,
} from "./identity-owner-internal.ts";
import { readPasskeyCredentialsForPrincipal } from "./instance-auth-state.ts";

export const INSTANCE_AUTH_ACCOUNT_COMPLETION_RESOLVE_PATH =
  "/_internal/instance-auth/account-completion/resolve";

const internalReadControlPlaneRecordsPath = "/_internal/read-records";

type AccountCompletionResolverActorKind = "anonymous" | "authenticated" | "owner";

export type AccountCompletionProfileCompletionRequirement = {
  operation?: AccountCompletionGateOperationReference;
  profileRecordId?: string;
  satisfied: boolean;
};

export type AccountCompletionRoleReviewRequirement = {
  operation?: AccountCompletionGateOperationReference;
  roleKey: IdentityControlPlaneRoleKey;
  scopeKind?: AccountCompletionRoleScopeKind;
};

export type AccountCompletionGateResolverInput = {
  actorKind?: AccountCompletionResolverActorKind;
  principalId?: string;
  profileCompletion?: AccountCompletionProfileCompletionRequirement;
  requiredRole?: AccountCompletionRoleReviewRequirement;
  target: AccountCompletionGateTarget;
};

export async function handleInstanceAuthAccountCompletionDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: IdentityOwnerInternalEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (url.pathname !== INSTANCE_AUTH_ACCOUNT_COMPLETION_RESOLVE_PATH) {
    return undefined;
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
  }

  try {
    const result = await resolveAccountCompletionGate({
      env,
      input: parseAccountCompletionGateResolverInput(await readJson(request)),
      storage,
    });

    return jsonResponse(parseAccountCompletionGateResolutionResult(result));
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

export async function resolveAccountCompletionGate(input: {
  env: IdentityOwnerInternalEnv;
  input: AccountCompletionGateResolverInput;
  storage: DurableObjectStorage;
}): Promise<AccountCompletionGateResolutionResult> {
  const actorKind = input.input.actorKind ?? "authenticated";
  const target = parseAccountCompletionGateTarget(input.input.target);

  if (actorKind === "anonymous") {
    return completeResult(target);
  }

  const principalId = parseNonEmptyString(
    "Account completion principal id",
    input.input.principalId,
  );
  const state =
    (await readInternalAccountCompletionIdentityState(input.env, { principalId, target })) ??
    emptyAccountCompletionIdentityState();
  const appRegistrationPolicy = await readTargetAppInstallRegistrationPolicy(input.env, target);

  if (!state.principal || state.principal.values.status !== "active") {
    return blockedResult(target, roleReviewGate(input.input.requiredRole, target, state));
  }

  if (!verifiedPrimaryEmail(state.primaryEmail)) {
    return blockedResult(target, emailVerificationGate(state.primaryEmail));
  }

  if (readPasskeyCredentialsForPrincipal(input.storage, principalId).length === 0) {
    return blockedResult(target, { credentialMethod: "passkey", kind: "credential" });
  }

  const pendingInvitation = state.invitations.find((record) => record.values.status === "pending");

  if (pendingInvitation) {
    return blockedResult(target, invitationGate(pendingInvitation));
  }

  if (
    target.appInstallId !== undefined &&
    appRegistrationPolicy === "closed" &&
    !hasActiveAppRegistration(state)
  ) {
    return blockedResult(target, {
      appInstallId: target.appInstallId,
      kind: "app-registration",
      registrationPolicy: appRegistrationPolicy,
      ...(target.selectedOrganization === undefined
        ? {}
        : { selectedOrganization: target.selectedOrganization }),
    });
  }

  if (input.input.profileCompletion && !input.input.profileCompletion.satisfied) {
    return blockedResult(target, {
      appInstallId: target.appInstallId,
      kind: "profile-completion",
      ...(input.input.profileCompletion.operation === undefined
        ? {}
        : { operation: input.input.profileCompletion.operation }),
      ...(input.input.profileCompletion.profileRecordId === undefined
        ? {}
        : { profileRecordId: input.input.profileCompletion.profileRecordId }),
      ...(target.selectedOrganization === undefined
        ? {}
        : { selectedOrganization: target.selectedOrganization }),
    });
  }

  const missingPolicies = missingAcceptedPolicies(state);

  if (missingPolicies.length > 0) {
    return blockedResult(target, {
      kind: "terms-acceptance",
      policies: missingPolicies.map(accountCompletionPolicyReference),
    });
  }

  if (input.input.requiredRole && !hasRequiredRole(state, input.input.requiredRole, target)) {
    return blockedResult(target, roleReviewGate(input.input.requiredRole, target, state));
  }

  return completeResult(target);
}

function completeResult(
  target: AccountCompletionGateTarget,
): AccountCompletionGateResolutionResult {
  return {
    continueTo: target.returnTo,
    status: "complete",
    target,
  };
}

function blockedResult(
  target: AccountCompletionGateTarget,
  gate: AccountCompletionGate,
): AccountCompletionGateResolutionResult {
  return {
    gate,
    status: "blocked",
    target,
  };
}

function emailVerificationGate(primaryEmail: StoredRecord | null): AccountCompletionGate {
  return {
    kind: "email-verification",
    ...(primaryEmail === null
      ? {}
      : {
          displayEmail: optionalStringValue(primaryEmail, "displayEmail"),
          principalEmailId: primaryEmail.id,
        }),
  };
}

function invitationGate(invitation: StoredRecord): AccountCompletionGate {
  return {
    invitationId: invitation.id,
    kind: "invitation",
    targetEmail: stringValue(invitation, "targetEmail"),
    targetSurface: stringValue(invitation, "targetSurface") as IdentityInvitationTargetSurface,
  };
}

function roleReviewGate(
  requirement: AccountCompletionRoleReviewRequirement | undefined,
  target: AccountCompletionGateTarget,
  state: AccountCompletionIdentityState,
): AccountCompletionGate {
  const roleKey = requirement?.roleKey;
  const role = roleKey === undefined ? undefined : activeRoleByKey(state, roleKey);

  return {
    kind: "role-review",
    ...(requirement?.operation === undefined ? {} : { operation: requirement.operation }),
    ...(role === undefined ? {} : { roleId: role.id }),
    ...(roleKey === undefined ? {} : { roleKey }),
    scopeKind: requirement?.scopeKind ?? defaultRoleScopeKind(target),
  };
}

function verifiedPrimaryEmail(primaryEmail: StoredRecord | null): boolean {
  return primaryEmail !== null && primaryEmail.values.verificationStatus === "verified";
}

function hasActiveAppRegistration(state: AccountCompletionIdentityState): boolean {
  return state.appRegistrations.some((record) => record.values.status === "active");
}

async function readTargetAppInstallRegistrationPolicy(
  env: IdentityOwnerInternalEnv,
  target: AccountCompletionGateTarget,
): Promise<AppInstallRegistrationPolicy | undefined> {
  if (target.appInstallId === undefined) {
    return undefined;
  }

  if (!env.FORMLESS_AUTHORITY) {
    throw new Error("Account completion app install policy lookup requires authority access.");
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(
      `http://internal${INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX}${internalReadControlPlaneRecordsPath}`,
      {
        headers: { Accept: "application/json" },
        method: "GET",
      },
    ),
  );
  const body = (await response.json()) as { error?: string; records?: StoredRecord[] };

  if (!response.ok || !Array.isArray(body.records)) {
    throw new Error(body.error ?? "Control-plane app install policy lookup failed.");
  }

  const appInstall = body.records.find(
    (record) =>
      record.entity === "app-install" &&
      !record.deletedAt &&
      record.values.installId === target.appInstallId &&
      record.values.status === "installed",
  );

  if (!appInstall) {
    throw new Error(`App install "${target.appInstallId}" is not installed.`);
  }

  return appInstallRegistrationPolicyFromValue(
    appInstall.values.registrationPolicy,
    target.appInstallId,
  );
}

function appInstallRegistrationPolicyFromValue(
  value: unknown,
  appInstallId: string,
): AppInstallRegistrationPolicy {
  if (value === "closed") {
    return value;
  }

  throw new Error(`App install "${appInstallId}" has unsupported registration policy.`);
}

function missingAcceptedPolicies(state: AccountCompletionIdentityState): StoredRecord[] {
  const acceptedPolicyIds = new Set(
    state.policyAcceptances
      .filter((record) => record.values.status === "accepted")
      .map((record) => stringValue(record, "accountPolicy")),
  );

  return state.accountPolicies.filter(
    (policy) => policy.values.status === "active" && !acceptedPolicyIds.has(policy.id),
  );
}

function accountCompletionPolicyReference(
  policy: StoredRecord,
): AccountCompletionGatePolicyReference {
  return {
    accountPolicyId: policy.id,
    displayName: stringValue(policy, "displayName"),
    policyKey: stringValue(policy, "policyKey"),
    version: stringValue(policy, "version"),
    ...optionalPolicyString(policy, "policyContentRef"),
    ...optionalPolicyString(policy, "policyDocumentUrl"),
  };
}

function hasRequiredRole(
  state: AccountCompletionIdentityState,
  requirement: AccountCompletionRoleReviewRequirement,
  target: AccountCompletionGateTarget,
): boolean {
  const role = activeRoleByKey(state, requirement.roleKey);

  if (!role) {
    return false;
  }

  const scopeKind = requirement.scopeKind ?? defaultRoleScopeKind(target);

  return state.roleAssignments.some(
    (assignment) =>
      assignment.values.status === "active" &&
      assignment.values.role === role.id &&
      roleAssignmentMatchesRequiredScope(assignment, scopeKind, target),
  );
}

function activeRoleByKey(
  state: AccountCompletionIdentityState,
  roleKey: IdentityControlPlaneRoleKey,
): StoredRecord | undefined {
  return state.roles.find(
    (record) => record.values.status === "active" && record.values.key === roleKey,
  );
}

function roleAssignmentMatchesRequiredScope(
  assignment: StoredRecord,
  scopeKind: AccountCompletionRoleScopeKind,
  target: AccountCompletionGateTarget,
): boolean {
  if (scopeKind === "instance") {
    return assignment.values.scopeKind === "instance";
  }

  if (scopeKind === "app-install") {
    return (
      assignment.values.scopeKind === "app-install" &&
      target.appInstallId !== undefined &&
      assignment.values.appInstallId === target.appInstallId
    );
  }

  return (
    assignment.values.scopeKind === "organization" &&
    target.selectedOrganization !== undefined &&
    assignment.values.scopeOrganization === target.selectedOrganization
  );
}

function defaultRoleScopeKind(target: AccountCompletionGateTarget): AccountCompletionRoleScopeKind {
  if (target.selectedOrganization !== undefined) {
    return "organization";
  }

  if (target.targetProfile === "instance") {
    return "instance";
  }

  return "app-install";
}

function emptyAccountCompletionIdentityState(): AccountCompletionIdentityState {
  return {
    accountPolicies: [],
    appRegistrations: [],
    invitations: [],
    memberships: [],
    policyAcceptances: [],
    primaryEmail: null,
    principal: null,
    roleAssignments: [],
    roles: [],
  };
}

function parseAccountCompletionGateResolverInput(
  value: unknown,
): AccountCompletionGateResolverInput {
  const object = parseRecord("Account completion gate resolver input", value);

  assertAllowedKeys("Account completion gate resolver input", object, [
    "actorKind",
    "principalId",
    "profileCompletion",
    "requiredRole",
    "target",
  ]);

  const actorKind =
    object.actorKind === undefined
      ? undefined
      : parseStringLiteral("Account completion actor kind", object.actorKind, [
          "anonymous",
          "authenticated",
          "owner",
        ]);

  return {
    ...(actorKind === undefined ? {} : { actorKind }),
    ...(object.principalId === undefined
      ? {}
      : {
          principalId: parseNonEmptyString("Account completion principal id", object.principalId),
        }),
    ...parseOptionalProfileCompletionRequirement(object.profileCompletion),
    ...parseOptionalRoleReviewRequirement(object.requiredRole),
    target: parseAccountCompletionGateTarget(object.target),
  };
}

function parseOptionalProfileCompletionRequirement(value: unknown): {
  profileCompletion?: AccountCompletionProfileCompletionRequirement;
} {
  if (value === undefined) {
    return {};
  }

  const object = parseRecord("Account completion profile requirement", value);

  assertAllowedKeys("Account completion profile requirement", object, [
    "operation",
    "profileRecordId",
    "satisfied",
  ]);

  if (typeof object.satisfied !== "boolean") {
    throw new Error("Account completion profile requirement satisfied must be boolean.");
  }

  const gate = parseAccountCompletionGate({
    kind: "profile-completion",
    ...(object.operation === undefined ? {} : { operation: object.operation }),
    ...(object.profileRecordId === undefined ? {} : { profileRecordId: object.profileRecordId }),
  });

  if (gate.kind !== "profile-completion") {
    throw new Error("Account completion profile requirement is invalid.");
  }

  return {
    profileCompletion: {
      ...(gate.operation === undefined ? {} : { operation: gate.operation }),
      ...(gate.profileRecordId === undefined ? {} : { profileRecordId: gate.profileRecordId }),
      satisfied: object.satisfied,
    },
  };
}

function parseOptionalRoleReviewRequirement(value: unknown): {
  requiredRole?: AccountCompletionRoleReviewRequirement;
} {
  if (value === undefined) {
    return {};
  }

  const object = parseRecord("Account completion role requirement", value);

  assertAllowedKeys("Account completion role requirement", object, [
    "operation",
    "roleKey",
    "scopeKind",
  ]);

  const gate = parseAccountCompletionGate({
    kind: "role-review",
    ...(object.operation === undefined ? {} : { operation: object.operation }),
    roleKey: parseStringLiteral(
      "Account completion role requirement roleKey",
      object.roleKey,
      identityControlPlaneRoleKeys,
    ),
    ...(object.scopeKind === undefined ? {} : { scopeKind: object.scopeKind }),
  });

  if (gate.kind !== "role-review" || gate.roleKey === undefined) {
    throw new Error("Account completion role requirement is invalid.");
  }

  return {
    requiredRole: {
      ...(gate.operation === undefined ? {} : { operation: gate.operation }),
      roleKey: gate.roleKey,
      ...(gate.scopeKind === undefined ? {} : { scopeKind: gate.scopeKind }),
    },
  };
}

function optionalPolicyString(
  record: StoredRecord,
  fieldName: "policyContentRef" | "policyDocumentUrl",
) {
  const value = optionalStringValue(record, fieldName);

  return value === undefined ? {} : { [fieldName]: value };
}

function stringValue(record: StoredRecord, fieldName: string): string {
  const value = record.values[fieldName];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Account completion record "${record.id}" field "${fieldName}" must be set.`);
  }

  return value;
}

function optionalStringValue(record: StoredRecord, fieldName: string): string | undefined {
  const value = record.values[fieldName];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Account completion record "${record.id}" field "${fieldName}" is invalid.`);
  }

  return value;
}

function parseRecord(context: string, value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function assertAllowedKeys(
  context: string,
  object: Record<string, unknown>,
  allowedKeys: readonly string[],
) {
  const allowed = new Set(allowedKeys);

  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }
}

function parseStringLiteral<T extends string>(
  context: string,
  value: unknown,
  allowedValues: readonly T[],
): T {
  const parsed = parseNonEmptyString(context, value);

  if (!allowedValues.includes(parsed as T)) {
    throw new Error(`${context} is unsupported.`);
  }

  return parsed as T;
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be JSON.");
  }
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
  const responseHeaders = new Headers(headers);

  responseHeaders.set("Content-Type", "application/json");

  return new Response(JSON.stringify(body), {
    headers: responseHeaders,
    status,
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error.";
}
