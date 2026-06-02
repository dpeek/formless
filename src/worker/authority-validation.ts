import {
  isValidStoredFieldValue as isValidStoredFieldValueForType,
  shouldValidateExistingFieldValue,
  validateAuthorityFieldValue,
} from "../shared/field-types.ts";
import { instanceControlPlaneReservedRoutePaths } from "../shared/instance-control-plane.ts";
import { normalizeInstanceDomainHost } from "../shared/instance-domain-mappings.ts";
import {
  parseAppSchema,
  type AppSchema,
  type EntitySchema,
  type RuntimeSchemaRouteValidationSchema,
} from "../shared/schema.ts";
import { runtimeControlPlaneEntityMetadata } from "../shared/schema-runtime.ts";
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
  getBootstrapRecords,
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

  assertRuntimeHistoryAllowsGenericMutation(schema, value.entity, value.op);

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

    assertNoActiveInboundReferences(existingRecord, schema, storage);

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
    assertImmutableFieldsNotPatched(schema, value.entity, patchValues);
    const recordValues = validateRecordValues(
      { ...existingRecord.values, ...patchValues },
      entity,
      storage,
      {
        entityName: value.entity,
        existingRecordId: value.recordId,
        schema,
      },
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
      values: validateRecordValues(value.values, entity, storage, {
        entityName: value.entity,
        schema,
      }),
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
  validateCompatibleSchemaChange(currentSchema, sourceSchema, records, {
    allowFieldRemoval: true,
  });
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
    assertControlPlaneRecordValuesAreDisplaySafe(record.values, snapshot.schema, record.entity);
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
  options: { allowFieldRemoval?: boolean } = {},
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
        if (options.allowFieldRemoval) {
          continue;
        }

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
  runtimeOptions?: {
    additionalRecords?: StoredRecord[];
    entityName: string;
    existingRecordId?: string;
    schema: AppSchema;
  },
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

      const targetRecord = getStoredRecordForValidation(
        storage,
        result.value,
        runtimeOptions?.additionalRecords,
      );
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

  if (runtimeOptions) {
    assertControlPlaneRecordValuesAreDisplaySafe(
      validated,
      runtimeOptions.schema,
      runtimeOptions.entityName,
    );
    validateRuntimeControlPlaneValues(
      validated,
      runtimeOptions.schema,
      runtimeOptions.entityName,
      storage,
      runtimeOptions.existingRecordId,
      runtimeOptions.additionalRecords,
    );
  }

  return validated;
}

function getStoredRecordForValidation(
  storage: DurableObjectStorage,
  recordId: string,
  additionalRecords: StoredRecord[] | undefined,
) {
  return (
    additionalRecords?.find((record) => record.id === recordId && !record.deletedAt) ??
    getStoredRecord(storage, recordId)
  );
}

function getBootstrapRecordsForValidation(
  storage: DurableObjectStorage,
  additionalRecords: StoredRecord[] | undefined,
) {
  return [...getBootstrapRecords(storage), ...(additionalRecords ?? [])];
}

function assertRuntimeHistoryAllowsGenericMutation(
  schema: AppSchema,
  entityName: string,
  op: Mutation["op"],
) {
  const history = runtimeControlPlaneEntityMetadata(schema, entityName)?.history;

  if (!history) {
    return;
  }

  if (history.kind === "actionCreated") {
    throw new BadRequestError(
      `Entity "${entityName}" history records must be created through schema actions.`,
    );
  }

  if (op !== "create") {
    throw new BadRequestError(`Entity "${entityName}" history records are append-only.`);
  }
}

function assertImmutableFieldsNotPatched(
  schema: AppSchema,
  entityName: string,
  patchValues: Partial<RecordValues>,
) {
  const immutableFields = runtimeControlPlaneEntityMetadata(schema, entityName)?.immutableFields;

  if (!immutableFields) {
    return;
  }

  for (const fieldName of Object.keys(patchValues)) {
    if (immutableFields.includes(fieldName)) {
      throw new BadRequestError(`Field "${entityName}.${fieldName}" is immutable.`);
    }
  }
}

function assertControlPlaneRecordValuesAreDisplaySafe(
  values: RecordValues,
  schema: AppSchema,
  entityName: string,
) {
  const metadata = runtimeControlPlaneEntityMetadata(schema, entityName);

  if (!metadata) {
    return;
  }

  for (const [fieldName, value] of Object.entries(values)) {
    const isSecretReferenceField = metadata.secretReferenceFields?.includes(fieldName) ?? false;

    if (!isSecretReferenceField && isForbiddenControlPlaneFieldName(fieldName)) {
      throw new BadRequestError(
        `Field "${entityName}.${fieldName}" cannot store control-plane secrets or provider truth.`,
      );
    }

    if (typeof value === "string") {
      assertControlPlaneStringValueIsDisplaySafe(entityName, fieldName, value);
    }
  }
}

function assertControlPlaneStringValueIsDisplaySafe(
  entityName: string,
  fieldName: string,
  value: string,
) {
  if (containsForbiddenControlPlaneSecretValue(value)) {
    throw new BadRequestError(
      `Field "${entityName}.${fieldName}" cannot store control-plane secret values.`,
    );
  }

  const parsed = parseMaybeJson(value);

  if (parsed !== undefined) {
    assertControlPlaneJsonValueIsDisplaySafe(entityName, fieldName, parsed);
  }
}

function assertControlPlaneJsonValueIsDisplaySafe(
  entityName: string,
  fieldName: string,
  value: unknown,
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertControlPlaneJsonValueIsDisplaySafe(entityName, fieldName, item);
    }

    return;
  }

  if (typeof value === "string") {
    assertControlPlaneStringValueIsDisplaySafe(entityName, fieldName, value);
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (isForbiddenControlPlaneFieldName(key)) {
      throw new BadRequestError(
        `Field "${entityName}.${fieldName}" cannot store control-plane secrets or provider truth.`,
      );
    }

    assertControlPlaneJsonValueIsDisplaySafe(entityName, fieldName, item);
  }
}

function parseMaybeJson(value: string): Record<string, unknown> | unknown[] | undefined {
  const trimmed = value.trim();

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    return Array.isArray(parsed) || isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isForbiddenControlPlaneFieldName(fieldName: string) {
  const normalized = normalizeControlPlaneSecretText(fieldName);

  return (
    normalized.includes("api_token") ||
    normalized.includes("access_token") ||
    normalized.includes("auth_token") ||
    normalized.includes("password") ||
    normalized.includes("secret_value") ||
    normalized.includes("raw_lease_token") ||
    normalized.includes("lease_token") ||
    normalized.includes("alchemy_state_token") ||
    normalized.includes("provider_truth") ||
    normalized.includes("provider_state") ||
    normalized.includes("provider_resource_json") ||
    normalized.includes("provider_resources_json")
  );
}

function containsForbiddenControlPlaneSecretValue(value: string) {
  const normalized = normalizeControlPlaneSecretText(value);

  return (
    normalized.includes("cf_api_token") ||
    normalized.includes("cloudflare_api_token") ||
    normalized.includes("alchemy_password") ||
    normalized.includes("alchemy_state_token") ||
    normalized.includes("raw_lease_token") ||
    normalized.includes("lease_token") ||
    value.includes("-----BEGIN PRIVATE KEY-----")
  );
}

function normalizeControlPlaneSecretText(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function validateRuntimeControlPlaneValues(
  values: RecordValues,
  schema: AppSchema,
  entityName: string,
  storage: DurableObjectStorage,
  existingRecordId: string | undefined,
  additionalRecords: StoredRecord[] | undefined,
) {
  const metadata = runtimeControlPlaneEntityMetadata(schema, entityName);
  const routeValidation = metadata?.routeValidation;

  if (routeValidation) {
    validateRuntimeRouteValues(
      values,
      routeValidation,
      entityName,
      storage,
      existingRecordId,
      additionalRecords,
    );
  }

  if (isInstanceControlPlaneRouteValidationEntity(schema, entityName)) {
    validateInstanceControlPlaneRouteValues(values, storage, existingRecordId, additionalRecords);
  }
}

function validateRuntimeRouteValues(
  values: RecordValues,
  routeValidation: RuntimeSchemaRouteValidationSchema,
  entityName: string,
  storage: DurableObjectStorage,
  existingRecordId: string | undefined,
  additionalRecords: StoredRecord[] | undefined,
) {
  const path = stringRecordValue(values, routeValidation.pathField);
  const prefix =
    routeValidation.prefixField === undefined
      ? undefined
      : optionalStringRecordValue(values, routeValidation.prefixField);
  const routeKind = stringRecordValue(values, routeValidation.routeKindField);
  const packageCapability = stringRecordValue(values, routeValidation.packageCapabilityField);
  const expectedCapability = routeValidation.routeKindCapabilities[routeKind];
  const reservedPaths = routeValidation.reservedPaths ?? [];

  if (!isRuntimeRouteSafePath(path, reservedPaths)) {
    throw new BadRequestError(`Field "${routeValidation.pathField}" must be a route-safe path.`);
  }

  if (prefix !== undefined && !isRuntimeRouteSafePrefix(prefix, reservedPaths)) {
    throw new BadRequestError(
      `Field "${routeValidation.prefixField}" must be a route-safe prefix.`,
    );
  }

  if (expectedCapability === undefined || packageCapability !== expectedCapability) {
    throw new BadRequestError(
      `Field "${routeValidation.packageCapabilityField}" is incompatible with route kind "${routeKind}".`,
    );
  }

  if (values[routeValidation.enabledField] === true) {
    assertEnabledRouteIsUnique(
      storage,
      entityName,
      values,
      routeValidation.pathField,
      routeValidation.prefixField,
      routeValidation.enabledField,
      existingRecordId,
      additionalRecords,
    );
  }
}

function assertEnabledRouteIsUnique(
  storage: DurableObjectStorage,
  entityName: string,
  values: RecordValues,
  pathField: string,
  prefixField: string | undefined,
  enabledField: string,
  existingRecordId: string | undefined,
  additionalRecords: StoredRecord[] | undefined,
) {
  const path = values[pathField];
  const prefix = prefixField === undefined ? undefined : values[prefixField];

  for (const record of getBootstrapRecordsForValidation(storage, additionalRecords)) {
    if (
      record.id === existingRecordId ||
      record.entity !== entityName ||
      record.deletedAt ||
      record.values[enabledField] !== true
    ) {
      continue;
    }

    if (record.values[pathField] === path) {
      throw new BadRequestError(`Enabled route path "${String(path)}" is already in use.`);
    }

    if (
      prefixField !== undefined &&
      prefix !== undefined &&
      record.values[prefixField] === prefix
    ) {
      throw new BadRequestError(`Enabled route prefix "${String(prefix)}" is already in use.`);
    }
  }
}

function isInstanceControlPlaneRouteValidationEntity(schema: AppSchema, entityName: string) {
  if (entityName !== "route" || !runtimeControlPlaneEntityMetadata(schema, entityName)) {
    return false;
  }

  const entity = schema.entities.route;

  return (
    entity?.fields.enabled?.type === "boolean" &&
    entity.fields.matchHost?.type === "text" &&
    entity.fields.matchPath?.type === "text" &&
    entity.fields.matchPrefix?.type === "text" &&
    entity.fields.kind?.type === "enum" &&
    entity.fields.targetProfile?.type === "enum" &&
    entity.fields.appInstall?.type === "reference" &&
    entity.fields.surface?.type === "enum" &&
    entity.fields.providerConfig?.type === "reference" &&
    entity.fields.toHost?.type === "text" &&
    entity.fields.toUrl?.type === "text" &&
    entity.fields.statusCode?.type === "enum"
  );
}

function validateInstanceControlPlaneRouteValues(
  values: RecordValues,
  storage: DurableObjectStorage,
  existingRecordId: string | undefined,
  additionalRecords: StoredRecord[] | undefined,
) {
  const matchHost = optionalStringRecordValue(values, "matchHost");
  const matchPath = stringRecordValue(values, "matchPath");
  const matchPrefix = optionalStringRecordValue(values, "matchPrefix");
  const kind = stringRecordValue(values, "kind");
  const providerConfig = optionalStringRecordValue(values, "providerConfig");

  if (matchHost !== undefined) {
    assertNormalizedExactHost("matchHost", matchHost);
  }

  assertNormalizedAbsoluteMatchPath("matchPath", matchPath);

  if (matchPrefix !== undefined) {
    assertNormalizedMatchPrefix(matchPath, matchPrefix);
  }

  if (providerConfig !== undefined && matchHost === undefined) {
    throw new BadRequestError(
      'Field "providerConfig" can only be set on exact-host route records.',
    );
  }

  if (kind === "mount") {
    validateInstanceControlPlaneMountRoute(
      values,
      storage,
      matchHost,
      matchPath,
      matchPrefix,
      additionalRecords,
    );
  } else if (kind === "redirect") {
    validateInstanceControlPlaneRedirectRoute(values, matchHost);
  } else {
    throw new BadRequestError('Field "kind" must be "mount" or "redirect".');
  }

  if (values.enabled === true) {
    assertEnabledInstanceControlPlaneRouteIsUnique(
      values,
      storage,
      existingRecordId,
      additionalRecords,
    );
  }
}

function validateInstanceControlPlaneMountRoute(
  values: RecordValues,
  storage: DurableObjectStorage,
  matchHost: string | undefined,
  matchPath: string,
  matchPrefix: string | undefined,
  additionalRecords: StoredRecord[] | undefined,
) {
  const targetProfile = optionalStringRecordValue(values, "targetProfile");
  const appInstall = optionalStringRecordValue(values, "appInstall");
  const surface = optionalStringRecordValue(values, "surface");

  if (optionalStringRecordValue(values, "toHost") !== undefined) {
    throw new BadRequestError('Field "toHost" is incompatible with mount routes.');
  }

  if (optionalStringRecordValue(values, "toUrl") !== undefined) {
    throw new BadRequestError('Field "toUrl" is incompatible with mount routes.');
  }

  if (optionalStringRecordValue(values, "statusCode") !== undefined) {
    throw new BadRequestError('Field "statusCode" is incompatible with mount routes.');
  }

  if (targetProfile === undefined) {
    throw new BadRequestError('Field "targetProfile" is required for mount routes.');
  }

  if (targetProfile === "instance") {
    if (appInstall !== undefined) {
      throw new BadRequestError('Field "appInstall" is incompatible with instance mount routes.');
    }

    if (surface !== undefined && surface !== "admin") {
      throw new BadRequestError('Field "surface" is incompatible with instance mount routes.');
    }

    return;
  }

  if (targetProfile !== "app" && targetProfile !== "public-site") {
    throw new BadRequestError('Field "targetProfile" is invalid for mount routes.');
  }

  if (appInstall === undefined) {
    throw new BadRequestError(`Field "appInstall" is required for ${targetProfile} mount routes.`);
  }

  const install = getStoredRecordForValidation(storage, appInstall, additionalRecords);

  if (!install || install.entity !== "app-install" || install.deletedAt) {
    throw new BadRequestError(
      `Field "appInstall" references unknown app-install record "${appInstall}".`,
    );
  }

  if (install.values.status !== "installed") {
    throw new BadRequestError(
      `Field "appInstall" references non-installed app-install record "${appInstall}".`,
    );
  }

  if (targetProfile === "app") {
    if (surface !== "admin" && surface !== "schema") {
      throw new BadRequestError(
        'Field "surface" must be "admin" or "schema" for app mount routes.',
      );
    }

    return;
  }

  if (surface !== "public-site") {
    throw new BadRequestError(
      'Field "surface" must be "public-site" for public-site mount routes.',
    );
  }

  if (install.values.packageAppKey !== "site") {
    throw new BadRequestError(
      `Field "appInstall" references app-install record "${appInstall}" without public Site capability.`,
    );
  }

  if (matchHost !== undefined && (matchPath !== "/" || matchPrefix !== "/")) {
    throw new BadRequestError(
      'Host-mounted public Site routes must set field "matchPath" to "/" and field "matchPrefix" to "/".',
    );
  }
}

function validateInstanceControlPlaneRedirectRoute(
  values: RecordValues,
  matchHost: string | undefined,
) {
  if (matchHost === undefined) {
    throw new BadRequestError('Field "matchHost" is required for redirect routes.');
  }

  for (const fieldName of ["targetProfile", "appInstall", "surface"] as const) {
    if (optionalStringRecordValue(values, fieldName) !== undefined) {
      throw new BadRequestError(`Field "${fieldName}" is incompatible with redirect routes.`);
    }
  }

  const toHost = optionalStringRecordValue(values, "toHost");
  const toUrl = optionalStringRecordValue(values, "toUrl");

  if (
    (toHost === undefined && toUrl === undefined) ||
    (toHost !== undefined && toUrl !== undefined)
  ) {
    throw new BadRequestError(
      'Redirect routes must set exactly one of field "toHost" or field "toUrl".',
    );
  }

  if (toHost !== undefined) {
    assertNormalizedExactHost("toHost", toHost);
  }

  if (toUrl !== undefined) {
    assertNormalizedHttpsUrl("toUrl", toUrl);
  }

  if (optionalStringRecordValue(values, "statusCode") === undefined) {
    throw new BadRequestError('Field "statusCode" is required for redirect routes.');
  }

  if (typeof values.preservePath !== "boolean") {
    throw new BadRequestError('Field "preservePath" is required for redirect routes.');
  }

  if (typeof values.preserveQueryString !== "boolean") {
    throw new BadRequestError('Field "preserveQueryString" is required for redirect routes.');
  }
}

function assertNormalizedExactHost(fieldName: string, value: string) {
  const normalized = normalizeInstanceDomainHost(value);

  if (!normalized.ok || normalized.host !== value) {
    throw new BadRequestError(`Field "${fieldName}" must be a normalized exact host.`);
  }
}

function assertNormalizedHttpsUrl(fieldName: string, value: string) {
  try {
    const url = new URL(value);
    const normalizedHost = normalizeInstanceDomainHost(url.hostname);
    const normalized = url.toString().replace(/\/$/, "");

    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.hash !== "" ||
      !normalizedHost.ok ||
      normalizedHost.host !== url.hostname ||
      normalized !== value
    ) {
      throw new Error("invalid URL");
    }
  } catch {
    throw new BadRequestError(
      `Field "${fieldName}" must be a normalized absolute HTTPS URL without credentials or fragment.`,
    );
  }
}

function assertNormalizedAbsoluteMatchPath(fieldName: string, value: string) {
  if (!isNormalizedAbsoluteRoutePath(value)) {
    throw new BadRequestError(`Field "${fieldName}" must be a normalized absolute path.`);
  }
}

function assertNormalizedMatchPrefix(matchPath: string, matchPrefix: string) {
  const normalizedPrefix =
    matchPrefix === "/" ? matchPrefix : matchPrefix.endsWith("/") ? matchPrefix.slice(0, -1) : "";

  if (matchPrefix !== "/" && !matchPrefix.endsWith("/")) {
    throw new BadRequestError('Field "matchPrefix" must be a normalized absolute path prefix.');
  }

  if (matchPrefix !== "/" && !isNormalizedAbsoluteRoutePath(normalizedPrefix)) {
    throw new BadRequestError('Field "matchPrefix" must be a normalized absolute path prefix.');
  }

  if (matchPath === "/") {
    if (matchPrefix !== "/") {
      throw new BadRequestError('Field "matchPrefix" must begin at or below field "matchPath".');
    }

    return;
  }

  if (!matchPrefix.startsWith(`${matchPath}/`)) {
    throw new BadRequestError('Field "matchPrefix" must begin at or below field "matchPath".');
  }
}

function isNormalizedAbsoluteRoutePath(value: string) {
  if (value === "/") {
    return true;
  }

  if (!/^\/[a-z0-9._~-]+(?:\/[a-z0-9._~-]+)*$/.test(value)) {
    return false;
  }

  const segments = value.slice(1).split("/");

  if (segments.some((segment) => segment === "." || segment === "..")) {
    return false;
  }

  return !instanceControlPlaneReservedRoutePaths.some(
    (reservedPath) => value === reservedPath || value.startsWith(`${reservedPath}/`),
  );
}

function assertEnabledInstanceControlPlaneRouteIsUnique(
  values: RecordValues,
  storage: DurableObjectStorage,
  existingRecordId: string | undefined,
  additionalRecords: StoredRecord[] | undefined,
) {
  const candidate = instanceRouteMatch(values);

  for (const record of getBootstrapRecordsForValidation(storage, additionalRecords)) {
    if (
      record.id === existingRecordId ||
      record.entity !== "route" ||
      record.deletedAt ||
      record.values.enabled !== true
    ) {
      continue;
    }

    const existing = instanceRouteMatch(record.values);

    if (candidate.host !== existing.host || !instanceRoutesOverlap(candidate, existing)) {
      continue;
    }

    throw new BadRequestError(
      `Enabled route match "${formatInstanceRouteMatch(candidate)}" conflicts with enabled route "${record.id}".`,
    );
  }
}

function instanceRouteMatch(values: RecordValues): {
  host: string;
  path: string;
  prefix?: string;
} {
  return {
    host: optionalStringRecordValue(values, "matchHost") ?? "<hostless>",
    path: stringRecordValue(values, "matchPath"),
    ...(optionalStringRecordValue(values, "matchPrefix") === undefined
      ? {}
      : { prefix: optionalStringRecordValue(values, "matchPrefix") }),
  };
}

function instanceRoutesOverlap(
  left: { path: string; prefix?: string },
  right: { path: string; prefix?: string },
) {
  return (
    left.path === right.path ||
    (left.prefix !== undefined && routePathMatchesPrefix(right.path, left.prefix)) ||
    (right.prefix !== undefined && routePathMatchesPrefix(left.path, right.prefix)) ||
    (left.prefix !== undefined &&
      right.prefix !== undefined &&
      routePrefixesOverlap(left.prefix, right.prefix))
  );
}

function routePathMatchesPrefix(path: string, prefix: string) {
  return prefix === "/" || path.startsWith(prefix);
}

function routePrefixesOverlap(left: string, right: string) {
  return left === "/" || right === "/" || left.startsWith(right) || right.startsWith(left);
}

function formatInstanceRouteMatch(match: { host: string; path: string; prefix?: string }) {
  return `${match.host}${match.path}${match.prefix === undefined ? "" : ` ${match.prefix}`}`;
}

function stringRecordValue(values: RecordValues, fieldName: string): string {
  const value = values[fieldName];

  if (typeof value !== "string") {
    throw new BadRequestError(`Field "${fieldName}" must be a string.`);
  }

  return value;
}

function optionalStringRecordValue(values: RecordValues, fieldName: string): string | undefined {
  const value = values[fieldName];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new BadRequestError(`Field "${fieldName}" must be a string.`);
  }

  return value;
}

function isRuntimeRouteSafePath(path: string, reservedPaths: readonly string[]) {
  if (!/^\/[a-z0-9._~-]+(?:\/[a-z0-9._~-]+)*$/.test(path)) {
    return false;
  }

  return !reservedPaths.some(
    (reservedPath) => path === reservedPath || path.startsWith(`${reservedPath}/`),
  );
}

function isRuntimeRouteSafePrefix(prefix: string, reservedPaths: readonly string[]) {
  if (!prefix.endsWith("/")) {
    return false;
  }

  return isRuntimeRouteSafePath(prefix.slice(0, -1), reservedPaths);
}

function assertNoActiveInboundReferences(
  targetRecord: StoredRecord,
  schema: AppSchema,
  storage: DurableObjectStorage,
) {
  for (const record of getBootstrapRecords(storage)) {
    if (record.deletedAt) {
      continue;
    }

    const entity = schema.entities[record.entity];

    if (!entity) {
      continue;
    }

    for (const [fieldName, field] of Object.entries(entity.fields)) {
      if (
        field.type === "reference" &&
        field.to === targetRecord.entity &&
        record.values[fieldName] === targetRecord.id
      ) {
        throw new BadRequestError(
          `Cannot delete record "${targetRecord.id}" because active ${record.entity} record "${record.id}" references it through field "${record.entity}.${fieldName}".`,
        );
      }
    }
  }
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
