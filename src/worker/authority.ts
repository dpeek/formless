import { DurableObject } from "cloudflare:workers";
import rawSeedSchema from "../../schema/app-schema.json";
import { parseAppSchema, type AppSchema } from "../shared/schema.ts";
import type { CreateMutation } from "../shared/protocol.ts";
import {
  createStoredRecord,
  ensureStorageTables,
  getActiveSchema,
  getBootstrapRecords,
  getChangesAfter,
  getCurrentCursor,
  writeActiveSchema,
} from "./storage.ts";
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
        const mutation = validateCreateMutation(await readJson(request), schema);

        return jsonResponse(createStoredRecord(this.ctx.storage, mutation));
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

function validateCreateMutation(value: unknown, schema: AppSchema): CreateMutation {
  if (!isRecord(value)) {
    throw new BadRequestError("Mutation must be an object.");
  }

  if (typeof value.mutationId !== "string" || value.mutationId.trim() === "") {
    throw new BadRequestError("Mutation must include a non-empty mutationId.");
  }

  if (value.op !== "create") {
    throw new BadRequestError('Only "create" mutations are supported.');
  }

  if (typeof value.entity !== "string") {
    throw new BadRequestError("Mutation must include an entity.");
  }

  const entity = schema.entities[value.entity];
  if (!entity) {
    throw new BadRequestError(`Unknown entity "${value.entity}".`);
  }

  if (!isRecord(value.values)) {
    throw new BadRequestError("Mutation values must be an object.");
  }

  const values: Record<string, string> = {};
  for (const [fieldName, field] of Object.entries(entity.fields)) {
    const fieldValue = value.values[fieldName];

    if (typeof fieldValue !== "string") {
      if (field.required) {
        throw new BadRequestError(`Field "${fieldName}" is required.`);
      }

      continue;
    }

    if (field.required && fieldValue.trim() === "") {
      throw new BadRequestError(`Field "${fieldName}" cannot be empty.`);
    }

    values[fieldName] = fieldValue;
  }

  return {
    mutationId: value.mutationId,
    entity: value.entity,
    op: "create",
    values,
  };
}

function validateSchemaUpdate(
  value: unknown,
  currentSchema: AppSchema,
  records: Array<{ entity: string; values: Record<string, string> }>,
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
  records: Array<{ entity: string; values: Record<string, string> }>,
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
          const value = record.values[fieldName];

          return typeof value !== "string" || value.trim() === "";
        })
      ) {
        throw new BadRequestError(
          `Cannot require field "${entityName}.${fieldName}" because existing records are missing it.`,
        );
      }
    }
  }
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
