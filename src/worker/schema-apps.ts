import rawRateSeedRecords from "../../schema/apps/rates/seed-records.json";
import rawRateSourceSchema from "../../schema/apps/rates/schema.json";
import rawTaskSeedRecords from "../../schema/apps/tasks/seed-records.json";
import rawTaskSourceSchema from "../../schema/apps/tasks/schema.json";
import {
  findSchemaAppDefinition,
  schemaAppDefinitions,
  schemaApps,
  type SchemaAppDefinition,
  type SchemaKey,
} from "../shared/schema-apps.ts";
import { parseAppSchema, type AppSchema } from "../shared/schema.ts";
import type { RecordValues, StoredRecord } from "../shared/protocol.ts";

export type WorkerSchemaAppDefinition = SchemaAppDefinition & {
  sourceSchema: AppSchema;
  seedRecords: StoredRecord[];
};

export const workerSchemaAppDefinitions = {
  tasks: {
    ...schemaAppDefinitions.tasks,
    sourceSchema: parseAppSchema(rawTaskSourceSchema),
    seedRecords: parseSeedRecords(rawTaskSeedRecords, "tasks seed records"),
  },
  rates: {
    ...schemaAppDefinitions.rates,
    sourceSchema: parseAppSchema(rawRateSourceSchema),
    seedRecords: parseSeedRecords(rawRateSeedRecords, "rates seed records"),
  },
} as const satisfies Record<SchemaKey, WorkerSchemaAppDefinition>;

export const workerSchemaApps = schemaApps.map(
  (app) => workerSchemaAppDefinitions[app.key],
) satisfies WorkerSchemaAppDefinition[];

export function getWorkerSchemaAppDefinition(key: SchemaKey): WorkerSchemaAppDefinition {
  return workerSchemaAppDefinitions[key];
}

export function findWorkerSchemaAppDefinition(key: string): WorkerSchemaAppDefinition | undefined {
  const app = findSchemaAppDefinition(key);

  return app ? getWorkerSchemaAppDefinition(app.key) : undefined;
}

function parseSeedRecords(value: unknown, label: string): StoredRecord[] {
  if (!Array.isArray(value)) {
    throw new Error(`Seed fixture "${label}" must be an array.`);
  }

  return value.map((record, index) => parseSeedRecord(record, `${label}[${index}]`));
}

function parseSeedRecord(value: unknown, label: string): StoredRecord {
  if (!isRecord(value)) {
    throw new Error(`Seed fixture "${label}" must be an object.`);
  }

  if (typeof value.id !== "string" || value.id.trim() === "") {
    throw new Error(`Seed fixture "${label}" must include an id.`);
  }

  if (typeof value.entity !== "string" || value.entity.trim() === "") {
    throw new Error(`Seed fixture "${label}" must include an entity.`);
  }

  if (!isRecordValues(value.values)) {
    throw new Error(`Seed fixture "${label}" values are invalid.`);
  }

  if (typeof value.createdAt !== "string" || value.createdAt.trim() === "") {
    throw new Error(`Seed fixture "${label}" must include createdAt.`);
  }

  if ("deletedAt" in value) {
    throw new Error(`Seed fixture "${label}" must not include deletedAt.`);
  }

  return {
    id: value.id,
    entity: value.entity,
    values: value.values,
    createdAt: value.createdAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecordValues(value: unknown): value is RecordValues {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (fieldValue) =>
        typeof fieldValue === "string" ||
        typeof fieldValue === "boolean" ||
        (typeof fieldValue === "number" && Number.isFinite(fieldValue)),
    )
  );
}
