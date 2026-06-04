import {
  INSTANCE_WORKSPACE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY,
  INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_ENTITIES,
  INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_EXCLUDED_ENTITIES,
  INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_KIND,
  INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_VERSION,
  INSTANCE_WORKSPACE_CONTROL_PLANE_SCHEMA_KEY,
} from "./types.ts";
import { normalizeInstanceWorkspaceTargetUrl } from "./manifest.ts";
import type {
  InstanceWorkspaceControlPlaneRecordSourceControlPlane,
  InstanceWorkspaceControlPlaneRecordSourceEntity,
  InstanceWorkspaceControlPlaneRecordSourceFile,
  InstanceWorkspaceManifest,
  InstanceWorkspaceRecordValues,
  InstanceWorkspaceStoredRecord,
} from "./types.ts";

const recordSourceEntitySet = new Set<string>(
  INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_ENTITIES,
);
const excludedRecordSourceEntitySet = new Set<string>(
  INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_EXCLUDED_ENTITIES,
);
const schemaLocalEntityKeyPattern = /^[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$/;
const hostnameLabelPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const instanceControlPlaneReservedRoutePaths = [
  "/api",
  "/assets",
  "/favicon.ico",
  "/favicon.svg",
  "/login",
  "/robots.txt",
  "/schema",
  "/setup",
  "/sitemap.xml",
  "/static",
] as const;

type FieldSpec =
  | { kind: "boolean"; required: boolean; default?: boolean }
  | { kind: "enum"; required: boolean; values: readonly string[] }
  | { kind: "number"; integer?: boolean; min?: number; required: boolean }
  | { kind: "reference"; required: boolean; to: InstanceWorkspaceControlPlaneRecordSourceEntity }
  | { kind: "text"; required: boolean };

type EntitySpec = {
  fields: Record<string, FieldSpec>;
  unique?: readonly (readonly string[])[];
};

const controlPlaneEntitySpecs: Record<InstanceWorkspaceControlPlaneRecordSourceEntity, EntitySpec> =
  {
    "app-install": {
      fields: {
        installId: textField(true),
        packageAppKey: enumField(true, ["crm", "estii", "site", "tasks"]),
        packageRevision: numberField(false, { integer: true, min: 0 }),
        sourceSchemaHash: textField(false),
        label: textField(true),
        status: enumField(true, ["disabled", "failed", "installed"]),
        storageIdentity: textField(true),
        createdAt: textField(true),
        updatedAt: textField(true),
      },
      unique: [["installId"], ["storageIdentity"]],
    },
    route: {
      fields: {
        enabled: booleanField(true, true),
        matchHost: textField(false),
        matchPath: textField(true),
        matchPrefix: textField(false),
        kind: enumField(true, ["mount", "redirect"]),
        targetProfile: enumField(false, ["app", "instance", "public-site"]),
        appInstall: referenceField(false, "app-install"),
        surface: enumField(false, ["admin", "public-site", "schema"]),
        providerConfig: referenceField(false, "provider-config-ref"),
        toHost: textField(false),
        toUrl: textField(false),
        statusCode: enumField(false, ["301", "302", "303", "307", "308"]),
        preservePath: booleanField(false, true),
        preserveQueryString: booleanField(false, true),
        createdAt: textField(true),
        updatedAt: textField(true),
      },
    },
    "deploy-target": {
      fields: {
        targetId: textField(true),
        targetKind: enumField(true, ["instance"]),
        targetUrl: textField(true),
        label: textField(true),
        enabled: booleanField(true, true),
        createdAt: textField(true),
        updatedAt: textField(true),
      },
      unique: [["targetId"]],
    },
    "provider-config-ref": {
      fields: {
        providerFamily: enumField(true, ["cloudflare"]),
        configRef: textField(true),
        label: textField(true),
        accountId: textField(false),
        workerName: textField(false),
        secretRef: textField(false),
        createdAt: textField(true),
        updatedAt: textField(true),
      },
      unique: [["configRef"]],
    },
    "deploy-desired-resource": {
      fields: {
        deployTarget: referenceField(true, "deploy-target"),
        route: referenceField(false, "route"),
        logicalId: textField(true),
        kind: enumField(true, [
          "cloudflare-dns-records",
          "cloudflare-redirect-rule",
          "cloudflare-worker-custom-domain",
        ]),
        providerFamily: enumField(true, ["cloudflare"]),
        inputsJson: textField(true),
        dependenciesJson: textField(false),
        enabled: booleanField(true, true),
        sourceFingerprint: textField(true),
        createdAt: textField(true),
        updatedAt: textField(true),
      },
      unique: [["deployTarget", "logicalId"]],
    },
  };

export function instanceWorkspaceControlPlaneRecordSourceRelativePath(
  manifest: InstanceWorkspaceManifest,
  entity: InstanceWorkspaceControlPlaneRecordSourceEntity,
): string {
  return `${manifest.source.records}/${instanceWorkspaceControlPlaneRecordSourceFileName(entity)}`;
}

export function instanceWorkspaceControlPlaneRecordSourceFileName(
  entity: InstanceWorkspaceControlPlaneRecordSourceEntity,
): string {
  return `${entity}.json`;
}

export function formatInstanceWorkspaceControlPlaneRecordSourceFile(input: {
  entity: InstanceWorkspaceControlPlaneRecordSourceEntity;
  records: readonly InstanceWorkspaceStoredRecord[];
  schemaUpdatedAt: string;
}): string {
  const file: InstanceWorkspaceControlPlaneRecordSourceFile = {
    kind: INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_KIND,
    version: INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_VERSION,
    schemaKey: INSTANCE_WORKSPACE_CONTROL_PLANE_SCHEMA_KEY,
    schemaUpdatedAt: input.schemaUpdatedAt,
    entity: formatInstanceWorkspaceControlPlaneBoundaryEntityName(input.entity),
    records: input.records
      .filter((record) => recordSourceEntityName(record.entity) === input.entity)
      .map((record) => canonicalRecordSourceRecord(input.entity, record))
      .sort(compareRecordSourceRecords),
  };

  return `${JSON.stringify(file, null, 2)}\n`;
}

export function parseInstanceWorkspaceControlPlaneRecordSourceFileJson(
  contents: string,
  options: {
    context: string;
    expectedEntity?: InstanceWorkspaceControlPlaneRecordSourceEntity;
  },
): ParsedInstanceWorkspaceControlPlaneRecordSourceFile {
  try {
    return parseInstanceWorkspaceControlPlaneRecordSourceFile(
      JSON.parse(contents) as unknown,
      options,
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${options.context} must be valid JSON.`);
    }

    throw error;
  }
}

export function parseInstanceWorkspaceControlPlaneRecordSourceFile(
  value: unknown,
  options: {
    context: string;
    expectedEntity?: InstanceWorkspaceControlPlaneRecordSourceEntity;
  },
): ParsedInstanceWorkspaceControlPlaneRecordSourceFile {
  if (!isRecord(value)) {
    throw new Error(`${options.context} must be an object.`);
  }

  assertExactKeys(options.context, value, [
    "kind",
    "version",
    "schemaKey",
    "schemaUpdatedAt",
    "entity",
    "records",
  ]);

  if (value.kind !== INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_KIND) {
    throw new Error(
      `${options.context} kind must be "${INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_KIND}".`,
    );
  }

  if (value.version !== INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_VERSION) {
    throw new Error(
      `${options.context} version must be ${INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_VERSION}.`,
    );
  }

  if (value.schemaKey !== INSTANCE_WORKSPACE_CONTROL_PLANE_SCHEMA_KEY) {
    throw new Error(
      `${options.context} schemaKey must be "${INSTANCE_WORKSPACE_CONTROL_PLANE_SCHEMA_KEY}".`,
    );
  }

  if (typeof value.entity !== "string") {
    throw new Error(`${options.context} entity must be a string.`);
  }

  const entity = parseRecordSourceEntity(`${options.context} entity`, value.entity);

  if (options.expectedEntity !== undefined && entity !== options.expectedEntity) {
    throw new Error(
      `${options.context} entity must be "${formatInstanceWorkspaceControlPlaneBoundaryEntityName(options.expectedEntity)}".`,
    );
  }

  return {
    entity,
    records: parseRecordSourceFileRecords(`${options.context} records`, value.records, entity),
    schemaUpdatedAt: parseIsoTimestamp(`${options.context} schemaUpdatedAt`, value.schemaUpdatedAt),
  };
}

export function parseInstanceWorkspaceControlPlaneRecordSourceControlPlane(
  context: string,
  schemaUpdatedAt: unknown,
  records: unknown,
): InstanceWorkspaceControlPlaneRecordSourceControlPlane {
  const controlPlane: InstanceWorkspaceControlPlaneRecordSourceControlPlane = {
    schemaKey: INSTANCE_WORKSPACE_CONTROL_PLANE_SCHEMA_KEY,
    schemaUpdatedAt: parseIsoTimestamp(`${context} schemaUpdatedAt`, schemaUpdatedAt),
    records: parseControlPlaneRecords(`${context} records`, records),
  };

  validateInstanceWorkspaceControlPlaneRecordSource(controlPlane);

  return controlPlane;
}

export function instanceWorkspaceControlPlaneRecordSourceRecords(
  records: readonly InstanceWorkspaceStoredRecord[],
): InstanceWorkspaceStoredRecord[] {
  const sourceRecords: InstanceWorkspaceStoredRecord[] = [];

  for (const record of records) {
    const entity = recordSourceEntityName(record.entity);

    if (entity !== undefined) {
      sourceRecords.push({
        ...record,
        entity,
      });
      continue;
    }

    if (excludedRecordSourceEntityName(record.entity) !== undefined) {
      continue;
    }

    throw new Error(
      `Workspace control-plane record source does not support entity "${formatSourceEntityLabel(record.entity)}".`,
    );
  }

  return sourceRecords;
}

export function validateInstanceWorkspaceControlPlaneRecordSource(
  controlPlane: InstanceWorkspaceControlPlaneRecordSourceControlPlane,
) {
  validateControlPlaneRecords("Workspace control-plane record source", controlPlane.records);

  for (const record of controlPlane.records) {
    assertSupportedSourceRecord(record);
    assertSourceRecordImmutableIdentity(record);
  }

  assertSourceRoutesAreValid(controlPlane.records);
}

export function formatInstanceWorkspaceControlPlaneBoundaryEntityName(
  entityName: InstanceWorkspaceControlPlaneRecordSourceEntity,
): string {
  return `${INSTANCE_WORKSPACE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY}:${entityName}`;
}

export function parseInstanceWorkspaceControlPlaneBoundaryEntityName(
  context: string,
  value: string,
): InstanceWorkspaceControlPlaneRecordSourceEntity {
  const qualifiedName = parseQualifiedEntityName(context, value);

  if (qualifiedName.schemaKey !== INSTANCE_WORKSPACE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY) {
    throw new Error(
      `${context} schema key must be "${INSTANCE_WORKSPACE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY}".`,
    );
  }

  if (!isInstanceWorkspaceControlPlaneRecordSourceEntity(qualifiedName.entityKey)) {
    throw new Error(`${context} "${value}" is not an instance control-plane entity.`);
  }

  return qualifiedName.entityKey;
}

export function isInstanceWorkspaceControlPlaneRecordSourceEntity(
  value: string,
): value is InstanceWorkspaceControlPlaneRecordSourceEntity {
  return recordSourceEntitySet.has(value);
}

export type ParsedInstanceWorkspaceControlPlaneRecordSourceFile = {
  entity: InstanceWorkspaceControlPlaneRecordSourceEntity;
  records: InstanceWorkspaceStoredRecord[];
  schemaUpdatedAt: string;
};

function parseRecordSourceFileRecords(
  context: string,
  value: unknown,
  entity: InstanceWorkspaceControlPlaneRecordSourceEntity,
): InstanceWorkspaceStoredRecord[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  return value.map((record, index) =>
    parseRecordSourceFileRecord(`${context}[${index}]`, record, entity),
  );
}

function parseRecordSourceFileRecord(
  context: string,
  value: unknown,
  entity: InstanceWorkspaceControlPlaneRecordSourceEntity,
): InstanceWorkspaceStoredRecord {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["id", "entity", "values", "createdAt"], ["deletedAt"]);

  if (typeof value.id !== "string" || value.id.trim() === "") {
    throw new Error(`${context} id must be a non-empty string.`);
  }

  if (typeof value.entity !== "string") {
    throw new Error(`${context} entity must be a string.`);
  }

  const recordEntity = recordSourceEntityName(value.entity);

  if (recordEntity !== entity) {
    throw new Error(
      `${context} entity must be "${formatInstanceWorkspaceControlPlaneBoundaryEntityName(entity)}".`,
    );
  }

  return {
    id: value.id,
    entity,
    values: parseRecordSourceFileRecordValues(`${context} values`, value.values),
    createdAt: parseIsoTimestamp(`${context} createdAt`, value.createdAt),
    ...(value.deletedAt === undefined
      ? {}
      : { deletedAt: parseIsoTimestamp(`${context} deletedAt`, value.deletedAt) }),
  };
}

function parseRecordSourceFileRecordValues(
  context: string,
  value: unknown,
): InstanceWorkspaceRecordValues {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return parseRecordValues(context, value);
}

function parseControlPlaneRecords(
  context: string,
  value: unknown,
): InstanceWorkspaceStoredRecord[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  return value.map((record, index) => parseControlPlaneRecord(`${context}[${index}]`, record));
}

function parseControlPlaneRecord(context: string, value: unknown): InstanceWorkspaceStoredRecord {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["id", "entity", "values", "createdAt"], ["deletedAt"]);

  const id = parseNonEmptyString(`${context} id`, value.id);
  const entity = parseControlPlaneEntityName(`${context} record "${id}" entity`, value.entity);

  return {
    id,
    entity,
    values: parseRecordValues(`${context} values`, value.values),
    createdAt: parseIsoTimestamp(`${context} createdAt`, value.createdAt),
    ...(value.deletedAt === undefined
      ? {}
      : { deletedAt: parseIsoTimestamp(`${context} deletedAt`, value.deletedAt) }),
  };
}

function validateControlPlaneRecords(
  context: string,
  records: readonly InstanceWorkspaceStoredRecord[],
) {
  const recordsById = new Map<string, InstanceWorkspaceStoredRecord>();

  for (const record of records) {
    if (recordsById.has(record.id)) {
      throw new Error(
        `${context} records includes duplicate control-plane record id "${record.id}".`,
      );
    }

    recordsById.set(record.id, record);
  }

  for (const record of records) {
    validateControlPlaneRecord(context, record, recordsById);
  }

  validateControlPlaneUniqueConstraints(context, records);
}

function validateControlPlaneRecord(
  context: string,
  record: InstanceWorkspaceStoredRecord,
  recordsById: ReadonlyMap<string, InstanceWorkspaceStoredRecord>,
) {
  const entity = recordSourceEntityName(record.entity);

  if (entity === undefined) {
    throw new Error(
      `${context} records record "${record.id}" references unknown entity "${formatSourceEntityLabel(record.entity)}".`,
    );
  }

  const fields = controlPlaneEntitySpecs[entity].fields;

  for (const fieldName of Object.keys(record.values)) {
    if (!fields[fieldName]) {
      throw new Error(
        `${context} records record "${record.id}" includes unknown field "${formatSourceEntityLabel(record.entity)}.${fieldName}".`,
      );
    }
  }

  assertControlPlaneRecordValuesAreReviewable(context, record);

  for (const [fieldName, field] of Object.entries(fields)) {
    const value = record.values[fieldName];

    if (!isValidControlPlaneFieldValue(value, field)) {
      throw new Error(
        `${context} records record "${record.id}" has invalid field "${formatSourceEntityLabel(record.entity)}.${fieldName}".`,
      );
    }

    if (field.kind === "reference" && value !== undefined) {
      validateControlPlaneReference(context, record, fieldName, field.to, value, recordsById);
    }
  }
}

function validateControlPlaneReference(
  context: string,
  record: InstanceWorkspaceStoredRecord,
  fieldName: string,
  entityName: InstanceWorkspaceControlPlaneRecordSourceEntity,
  value: InstanceWorkspaceRecordValues[string],
  recordsById: ReadonlyMap<string, InstanceWorkspaceStoredRecord>,
) {
  if (typeof value !== "string") {
    return;
  }

  const target = recordsById.get(value);

  if (!target) {
    throw new Error(
      `${context} records record "${record.id}" field "${formatSourceEntityLabel(record.entity)}.${fieldName}" references unknown ${formatInstanceWorkspaceControlPlaneBoundaryEntityName(entityName)} record "${value}".`,
    );
  }

  if (recordSourceEntityName(target.entity) !== entityName) {
    throw new Error(
      `${context} records record "${record.id}" field "${formatSourceEntityLabel(record.entity)}.${fieldName}" must reference a ${formatInstanceWorkspaceControlPlaneBoundaryEntityName(entityName)} record.`,
    );
  }

  if (target.deletedAt) {
    throw new Error(
      `${context} records record "${record.id}" field "${formatSourceEntityLabel(record.entity)}.${fieldName}" cannot reference tombstoned record "${value}".`,
    );
  }
}

function validateControlPlaneUniqueConstraints(
  context: string,
  records: readonly InstanceWorkspaceStoredRecord[],
) {
  for (const entity of INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_ENTITIES) {
    const uniqueConstraints = controlPlaneEntitySpecs[entity].unique ?? [];
    const activeRecords = records.filter(
      (record) => recordSourceEntityName(record.entity) === entity && !record.deletedAt,
    );

    for (const fields of uniqueConstraints) {
      const seen = new Set<string>();

      for (const record of activeRecords) {
        const key = JSON.stringify(fields.map((fieldName) => record.values[fieldName] ?? null));

        if (seen.has(key)) {
          throw new Error(
            `${context} records violates unique constraint "${formatInstanceWorkspaceControlPlaneBoundaryEntityName(entity)}.${uniqueConstraintName(entity, fields)}".`,
          );
        }

        seen.add(key);
      }
    }
  }
}

function assertSupportedSourceRecord(record: InstanceWorkspaceStoredRecord) {
  const entity = recordSourceEntityName(record.entity);

  if (entity === undefined) {
    if (excludedRecordSourceEntityName(record.entity) !== undefined) {
      throw new Error(
        `Workspace control-plane record source does not support execution-history entity "${formatSourceEntityLabel(record.entity)}".`,
      );
    }

    throw new Error(
      `Workspace control-plane record source does not support entity "${formatSourceEntityLabel(record.entity)}".`,
    );
  }
}

function assertSourceRecordImmutableIdentity(record: InstanceWorkspaceStoredRecord) {
  if (record.entity === "app-install") {
    const installId = requiredStringValue(record, "installId");
    const storageIdentity = requiredStringValue(record, "storageIdentity");

    if (record.id !== installId) {
      throw new Error(
        `Workspace control-plane record source record "${record.id}" field "instance:app-install.installId" must match record id.`,
      );
    }

    if (storageIdentity !== `app:${installId}`) {
      throw new Error(
        `Workspace control-plane record source record "${record.id}" field "instance:app-install.storageIdentity" must be "app:${installId}".`,
      );
    }
  }

  if (record.entity === "deploy-target") {
    const targetId = requiredStringValue(record, "targetId");
    const targetUrl = requiredStringValue(record, "targetUrl");

    if (record.id !== targetId) {
      throw new Error(
        `Workspace control-plane record source record "${record.id}" field "instance:deploy-target.targetId" must match record id.`,
      );
    }

    if (targetUrl !== normalizeInstanceWorkspaceTargetUrl(targetUrl)) {
      throw new Error(
        `Workspace control-plane record source record "${record.id}" field "instance:deploy-target.targetUrl" must be a normalized HTTP origin.`,
      );
    }
  }

  if (record.entity === "provider-config-ref") {
    const configRef = requiredStringValue(record, "configRef");

    if (record.id !== configRef) {
      throw new Error(
        `Workspace control-plane record source record "${record.id}" field "instance:provider-config-ref.configRef" must match record id.`,
      );
    }
  }
}

function assertSourceRoutesAreValid(records: readonly InstanceWorkspaceStoredRecord[]) {
  const activeRecords = new Map(
    records.filter((record) => !record.deletedAt).map((record) => [record.id, record]),
  );
  const routes = records.filter((record) => record.entity === "route" && !record.deletedAt);

  for (const route of routes) {
    validateSourceRoute(route, activeRecords, routes);
  }
}

function validateSourceRoute(
  route: InstanceWorkspaceStoredRecord,
  activeRecords: ReadonlyMap<string, InstanceWorkspaceStoredRecord>,
  routes: readonly InstanceWorkspaceStoredRecord[],
) {
  const matchHost = optionalStringValue(route, "matchHost");
  const matchPath = requiredStringValue(route, "matchPath");
  const matchPrefix = optionalStringValue(route, "matchPrefix");
  const kind = requiredStringValue(route, "kind");
  const providerConfig = optionalStringValue(route, "providerConfig");

  if (matchHost !== undefined) {
    assertNormalizedExactHost(route, "matchHost", matchHost);
  }

  assertNormalizedAbsoluteMatchPath(route, "matchPath", matchPath);

  if (matchPrefix !== undefined) {
    assertNormalizedMatchPrefix(route, matchPath, matchPrefix);
  }

  if (providerConfig !== undefined && matchHost === undefined) {
    throw new Error(
      `Workspace control-plane record source route "${route.id}" field "instance:route.providerConfig" can only be set on exact-host route records.`,
    );
  }

  if (kind === "mount") {
    validateSourceMountRoute(route, activeRecords, matchHost, matchPath, matchPrefix);
  } else if (kind === "redirect") {
    validateSourceRedirectRoute(route, matchHost);
  } else {
    throw new Error(
      `Workspace control-plane record source route "${route.id}" field "instance:route.kind" must be "mount" or "redirect".`,
    );
  }

  if (route.values.enabled === true) {
    assertEnabledSourceRouteIsUnique(route, routes);
  }
}

function validateSourceMountRoute(
  route: InstanceWorkspaceStoredRecord,
  activeRecords: ReadonlyMap<string, InstanceWorkspaceStoredRecord>,
  matchHost: string | undefined,
  matchPath: string,
  matchPrefix: string | undefined,
) {
  const targetProfile = optionalStringValue(route, "targetProfile");
  const appInstall = optionalStringValue(route, "appInstall");
  const surface = optionalStringValue(route, "surface");

  for (const fieldName of ["toHost", "toUrl", "statusCode"] as const) {
    if (optionalStringValue(route, fieldName) !== undefined) {
      throw new Error(
        `Workspace control-plane record source route "${route.id}" field "instance:route.${fieldName}" is incompatible with mount routes.`,
      );
    }
  }

  if (targetProfile === undefined) {
    throw new Error(
      `Workspace control-plane record source route "${route.id}" field "instance:route.targetProfile" is required for mount routes.`,
    );
  }

  if (targetProfile === "instance") {
    if (appInstall !== undefined) {
      throw new Error(
        `Workspace control-plane record source route "${route.id}" field "instance:route.appInstall" is incompatible with instance mount routes.`,
      );
    }

    if (surface !== undefined && surface !== "admin") {
      throw new Error(
        `Workspace control-plane record source route "${route.id}" field "instance:route.surface" is incompatible with instance mount routes.`,
      );
    }

    return;
  }

  if (targetProfile !== "app" && targetProfile !== "public-site") {
    throw new Error(
      `Workspace control-plane record source route "${route.id}" field "instance:route.targetProfile" is invalid for mount routes.`,
    );
  }

  if (appInstall === undefined) {
    throw new Error(
      `Workspace control-plane record source route "${route.id}" field "instance:route.appInstall" is required for ${targetProfile} mount routes.`,
    );
  }

  const install = activeRecords.get(appInstall);

  if (!install || install.entity !== "app-install") {
    throw new Error(
      `Workspace control-plane record source route "${route.id}" field "instance:route.appInstall" references unknown instance:app-install record "${appInstall}".`,
    );
  }

  if (install.values.status !== "installed") {
    throw new Error(
      `Workspace control-plane record source route "${route.id}" field "instance:route.appInstall" references non-installed instance:app-install record "${appInstall}".`,
    );
  }

  if (targetProfile === "app") {
    if (surface !== "admin" && surface !== "schema") {
      throw new Error(
        `Workspace control-plane record source route "${route.id}" field "instance:route.surface" must be "admin" or "schema" for app mount routes.`,
      );
    }

    return;
  }

  if (surface !== "public-site") {
    throw new Error(
      `Workspace control-plane record source route "${route.id}" field "instance:route.surface" must be "public-site" for public-site mount routes.`,
    );
  }

  if (install.values.packageAppKey !== "site") {
    throw new Error(
      `Workspace control-plane record source route "${route.id}" field "instance:route.appInstall" references app-install record "${appInstall}" without public Site capability.`,
    );
  }

  if (matchHost !== undefined && (matchPath !== "/" || matchPrefix !== "/")) {
    throw new Error(
      `Workspace control-plane record source route "${route.id}" host-mounted public Site routes must set field "instance:route.matchPath" to "/" and field "instance:route.matchPrefix" to "/".`,
    );
  }
}

function validateSourceRedirectRoute(
  route: InstanceWorkspaceStoredRecord,
  matchHost: string | undefined,
) {
  if (matchHost === undefined) {
    throw new Error(
      `Workspace control-plane record source route "${route.id}" field "instance:route.matchHost" is required for redirect routes.`,
    );
  }

  for (const fieldName of ["targetProfile", "appInstall", "surface"] as const) {
    if (optionalStringValue(route, fieldName) !== undefined) {
      throw new Error(
        `Workspace control-plane record source route "${route.id}" field "instance:route.${fieldName}" is incompatible with redirect routes.`,
      );
    }
  }

  const toHost = optionalStringValue(route, "toHost");
  const toUrl = optionalStringValue(route, "toUrl");

  if (
    (toHost === undefined && toUrl === undefined) ||
    (toHost !== undefined && toUrl !== undefined)
  ) {
    throw new Error(
      `Workspace control-plane record source route "${route.id}" must set exactly one of field "instance:route.toHost" or field "instance:route.toUrl".`,
    );
  }

  if (toHost !== undefined) {
    assertNormalizedExactHost(route, "toHost", toHost);
  }

  if (toUrl !== undefined) {
    assertNormalizedHttpsUrl(route, "toUrl", toUrl);
  }

  if (optionalStringValue(route, "statusCode") === undefined) {
    throw new Error(
      `Workspace control-plane record source route "${route.id}" field "instance:route.statusCode" is required for redirect routes.`,
    );
  }

  for (const fieldName of ["preservePath", "preserveQueryString"] as const) {
    if (typeof route.values[fieldName] !== "boolean") {
      throw new Error(
        `Workspace control-plane record source route "${route.id}" field "instance:route.${fieldName}" is required for redirect routes.`,
      );
    }
  }
}

function assertEnabledSourceRouteIsUnique(
  route: InstanceWorkspaceStoredRecord,
  routes: readonly InstanceWorkspaceStoredRecord[],
) {
  const candidate = sourceRouteMatch(route);

  for (const record of routes) {
    if (record.id === route.id || record.values.enabled !== true) {
      continue;
    }

    const existing = sourceRouteMatch(record);

    if (candidate.host !== existing.host || !sourceRoutesOverlap(candidate, existing)) {
      continue;
    }

    throw new Error(
      `Workspace control-plane record source route "${route.id}" enabled route match "${formatSourceRouteMatch(candidate)}" conflicts with enabled route "${record.id}".`,
    );
  }
}

function sourceRouteMatch(route: InstanceWorkspaceStoredRecord): {
  host: string;
  path: string;
  prefix?: string;
} {
  const prefix = optionalStringValue(route, "matchPrefix");

  return {
    host: optionalStringValue(route, "matchHost") ?? "<hostless>",
    path: requiredStringValue(route, "matchPath"),
    ...(prefix === undefined ? {} : { prefix }),
  };
}

function sourceRoutesOverlap(
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

function formatSourceRouteMatch(match: { host: string; path: string; prefix?: string }) {
  return `${match.host}${match.path}${match.prefix === undefined ? "" : ` ${match.prefix}`}`;
}

function assertNormalizedExactHost(
  route: InstanceWorkspaceStoredRecord,
  fieldName: string,
  value: string,
) {
  const normalized = normalizeExactHost(value);

  if (normalized !== value) {
    throw new Error(
      `Workspace control-plane record source route "${route.id}" field "instance:route.${fieldName}" must be a normalized exact host.`,
    );
  }
}

function assertNormalizedHttpsUrl(
  route: InstanceWorkspaceStoredRecord,
  fieldName: string,
  value: string,
) {
  try {
    const url = new URL(value);
    const normalizedHost = normalizeExactHost(url.hostname);
    const normalized = url.toString().replace(/\/$/, "");

    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.hash !== "" ||
      normalizedHost !== url.hostname ||
      normalized !== value
    ) {
      throw new Error("invalid URL");
    }
  } catch {
    throw new Error(
      `Workspace control-plane record source route "${route.id}" field "instance:route.${fieldName}" must be a normalized absolute HTTPS URL without credentials or fragment.`,
    );
  }
}

function assertNormalizedAbsoluteMatchPath(
  route: InstanceWorkspaceStoredRecord,
  fieldName: string,
  value: string,
) {
  if (!isNormalizedAbsoluteRoutePath(value)) {
    throw new Error(
      `Workspace control-plane record source route "${route.id}" field "instance:route.${fieldName}" must be a normalized absolute path.`,
    );
  }
}

function assertNormalizedMatchPrefix(
  route: InstanceWorkspaceStoredRecord,
  matchPath: string,
  matchPrefix: string,
) {
  const normalizedPrefix =
    matchPrefix === "/" ? matchPrefix : matchPrefix.endsWith("/") ? matchPrefix.slice(0, -1) : "";

  if (matchPrefix !== "/" && !matchPrefix.endsWith("/")) {
    throw new Error(
      `Workspace control-plane record source route "${route.id}" field "instance:route.matchPrefix" must be a normalized absolute path prefix.`,
    );
  }

  if (matchPrefix !== "/" && !isNormalizedAbsoluteRoutePath(normalizedPrefix)) {
    throw new Error(
      `Workspace control-plane record source route "${route.id}" field "instance:route.matchPrefix" must be a normalized absolute path prefix.`,
    );
  }

  if (matchPath === "/") {
    if (matchPrefix !== "/") {
      throw new Error(
        `Workspace control-plane record source route "${route.id}" field "instance:route.matchPrefix" must begin at or below field "instance:route.matchPath".`,
      );
    }

    return;
  }

  if (!matchPrefix.startsWith(`${matchPath}/`)) {
    throw new Error(
      `Workspace control-plane record source route "${route.id}" field "instance:route.matchPrefix" must begin at or below field "instance:route.matchPath".`,
    );
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

function assertControlPlaneRecordValuesAreReviewable(
  context: string,
  record: InstanceWorkspaceStoredRecord,
) {
  for (const [fieldName, value] of Object.entries(record.values)) {
    if (isForbiddenControlPlaneFieldName(fieldName)) {
      throw new Error(
        `${context} records record "${record.id}" field "${formatSourceEntityLabel(record.entity)}.${fieldName}" cannot store control-plane secrets or provider truth.`,
      );
    }

    if (typeof value === "string") {
      assertControlPlaneStringValueIsReviewable(context, record, fieldName, value);
    }
  }
}

function assertControlPlaneStringValueIsReviewable(
  context: string,
  record: InstanceWorkspaceStoredRecord,
  fieldName: string,
  value: string,
) {
  if (containsForbiddenControlPlaneSecretValue(value)) {
    throw new Error(
      `${context} records record "${record.id}" field "${formatSourceEntityLabel(record.entity)}.${fieldName}" cannot store control-plane secret values.`,
    );
  }

  const parsed = parseMaybeJson(value);

  if (parsed !== undefined) {
    assertControlPlaneJsonValueIsReviewable(context, record, fieldName, parsed);
  }
}

function assertControlPlaneJsonValueIsReviewable(
  context: string,
  record: InstanceWorkspaceStoredRecord,
  fieldName: string,
  value: unknown,
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertControlPlaneJsonValueIsReviewable(context, record, fieldName, item);
    }

    return;
  }

  if (typeof value === "string") {
    assertControlPlaneStringValueIsReviewable(context, record, fieldName, value);
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (isForbiddenControlPlaneFieldName(key)) {
      throw new Error(
        `${context} records record "${record.id}" field "${formatSourceEntityLabel(record.entity)}.${fieldName}" cannot store control-plane secrets or provider truth.`,
      );
    }

    assertControlPlaneJsonValueIsReviewable(context, record, fieldName, item);
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

    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseRecordSourceEntity(
  context: string,
  value: string,
): InstanceWorkspaceControlPlaneRecordSourceEntity {
  const entity = parseInstanceWorkspaceControlPlaneBoundaryEntityName(context, value);

  if (!isInstanceWorkspaceControlPlaneRecordSourceEntity(entity)) {
    throw new Error(`${context} "${value}" is not a workspace control-plane record source entity.`);
  }

  return entity;
}

function parseControlPlaneEntityName(
  context: string,
  value: unknown,
): InstanceWorkspaceControlPlaneRecordSourceEntity {
  const entity = parseNonEmptyString(context, value);

  if (isInstanceWorkspaceControlPlaneRecordSourceEntity(entity)) {
    return entity;
  }

  return parseInstanceWorkspaceControlPlaneBoundaryEntityName(context, entity);
}

function recordSourceEntityName(
  value: string,
): InstanceWorkspaceControlPlaneRecordSourceEntity | undefined {
  const localEntity = value.startsWith(`${INSTANCE_WORKSPACE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY}:`)
    ? tryParseBoundaryEntityName(value)
    : isInstanceWorkspaceControlPlaneRecordSourceEntity(value)
      ? value
      : undefined;

  return localEntity !== undefined && isInstanceWorkspaceControlPlaneRecordSourceEntity(localEntity)
    ? localEntity
    : undefined;
}

function excludedRecordSourceEntityName(value: string): string | undefined {
  const localEntity = value.startsWith(`${INSTANCE_WORKSPACE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY}:`)
    ? tryParseBoundaryEntityName(value)
    : value;

  return localEntity !== undefined && excludedRecordSourceEntitySet.has(localEntity)
    ? localEntity
    : undefined;
}

function tryParseBoundaryEntityName(value: string): string | undefined {
  try {
    return parseQualifiedEntityName("Workspace control-plane record entity", value).entityKey;
  } catch {
    return undefined;
  }
}

function canonicalRecordSourceRecord(
  entity: InstanceWorkspaceControlPlaneRecordSourceEntity,
  record: InstanceWorkspaceStoredRecord,
): InstanceWorkspaceStoredRecord {
  return {
    id: record.id,
    entity: formatInstanceWorkspaceControlPlaneBoundaryEntityName(entity),
    values: Object.fromEntries(
      Object.entries(record.values).sort(([left], [right]) => left.localeCompare(right)),
    ) as InstanceWorkspaceRecordValues,
    createdAt: record.createdAt,
    ...(record.deletedAt === undefined ? {} : { deletedAt: record.deletedAt }),
  };
}

function compareRecordSourceRecords(
  left: InstanceWorkspaceStoredRecord,
  right: InstanceWorkspaceStoredRecord,
) {
  const createdAtOrder = left.createdAt.localeCompare(right.createdAt);

  if (createdAtOrder !== 0) {
    return createdAtOrder;
  }

  return left.id.localeCompare(right.id);
}

function requiredStringValue(record: InstanceWorkspaceStoredRecord, fieldName: string): string {
  const value = record.values[fieldName];

  if (typeof value !== "string") {
    throw new Error(
      `Workspace control-plane record source record "${record.id}" field "${formatSourceEntityLabel(record.entity)}.${fieldName}" must be a string.`,
    );
  }

  return value;
}

function optionalStringValue(
  record: InstanceWorkspaceStoredRecord,
  fieldName: string,
): string | undefined {
  const value = record.values[fieldName];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(
      `Workspace control-plane record source record "${record.id}" field "${formatSourceEntityLabel(record.entity)}.${fieldName}" must be a string.`,
    );
  }

  return value;
}

function formatSourceEntityLabel(entity: string) {
  const sourceEntity = recordSourceEntityName(entity);

  if (sourceEntity !== undefined) {
    return formatInstanceWorkspaceControlPlaneBoundaryEntityName(sourceEntity);
  }

  const excludedEntity = excludedRecordSourceEntityName(entity);

  return excludedEntity === undefined
    ? entity
    : `${INSTANCE_WORKSPACE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY}:${excludedEntity}`;
}

function parseRecordValues(context: string, value: unknown): InstanceWorkspaceRecordValues {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const values: InstanceWorkspaceRecordValues = {};

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

function parseQualifiedEntityName(
  context: string,
  value: unknown,
): {
  entityKey: string;
  schemaKey: string;
} {
  if (typeof value !== "string" || !isQualifiedEntityName(value)) {
    throw new Error(
      `${context} must be a qualified entity name in "<schema-key>:<entity-key>" format with kebab-case schema and entity keys.`,
    );
  }

  const [schemaKey, entityKey] = value.split(":") as [string, string];
  return { schemaKey, entityKey };
}

function isQualifiedEntityName(value: string): boolean {
  const parts = value.split(":");

  if (parts.length !== 2) {
    return false;
  }

  const [schemaKey, entityKey] = parts;

  return (
    schemaKey !== undefined &&
    entityKey !== undefined &&
    schemaLocalEntityKeyPattern.test(schemaKey) &&
    schemaLocalEntityKeyPattern.test(entityKey)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function textField(required: boolean): FieldSpec {
  return { kind: "text", required };
}

function booleanField(required: boolean, defaultValue: boolean): FieldSpec {
  return { kind: "boolean", required, default: defaultValue };
}

function numberField(
  required: boolean,
  options: { integer?: boolean; min?: number } = {},
): FieldSpec {
  return { kind: "number", required, ...options };
}

function enumField(required: boolean, values: readonly string[]): FieldSpec {
  return { kind: "enum", required, values };
}

function referenceField(
  required: boolean,
  to: InstanceWorkspaceControlPlaneRecordSourceEntity,
): FieldSpec {
  return { kind: "reference", required, to };
}

function isValidControlPlaneFieldValue(
  value: InstanceWorkspaceRecordValues[string] | undefined,
  field: FieldSpec,
) {
  if (value === undefined) {
    return !field.required || "default" in field;
  }

  if (field.kind === "text" || field.kind === "reference") {
    return typeof value === "string";
  }

  if (field.kind === "boolean") {
    return typeof value === "boolean";
  }

  if (field.kind === "enum") {
    return typeof value === "string" && field.values.includes(value);
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return false;
  }

  if (field.integer === true && !Number.isInteger(value)) {
    return false;
  }

  return field.min === undefined || value >= field.min;
}

function uniqueConstraintName(
  entity: InstanceWorkspaceControlPlaneRecordSourceEntity,
  fields: readonly string[],
) {
  if (entity === "app-install" && fields.join(",") === "installId") {
    return "uniqueInstallId";
  }

  if (entity === "app-install" && fields.join(",") === "storageIdentity") {
    return "uniqueStorageIdentity";
  }

  if (entity === "deploy-target") {
    return "uniqueTargetId";
  }

  if (entity === "provider-config-ref") {
    return "uniqueConfigRef";
  }

  return "uniqueTargetLogicalId";
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

function normalizeExactHost(value: string): string | undefined {
  const raw = value.trim().toLowerCase();

  if (raw === "" || raw.includes("://")) {
    return undefined;
  }

  try {
    const url = new URL(`https://${raw}`);
    const normalized = stripTrailingDots(url.hostname.toLowerCase());

    if (
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== "" ||
      !isValidDnsHostname(normalized)
    ) {
      return undefined;
    }

    return normalized;
  } catch {
    return undefined;
  }
}

function stripTrailingDots(value: string): string {
  return value.replaceAll(/\.+$/g, "");
}

function isValidDnsHostname(value: string): boolean {
  if (value === "" || value.length > 253 || value.includes("_")) {
    return false;
  }

  return value
    .split(".")
    .every((label) => label.length > 0 && label.length <= 63 && hostnameLabelPattern.test(label));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
