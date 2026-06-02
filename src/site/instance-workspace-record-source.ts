import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  parseInstanceArchive,
  type InstanceArchiveControlPlane,
} from "../shared/archive.ts";
import {
  INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  formatInstanceControlPlaneBoundaryEntityName,
  instanceControlPlaneReservedRoutePaths,
  parseInstanceControlPlaneBoundaryEntityName,
  type InstanceControlPlaneEntityName,
} from "../shared/instance-control-plane.ts";
import { normalizeInstanceDomainHost } from "../shared/instance-domain-mappings.ts";
import type { RecordValues, StoredRecord } from "../shared/protocol.ts";
import { assertExactKeys, isRecord } from "../shared/schema-parse-helpers.ts";
import type { FormlessInstanceWorkspaceManifest } from "./instance-workspace-config.ts";

export const FORMLESS_INSTANCE_CONTROL_PLANE_RECORD_SOURCE_FILE_KIND =
  "formless.instanceControlPlaneRecordSource";
export const FORMLESS_INSTANCE_CONTROL_PLANE_RECORD_SOURCE_FILE_VERSION = 1;

export const formlessInstanceControlPlaneRecordSourceEntities = [
  "app-install",
  "route",
  "deploy-target",
  "provider-config-ref",
  "deploy-desired-resource",
] as const satisfies readonly InstanceControlPlaneEntityName[];

export type FormlessInstanceControlPlaneRecordSourceEntity =
  (typeof formlessInstanceControlPlaneRecordSourceEntities)[number];

export type FormlessInstanceControlPlaneRecordSourceFile = {
  kind: typeof FORMLESS_INSTANCE_CONTROL_PLANE_RECORD_SOURCE_FILE_KIND;
  version: typeof FORMLESS_INSTANCE_CONTROL_PLANE_RECORD_SOURCE_FILE_VERSION;
  schemaKey: typeof INSTANCE_CONTROL_PLANE_SCHEMA_KEY;
  schemaUpdatedAt: string;
  entity: string;
  records: StoredRecord[];
};

const recordSourceEntitySet = new Set<string>(formlessInstanceControlPlaneRecordSourceEntities);
const excludedRecordSourceEntitySet = new Set([
  "deploy-attempt",
  "deploy-evidence-summary",
  "deploy-drift-report",
]);

export function formlessInstanceControlPlaneRecordSourceRelativePath(
  manifest: FormlessInstanceWorkspaceManifest,
  entity: FormlessInstanceControlPlaneRecordSourceEntity,
): string {
  return `${manifest.source.records}/${entity}.json`;
}

export function formlessInstanceControlPlaneRecordSourcePath(
  workspaceRoot: string,
  manifest: FormlessInstanceWorkspaceManifest,
  entity: FormlessInstanceControlPlaneRecordSourceEntity,
): string {
  return path.join(
    workspaceRoot,
    formlessInstanceControlPlaneRecordSourceRelativePath(manifest, entity),
  );
}

export async function readFormlessInstanceControlPlaneRecordSource(input: {
  manifest: FormlessInstanceWorkspaceManifest;
  workspaceRoot: string;
}): Promise<InstanceArchiveControlPlane | undefined> {
  const sourceRoot = path.join(input.workspaceRoot, input.manifest.source.records);
  let entries: Array<{ isFile(): boolean; name: string }>;

  try {
    entries = await readdir(sourceRoot, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }

  const allowedFileNames = new Set(
    formlessInstanceControlPlaneRecordSourceEntities.map(recordSourceFileName),
  );
  const fileNames = entries
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  for (const entry of entries) {
    if (!entry.isFile() || !allowedFileNames.has(entry.name)) {
      throw new Error(
        `Workspace control-plane record source ${input.manifest.source.records} has unsupported file "${entry.name}".`,
      );
    }
  }

  const files: ParsedRecordSourceFile[] = [];

  for (const entity of formlessInstanceControlPlaneRecordSourceEntities) {
    const fileName = recordSourceFileName(entity);

    if (!fileNames.includes(fileName)) {
      continue;
    }

    files.push(
      parseFormlessInstanceControlPlaneRecordSourceFileJson(
        await readFile(path.join(sourceRoot, fileName), "utf8"),
        {
          context: `Workspace control-plane record source ${input.manifest.source.records}/${fileName}`,
          expectedEntity: entity,
        },
      ),
    );
  }

  if (files.length === 0) {
    return undefined;
  }

  const schemaUpdatedAt = files
    .map((file) => file.schemaUpdatedAt)
    .sort((left, right) => right.localeCompare(left))[0];
  const controlPlane = parseControlPlaneRecords(
    `Workspace control-plane record source ${input.manifest.source.records}`,
    schemaUpdatedAt,
    files.flatMap((file) => file.records),
  );

  validateFormlessInstanceControlPlaneRecordSource(controlPlane);

  return controlPlane;
}

export async function writeFormlessInstanceControlPlaneRecordSource(input: {
  controlPlane: InstanceArchiveControlPlane | undefined;
  manifest: FormlessInstanceWorkspaceManifest;
  workspaceRoot: string;
}): Promise<void> {
  const sourceRoot = path.join(input.workspaceRoot, input.manifest.source.records);

  await rm(sourceRoot, { force: true, recursive: true });

  if (input.controlPlane === undefined) {
    return;
  }

  await mkdir(sourceRoot, { recursive: true });

  const sourceControlPlane = parseControlPlaneRecords(
    `Workspace control-plane record source ${input.manifest.source.records}`,
    input.controlPlane.schemaUpdatedAt,
    sourceRecordSourceRecords(input.controlPlane.records),
  );

  validateFormlessInstanceControlPlaneRecordSource(sourceControlPlane);

  for (const entity of formlessInstanceControlPlaneRecordSourceEntities) {
    const records = sourceControlPlane.records.filter((record) => record.entity === entity);
    const contents = formatFormlessInstanceControlPlaneRecordSourceFile({
      entity,
      records,
      schemaUpdatedAt: sourceControlPlane.schemaUpdatedAt,
    });

    await writeFile(path.join(sourceRoot, recordSourceFileName(entity)), contents);
  }
}

export function formatFormlessInstanceControlPlaneRecordSourceFile(input: {
  entity: FormlessInstanceControlPlaneRecordSourceEntity;
  records: readonly StoredRecord[];
  schemaUpdatedAt: string;
}): string {
  const file: FormlessInstanceControlPlaneRecordSourceFile = {
    kind: FORMLESS_INSTANCE_CONTROL_PLANE_RECORD_SOURCE_FILE_KIND,
    version: FORMLESS_INSTANCE_CONTROL_PLANE_RECORD_SOURCE_FILE_VERSION,
    schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
    schemaUpdatedAt: input.schemaUpdatedAt,
    entity: formatInstanceControlPlaneBoundaryEntityName(input.entity),
    records: input.records
      .filter((record) => recordSourceEntityName(record.entity) === input.entity)
      .map((record) => canonicalRecordSourceRecord(input.entity, record))
      .sort(compareRecordSourceRecords),
  };

  return `${JSON.stringify(file, null, 2)}\n`;
}

export function parseFormlessInstanceControlPlaneRecordSourceFileJson(
  contents: string,
  options: {
    context: string;
    expectedEntity?: FormlessInstanceControlPlaneRecordSourceEntity;
  },
): ParsedRecordSourceFile {
  try {
    return parseFormlessInstanceControlPlaneRecordSourceFile(
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

export function validateFormlessInstanceControlPlaneRecordSource(
  controlPlane: InstanceArchiveControlPlane,
) {
  for (const record of controlPlane.records) {
    assertSupportedSourceRecord(record);
    assertSourceRecordImmutableIdentity(record);
  }

  assertSourceRoutesAreValid(controlPlane.records);
}

type ParsedRecordSourceFile = {
  entity: FormlessInstanceControlPlaneRecordSourceEntity;
  records: StoredRecord[];
  schemaUpdatedAt: string;
};

function parseFormlessInstanceControlPlaneRecordSourceFile(
  value: unknown,
  options: {
    context: string;
    expectedEntity?: FormlessInstanceControlPlaneRecordSourceEntity;
  },
): ParsedRecordSourceFile {
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

  if (value.kind !== FORMLESS_INSTANCE_CONTROL_PLANE_RECORD_SOURCE_FILE_KIND) {
    throw new Error(
      `${options.context} kind must be "${FORMLESS_INSTANCE_CONTROL_PLANE_RECORD_SOURCE_FILE_KIND}".`,
    );
  }

  if (value.version !== FORMLESS_INSTANCE_CONTROL_PLANE_RECORD_SOURCE_FILE_VERSION) {
    throw new Error(
      `${options.context} version must be ${FORMLESS_INSTANCE_CONTROL_PLANE_RECORD_SOURCE_FILE_VERSION}.`,
    );
  }

  if (value.schemaKey !== INSTANCE_CONTROL_PLANE_SCHEMA_KEY) {
    throw new Error(`${options.context} schemaKey must be "${INSTANCE_CONTROL_PLANE_SCHEMA_KEY}".`);
  }

  if (typeof value.entity !== "string") {
    throw new Error(`${options.context} entity must be a string.`);
  }

  const entity = parseRecordSourceEntity(`${options.context} entity`, value.entity);

  if (options.expectedEntity !== undefined && entity !== options.expectedEntity) {
    throw new Error(
      `${options.context} entity must be "${formatInstanceControlPlaneBoundaryEntityName(options.expectedEntity)}".`,
    );
  }

  return {
    entity,
    records: parseRecordSourceFileRecords(`${options.context} records`, value.records, entity),
    schemaUpdatedAt: parseIsoTimestamp(`${options.context} schemaUpdatedAt`, value.schemaUpdatedAt),
  };
}

function parseRecordSourceFileRecords(
  context: string,
  value: unknown,
  entity: FormlessInstanceControlPlaneRecordSourceEntity,
): StoredRecord[] {
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
  entity: FormlessInstanceControlPlaneRecordSourceEntity,
): StoredRecord {
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
      `${context} entity must be "${formatInstanceControlPlaneBoundaryEntityName(entity)}".`,
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

function parseRecordSourceFileRecordValues(context: string, value: unknown): RecordValues {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const values: RecordValues = {};

  for (const [fieldName, fieldValue] of Object.entries(value)) {
    if (
      typeof fieldValue !== "string" &&
      typeof fieldValue !== "boolean" &&
      typeof fieldValue !== "number"
    ) {
      throw new Error(`${context} field "${fieldName}" must be a scalar value.`);
    }

    values[fieldName] = fieldValue;
  }

  return values;
}

function parseIsoTimestamp(context: string, value: unknown): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${context} must be an ISO timestamp.`);
  }

  return value;
}

function parseControlPlaneRecords(
  context: string,
  schemaUpdatedAt: unknown,
  records: unknown,
): InstanceArchiveControlPlane {
  const archive = parseInstanceArchive({
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: schemaUpdatedAt,
    capabilities: [
      "installed-app-registry",
      "schema-owned-control-plane",
      "app-store-snapshots",
      "core-media-assets",
    ],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    controlPlane: {
      schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
      schemaUpdatedAt,
      records,
    },
    apps: [],
  });

  if (!archive.controlPlane) {
    throw new Error(`${context} control-plane records are missing.`);
  }

  return archive.controlPlane;
}

function assertSupportedSourceRecord(record: StoredRecord) {
  const entity = recordSourceEntityName(record.entity);

  if (entity === undefined) {
    if (excludedRecordSourceEntitySet.has(record.entity)) {
      throw new Error(
        `Workspace control-plane record source does not support execution-history entity "${formatSourceEntityLabel(record.entity)}".`,
      );
    }

    throw new Error(
      `Workspace control-plane record source does not support entity "${formatSourceEntityLabel(record.entity)}".`,
    );
  }
}

function sourceRecordSourceRecords(records: readonly StoredRecord[]): StoredRecord[] {
  const sourceRecords: StoredRecord[] = [];

  for (const record of records) {
    const entity = recordSourceEntityName(record.entity);

    if (entity !== undefined) {
      sourceRecords.push({
        ...record,
        entity,
      });
      continue;
    }

    if (excludedRecordSourceEntitySet.has(record.entity)) {
      continue;
    }

    throw new Error(
      `Workspace control-plane record source does not support entity "${formatSourceEntityLabel(record.entity)}".`,
    );
  }

  return sourceRecords;
}

function assertSourceRecordImmutableIdentity(record: StoredRecord) {
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

    if (record.id !== targetId) {
      throw new Error(
        `Workspace control-plane record source record "${record.id}" field "instance:deploy-target.targetId" must match record id.`,
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

function assertSourceRoutesAreValid(records: readonly StoredRecord[]) {
  const activeRecords = new Map(
    records.filter((record) => !record.deletedAt).map((record) => [record.id, record]),
  );
  const routes = records.filter((record) => record.entity === "route" && !record.deletedAt);

  for (const route of routes) {
    validateSourceRoute(route, activeRecords, routes);
  }
}

function validateSourceRoute(
  route: StoredRecord,
  activeRecords: ReadonlyMap<string, StoredRecord>,
  routes: readonly StoredRecord[],
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
  route: StoredRecord,
  activeRecords: ReadonlyMap<string, StoredRecord>,
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

function validateSourceRedirectRoute(route: StoredRecord, matchHost: string | undefined) {
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

function assertEnabledSourceRouteIsUnique(route: StoredRecord, routes: readonly StoredRecord[]) {
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

function sourceRouteMatch(route: StoredRecord): {
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

function assertNormalizedExactHost(route: StoredRecord, fieldName: string, value: string) {
  const normalized = normalizeInstanceDomainHost(value);

  if (!normalized.ok || normalized.host !== value) {
    throw new Error(
      `Workspace control-plane record source route "${route.id}" field "instance:route.${fieldName}" must be a normalized exact host.`,
    );
  }
}

function assertNormalizedHttpsUrl(route: StoredRecord, fieldName: string, value: string) {
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
    throw new Error(
      `Workspace control-plane record source route "${route.id}" field "instance:route.${fieldName}" must be a normalized absolute HTTPS URL without credentials or fragment.`,
    );
  }
}

function assertNormalizedAbsoluteMatchPath(route: StoredRecord, fieldName: string, value: string) {
  if (!isNormalizedAbsoluteRoutePath(value)) {
    throw new Error(
      `Workspace control-plane record source route "${route.id}" field "instance:route.${fieldName}" must be a normalized absolute path.`,
    );
  }
}

function assertNormalizedMatchPrefix(route: StoredRecord, matchPath: string, matchPrefix: string) {
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

function parseRecordSourceEntity(
  context: string,
  value: string,
): FormlessInstanceControlPlaneRecordSourceEntity {
  const entity = parseInstanceControlPlaneBoundaryEntityName(context, value);

  if (!isRecordSourceEntity(entity)) {
    throw new Error(`${context} "${value}" is not a workspace control-plane record source entity.`);
  }

  return entity;
}

function recordSourceEntityName(
  value: string,
): FormlessInstanceControlPlaneRecordSourceEntity | undefined {
  const localEntity = value.startsWith("instance:")
    ? tryParseBoundaryEntityName(value)
    : isRecordSourceEntity(value)
      ? value
      : undefined;

  return localEntity !== undefined && isRecordSourceEntity(localEntity) ? localEntity : undefined;
}

function tryParseBoundaryEntityName(value: string): string | undefined {
  try {
    return parseInstanceControlPlaneBoundaryEntityName(
      "Workspace control-plane record entity",
      value,
    );
  } catch {
    return undefined;
  }
}

function isRecordSourceEntity(
  value: string,
): value is FormlessInstanceControlPlaneRecordSourceEntity {
  return recordSourceEntitySet.has(value);
}

function recordSourceFileName(entity: FormlessInstanceControlPlaneRecordSourceEntity): string {
  return `${entity}.json`;
}

function canonicalRecordSourceRecord(
  entity: FormlessInstanceControlPlaneRecordSourceEntity,
  record: StoredRecord,
): StoredRecord {
  return {
    id: record.id,
    entity: formatInstanceControlPlaneBoundaryEntityName(entity),
    values: Object.fromEntries(
      Object.entries(record.values).sort(([left], [right]) => left.localeCompare(right)),
    ) as RecordValues,
    createdAt: record.createdAt,
    ...(record.deletedAt === undefined ? {} : { deletedAt: record.deletedAt }),
  };
}

function compareRecordSourceRecords(left: StoredRecord, right: StoredRecord) {
  const createdAtOrder = left.createdAt.localeCompare(right.createdAt);

  if (createdAtOrder !== 0) {
    return createdAtOrder;
  }

  return left.id.localeCompare(right.id);
}

function requiredStringValue(record: StoredRecord, fieldName: string): string {
  const value = record.values[fieldName];

  if (typeof value !== "string") {
    throw new Error(
      `Workspace control-plane record source record "${record.id}" field "${formatSourceEntityLabel(record.entity)}.${fieldName}" must be a string.`,
    );
  }

  return value;
}

function optionalStringValue(record: StoredRecord, fieldName: string): string | undefined {
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

  return sourceEntity === undefined
    ? entity
    : formatInstanceControlPlaneBoundaryEntityName(sourceEntity);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
