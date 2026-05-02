import rawRateCardSeedRecords from "../../schema/samples/rate-card-records.json";
import rawTaskSeedRecords from "../../schema/samples/task-records.json";
import type { RecordValues, StoredRecord } from "../shared/protocol.ts";

export const taskSeedRecords = parseSeedRecords(rawTaskSeedRecords, "task records");
export const rateCardSeedRecords = parseSeedRecords(rawRateCardSeedRecords, "rate-card records");

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
