import type { SourceSchemaHash } from "@dpeek/formless-installed-apps";
import {
  formatQualifiedEntityName,
  isValidStoredFieldValue,
  parseAppSchema,
  parseQualifiedEntityName,
  type FieldSchema,
} from "@dpeek/formless-schema";
import {
  parseStorageSnapshot,
  type RecordValues,
  type StorageSnapshot,
  type StoredRecord,
} from "@dpeek/formless-storage";
import { identityControlPlaneSourceSchema } from "./schema.ts";
import {
  IDENTITY_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY,
  IDENTITY_CONTROL_PLANE_SCHEMA_KEY,
  IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY,
  identityControlPlaneEntityNames,
  type IdentityControlPlaneEntityName,
  type IdentityControlPlaneRecordValuesByEntity,
} from "./types.ts";

export * from "./types.ts";
export { identityControlPlaneSourceSchema } from "./schema.ts";

export const IDENTITY_CONTROL_PLANE_SOURCE_SCHEMA_HASH =
  "sha256:7ad96491387d5ceb2df2d50d8ad231b5928b20833f445843d945a1c57c201742" satisfies SourceSchemaHash;

export const identityControlPlaneSchemaProvenance = {
  kind: "identity-control-plane",
  sourceSchemaHash: IDENTITY_CONTROL_PLANE_SOURCE_SCHEMA_HASH,
} as const;

export const identityControlPlaneSchema = parseAppSchema(identityControlPlaneSourceSchema);

export type IdentityControlPlaneRecord<Entity extends IdentityControlPlaneEntityName> = {
  createdAt: string;
  deletedAt?: string;
  entity: Entity;
  id: string;
  updatedAt: string;
  values: IdentityControlPlaneRecordValuesByEntity[Entity];
};

export type AnyIdentityControlPlaneRecord = {
  [Entity in IdentityControlPlaneEntityName]: IdentityControlPlaneRecord<Entity>;
}[IdentityControlPlaneEntityName];

export type IdentityControlPlaneRecordValidationOptions = {
  context?: string;
  sourceLabel?: string;
};

export function isIdentityControlPlaneEntityName(
  value: string,
): value is IdentityControlPlaneEntityName {
  return identityControlPlaneEntityNames.includes(value as IdentityControlPlaneEntityName);
}

export function formatIdentityControlPlaneBoundaryEntityName(
  entityName: IdentityControlPlaneEntityName,
): string {
  return formatQualifiedEntityName({
    schemaKey: IDENTITY_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY,
    entityKey: entityName,
  });
}

export function parseIdentityControlPlaneBoundaryEntityName(
  context: string,
  value: string,
): IdentityControlPlaneEntityName {
  const qualifiedName = parseQualifiedEntityName(context, value);

  if (qualifiedName.schemaKey !== IDENTITY_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY) {
    throw new Error(
      `${context} schema key must be "${IDENTITY_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY}".`,
    );
  }

  if (!isIdentityControlPlaneEntityName(qualifiedName.entityKey)) {
    throw new Error(`${context} "${value}" is not an identity control-plane entity.`);
  }

  return qualifiedName.entityKey;
}

export function parseIdentityControlPlaneEntityName(
  context: string,
  value: unknown,
): IdentityControlPlaneEntityName {
  const entity = parseNonEmptyString(context, value);

  if (isIdentityControlPlaneEntityName(entity)) {
    return entity;
  }

  return parseIdentityControlPlaneBoundaryEntityName(context, entity);
}

export function identityControlPlaneRecordSourceEntityName(
  value: string,
): IdentityControlPlaneEntityName | undefined {
  const localEntity = value.startsWith(`${IDENTITY_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY}:`)
    ? tryParseBoundaryEntityName(value)
    : isIdentityControlPlaneEntityName(value)
      ? value
      : undefined;

  return localEntity !== undefined && isIdentityControlPlaneEntityName(localEntity)
    ? localEntity
    : undefined;
}

export function parseIdentityControlPlaneStorageSnapshot(
  context: string,
  value: unknown,
  options: IdentityControlPlaneRecordValidationOptions = {},
): StorageSnapshot {
  const snapshot = parseStorageSnapshot(value, {
    schemaKey: IDENTITY_CONTROL_PLANE_SCHEMA_KEY,
    storageIdentity: IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY,
  });

  validateIdentityControlPlaneRecords(`${context} records`, snapshot.records, options);

  return snapshot;
}

export function reviewableIdentityControlPlaneStorageSnapshot(
  snapshot: StorageSnapshot,
  options: IdentityControlPlaneRecordValidationOptions = {},
): StorageSnapshot {
  const parsed = parseStorageSnapshot(snapshot, {
    schemaKey: IDENTITY_CONTROL_PLANE_SCHEMA_KEY,
    storageIdentity: IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY,
  });
  const records = reviewableIdentityControlPlaneRecords(parsed.records, options);

  return {
    ...parsed,
    records,
    sourceCursor: records.length,
  };
}

export function parseIdentityControlPlaneRecords(context: string, value: unknown): StoredRecord[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  return value.map((record, index) =>
    parseIdentityControlPlaneRecord(`${context}[${index}]`, record),
  );
}

export function reviewableIdentityControlPlaneRecords(
  records: readonly StoredRecord[],
  options: IdentityControlPlaneRecordValidationOptions = {},
): StoredRecord[] {
  const context = options.context ?? "Identity control-plane record source records";
  const sourceLabel = options.sourceLabel ?? "Identity control-plane record source";
  const sourceRecords: StoredRecord[] = [];

  for (const record of records) {
    const entity = identityControlPlaneRecordSourceEntityName(record.entity);

    if (entity === undefined) {
      throw new Error(
        `${sourceLabel} does not support entity "${identityEntityLabel(record.entity)}".`,
      );
    }

    sourceRecords.push(canonicalIdentityControlPlaneRecord({ ...record, entity }));
  }

  validateIdentityControlPlaneRecords(context, sourceRecords, options);

  return sourceRecords;
}

export function validateIdentityControlPlaneRecords(
  context: string,
  records: readonly StoredRecord[],
  _options: IdentityControlPlaneRecordValidationOptions = {},
) {
  const recordsById = new Map<string, StoredRecord>();

  for (const record of records) {
    if (recordsById.has(record.id)) {
      throw new Error(`${context} includes duplicate identity record id "${record.id}".`);
    }

    recordsById.set(record.id, record);
  }

  for (const record of records) {
    validateIdentityControlPlaneRecord(context, record, recordsById);
  }

  validateUniqueNormalizedEmails(context, records);
  validateUniqueRoleKeys(context, records);
  validateUniqueActiveMemberships(context, records);
  validateUniqueActiveRoleAssignments(context, records);
  validateUniqueActiveAppRegistrations(context, records);
}

export function reviewableIdentityControlPlaneRecordValues(
  _entity: IdentityControlPlaneEntityName,
  values: RecordValues,
): RecordValues {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([fieldName]) => fieldName !== "createdAt" && fieldName !== "updatedAt",
    ),
  ) as RecordValues;
}

function parseIdentityControlPlaneRecord(context: string, value: unknown): StoredRecord {
  if (!isPlainRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(
    context,
    value,
    ["id", "entity", "values", "createdAt", "updatedAt"],
    ["deletedAt"],
  );

  const id = parseNonEmptyString(`${context} id`, value.id);
  const entity = parseIdentityControlPlaneEntityName(
    `${context} record "${id}" entity`,
    value.entity,
  );

  return {
    id,
    entity,
    values: parseRecordValues(`${context} values`, value.values),
    createdAt: parseIsoTimestamp(`${context} createdAt`, value.createdAt),
    updatedAt: parseIsoTimestamp(`${context} updatedAt`, value.updatedAt),
    ...(value.deletedAt === undefined
      ? {}
      : { deletedAt: parseIsoTimestamp(`${context} deletedAt`, value.deletedAt) }),
  };
}

function validateIdentityControlPlaneRecord(
  context: string,
  record: StoredRecord,
  recordsById: ReadonlyMap<string, StoredRecord>,
) {
  const entity = identityControlPlaneRecordSourceEntityName(record.entity);

  if (entity === undefined) {
    throw new Error(
      `${context} record "${record.id}" references unknown entity "${identityEntityLabel(record.entity)}".`,
    );
  }

  const entitySchema = identityControlPlaneSchema.entities[entity];
  const fields = entitySchema.fields as Record<string, FieldSchema>;

  assertIdentityRecordValuesAreDisplaySafe(context, record);

  for (const fieldName of Object.keys(record.values)) {
    if (!fields[fieldName]) {
      throw new Error(
        `${context} record "${record.id}" includes unknown field "${identityFieldLabel(record, fieldName)}".`,
      );
    }
  }

  for (const [fieldName, field] of Object.entries(fields)) {
    const value = record.values[fieldName];

    if (!isValidStoredFieldValue(value, field)) {
      throw new Error(
        `${context} record "${record.id}" has invalid field "${identityFieldLabel(record, fieldName)}".`,
      );
    }

    if (field.type === "reference" && value !== undefined) {
      validateIdentityControlPlaneReference(
        context,
        record,
        fieldName,
        field.to,
        value,
        recordsById,
      );
    }
  }

  if (entity === "membership") {
    validateMembershipRecord(context, record);
  }

  if (entity === "role-assignment") {
    validateRoleAssignmentRecord(context, record);
  }

  if (entity === "app-registration") {
    validateAppRegistrationRecord(context, record);
  }

  if (entity === "invitation") {
    validateInvitationRecord(context, record);
  }
}

function validateIdentityControlPlaneReference(
  context: string,
  record: StoredRecord,
  fieldName: string,
  entityName: string,
  value: RecordValues[string],
  recordsById: ReadonlyMap<string, StoredRecord>,
) {
  if (typeof value !== "string") {
    return;
  }

  const target = recordsById.get(value);

  if (!target) {
    throw new Error(
      `${context} record "${record.id}" field "${identityFieldLabel(record, fieldName)}" references unknown ${identityEntityLabel(entityName)} record "${value}".`,
    );
  }

  if (identityControlPlaneRecordSourceEntityName(target.entity) !== entityName) {
    throw new Error(
      `${context} record "${record.id}" field "${identityFieldLabel(record, fieldName)}" must reference a ${identityEntityLabel(entityName)} record.`,
    );
  }

  if (target.deletedAt) {
    throw new Error(
      `${context} record "${record.id}" field "${identityFieldLabel(record, fieldName)}" cannot reference tombstoned record "${value}".`,
    );
  }
}

function validateUniqueNormalizedEmails(context: string, records: readonly StoredRecord[]) {
  const seen = new Set<string>();

  for (const record of activeRecordsForEntity(records, "principal-email")) {
    const normalizedEmail = requiredStringValue(context, record, "normalizedEmail");

    if (seen.has(normalizedEmail)) {
      throw new Error(
        `${context} violates unique constraint "${formatIdentityControlPlaneBoundaryEntityName("principal-email")}.uniqueNormalizedEmail".`,
      );
    }

    seen.add(normalizedEmail);
  }
}

function validateUniqueRoleKeys(context: string, records: readonly StoredRecord[]) {
  const seen = new Set<string>();

  for (const record of activeRecordsForEntity(records, "role")) {
    const roleKey = requiredStringValue(context, record, "key");

    if (seen.has(roleKey)) {
      throw new Error(
        `${context} violates unique constraint "${formatIdentityControlPlaneBoundaryEntityName("role")}.uniqueKey".`,
      );
    }

    seen.add(roleKey);
  }
}

function validateUniqueActiveMemberships(context: string, records: readonly StoredRecord[]) {
  const seen = new Set<string>();

  for (const record of activeStatusRecordsForEntity(records, "membership")) {
    const key = identityUniqueKey([
      requiredStringValue(context, record, "principal"),
      requiredStringValue(context, record, "targetKind"),
      selectedMembershipTargetValue(context, record),
    ]);

    if (seen.has(key)) {
      throw new Error(
        `${context} violates identity uniqueness "${formatIdentityControlPlaneBoundaryEntityName("membership")}.uniqueActiveMembership".`,
      );
    }

    seen.add(key);
  }
}

function validateUniqueActiveRoleAssignments(context: string, records: readonly StoredRecord[]) {
  const seen = new Set<string>();

  for (const record of activeStatusRecordsForEntity(records, "role-assignment")) {
    const key = identityUniqueKey([
      requiredStringValue(context, record, "role"),
      requiredStringValue(context, record, "targetKind"),
      selectedRoleAssignmentTargetValue(context, record),
      requiredStringValue(context, record, "scopeKind"),
      selectedRoleAssignmentScopeValue(context, record),
    ]);

    if (seen.has(key)) {
      throw new Error(
        `${context} violates identity uniqueness "${formatIdentityControlPlaneBoundaryEntityName("role-assignment")}.uniqueActiveAssignment".`,
      );
    }

    seen.add(key);
  }
}

function validateUniqueActiveAppRegistrations(context: string, records: readonly StoredRecord[]) {
  const seen = new Set<string>();

  for (const record of activeStatusRecordsForEntity(records, "app-registration")) {
    const key = identityUniqueKey([
      requiredStringValue(context, record, "appInstallId"),
      requiredStringValue(context, record, "targetKind"),
      selectedAppRegistrationTargetValue(context, record),
    ]);

    if (seen.has(key)) {
      throw new Error(
        `${context} violates identity uniqueness "${formatIdentityControlPlaneBoundaryEntityName("app-registration")}.uniqueActiveRegistration".`,
      );
    }

    seen.add(key);
  }
}

function activeRecordsForEntity(
  records: readonly StoredRecord[],
  entityName: IdentityControlPlaneEntityName,
) {
  return records.filter(
    (record) =>
      identityControlPlaneRecordSourceEntityName(record.entity) === entityName && !record.deletedAt,
  );
}

function activeStatusRecordsForEntity(
  records: readonly StoredRecord[],
  entityName: IdentityControlPlaneEntityName,
) {
  return activeRecordsForEntity(records, entityName).filter(
    (record) => record.values.status === "active",
  );
}

function validateMembershipRecord(context: string, record: StoredRecord) {
  const targetKind = requiredStringValue(context, record, "targetKind");

  assertSelectedTargetField(context, record, "targetKind", targetKind, {
    group: "targetGroup",
    organization: "targetOrganization",
  });
}

function validateRoleAssignmentRecord(context: string, record: StoredRecord) {
  const targetKind = requiredStringValue(context, record, "targetKind");
  const scopeKind = requiredStringValue(context, record, "scopeKind");

  assertSelectedTargetField(context, record, "targetKind", targetKind, {
    group: "targetGroup",
    organization: "targetOrganization",
    principal: "targetPrincipal",
  });
  assertSelectedTargetField(context, record, "scopeKind", scopeKind, {
    "app-install": "appInstallId",
    organization: "scopeOrganization",
  });

  if (scopeKind === "instance") {
    assertUnsetFields(context, record, "scopeKind", ["appInstallId", "scopeOrganization"]);
  }
}

function validateAppRegistrationRecord(context: string, record: StoredRecord) {
  const targetKind = requiredStringValue(context, record, "targetKind");

  assertSelectedTargetField(context, record, "targetKind", targetKind, {
    organization: "targetOrganization",
    principal: "targetPrincipal",
  });
}

function validateInvitationRecord(context: string, record: StoredRecord) {
  const targetSurface = requiredStringValue(context, record, "targetSurface");

  assertSelectedTargetField(context, record, "targetSurface", targetSurface, {
    "app-install": "targetAppInstallId",
    organization: "targetOrganization",
  });

  if (targetSurface === "instance") {
    assertUnsetFields(context, record, "targetSurface", [
      "targetAppInstallId",
      "targetOrganization",
    ]);
  }
}

function selectedMembershipTargetValue(context: string, record: StoredRecord): string {
  const targetKind = requiredStringValue(context, record, "targetKind");

  if (targetKind === "group") {
    return requiredStringValue(context, record, "targetGroup");
  }

  return requiredStringValue(context, record, "targetOrganization");
}

function selectedRoleAssignmentTargetValue(context: string, record: StoredRecord): string {
  const targetKind = requiredStringValue(context, record, "targetKind");

  if (targetKind === "group") {
    return requiredStringValue(context, record, "targetGroup");
  }

  if (targetKind === "organization") {
    return requiredStringValue(context, record, "targetOrganization");
  }

  return requiredStringValue(context, record, "targetPrincipal");
}

function selectedRoleAssignmentScopeValue(context: string, record: StoredRecord): string {
  const scopeKind = requiredStringValue(context, record, "scopeKind");

  if (scopeKind === "app-install") {
    return requiredStringValue(context, record, "appInstallId");
  }

  if (scopeKind === "organization") {
    return requiredStringValue(context, record, "scopeOrganization");
  }

  return "";
}

function selectedAppRegistrationTargetValue(context: string, record: StoredRecord): string {
  const targetKind = requiredStringValue(context, record, "targetKind");

  if (targetKind === "organization") {
    return requiredStringValue(context, record, "targetOrganization");
  }

  return requiredStringValue(context, record, "targetPrincipal");
}

function identityUniqueKey(values: readonly string[]) {
  return JSON.stringify(values);
}

function assertSelectedTargetField(
  context: string,
  record: StoredRecord,
  selectorField: string,
  selectorValue: string,
  selectedFields: Record<string, string>,
) {
  const selectedField = selectedFields[selectorValue];

  if (selectedField === undefined) {
    return;
  }

  const value = record.values[selectedField];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `${context} record "${record.id}" field "${identityFieldLabel(record, selectorField)}" requires field "${identityFieldLabel(record, selectedField)}".`,
    );
  }

  assertUnsetFields(
    context,
    record,
    selectorField,
    Object.values(selectedFields).filter((fieldName) => fieldName !== selectedField),
  );
}

function assertUnsetFields(
  context: string,
  record: StoredRecord,
  selectorField: string,
  fieldNames: readonly string[],
) {
  for (const fieldName of fieldNames) {
    if (record.values[fieldName] !== undefined) {
      throw new Error(
        `${context} record "${record.id}" field "${identityFieldLabel(record, selectorField)}" cannot set field "${identityFieldLabel(record, fieldName)}".`,
      );
    }
  }
}

function assertIdentityRecordValuesAreDisplaySafe(context: string, record: StoredRecord) {
  for (const [fieldName, value] of Object.entries(record.values)) {
    if (isForbiddenIdentityPrivateAuthFieldName(fieldName)) {
      throw new Error(
        `${context} record "${record.id}" field "${identityFieldLabel(record, fieldName)}" cannot store private auth state.`,
      );
    }

    if (typeof value === "string") {
      assertIdentityStringValueIsDisplaySafe(context, record, fieldName, value);
    }
  }
}

function assertIdentityStringValueIsDisplaySafe(
  context: string,
  record: StoredRecord,
  fieldName: string,
  value: string,
) {
  if (value.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new Error(
      `${context} record "${record.id}" field "${identityFieldLabel(record, fieldName)}" cannot store private auth state.`,
    );
  }

  const parsed = parseMaybeJson(value);

  if (parsed !== undefined) {
    assertIdentityJsonValueIsDisplaySafe(context, record, fieldName, parsed);
  }
}

function assertIdentityJsonValueIsDisplaySafe(
  context: string,
  record: StoredRecord,
  fieldName: string,
  value: unknown,
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertIdentityJsonValueIsDisplaySafe(context, record, fieldName, item);
    }

    return;
  }

  if (typeof value === "string") {
    assertIdentityStringValueIsDisplaySafe(context, record, fieldName, value);
    return;
  }

  if (!isPlainRecord(value)) {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (isForbiddenIdentityPrivateAuthFieldName(key)) {
      throw new Error(
        `${context} record "${record.id}" field "${identityFieldLabel(record, fieldName)}" cannot store private auth state.`,
      );
    }

    assertIdentityJsonValueIsDisplaySafe(context, record, fieldName, item);
  }
}

function parseMaybeJson(value: string): Record<string, unknown> | unknown[] | undefined {
  const trimmed = value.trim();

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (Array.isArray(parsed)) {
      return parsed;
    }

    return isPlainRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isForbiddenIdentityPrivateAuthFieldName(fieldName: string) {
  const normalized = normalizeIdentityPrivateAuthText(fieldName);

  return (
    normalized === "token" ||
    normalized.endsWith("_token") ||
    normalized.includes("token_hash") ||
    normalized.includes("raw_token") ||
    normalized.includes("invite_token") ||
    normalized.includes("challenge") ||
    normalized.includes("credential") ||
    normalized.includes("password") ||
    normalized.includes("session") ||
    normalized.includes("cross_domain_grant") ||
    normalized.includes("grant_id") ||
    normalized.includes("recovery_secret") ||
    normalized.includes("provider_response") ||
    normalized.includes("provider_state") ||
    normalized.includes("revocation") ||
    normalized.includes("secret")
  );
}

function normalizeIdentityPrivateAuthText(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function tryParseBoundaryEntityName(value: string): string | undefined {
  try {
    return parseQualifiedEntityName("Identity control-plane record entity", value).entityKey;
  } catch {
    return undefined;
  }
}

function canonicalIdentityControlPlaneRecord(record: StoredRecord): StoredRecord {
  const entity = parseIdentityControlPlaneEntityName(
    `Identity control-plane record "${record.id}" entity`,
    record.entity,
  );

  return {
    id: record.id,
    entity,
    values: stableJsonValue(
      reviewableIdentityControlPlaneRecordValues(entity, record.values),
    ) as RecordValues,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.deletedAt === undefined ? {} : { deletedAt: record.deletedAt }),
  };
}

function requiredStringValue(context: string, record: StoredRecord, fieldName: string): string {
  const value = record.values[fieldName];

  if (typeof value !== "string") {
    throw new Error(
      `${context} record "${record.id}" field "${identityFieldLabel(record, fieldName)}" must be a string.`,
    );
  }

  return value;
}

function identityEntityLabel(entityName: string): string {
  const sourceEntity = identityControlPlaneRecordSourceEntityName(entityName);

  if (sourceEntity !== undefined) {
    return formatIdentityControlPlaneBoundaryEntityName(sourceEntity);
  }

  return entityName;
}

function identityFieldLabel(record: Pick<StoredRecord, "entity">, fieldName: string): string {
  return `${identityEntityLabel(record.entity)}.${fieldName}`;
}

function parseRecordValues(context: string, value: unknown): RecordValues {
  if (!isPlainRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const values: RecordValues = {};

  for (const [fieldName, fieldValue] of Object.entries(value)) {
    if (
      typeof fieldValue !== "string" &&
      typeof fieldValue !== "boolean" &&
      !isFiniteNumber(fieldValue)
    ) {
      throw new Error(`${context} field "${fieldName}" must be a scalar value.`);
    }

    values[fieldName] = fieldValue;
  }

  return values;
}

function parseIsoTimestamp(context: string, value: unknown): string {
  const timestamp = parseNonEmptyString(context, value);
  const date = new Date(timestamp);

  if (Number.isNaN(date.valueOf()) || date.toISOString() !== timestamp) {
    throw new Error(`${context} must be an ISO timestamp.`);
  }

  return timestamp;
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value;
}

function assertExactKeys(
  context: string,
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
) {
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }

  for (const key of requiredKeys) {
    if (!(key in value)) {
      throw new Error(`${context} must include "${key}".`);
    }
  }
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }

  if (!isPlainRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableJsonValue(child)]),
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
