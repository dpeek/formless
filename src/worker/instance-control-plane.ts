import {
  installedAppStorageIdentity,
  parseInstanceControlPlaneApiRoute,
} from "../shared/app-storage-identity.ts";
import {
  appInstallRegistryError,
  createAppInstall,
  findBundledAppPackage,
  listAppInstalls,
  type AppInstall,
  type AppInstallId,
  type AppInstallRoute,
} from "../shared/app-installs.ts";
import { nowIsoString } from "../shared/clock.ts";
import {
  INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX,
  INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  instanceControlPlaneAppRouteId,
  instanceControlPlaneAppInstallRecord,
  instanceControlPlaneRecordsForAppInstall,
  instanceControlPlaneSchema,
  type InstanceControlPlaneAppRouteKind,
  type InstanceControlPlaneAppRouteValues,
  type InstanceControlPlaneRedirectStatusCode,
} from "../shared/instance-control-plane.ts";
import type {
  DeploymentAttempt,
  DeploymentDriftReport,
  DeploymentJsonValue,
  DeploymentResource,
  DeploymentResourceEvidenceSummary,
  DeploymentTarget,
} from "../shared/deployment-runtime.ts";
import type { InstanceDomainProviderRedirectIntent } from "../shared/domain-provider-api.ts";
import type {
  InstanceDomainMapping,
  InstanceDomainMappingProfile,
} from "../shared/instance-domain-mappings.ts";
import {
  parseCreateAppInstallRequest,
  type ActionResponse,
  type CreateAppInstallRequest,
  type RecordValues,
  type StoredRecord,
} from "../shared/protocol.ts";
import { parseAppSchema, type SchemaActionActorKind } from "../shared/schema.ts";
import {
  authorizeAuthorityOperation,
  type AuthorityAdminGuardEnv,
} from "./authority-admin-guard.ts";
import {
  executeAuthorityOperation,
  selectAuthorityOperation,
  type AuthorityOperation,
  type AuthorityWriteNotifier,
} from "./authority-operations.ts";
import { validateRecordValues } from "./authority-validation.ts";
import { assertUniqueConstraints } from "./constraints.ts";
import { BadRequestError } from "./errors.ts";
import { findWorkerSchemaAppDefinition, type WorkerSchemaAppDefinition } from "./schema-apps.ts";
import {
  createRecordSetForActionOutcome,
  ensureStorageTables,
  getActionResponseById,
  getBootstrapRecords,
  getStoredRecord,
  initializeStorageFromSource,
  patchStoredRecordOutcome,
  type StorageSource,
} from "./storage.ts";

const actorKinds = ["admin", "cliDeployer", "owner", "runner"] as const;
const createAppInstallControlPlaneAction = "createAppInstall";
export const INTERNAL_BACKFILL_APP_INSTALLS_PATH = "/_internal/backfill-app-installs";
export const INTERNAL_SYNC_DOMAIN_INTENT_PATH = "/_internal/sync-domain-intent";
export const INTERNAL_SYNC_DEPLOYMENT_PROJECTION_PATH = "/_internal/sync-deployment-projection";
export const INTERNAL_RECORD_DEPLOYMENT_ATTEMPT_PATH = "/_internal/record-deployment-attempt";
export const INTERNAL_RECORD_DEPLOYMENT_EVIDENCE_PATH = "/_internal/record-deployment-evidence";
export const INTERNAL_RECORD_DEPLOYMENT_DRIFT_PATH = "/_internal/record-deployment-drift";
const instanceControlPlaneSourceSchema = parseAppSchema(instanceControlPlaneSchema);
const instanceControlPlaneSource: StorageSource = {
  schema: instanceControlPlaneSourceSchema,
  records: [],
  changeMutationPrefix: "seed-instance-control-plane",
};
const instanceControlPlaneApp = {
  key: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  label: "Instance control plane",
  route: "/instance-control-plane",
  schemaRoute: "/instance-control-plane/schema",
  seedChangeMutationPrefix: "seed-instance-control-plane",
  sourceSchema: instanceControlPlaneSourceSchema,
  seedRecords: [],
} satisfies WorkerSchemaAppDefinition;

type InstanceControlPlaneApiEnv = AuthorityAdminGuardEnv & {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
};

type ParsedCreateAppInstallActionRequest = {
  actionId: string;
  input: CreateAppInstallRequest;
};

export async function handleInstanceControlPlaneApiRequest(
  request: Request,
  env: InstanceControlPlaneApiEnv,
): Promise<Response | undefined> {
  const route = parseInstanceControlPlaneApiRoute(new URL(request.url).pathname);

  if (!route) {
    return undefined;
  }

  if (isInternalControlPlanePath(route.path)) {
    return jsonResponse({ error: "Not found." }, 404);
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleInstanceControlPlaneDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceControlPlaneApiEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const route = parseInstanceControlPlaneApiRoute(url.pathname);

  if (!route) {
    return undefined;
  }

  try {
    if (route.path === INTERNAL_BACKFILL_APP_INSTALLS_PATH) {
      return await handleInternalBackfillAppInstalls(request, storage);
    }

    if (route.path === INTERNAL_SYNC_DOMAIN_INTENT_PATH) {
      return await handleInternalSyncDomainIntent(request, storage);
    }

    if (route.path === INTERNAL_SYNC_DEPLOYMENT_PROJECTION_PATH) {
      return await handleInternalSyncDeploymentProjection(request, storage);
    }

    if (route.path === INTERNAL_RECORD_DEPLOYMENT_ATTEMPT_PATH) {
      return await handleInternalRecordDeploymentAttempt(request, storage);
    }

    if (route.path === INTERNAL_RECORD_DEPLOYMENT_EVIDENCE_PATH) {
      return await handleInternalRecordDeploymentEvidence(request, storage);
    }

    if (route.path === INTERNAL_RECORD_DEPLOYMENT_DRIFT_PATH) {
      return await handleInternalRecordDeploymentDrift(request, storage);
    }

    if (route.path === `/${createAppInstallControlPlaneAction}`) {
      return redirectControlPlaneActionRoute(request, createAppInstallControlPlaneAction);
    }

    if (route.path === `/actions/${createAppInstallControlPlaneAction}`) {
      return await handleCreateAppInstallAction(request, storage, env);
    }

    const operation = selectAuthorityOperation({
      method: request.method,
      path: route.path,
      searchParams: url.searchParams,
    });

    if (!operation) {
      return jsonResponse({ error: "Not found." }, 404);
    }

    const actorKind = controlPlaneActorKindFromRequest(request, url);
    const authorization = await authorizeAuthorityOperation(request, operation, env);

    if (!authorization.authorized) {
      return jsonResponse(
        { error: authorization.error },
        authorization.status,
        authorization.headers,
      );
    }

    if (operation.metadata.mode === "write" && operation.kind !== "action") {
      assertBrowserControlPlaneWriteActor(actorKind, operation);
    }

    const body = operation.metadata.mode === "write" ? await readJson(request) : undefined;
    ensureStorageTables(storage);
    const result = executeAuthorityOperation({
      actorKind,
      app: instanceControlPlaneApp,
      body,
      identity: route.identity,
      operation,
      source: instanceControlPlaneSource,
      storage,
      writes: noopWriteNotifier,
    });

    return jsonResponse(result.body, result.status, result.headers);
  } catch (error) {
    if (error instanceof BadRequestError) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

export function readControlPlaneAppInstalls(storage: DurableObjectStorage): AppInstall[] {
  ensureStorageTables(storage);
  initializeStorageFromSource(storage, instanceControlPlaneSource);
  const records = getBootstrapRecords(storage).filter((record) => !record.deletedAt);
  const routeRecords = records.filter((record) => record.entity === "appRoute");

  return listAppInstalls(
    records
      .filter((record) => record.entity === "appInstall" && record.values.status === "installed")
      .map((record) =>
        appInstallFromControlPlaneValues(
          record.values,
          routeRecords
            .filter((routeRecord) => routeRecord.values.appInstall === record.id)
            .map((routeRecord) => ({
              id: routeRecord.id,
              values: routeRecord.values as InstanceControlPlaneAppRouteValues,
            })),
        ),
      ),
  );
}

async function handleInternalBackfillAppInstalls(
  request: Request,
  storage: DurableObjectStorage,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  ensureStorageTables(storage);
  initializeStorageFromSource(storage, instanceControlPlaneSource);

  const installs = parseInternalBackfillAppInstalls(await readJson(request));
  const existing = readControlPlaneAppInstalls(storage);
  const backfilled: string[] = [];

  for (const install of installs) {
    if (existing.some((candidate) => candidate.installId === install.installId)) {
      continue;
    }

    backfillAppInstallRecords(storage, install);
    existing.push(install);
    backfilled.push(install.installId);
  }

  return jsonResponse({
    backfilled,
    installs: readControlPlaneAppInstalls(storage),
  });
}

async function handleInternalSyncDeploymentProjection(
  request: Request,
  storage: DurableObjectStorage,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  ensureStorageTables(storage);
  initializeStorageFromSource(storage, instanceControlPlaneSource);

  const parsed = parseInternalDeploymentProjectionRequest(await readJson(request));

  syncDeploymentProjectionRecords(storage, parsed);

  return jsonResponse({
    records: activeControlPlaneRecords(storage),
  });
}

async function handleInternalSyncDomainIntent(
  request: Request,
  storage: DurableObjectStorage,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  ensureStorageTables(storage);
  initializeStorageFromSource(storage, instanceControlPlaneSource);

  const parsed = parseInternalDomainIntentSyncRequest(await readJson(request));

  syncDomainIntentRecords(storage, parsed);

  return jsonResponse({
    records: activeControlPlaneRecords(storage),
  });
}

async function handleInternalRecordDeploymentAttempt(
  request: Request,
  storage: DurableObjectStorage,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  ensureStorageTables(storage);
  initializeStorageFromSource(storage, instanceControlPlaneSource);

  const parsed = parseInternalDeploymentAttemptRecordRequest(await readJson(request));

  upsertDeploymentAttemptRecord(storage, parsed);

  return jsonResponse({
    records: activeControlPlaneRecords(storage),
  });
}

async function handleInternalRecordDeploymentEvidence(
  request: Request,
  storage: DurableObjectStorage,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  ensureStorageTables(storage);
  initializeStorageFromSource(storage, instanceControlPlaneSource);

  const parsed = parseInternalDeploymentEvidenceRecordRequest(await readJson(request));

  upsertDeploymentAttemptRecord(storage, {
    attempt: parsed.attempt,
    target: parsed.target,
  });
  createDeploymentEvidenceRecords(storage, parsed);

  return jsonResponse({
    records: activeControlPlaneRecords(storage),
  });
}

async function handleInternalRecordDeploymentDrift(
  request: Request,
  storage: DurableObjectStorage,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  ensureStorageTables(storage);
  initializeStorageFromSource(storage, instanceControlPlaneSource);

  const parsed = parseInternalDeploymentDriftRecordRequest(await readJson(request));

  upsertDeploymentTargetRecord(storage, parsed.target, parsed.now);
  createDeploymentDriftRecord(storage, parsed);

  return jsonResponse({
    records: activeControlPlaneRecords(storage),
  });
}

async function handleCreateAppInstallAction(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceControlPlaneApiEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  const actorKind = controlPlaneActorKindFromRequest(request, new URL(request.url));
  assertBrowserControlPlaneActionActor(actorKind, createAppInstallControlPlaneAction);

  const authorization = await authorizeAuthorityOperation(
    request,
    {
      kind: "action",
      metadata: {
        kind: "action",
        method: request.method,
        mode: "write",
        path: `/actions/${createAppInstallControlPlaneAction}`,
      },
    },
    env,
  );

  if (!authorization.authorized) {
    return jsonResponse(
      { error: authorization.error },
      authorization.status,
      authorization.headers,
    );
  }

  ensureStorageTables(storage);
  initializeStorageFromSource(storage, instanceControlPlaneSource);

  const parsed = parseCreateAppInstallActionRequest(await readJson(request));
  const replay = getActionResponseById(storage, parsed.actionId);

  if (replay) {
    return jsonResponse(replay);
  }

  const now = nowIsoString();
  const result = createAppInstall({
    existingInstalls: readControlPlaneAppInstalls(storage),
    installId: parsed.input.installId,
    label: parsed.input.label,
    now,
    packageAppKey: parsed.input.packageAppKey,
    validateInitialSource: ({ initialization }) => {
      const source = findWorkerSchemaAppDefinition(initialization.sourceSchemaKey);
      const seed = findWorkerSchemaAppDefinition(initialization.seedRecordsKey);

      if (!source || !seed) {
        return appInstallRegistryError(
          "source-validation-failed",
          "source",
          `Package app "${initialization.packageAppKey}" source is unavailable.`,
        );
      }

      return undefined;
    },
  });

  if (!result.ok) {
    return jsonResponse(
      {
        error: result.error.message,
        code: result.error.code,
        ...(result.error.field === undefined ? {} : { field: result.error.field }),
        installs: result.installs,
      },
      result.error.code === "duplicate-install-id" ? 409 : 400,
    );
  }

  await initializeInstalledAppStorageForInstall(result.install, env, request.url);

  const records = instanceControlPlaneRecordsForAppInstall({ install: result.install, now });
  const outcome = noopWriteNotifier.apply(() =>
    createRecordSetForActionOutcome(
      storage,
      parsed.actionId,
      "appInstall",
      createAppInstallControlPlaneAction,
      records.map((record) => ({
        entity: record.entity,
        id: record.id,
        values: record.values,
      })),
      validateControlPlaneRecordWrite(storage, instanceControlPlaneSource.schema),
    ),
  );

  return jsonResponse(outcome.response satisfies ActionResponse, 201);
}

async function initializeInstalledAppStorageForInstall(
  install: AppInstall,
  env: InstanceControlPlaneApiEnv,
  requestUrl: string,
) {
  const identity = installedAppStorageIdentity({
    installId: install.installId,
    packageAppKey: install.packageAppKey,
  });

  if (!identity) {
    throw new BadRequestError(`Install "${install.installId}" does not resolve to app storage.`);
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(identity.authorityName);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(new URL(`${identity.apiRoutePrefix}/bootstrap`, requestUrl), {
      headers: { Accept: "application/json" },
      method: "GET",
    }),
  );

  if (!response.ok) {
    throw new BadRequestError(`Install "${install.installId}" storage could not be initialized.`);
  }
}

function validateControlPlaneRecordWrite(
  storage: DurableObjectStorage,
  schema: typeof instanceControlPlaneSource.schema,
) {
  return (entityName: string, values: RecordValues, options?: { ignoreRecordId?: string }) => {
    const entity = schema.entities[entityName];

    if (!entity) {
      throw new BadRequestError(`Unknown entity "${entityName}".`);
    }

    const validated = validateRecordValues(values, entity, storage, {
      entityName,
      schema,
      existingRecordId: options?.ignoreRecordId,
    });

    assertUniqueConstraints(storage, schema, entityName, validated, options);
  };
}

function parseCreateAppInstallActionRequest(value: unknown): ParsedCreateAppInstallActionRequest {
  if (!isRecord(value)) {
    throw new BadRequestError("Control-plane action request must be an object.");
  }

  const inputValue = isRecord(value.input) ? value.input : value;
  const input = parseCreateAppInstallRequest(inputValue);
  const actionId =
    parseOptionalActionIdentity(value.actionId) ??
    parseOptionalActionIdentity(value.idempotencyKey) ??
    `createAppInstall:${input.installId}`;

  return { actionId, input };
}

function parseOptionalActionIdentity(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError("Control-plane action id must be a non-empty string.");
  }

  return value.trim();
}

function appInstallFromControlPlaneValues(
  values: RecordValues,
  routeRecords: { id: string; values: InstanceControlPlaneAppRouteValues }[],
): AppInstall {
  const packageAppKey = String(values.packageAppKey);
  const packageApp = findBundledAppPackage(packageAppKey);

  if (!packageApp) {
    throw new Error(`Stored app install "${String(values.installId)}" has unsupported package.`);
  }

  const installId = String(values.installId);
  const routes = appInstallRoutesFromControlPlaneRoutes(routeRecords);
  const hasRouteRecords = routes.length > 0;
  const adminRoute =
    enabledRoutePath(routes, "admin") ?? `${packageApp.adminRouteBase}/${installId}`;
  const schemaRoute =
    enabledRoutePath(routes, "schema") ?? `${packageApp.adminRouteBase}/${installId}/schema`;
  const publicRoute = enabledAppInstallRoute(routes, "publicSite");

  return {
    installId,
    packageAppKey: packageApp.packageAppKey,
    label: String(values.label),
    status: "installed",
    createdAt: String(values.createdAt),
    updatedAt: String(values.updatedAt),
    adminRoute,
    schemaRoute,
    ...(publicRoute
      ? {
          publicRoute: publicRoute.path,
          publicRoutePrefix:
            publicRoute.prefix ?? (`${publicRoute.path.replace(/\/+$/, "")}/` as `/${string}/`),
        }
      : packageApp.publicRouteBase === undefined || hasRouteRecords
        ? {}
        : {
            publicRoute: `${packageApp.publicRouteBase}/${installId}`,
            publicRoutePrefix: `${packageApp.publicRouteBase}/${installId}/`,
          }),
    ...(hasRouteRecords ? { routes } : {}),
  };
}

function backfillAppInstallRecords(storage: DurableObjectStorage, install: AppInstall) {
  const appInstallRecord = instanceControlPlaneAppInstallRecord(install);
  const now = install.updatedAt || install.createdAt || nowIsoString();
  const routes = instanceControlPlaneRecordsForAppInstall({ install, now }).slice(1);
  const records = [appInstallRecord, ...routes];

  createRecordSetForActionOutcome(
    storage,
    `backfillAppInstall:${install.installId}`,
    "appInstall",
    "backfillAppInstall",
    records.map((record) => ({
      entity: record.entity,
      id: record.id,
      values: record.values,
    })),
    validateControlPlaneRecordWrite(storage, instanceControlPlaneSource.schema),
  );
}

function syncDeploymentProjectionRecords(
  storage: DurableObjectStorage,
  input: {
    now: string;
    resources: DeploymentResource[];
    sourceFingerprint: string;
    target: DeploymentTarget;
  },
) {
  const targetRecordId = upsertDeploymentTargetRecord(storage, input.target, input.now);
  const nextResourceRecordIds = new Set<string>();

  for (const resource of input.resources) {
    const recordId = deploymentDesiredResourceRecordId(input.target.targetId, resource.logicalId);
    const existing = getStoredRecord(storage, recordId);
    const values = deploymentDesiredResourceValues({
      createdAt: stringRecordValue(existing?.values.createdAt) ?? input.now,
      resource,
      sourceFingerprint: input.sourceFingerprint,
      targetRecordId,
      updatedAt: input.now,
    });

    upsertControlPlaneRecord(storage, {
      action: "syncDeploymentProjection",
      entity: "deployDesiredResource",
      id: recordId,
      values,
    });
    nextResourceRecordIds.add(recordId);
  }

  for (const record of activeControlPlaneRecords(storage)) {
    if (
      record.entity !== "deployDesiredResource" ||
      record.values.deployTarget !== targetRecordId ||
      nextResourceRecordIds.has(record.id) ||
      record.values.enabled !== true
    ) {
      continue;
    }

    upsertControlPlaneRecord(storage, {
      action: "disableDeploymentProjectionResource",
      entity: "deployDesiredResource",
      id: record.id,
      values: {
        ...record.values,
        enabled: false,
        updatedAt: input.now,
      },
    });
  }
}

function syncDomainIntentRecords(
  storage: DurableObjectStorage,
  input: {
    mappings?: InstanceDomainMapping[];
    now: string;
    redirectIntents?: InstanceDomainProviderRedirectIntent[];
  },
) {
  if (input.mappings !== undefined) {
    const nextDomainMappingIds = new Set<string>();

    for (const mapping of input.mappings) {
      const recordId = domainMappingRecordId(mapping);

      upsertControlPlaneRecord(storage, {
        action: "syncDomainMapping",
        entity: "domainMapping",
        id: recordId,
        values: domainMappingRecordValues(storage, mapping),
      });
      nextDomainMappingIds.add(recordId);
    }

    disableMissingControlPlaneIntentRecords(storage, "domainMapping", nextDomainMappingIds, {
      action: "disableDomainMappingIntent",
      now: input.now,
    });
  }

  if (input.redirectIntents !== undefined) {
    const nextRedirectIntentIds = new Set<string>();

    for (const intent of input.redirectIntents) {
      const recordId = redirectIntentRecordId(intent.fromHost);

      upsertControlPlaneRecord(storage, {
        action: "syncRedirectIntent",
        entity: "redirectIntent",
        id: recordId,
        values: redirectIntentRecordValues(intent),
      });
      nextRedirectIntentIds.add(recordId);
    }

    disableMissingControlPlaneIntentRecords(storage, "redirectIntent", nextRedirectIntentIds, {
      action: "disableRedirectIntent",
      now: input.now,
    });
  }
}

function upsertDeploymentTargetRecord(
  storage: DurableObjectStorage,
  target: DeploymentTarget,
  now: string,
) {
  const existing = getStoredRecord(storage, target.targetId);
  const values: RecordValues = {
    targetId: target.targetId,
    targetKind: target.kind,
    label: target.label ?? target.targetId,
    enabled: true,
    createdAt: stringRecordValue(existing?.values.createdAt) ?? now,
    updatedAt: now,
  };

  upsertControlPlaneRecord(storage, {
    action: "syncDeploymentTarget",
    entity: "deployTarget",
    id: target.targetId,
    values,
  });

  return target.targetId;
}

function upsertDeploymentAttemptRecord(
  storage: DurableObjectStorage,
  input: { attempt: DeploymentAttempt; target: DeploymentTarget },
) {
  upsertDeploymentTargetRecord(storage, input.target, input.attempt.updatedAt);

  const existing = getStoredRecord(storage, input.attempt.attemptId);
  const values: RecordValues = {
    deployTarget: input.attempt.targetId,
    versionId: input.attempt.versionId,
    desiredStateHash: input.attempt.hash,
    revision: input.attempt.revision,
    mode: input.attempt.mode,
    status: input.attempt.status,
    actorKind: controlPlaneDeploymentActorKind(input.attempt.actor.kind),
    actorId: input.attempt.actor.actorId,
    ...(input.attempt.runnerId === undefined ? {} : { runnerId: input.attempt.runnerId }),
    idempotencyKey: input.attempt.idempotencyKey,
    startedAt: input.attempt.startedAt,
    updatedAt: input.attempt.updatedAt,
    ...(input.attempt.completedAt === undefined ? {} : { completedAt: input.attempt.completedAt }),
  };

  upsertControlPlaneRecord(storage, {
    action: existing ? "updateDeploymentAttempt" : "startDeploymentAttempt",
    entity: "deployAttempt",
    id: input.attempt.attemptId,
    values,
  });
}

function createDeploymentEvidenceRecords(
  storage: DurableObjectStorage,
  input: {
    attempt: DeploymentAttempt;
    evidence: DeploymentResourceEvidenceSummary[];
    now: string;
    target: DeploymentTarget;
  },
) {
  const desiredResources = new Map(
    activeControlPlaneRecords(storage)
      .filter(
        (record) =>
          record.entity === "deployDesiredResource" &&
          record.values.deployTarget === input.target.targetId,
      )
      .map((record) => [String(record.values.logicalId), record.id]),
  );

  for (const evidence of input.evidence) {
    const recordId = deploymentEvidenceRecordId(input.attempt.attemptId, evidence.logicalId);

    if (getStoredRecord(storage, recordId)) {
      continue;
    }

    const values: RecordValues = {
      deployAttempt: input.attempt.attemptId,
      ...(desiredResources.get(evidence.logicalId) === undefined
        ? {}
        : { deployDesiredResource: desiredResources.get(evidence.logicalId) ?? "" }),
      action: evidence.action,
      logicalId: evidence.logicalId,
      kind: evidence.kind,
      providerFamily: evidence.providerFamily,
      providerResourceIdsJson: JSON.stringify(evidence.providerResourceIds),
      ...(evidence.displayName === undefined ? {} : { displayName: evidence.displayName }),
      ...(evidence.alchemyResourceId === undefined
        ? {}
        : { alchemyResourceId: evidence.alchemyResourceId }),
      recordedAt: input.now,
    };

    upsertControlPlaneRecord(storage, {
      action: "recordDeploymentSuccess",
      entity: "deployEvidenceSummary",
      id: recordId,
      values,
    });
  }
}

function createDeploymentDriftRecord(
  storage: DurableObjectStorage,
  input: { now: string; report: DeploymentDriftReport; target: DeploymentTarget },
) {
  if (getStoredRecord(storage, input.report.reportId)) {
    return;
  }

  const values: RecordValues = {
    deployTarget: input.report.targetId,
    versionId: input.report.versionId,
    desiredStateHash: input.report.hash,
    revision: input.report.revision,
    status: input.report.status,
    actorKind: controlPlaneDeploymentActorKind(input.report.actor.kind),
    actorId: input.report.actor.actorId,
    affectedLogicalIdsJson: JSON.stringify(input.report.summary.affectedLogicalIds),
    createCount: input.report.summary.create,
    updateCount: input.report.summary.update,
    deleteCount: input.report.summary.delete,
    reportedAt: input.report.reportedAt,
  };

  upsertControlPlaneRecord(storage, {
    action: "recordDeploymentDrift",
    entity: "deployDriftReport",
    id: input.report.reportId,
    values,
  });
}

function upsertControlPlaneRecord(
  storage: DurableObjectStorage,
  input: {
    action: string;
    entity: string;
    id: string;
    values: RecordValues;
  },
) {
  const existing = getStoredRecord(storage, input.id);
  const validate = validateControlPlaneRecordWrite(storage, instanceControlPlaneSource.schema);

  if (!existing || existing.deletedAt) {
    createRecordSetForActionOutcome(
      storage,
      `controlPlane:${input.action}:create:${input.id}:${recordValuesHash(input.values)}`,
      input.entity,
      input.action,
      [{ entity: input.entity, id: input.id, values: input.values }],
      validate,
    );
    return;
  }

  if (recordValuesEqual(existing.values, input.values)) {
    return;
  }

  patchStoredRecordOutcome(
    storage,
    {
      mutationId: `controlPlane:${input.action}:patch:${input.id}:${recordValuesHash(
        input.values,
      )}`,
      entity: input.entity,
      op: "patch",
      recordId: input.id,
      values: input.values,
    },
    input.values,
    validate,
  );
}

function deploymentDesiredResourceValues(input: {
  createdAt: string;
  resource: DeploymentResource;
  sourceFingerprint: string;
  targetRecordId: string;
  updatedAt: string;
}): RecordValues {
  return {
    deployTarget: input.targetRecordId,
    logicalId: input.resource.logicalId,
    kind: input.resource.kind,
    providerFamily: input.resource.providerFamily,
    inputsJson: JSON.stringify(input.resource.inputs),
    ...(input.resource.dependencies.length === 0
      ? {}
      : { dependenciesJson: JSON.stringify(input.resource.dependencies) }),
    enabled: true,
    sourceFingerprint: input.sourceFingerprint,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function domainMappingRecordValues(
  storage: DurableObjectStorage,
  mapping: InstanceDomainMapping,
): RecordValues {
  const targetInstallId = mapping.targetInstallId ?? mapping.installId;
  const appInstall =
    targetInstallId && activeControlPlaneRecordExists(storage, "appInstall", targetInstallId)
      ? targetInstallId
      : undefined;
  const routeId =
    targetInstallId === undefined
      ? undefined
      : domainMappingAppRouteIdForProfile(mapping.profile, targetInstallId);
  const appRoute =
    routeId && activeControlPlaneRecordExists(storage, "appRoute", routeId) ? routeId : undefined;

  return {
    host: mapping.host,
    profile: mapping.profile,
    ...(appInstall === undefined ? {} : { appInstall }),
    ...(appRoute === undefined ? {} : { appRoute }),
    enabled: mapping.enabled,
    createdAt: mapping.createdAt,
    updatedAt: mapping.updatedAt,
  };
}

function redirectIntentRecordValues(intent: InstanceDomainProviderRedirectIntent): RecordValues {
  return {
    fromHost: intent.fromHost,
    ...(intent.toHost === undefined ? {} : { toHost: intent.toHost }),
    ...(intent.toUrl === undefined ? {} : { toUrl: intent.toUrl }),
    statusCode: String(intent.statusCode) as InstanceControlPlaneRedirectStatusCode,
    preservePath: intent.preservePath,
    preserveQueryString: intent.preserveQueryString,
    enabled: intent.enabled,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
  };
}

function disableMissingControlPlaneIntentRecords(
  storage: DurableObjectStorage,
  entity: "domainMapping" | "redirectIntent",
  nextRecordIds: Set<string>,
  input: { action: string; now: string },
) {
  for (const record of activeControlPlaneRecords(storage)) {
    if (
      record.entity !== entity ||
      nextRecordIds.has(record.id) ||
      record.values.enabled === false
    ) {
      continue;
    }

    upsertControlPlaneRecord(storage, {
      action: input.action,
      entity,
      id: record.id,
      values: {
        ...record.values,
        enabled: false,
        updatedAt: input.now,
      },
    });
  }
}

function activeControlPlaneRecords(storage: DurableObjectStorage): StoredRecord[] {
  return getBootstrapRecords(storage).filter((record) => !record.deletedAt);
}

function appInstallRoutesFromControlPlaneRoutes(
  routeRecords: { id: string; values: InstanceControlPlaneAppRouteValues }[],
): AppInstallRoute[] {
  return routeRecords
    .map((record) => appInstallRouteFromControlPlaneRoute(record.id, record.values))
    .sort(compareAppInstallRoutes);
}

function appInstallRouteFromControlPlaneRoute(
  id: string,
  values: InstanceControlPlaneAppRouteValues,
): AppInstallRoute {
  return {
    enabled: values.enabled,
    id,
    path: values.path,
    ...(values.prefix === undefined ? {} : { prefix: values.prefix }),
    routeKind: values.routeKind,
  };
}

function compareAppInstallRoutes(left: AppInstallRoute, right: AppInstallRoute) {
  const kindOrder =
    appInstallRouteKindOrder(left.routeKind) - appInstallRouteKindOrder(right.routeKind);

  return kindOrder === 0 ? left.path.localeCompare(right.path) : kindOrder;
}

function appInstallRouteKindOrder(kind: InstanceControlPlaneAppRouteKind) {
  switch (kind) {
    case "admin":
      return 0;
    case "schema":
      return 1;
    case "publicSite":
      return 2;
  }
}

function enabledRoutePath(
  routes: readonly AppInstallRoute[],
  routeKind: AppInstallRoute["routeKind"],
): `/${string}` | undefined {
  return enabledAppInstallRoute(routes, routeKind)?.path;
}

function enabledAppInstallRoute(
  routes: readonly AppInstallRoute[],
  routeKind: AppInstallRoute["routeKind"],
): AppInstallRoute | undefined {
  return routes.find((route) => route.enabled && route.routeKind === routeKind);
}

function parseInternalDeploymentProjectionRequest(value: unknown): {
  now: string;
  resources: DeploymentResource[];
  sourceFingerprint: string;
  target: DeploymentTarget;
} {
  if (!isRecord(value)) {
    throw new BadRequestError("Deployment projection request must be an object.");
  }

  const target = parseDeploymentTarget(value.target);
  const resources = parseDeploymentResources(value.resources);
  const sourceFingerprint = parseRequiredString("sourceFingerprint", value.sourceFingerprint);
  const now = typeof value.now === "string" && value.now.trim() !== "" ? value.now : nowIsoString();

  return { now, resources, sourceFingerprint, target };
}

function parseInternalDeploymentAttemptRecordRequest(value: unknown): {
  attempt: DeploymentAttempt;
  target: DeploymentTarget;
} {
  if (!isRecord(value)) {
    throw new BadRequestError("Deployment attempt record request must be an object.");
  }

  return {
    attempt: parseDeploymentAttempt(value.attempt),
    target: parseDeploymentTarget(value.target),
  };
}

function parseInternalDeploymentEvidenceRecordRequest(value: unknown): {
  attempt: DeploymentAttempt;
  evidence: DeploymentResourceEvidenceSummary[];
  now: string;
  target: DeploymentTarget;
} {
  if (!isRecord(value)) {
    throw new BadRequestError("Deployment evidence record request must be an object.");
  }

  const now = typeof value.now === "string" && value.now.trim() !== "" ? value.now : nowIsoString();

  return {
    attempt: parseDeploymentAttempt(value.attempt),
    evidence: parseDeploymentEvidence(value.evidence),
    now,
    target: parseDeploymentTarget(value.target),
  };
}

function parseInternalDeploymentDriftRecordRequest(value: unknown): {
  now: string;
  report: DeploymentDriftReport;
  target: DeploymentTarget;
} {
  if (!isRecord(value)) {
    throw new BadRequestError("Deployment drift record request must be an object.");
  }

  const now = typeof value.now === "string" && value.now.trim() !== "" ? value.now : nowIsoString();

  return {
    now,
    report: parseDeploymentDriftReport(value.report),
    target: parseDeploymentTarget(value.target),
  };
}

function parseDeploymentTarget(value: unknown): DeploymentTarget {
  if (!isRecord(value)) {
    throw new BadRequestError("Deployment target must be an object.");
  }

  const targetId = parseRequiredString("target.targetId", value.targetId);
  const kind = parseRequiredString("target.kind", value.kind);

  if (kind !== "instance") {
    throw new BadRequestError(`Deployment target kind "${kind}" is unsupported.`);
  }

  return {
    targetId,
    kind,
    ...(typeof value.label === "string" && value.label.trim() !== "" ? { label: value.label } : {}),
  };
}

function parseDeploymentResources(value: unknown): DeploymentResource[] {
  if (!Array.isArray(value)) {
    throw new BadRequestError("Deployment resources must be an array.");
  }

  return value.map(parseDeploymentResource);
}

function parseDeploymentResource(value: unknown): DeploymentResource {
  if (!isRecord(value)) {
    throw new BadRequestError("Deployment resource must be an object.");
  }

  const dependencies = Array.isArray(value.dependencies)
    ? value.dependencies.map((dependency) => {
        if (!isRecord(dependency)) {
          throw new BadRequestError("Deployment resource dependency must be an object.");
        }

        return {
          logicalId: parseRequiredString("dependency.logicalId", dependency.logicalId),
          ...(typeof dependency.reason === "string" && dependency.reason.trim() !== ""
            ? { reason: dependency.reason }
            : {}),
        };
      })
    : [];
  const inputs = isRecord(value.inputs)
    ? (value.inputs as Record<string, DeploymentJsonValue>)
    : {};

  return {
    dependencies,
    inputs,
    kind: parseRequiredString("resource.kind", value.kind) as DeploymentResource["kind"],
    logicalId: parseRequiredString("resource.logicalId", value.logicalId),
    providerFamily: parseRequiredString(
      "resource.providerFamily",
      value.providerFamily,
    ) as DeploymentResource["providerFamily"],
    targetId: parseRequiredString("resource.targetId", value.targetId),
  };
}

function parseDeploymentAttempt(value: unknown): DeploymentAttempt {
  if (!isRecord(value) || !isRecord(value.actor)) {
    throw new BadRequestError("Deployment attempt must be an object.");
  }

  return {
    actor: {
      actorId: parseRequiredString("attempt.actor.actorId", value.actor.actorId),
      kind: parseRequiredString(
        "attempt.actor.kind",
        value.actor.kind,
      ) as DeploymentAttempt["actor"]["kind"],
      ...(typeof value.actor.displayName === "string" && value.actor.displayName.trim() !== ""
        ? { displayName: value.actor.displayName }
        : {}),
      ...(typeof value.actor.runnerId === "string" && value.actor.runnerId.trim() !== ""
        ? { runnerId: value.actor.runnerId }
        : {}),
    },
    attemptId: parseRequiredString("attempt.attemptId", value.attemptId),
    ...(typeof value.completedAt === "string" && value.completedAt.trim() !== ""
      ? { completedAt: value.completedAt }
      : {}),
    hash: parseRequiredString("attempt.hash", value.hash),
    idempotencyKey: parseRequiredString("attempt.idempotencyKey", value.idempotencyKey),
    ...(typeof value.leaseId === "string" && value.leaseId.trim() !== ""
      ? { leaseId: value.leaseId }
      : {}),
    mode: parseRequiredString("attempt.mode", value.mode) as DeploymentAttempt["mode"],
    revision: numberRecordValue(value.revision, "attempt.revision"),
    ...(typeof value.runnerId === "string" && value.runnerId.trim() !== ""
      ? { runnerId: value.runnerId }
      : {}),
    startedAt: parseRequiredString("attempt.startedAt", value.startedAt),
    status: parseRequiredString("attempt.status", value.status) as DeploymentAttempt["status"],
    targetId: parseRequiredString("attempt.targetId", value.targetId),
    updatedAt: parseRequiredString("attempt.updatedAt", value.updatedAt),
    versionId: parseRequiredString("attempt.versionId", value.versionId),
  };
}

function parseDeploymentEvidence(value: unknown): DeploymentResourceEvidenceSummary[] {
  if (!Array.isArray(value)) {
    throw new BadRequestError("Deployment evidence must be an array.");
  }

  return value.map((entry) => {
    if (!isRecord(entry)) {
      throw new BadRequestError("Deployment evidence entry must be an object.");
    }

    return {
      action: parseRequiredString(
        "evidence.action",
        entry.action,
      ) as DeploymentResourceEvidenceSummary["action"],
      ...(typeof entry.alchemyResourceId === "string" && entry.alchemyResourceId.trim() !== ""
        ? { alchemyResourceId: entry.alchemyResourceId }
        : {}),
      ...(typeof entry.displayName === "string" && entry.displayName.trim() !== ""
        ? { displayName: entry.displayName }
        : {}),
      kind: parseRequiredString(
        "evidence.kind",
        entry.kind,
      ) as DeploymentResourceEvidenceSummary["kind"],
      logicalId: parseRequiredString("evidence.logicalId", entry.logicalId),
      providerFamily: parseRequiredString(
        "evidence.providerFamily",
        entry.providerFamily,
      ) as DeploymentResourceEvidenceSummary["providerFamily"],
      providerResourceIds: stringArrayRecordValue(
        entry.providerResourceIds,
        "evidence.providerResourceIds",
      ),
      targetId: parseRequiredString("evidence.targetId", entry.targetId),
    };
  });
}

function parseDeploymentDriftReport(value: unknown): DeploymentDriftReport {
  if (!isRecord(value) || !isRecord(value.actor) || !isRecord(value.summary)) {
    throw new BadRequestError("Deployment drift report must be an object.");
  }

  return {
    actor: {
      actorId: parseRequiredString("drift.actor.actorId", value.actor.actorId),
      kind: parseRequiredString(
        "drift.actor.kind",
        value.actor.kind,
      ) as DeploymentDriftReport["actor"]["kind"],
      ...(typeof value.actor.displayName === "string" && value.actor.displayName.trim() !== ""
        ? { displayName: value.actor.displayName }
        : {}),
      ...(typeof value.actor.runnerId === "string" && value.actor.runnerId.trim() !== ""
        ? { runnerId: value.actor.runnerId }
        : {}),
    },
    hash: parseRequiredString("drift.hash", value.hash),
    reportedAt: parseRequiredString("drift.reportedAt", value.reportedAt),
    reportId: parseRequiredString("drift.reportId", value.reportId),
    revision: numberRecordValue(value.revision, "drift.revision"),
    status: parseRequiredString("drift.status", value.status) as DeploymentDriftReport["status"],
    summary: {
      affectedLogicalIds: stringArrayRecordValue(
        value.summary.affectedLogicalIds,
        "drift.summary.affectedLogicalIds",
      ),
      create: numberRecordValue(value.summary.create, "drift.summary.create"),
      delete: numberRecordValue(value.summary.delete, "drift.summary.delete"),
      update: numberRecordValue(value.summary.update, "drift.summary.update"),
    },
    targetId: parseRequiredString("drift.targetId", value.targetId),
    versionId: parseRequiredString("drift.versionId", value.versionId),
  };
}

function parseInternalBackfillAppInstalls(value: unknown): AppInstall[] {
  if (!isRecord(value) || !Array.isArray(value.installs)) {
    throw new BadRequestError("Backfill app install request must include installs.");
  }

  return value.installs.map(parseInternalBackfillAppInstall);
}

function parseInternalDomainIntentSyncRequest(value: unknown): {
  mappings?: InstanceDomainMapping[];
  now: string;
  redirectIntents?: InstanceDomainProviderRedirectIntent[];
} {
  if (!isRecord(value)) {
    throw new BadRequestError("Domain intent sync request must be an object.");
  }

  if (value.mappings === undefined && value.redirectIntents === undefined) {
    throw new BadRequestError("Domain intent sync request must include mappings or redirects.");
  }

  const now = typeof value.now === "string" && value.now.trim() !== "" ? value.now : nowIsoString();

  return {
    ...(value.mappings === undefined
      ? {}
      : { mappings: parseInternalDomainMappings(value.mappings) }),
    now,
    ...(value.redirectIntents === undefined
      ? {}
      : { redirectIntents: parseInternalRedirectIntents(value.redirectIntents) }),
  };
}

function parseInternalBackfillAppInstall(value: unknown): AppInstall {
  if (!isRecord(value)) {
    throw new BadRequestError("Backfill app install must be an object.");
  }

  const packageAppKey = parseRequiredString("packageAppKey", value.packageAppKey);
  const packageApp = findBundledAppPackage(packageAppKey);

  if (!packageApp) {
    throw new BadRequestError(`Backfill app install package "${packageAppKey}" is unsupported.`);
  }

  return {
    installId: parseRequiredString("installId", value.installId),
    packageAppKey: packageApp.packageAppKey,
    label: parseRequiredString("label", value.label),
    status: "installed",
    createdAt: parseRequiredString("createdAt", value.createdAt),
    updatedAt: parseRequiredString("updatedAt", value.updatedAt),
    adminRoute: parseRouteString("adminRoute", value.adminRoute),
    schemaRoute: parseRouteString("schemaRoute", value.schemaRoute),
    ...(typeof value.publicRoute === "string"
      ? { publicRoute: parseRouteString("publicRoute", value.publicRoute) }
      : {}),
    ...(typeof value.publicRoutePrefix === "string"
      ? { publicRoutePrefix: parseRoutePrefixString("publicRoutePrefix", value.publicRoutePrefix) }
      : {}),
  };
}

function parseInternalDomainMappings(value: unknown): InstanceDomainMapping[] {
  if (!Array.isArray(value)) {
    throw new BadRequestError("Domain intent sync mappings must be an array.");
  }

  return value.map(parseInternalDomainMapping);
}

function parseInternalDomainMapping(value: unknown): InstanceDomainMapping {
  if (!isRecord(value)) {
    throw new BadRequestError("Domain intent sync mapping must be an object.");
  }

  const targetInstallId =
    optionalStringRecordValue(value.targetInstallId) ?? optionalStringRecordValue(value.installId);
  const profile = parseDomainMappingProfile(value.profile);

  return {
    host: parseRequiredString("mapping.host", value.host),
    profile,
    ...(profile === "publicSite" ? { surface: "site" as const } : {}),
    ...(targetInstallId === undefined ? {} : { installId: targetInstallId, targetInstallId }),
    enabled: booleanRecordValue(value.enabled, "mapping.enabled"),
    createdAt: parseRequiredString("mapping.createdAt", value.createdAt),
    updatedAt: parseRequiredString("mapping.updatedAt", value.updatedAt),
  };
}

function parseInternalRedirectIntents(value: unknown): InstanceDomainProviderRedirectIntent[] {
  if (!Array.isArray(value)) {
    throw new BadRequestError("Domain intent sync redirect intents must be an array.");
  }

  return value.map(parseInternalRedirectIntent);
}

function parseInternalRedirectIntent(value: unknown): InstanceDomainProviderRedirectIntent {
  if (!isRecord(value)) {
    throw new BadRequestError("Domain intent sync redirect intent must be an object.");
  }

  return {
    fromHost: parseRequiredString("redirect.fromHost", value.fromHost),
    ...(typeof value.toHost === "string" && value.toHost.trim() !== ""
      ? { toHost: value.toHost }
      : {}),
    ...(typeof value.toUrl === "string" && value.toUrl.trim() !== "" ? { toUrl: value.toUrl } : {}),
    statusCode: parseRedirectStatusCode(value.statusCode),
    preservePath: booleanRecordValue(value.preservePath, "redirect.preservePath"),
    preserveQueryString: booleanRecordValue(
      value.preserveQueryString,
      "redirect.preserveQueryString",
    ),
    enabled: booleanRecordValue(value.enabled, "redirect.enabled"),
    createdAt: parseRequiredString("redirect.createdAt", value.createdAt),
    updatedAt: parseRequiredString("redirect.updatedAt", value.updatedAt),
  };
}

function parseRequiredString(field: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError(`Field "${field}" must be a non-empty string.`);
  }

  return value;
}

function optionalStringRecordValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function booleanRecordValue(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new BadRequestError(`Field "${field}" must be a boolean.`);
  }

  return value;
}

function numberRecordValue(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new BadRequestError(`Field "${field}" must be a non-negative integer.`);
  }

  return value;
}

function stringArrayRecordValue(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new BadRequestError(`Field "${field}" must be a string array.`);
  }

  return value;
}

function stringRecordValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseRouteString(field: string, value: unknown): `/${string}` {
  const route = parseRequiredString(field, value);

  if (!route.startsWith("/")) {
    throw new BadRequestError(`Field "${field}" must be a route path.`);
  }

  return route as `/${string}`;
}

function parseRoutePrefixString(field: string, value: unknown): `/${string}/` {
  const route = parseRouteString(field, value);

  if (!route.endsWith("/")) {
    throw new BadRequestError(`Field "${field}" must be a route prefix.`);
  }

  return route as `/${string}/`;
}

function parseDomainMappingProfile(value: unknown): InstanceDomainMappingProfile {
  if (value === "app" || value === "instance" || value === "publicSite") {
    return value;
  }

  throw new BadRequestError('Field "mapping.profile" must be "app", "instance", or "publicSite".');
}

function parseRedirectStatusCode(
  value: unknown,
): InstanceDomainProviderRedirectIntent["statusCode"] {
  if (value === 301 || value === 302 || value === 303 || value === 307 || value === 308) {
    return value;
  }

  throw new BadRequestError('Field "redirect.statusCode" must be 301, 302, 303, 307, or 308.');
}

function domainMappingRecordId(mapping: Pick<InstanceDomainMapping, "host" | "profile">) {
  return `domain-mapping:${mapping.profile}:${mapping.host}`;
}

function redirectIntentRecordId(fromHost: string) {
  return `redirect-intent:${fromHost}`;
}

function domainMappingAppRouteIdForProfile(
  profile: InstanceDomainMappingProfile,
  installId: AppInstallId,
): string | undefined {
  switch (profile) {
    case "app":
      return instanceControlPlaneAppRouteId(installId, "admin");
    case "publicSite":
      return instanceControlPlaneAppRouteId(installId, "publicSite");
    case "instance":
      return undefined;
  }
}

function activeControlPlaneRecordExists(
  storage: DurableObjectStorage,
  entity: string,
  id: string,
): boolean {
  const record = getStoredRecord(storage, id);

  return record?.entity === entity && !record.deletedAt;
}

function deploymentDesiredResourceRecordId(targetId: string, logicalId: string) {
  return `deploy-resource:${targetId}:${logicalId}`;
}

function deploymentEvidenceRecordId(attemptId: string, logicalId: string) {
  return `deploy-evidence:${attemptId}:${logicalId}`;
}

function controlPlaneDeploymentActorKind(kind: string) {
  switch (kind) {
    case "runner":
      return "runner";
    case "cli":
    case "ci":
      return "cliDeployer";
    case "system":
      return "system";
    default:
      return "runner";
  }
}

function recordValuesEqual(left: RecordValues, right: RecordValues) {
  const leftEntries = Object.entries(left);
  const rightKeys = new Set(Object.keys(right));

  return (
    leftEntries.length === rightKeys.size &&
    leftEntries.every(
      ([fieldName, fieldValue]) => rightKeys.has(fieldName) && right[fieldName] === fieldValue,
    )
  );
}

function recordValuesHash(values: RecordValues) {
  const stable = JSON.stringify(
    Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right))),
  );
  let hash = 2166136261;

  for (let index = 0; index < stable.length; index += 1) {
    hash ^= stable.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isInternalControlPlanePath(path: string) {
  return path.startsWith("/_internal/");
}

function controlPlaneActorKindFromRequest(request: Request, url: URL): SchemaActionActorKind {
  const value =
    request.headers.get("X-Formless-Control-Plane-Actor") ??
    request.headers.get("X-Formless-Actor-Kind") ??
    url.searchParams.get("actorKind") ??
    "owner";

  if (actorKinds.includes(value as SchemaActionActorKind)) {
    return value as SchemaActionActorKind;
  }

  throw new BadRequestError(`Unsupported control-plane actor "${value}".`);
}

function assertBrowserControlPlaneWriteActor(
  actorKind: SchemaActionActorKind,
  operation: AuthorityOperation,
) {
  if (actorKind === "owner" || actorKind === "admin") {
    return;
  }

  throw new BadRequestError(
    `Control-plane ${operation.kind} writes are not exposed to actor "${actorKind}".`,
  );
}

function assertBrowserControlPlaneActionActor(actorKind: SchemaActionActorKind, action: string) {
  if (actorKind === "owner" || actorKind === "admin") {
    return;
  }

  throw new BadRequestError(`Action "${action}" is not exposed to actor "${actorKind}".`);
}

function redirectControlPlaneActionRoute(request: Request, action: string) {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  return Response.redirect(
    new URL(`${INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX}/actions/${action}`, request.url),
    308,
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

function methodNotAllowedResponse(allow: string): Response {
  return jsonResponse({ error: "Method not allowed." }, 405, { Allow: allow });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
