import { DurableObject } from "cloudflare:workers";
import rawSeedSchema from "../../schema/app-schema.json";
import rawRateCardSchema from "../../schema/samples/rate-card.json";
import { isDateString } from "../shared/date.ts";
import {
  parseAppSchema,
  type AppSchema,
  type EntitySchema,
  type NumberFieldSchema,
} from "../shared/schema.ts";
import type {
  ActionRequest,
  CreateMutation,
  Mutation,
  PatchMutation,
  RecordValues,
  StoredRecord,
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
  type StorageResetSeed,
  writeActiveSchema,
} from "./storage.ts";
import { executeEntityAction } from "./actions.ts";
import { rateCardSeedRecords, taskSeedRecords } from "./fixtures.ts";
import type { Env } from "./index.ts";

const seedSchema = parseAppSchema(rawSeedSchema);
const rateCardSchema = parseAppSchema(rawRateCardSchema);

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
        const { schema, updatedAt } = resetStorage(
          this.ctx.storage,
          validateDevResetRequest(await readJson(request)),
        );

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

function validateDevResetRequest(value: unknown): StorageResetSeed {
  if (!isRecord(value)) {
    throw new BadRequestError("Reset request must be an object.");
  }

  if (value.schema === undefined || value.schema === "default") {
    return {
      schema: seedSchema,
      records: taskSeedRecords,
      changeMutationPrefix: "seed-task",
    };
  }

  if (value.schema === "rate-card") {
    return {
      schema: rateCardSchema,
      records: rateCardSeedRecords,
      changeMutationPrefix: "seed-rate-card",
    };
  }

  throw new BadRequestError(`Unknown reset schema "${formatResetSchemaValue(value.schema)}".`);
}

function formatResetSchemaValue(value: unknown) {
  return typeof value === "string" ? value : "non-string";
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
    const recordValues = validateRecordValues(
      { ...existingRecord.values, ...patchValues },
      entity,
      storage,
    );

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
    values: validateRecordValues(value.values, entity, storage),
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

    if (field.type === "enum") {
      if (fieldWasProvided) {
        if (typeof fieldValue !== "string") {
          throw new BadRequestError(`Field "${fieldName}" must be a known enum value.`);
        }

        if (fieldValue === "") {
          if (field.required) {
            throw new BadRequestError(`Field "${fieldName}" cannot be empty.`);
          }

          continue;
        }

        if (!Object.hasOwn(field.values, fieldValue)) {
          throw new BadRequestError(`Field "${fieldName}" must be a known enum value.`);
        }

        validated[fieldName] = fieldValue;
        continue;
      }

      if (field.default !== undefined) {
        validated[fieldName] = field.default;
        continue;
      }

      if (field.required) {
        throw new BadRequestError(`Field "${fieldName}" is required.`);
      }

      continue;
    }

    if (field.type === "number") {
      if (fieldWasProvided) {
        if (fieldValue === "") {
          if (field.required) {
            throw new BadRequestError(`Field "${fieldName}" cannot be empty.`);
          }

          continue;
        }

        validateNumberFieldValue(fieldName, fieldValue, field);
        validated[fieldName] = fieldValue;
        continue;
      }

      if (field.default !== undefined) {
        validated[fieldName] = field.default;
        continue;
      }

      if (field.required) {
        throw new BadRequestError(`Field "${fieldName}" is required.`);
      }

      continue;
    }

    if (field.type === "reference") {
      if (!fieldWasProvided) {
        if (field.required) {
          throw new BadRequestError(`Field "${fieldName}" is required.`);
        }

        continue;
      }

      if (typeof fieldValue !== "string") {
        throw new BadRequestError(`Field "${fieldName}" must be a reference ID.`);
      }

      if (fieldValue.trim() === "") {
        if (field.required) {
          throw new BadRequestError(`Field "${fieldName}" cannot be empty.`);
        }

        continue;
      }

      const targetRecord = getStoredRecord(storage, fieldValue);
      if (!targetRecord) {
        throw new BadRequestError(
          `Field "${fieldName}" references unknown ${field.to} record "${fieldValue}".`,
        );
      }

      if (targetRecord.entity !== field.to) {
        throw new BadRequestError(`Field "${fieldName}" must reference a ${field.to} record.`);
      }

      if (targetRecord.deletedAt) {
        throw new BadRequestError(
          `Field "${fieldName}" cannot reference tombstoned record "${fieldValue}".`,
        );
      }

      validated[fieldName] = fieldValue;
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

function validateNumberFieldValue(
  fieldName: string,
  value: unknown,
  field: NumberFieldSchema,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BadRequestError(`Field "${fieldName}" must be a finite number.`);
  }

  if (field.min !== undefined && value < field.min) {
    throw new BadRequestError(
      `Field "${fieldName}" must be greater than or equal to ${field.min}.`,
    );
  }

  if (field.max !== undefined && value > field.max) {
    throw new BadRequestError(`Field "${fieldName}" must be less than or equal to ${field.max}.`);
  }

  if (field.integer && !Number.isInteger(value)) {
    throw new BadRequestError(`Field "${fieldName}" must be an integer.`);
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
  return field.required || field.type === "number" || field.type === "reference";
}

function isValidStoredFieldValue(
  value: RecordValues[string] | undefined,
  field: EntitySchema["fields"][string],
  recordsById: Map<string, StoredRecord>,
) {
  if (value === undefined) {
    if (field.type === "boolean") {
      return !field.required || typeof field.default === "boolean";
    }

    if (field.type === "number") {
      return !field.required || field.default !== undefined;
    }

    if (field.type === "enum") {
      return !field.required || field.default !== undefined;
    }

    return !field.required;
  }

  if (field.type === "boolean") {
    return typeof value === "boolean";
  }

  if (field.type === "enum") {
    return typeof value === "string" && value !== "";
  }

  if (field.type === "number") {
    return isValidNumberFieldValue(value, field);
  }

  if (field.type === "reference") {
    if (typeof value !== "string" || value.trim() === "") {
      return false;
    }

    const targetRecord = recordsById.get(value);

    return !!targetRecord && targetRecord.entity === field.to && !targetRecord.deletedAt;
  }

  return (
    typeof value === "string" &&
    (!field.required || value.trim() !== "") &&
    (field.type !== "date" || isDateString(value))
  );
}

function isValidNumberFieldValue(value: RecordValues[string], field: NumberFieldSchema) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    (field.min === undefined || value >= field.min) &&
    (field.max === undefined || value <= field.max) &&
    (!field.integer || Number.isInteger(value))
  );
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
