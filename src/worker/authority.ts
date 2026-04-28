import { DurableObject } from "cloudflare:workers";
import { appSchema } from "../client/schema.ts";
import type { AppSchema } from "../shared/schema.ts";
import type { CreateMutation } from "../shared/protocol.ts";
import {
  createStoredRecord,
  ensureStorageTables,
  getBootstrapRecords,
  getChangesAfter,
  getCurrentCursor,
} from "./storage.ts";
import type { Env } from "./index.ts";

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
        return jsonResponse({
          schema: appSchema,
          records: getBootstrapRecords(this.ctx.storage),
          cursor: getCurrentCursor(this.ctx.storage),
        });
      }

      if (request.method === "GET" && url.pathname === "/api/sync") {
        const after = parseCursor(url.searchParams.get("after"));
        const changes = getChangesAfter(this.ctx.storage, after);

        return jsonResponse({
          changes,
          cursor: getCurrentCursor(this.ctx.storage),
        });
      }

      if (request.method === "POST" && url.pathname === "/api/mutations") {
        const mutation = validateCreateMutation(await readJson(request), appSchema);

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
