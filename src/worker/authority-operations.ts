import { buildSitePageTree } from "../site/tree.ts";
import type {
  ActionResponse,
  BootstrapResponse,
  MutationResponse,
  SchemaResponse,
  SchemaUpdateResponse,
  SitePageTreeResponse,
  StoreSnapshot,
  SyncResponse,
} from "../shared/protocol.ts";
import type {
  AppStorageIdentity,
  InstanceControlPlaneStorageIdentity,
} from "../shared/app-storage-identity.ts";
import { findBundledAppPackage, type PackageAppKey } from "../shared/app-installs.ts";
import type { AppSchema, SchemaActionActorKind } from "../shared/schema.ts";
import {
  isSourceSchemaHash,
  type PackageAppRevision,
  type SourceSchemaHash,
} from "../shared/upgrade-migrations.ts";
import {
  executeCreateAfterCreateHooks,
  executeEntityActionOutcome,
  filterEntityActionResponseForActor,
  validateEntityActionRequest,
} from "./actions.ts";
import {
  validateMutationRequest,
  validateSchemaUpdateRequest,
  validateSourceSchemaReset,
  validateStoreSnapshotRestore,
} from "./authority-validation.ts";
import { assertUniqueConstraints } from "./constraints.ts";
import { BadRequestError } from "./errors.ts";
import type { WorkerSchemaAppDefinition } from "./schema-apps.ts";
import { PUBLIC_SITE_TREE_CACHE_CONTROL } from "./site-cache.ts";
import {
  createStoredRecordOutcome,
  deleteStoredRecordOutcome,
  exportStorageSnapshot,
  getBootstrapRecords,
  getChangesAfter,
  getCurrentCursor,
  initializeStorageFromSource,
  mapWriteOutcome,
  patchStoredRecordOutcome,
  applyPackageAppMigrationsOutcome,
  resetStorageSchemaToSourceOutcome,
  resetStorageToSourceSeedOutcome,
  restoreStorageSnapshotOutcome,
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
  | "mutation"
  | "action"
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
  | (ReadOperation<"sync"> & {
      after: number;
      clientSchemaUpdatedAt: string | null;
    });

export type WriteAuthorityOperation =
  | WriteOperation<"writeSchema">
  | WriteOperation<"restoreSnapshot">
  | WriteOperation<"mutation">
  | WriteOperation<"action">
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
  | ActionResponse
  | ApplyPackageAppMigrationsResponse
  | AuthorityErrorResponse
  | BootstrapResponse
  | MutationResponse
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

type AuthorityOperationExecutionInput = {
  actorKind?: SchemaActionActorKind;
  app: WorkerSchemaAppDefinition;
  body?: unknown;
  identity: AppStorageIdentity | InstanceControlPlaneStorageIdentity;
  operation: AuthorityOperation;
  source: StorageSource;
  storage: DurableObjectStorage;
  turnstileSiteKey?: string;
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

  if (input.method === "POST" && input.path === "/mutations") {
    return { kind: "mutation", metadata: metadata("mutation", "write") };
  }

  if (input.method === "POST" && input.path === "/actions") {
    return { kind: "action", metadata: metadata("action", "write") };
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

    case "mutation": {
      const { schema } = initializeStorageFromSource(input.storage, input.source);
      const validatedMutation = validateMutationRequest(input.body, schema, input.storage);

      if ("outcome" in validatedMutation) {
        return writeOperationResult(input.writes.apply(() => validatedMutation.outcome));
      }

      const mutation = validatedMutation.mutation;

      if (mutation.op === "create") {
        return writeOperationResult(
          input.writes.apply(() =>
            createStoredRecordOutcome(
              input.storage,
              mutation,
              (context) => {
                executeCreateAfterCreateHooks(
                  context.storage,
                  context.mutation,
                  schema,
                  context.createRecords,
                );
              },
              (entity, values, options) => {
                assertUniqueConstraints(input.storage, schema, entity, values, options);
              },
            ),
          ),
        );
      }

      if (mutation.op === "delete") {
        return writeOperationResult(
          input.writes.apply(() => deleteStoredRecordOutcome(input.storage, mutation)),
        );
      }

      return writeOperationResult(
        input.writes.apply(() =>
          patchStoredRecordOutcome(
            input.storage,
            mutation,
            "recordValues" in mutation ? mutation.recordValues : undefined,
            (entity, values, options) => {
              assertUniqueConstraints(input.storage, schema, entity, values, options);
            },
          ),
        ),
      );
    }

    case "action": {
      const { schema } = initializeStorageFromSource(input.storage, input.source);
      const actorKind = input.actorKind ?? "owner";
      const action = validateEntityActionRequest(input.body, schema, { actorKind });

      return writeOperationResult(
        mapWriteOutcome(
          input.writes.apply(() => executeEntityActionOutcome(input.storage, action, schema)),
          (response) => filterEntityActionResponseForActor(response, schema, action, actorKind),
        ),
      );
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

      const packageFacts = parsePackageAppMigrationApplyRequest(input.body, input.app.key);
      const migrations = selectPackageAppMigrations({
        currentPackageRevision: packageFacts.currentPackageRevision,
        packageAppKey: input.app.key,
        targetPackageRevision: packageFacts.targetPackageRevision,
      });

      return writeOperationResult(
        input.writes.apply(() =>
          applyPackageAppMigrationsOutcome(input.storage, {
            currentPackageRevision: packageFacts.currentPackageRevision,
            currentSourceSchemaHash: packageFacts.currentSourceSchemaHash,
            migrations,
            packageAppKey: input.app.key,
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

function parsePackageAppMigrationApplyRequest(value: unknown, packageAppKey: string) {
  const packageApp = findBundledAppPackage(packageAppKey);

  if (!packageApp) {
    throw new BadRequestError(`Package app "${packageAppKey}" is not installable.`);
  }

  const body = isRecord(value) ? value : {};

  return {
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
  };
}

function selectPackageAppMigrations(input: {
  currentPackageRevision: PackageAppRevision;
  packageAppKey: PackageAppKey;
  targetPackageRevision: PackageAppRevision;
}) {
  try {
    return selectPackageAppMigrationChain(packageAppMigrationRegistry, {
      fromPackageRevision: input.currentPackageRevision,
      packageAppKey: input.packageAppKey,
      toPackageRevision: input.targetPackageRevision,
    });
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
