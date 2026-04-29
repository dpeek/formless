import { DurableObject } from "cloudflare:workers";
import rawSeedSchema from "../../schema/app-schema.json";
import { parseAppSchema, type AppSchema, type EntitySchema } from "../shared/schema.ts";
import type {
  ActionRequest,
  CreateMutation,
  Mutation,
  PatchMutation,
  RecordValues,
} from "../shared/protocol.ts";
import {
  createStoredRecord,
  ensureStorageTables,
  getActiveSchema,
  getBootstrapRecords,
  getChangesAfter,
  getCurrentCursor,
  getMutationResponseById,
  getStoredRecord,
  patchStoredRecord,
  resetStorage,
  writeActiveSchema,
} from "./storage.ts";
import { executeEntityAction } from "./actions.ts";
import type { Env } from "./index.ts";

const seedSchema = parseAppSchema(rawSeedSchema);

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

export class FormlessAuthority extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ensureStorageTables(this.ctx.storage);
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/api/bootstrap") {
        const { schema, updatedAt } = getActiveSchema(this.ctx.storage, seedSchema);

        return jsonResponse({
          schema,
          schemaUpdatedAt: updatedAt,
          records: getBootstrapRecords(this.ctx.storage),
          cursor: getCurrentCursor(this.ctx.storage),
        });
      }

      if (request.method === "GET" && url.pathname === "/api/schema") {
        const { schema, updatedAt } = getActiveSchema(this.ctx.storage, seedSchema);

        return jsonResponse({ schema, updatedAt });
      }

      if (request.method === "POST" && url.pathname === "/api/schema") {
        const currentSchema = getActiveSchema(this.ctx.storage, seedSchema).schema;
        const records = getBootstrapRecords(this.ctx.storage);
        const nextSchema = validateSchemaUpdate(await readJson(request), currentSchema, records);

        return jsonResponse(writeActiveSchema(this.ctx.storage, nextSchema));
      }

      if (request.method === "GET" && url.pathname === "/api/sync") {
        const after = parseCursor(url.searchParams.get("after"));
        const changes = getChangesAfter(this.ctx.storage, after);
        const { schema, updatedAt } = getActiveSchema(this.ctx.storage, seedSchema);
        const clientSchemaUpdatedAt = url.searchParams.get("schemaUpdatedAt");
        const schemaFields =
          clientSchemaUpdatedAt === updatedAt ? {} : { schema, schemaUpdatedAt: updatedAt };

        return jsonResponse({
          changes,
          cursor: getCurrentCursor(this.ctx.storage),
          ...schemaFields,
        });
      }

      if (request.method === "POST" && url.pathname === "/api/mutations") {
        const { schema } = getActiveSchema(this.ctx.storage, seedSchema);
        const mutation = validateMutation(await readJson(request), schema, this.ctx.storage);

        return jsonResponse(
          mutation.op === "create"
            ? createStoredRecord(this.ctx.storage, mutation)
            : patchStoredRecord(
                this.ctx.storage,
                mutation,
                "recordValues" in mutation ? mutation.recordValues : undefined,
              ),
        );
      }

      if (request.method === "POST" && url.pathname === "/api/actions") {
        const { schema } = getActiveSchema(this.ctx.storage, seedSchema);
        const action = validateActionRequest(await readJson(request), schema);

        return jsonResponse(executeEntityAction(this.ctx.storage, action, schema));
      }

      if (request.method === "POST" && url.pathname === "/api/dev/reset") {
        const { schema, updatedAt } = resetStorage(this.ctx.storage, seedSchema);

        return jsonResponse({
          schema,
          schemaUpdatedAt: updatedAt,
          records: getBootstrapRecords(this.ctx.storage),
          cursor: getCurrentCursor(this.ctx.storage),
        });
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

  if (entity.fields.done?.type !== "boolean") {
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
): Mutation | (PatchMutation & { recordValues: RecordValues }) {
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
    return {
      mutationId: value.mutationId,
      entity: replay.record.entity,
      op: value.op,
      ...(value.op === "patch" ? { recordId: replay.record.id } : {}),
      values: replay.record.values,
    } as Mutation;
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
    const recordValues = validateRecordValues({ ...existingRecord.values, ...patchValues }, entity);

    return {
      mutationId: value.mutationId,
      entity: value.entity,
      op: "patch",
      recordId: value.recordId,
      values: patchValues,
      recordValues,
    };
  }

  return {
    mutationId: value.mutationId,
    entity: value.entity,
    op: "create",
    values: validateRecordValues(value.values, entity),
  } satisfies CreateMutation;
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

function validateRecordValues(values: Record<string, unknown>, entity: EntitySchema): RecordValues {
  for (const fieldName of Object.keys(values)) {
    if (!entity.fields[fieldName]) {
      throw new BadRequestError(`Unknown field "${fieldName}".`);
    }
  }

  const validated: RecordValues = {};

  for (const [fieldName, field] of Object.entries(entity.fields)) {
    const fieldValue = values[fieldName];

    if (field.type === "boolean") {
      if (typeof fieldValue === "boolean") {
        validated[fieldName] = fieldValue;
        continue;
      }

      if (fieldName in values) {
        throw new BadRequestError(`Field "${fieldName}" must be a boolean.`);
      }

      if (typeof field.default === "boolean") {
        validated[fieldName] = field.default;
        continue;
      }

      if (field.required) {
        throw new BadRequestError(`Field "${fieldName}" is required.`);
      }

      continue;
    }

    if (typeof fieldValue !== "string") {
      if (field.required) {
        throw new BadRequestError(`Field "${fieldName}" is required.`);
      }

      continue;
    }

    if (field.required && fieldValue.trim() === "") {
      throw new BadRequestError(`Field "${fieldName}" cannot be empty.`);
    }

    if (field.type === "date" && fieldValue !== "" && !isDateString(fieldValue)) {
      throw new BadRequestError(`Field "${fieldName}" must be a YYYY-MM-DD date.`);
    }

    if (fieldValue !== "" || field.required) {
      validated[fieldName] = fieldValue;
    }
  }

  return validated;
}

function validateSchemaUpdate(
  value: unknown,
  currentSchema: AppSchema,
  records: Array<{ entity: string; values: RecordValues }>,
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

  return nextSchema;
}

function validateCompatibleSchemaChange(
  currentSchema: AppSchema,
  nextSchema: AppSchema,
  records: Array<{ entity: string; values: RecordValues }>,
) {
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
    }

    for (const [fieldName, nextField] of Object.entries(nextEntity.fields)) {
      if (
        nextField.required &&
        entityRecords.some((record) => {
          return !isValidStoredFieldValue(record.values[fieldName], nextField);
        })
      ) {
        throw new BadRequestError(
          `Cannot require field "${entityName}.${fieldName}" because existing records are missing it.`,
        );
      }
    }
  }
}

function isValidStoredFieldValue(
  value: RecordValues[string] | undefined,
  field: EntitySchema["fields"][string],
) {
  if (field.type === "boolean") {
    return typeof value === "boolean" || typeof field.default === "boolean";
  }

  return (
    typeof value === "string" &&
    (!field.required || value.trim() !== "") &&
    (field.type !== "date" || isDateString(value))
  );
}

function isDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
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
