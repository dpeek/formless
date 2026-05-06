import { DurableObject } from "cloudflare:workers";
import {
  isValidStoredFieldValue as isValidStoredFieldValueForType,
  shouldValidateExistingFieldValue,
  validateAuthorityFieldValue,
} from "../shared/field-types.ts";
import { parseAppSchema, type AppSchema, type EntitySchema } from "../shared/schema.ts";
import type {
  ActionRequest,
  CreateMutation,
  Mutation,
  MutationResponse,
  PatchMutation,
  RecordValues,
  SyncResponse,
  SyncSocketAttachment,
  SyncSocketServerMessage,
  StoredRecord,
} from "../shared/protocol.ts";
import { isSyncSocketAttachment, isSyncSocketClientMessage } from "../shared/protocol.ts";
import {
  createStoredRecordOutcome,
  mapWriteOutcome,
  ensureStorageTables,
  getBootstrapRecords,
  getChangesAfter,
  getCurrentCursor,
  getMutationResponseById,
  getStoredRecord,
  initializeStorageFromSource,
  patchStoredRecordOutcome,
  replayedWrite,
  resetStorageSchemaToSourceOutcome,
  resetStorageToSourceSeedOutcome,
  type StorageSource,
  type WriteOutcome,
  writeActiveSchemaOutcome,
} from "./storage.ts";
import { executeCreateAfterCreateHooks, executeEntityActionOutcome } from "./actions.ts";
import {
  assertExistingRecordsSatisfyUniqueConstraints,
  assertUniqueConstraints,
} from "./constraints.ts";
import { BadRequestError } from "./errors.ts";
import type { Env } from "./index.ts";
import { findWorkerSchemaAppDefinition, type WorkerSchemaAppDefinition } from "./schema-apps.ts";

export class FormlessAuthority extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ensureStorageTables(this.ctx.storage);
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    const route = parseAuthorityRoute(url.pathname);

    if (!route) {
      return jsonResponse({ error: "Not found." }, 404);
    }

    const source = storageSourceFromApp(route.app);
    const writes = new AuthorityWriteModule(this.ctx.storage, source, () =>
      this.ctx.getWebSockets(),
    );

    try {
      if (request.method === "GET" && route.path === "/bootstrap") {
        const { schema, updatedAt } = initializeStorageFromSource(this.ctx.storage, source);

        return jsonResponse({
          schema,
          schemaUpdatedAt: updatedAt,
          records: getBootstrapRecords(this.ctx.storage),
          cursor: getCurrentCursor(this.ctx.storage),
        });
      }

      if (request.method === "GET" && route.path === "/schema") {
        const { schema, updatedAt } = initializeStorageFromSource(this.ctx.storage, source);

        return jsonResponse({ schema, updatedAt });
      }

      if (request.method === "POST" && route.path === "/schema") {
        const currentSchema = initializeStorageFromSource(this.ctx.storage, source).schema;
        const records = getBootstrapRecords(this.ctx.storage);
        const nextSchema = validateSchemaUpdate(await readJson(request), currentSchema, records);
        const response = writes.apply(() => writeActiveSchemaOutcome(this.ctx.storage, nextSchema));

        return jsonResponse(response);
      }

      if (request.method === "GET" && route.path === "/sync") {
        const after = parseCursor(url.searchParams.get("after"));
        const { schema, updatedAt } = initializeStorageFromSource(this.ctx.storage, source);
        const changes = getChangesAfter(this.ctx.storage, after);
        const clientSchemaUpdatedAt = url.searchParams.get("schemaUpdatedAt");
        const schemaFields =
          clientSchemaUpdatedAt === updatedAt ? {} : { schema, schemaUpdatedAt: updatedAt };

        return jsonResponse({
          changes,
          cursor: getCurrentCursor(this.ctx.storage),
          ...schemaFields,
        });
      }

      if (route.path === "/sync/ws") {
        return this.handleSyncWebSocketRequest(request, route.app);
      }

      if (request.method === "POST" && route.path === "/mutations") {
        const { schema } = initializeStorageFromSource(this.ctx.storage, source);
        const validatedMutation = validateMutation(
          await readJson(request),
          schema,
          this.ctx.storage,
        );

        if ("outcome" in validatedMutation) {
          return jsonResponse(writes.apply(() => validatedMutation.outcome));
        }

        const mutation = validatedMutation.mutation;

        if (mutation.op === "create") {
          const response = writes.apply(() =>
            createStoredRecordOutcome(
              this.ctx.storage,
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
                assertUniqueConstraints(this.ctx.storage, schema, entity, values, options);
              },
            ),
          );

          return jsonResponse(response);
        }

        const response = writes.apply(() =>
          patchStoredRecordOutcome(
            this.ctx.storage,
            mutation,
            "recordValues" in mutation ? mutation.recordValues : undefined,
            (entity, values, options) => {
              assertUniqueConstraints(this.ctx.storage, schema, entity, values, options);
            },
          ),
        );

        return jsonResponse(response);
      }

      if (request.method === "POST" && route.path === "/actions") {
        const { schema } = initializeStorageFromSource(this.ctx.storage, source);
        const action = validateActionRequest(await readJson(request), schema);
        const response = writes.apply(() =>
          executeEntityActionOutcome(this.ctx.storage, action, schema),
        );

        return jsonResponse(response);
      }

      if (request.method === "POST" && route.path === "/reset/schema") {
        const response = writes.apply(() =>
          mapWriteOutcome(
            resetStorageSchemaToSourceOutcome(this.ctx.storage, source, validateSourceSchemaReset),
            ({ schema, updatedAt }) => bootstrapResponse(this.ctx.storage, schema, updatedAt),
          ),
        );

        return jsonResponse(response);
      }

      if (request.method === "POST" && route.path === "/reset/seed") {
        const response = writes.apply(() =>
          mapWriteOutcome(
            resetStorageToSourceSeedOutcome(this.ctx.storage, source),
            ({ schema, updatedAt }) => bootstrapResponse(this.ctx.storage, schema, updatedAt),
          ),
        );

        return jsonResponse(response);
      }

      return jsonResponse({ error: "Not found." }, 404);
    } catch (error) {
      if (error instanceof BadRequestError) {
        return jsonResponse({ error: error.message }, 400);
      }

      throw error;
    }
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const parsedMessage = parseSyncSocketMessage(message);

    if (!parsedMessage) {
      closeMalformedSyncSocket(socket);
      return;
    }

    const source = storageSourceFromSyncSocket(this.ctx, socket);
    const attachment = {
      cursor: parsedMessage.cursor,
      schemaUpdatedAt: parsedMessage.schemaUpdatedAt,
    } satisfies SyncSocketAttachment;

    sendSyncToSocket(this.ctx.storage, source, socket, attachment);
  }

  private handleSyncWebSocketRequest(request: Request, app: WorkerSchemaAppDefinition) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "WebSocket sync requires GET." }, 405, { Allow: "GET" });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return jsonResponse({ error: "Expected Upgrade: websocket." }, 426, {
        Upgrade: "websocket",
      });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.serializeAttachment(initialSyncSocketAttachment());
    this.ctx.acceptWebSocket(server, [app.key]);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
}

class AuthorityWriteModule {
  private readonly storage: DurableObjectStorage;
  private readonly source: StorageSource;
  private readonly webSockets: () => Iterable<WebSocket>;

  constructor(
    storage: DurableObjectStorage,
    source: StorageSource,
    webSockets: () => Iterable<WebSocket>,
  ) {
    this.storage = storage;
    this.source = source;
    this.webSockets = webSockets;
  }

  apply<T>(write: () => WriteOutcome<T>): T {
    const outcome = write();

    if (outcome.kind === "committed") {
      this.notifyCommittedWrite();
    }

    return outcome.response;
  }

  private notifyCommittedWrite() {
    for (const socket of this.webSockets()) {
      try {
        sendSyncToSocket(this.storage, this.source, socket, syncSocketAttachment(socket));
      } catch {
        // A stale socket should not block other replicas from receiving committed state.
      }
    }
  }
}

function storageSourceFromApp(app: WorkerSchemaAppDefinition): StorageSource {
  return {
    schema: app.sourceSchema,
    records: app.seedRecords,
    changeMutationPrefix: app.seedChangeMutationPrefix,
  };
}

function storageSourceFromSyncSocket(ctx: DurableObjectState, socket: WebSocket): StorageSource {
  return storageSourceFromSchemaKey(ctx.getTags(socket)[0] ?? ctx.id.name);
}

function storageSourceFromSchemaKey(schemaKey: string | undefined): StorageSource {
  const app = schemaKey ? findWorkerSchemaAppDefinition(schemaKey) : undefined;

  if (!app) {
    throw new Error("Authority Durable Object is missing a valid schema key.");
  }

  return storageSourceFromApp(app);
}

function initialSyncSocketAttachment(): SyncSocketAttachment {
  return { cursor: 0, schemaUpdatedAt: null };
}

function syncSocketAttachment(socket: WebSocket): SyncSocketAttachment {
  const attachment = socket.deserializeAttachment();

  return isSyncSocketAttachment(attachment) ? attachment : initialSyncSocketAttachment();
}

function parseSyncSocketMessage(message: string | ArrayBuffer) {
  if (typeof message !== "string") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(message) as unknown;

    return isSyncSocketClientMessage(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function sendSyncToSocket(
  storage: DurableObjectStorage,
  source: StorageSource,
  socket: WebSocket,
  attachment: SyncSocketAttachment,
) {
  const response = syncResponseForAttachment(storage, source, attachment);
  const message = {
    type: "sync",
    payload: response,
  } satisfies SyncSocketServerMessage;

  socket.send(JSON.stringify(message));
  socket.serializeAttachment({
    cursor: response.cursor,
    schemaUpdatedAt: response.schemaUpdatedAt ?? attachment.schemaUpdatedAt,
  } satisfies SyncSocketAttachment);
}

function syncResponseForAttachment(
  storage: DurableObjectStorage,
  source: StorageSource,
  attachment: SyncSocketAttachment,
): SyncResponse {
  const { schema, updatedAt } = initializeStorageFromSource(storage, source);
  const schemaFields =
    attachment.schemaUpdatedAt === updatedAt ? {} : { schema, schemaUpdatedAt: updatedAt };

  return {
    changes: getChangesAfter(storage, attachment.cursor),
    cursor: getCurrentCursor(storage),
    ...schemaFields,
  };
}

function closeMalformedSyncSocket(socket: WebSocket) {
  sendSyncSocketError(socket, "Malformed sync socket message.");
  socket.close(1003, "Malformed sync message.");
}

function sendSyncSocketError(socket: WebSocket, message: string) {
  const response = {
    type: "error",
    message,
  } satisfies SyncSocketServerMessage;

  try {
    socket.send(JSON.stringify(response));
  } catch {
    // The socket is already closing or closed.
  }
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

function parseAuthorityRoute(
  pathname: string,
): { app: WorkerSchemaAppDefinition; path: string } | undefined {
  const [apiSegment, schemaKey, ...routeSegments] = pathname.split("/").filter(Boolean);

  if (apiSegment !== "api" || !schemaKey || routeSegments.length === 0) {
    return undefined;
  }

  const app = findWorkerSchemaAppDefinition(schemaKey);

  if (!app) {
    return undefined;
  }

  return { app, path: `/${routeSegments.join("/")}` };
}

function validateSourceSchemaReset(
  currentSchema: AppSchema,
  sourceSchema: AppSchema,
  records: StoredRecord[],
) {
  validateCompatibleSchemaChange(currentSchema, sourceSchema, records);
  assertExistingRecordsSatisfyUniqueConstraints(sourceSchema, records);
}

function validateActionRequest(value: unknown, schema: AppSchema): ActionRequest {
  if (!isRecord(value)) {
    throw new BadRequestError("Action request must be an object.");
  }

  if (typeof value.actionId !== "string" || value.actionId.trim() === "") {
    throw new BadRequestError("Action request must include a non-empty actionId.");
  }

  if (typeof value.entity !== "string" || value.entity.trim() === "") {
    throw new BadRequestError("Action request must include an entity.");
  }

  const entity = schema.entities[value.entity];
  if (!entity) {
    throw new BadRequestError(`Unknown entity "${value.entity}".`);
  }

  if (typeof value.action !== "string" || value.action.trim() === "") {
    throw new BadRequestError("Action request must include an action.");
  }

  const action = entity.actions?.[value.action];
  if (!action) {
    throw new BadRequestError(`Unknown action "${value.action}" for entity "${value.entity}".`);
  }

  if (action.kind === "clear-completed" && entity.fields.done?.type !== "boolean") {
    throw new BadRequestError(
      `Action "${value.action}" requires entity "${value.entity}" to have a boolean done field.`,
    );
  }

  const input = validateActionInput(value.action, action.kind, value.input);

  return {
    actionId: value.actionId,
    entity: value.entity,
    action: value.action,
    ...(input === undefined ? {} : { input }),
  };
}

function validateActionInput(
  actionName: string,
  actionKind: NonNullable<EntitySchema["actions"]>[string]["kind"],
  value: unknown,
): ActionRequest["input"] | undefined {
  if (actionKind === "create-selected-join-record") {
    if (!isRecord(value)) {
      throw new BadRequestError(
        `Action "${actionName}" requires input with fromRecordId and toRecordId.`,
      );
    }

    if (typeof value.fromRecordId !== "string" || value.fromRecordId.trim() === "") {
      throw new BadRequestError(`Action "${actionName}" input fromRecordId must be non-empty.`);
    }

    if (typeof value.toRecordId !== "string" || value.toRecordId.trim() === "") {
      throw new BadRequestError(`Action "${actionName}" input toRecordId must be non-empty.`);
    }

    return {
      fromRecordId: value.fromRecordId,
      toRecordId: value.toRecordId,
    };
  }

  if (actionKind === "remove-selected-join-records") {
    if (!isRecord(value) || !Array.isArray(value.recordIds)) {
      throw new BadRequestError(`Action "${actionName}" requires input with recordIds.`);
    }

    if (value.recordIds.length === 0) {
      throw new BadRequestError(`Action "${actionName}" input recordIds must not be empty.`);
    }

    const seen = new Set<string>();
    const recordIds = value.recordIds.map((recordId, index) => {
      if (typeof recordId !== "string" || recordId.trim() === "") {
        throw new BadRequestError(
          `Action "${actionName}" input recordIds[${index}] must be non-empty.`,
        );
      }

      if (seen.has(recordId)) {
        throw new BadRequestError(
          `Action "${actionName}" input recordIds must not contain duplicates.`,
        );
      }

      seen.add(recordId);

      return recordId;
    });

    return { recordIds };
  }

  return undefined;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new BadRequestError("Request body must be valid JSON.");
  }
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

type ValidatedMutation =
  | {
      mutation: Mutation | (PatchMutation & { recordValues: RecordValues });
    }
  | {
      outcome: WriteOutcome<MutationResponse>;
    };

function validateMutation(
  value: unknown,
  schema: AppSchema,
  storage: DurableObjectStorage,
): ValidatedMutation {
  if (!isRecord(value)) {
    throw new BadRequestError("Mutation must be an object.");
  }

  if (typeof value.mutationId !== "string" || value.mutationId.trim() === "") {
    throw new BadRequestError("Mutation must include a non-empty mutationId.");
  }

  if (value.op !== "create" && value.op !== "patch") {
    throw new BadRequestError('Only "create" and "patch" mutations are supported.');
  }

  if (typeof value.entity !== "string") {
    throw new BadRequestError("Mutation must include an entity.");
  }

  const entity = schema.entities[value.entity];
  if (!entity) {
    throw new BadRequestError(`Unknown entity "${value.entity}".`);
  }

  const replay = getMutationResponseById(storage, value.mutationId);
  if (replay) {
    return { outcome: replayedWrite(replay) };
  }

  if (value.op === "create" && !entity.mutations.create.enabled) {
    throw new BadRequestError(`Create mutations are disabled for entity "${value.entity}".`);
  }

  if (value.op === "patch" && !entity.mutations.patch.enabled) {
    throw new BadRequestError(`Patch mutations are disabled for entity "${value.entity}".`);
  }

  if (!isRecord(value.values)) {
    throw new BadRequestError("Mutation values must be an object.");
  }

  if (value.op === "patch") {
    if (typeof value.recordId !== "string" || value.recordId.trim() === "") {
      throw new BadRequestError("Patch mutation must include a recordId.");
    }

    const existingRecord = getStoredRecord(storage, value.recordId);
    if (!existingRecord) {
      throw new BadRequestError(`Unknown record "${value.recordId}".`);
    }

    if (existingRecord.entity !== value.entity) {
      throw new BadRequestError("Patch entity must match the stored record entity.");
    }

    const patchValues = validatePatchValues(value.values, entity);
    const recordValues = validateRecordValues(
      { ...existingRecord.values, ...patchValues },
      entity,
      storage,
    );

    return {
      mutation: {
        mutationId: value.mutationId,
        entity: value.entity,
        op: "patch",
        recordId: value.recordId,
        values: patchValues,
        recordValues,
      },
    };
  }

  return {
    mutation: {
      mutationId: value.mutationId,
      entity: value.entity,
      op: "create",
      values: validateRecordValues(value.values, entity, storage),
    } satisfies CreateMutation,
  };
}

function validatePatchValues(values: Record<string, unknown>, entity: EntitySchema) {
  const patchValues: Partial<RecordValues> = {};

  for (const [fieldName, fieldValue] of Object.entries(values)) {
    if (!entity.fields[fieldName]) {
      throw new BadRequestError(`Unknown field "${fieldName}".`);
    }

    patchValues[fieldName] = fieldValue as RecordValues[string];
  }

  return patchValues;
}

function validateRecordValues(
  values: Record<string, unknown>,
  entity: EntitySchema,
  storage: DurableObjectStorage,
): RecordValues {
  for (const fieldName of Object.keys(values)) {
    if (!entity.fields[fieldName]) {
      throw new BadRequestError(`Unknown field "${fieldName}".`);
    }
  }

  const validated: RecordValues = {};

  for (const [fieldName, field] of Object.entries(entity.fields)) {
    const fieldValue = values[fieldName];
    const fieldWasProvided = fieldName in values;
    const result = validateAuthorityRecordFieldValue(
      fieldName,
      field,
      fieldValue,
      fieldWasProvided,
    );

    if (result.kind === "omit") {
      continue;
    }

    if (field.type === "reference") {
      if (typeof result.value !== "string") {
        throw new Error("Reference field validation returned a non-string value.");
      }

      const targetRecord = getStoredRecord(storage, result.value);
      if (!targetRecord) {
        throw new BadRequestError(
          `Field "${fieldName}" references unknown ${field.to} record "${result.value}".`,
        );
      }

      if (targetRecord.entity !== field.to) {
        throw new BadRequestError(`Field "${fieldName}" must reference a ${field.to} record.`);
      }

      if (targetRecord.deletedAt) {
        throw new BadRequestError(
          `Field "${fieldName}" cannot reference tombstoned record "${result.value}".`,
        );
      }
    }

    validated[fieldName] = result.value;
  }

  return validated;
}

function validateAuthorityRecordFieldValue(
  fieldName: string,
  field: EntitySchema["fields"][string],
  fieldValue: unknown,
  fieldWasProvided: boolean,
) {
  try {
    return validateAuthorityFieldValue(fieldName, field, fieldValue, fieldWasProvided);
  } catch (error) {
    throw new BadRequestError(error instanceof Error ? error.message : "Field value is invalid.");
  }
}

function validateSchemaUpdate(
  value: unknown,
  currentSchema: AppSchema,
  records: StoredRecord[],
): AppSchema {
  if (!isRecord(value)) {
    throw new BadRequestError("Schema update must be an object.");
  }

  let nextSchema: AppSchema;
  try {
    nextSchema = parseAppSchema(value.schema);
  } catch (error) {
    throw new BadRequestError(error instanceof Error ? error.message : "Schema is invalid.");
  }

  validateCompatibleSchemaChange(currentSchema, nextSchema, records);
  assertExistingRecordsSatisfyUniqueConstraints(nextSchema, records);

  return nextSchema;
}

function validateCompatibleSchemaChange(
  currentSchema: AppSchema,
  nextSchema: AppSchema,
  records: StoredRecord[],
) {
  const recordsById = new Map(records.map((record) => [record.id, record]));

  for (const [entityName, currentEntity] of Object.entries(currentSchema.entities)) {
    const nextEntity = nextSchema.entities[entityName];
    const entityRecords = records.filter((record) => record.entity === entityName);

    if (!nextEntity) {
      throw new BadRequestError(`Cannot remove entity "${entityName}".`);
    }

    for (const [fieldName, currentField] of Object.entries(currentEntity.fields)) {
      const nextField = nextEntity.fields[fieldName];

      if (!nextField) {
        throw new BadRequestError(`Cannot remove or rename field "${entityName}.${fieldName}".`);
      }

      if (nextField.type !== currentField.type) {
        throw new BadRequestError(`Cannot change field type for "${entityName}.${fieldName}".`);
      }

      if (
        currentField.type === "reference" &&
        nextField.type === "reference" &&
        currentField.to !== nextField.to
      ) {
        throw new BadRequestError(
          `Cannot change reference target for "${entityName}.${fieldName}".`,
        );
      }
    }

    for (const [fieldName, nextField] of Object.entries(nextEntity.fields)) {
      if (!shouldValidateExistingValues(nextField)) {
        continue;
      }

      const currentField = currentEntity.fields[fieldName];
      const hasInvalidStoredValue = entityRecords.some((record) => {
        return !isValidStoredFieldValue(record.values[fieldName], nextField, recordsById);
      });

      if (!hasInvalidStoredValue) {
        continue;
      }

      if (nextField.type === "number" && currentField) {
        throw new BadRequestError(
          `Cannot change number constraints for "${entityName}.${fieldName}" because existing records contain invalid values.`,
        );
      }

      if (nextField.type === "reference" && currentField) {
        throw new BadRequestError(
          `Cannot change reference constraints for "${entityName}.${fieldName}" because existing records contain invalid values.`,
        );
      }

      throw new BadRequestError(
        `Cannot require field "${entityName}.${fieldName}" because existing records are missing it.`,
      );
    }
  }
}

function shouldValidateExistingValues(field: EntitySchema["fields"][string]) {
  return shouldValidateExistingFieldValue(field);
}

function isValidStoredFieldValue(
  value: RecordValues[string] | undefined,
  field: EntitySchema["fields"][string],
  recordsById: Map<string, StoredRecord>,
) {
  if (!isValidStoredFieldValueForType(value, field)) {
    return false;
  }

  if (field.type === "reference" && value !== undefined) {
    if (typeof value !== "string") {
      return false;
    }

    const targetRecord = recordsById.get(value);

    return !!targetRecord && targetRecord.entity === field.to && !targetRecord.deletedAt;
  }

  return true;
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");

  return Response.json(body, {
    status,
    headers: responseHeaders,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
