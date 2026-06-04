import type { RecordValues, StoredRecord } from "../shared/protocol.ts";
import type { AppSchema, EntitySchema, UniqueConstraintSchema } from "@dpeek/formless-schema";
import { BadRequestError } from "./errors.ts";
import { getActiveRecordsByEntity } from "./storage.ts";

type ConstraintCheckOptions = {
  ignoreRecordId?: string;
};

export function assertUniqueConstraints(
  storage: DurableObjectStorage,
  schema: AppSchema,
  entityName: string,
  values: RecordValues,
  options: ConstraintCheckOptions = {},
) {
  const entity = schema.entities[entityName];
  if (!entity) {
    throw new Error(`Missing entity "${entityName}".`);
  }

  for (const [constraintName, constraint] of Object.entries(entity.constraints ?? {})) {
    if (constraint.kind !== "unique") {
      continue;
    }

    const duplicate = getActiveRecordsByEntity(storage, entityName).find((record) => {
      return (
        record.id !== options.ignoreRecordId &&
        uniqueConstraintValuesEqual(record.values, values, constraint)
      );
    });

    if (duplicate) {
      throw uniqueConstraintViolation(entityName, constraintName);
    }
  }
}

export function assertExistingRecordsSatisfyUniqueConstraints(
  schema: AppSchema,
  records: StoredRecord[],
) {
  for (const [entityName, entity] of Object.entries(schema.entities)) {
    const activeRecords = records.filter(
      (record) => record.entity === entityName && !record.deletedAt,
    );

    for (const [constraintName, constraint] of Object.entries(entity.constraints ?? {})) {
      if (constraint.kind !== "unique") {
        continue;
      }

      assertExistingRecordsSatisfyUniqueConstraint(
        entityName,
        entity,
        constraintName,
        constraint,
        activeRecords,
      );
    }
  }
}

function assertExistingRecordsSatisfyUniqueConstraint(
  entityName: string,
  entity: EntitySchema,
  constraintName: string,
  constraint: UniqueConstraintSchema,
  records: StoredRecord[],
) {
  const seen = new Set<string>();

  for (const record of records) {
    const key = uniqueConstraintKey(record.values, constraint);

    if (seen.has(key)) {
      throw new BadRequestError(
        `Cannot add unique constraint "${entityName}.${constraintName}" because existing records violate it.`,
      );
    }

    seen.add(key);
  }

  for (const fieldName of constraint.fields) {
    if (!entity.fields[fieldName]) {
      throw new Error(
        `Unique constraint "${entityName}.${constraintName}" references unknown field "${fieldName}".`,
      );
    }
  }
}

function uniqueConstraintValuesEqual(
  left: RecordValues,
  right: RecordValues,
  constraint: UniqueConstraintSchema,
) {
  return constraint.fields.every((fieldName) => left[fieldName] === right[fieldName]);
}

function uniqueConstraintKey(values: RecordValues, constraint: UniqueConstraintSchema) {
  return JSON.stringify(constraint.fields.map((fieldName) => values[fieldName] ?? null));
}

function uniqueConstraintViolation(entityName: string, constraintName: string) {
  return new BadRequestError(
    `Unique constraint "${entityName}.${constraintName}" would be violated.`,
  );
}
