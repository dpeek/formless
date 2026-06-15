import rawCrmSeedRecords from "../../schema/apps/crm/seed-records.json";
import rawCrmSourceSchema from "../../schema/apps/crm/schema.json";
import rawSiteSeedRecords from "../../schema/apps/site/seed-records.json";
import rawSiteSourceSchema from "../../schema/apps/site/schema.json";
import rawTaskSeedRecords from "../../schema/apps/tasks/seed-records.json";
import rawTaskSourceSchema from "../../schema/apps/tasks/schema.json";
import {
  findSchemaAppDefinition,
  schemaAppDefinitions,
  schemaApps,
  type SchemaAppDefinition,
  type SchemaKey,
} from "../shared/schema-apps.ts";
import {
  parseAppSchema,
  validateAuthorityFieldValue,
  type AppSchema,
} from "@dpeek/formless-schema";
import type { RecordValues, StoredRecord } from "../shared/protocol.ts";

export type WorkerSchemaAppDefinition = Omit<SchemaAppDefinition, "key"> & {
  key: string;
  sourceSchema: AppSchema;
  seedRecords: StoredRecord[];
};

const taskSourceSchema = parseAppSchema(rawTaskSourceSchema);
const siteSourceSchema = parseAppSchema(rawSiteSourceSchema);
const crmSourceSchema = parseAppSchema(rawCrmSourceSchema);

export const workerSchemaAppDefinitions = {
  tasks: {
    ...schemaAppDefinitions.tasks,
    sourceSchema: taskSourceSchema,
    seedRecords: parseWorkerSeedRecords(rawTaskSeedRecords, taskSourceSchema, "tasks seed records"),
  },
  site: {
    ...schemaAppDefinitions.site,
    sourceSchema: siteSourceSchema,
    seedRecords: parseWorkerSeedRecords(rawSiteSeedRecords, siteSourceSchema, "site seed records"),
  },
  crm: {
    ...schemaAppDefinitions.crm,
    sourceSchema: crmSourceSchema,
    seedRecords: parseWorkerSeedRecords(rawCrmSeedRecords, crmSourceSchema, "crm seed records"),
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

export function parseWorkerSeedRecords(
  value: unknown,
  schema: AppSchema,
  label: string,
): StoredRecord[] {
  if (!Array.isArray(value)) {
    throw new Error(`Seed fixture "${label}" must be an array.`);
  }

  const records = value.map((record, index) => parseSeedRecord(record, `${label}[${index}]`));
  validateSeedRecords(records, schema, label);

  return records;
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

function validateSeedRecords(records: StoredRecord[], schema: AppSchema, label: string) {
  const recordsById = new Map<string, StoredRecord>();

  for (const record of records) {
    if (recordsById.has(record.id)) {
      throw new Error(`Seed fixture "${label}" includes duplicate id "${record.id}".`);
    }

    recordsById.set(record.id, record);
  }

  for (const [index, record] of records.entries()) {
    const recordLabel = `${label}[${index}]`;
    const entity = schema.entities[record.entity];

    if (!entity) {
      throw new Error(
        `Seed fixture "${recordLabel}" references unknown entity "${record.entity}".`,
      );
    }

    for (const fieldName of Object.keys(record.values)) {
      if (!Object.hasOwn(entity.fields, fieldName)) {
        throw new Error(
          `Seed fixture "${recordLabel}" values include unknown field "${record.entity}.${fieldName}".`,
        );
      }
    }

    for (const [fieldName, field] of Object.entries(entity.fields)) {
      const value = record.values[fieldName];
      const fieldWasProvided = value !== undefined;

      try {
        validateAuthorityFieldValue(fieldName, field, value, fieldWasProvided);
      } catch (error) {
        throw new Error(
          `Seed fixture "${recordLabel}" has invalid field "${record.entity}.${fieldName}": ${
            error instanceof Error ? error.message : "Field value is invalid."
          }`,
        );
      }

      if (field.type !== "reference" || value === undefined) {
        continue;
      }

      if (typeof value !== "string") {
        throw new Error(
          `Seed fixture "${recordLabel}" field "${record.entity}.${fieldName}" must be a reference ID.`,
        );
      }

      const referencedRecord = recordsById.get(value);
      if (!referencedRecord || referencedRecord.entity !== field.to) {
        throw new Error(
          `Seed fixture "${recordLabel}" field "${record.entity}.${fieldName}" references missing ${field.to} record "${value}".`,
        );
      }
    }
  }
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
