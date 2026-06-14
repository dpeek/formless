import { buildSitePageTree } from "../site/tree.ts";
import {
  FORMLESS_CLIENT_PACKAGE_REVISION_HEADER,
  FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER,
  FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER,
  FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER,
  type BrowserReplicaUpgradeFacts,
  type BootstrapResponse,
  type SchemaResponse,
  type SchemaUpdateResponse,
  type SitePageTreeResponse,
  type StoreSnapshot,
  type SyncResponse,
} from "../shared/protocol.ts";
import type {
  OperationInvocationEnvelope,
  OperationInvocationResponse,
} from "../shared/operation-invocation.ts";
import type {
  AppStorageIdentity,
  InstanceControlPlaneStorageIdentity,
} from "../shared/app-storage-identity.ts";
import type { PackageAppKey } from "../shared/app-installs.ts";
import { findResolvedAppPackage, type AppPackageResolver } from "../shared/app-packages.ts";
import { FORMLESS_RUNTIME_PROTOCOL_VERSION } from "../shared/deploy-metadata.ts";
import type { AppSchema, SchemaActionActorKind } from "@dpeek/formless-schema";
import {
  isSourceSchemaHash,
  type PackageAppRevision,
  type SourceSchemaHash,
} from "../shared/upgrade-migrations.ts";
import {
  assertOperationInvocationAuthorized,
  buildProtocolOperationInvocationEnvelope,
  executeReadOperationInvocation,
  executeWriteOperationInvocation,
  parseEntityOperationRoute,
} from "./entity-operations.ts";
import {
  validateSchemaUpdateRequest,
  validateSourceSchemaReset,
  validateStoreSnapshotRestore,
} from "./authority-validation.ts";
import { BadRequestError, ReloadRequiredError } from "./errors.ts";
import type { WorkerSchemaAppDefinition } from "./schema-apps.ts";
import { PUBLIC_SITE_TREE_CACHE_CONTROL } from "./site-cache.ts";
import {
  exportStorageSnapshot,
  getBootstrapRecords,
  getChangesAfter,
  getCurrentCursor,
  initializeStorageFromSource,
  mapWriteOutcome,
  applyPackageAppMigrationsOutcome,
  resetStorageSchemaToSourceOutcome,
  resetStorageToSourceSeedOutcome,
  restoreStorageSnapshotOutcome,
  readCurrentStoredSchema,
  readPackageAppMigrationState,
  recordOperationInvocationAccepted,
  recordOperationInvocationFailed,
  recordOperationInvocationRejected,
  type RecordConstraintValidator,
  type ApplyPackageAppMigrationsResponse,
  type StorageSource,
  type WriteOutcome,
  writeActiveSchemaOutcome,
} from "./storage.ts";
import {
  packageAppMigrationRegistry,
  selectPackageAppMigrationChain,
} from "./package-app-migrations.ts";

export type AuthorityOperationMode = "read" | "write";

export type AuthorityOperationKind =
  | "bootstrap"
  | "readSchema"
  | "exportSnapshot"
  | "siteTree"
  | "sync"
  | "writeSchema"
  | "restoreSnapshot"
  | "entityOperation"
  | "resetSchema"
  | "resetSeed"
  | "applyPackageMigrations";

export type AuthorityOperationMetadata = {
  kind: AuthorityOperationKind;
  method: string;
  mode: AuthorityOperationMode;
  path: string;
};

type AuthorityOperationMetadataFor<
  Kind extends AuthorityOperationKind,
  Mode extends AuthorityOperationMode,
> = AuthorityOperationMetadata & {
  kind: Kind;
  mode: Mode;
};

type ReadOperation<Kind extends AuthorityOperationKind> = {
  kind: Kind;
  metadata: AuthorityOperationMetadataFor<Kind, "read">;
};

type WriteOperation<Kind extends AuthorityOperationKind> = {
  kind: Kind;
  metadata: AuthorityOperationMetadataFor<Kind, "write">;
};

export type ReadAuthorityOperation =
  | ReadOperation<"bootstrap">
  | ReadOperation<"readSchema">
  | ReadOperation<"exportSnapshot">
  | ReadOperation<"siteTree">
  | (ReadOperation<"entityOperation"> & EntityOperationRoute)
  | (ReadOperation<"sync"> & {
      after: number;
      clientSchemaUpdatedAt: string | null;
    });

export type WriteAuthorityOperation =
  | WriteOperation<"writeSchema">
  | WriteOperation<"restoreSnapshot">
  | (WriteOperation<"entityOperation"> & EntityOperationRoute)
  | WriteOperation<"resetSchema">
  | WriteOperation<"resetSeed">
  | WriteOperation<"applyPackageMigrations">;

export type AuthorityOperation = ReadAuthorityOperation | WriteAuthorityOperation;

export type AuthorityWriteNotifier = {
  apply<T>(write: () => WriteOutcome<T>): WriteOutcome<T>;
};

type AuthorityErrorResponse = {
  error: string;
};

export type AuthorityOperationResponseBody =
  | ApplyPackageAppMigrationsResponse
  | AuthorityErrorResponse
  | BootstrapResponse
  | OperationInvocationResponse
  | SchemaResponse
  | SchemaUpdateResponse
  | SitePageTreeResponse
  | StoreSnapshot
  | SyncResponse;

export type AuthorityOperationResult = {
  body: AuthorityOperationResponseBody;
  headers?: HeadersInit;
  status?: number;
};

type AuthorityOperationSelectionInput = {
  method: string;
  path: string;
  searchParams: URLSearchParams;
};

type EntityOperationRoute = {
  entityName: string;
  operationName: string;
  recordId?: string;
};

type AuthorityOperationExecutionInput = {
  actorKind?: SchemaActionActorKind;
  app: WorkerSchemaAppDefinition;
  body?: unknown;
  identity: AppStorageIdentity | InstanceControlPlaneStorageIdentity;
  operation: AuthorityOperation;
  packageResolver?: AppPackageResolver;
  requestHeaders?: Headers;
  source: StorageSource;
  storage: DurableObjectStorage;
  turnstileSiteKey?: string;
  validateConstraints?: RecordConstraintValidator;
  writes: AuthorityWriteNotifier;
};

export function selectAuthorityOperation(
  input: AuthorityOperationSelectionInput,
): AuthorityOperation | undefined {
  const metadata = <Kind extends AuthorityOperationKind, Mode extends AuthorityOperationMode>(
    kind: Kind,
    mode: Mode,
  ) => operationMetadata(kind, input.method, mode, input.path);

  if (input.method === "GET" && input.path === "/bootstrap") {
    return { kind: "bootstrap", metadata: metadata("bootstrap", "read") };
  }

  if (input.method === "GET" && input.path === "/schema") {
    return { kind: "readSchema", metadata: metadata("readSchema", "read") };
  }

  if (input.method === "GET" && input.path === "/snapshot") {
    return { kind: "exportSnapshot", metadata: metadata("exportSnapshot", "read") };
  }

  if (input.method === "GET" && isSiteTreePath(input.path)) {
    return { kind: "siteTree", metadata: metadata("siteTree", "read") };
  }

  if (input.method === "GET" && input.path === "/sync") {
    return {
      after: parseCursor(input.searchParams.get("after")),
      clientSchemaUpdatedAt: input.searchParams.get("schemaUpdatedAt"),
      kind: "sync",
      metadata: metadata("sync", "read"),
    };
  }

  if (input.method === "POST" && input.path === "/schema") {
    return { kind: "writeSchema", metadata: metadata("writeSchema", "write") };
  }

  if (input.method === "POST" && input.path === "/snapshot/restore") {
    return { kind: "restoreSnapshot", metadata: metadata("restoreSnapshot", "write") };
  }

  const entityOperationRoute = parseEntityOperationRoute(input);
  if (entityOperationRoute) {
    if (input.method === "GET") {
      return {
        kind: "entityOperation",
        metadata: metadata("entityOperation", "read"),
        ...entityOperationRoute,
      };
    }

    return {
      kind: "entityOperation",
      metadata: metadata("entityOperation", "write"),
      ...entityOperationRoute,
    };
  }

  if (input.method === "POST" && input.path === "/reset/schema") {
    return { kind: "resetSchema", metadata: metadata("resetSchema", "write") };
  }

  if (input.method === "POST" && input.path === "/reset/seed") {
    return { kind: "resetSeed", metadata: metadata("resetSeed", "write") };
  }

  if (input.method === "POST" && input.path === "/package-migrations/apply") {
    return {
      kind: "applyPackageMigrations",
      metadata: metadata("applyPackageMigrations", "write"),
    };
  }

  return undefined;
}

export function executeAuthorityOperation(
  input: AuthorityOperationExecutionInput,
): AuthorityOperationResult {
  const operation = input.operation;

  switch (operation.kind) {
    case "bootstrap": {
      const { schema, updatedAt } = initializeStorageFromSource(input.storage, input.source);

      return {
        body: bootstrapResponse(input.storage, schema, updatedAt),
        headers: browserReplicaUpgradeHeaders(input.storage, input.identity, input.packageResolver),
      };
    }

    case "readSchema": {
      const { schema, updatedAt } = initializeStorageFromSource(input.storage, input.source);

      return {
        body: { schema, updatedAt },
      };
    }

    case "exportSnapshot": {
      initializeStorageFromSource(input.storage, input.source);

      return {
        body: exportStorageSnapshot(input.storage, input.app.key),
      };
    }

    case "siteTree": {
      if (input.app.key !== "site") {
        throw new BadRequestError("Site page trees are only available for the site schema.");
      }

      if (input.identity.kind === "instanceControlPlane") {
        throw new BadRequestError("Site page trees are only available for app storage.");
      }

      const slug = parseSiteTreeSlug(operation.metadata.path);
      const { schema } = initializeStorageFromSource(input.storage, input.source);
      const projection = buildSitePageTree(schema, getBootstrapRecords(input.storage), slug, {
        target: input.identity,
        turnstileSiteKey: input.turnstileSiteKey,
      });

      if (!projection.tree) {
        return {
          body: { error: "Site page not found." },
          headers: { "Cache-Control": PUBLIC_SITE_TREE_CACHE_CONTROL },
          status: 404,
        };
      }

      const response: SitePageTreeResponse = projection.tree;

      return {
        body: response,
        headers: { "Cache-Control": PUBLIC_SITE_TREE_CACHE_CONTROL },
      };
    }

    case "sync": {
      const { schema, updatedAt } = initializeStorageFromSource(input.storage, input.source);
      const changes = getChangesAfter(input.storage, operation.after);
      const schemaFields =
        operation.clientSchemaUpdatedAt === updatedAt ? {} : { schema, schemaUpdatedAt: updatedAt };

      return {
        body: {
          changes,
          cursor: getCurrentCursor(input.storage),
          ...schemaFields,
        },
        headers: browserReplicaUpgradeHeaders(input.storage, input.identity, input.packageResolver),
      };
    }

    case "writeSchema": {
      const currentSchema = initializeStorageFromSource(input.storage, input.source).schema;
      const records = getBootstrapRecords(input.storage);
      const nextSchema = validateSchemaUpdateRequest(input.body, currentSchema, records);

      return writeOperationResult(
        input.writes.apply(() => writeActiveSchemaOutcome(input.storage, nextSchema)),
      );
    }

    case "restoreSnapshot": {
      const snapshot = validateStoreSnapshotRestore(input.body, input.app.key);

      return writeOperationResult(
        input.writes.apply(() => restoreStorageSnapshotOutcome(input.storage, snapshot)),
      );
    }

    case "entityOperation": {
      const { schema } = initializeStorageFromSource(input.storage, input.source);
      const envelope = buildProtocolOperationInvocationEnvelope({
        actorKind: input.actorKind,
        body: input.body,
        identity: input.identity,
        method: operation.metadata.method,
        path: operation.metadata.path,
        route: {
          entityName: operation.entityName,
          operationName: operation.operationName,
          ...(operation.recordId === undefined ? {} : { recordId: operation.recordId }),
        },
        schema,
      });

      assertOperationInvocationAllowed(input.storage, envelope);

      if (envelope.operation.kind === "list" || envelope.operation.kind === "get") {
        return {
          body: executeReadOperationInvocation({
            envelope,
            schema,
            storage: input.storage,
          }),
        };
      }

      assertBrowserReplicaWriteCompatibleForOperation(input, envelope);

      return {
        body: executeWriteOperationInvocation({
          envelope,
          packageResolver: input.packageResolver,
          schema,
          storage: input.storage,
          validateConstraints: input.validateConstraints,
          writes: input.writes,
        }),
      };
    }

    case "resetSchema": {
      return writeOperationResult(
        input.writes.apply(() =>
          mapWriteOutcome(
            resetStorageSchemaToSourceOutcome(
              input.storage,
              input.source,
              validateSourceSchemaReset,
            ),
            ({ schema, updatedAt }) => bootstrapResponse(input.storage, schema, updatedAt),
          ),
        ),
      );
    }

    case "resetSeed": {
      return writeOperationResult(
        input.writes.apply(() =>
          mapWriteOutcome(
            resetStorageToSourceSeedOutcome(input.storage, input.source),
            ({ schema, updatedAt }) => bootstrapResponse(input.storage, schema, updatedAt),
          ),
        ),
      );
    }

    case "applyPackageMigrations": {
      initializeStorageFromSource(input.storage, input.source);

      const packageFacts = parsePackageAppMigrationApplyRequest(
        input.body,
        input.app.key,
        input.packageResolver,
      );
      const migrations = selectPackageAppMigrations({
        currentPackageRevision: packageFacts.currentPackageRevision,
        packageAppKey: packageFacts.packageAppKey,
        safety: packageFacts.safety,
        targetPackageRevision: packageFacts.targetPackageRevision,
      });

      return writeOperationResult(
        input.writes.apply(() =>
          applyPackageAppMigrationsOutcome(input.storage, {
            currentPackageRevision: packageFacts.currentPackageRevision,
            currentSourceSchemaHash: packageFacts.currentSourceSchemaHash,
            migrations,
            packageAppKey: packageFacts.packageAppKey,
            targetPackageRevision: packageFacts.targetPackageRevision,
            targetSourceSchemaHash: packageFacts.targetSourceSchemaHash,
          }),
        ),
      );
    }
  }
}

function writeOperationResult<T extends AuthorityOperationResponseBody>(
  outcome: WriteOutcome<T>,
): AuthorityOperationResult {
  return { body: outcome.response };
}

function assertOperationInvocationAllowed(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
) {
  try {
    assertOperationInvocationAuthorized(envelope);
  } catch (error) {
    recordOperationInvocationRejected(storage, envelope, error);
    throw error;
  }
}

function assertBrowserReplicaWriteCompatibleForOperation(
  input: AuthorityOperationExecutionInput,
  envelope: OperationInvocationEnvelope,
) {
  try {
    assertBrowserReplicaWriteCompatible(input);
  } catch (error) {
    recordOperationInvocationAccepted(input.storage, envelope);
    recordOperationInvocationFailed(input.storage, envelope, error);
    throw error;
  }
}

function assertBrowserReplicaWriteCompatible(input: AuthorityOperationExecutionInput) {
  const clientFacts = parseBrowserReplicaWriteFacts(input.requestHeaders);

  if (!clientFacts.hasAnyFact) {
    return;
  }

  const upgrade = browserReplicaUpgradeFacts(input.storage, input.identity, input.packageResolver);

  if (
    clientFacts.runtimeProtocolVersion !== undefined &&
    clientFacts.runtimeProtocolVersion !== upgrade.runtimeProtocolVersion
  ) {
    throw reloadRequired("Browser runtime protocol changed. Reload required.", upgrade);
  }

  if (
    clientFacts.schemaUpdatedAt !== undefined &&
    clientFacts.schemaUpdatedAt !== upgrade.schemaUpdatedAt
  ) {
    throw reloadRequired("App schema changed. Reload required.", upgrade);
  }

  if (
    clientFacts.packageRevision !== undefined &&
    clientFacts.packageRevision !== upgrade.packageApp?.packageRevision
  ) {
    throw reloadRequired("Package app revision changed. Reload required.", upgrade);
  }

  if (
    clientFacts.sourceSchemaHash !== undefined &&
    clientFacts.sourceSchemaHash !== upgrade.packageApp?.sourceSchemaHash
  ) {
    throw reloadRequired("Package app source schema changed. Reload required.", upgrade);
  }
}

function reloadRequired(message: string, upgrade: BrowserReplicaUpgradeFacts) {
  return new ReloadRequiredError(message, upgrade);
}

function parseBrowserReplicaWriteFacts(headers: Headers | undefined) {
  const runtimeProtocolVersion = parseOptionalPositiveIntegerHeader(
    headers,
    FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER,
    "runtime protocol version",
  );
  const packageRevision = parseOptionalPositiveIntegerHeader(
    headers,
    FORMLESS_CLIENT_PACKAGE_REVISION_HEADER,
    "package app revision",
  );
  const schemaUpdatedAt = parseOptionalStringHeader(
    headers,
    FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER,
    "schema updated timestamp",
  );
  const sourceSchemaHash = parseOptionalSourceSchemaHashHeader(headers);

  return {
    hasAnyFact:
      runtimeProtocolVersion !== undefined ||
      packageRevision !== undefined ||
      schemaUpdatedAt !== undefined ||
      sourceSchemaHash !== undefined,
    packageRevision,
    runtimeProtocolVersion,
    schemaUpdatedAt,
    sourceSchemaHash,
  };
}

function parseOptionalPositiveIntegerHeader(
  headers: Headers | undefined,
  name: string,
  label: string,
) {
  const value = headers?.get(name);

  if (value === null || value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestError(`Browser replica ${label} header must be a positive integer.`);
  }

  return parsed;
}

function parseOptionalStringHeader(headers: Headers | undefined, name: string, label: string) {
  const value = headers?.get(name);

  if (value === null || value === undefined) {
    return undefined;
  }

  if (value.trim() === "") {
    throw new BadRequestError(`Browser replica ${label} header must be non-empty.`);
  }

  return value;
}

function parseOptionalSourceSchemaHashHeader(headers: Headers | undefined) {
  const value = headers?.get(FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER);

  if (value === null || value === undefined) {
    return undefined;
  }

  if (!isSourceSchemaHash(value)) {
    throw new BadRequestError(
      "Browser replica source schema hash header must be a sha256 source schema hash.",
    );
  }

  return value;
}

function browserReplicaUpgradeHeaders(
  storage: DurableObjectStorage,
  identity: AppStorageIdentity | InstanceControlPlaneStorageIdentity,
  packageResolver?: AppPackageResolver,
): HeadersInit {
  const facts = browserReplicaUpgradeFacts(storage, identity, packageResolver);
  const headers: Record<string, string> = {
    [FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER]: String(facts.runtimeProtocolVersion),
  };

  if (facts.schemaUpdatedAt !== null) {
    headers[FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER] = facts.schemaUpdatedAt;
  }

  if (facts.packageApp) {
    headers[FORMLESS_CLIENT_PACKAGE_REVISION_HEADER] = String(facts.packageApp.packageRevision);
    headers[FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER] = facts.packageApp.sourceSchemaHash;
  }

  return headers;
}

function browserReplicaUpgradeFacts(
  storage: DurableObjectStorage,
  identity: AppStorageIdentity | InstanceControlPlaneStorageIdentity,
  packageResolver?: AppPackageResolver,
): BrowserReplicaUpgradeFacts {
  const storedSchema = readCurrentStoredSchema(storage);

  if (identity.kind === "instanceControlPlane") {
    return {
      runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
      schemaUpdatedAt: storedSchema?.updatedAt ?? null,
      packageApp: null,
    };
  }

  const packageApp = findResolvedAppPackage(identity.packageAppKey, packageResolver);
  const packageState = readPackageAppMigrationState(storage, identity.packageAppKey);

  return {
    runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
    schemaUpdatedAt: storedSchema?.updatedAt ?? null,
    packageApp: packageApp
      ? {
          packageAppKey: packageApp.packageAppKey,
          packageRevision: packageState?.packageRevision ?? packageApp.packageRevision,
          sourceSchemaHash: packageState?.sourceSchemaHash ?? packageApp.sourceSchemaHash,
        }
      : null,
  };
}

function operationMetadata<
  Kind extends AuthorityOperationKind,
  Mode extends AuthorityOperationMode,
>(kind: Kind, method: string, mode: Mode, path: string): AuthorityOperationMetadataFor<Kind, Mode> {
  return {
    kind,
    method,
    mode,
    path,
  };
}

function bootstrapResponse(
  storage: DurableObjectStorage,
  schema: AppSchema,
  schemaUpdatedAt: string,
): BootstrapResponse {
  return {
    schema,
    schemaUpdatedAt,
    records: getBootstrapRecords(storage),
    cursor: getCurrentCursor(storage),
  };
}

function parsePackageAppMigrationApplyRequest(
  value: unknown,
  packageAppKey: string,
  packageResolver?: AppPackageResolver,
) {
  const packageApp = findResolvedAppPackage(packageAppKey, packageResolver);

  if (!packageApp) {
    throw new BadRequestError(`Package app "${packageAppKey}" is not installable.`);
  }

  const body = isRecord(value) ? value : {};

  return {
    packageAppKey: packageApp.packageAppKey,
    currentPackageRevision: parseOptionalPackageRevision(
      body.currentPackageRevision,
      packageApp.packageRevision,
      "currentPackageRevision",
    ),
    currentSourceSchemaHash: parseOptionalSourceSchemaHash(
      body.currentSourceSchemaHash,
      packageApp.sourceSchemaHash,
      "currentSourceSchemaHash",
    ),
    targetPackageRevision: packageApp.packageRevision,
    targetSourceSchemaHash: packageApp.sourceSchemaHash,
    safety: parseOptionalPackageMigrationSafety(body.safety),
  };
}

function selectPackageAppMigrations(input: {
  currentPackageRevision: PackageAppRevision;
  packageAppKey: PackageAppKey;
  safety?: "auto-safe";
  targetPackageRevision: PackageAppRevision;
}) {
  try {
    const migrations = selectPackageAppMigrationChain(packageAppMigrationRegistry, {
      fromPackageRevision: input.currentPackageRevision,
      packageAppKey: input.packageAppKey,
      toPackageRevision: input.targetPackageRevision,
    });

    if (input.safety === "auto-safe") {
      const unsafe = migrations.find((migration) => migration.safety !== "auto-safe");

      if (unsafe) {
        throw new Error(
          `Package app migration "${unsafe.id}" requires safety class "${unsafe.safety}".`,
        );
      }
    }

    return migrations;
  } catch (error) {
    throw new BadRequestError(
      error instanceof Error ? error.message : "Package app migration chain is invalid.",
    );
  }
}

function parseOptionalPackageRevision(
  value: unknown,
  fallback: PackageAppRevision,
  fieldName: string,
): PackageAppRevision {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new BadRequestError(`Package migration ${fieldName} must be a positive integer.`);
  }

  return value;
}

function parseOptionalSourceSchemaHash(
  value: unknown,
  fallback: SourceSchemaHash,
  fieldName: string,
): SourceSchemaHash {
  if (value === undefined) {
    return fallback;
  }

  if (!isSourceSchemaHash(value)) {
    throw new BadRequestError(
      `Package migration ${fieldName} must be a sha256 source schema hash.`,
    );
  }

  return value;
}

function parseOptionalPackageMigrationSafety(value: unknown): "auto-safe" | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "auto-safe") {
    throw new BadRequestError('Package migration safety must be "auto-safe".');
  }

  return value;
}

function parseCursor(value: string | null) {
  if (value === null) {
    return 0;
  }

  const cursor = Number(value);
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new BadRequestError("Sync cursor must be a non-negative integer.");
  }

  return cursor;
}

function isSiteTreePath(path: string): boolean {
  return path === "/tree" || path.startsWith("/tree/");
}

function parseSiteTreeSlug(path: string): string {
  if (!path.startsWith("/tree/")) {
    throw new BadRequestError("Site tree slug must be non-empty.");
  }

  try {
    const slug = decodeURIComponent(path.slice("/tree/".length)).trim();

    if (slug === "") {
      throw new BadRequestError("Site tree slug must be non-empty.");
    }

    return slug;
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new BadRequestError("Site tree slug must be valid URL path text.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
