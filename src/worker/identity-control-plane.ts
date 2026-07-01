import { parseIdentityControlPlaneApiRoute } from "../shared/app-storage-identity.ts";
import {
  IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_PATH,
  IDENTITY_COLLABORATOR_INVITATION_REVOKE_API_PATH,
  IDENTITY_COLLABORATOR_INVITATIONS_API_PATH,
  IDENTITY_CONTROL_PLANE_SCHEMA_KEY,
  IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY,
  identityControlPlaneRecordSourceEntityName,
  identityControlPlaneRoleKeys,
  identityControlPlaneSchemaProvenance,
  identityControlPlaneSchema,
  parseIdentityControlPlaneStorageSnapshot,
  validateIdentityCollaboratorInvitationGrants,
  validateIdentityControlPlaneRecords,
  type IdentityAccessInvitationSummary,
  type IdentityAccessInvitationGrantAuthoritySummary,
  type IdentityAccessInvitationGrantOptions,
  type IdentityAccessInvitationMembershipGrantOption,
  type IdentityAccessInvitationRoleGrantOption,
  type IdentityAccessManagementSummary,
  type IdentityAppRegistrationStatus,
  type IdentityCollaboratorInvitationGrantRecord,
  type IdentityCollaboratorInvitationRevokeErrorResponse,
  type IdentityCollaboratorInvitationRevokeFailureReason,
  type IdentityCollaboratorInvitationRevokeRequest,
  type IdentityCollaboratorInvitationRevokeResponse,
  type IdentityContainerStatus,
  type IdentityAppRegistrationValues,
  type IdentityControlPlaneRoleKey,
  type IdentityGroupValues,
  type IdentityInvitationValues,
  type IdentityInvitationStatus,
  type IdentityInvitationTargetSurface,
  type IdentityMembershipTargetKind,
  type IdentityMembershipValues,
  type IdentityPrincipalEmailValues,
  type IdentityPrincipalKind,
  type IdentityPrincipalStatus,
  type IdentityPrincipalValues,
  type IdentityPrincipalEmailVerificationStatus,
  type IdentityRoleAssignmentStatus,
  type IdentityRoleAssignmentScopeKind,
  type IdentityRoleAssignmentValues,
  type IdentityRoleAssignmentTargetKind,
  type IdentityRoleValues,
  type IdentityOrganizationValues,
} from "@dpeek/formless-identity-control-plane";
import {
  isIdentityReferenceTargetResolution,
  type IdentityReferenceTargetLookup,
  type IdentityReferenceTargetResolution,
} from "./identity-reference-targets.ts";
import { instanceControlPlaneProductionIdentityFromRecords } from "@dpeek/formless-instance-control-plane";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import type { OperationCommandOutput } from "../shared/operation-invocation.ts";
import type { OwnerIdentity, OwnerIdentityInput } from "../shared/protocol.ts";
import type { SchemaOperationActorKind } from "@dpeek/formless-schema";
import {
  authorizeAuthorityOperation,
  authorizeOwnerManagementRead,
  authorizeOperationalManagement,
  type AuthorityAdminGuardEnv,
} from "./authority-admin-guard.ts";
import { normalizeEmailDeliveryAddress } from "../shared/email-runtime.ts";
import type { EmailDeliveryRecord, EmailDeliveryScheduleRequest } from "../shared/email-runtime.ts";
import {
  INTERNAL_IDENTITY_ACTIVE_PRINCIPAL_PATH,
  INTERNAL_IDENTITY_OWNER_PATH,
  INTERNAL_IDENTITY_OWNER_PRINCIPAL_PATH,
  INTERNAL_IDENTITY_PRINCIPAL_AUTHORITY_PATH,
  INTERNAL_IDENTITY_OWNER_RESET_PATH,
  type ActiveIdentityAuthority,
} from "./identity-owner-internal.ts";
import {
  executeAuthorityOperation,
  selectAuthorityOperation,
  type AuthorityOperation,
  type AuthorityWriteNotifier,
} from "./authority-operations.ts";
import type { OwnerSession } from "./owner-session.ts";
import { BadRequestError } from "./errors.ts";
import {
  ActiveSchemaRefreshBlockedError,
  ensureStorageTables,
  getBootstrapRecords,
  initializeStorageFromSource,
  resetStorageToSourceSeedOutcome,
  writeRecordSetForCommandOperationOutcome,
  type RecordConstraintValidator,
  type OperationRecordWritePlan,
  type StorageSource,
  type WriteOutcome,
} from "./storage.ts";
import type { WorkerSchemaAppDefinition } from "./schema-apps.ts";
import { readControlPlaneRecords } from "./deployment-control-plane-client.ts";
import {
  resolveConfiguredDefaultCloudflareSender,
  resolveDefaultEmailSenderReference,
  scheduleEmailDelivery,
  type EmailDeliveryQueueBinding,
} from "./email-runtime.ts";
import { readEmailDeliveryByScheduleRequest } from "./email-runtime-state.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import {
  buildCollaboratorInvitationLink,
  createCollaboratorInvitationToken,
  generateCollaboratorInvitationToken,
  hashCollaboratorInvitationToken,
  revokeCollaboratorInvitationToken,
  type RevokeCollaboratorInvitationTokenResult,
} from "./instance-auth-state.ts";
import { hostAuthSessionTargetFromRequestHeaders } from "./instance-auth-handoff.ts";
import { nowIsoString } from "../shared/clock.ts";

const actorKinds = ["admin", "owner"] as const;
const invitationTargetSurfaces = ["app-install", "instance", "organization"] as const;
const invitationStatuses = [
  "accepted",
  "expired",
  "pending",
  "revoked",
] as const satisfies readonly IdentityInvitationStatus[];
const membershipTargetKinds = ["group", "organization"] as const;
const roleAssignmentScopeKinds = ["app-install", "instance", "organization"] as const;
const appScopedInvitationRoleKeys = [
  "app.admin",
  "app.editor",
  "app.viewer",
  "app.user",
] as const satisfies readonly IdentityControlPlaneRoleKey[];
const builtInRoleCreatedAt = "2026-06-26T00:00:00.000Z";
const collaboratorInvitationDeliveryMessageKind = "identity.collaboratorInvitation";
const collaboratorInvitationDeliveryPurpose = "collaborator-invitation-delivery";
export const INTERNAL_COLLABORATOR_INVITATION_DELIVERY_PATH =
  "/_internal/identity/collaborator-invitation-delivery";
export const INTERNAL_COLLABORATOR_INVITATION_TOKEN_REVOKE_PATH =
  "/_internal/identity/collaborator-invitation-token-revoke";
export const INTERNAL_COLLABORATOR_INVITATION_ACCEPTANCE_STATUS_PATH =
  "/_internal/identity/collaborator-invitation-acceptance-status";
export const INTERNAL_COLLABORATOR_INVITATION_ACCEPTANCE_COMMIT_PATH =
  "/_internal/identity/collaborator-invitation-acceptance-commit";
export const INTERNAL_IDENTITY_APP_REFERENCE_TARGET_PATH =
  "/_internal/identity/app-reference-target";
const identityControlPlaneApp = {
  key: IDENTITY_CONTROL_PLANE_SCHEMA_KEY,
  label: "Identity control plane",
  route: "/identity-control-plane",
  seedChangeWritePrefix: "seed-identity-control-plane",
  sourceSchema: identityControlPlaneSchema,
  seedRecords: builtInRoleRecords(),
} satisfies WorkerSchemaAppDefinition;

function identityControlPlaneSource(): StorageSource {
  return {
    schema: identityControlPlaneSchema,
    records: builtInRoleRecords(),
    changeWritePrefix: "seed-identity-control-plane",
    schemaKey: IDENTITY_CONTROL_PLANE_SCHEMA_KEY,
    schemaProvenance: identityControlPlaneSchemaProvenance,
    storageIdentity: IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY,
  };
}

function ensureIdentityControlPlaneStorage(storage: DurableObjectStorage) {
  ensureStorageTables(storage);
  initializeStorageFromSource(storage, identityControlPlaneSource());
}

type IdentityControlPlaneApiEnv = AuthorityAdminGuardEnv & {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
  FORMLESS_EMAIL_DELIVERY_QUEUE?: EmailDeliveryQueueBinding;
};

export type IdentityOwnerEnv = {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
};

type CollaboratorInvitationDeliveryResult =
  | {
      delivery: EmailDeliveryRecord;
      queued: boolean;
      replayed: boolean;
      status: "scheduled";
    }
  | {
      reason:
        | "email-delivery-scheduling-failed"
        | "existing-token-without-delivery"
        | "missing-auth-email-configuration"
        | "missing-email-delivery-queue";
      status: "skipped";
    };

type CreateCollaboratorInvitationResponse = {
  delivery: CollaboratorInvitationDeliveryResult;
  invitation: StoredRecord;
  output: OperationCommandOutput;
  records: StoredRecord[];
  status: "committed" | "replayed";
};
type CreateCollaboratorInvitationWriteResponse = Omit<
  CreateCollaboratorInvitationResponse,
  "delivery"
>;

type RevokeCollaboratorInvitationResult =
  | {
      body: IdentityCollaboratorInvitationRevokeResponse;
      ok: true;
    }
  | {
      body: IdentityCollaboratorInvitationRevokeErrorResponse;
      ok: false;
      status: number;
    };

type CollaboratorInvitationTokenRevocationInput = {
  invitationId: string;
  now: string;
};

type CollaboratorInvitationTokenRevocationResult =
  | { ok: true }
  | {
      ok: false;
      reason: Extract<RevokeCollaboratorInvitationTokenResult, { ok: false }>["reason"];
    };

type CollaboratorInvitationTargetFacts = {
  targetAppInstallId?: string;
  targetOrganization?: string;
  targetSurface: IdentityInvitationTargetSurface;
};

type CollaboratorInvitationPrincipalInput = {
  displayName: string;
  id?: string;
};

type CollaboratorInvitationPrincipalEmailInput = {
  id?: string;
  primary: boolean;
  recovery: boolean;
};

type CollaboratorInvitationMembershipInput = {
  id?: string;
  targetGroup?: string;
  targetKind: IdentityMembershipTargetKind;
  targetOrganization?: string;
};

type CollaboratorInvitationRoleAssignmentInput = {
  appInstallId?: string;
  id?: string;
  role: string;
  scopeKind: IdentityRoleAssignmentScopeKind;
  scopeOrganization?: string;
};

type CollaboratorInvitationAppRegistrationInput = {
  appInstallId: string;
  id?: string;
  selectedOrganization?: string;
};

type CreateCollaboratorInvitationInput = CollaboratorInvitationTargetFacts & {
  appRegistrations: CollaboratorInvitationAppRegistrationInput[];
  expiresAt: string;
  idempotencyKey: string;
  invitedPrincipal?: CollaboratorInvitationPrincipalInput;
  invitationId?: string;
  memberships: CollaboratorInvitationMembershipInput[];
  now?: string;
  principalEmail?: CollaboratorInvitationPrincipalEmailInput;
  roleAssignments: CollaboratorInvitationRoleAssignmentInput[];
  targetEmail: string;
};

type CollaboratorInvitationDeliveryInput = CollaboratorInvitationTargetFacts & {
  createdAt: string;
  expiresAt: string;
  invitationId: string;
  targetEmail: string;
};

export type IdentityCollaboratorInvitationAcceptanceStatus = CollaboratorInvitationTargetFacts & {
  expiresAt: string;
  invitedPrincipalId?: string;
  invitationId: string;
  invitedPrincipalDisplayName?: string;
  status: IdentityInvitationStatus;
  targetEmail: string;
};

export type IdentityCollaboratorInvitationAcceptanceCommitInput =
  CollaboratorInvitationTargetFacts & {
    invitationId: string;
    now: string;
    principalId: string;
    targetEmail: string;
  };

export type IdentityCollaboratorInvitationAcceptanceCommitFailureReason =
  | "accepted-invitation"
  | "expired-invitation"
  | "identity-validation-failed"
  | "missing-invitation"
  | "revoked-invitation"
  | "wrong-email"
  | "wrong-principal"
  | "wrong-target";

export type IdentityCollaboratorInvitationAcceptanceCommitResult =
  | {
      invitation: IdentityCollaboratorInvitationAcceptanceStatus;
      ok: true;
      output: OperationCommandOutput;
      principalId: string;
      records: StoredRecord[];
      status: "committed" | "replayed";
    }
  | {
      error: string;
      ok: false;
      reason: IdentityCollaboratorInvitationAcceptanceCommitFailureReason;
    };

export type EnsureIdentityOwnerInput = {
  now: string;
  owner: OwnerIdentityInput;
  ownerId?: string;
};

export async function handleIdentityControlPlaneApiRequest(
  request: Request,
  env: IdentityControlPlaneApiEnv,
): Promise<Response | undefined> {
  const route = parseIdentityControlPlaneApiRoute(new URL(request.url).pathname);

  if (!route) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleIdentityControlPlaneDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: IdentityControlPlaneApiEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const identityOwnerResponse = await handleIdentityOwnerInternalRequest(request, storage);

  if (identityOwnerResponse) {
    return identityOwnerResponse;
  }

  const route = parseIdentityControlPlaneApiRoute(url.pathname);

  if (!route) {
    return undefined;
  }

  try {
    const resolveOwnerSession = (session: OwnerSession) =>
      Promise.resolve(readActiveIdentityOwnerForPrincipal(storage, session.principalId));
    const resolveManagementAuthority = (session: OwnerSession) =>
      Promise.resolve(readActiveIdentityAuthorityForPrincipal(storage, session.principalId));

    if (route.path === IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_PATH) {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET" });
      }

      const authorization = await authorizeOperationalManagement(request, env, {
        hostSessionTarget: hostAuthSessionTargetFromRequestHeaders(request.headers),
        resolveManagementAuthority,
      });

      if (!authorization.authorized) {
        return jsonResponse(
          { error: authorization.error },
          authorization.status,
          authorization.headers,
        );
      }

      return jsonResponse(
        readIdentityAccessManagementSummary(
          storage,
          identityAccessGrantAuthorityFromAuthorization(storage, authorization),
        ),
      );
    }

    if (route.path === IDENTITY_COLLABORATOR_INVITATIONS_API_PATH) {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
      }

      const authorization = await authorizeOperationalManagement(request, env, {
        hostSessionTarget: hostAuthSessionTargetFromRequestHeaders(request.headers),
        resolveManagementAuthority,
      });

      if (!authorization.authorized) {
        return jsonResponse(
          { error: authorization.error },
          authorization.status,
          authorization.headers,
        );
      }

      ensureIdentityControlPlaneStorage(storage);

      const inviterPrincipalId =
        (authorization.via === "owner-session" || authorization.via === "host-session") &&
        typeof authorization.session?.principalId === "string"
          ? authorization.session.principalId
          : undefined;
      const created = createCollaboratorInvitation(storage, await readJson(request), {
        grantAuthorityPrincipalId: inviterPrincipalId,
        inviterPrincipalId,
      });

      return jsonResponse({
        ...created,
        delivery: await requestCollaboratorInvitationDelivery({
          env,
          invitation: created.invitation,
          requestUrl: request.url,
        }),
      });
    }

    if (route.path === IDENTITY_COLLABORATOR_INVITATION_REVOKE_API_PATH) {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
      }

      const authorization = await authorizeOperationalManagement(request, env, {
        hostSessionTarget: hostAuthSessionTargetFromRequestHeaders(request.headers),
        resolveManagementAuthority,
      });

      if (!authorization.authorized) {
        return jsonResponse(
          { error: authorization.error },
          authorization.status,
          authorization.headers,
        );
      }

      ensureIdentityControlPlaneStorage(storage);

      const revoked = await revokeCollaboratorInvitationFromAccessManagement(
        storage,
        await readJson(request),
        {
          env,
          requestUrl: request.url,
        },
      );

      return jsonResponse(revoked.body, revoked.ok ? 200 : revoked.status);
    }

    const operation = selectAuthorityOperation({
      method: request.method,
      path: route.path,
      searchParams: url.searchParams,
    });

    if (!operation) {
      return jsonResponse({ error: "Not found." }, 404);
    }

    const actorKind = identityControlPlaneActorKindFromRequest(request, url);
    const authorization =
      operation.metadata.mode === "read"
        ? await authorizeOwnerManagementRead(request, env, { resolveOwnerSession })
        : await authorizeAuthorityOperation(request, operation, env, { resolveOwnerSession });

    if (!authorization.authorized) {
      return jsonResponse(
        { error: authorization.error },
        authorization.status,
        authorization.headers,
      );
    }

    if (operation.metadata.mode === "write") {
      assertIdentityControlPlaneWriteActor(actorKind, operation);
    }

    const body = operation.metadata.mode === "write" ? await readJson(request) : undefined;

    if (operation.kind === "restoreSnapshot") {
      parseIdentityControlPlaneStorageSnapshot("Identity control-plane storage snapshot", body);
    }

    ensureIdentityControlPlaneStorage(storage);

    const result = await executeAuthorityOperation({
      actorKind,
      app: identityControlPlaneApp,
      body,
      identity: route.identity,
      operation,
      source: identityControlPlaneSource(),
      storage,
      validateConstraints:
        operation.metadata.mode === "write"
          ? validateIdentityControlPlaneRecordConstraint(storage)
          : undefined,
      writes: noopWriteNotifier,
    });

    return jsonResponse(result.body, result.status, result.headers);
  } catch (error) {
    if (error instanceof ActiveSchemaRefreshBlockedError) {
      return jsonResponse({ error: error.message, blocker: error.blocker }, 409);
    }

    if (error instanceof BadRequestError) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

export async function handleCollaboratorInvitationDeliveryDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: IdentityControlPlaneApiEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (url.pathname !== INTERNAL_COLLABORATOR_INVITATION_DELIVERY_PATH) {
    return undefined;
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
  }

  try {
    return jsonResponse(
      await scheduleCollaboratorInvitationDelivery({
        env,
        input: parseCollaboratorInvitationDeliveryRequest(await readJson(request)),
        requestUrl: request.url,
        storage,
      }),
    );
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

export async function handleCollaboratorInvitationTokenRevocationDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (url.pathname !== INTERNAL_COLLABORATOR_INVITATION_TOKEN_REVOKE_PATH) {
    return undefined;
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
  }

  try {
    const input = parseCollaboratorInvitationTokenRevocationRequest(await readJson(request));
    const revoked = revokeCollaboratorInvitationToken(storage, input.invitationId, input.now);

    return jsonResponse(collaboratorInvitationTokenRevocationResult(revoked));
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

export async function readIdentityOwner(env: IdentityOwnerEnv): Promise<OwnerIdentity | null> {
  const response = await fetchIdentityOwnerInternal(env, INTERNAL_IDENTITY_OWNER_PATH, {
    method: "GET",
  });
  const body = (await response.json()) as { owner?: OwnerIdentity | null; error?: string };

  if (!response.ok) {
    throw new Error(body.error ?? "Identity owner lookup failed.");
  }

  return body.owner ?? null;
}

export async function ensureIdentityOwner(
  env: IdentityOwnerEnv,
  input: EnsureIdentityOwnerInput,
): Promise<OwnerIdentity> {
  const response = await fetchIdentityOwnerInternal(env, INTERNAL_IDENTITY_OWNER_PATH, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const body = (await response.json()) as { owner?: OwnerIdentity; error?: string };

  if (!response.ok || !body.owner) {
    throw new Error(body.error ?? "Identity owner creation failed.");
  }

  return body.owner;
}

export async function resetIdentityOwner(env: IdentityOwnerEnv): Promise<void> {
  const response = await fetchIdentityOwnerInternal(env, INTERNAL_IDENTITY_OWNER_RESET_PATH, {
    method: "POST",
  });
  const body = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(body.error ?? "Identity owner reset failed.");
  }
}

export async function readIdentityCollaboratorInvitationAcceptanceStatus(
  env: IdentityOwnerEnv,
  invitationId: string,
): Promise<IdentityCollaboratorInvitationAcceptanceStatus | null> {
  const url = new URL(INTERNAL_COLLABORATOR_INVITATION_ACCEPTANCE_STATUS_PATH, "http://internal");

  url.searchParams.set("invitationId", invitationId);

  const response = await fetchIdentityOwnerInternal(env, `${url.pathname}${url.search}`, {
    method: "GET",
  });
  const body = (await response.json()) as {
    error?: string;
    invitation?: IdentityCollaboratorInvitationAcceptanceStatus | null;
  };

  if (!response.ok) {
    throw new Error(body.error ?? "Identity collaborator invitation lookup failed.");
  }

  return body.invitation ?? null;
}

export async function resolveIdentityAppReferenceTarget(
  env: IdentityOwnerEnv,
  lookup: IdentityReferenceTargetLookup,
): Promise<IdentityReferenceTargetResolution> {
  const response = await fetchIdentityOwnerInternal(
    env,
    INTERNAL_IDENTITY_APP_REFERENCE_TARGET_PATH,
    {
      body: JSON.stringify(lookup),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  if (!response.ok) {
    return { kind: "unavailable" };
  }

  const body = (await response.json()) as { resolution?: unknown };

  return isIdentityReferenceTargetResolution(body.resolution)
    ? body.resolution
    : { kind: "unavailable" };
}

export async function acceptIdentityCollaboratorInvitation(
  env: IdentityOwnerEnv,
  input: IdentityCollaboratorInvitationAcceptanceCommitInput,
): Promise<IdentityCollaboratorInvitationAcceptanceCommitResult> {
  const response = await fetchIdentityOwnerInternal(
    env,
    INTERNAL_COLLABORATOR_INVITATION_ACCEPTANCE_COMMIT_PATH,
    {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  const body = (await response.json()) as
    | IdentityCollaboratorInvitationAcceptanceCommitResult
    | { error?: string };

  if (!response.ok || !isIdentityCollaboratorInvitationAcceptanceCommitResult(body)) {
    throw new Error(
      responseBodyError(body) ?? "Identity collaborator invitation acceptance failed.",
    );
  }

  return body;
}

async function fetchIdentityOwnerInternal(
  env: IdentityOwnerEnv,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const id = env.FORMLESS_AUTHORITY.idFromName(IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY);

  return env.FORMLESS_AUTHORITY.get(id).fetch(new Request(`http://internal${path}`, init));
}

async function handleIdentityOwnerInternalRequest(
  request: Request,
  storage: DurableObjectStorage,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (url.pathname === INTERNAL_IDENTITY_APP_REFERENCE_TARGET_PATH) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
    }

    ensureIdentityControlPlaneStorage(storage);

    return jsonResponse({
      resolution: resolveIdentityAppReferenceTargetFromStorage(
        storage,
        parseIdentityAppReferenceTargetLookup(await readJson(request)),
      ),
    });
  }

  if (url.pathname === INTERNAL_IDENTITY_OWNER_RESET_PATH) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
    }

    ensureIdentityControlPlaneStorage(storage);
    resetStorageToSourceSeedOutcome(storage, identityControlPlaneSource());

    return jsonResponse({ reset: true });
  }

  if (url.pathname === INTERNAL_IDENTITY_OWNER_PRINCIPAL_PATH) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET" });
    }

    const principalId = parseNonEmptyString(
      "Identity owner principal id",
      url.searchParams.get("principalId"),
    );

    return jsonResponse({ owner: readActiveIdentityOwnerForPrincipal(storage, principalId) });
  }

  if (url.pathname === INTERNAL_IDENTITY_ACTIVE_PRINCIPAL_PATH) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET" });
    }

    const principalId = parseNonEmptyString(
      "Identity active principal id",
      url.searchParams.get("principalId"),
    );

    return jsonResponse({ principal: readActiveIdentityPrincipal(storage, principalId) });
  }

  if (url.pathname === INTERNAL_IDENTITY_PRINCIPAL_AUTHORITY_PATH) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET" });
    }

    const principalId = parseNonEmptyString(
      "Identity principal authority id",
      url.searchParams.get("principalId"),
    );

    return jsonResponse({
      authority: readActiveIdentityAuthorityForPrincipal(storage, principalId),
    });
  }

  if (url.pathname === INTERNAL_COLLABORATOR_INVITATION_ACCEPTANCE_STATUS_PATH) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET" });
    }

    const invitationId = parseNonEmptyString(
      "Identity collaborator invitation id",
      url.searchParams.get("invitationId"),
    );

    return jsonResponse({
      invitation: readCollaboratorInvitationAcceptanceStatus(storage, invitationId),
    });
  }

  if (url.pathname === INTERNAL_COLLABORATOR_INVITATION_ACCEPTANCE_COMMIT_PATH) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
    }

    const result = acceptCollaboratorInvitationIntoIdentity(storage, await readJson(request));

    return jsonResponse(result);
  }

  if (url.pathname !== INTERNAL_IDENTITY_OWNER_PATH) {
    return undefined;
  }

  try {
    if (request.method === "GET") {
      return jsonResponse({ owner: readActiveIdentityOwner(storage) });
    }

    if (request.method === "POST") {
      const input = parseEnsureIdentityOwnerRequest(await readJson(request));
      const result = ensureIdentityOwnerRecords(storage, input);

      return jsonResponse(result);
    }

    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET, POST" });
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

function parseIdentityAppReferenceTargetLookup(value: unknown): IdentityReferenceTargetLookup {
  const object = parseRecord("Identity app reference target lookup", value);

  assertAllowedKeys("Identity app reference target lookup", object, ["id", "target"]);

  return {
    id: parseNonEmptyString("Identity app reference target id", object.id),
    target: parseNonEmptyString("Identity app reference target", object.target),
  };
}

function resolveIdentityAppReferenceTargetFromStorage(
  storage: DurableObjectStorage,
  lookup: IdentityReferenceTargetLookup,
): IdentityReferenceTargetResolution {
  const entity = identityAppReferenceTargetEntity(lookup.target);

  if (entity === undefined) {
    return { kind: "unsupported" };
  }

  const record = getBootstrapRecords(storage).find((candidate) => candidate.id === lookup.id);

  if (!record) {
    return { kind: "missing" };
  }

  if (identityControlPlaneRecordSourceEntityName(record.entity) !== entity) {
    return { kind: "wrong-entity" };
  }

  if (record.deletedAt) {
    return { kind: "tombstoned" };
  }

  return { kind: "active" };
}

function identityAppReferenceTargetEntity(
  value: string,
): "group" | "organization" | "principal" | undefined {
  if (value === "auth:principal") {
    return "principal";
  }

  if (value === "auth:organization") {
    return "organization";
  }

  if (value === "auth:group") {
    return "group";
  }

  return undefined;
}

function ensureIdentityOwnerRecords(
  storage: DurableObjectStorage,
  input: EnsureIdentityOwnerInput,
): { created: boolean; owner: OwnerIdentity } {
  const existingOwner = readActiveIdentityOwner(storage);

  if (existingOwner) {
    return { created: false, owner: existingOwner };
  }

  ensureIdentityControlPlaneStorage(storage);

  const records = getBootstrapRecords(storage);
  const now = parseNonEmptyString("Identity owner createdAt", input.now);
  const ownerInput = normalizeIdentityOwnerInput(input.owner);
  const principalId =
    input.ownerId === undefined
      ? crypto.randomUUID()
      : parseNonEmptyString("Identity owner principal id", input.ownerId);
  const newRecords = identityOwnerRecords({
    now,
    owner: ownerInput,
    principalId,
    records,
  });

  validateIdentityControlPlaneRecords("Identity owner records", [...records, ...newRecords]);

  writeRecordSetForCommandOperationOutcome(
    storage,
    `identity-owner:ensure:${principalId}`,
    newRecords.map(
      (record): OperationRecordWritePlan => ({
        kind: "create",
        entity: record.entity,
        id: record.id,
        values: record.values,
      }),
    ),
    undefined,
    { now },
  );

  const owner = readActiveIdentityOwner(storage);

  if (!owner) {
    throw new Error("Identity owner records did not produce an active owner.");
  }

  return { created: true, owner };
}

function identityAccessGrantAuthorityFromAuthorization(
  storage: DurableObjectStorage,
  authorization: {
    session?: { principalId?: string };
    via: "admin-bearer" | "host-session" | "owner-session" | "open";
  },
): IdentityAccessInvitationGrantAuthoritySummary {
  const principalId = authorization.session?.principalId;

  if (principalId !== undefined) {
    const authority = readActiveIdentityAuthorityForPrincipal(storage, principalId);

    return {
      instanceAdmin: authority?.instanceAdmin === true,
      instanceOwner: authority?.instanceOwner === true,
    };
  }

  return {
    instanceAdmin: true,
    instanceOwner: true,
  };
}

function readIdentityAccessManagementSummary(
  storage: DurableObjectStorage,
  grantAuthority: IdentityAccessInvitationGrantAuthoritySummary,
): IdentityAccessManagementSummary {
  ensureIdentityControlPlaneStorage(storage);

  const records = getBootstrapRecords(storage);
  const primaryEmails = primaryIdentityAccessEmailsByPrincipal(records);
  const roleRecords = new Map(
    identityAccessRecordsForEntity(records, "role").map((record) => [record.id, record]),
  );

  return {
    appRegistrations: identityAccessRecordsForEntity(records, "app-registration").map((record) => {
      const values = record.values as IdentityAppRegistrationValues;

      return {
        appInstallId: values.appInstallId,
        appRegistrationId: record.id,
        createdAt: record.createdAt,
        ...(values.selectedOrganization === undefined
          ? {}
          : { selectedOrganizationId: values.selectedOrganization }),
        status: values.status as IdentityAppRegistrationStatus,
        targetKind: values.targetKind,
        ...(values.targetOrganization === undefined
          ? {}
          : { targetOrganizationId: values.targetOrganization }),
        ...(values.targetPrincipal === undefined
          ? {}
          : { targetPrincipalId: values.targetPrincipal }),
        updatedAt: record.updatedAt,
      };
    }),
    groups: identityAccessRecordsForEntity(records, "group").map((record) => {
      const values = record.values as IdentityGroupValues;

      return {
        createdAt: record.createdAt,
        displayName: values.displayName,
        groupId: record.id,
        status: values.status as IdentityContainerStatus,
        updatedAt: record.updatedAt,
      };
    }),
    invitationGrantOptions: identityAccessInvitationGrantOptions(records, grantAuthority),
    invitations: identityAccessRecordsForEntity(records, "invitation").map(
      identityAccessInvitationSummary,
    ),
    memberships: identityAccessRecordsForEntity(records, "membership").map((record) => {
      const values = record.values as IdentityMembershipValues;

      return {
        createdAt: record.createdAt,
        membershipId: record.id,
        principalId: values.principal,
        status: values.status,
        ...(values.targetGroup === undefined ? {} : { targetGroupId: values.targetGroup }),
        targetKind: values.targetKind,
        ...(values.targetOrganization === undefined
          ? {}
          : { targetOrganizationId: values.targetOrganization }),
        updatedAt: record.updatedAt,
      };
    }),
    organizations: identityAccessRecordsForEntity(records, "organization").map((record) => {
      const values = record.values as IdentityOrganizationValues;

      return {
        createdAt: record.createdAt,
        displayName: values.displayName,
        organizationId: record.id,
        status: values.status as IdentityContainerStatus,
        updatedAt: record.updatedAt,
      };
    }),
    people: identityAccessRecordsForEntity(records, "principal").map((record) => {
      const values = record.values as IdentityPrincipalValues;
      const primaryEmail = primaryEmails.get(record.id);

      return {
        createdAt: record.createdAt,
        displayName: values.displayName,
        kind: values.kind as IdentityPrincipalKind,
        ...(primaryEmail === undefined
          ? {}
          : { primaryEmail: identityAccessPrimaryEmailSummary(primaryEmail) }),
        principalId: record.id,
        status: values.status as IdentityPrincipalStatus,
        updatedAt: record.updatedAt,
      };
    }),
    roles: identityAccessRecordsForEntity(records, "role-assignment").map((record) => {
      const values = record.values as IdentityRoleAssignmentValues;
      const role = roleRecords.get(values.role);

      if (!role) {
        throw new Error(`Identity access summary role "${values.role}" is missing.`);
      }

      const roleValues = role.values as IdentityRoleValues;

      return {
        ...(values.appInstallId === undefined ? {} : { appInstallId: values.appInstallId }),
        createdAt: record.createdAt,
        displayLabel: roleValues.displayLabel,
        roleAssignmentId: record.id,
        roleId: role.id,
        roleKey: roleValues.key,
        scopeKind: values.scopeKind as IdentityRoleAssignmentScopeKind,
        ...(values.scopeOrganization === undefined
          ? {}
          : { scopeOrganizationId: values.scopeOrganization }),
        status: values.status as IdentityRoleAssignmentStatus,
        ...(values.targetGroup === undefined ? {} : { targetGroupId: values.targetGroup }),
        targetKind: values.targetKind as IdentityRoleAssignmentTargetKind,
        ...(values.targetOrganization === undefined
          ? {}
          : { targetOrganizationId: values.targetOrganization }),
        ...(values.targetPrincipal === undefined
          ? {}
          : { targetPrincipalId: values.targetPrincipal }),
        updatedAt: record.updatedAt,
      };
    }),
  };
}

function identityAccessInvitationGrantOptions(
  records: readonly StoredRecord[],
  authority: IdentityAccessInvitationGrantAuthoritySummary,
): IdentityAccessInvitationGrantOptions {
  return {
    authority,
    memberships: identityAccessInvitationMembershipGrantOptions(records, authority),
    roles: identityAccessInvitationRoleGrantOptions(records, authority),
  };
}

function identityAccessInvitationSummary(record: StoredRecord): IdentityAccessInvitationSummary {
  const values = record.values as IdentityInvitationValues;

  return {
    ...(values.acceptedAt === undefined ? {} : { acceptedAt: values.acceptedAt }),
    createdAt: record.createdAt,
    expiresAt: values.expiresAt,
    ...(values.invitedPrincipal === undefined
      ? {}
      : { invitedPrincipalId: values.invitedPrincipal }),
    invitationId: record.id,
    ...(values.inviterPrincipal === undefined
      ? {}
      : { inviterPrincipalId: values.inviterPrincipal }),
    status: values.status,
    ...(values.targetAppInstallId === undefined
      ? {}
      : { targetAppInstallId: values.targetAppInstallId }),
    targetEmail: values.targetEmail,
    ...(values.targetOrganization === undefined
      ? {}
      : { targetOrganizationId: values.targetOrganization }),
    targetSurface: values.targetSurface,
    updatedAt: record.updatedAt,
  };
}

function identityAccessInvitationRoleGrantOptions(
  records: readonly StoredRecord[],
  authority: IdentityAccessInvitationGrantAuthoritySummary,
): IdentityAccessInvitationRoleGrantOption[] {
  const activeRoleKeys = new Set(
    identityAccessRecordsForEntity(records, "role")
      .filter((record) => (record.values as IdentityRoleValues).status === "active")
      .map((record) => (record.values as IdentityRoleValues).key),
  );
  const options: IdentityAccessInvitationRoleGrantOption[] = [];

  if (authority.instanceOwner && activeRoleKeys.has("instance.owner")) {
    options.push(identityAccessInvitationRoleGrantOption("instance.owner", "instance"));
  }

  if (
    (authority.instanceOwner || authority.instanceAdmin) &&
    activeRoleKeys.has("instance.admin")
  ) {
    options.push(identityAccessInvitationRoleGrantOption("instance.admin", "instance"));
  }

  for (const roleKey of appScopedInvitationRoleKeys) {
    if (!activeRoleKeys.has(roleKey)) {
      continue;
    }

    if (authority.instanceOwner || authority.instanceAdmin) {
      options.push(identityAccessInvitationRoleGrantOption(roleKey, "app-install"));
    }

    if (authority.instanceOwner) {
      options.push(identityAccessInvitationRoleGrantOption(roleKey, "organization"));
    }
  }

  return options;
}

function identityAccessInvitationRoleGrantOption(
  roleKey: IdentityControlPlaneRoleKey,
  scopeKind: IdentityRoleAssignmentScopeKind,
): IdentityAccessInvitationRoleGrantOption {
  return {
    displayLabel: `${identityAccessRoleKeyLabel(roleKey)} (${identityAccessScopeLabel(scopeKind)})`,
    roleKey,
    scopeKind,
  };
}

function identityAccessInvitationMembershipGrantOptions(
  records: readonly StoredRecord[],
  authority: IdentityAccessInvitationGrantAuthoritySummary,
): IdentityAccessInvitationMembershipGrantOption[] {
  if (!authority.instanceOwner) {
    return [];
  }

  return [
    ...identityAccessRecordsForEntity(records, "organization")
      .filter((record) => (record.values as IdentityOrganizationValues).status === "active")
      .map((record): IdentityAccessInvitationMembershipGrantOption => {
        const values = record.values as IdentityOrganizationValues;

        return {
          displayLabel: values.displayName,
          targetKind: "organization",
          targetOrganizationId: record.id,
        };
      }),
    ...identityAccessRecordsForEntity(records, "group")
      .filter((record) => (record.values as IdentityGroupValues).status === "active")
      .map((record): IdentityAccessInvitationMembershipGrantOption => {
        const values = record.values as IdentityGroupValues;

        return {
          displayLabel: values.displayName,
          targetGroupId: record.id,
          targetKind: "group",
        };
      }),
  ].sort((left, right) => left.displayLabel.localeCompare(right.displayLabel));
}

function identityAccessRecordsForEntity(
  records: readonly StoredRecord[],
  entity: string,
): StoredRecord[] {
  return records
    .filter((record) => record.entity === entity && !record.deletedAt)
    .sort(compareStoredRecords);
}

function primaryIdentityAccessEmailsByPrincipal(
  records: readonly StoredRecord[],
): Map<string, StoredRecord> {
  const emails = new Map<string, StoredRecord>();

  for (const record of identityAccessRecordsForEntity(records, "principal-email")) {
    const values = record.values as IdentityPrincipalEmailValues;

    if (values.primary === true && !emails.has(values.principal)) {
      emails.set(values.principal, record);
    }
  }

  return emails;
}

function identityAccessPrimaryEmailSummary(record: StoredRecord) {
  const values = record.values as IdentityPrincipalEmailValues;

  return {
    displayEmail: values.displayEmail,
    normalizedEmail: values.normalizedEmail,
    principalEmailId: record.id,
    verificationStatus: values.verificationStatus as IdentityPrincipalEmailVerificationStatus,
    ...(values.verifiedAt === undefined ? {} : { verifiedAt: values.verifiedAt }),
  };
}

function identityAccessRoleKeyLabel(roleKey: IdentityControlPlaneRoleKey): string {
  return roleKey.split(".").map(identityAccessFieldLabel).join(" ");
}

function identityAccessScopeLabel(scopeKind: IdentityRoleAssignmentScopeKind): string {
  return identityAccessFieldLabel(scopeKind);
}

function identityAccessFieldLabel(value: string): string {
  return value.replaceAll(/[-_]/g, " ").replace(/^\w/, (match) => match.toUpperCase());
}

function createCollaboratorInvitation(
  storage: DurableObjectStorage,
  value: unknown,
  options: { grantAuthorityPrincipalId?: string; inviterPrincipalId?: string },
): CreateCollaboratorInvitationWriteResponse {
  const input = parseCreateCollaboratorInvitationRequest(value);
  const plans = collaboratorInvitationRecordWritePlans(input, options);

  if (options.grantAuthorityPrincipalId !== undefined) {
    validateCollaboratorInvitationGrantAuthority(storage, options.grantAuthorityPrincipalId, plans);
  }

  const outcome = writeRecordSetForCommandOperationOutcome(
    storage,
    `collaborator-invitation:${input.idempotencyKey}`,
    plans,
    validateIdentityControlPlaneRecordConstraint(storage),
    input.now === undefined ? {} : { now: input.now },
  );
  const records = outcome.response.changes.map((change) => change.payload);
  const invitation = records.find((record) => record.entity === "invitation");

  if (!invitation) {
    throw new Error("Collaborator invitation write did not create an invitation record.");
  }

  return {
    invitation,
    output: outcome.response,
    records,
    status: outcome.kind === "replay" ? "replayed" : "committed",
  };
}

async function revokeCollaboratorInvitationFromAccessManagement(
  storage: DurableObjectStorage,
  value: unknown,
  options: { env: IdentityControlPlaneApiEnv; requestUrl: string },
): Promise<RevokeCollaboratorInvitationResult> {
  const input = parseCollaboratorInvitationRevokeRequest(value);
  const revokedAt = input.now ?? nowIsoString();
  const records = getBootstrapRecords(storage);
  const candidate = collaboratorInvitationRevocationCandidate(records, {
    ...input,
    now: revokedAt,
  });

  if (!candidate.ok) {
    return identityCollaboratorInvitationRevokeFailure(candidate.reason);
  }

  const tokenRevocation = await requestCollaboratorInvitationTokenRevocation({
    env: options.env,
    invitationId: candidate.invitation.id,
    now: revokedAt,
    requestUrl: options.requestUrl,
  });

  if (!tokenRevocation.ok && tokenRevocation.reason === "already-consumed") {
    return identityCollaboratorInvitationRevokeFailure("accepted-invitation");
  }

  if (!tokenRevocation.ok && tokenRevocation.reason === "expired-token") {
    return identityCollaboratorInvitationRevokeFailure("expired-invitation");
  }

  const outcome = writeRecordSetForCommandOperationOutcome(
    storage,
    `collaborator-invitation-revocation:${candidate.invitation.id}:${revokedAt}`,
    [
      {
        kind: "patch",
        record: candidate.invitation,
        values: {
          ...candidate.invitation.values,
          status: "revoked",
        },
      },
    ],
    validateIdentityControlPlaneRecordConstraint(storage),
    { allowStoredReplay: false, now: revokedAt },
  );
  const invitation = outcome.response.changes
    .map((change) => change.payload)
    .find((record) => record.entity === "invitation" && record.id === candidate.invitation.id);

  if (!invitation) {
    throw new Error("Collaborator invitation revocation did not update the invitation record.");
  }

  return {
    body: {
      invitation: identityAccessInvitationSummary(invitation),
      revokedAt,
      status: "revoked",
    },
    ok: true,
  };
}

function collaboratorInvitationRevocationCandidate(
  records: readonly StoredRecord[],
  input: IdentityCollaboratorInvitationRevokeRequest & { now: string },
):
  | { invitation: StoredRecord; ok: true }
  | { ok: false; reason: IdentityCollaboratorInvitationRevokeFailureReason } {
  const invitation = records.find(
    (record) => record.id === input.invitationId && record.entity === "invitation",
  );

  if (!invitation) {
    return { ok: false, reason: "missing-invitation" };
  }

  if (invitation.deletedAt) {
    return { ok: false, reason: "tombstoned-invitation" };
  }

  const status = parseStringLiteral(
    "Identity collaborator invitation status",
    invitation.values.status,
    invitationStatuses,
  );

  if (status === "accepted") {
    return { ok: false, reason: "accepted-invitation" };
  }

  if (status === "revoked") {
    return { ok: false, reason: "revoked-invitation" };
  }

  if (
    status === "expired" ||
    parseIsoTimestamp("Identity collaborator invitation expiresAt", invitation.values.expiresAt) <=
      input.now
  ) {
    return { ok: false, reason: "expired-invitation" };
  }

  return { invitation, ok: true };
}

function identityCollaboratorInvitationRevokeFailure(
  reason: IdentityCollaboratorInvitationRevokeFailureReason,
): Extract<RevokeCollaboratorInvitationResult, { ok: false }> {
  return {
    body: {
      error:
        reason === "accepted-invitation"
          ? "Invitation has already been accepted."
          : reason === "expired-invitation"
            ? "Invitation has expired."
            : reason === "revoked-invitation"
              ? "Invitation has already been revoked."
              : "Invitation could not be found.",
      reason,
    },
    ok: false,
    status: identityCollaboratorInvitationRevokeFailureStatus(reason),
  };
}

function identityCollaboratorInvitationRevokeFailureStatus(
  reason: IdentityCollaboratorInvitationRevokeFailureReason,
): number {
  switch (reason) {
    case "accepted-invitation":
    case "revoked-invitation":
      return 409;
    case "expired-invitation":
      return 410;
    case "missing-invitation":
    case "tombstoned-invitation":
      return 404;
  }
}

function validateCollaboratorInvitationGrantAuthority(
  storage: DurableObjectStorage,
  inviterPrincipalId: string,
  plans: readonly OperationRecordWritePlan[],
) {
  const grantRecords: IdentityCollaboratorInvitationGrantRecord[] = [];

  for (const plan of plans) {
    if (plan.kind !== "create" || plan.entity === "invitation") {
      continue;
    }

    if (plan.id === undefined) {
      throw new Error("Collaborator invitation grant record is missing an id.");
    }

    if (typeof plan.values === "function") {
      throw new Error("Collaborator invitation grant record values must be materialized.");
    }

    grantRecords.push({
      entity: plan.entity,
      id: plan.id,
      values: plan.values,
    });
  }

  validateIdentityCollaboratorInvitationGrants("Collaborator invitation grants", {
    grantRecords,
    inviterPrincipalId,
    records: getBootstrapRecords(storage),
  });
}

function readCollaboratorInvitationAcceptanceStatus(
  storage: DurableObjectStorage,
  invitationId: string,
): IdentityCollaboratorInvitationAcceptanceStatus | null {
  ensureIdentityControlPlaneStorage(storage);

  const records = getBootstrapRecords(storage);
  const invitation = records.find(
    (record) => record.id === invitationId && record.entity === "invitation" && !record.deletedAt,
  );

  if (!invitation) {
    return null;
  }

  const targetFacts = parseCollaboratorInvitationTargetFacts(invitation.values);
  const invitedPrincipalId =
    typeof invitation.values.invitedPrincipal === "string"
      ? invitation.values.invitedPrincipal
      : undefined;
  const invitedPrincipal =
    invitedPrincipalId === undefined
      ? undefined
      : records.find(
          (record) =>
            record.id === invitedPrincipalId && record.entity === "principal" && !record.deletedAt,
        );

  return {
    ...targetFacts,
    invitationId: invitation.id,
    targetEmail: normalizeEmailDeliveryAddress(
      "Identity collaborator invitation target email",
      invitation.values.targetEmail,
    ),
    expiresAt: parseIsoTimestamp(
      "Identity collaborator invitation expiresAt",
      invitation.values.expiresAt,
    ),
    ...(invitedPrincipalId === undefined ? {} : { invitedPrincipalId }),
    status: parseStringLiteral(
      "Identity collaborator invitation status",
      invitation.values.status,
      invitationStatuses,
    ),
    ...(invitedPrincipal === undefined
      ? {}
      : {
          invitedPrincipalDisplayName: parseNonEmptyString(
            "Identity collaborator invitation invited principal displayName",
            invitedPrincipal.values.displayName,
          ),
        }),
  };
}

function acceptCollaboratorInvitationIntoIdentity(
  storage: DurableObjectStorage,
  value: unknown,
): IdentityCollaboratorInvitationAcceptanceCommitResult {
  const input = parseIdentityCollaboratorInvitationAcceptanceCommitRequest(value);

  ensureIdentityControlPlaneStorage(storage);

  let plans: OperationRecordWritePlan[];

  try {
    const planned = collaboratorInvitationAcceptanceRecordWritePlans(
      getBootstrapRecords(storage),
      input,
    );

    if (!planned.ok) {
      return planned;
    }

    plans = planned.plans;
  } catch {
    return identityCollaboratorInvitationAcceptanceFailure("identity-validation-failed");
  }

  let outcome: WriteOutcome<OperationCommandOutput>;

  try {
    outcome = writeRecordSetForCommandOperationOutcome(
      storage,
      `collaborator-invitation-acceptance:${input.invitationId}`,
      plans,
      validateIdentityControlPlaneRecordConstraint(storage),
      { now: input.now },
    );
  } catch {
    return identityCollaboratorInvitationAcceptanceFailure("identity-validation-failed");
  }

  const invitation = readCollaboratorInvitationAcceptanceStatus(storage, input.invitationId);

  if (!invitation || invitation.status !== "accepted") {
    return identityCollaboratorInvitationAcceptanceFailure("identity-validation-failed");
  }

  return {
    invitation,
    ok: true,
    output: outcome.response,
    principalId: input.principalId,
    records: outcome.response.changes.map((change) => change.payload),
    status: outcome.kind === "replay" ? "replayed" : "committed",
  };
}

function collaboratorInvitationAcceptanceRecordWritePlans(
  records: readonly StoredRecord[],
  input: IdentityCollaboratorInvitationAcceptanceCommitInput,
):
  | { ok: true; plans: OperationRecordWritePlan[] }
  | Extract<IdentityCollaboratorInvitationAcceptanceCommitResult, { ok: false }> {
  const invitation = records.find(
    (record) =>
      record.id === input.invitationId && record.entity === "invitation" && !record.deletedAt,
  );

  if (!invitation) {
    return identityCollaboratorInvitationAcceptanceFailure("missing-invitation");
  }

  const status = parseStringLiteral(
    "Identity collaborator invitation status",
    invitation.values.status,
    invitationStatuses,
  );

  if (status === "accepted") {
    return identityCollaboratorInvitationAcceptanceFailure("accepted-invitation");
  }

  if (status === "revoked") {
    return identityCollaboratorInvitationAcceptanceFailure("revoked-invitation");
  }

  if (
    status === "expired" ||
    parseIsoTimestamp("Identity collaborator invitation expiresAt", invitation.values.expiresAt) <=
      input.now
  ) {
    return identityCollaboratorInvitationAcceptanceFailure("expired-invitation");
  }

  if (
    normalizeEmailDeliveryAddress(
      "Identity collaborator invitation target email",
      invitation.values.targetEmail,
    ).toLowerCase() !== input.targetEmail.toLowerCase()
  ) {
    return identityCollaboratorInvitationAcceptanceFailure("wrong-email");
  }

  const invitationTargetFacts = parseCollaboratorInvitationTargetFacts(invitation.values);

  if (!collaboratorInvitationTargetFactsEqual(invitationTargetFacts, input)) {
    return identityCollaboratorInvitationAcceptanceFailure("wrong-target");
  }

  const invitedPrincipalId = parseOptionalNonEmptyString(
    "Identity collaborator invitation invited principal",
    invitation.values.invitedPrincipal,
  );

  if (invitedPrincipalId !== undefined && invitedPrincipalId !== input.principalId) {
    return identityCollaboratorInvitationAcceptanceFailure("wrong-principal");
  }

  const principal = records.find(
    (record) => record.id === input.principalId && record.entity === "principal",
  );

  if (principal?.deletedAt) {
    return identityCollaboratorInvitationAcceptanceFailure("identity-validation-failed");
  }

  const plans: OperationRecordWritePlan[] = [];

  if (!principal) {
    plans.push({
      kind: "create",
      entity: "principal",
      id: input.principalId,
      values: {
        displayName: input.targetEmail,
        kind: "human",
        status: "active",
      },
    });
  } else if (principal.values.status !== "active") {
    plans.push({
      kind: "patch",
      record: principal,
      values: {
        ...principal.values,
        status: "active",
      },
    });
  }

  plans.push(...collaboratorInvitationPrincipalEmailWritePlans(records, input));

  for (const membership of records) {
    if (
      membership.entity === "membership" &&
      !membership.deletedAt &&
      membership.values.principal === input.principalId &&
      membership.values.status === "invited"
    ) {
      plans.push({
        kind: "patch",
        record: membership,
        values: {
          ...membership.values,
          status: "active",
        },
      });
    }
  }

  for (const appRegistration of records) {
    if (
      appRegistration.entity === "app-registration" &&
      !appRegistration.deletedAt &&
      appRegistration.values.targetKind === "principal" &&
      appRegistration.values.targetPrincipal === input.principalId &&
      appRegistration.values.status === "pending"
    ) {
      plans.push({
        kind: "patch",
        record: appRegistration,
        values: {
          ...appRegistration.values,
          status: "active",
        },
      });
    }
  }

  plans.push({
    kind: "patch",
    record: invitation,
    values: {
      ...invitation.values,
      invitedPrincipal: input.principalId,
      status: "accepted",
      acceptedAt: input.now,
    },
  });

  return { ok: true, plans };
}

function collaboratorInvitationPrincipalEmailWritePlans(
  records: readonly StoredRecord[],
  input: IdentityCollaboratorInvitationAcceptanceCommitInput,
): OperationRecordWritePlan[] {
  const normalizedEmail = normalizeEmailDeliveryAddress(
    "Identity collaborator invitation target email",
    input.targetEmail,
  ).toLowerCase();
  const existingEmail = records.find(
    (record) =>
      record.entity === "principal-email" &&
      !record.deletedAt &&
      record.values.normalizedEmail === normalizedEmail,
  );

  if (existingEmail) {
    if (existingEmail.values.principal !== input.principalId) {
      throw new Error(
        "Identity collaborator invitation target email belongs to another principal.",
      );
    }

    return [
      {
        kind: "patch",
        record: existingEmail,
        values: {
          ...existingEmail.values,
          displayEmail: input.targetEmail,
          normalizedEmail,
          verificationStatus: "verified",
          verifiedAt: input.now,
        },
      },
    ];
  }

  return [
    {
      kind: "create",
      entity: "principal-email",
      id: generatedIdentityRecordId("principal-email"),
      values: {
        principal: input.principalId,
        displayEmail: input.targetEmail,
        normalizedEmail,
        verificationStatus: "verified",
        primary: true,
        recovery: false,
        verifiedAt: input.now,
      },
    },
  ];
}

function parseIdentityCollaboratorInvitationAcceptanceCommitRequest(
  value: unknown,
): IdentityCollaboratorInvitationAcceptanceCommitInput {
  const object = parseRecord("Identity collaborator invitation acceptance request", value);

  assertAllowedKeys("Identity collaborator invitation acceptance request", object, [
    "invitationId",
    "now",
    "principalId",
    "targetAppInstallId",
    "targetEmail",
    "targetOrganization",
    "targetSurface",
  ]);

  return {
    ...parseCollaboratorInvitationTargetFacts(object),
    invitationId: parseNonEmptyString(
      "Identity collaborator invitation acceptance invitation id",
      object.invitationId,
    ),
    now: parseIsoTimestamp("Identity collaborator invitation acceptance now", object.now),
    principalId: parseNonEmptyString(
      "Identity collaborator invitation acceptance principal id",
      object.principalId,
    ),
    targetEmail: normalizeEmailDeliveryAddress(
      "Identity collaborator invitation acceptance target email",
      object.targetEmail,
    ),
  };
}

function identityCollaboratorInvitationAcceptanceFailure(
  reason: IdentityCollaboratorInvitationAcceptanceCommitFailureReason,
): Extract<IdentityCollaboratorInvitationAcceptanceCommitResult, { ok: false }> {
  return {
    error:
      reason === "accepted-invitation"
        ? "Invitation has already been accepted."
        : reason === "expired-invitation"
          ? "Invitation link has expired."
          : reason === "missing-invitation" ||
              reason === "wrong-email" ||
              reason === "wrong-principal" ||
              reason === "wrong-target"
            ? "Invitation link is invalid."
            : reason === "revoked-invitation"
              ? "Invitation link is no longer available."
              : "Invitation acceptance could not be committed.",
    ok: false,
    reason,
  };
}

function isIdentityCollaboratorInvitationAcceptanceCommitResult(
  value: unknown,
): value is IdentityCollaboratorInvitationAcceptanceCommitResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (record.ok === true) {
    return (
      typeof record.principalId === "string" &&
      typeof record.status === "string" &&
      typeof record.invitation === "object" &&
      record.invitation !== null &&
      Array.isArray(record.records) &&
      typeof record.output === "object" &&
      record.output !== null
    );
  }

  return (
    record.ok === false && typeof record.reason === "string" && typeof record.error === "string"
  );
}

function responseBodyError(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const error = (value as Record<string, unknown>).error;

  return typeof error === "string" ? error : undefined;
}

function collaboratorInvitationTargetFactsEqual(
  left: CollaboratorInvitationTargetFacts,
  right: CollaboratorInvitationTargetFacts,
): boolean {
  return (
    left.targetSurface === right.targetSurface &&
    (left.targetAppInstallId ?? undefined) === (right.targetAppInstallId ?? undefined) &&
    (left.targetOrganization ?? undefined) === (right.targetOrganization ?? undefined)
  );
}

async function requestCollaboratorInvitationDelivery(input: {
  env: IdentityControlPlaneApiEnv;
  invitation: StoredRecord;
  requestUrl: string;
}): Promise<CollaboratorInvitationDeliveryResult> {
  const id = input.env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);
  const response = await input.env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(new URL(INTERNAL_COLLABORATOR_INVITATION_DELIVERY_PATH, input.requestUrl), {
      body: JSON.stringify(collaboratorInvitationDeliveryInputFromRecord(input.invitation)),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    }),
  );
  const body = (await response.json()) as CollaboratorInvitationDeliveryResult | { error?: string };

  if (!response.ok || !isCollaboratorInvitationDeliveryResult(body)) {
    return {
      reason: "email-delivery-scheduling-failed",
      status: "skipped",
    };
  }

  return body;
}

async function requestCollaboratorInvitationTokenRevocation(input: {
  env: IdentityControlPlaneApiEnv;
  invitationId: string;
  now: string;
  requestUrl: string;
}): Promise<CollaboratorInvitationTokenRevocationResult> {
  const id = input.env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);
  const response = await input.env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(new URL(INTERNAL_COLLABORATOR_INVITATION_TOKEN_REVOKE_PATH, input.requestUrl), {
      body: JSON.stringify({
        invitationId: input.invitationId,
        now: input.now,
      }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    }),
  );
  const body = (await response.json()) as
    | CollaboratorInvitationTokenRevocationResult
    | {
        error?: string;
      };

  if (!response.ok || !isCollaboratorInvitationTokenRevocationResult(body)) {
    return { ok: false, reason: "missing-token" };
  }

  return body;
}

async function scheduleCollaboratorInvitationDelivery(input: {
  env: IdentityControlPlaneApiEnv;
  input: CollaboratorInvitationDeliveryInput;
  requestUrl: string;
  storage: DurableObjectStorage;
}): Promise<CollaboratorInvitationDeliveryResult> {
  const controlPlaneRecords =
    (await readControlPlaneRecords({ env: input.env, requestUrl: input.requestUrl })) ?? [];
  const productionIdentity = instanceControlPlaneProductionIdentityFromRecords(controlPlaneRecords);
  const senderReference = resolveDefaultEmailSenderReference(controlPlaneRecords, "auth");

  if (!productionIdentity?.authOrigin || !senderReference) {
    return {
      reason: "missing-auth-email-configuration",
      status: "skipped",
    };
  }

  try {
    if (!resolveConfiguredDefaultCloudflareSender(controlPlaneRecords, "auth")) {
      return {
        reason: "missing-auth-email-configuration",
        status: "skipped",
      };
    }
  } catch {
    return {
      reason: "missing-auth-email-configuration",
      status: "skipped",
    };
  }

  const scheduleRequest = collaboratorInvitationDeliveryScheduleRequest({
    authOrigin: productionIdentity.authOrigin,
    input: input.input,
    inviteLink: undefined,
    senderId: senderReference.id,
  });
  const existingDelivery = readEmailDeliveryByScheduleRequest(input.storage, scheduleRequest);

  if (existingDelivery) {
    let result: Awaited<ReturnType<typeof scheduleEmailDelivery>>;

    try {
      result = await scheduleEmailDelivery({
        controlPlaneRecords,
        emailDeliveryQueue: input.env.FORMLESS_EMAIL_DELIVERY_QUEUE,
        now: input.input.createdAt,
        request: scheduleRequest,
        storage: input.storage,
        targetAuthorityName: FORMLESS_INSTANCE_AUTHORITY_NAME,
      });
    } catch {
      return {
        reason: "missing-email-delivery-queue",
        status: "skipped",
      };
    }

    return {
      delivery: result.delivery,
      queued: result.queued,
      replayed: result.replayed,
      status: "scheduled",
    };
  }

  if (!input.env.FORMLESS_EMAIL_DELIVERY_QUEUE) {
    return {
      reason: "missing-email-delivery-queue",
      status: "skipped",
    };
  }

  const tokenResult = await createFreshCollaboratorInvitationToken(input.storage, input.input);

  if (!tokenResult.ok) {
    return {
      reason:
        tokenResult.reason === "duplicate-invitation-id"
          ? "existing-token-without-delivery"
          : "email-delivery-scheduling-failed",
      status: "skipped",
    };
  }

  const inviteLink = buildCollaboratorInvitationLink({
    authOrigin: productionIdentity.authOrigin,
    invitationId: input.input.invitationId,
    token: tokenResult.rawToken,
  });
  const result = await scheduleEmailDelivery({
    controlPlaneRecords,
    emailDeliveryQueue: input.env.FORMLESS_EMAIL_DELIVERY_QUEUE,
    now: input.input.createdAt,
    request: collaboratorInvitationDeliveryScheduleRequest({
      authOrigin: productionIdentity.authOrigin,
      input: input.input,
      inviteLink,
      senderId: senderReference.id,
    }),
    storage: input.storage,
    targetAuthorityName: FORMLESS_INSTANCE_AUTHORITY_NAME,
  });

  return {
    delivery: result.delivery,
    queued: result.queued,
    replayed: result.replayed,
    status: "scheduled",
  };
}

async function createFreshCollaboratorInvitationToken(
  storage: DurableObjectStorage,
  input: CollaboratorInvitationDeliveryInput,
): Promise<
  | { ok: true; rawToken: string }
  | { ok: false; reason: "duplicate-invitation-id" | "email-delivery-scheduling-failed" }
> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rawToken = generateCollaboratorInvitationToken();
    const tokenResult = createCollaboratorInvitationToken(storage, {
      invitationId: input.invitationId,
      tokenHash: await hashCollaboratorInvitationToken(rawToken),
      targetEmail: input.targetEmail,
      targetSurface: input.targetSurface,
      ...(input.targetAppInstallId === undefined
        ? {}
        : { targetAppInstallId: input.targetAppInstallId }),
      ...(input.targetOrganization === undefined
        ? {}
        : { targetOrganization: input.targetOrganization }),
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
    });

    if (tokenResult.ok) {
      return { ok: true, rawToken };
    }

    if (tokenResult.reason !== "duplicate-token-hash") {
      return { ok: false, reason: "duplicate-invitation-id" };
    }
  }

  return { ok: false, reason: "email-delivery-scheduling-failed" };
}

function collaboratorInvitationDeliveryScheduleRequest(input: {
  authOrigin: string;
  input: CollaboratorInvitationDeliveryInput;
  inviteLink: string | undefined;
  senderId: string;
}): EmailDeliveryScheduleRequest {
  return {
    canonicalOrigin: input.authOrigin,
    idempotencyKey: collaboratorInvitationDeliveryIdempotencyKey(input.input.invitationId),
    message: renderCollaboratorInvitationDeliveryMessage({
      expiresAt: input.input.expiresAt,
      inviteLink: input.inviteLink,
    }),
    messageKind: collaboratorInvitationDeliveryMessageKind,
    recipients: [{ address: input.input.targetEmail }],
    sender: { id: input.senderId },
    source: {
      recordId: input.input.invitationId,
      storageIdentity: IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY,
    },
  };
}

function renderCollaboratorInvitationDeliveryMessage(input: {
  expiresAt: string;
  inviteLink: string | undefined;
}) {
  if (input.inviteLink === undefined) {
    return {
      subject: "Accept your Formless invitation",
      text: "This invitation delivery has already been rendered.",
    };
  }

  const escapedLink = htmlAttributeEscape(input.inviteLink);

  return {
    subject: "Accept your Formless invitation",
    text: [
      "You have been invited to collaborate in Formless.",
      "",
      `Accept the invitation: ${input.inviteLink}`,
      "",
      `This invitation expires at ${input.expiresAt}.`,
    ].join("\n"),
    html: [
      "<p>You have been invited to collaborate in Formless.</p>",
      `<p><a href="${escapedLink}">Accept invitation</a></p>`,
      `<p>This invitation expires at ${htmlTextEscape(input.expiresAt)}.</p>`,
    ].join(""),
  };
}

function collaboratorInvitationDeliveryIdempotencyKey(invitationId: string): string {
  return `${invitationId}:${collaboratorInvitationDeliveryPurpose}`;
}

function collaboratorInvitationDeliveryInputFromRecord(
  record: StoredRecord,
): CollaboratorInvitationDeliveryInput {
  if (record.entity !== "invitation") {
    throw new BadRequestError("Collaborator invitation delivery requires an invitation record.");
  }

  const targetFacts = parseCollaboratorInvitationTargetFacts(record.values);

  return {
    ...targetFacts,
    invitationId: parseNonEmptyString("Collaborator invitation id", record.id),
    targetEmail: normalizeEmailDeliveryAddress(
      "Collaborator invitation target email",
      record.values.targetEmail,
    ),
    createdAt: parseIsoTimestamp("Collaborator invitation createdAt", record.createdAt),
    expiresAt: parseIsoTimestamp("Collaborator invitation expiresAt", record.values.expiresAt),
  };
}

function parseCollaboratorInvitationDeliveryRequest(
  value: unknown,
): CollaboratorInvitationDeliveryInput {
  const object = parseRecord("Collaborator invitation delivery request", value);

  assertAllowedKeys("Collaborator invitation delivery request", object, [
    "createdAt",
    "expiresAt",
    "invitationId",
    "targetAppInstallId",
    "targetEmail",
    "targetOrganization",
    "targetSurface",
  ]);

  return {
    ...parseCollaboratorInvitationTargetFacts(object),
    invitationId: parseNonEmptyString("Collaborator invitation id", object.invitationId),
    targetEmail: normalizeEmailDeliveryAddress(
      "Collaborator invitation target email",
      object.targetEmail,
    ),
    createdAt: parseIsoTimestamp("Collaborator invitation createdAt", object.createdAt),
    expiresAt: parseIsoTimestamp("Collaborator invitation expiresAt", object.expiresAt),
  };
}

function parseCollaboratorInvitationRevokeRequest(
  value: unknown,
): IdentityCollaboratorInvitationRevokeRequest {
  const object = parseRecord("Collaborator invitation revoke request", value);
  const now = parseOptionalIsoTimestamp("Collaborator invitation revoke now", object.now);

  assertAllowedKeys("Collaborator invitation revoke request", object, ["invitationId", "now"]);

  return {
    invitationId: parseNonEmptyString(
      "Collaborator invitation revoke invitationId",
      object.invitationId,
    ),
    ...(now === undefined ? {} : { now }),
  };
}

function parseCollaboratorInvitationTokenRevocationRequest(
  value: unknown,
): CollaboratorInvitationTokenRevocationInput {
  const object = parseRecord("Collaborator invitation token revocation request", value);

  assertAllowedKeys("Collaborator invitation token revocation request", object, [
    "invitationId",
    "now",
  ]);

  return {
    invitationId: parseNonEmptyString(
      "Collaborator invitation token revocation invitationId",
      object.invitationId,
    ),
    now: parseIsoTimestamp("Collaborator invitation token revocation now", object.now),
  };
}

function isCollaboratorInvitationDeliveryResult(
  value: unknown,
): value is CollaboratorInvitationDeliveryResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (record.status === "skipped") {
    return typeof record.reason === "string";
  }

  return (
    record.status === "scheduled" &&
    typeof record.queued === "boolean" &&
    typeof record.replayed === "boolean" &&
    typeof record.delivery === "object" &&
    record.delivery !== null
  );
}

function collaboratorInvitationTokenRevocationResult(
  result: RevokeCollaboratorInvitationTokenResult,
): CollaboratorInvitationTokenRevocationResult {
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

function isCollaboratorInvitationTokenRevocationResult(
  value: unknown,
): value is CollaboratorInvitationTokenRevocationResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (record.ok === true) {
    return true;
  }

  return (
    record.ok === false &&
    typeof record.reason === "string" &&
    ["already-consumed", "expired-token", "missing-token", "revoked-token"].includes(record.reason)
  );
}

function htmlAttributeEscape(value: string): string {
  return htmlTextEscape(value).replaceAll('"', "&quot;");
}

function htmlTextEscape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function collaboratorInvitationRecordWritePlans(
  input: CreateCollaboratorInvitationInput,
  options: { inviterPrincipalId?: string },
): OperationRecordWritePlan[] {
  const invitedPrincipalId =
    input.invitedPrincipal === undefined
      ? undefined
      : (input.invitedPrincipal.id ?? generatedIdentityRecordId("principal"));
  const linkedRecordsRequested =
    input.principalEmail !== undefined ||
    input.memberships.length > 0 ||
    input.roleAssignments.length > 0 ||
    input.appRegistrations.length > 0;

  if (linkedRecordsRequested && invitedPrincipalId === undefined) {
    throw new BadRequestError(
      "Collaborator invitation linked identity records require invitedPrincipal.",
    );
  }

  const invitationId = input.invitationId ?? generatedIdentityRecordId("invitation");
  const plans: OperationRecordWritePlan[] = [];

  if (input.invitedPrincipal !== undefined && invitedPrincipalId !== undefined) {
    plans.push({
      kind: "create",
      entity: "principal",
      id: invitedPrincipalId,
      values: {
        displayName: input.invitedPrincipal.displayName,
        kind: "human",
        status: "invited",
      },
    });
  }

  if (input.principalEmail !== undefined && invitedPrincipalId !== undefined) {
    plans.push({
      kind: "create",
      entity: "principal-email",
      id: input.principalEmail.id ?? generatedIdentityRecordId("principal-email"),
      values: {
        principal: invitedPrincipalId,
        displayEmail: input.targetEmail,
        normalizedEmail: input.targetEmail.toLowerCase(),
        verificationStatus: "unverified",
        primary: input.principalEmail.primary,
        recovery: input.principalEmail.recovery,
      },
    });
  }

  for (const [index, membership] of input.memberships.entries()) {
    if (invitedPrincipalId === undefined) {
      throw new BadRequestError(`Collaborator invitation membership ${index} requires principal.`);
    }

    plans.push({
      kind: "create",
      entity: "membership",
      id: membership.id ?? generatedIdentityRecordId("membership"),
      values: collaboratorInvitationMembershipValues(membership, invitedPrincipalId),
    });
  }

  for (const [index, roleAssignment] of input.roleAssignments.entries()) {
    if (invitedPrincipalId === undefined) {
      throw new BadRequestError(
        `Collaborator invitation role assignment ${index} requires principal.`,
      );
    }

    plans.push({
      kind: "create",
      entity: "role-assignment",
      id: roleAssignment.id ?? generatedIdentityRecordId("role-assignment"),
      values: collaboratorInvitationRoleAssignmentValues(roleAssignment, invitedPrincipalId),
    });
  }

  for (const [index, appRegistration] of input.appRegistrations.entries()) {
    if (invitedPrincipalId === undefined) {
      throw new BadRequestError(
        `Collaborator invitation app registration ${index} requires principal.`,
      );
    }

    plans.push({
      kind: "create",
      entity: "app-registration",
      id: appRegistration.id ?? generatedIdentityRecordId("app-registration"),
      values: collaboratorInvitationAppRegistrationValues(appRegistration, invitedPrincipalId),
    });
  }

  plans.push({
    kind: "create",
    entity: "invitation",
    id: invitationId,
    values: {
      targetEmail: input.targetEmail,
      ...collaboratorInvitationTargetValues(input),
      ...(invitedPrincipalId === undefined ? {} : { invitedPrincipal: invitedPrincipalId }),
      ...(options.inviterPrincipalId === undefined
        ? {}
        : { inviterPrincipal: options.inviterPrincipalId }),
      status: "pending",
      expiresAt: input.expiresAt,
    },
  });

  return plans;
}

function collaboratorInvitationTargetValues(
  input: CollaboratorInvitationTargetFacts,
): Pick<
  CreateCollaboratorInvitationInput,
  "targetAppInstallId" | "targetOrganization" | "targetSurface"
> {
  if (input.targetSurface === "app-install") {
    return {
      targetSurface: input.targetSurface,
      targetAppInstallId: requiredParsedString(
        "Collaborator invitation target app install id",
        input.targetAppInstallId,
      ),
    };
  }

  if (input.targetSurface === "organization") {
    return {
      targetSurface: input.targetSurface,
      targetOrganization: requiredParsedString(
        "Collaborator invitation target organization",
        input.targetOrganization,
      ),
    };
  }

  return {
    targetSurface: input.targetSurface,
  };
}

function collaboratorInvitationMembershipValues(
  input: CollaboratorInvitationMembershipInput,
  principalId: string,
): IdentityMembershipValues {
  if (input.targetKind === "group") {
    return {
      principal: principalId,
      targetKind: input.targetKind,
      targetGroup: requiredParsedString(
        "Collaborator invitation membership target group",
        input.targetGroup,
      ),
      status: "invited",
    };
  }

  return {
    principal: principalId,
    targetKind: input.targetKind,
    targetOrganization: requiredParsedString(
      "Collaborator invitation membership target organization",
      input.targetOrganization,
    ),
    status: "invited",
  };
}

function collaboratorInvitationRoleAssignmentValues(
  input: CollaboratorInvitationRoleAssignmentInput,
  principalId: string,
): IdentityRoleAssignmentValues {
  if (input.scopeKind === "app-install") {
    return {
      role: input.role,
      targetKind: "principal",
      targetPrincipal: principalId,
      scopeKind: input.scopeKind,
      appInstallId: requiredParsedString(
        "Collaborator invitation role assignment app install id",
        input.appInstallId,
      ),
      status: "active",
    };
  }

  if (input.scopeKind === "organization") {
    return {
      role: input.role,
      targetKind: "principal",
      targetPrincipal: principalId,
      scopeKind: input.scopeKind,
      scopeOrganization: requiredParsedString(
        "Collaborator invitation role assignment scope organization",
        input.scopeOrganization,
      ),
      status: "active",
    };
  }

  return {
    role: input.role,
    targetKind: "principal",
    targetPrincipal: principalId,
    scopeKind: input.scopeKind,
    status: "active",
  };
}

function collaboratorInvitationAppRegistrationValues(
  input: CollaboratorInvitationAppRegistrationInput,
  principalId: string,
): IdentityAppRegistrationValues {
  return {
    appInstallId: input.appInstallId,
    targetKind: "principal",
    targetPrincipal: principalId,
    status: "pending",
    ...(input.selectedOrganization === undefined
      ? {}
      : { selectedOrganization: input.selectedOrganization }),
  };
}

function identityOwnerRecords(input: {
  now: string;
  owner: OwnerIdentityInput;
  principalId: string;
  records: readonly StoredRecord[];
}): StoredRecord[] {
  const ownerRole = activeRoleRecord(input.records, "instance.owner");
  const records: StoredRecord[] = [
    {
      id: input.principalId,
      entity: "principal",
      values: {
        displayName: input.owner.name,
        kind: "human",
        status: "active",
      },
      createdAt: input.now,
      updatedAt: input.now,
    },
    {
      id: `role-assignment:${input.principalId}:instance.owner`,
      entity: "role-assignment",
      values: {
        role: ownerRole.id,
        targetKind: "principal",
        targetPrincipal: input.principalId,
        scopeKind: "instance",
        status: "active",
      },
      createdAt: input.now,
      updatedAt: input.now,
    },
  ];

  if (input.owner.email !== undefined) {
    records.splice(1, 0, {
      id: `principal-email:${input.principalId}:primary`,
      entity: "principal-email",
      values: {
        principal: input.principalId,
        displayEmail: input.owner.email,
        normalizedEmail: normalizeIdentityEmail(input.owner.email),
        verificationStatus: "unverified",
        primary: true,
        recovery: true,
      },
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  assertNewIdentityRecordIds(input.records, records);

  return records;
}

function readActiveIdentityOwner(storage: DurableObjectStorage): OwnerIdentity | null {
  ensureIdentityControlPlaneStorage(storage);

  const records = getBootstrapRecords(storage);
  const ownerRole = activeRoleRecord(records, "instance.owner");
  const principals = new Map(
    records
      .filter(
        (record) =>
          record.entity === "principal" && !record.deletedAt && record.values.status === "active",
      )
      .map((record) => [record.id, record]),
  );
  const assignment = records
    .filter(
      (record) =>
        record.entity === "role-assignment" &&
        !record.deletedAt &&
        record.values.status === "active" &&
        record.values.role === ownerRole.id &&
        record.values.targetKind === "principal" &&
        record.values.scopeKind === "instance" &&
        typeof record.values.targetPrincipal === "string" &&
        principals.has(record.values.targetPrincipal),
    )
    .sort(compareStoredRecords)[0];

  if (!assignment || typeof assignment.values.targetPrincipal !== "string") {
    return null;
  }

  const principal = principals.get(assignment.values.targetPrincipal);

  if (!principal) {
    return null;
  }

  return identityOwnerFromPrincipal(records, principal);
}

function readActiveIdentityOwnerForPrincipal(
  storage: DurableObjectStorage,
  principalId: string,
): OwnerIdentity | null {
  ensureIdentityControlPlaneStorage(storage);

  const records = getBootstrapRecords(storage);
  const ownerRole = activeRoleRecord(records, "instance.owner");
  const principal = records.find(
    (record) =>
      record.id === principalId &&
      record.entity === "principal" &&
      !record.deletedAt &&
      record.values.status === "active",
  );

  if (!principal) {
    return null;
  }

  const assignment = records.find(
    (record) =>
      record.entity === "role-assignment" &&
      !record.deletedAt &&
      record.values.status === "active" &&
      record.values.role === ownerRole.id &&
      record.values.targetKind === "principal" &&
      record.values.scopeKind === "instance" &&
      record.values.targetPrincipal === principal.id,
  );

  if (!assignment) {
    return null;
  }

  return identityOwnerFromPrincipal(records, principal);
}

function readActiveIdentityAuthorityForPrincipal(
  storage: DurableObjectStorage,
  principalId: string,
): ActiveIdentityAuthority | null {
  ensureIdentityControlPlaneStorage(storage);

  const records = getBootstrapRecords(storage);
  const principal = records.find(
    (record) =>
      record.id === principalId &&
      record.entity === "principal" &&
      !record.deletedAt &&
      record.values.status === "active",
  );

  if (!principal) {
    return null;
  }

  const ownerRole = activeRoleRecord(records, "instance.owner");
  const adminRole = activeRoleRecord(records, "instance.admin");

  return {
    id: principal.id,
    instanceAdmin: hasActiveInstanceRoleAssignment(records, principal.id, adminRole.id),
    instanceOwner: hasActiveInstanceRoleAssignment(records, principal.id, ownerRole.id),
  };
}

function readActiveIdentityPrincipal(
  storage: DurableObjectStorage,
  principalId: string,
): { id: string } | null {
  ensureIdentityControlPlaneStorage(storage);

  const principal = getBootstrapRecords(storage).find(
    (record) =>
      record.id === principalId &&
      record.entity === "principal" &&
      !record.deletedAt &&
      record.values.status === "active",
  );

  return principal ? { id: principal.id } : null;
}

function hasActiveInstanceRoleAssignment(
  records: readonly StoredRecord[],
  principalId: string,
  roleId: string,
): boolean {
  return records.some(
    (record) =>
      record.entity === "role-assignment" &&
      !record.deletedAt &&
      record.values.status === "active" &&
      record.values.role === roleId &&
      record.values.targetKind === "principal" &&
      record.values.scopeKind === "instance" &&
      record.values.targetPrincipal === principalId,
  );
}

function identityOwnerFromPrincipal(
  records: readonly StoredRecord[],
  principal: StoredRecord,
): OwnerIdentity {
  const email = primaryPrincipalEmail(records, principal.id);

  return {
    id: principal.id,
    name: parseNonEmptyString(
      "Identity owner principal display name",
      principal.values.displayName,
    ),
    ...(email === undefined ? {} : { email }),
    createdAt: principal.createdAt,
  };
}

function activeRoleRecord(
  records: readonly StoredRecord[],
  roleKey: IdentityControlPlaneRoleKey,
): StoredRecord {
  const role = records.find(
    (record) =>
      record.entity === "role" &&
      !record.deletedAt &&
      record.values.status === "active" &&
      record.values.key === roleKey,
  );

  if (!role) {
    throw new Error(`Identity owner role "${roleKey}" is missing.`);
  }

  return role;
}

function primaryPrincipalEmail(records: readonly StoredRecord[], principalId: string) {
  const record = records
    .filter(
      (candidate) =>
        candidate.entity === "principal-email" &&
        !candidate.deletedAt &&
        candidate.values.principal === principalId &&
        candidate.values.primary === true,
    )
    .sort(compareStoredRecords)[0];

  if (!record) {
    return undefined;
  }

  return parseNonEmptyString("Identity owner principal email", record.values.displayEmail);
}

function compareStoredRecords(left: StoredRecord, right: StoredRecord) {
  const created = left.createdAt.localeCompare(right.createdAt);

  return created === 0 ? left.id.localeCompare(right.id) : created;
}

function assertNewIdentityRecordIds(
  records: readonly StoredRecord[],
  newRecords: readonly StoredRecord[],
) {
  const existingIds = new Set(records.map((record) => record.id));

  for (const record of newRecords) {
    if (existingIds.has(record.id)) {
      throw new Error(`Identity owner record "${record.id}" already exists.`);
    }
  }
}

function parseEnsureIdentityOwnerRequest(value: unknown): EnsureIdentityOwnerInput {
  const object = parseRecord("Identity owner request", value);
  const allowedKeys = new Set(["now", "owner", "ownerId"]);

  for (const key of Object.keys(object)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Identity owner request has unsupported key "${key}".`);
    }
  }

  return {
    now: parseNonEmptyString("Identity owner now", object.now),
    owner: normalizeIdentityOwnerInput(object.owner),
    ...(object.ownerId === undefined
      ? {}
      : { ownerId: parseNonEmptyString("Identity owner principal id", object.ownerId) }),
  };
}

function parseCreateCollaboratorInvitationRequest(
  value: unknown,
): CreateCollaboratorInvitationInput {
  const object = parseRecord("Collaborator invitation request", value);

  assertAllowedKeys("Collaborator invitation request", object, [
    "appRegistrations",
    "expiresAt",
    "idempotencyKey",
    "invitationId",
    "invitedPrincipal",
    "memberships",
    "now",
    "principalEmail",
    "roleAssignments",
    "targetAppInstallId",
    "targetEmail",
    "targetOrganization",
    "targetSurface",
  ]);

  const targetEmail = normalizeEmailDeliveryAddress(
    "Collaborator invitation target email",
    object.targetEmail,
  );
  const targetFacts = parseCollaboratorInvitationTargetFacts(object);
  const expiresAt = parseIsoTimestamp("Collaborator invitation expiresAt", object.expiresAt);
  const now = parseOptionalIsoTimestamp("Collaborator invitation now", object.now);
  const comparisonNow = now ?? new Date().toISOString();

  if (expiresAt <= comparisonNow) {
    throw new BadRequestError("Collaborator invitation expiresAt must be after now.");
  }

  return {
    ...targetFacts,
    targetEmail,
    expiresAt,
    idempotencyKey: parseNonEmptyString(
      "Collaborator invitation idempotencyKey",
      object.idempotencyKey,
    ),
    ...(object.invitationId === undefined
      ? {}
      : {
          invitationId: parseNonEmptyString("Collaborator invitation id", object.invitationId),
        }),
    ...(object.invitedPrincipal === undefined
      ? {}
      : { invitedPrincipal: parseCollaboratorInvitationPrincipal(object.invitedPrincipal) }),
    ...(object.principalEmail === undefined
      ? {}
      : { principalEmail: parseCollaboratorInvitationPrincipalEmail(object.principalEmail) }),
    memberships: parseCollaboratorInvitationMemberships(object.memberships),
    roleAssignments: parseCollaboratorInvitationRoleAssignments(object.roleAssignments),
    appRegistrations: parseCollaboratorInvitationAppRegistrations(object.appRegistrations),
    ...(now === undefined ? {} : { now }),
  };
}

function parseCollaboratorInvitationTargetFacts(
  object: Record<string, unknown>,
): CollaboratorInvitationTargetFacts {
  const targetSurface = parseStringLiteral(
    "Collaborator invitation targetSurface",
    object.targetSurface,
    invitationTargetSurfaces,
  );
  const targetAppInstallId = parseOptionalNonEmptyString(
    "Collaborator invitation targetAppInstallId",
    object.targetAppInstallId,
  );
  const targetOrganization = parseOptionalNonEmptyString(
    "Collaborator invitation targetOrganization",
    object.targetOrganization,
  );

  if (targetSurface === "app-install") {
    if (targetAppInstallId === undefined || targetOrganization !== undefined) {
      throw new BadRequestError(
        "Collaborator invitation app-install target requires targetAppInstallId only.",
      );
    }

    return {
      targetSurface,
      targetAppInstallId,
    };
  }

  if (targetSurface === "organization") {
    if (targetOrganization === undefined || targetAppInstallId !== undefined) {
      throw new BadRequestError(
        "Collaborator invitation organization target requires targetOrganization only.",
      );
    }

    return {
      targetSurface,
      targetOrganization,
    };
  }

  if (targetAppInstallId !== undefined || targetOrganization !== undefined) {
    throw new BadRequestError("Collaborator invitation instance target cannot include target ids.");
  }

  return { targetSurface };
}

function parseCollaboratorInvitationPrincipal(
  value: unknown,
): CollaboratorInvitationPrincipalInput {
  const object = parseRecord("Collaborator invitation invitedPrincipal", value);

  assertAllowedKeys("Collaborator invitation invitedPrincipal", object, ["displayName", "id"]);

  return {
    displayName: parseNonEmptyString(
      "Collaborator invitation invitedPrincipal displayName",
      object.displayName,
    ),
    ...(object.id === undefined
      ? {}
      : {
          id: parseNonEmptyString("Collaborator invitation invitedPrincipal id", object.id),
        }),
  };
}

function parseCollaboratorInvitationPrincipalEmail(
  value: unknown,
): CollaboratorInvitationPrincipalEmailInput {
  const object = parseRecord("Collaborator invitation principalEmail", value);

  assertAllowedKeys("Collaborator invitation principalEmail", object, [
    "id",
    "primary",
    "recovery",
  ]);

  return {
    ...(object.id === undefined
      ? {}
      : { id: parseNonEmptyString("Collaborator invitation principalEmail id", object.id) }),
    primary:
      parseOptionalBoolean("Collaborator invitation principalEmail primary", object.primary) ??
      true,
    recovery:
      parseOptionalBoolean("Collaborator invitation principalEmail recovery", object.recovery) ??
      false,
  };
}

function parseCollaboratorInvitationMemberships(
  value: unknown,
): CollaboratorInvitationMembershipInput[] {
  return parseOptionalArray("Collaborator invitation memberships", value, (item, index) => {
    const object = parseRecord(`Collaborator invitation memberships ${index}`, item);

    assertAllowedKeys(`Collaborator invitation memberships ${index}`, object, [
      "id",
      "targetGroup",
      "targetKind",
      "targetOrganization",
    ]);

    const targetKind = parseStringLiteral(
      `Collaborator invitation memberships ${index} targetKind`,
      object.targetKind,
      membershipTargetKinds,
    );
    const targetGroup = parseOptionalNonEmptyString(
      `Collaborator invitation memberships ${index} targetGroup`,
      object.targetGroup,
    );
    const targetOrganization = parseOptionalNonEmptyString(
      `Collaborator invitation memberships ${index} targetOrganization`,
      object.targetOrganization,
    );

    if (targetKind === "group") {
      if (targetGroup === undefined || targetOrganization !== undefined) {
        throw new BadRequestError(
          `Collaborator invitation memberships ${index} group target requires targetGroup only.`,
        );
      }

      return {
        ...(object.id === undefined
          ? {}
          : {
              id: parseNonEmptyString(`Collaborator invitation memberships ${index} id`, object.id),
            }),
        targetKind,
        targetGroup,
      };
    }

    if (targetOrganization === undefined || targetGroup !== undefined) {
      throw new BadRequestError(
        `Collaborator invitation memberships ${index} organization target requires targetOrganization only.`,
      );
    }

    return {
      ...(object.id === undefined
        ? {}
        : {
            id: parseNonEmptyString(`Collaborator invitation memberships ${index} id`, object.id),
          }),
      targetKind,
      targetOrganization,
    };
  });
}

function parseCollaboratorInvitationRoleAssignments(
  value: unknown,
): CollaboratorInvitationRoleAssignmentInput[] {
  return parseOptionalArray("Collaborator invitation roleAssignments", value, (item, index) => {
    const object = parseRecord(`Collaborator invitation roleAssignments ${index}`, item);

    assertAllowedKeys(`Collaborator invitation roleAssignments ${index}`, object, [
      "appInstallId",
      "id",
      "role",
      "roleKey",
      "scopeKind",
      "scopeOrganization",
    ]);

    const role = parseCollaboratorInvitationRoleReference(object, index);
    const scopeKind = parseStringLiteral(
      `Collaborator invitation roleAssignments ${index} scopeKind`,
      object.scopeKind,
      roleAssignmentScopeKinds,
    );
    const appInstallId = parseOptionalNonEmptyString(
      `Collaborator invitation roleAssignments ${index} appInstallId`,
      object.appInstallId,
    );
    const scopeOrganization = parseOptionalNonEmptyString(
      `Collaborator invitation roleAssignments ${index} scopeOrganization`,
      object.scopeOrganization,
    );

    if (scopeKind === "app-install") {
      if (appInstallId === undefined || scopeOrganization !== undefined) {
        throw new BadRequestError(
          `Collaborator invitation roleAssignments ${index} app-install scope requires appInstallId only.`,
        );
      }

      return {
        ...(object.id === undefined
          ? {}
          : {
              id: parseNonEmptyString(
                `Collaborator invitation roleAssignments ${index} id`,
                object.id,
              ),
            }),
        role,
        scopeKind,
        appInstallId,
      };
    }

    if (scopeKind === "organization") {
      if (scopeOrganization === undefined || appInstallId !== undefined) {
        throw new BadRequestError(
          `Collaborator invitation roleAssignments ${index} organization scope requires scopeOrganization only.`,
        );
      }

      return {
        ...(object.id === undefined
          ? {}
          : {
              id: parseNonEmptyString(
                `Collaborator invitation roleAssignments ${index} id`,
                object.id,
              ),
            }),
        role,
        scopeKind,
        scopeOrganization,
      };
    }

    if (appInstallId !== undefined || scopeOrganization !== undefined) {
      throw new BadRequestError(
        `Collaborator invitation roleAssignments ${index} instance scope cannot include scope ids.`,
      );
    }

    return {
      ...(object.id === undefined
        ? {}
        : {
            id: parseNonEmptyString(
              `Collaborator invitation roleAssignments ${index} id`,
              object.id,
            ),
          }),
      role,
      scopeKind,
    };
  });
}

function parseCollaboratorInvitationRoleReference(
  object: Record<string, unknown>,
  index: number,
): string {
  const role = parseOptionalNonEmptyString(
    `Collaborator invitation roleAssignments ${index} role`,
    object.role,
  );
  const roleKey = parseOptionalStringLiteral(
    `Collaborator invitation roleAssignments ${index} roleKey`,
    object.roleKey,
    identityControlPlaneRoleKeys,
  );

  if (
    (role === undefined && roleKey === undefined) ||
    (role !== undefined && roleKey !== undefined)
  ) {
    throw new BadRequestError(
      `Collaborator invitation roleAssignments ${index} must include exactly one of role or roleKey.`,
    );
  }

  return role ?? `role:${roleKey}`;
}

function parseCollaboratorInvitationAppRegistrations(
  value: unknown,
): CollaboratorInvitationAppRegistrationInput[] {
  return parseOptionalArray("Collaborator invitation appRegistrations", value, (item, index) => {
    const object = parseRecord(`Collaborator invitation appRegistrations ${index}`, item);

    assertAllowedKeys(`Collaborator invitation appRegistrations ${index}`, object, [
      "appInstallId",
      "id",
      "selectedOrganization",
    ]);

    return {
      appInstallId: parseNonEmptyString(
        `Collaborator invitation appRegistrations ${index} appInstallId`,
        object.appInstallId,
      ),
      ...(object.id === undefined
        ? {}
        : {
            id: parseNonEmptyString(
              `Collaborator invitation appRegistrations ${index} id`,
              object.id,
            ),
          }),
      ...(object.selectedOrganization === undefined
        ? {}
        : {
            selectedOrganization: parseNonEmptyString(
              `Collaborator invitation appRegistrations ${index} selectedOrganization`,
              object.selectedOrganization,
            ),
          }),
    };
  });
}

function normalizeIdentityOwnerInput(value: unknown): OwnerIdentityInput {
  const object = parseRecord("Identity owner", value);
  const allowedKeys = new Set(["email", "name"]);

  for (const key of Object.keys(object)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Identity owner has unsupported key "${key}".`);
    }
  }

  return {
    name: parseNonEmptyString("Identity owner name", object.name),
    ...(object.email === undefined
      ? {}
      : { email: parseNonEmptyString("Identity owner email", object.email) }),
  };
}

function normalizeIdentityEmail(value: string) {
  return parseNonEmptyString("Identity owner normalized email", value).toLowerCase();
}

function validateIdentityControlPlaneRecordConstraint(
  storage: DurableObjectStorage,
): RecordConstraintValidator {
  return (entityName, values, options) => {
    const records = getBootstrapRecords(storage);
    const candidateRecord = candidateIdentityRecord(records, entityName, values, options);
    const candidateRecords = options?.ignoreRecordId
      ? records.map((record) => (record.id === options.ignoreRecordId ? candidateRecord : record))
      : [...records, candidateRecord];

    validateIdentityControlPlaneRecords("Identity control-plane records", candidateRecords);
  };
}

function candidateIdentityRecord(
  records: readonly StoredRecord[],
  entity: string,
  values: RecordValues,
  options: { ignoreRecordId?: string } | undefined,
): StoredRecord {
  const existing = options?.ignoreRecordId
    ? records.find((record) => record.id === options.ignoreRecordId)
    : undefined;

  if (existing) {
    return {
      ...existing,
      values,
      updatedAt: builtInRoleCreatedAt,
    };
  }

  return {
    id: pendingRecordId(records, entity),
    entity,
    values,
    createdAt: builtInRoleCreatedAt,
    updatedAt: builtInRoleCreatedAt,
  };
}

function pendingRecordId(records: readonly StoredRecord[], entity: string) {
  const existingIds = new Set(records.map((record) => record.id));
  let id = `pending:${entity}`;

  while (existingIds.has(id)) {
    id = `${id}:next`;
  }

  return id;
}

function builtInRoleRecords(): StoredRecord[] {
  return identityControlPlaneRoleKeys.map((roleKey) => builtInRoleRecord(roleKey));
}

function builtInRoleRecord(roleKey: IdentityControlPlaneRoleKey): StoredRecord {
  return {
    id: `role:${roleKey}`,
    entity: "role",
    values: {
      key: roleKey,
      displayLabel: roleKey,
      status: "active",
    },
    createdAt: builtInRoleCreatedAt,
    updatedAt: builtInRoleCreatedAt,
  };
}

function identityControlPlaneActorKindFromRequest(
  request: Request,
  url: URL,
): SchemaOperationActorKind {
  const value =
    request.headers.get("X-Formless-Identity-Control-Plane-Actor") ??
    request.headers.get("X-Formless-Actor-Kind") ??
    url.searchParams.get("actorKind") ??
    "owner";

  if (actorKinds.includes(value as (typeof actorKinds)[number])) {
    return value as SchemaOperationActorKind;
  }

  throw new BadRequestError(`Unsupported identity control-plane actor "${value}".`);
}

function assertIdentityControlPlaneWriteActor(
  actorKind: SchemaOperationActorKind,
  operation: AuthorityOperation,
) {
  if (actorKind === "owner" || actorKind === "admin") {
    return;
  }

  throw new BadRequestError(
    `Identity control-plane ${operation.kind} writes are not exposed to actor "${actorKind}".`,
  );
}

const noopWriteNotifier: AuthorityWriteNotifier = {
  apply(write) {
    return write();
  },
};

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new BadRequestError("Request body must be valid JSON.");
  }
}

function parseRecord(context: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestError(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function assertAllowedKeys(
  context: string,
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
) {
  const allowed = new Set(allowedKeys);

  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new BadRequestError(`${context} has unsupported key "${key}".`);
    }
  }
}

function parseOptionalArray<T>(
  context: string,
  value: unknown,
  parseItem: (item: unknown, index: number) => T,
): T[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new BadRequestError(`${context} must be an array.`);
  }

  return value.map((item, index) => parseItem(item, index));
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function parseOptionalNonEmptyString(context: string, value: unknown): string | undefined {
  return value === undefined ? undefined : parseNonEmptyString(context, value);
}

function requiredParsedString(context: string, value: string | undefined): string {
  if (value === undefined) {
    throw new BadRequestError(`${context} must be a non-empty string.`);
  }

  return value;
}

function parseIsoTimestamp(context: string, value: unknown): string {
  const timestamp = parseNonEmptyString(context, value);
  const date = new Date(timestamp);

  if (Number.isNaN(date.valueOf()) || date.toISOString() !== timestamp) {
    throw new BadRequestError(`${context} must be an ISO timestamp.`);
  }

  return timestamp;
}

function parseOptionalIsoTimestamp(context: string, value: unknown): string | undefined {
  return value === undefined ? undefined : parseIsoTimestamp(context, value);
}

function parseOptionalBoolean(context: string, value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new BadRequestError(`${context} must be a boolean.`);
  }

  return value;
}

function parseStringLiteral<const Values extends readonly string[]>(
  context: string,
  value: unknown,
  values: Values,
): Values[number] {
  const parsed = parseNonEmptyString(context, value);

  if (!values.includes(parsed as Values[number])) {
    throw new BadRequestError(`${context} must be one of: ${values.join(", ")}.`);
  }

  return parsed as Values[number];
}

function parseOptionalStringLiteral<const Values extends readonly string[]>(
  context: string,
  value: unknown,
  values: Values,
): Values[number] | undefined {
  return value === undefined ? undefined : parseStringLiteral(context, value, values);
}

function generatedIdentityRecordId(entity: string): string {
  return `${entity}:${crypto.randomUUID()}`;
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);

  if (!responseHeaders.has("Cache-Control")) {
    responseHeaders.set("Cache-Control", "no-store");
  }

  return Response.json(body, {
    status,
    headers: responseHeaders,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Bad request.";
}
