import { buildSitePageTree } from "../site/tree.ts";
import type { SitePageTreeResponse } from "../shared/protocol.ts";
import type { AppSchema } from "../shared/schema.ts";
import {
  executeCreateAfterCreateHooks,
  executeEntityActionOutcome,
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
import {
  createStoredRecordOutcome,
  exportStorageSnapshot,
  getBootstrapRecords,
  getChangesAfter,
  getCurrentCursor,
  initializeStorageFromSource,
  mapWriteOutcome,
  patchStoredRecordOutcome,
  resetStorageSchemaToSourceOutcome,
  resetStorageToSourceSeedOutcome,
  restoreStorageSnapshotOutcome,
  type StorageSource,
  type WriteOutcome,
  writeActiveSchemaOutcome,
} from "./storage.ts";

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
  | "resetSeed";

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
  | WriteOperation<"resetSeed">;

export type AuthorityOperation = ReadAuthorityOperation | WriteAuthorityOperation;

export type AuthorityWriteNotifier = {
  apply<T>(write: () => WriteOutcome<T>): T;
};

export type AuthorityOperationResult = {
  body: unknown;
  status?: number;
};

type AuthorityOperationSelectionInput = {
  method: string;
  path: string;
  searchParams: URLSearchParams;
};

type AuthorityOperationExecutionInput = {
  app: WorkerSchemaAppDefinition;
  body?: unknown;
  operation: AuthorityOperation;
  source: StorageSource;
  storage: DurableObjectStorage;
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

      const slug = parseSiteTreeSlug(operation.metadata.path);
      const { schema } = initializeStorageFromSource(input.storage, input.source);
      const projection = buildSitePageTree(schema, getBootstrapRecords(input.storage), slug);

      if (!projection.tree) {
        return {
          body: { error: "Site page not found." },
          status: 404,
        };
      }

      const response: SitePageTreeResponse = projection.tree;

      return { body: response };
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
      const response = input.writes.apply(() =>
        writeActiveSchemaOutcome(input.storage, nextSchema),
      );

      return { body: response };
    }

    case "restoreSnapshot": {
      const snapshot = validateStoreSnapshotRestore(input.body, input.app.key);
      const response = input.writes.apply(() =>
        restoreStorageSnapshotOutcome(input.storage, snapshot),
      );

      return { body: response };
    }

    case "mutation": {
      const { schema } = initializeStorageFromSource(input.storage, input.source);
      const validatedMutation = validateMutationRequest(input.body, schema, input.storage);

      if ("outcome" in validatedMutation) {
        return {
          body: input.writes.apply(() => validatedMutation.outcome),
        };
      }

      const mutation = validatedMutation.mutation;

      if (mutation.op === "create") {
        const response = input.writes.apply(() =>
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
        );

        return { body: response };
      }

      if (mutation.op === "delete") {
        throw new BadRequestError("Delete mutation execution is not implemented yet.");
      }

      const response = input.writes.apply(() =>
        patchStoredRecordOutcome(
          input.storage,
          mutation,
          "recordValues" in mutation ? mutation.recordValues : undefined,
          (entity, values, options) => {
            assertUniqueConstraints(input.storage, schema, entity, values, options);
          },
        ),
      );

      return { body: response };
    }

    case "action": {
      const { schema } = initializeStorageFromSource(input.storage, input.source);
      const action = validateEntityActionRequest(input.body, schema);
      const response = input.writes.apply(() =>
        executeEntityActionOutcome(input.storage, action, schema),
      );

      return { body: response };
    }

    case "resetSchema": {
      const response = input.writes.apply(() =>
        mapWriteOutcome(
          resetStorageSchemaToSourceOutcome(input.storage, input.source, validateSourceSchemaReset),
          ({ schema, updatedAt }) => bootstrapResponse(input.storage, schema, updatedAt),
        ),
      );

      return { body: response };
    }

    case "resetSeed": {
      const response = input.writes.apply(() =>
        mapWriteOutcome(
          resetStorageToSourceSeedOutcome(input.storage, input.source),
          ({ schema, updatedAt }) => bootstrapResponse(input.storage, schema, updatedAt),
        ),
      );

      return { body: response };
    }
  }
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
) {
  return {
    schema,
    schemaUpdatedAt,
    records: getBootstrapRecords(storage),
    cursor: getCurrentCursor(storage),
  };
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
