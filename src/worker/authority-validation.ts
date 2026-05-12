import {
  isValidStoredFieldValue as isValidStoredFieldValueForType,
  shouldValidateExistingFieldValue,
  validateAuthorityFieldValue,
} from "../shared/field-types.ts";
import { parseAppSchema, type AppSchema, type EntitySchema } from "../shared/schema.ts";
import type {
  CreateMutation,
  DeleteMutation,
  Mutation,
  MutationResponse,
  PatchMutation,
  RecordValues,
  StoreSnapshot,
  StoredRecord,
} from "../shared/protocol.ts";
import { parseStoreSnapshot } from "../shared/protocol.ts";
import { assertExistingRecordsSatisfyUniqueConstraints } from "./constraints.ts";
import { BadRequestError } from "./errors.ts";
import {
  getMutationResponseById,
  getStoredRecord,
  replayedWrite,
  type WriteOutcome,
} from "./storage.ts";

export type ValidatedMutation =
  | {
      mutation: Mutation | (PatchMutation & { recordValues: RecordValues });
    }
  | {
      outcome: WriteOutcome<MutationResponse>;
    };

export function validateMutationRequest(
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

  if (value.op !== "create" && value.op !== "patch" && value.op !== "delete") {
    throw new BadRequestError('Only "create", "patch", and "delete" mutations are supported.');
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

  if (value.op === "delete" && !entity.mutations.delete.enabled) {
    throw new BadRequestError(`Delete mutations are disabled for entity "${value.entity}".`);
  }

  if (value.op === "delete") {
    if ("values" in value) {
      throw new BadRequestError("Delete mutation must not include values.");
    }

    if (typeof value.recordId !== "string" || value.recordId.trim() === "") {
      throw new BadRequestError("Delete mutation must include a recordId.");
    }

    const existingRecord = getStoredRecord(storage, value.recordId);
    if (!existingRecord) {
      throw new BadRequestError(`Unknown record "${value.recordId}".`);
    }

    if (existingRecord.entity !== value.entity) {
      throw new BadRequestError("Delete entity must match the stored record entity.");
    }

    if (existingRecord.deletedAt) {
      throw new BadRequestError(`Cannot delete tombstoned record "${value.recordId}".`);
    }

    return {
      mutation: {
        mutationId: value.mutationId,
        entity: value.entity,
        op: "delete",
        recordId: value.recordId,
      } satisfies DeleteMutation,
    };
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

export function validateSchemaUpdateRequest(
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

export function validateSourceSchemaReset(
  currentSchema: AppSchema,
  sourceSchema: AppSchema,
  records: StoredRecord[],
) {
  validateCompatibleSchemaChange(currentSchema, sourceSchema, records);
  assertExistingRecordsSatisfyUniqueConstraints(sourceSchema, records);
}

export function validateStoreSnapshotRestore(value: unknown, schemaKey: string): StoreSnapshot {
  let snapshot: StoreSnapshot;

  try {
    snapshot = parseStoreSnapshot(value, schemaKey);
  } catch (error) {
    throw new BadRequestError(
      error instanceof Error ? error.message : "Store snapshot is invalid.",
    );
  }

  validateSnapshotRecords(snapshot);
  assertIsoTimestamp("Store snapshot exportedAt", snapshot.exportedAt);
  assertIsoTimestamp("Store snapshot schemaUpdatedAt", snapshot.schemaUpdatedAt);
  assertExistingRecordsSatisfyUniqueConstraints(snapshot.schema, snapshot.records);

  return snapshot;
}

function validateSnapshotRecords(snapshot: StoreSnapshot) {
  const recordsById = new Map<string, StoredRecord>();

  for (const record of snapshot.records) {
    if (record.id.trim() === "") {
      throw new BadRequestError("Store snapshot record id must be non-empty.");
    }

    if (recordsById.has(record.id)) {
      throw new BadRequestError(`Store snapshot includes duplicate record id "${record.id}".`);
    }

    assertIsoTimestamp(`Store snapshot record "${record.id}" createdAt`, record.createdAt);

    if (record.deletedAt !== undefined) {
      assertIsoTimestamp(`Store snapshot record "${record.id}" deletedAt`, record.deletedAt);
    }

    recordsById.set(record.id, record);
  }

  for (const record of snapshot.records) {
    validateSnapshotRecord(record, snapshot.schema, recordsById);
  }
}

function validateSnapshotRecord(
  record: StoredRecord,
  schema: AppSchema,
  recordsById: Map<string, StoredRecord>,
) {
  const entity = schema.entities[record.entity];

  if (!entity) {
    throw new BadRequestError(
      `Store snapshot record "${record.id}" references unknown entity "${record.entity}".`,
    );
  }

  for (const fieldName of Object.keys(record.values)) {
    if (!entity.fields[fieldName]) {
      throw new BadRequestError(
        `Store snapshot record "${record.id}" includes unknown field "${record.entity}.${fieldName}".`,
      );
    }
  }

  for (const [fieldName, field] of Object.entries(entity.fields)) {
    const fieldValue = record.values[fieldName];

    if (!isValidStoredFieldValue(fieldValue, field, recordsById)) {
      throw new BadRequestError(
        `Store snapshot record "${record.id}" has invalid field "${record.entity}.${fieldName}".`,
      );
    }
  }
}

function assertIsoTimestamp(context: string, value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf()) || date.toISOString() !== value) {
    throw new BadRequestError(`${context} must be an ISO timestamp.`);
  }
}

export function validateCompatibleSchemaChange(
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

export function validateRecordValues(
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
