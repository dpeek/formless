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
  StoredRecord,
} from "../shared/protocol.ts";
import {
  createStoredRecord,
  ensureStorageTables,
  getBootstrapRecords,
  getChangesAfter,
  getCurrentCursor,
  getMutationResponseById,
  getStoredRecord,
  initializeStorageFromSource,
  patchStoredRecord,
  resetStorageSchemaToSource,
  resetStorageToSourceSeed,
  type StorageSource,
  writeActiveSchema,
} from "./storage.ts";
import { executeCreateAfterCreateHooks, executeEntityAction } from "./actions.ts";
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

        return jsonResponse(writeActiveSchema(this.ctx.storage, nextSchema));
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

      if (request.method === "POST" && route.path === "/mutations") {
        const { schema } = initializeStorageFromSource(this.ctx.storage, source);
        const validatedMutation = validateMutation(
          await readJson(request),
          schema,
          this.ctx.storage,
        );

        if (validatedMutation.replay) {
          return jsonResponse(validatedMutation.replay);
        }

        const mutation = validatedMutation.mutation;
        if (!mutation) {
          throw new Error("Validated mutation was missing.");
        }

        if (mutation.op === "create") {
          return jsonResponse(
            createStoredRecord(
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
        }

        return jsonResponse(
          patchStoredRecord(
            this.ctx.storage,
            mutation,
            "recordValues" in mutation ? mutation.recordValues : undefined,
            (entity, values, options) => {
              assertUniqueConstraints(this.ctx.storage, schema, entity, values, options);
            },
          ),
        );
      }

      if (request.method === "POST" && route.path === "/actions") {
        const { schema } = initializeStorageFromSource(this.ctx.storage, source);
        const action = validateActionRequest(await readJson(request), schema);

        return jsonResponse(executeEntityAction(this.ctx.storage, action, schema));
      }

      if (request.method === "POST" && route.path === "/reset/schema") {
        const { schema, updatedAt } = resetStorageSchemaToSource(
          this.ctx.storage,
          source,
          validateSourceSchemaReset,
        );

        return jsonResponse(bootstrapResponse(this.ctx.storage, schema, updatedAt));
      }

      if (request.method === "POST" && route.path === "/reset/seed") {
        const { schema, updatedAt } = resetStorageToSourceSeed(this.ctx.storage, source);

        return jsonResponse(bootstrapResponse(this.ctx.storage, schema, updatedAt));
      }

      return jsonResponse({ error: "Not found." }, 404);
    } catch (error) {
      if (error instanceof BadRequestError) {
        return jsonResponse({ error: error.message }, 400);
      }

      throw error;
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

  return {
    actionId: value.actionId,
    entity: value.entity,
    action: value.action,
  };
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

function validateMutation(
  value: unknown,
  schema: AppSchema,
  storage: DurableObjectStorage,
): {
  mutation?: Mutation | (PatchMutation & { recordValues: RecordValues });
  replay?: MutationResponse;
} {
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
    return { replay };
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

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
