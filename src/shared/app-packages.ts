import { schemaAppDefinitions, type SchemaKey } from "./schema-apps.ts";
import {
  bundledSourceSchemaHashFixtures,
  isSourceSchemaHash,
  type PackageAppRevision,
  type SourceSchemaHash,
} from "./upgrade-migrations.ts";

export const appPackageManifestKind = "formless.appPackage";
export const appPackageManifestVersion = 1;

export type AppPackageKey = string;
export type AppPackageSourceOrigin = "bundled" | "workspace";
export type AppPackageSourceLocationKind = AppPackageSourceOrigin;

export type AppPackageSourceLocation = {
  kind: AppPackageSourceLocationKind;
  key: string;
  path: string;
};

export type AppPackageCapability =
  | {
      kind: "generatedAdmin";
      routeBase: "/apps";
    }
  | {
      kind: "publicSite";
      routeBase: "/sites";
    };

export type AppPackageManifest = {
  kind: typeof appPackageManifestKind;
  version: typeof appPackageManifestVersion;
  packageAppKey: AppPackageKey;
  label: string;
  description?: string;
  defaultInstallId: string;
  supportsMultipleInstalls: boolean;
  packageRevision: PackageAppRevision;
  sourceSchema: AppPackageSourceLocation;
  seedRecords: AppPackageSourceLocation;
  sourceSchemaHash: SourceSchemaHash;
  capabilities: AppPackageCapability[];
};

export type ResolvedAppPackage = {
  packageAppKey: AppPackageKey;
  packageRevision: PackageAppRevision;
  sourceSchemaHash: SourceSchemaHash;
  label: string;
  description: string;
  defaultInstallId: string;
  supportsMultipleInstalls: boolean;
  sourceOrigin: AppPackageSourceOrigin;
  sourceSchemaKey: string;
  seedRecordsKey: string;
  sourceSchemaLocation: AppPackageSourceLocation;
  seedRecordsLocation: AppPackageSourceLocation;
  adminRouteBase: "/apps";
  publicRouteBase?: "/sites";
};

export type AppPackageResolver = {
  findPackage(packageAppKey: string): ResolvedAppPackage | undefined;
  listPackages(): ResolvedAppPackage[];
};

const routeSafeIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const routeSafeIdMinLength = 2;
const routeSafeIdMaxLength = 64;
const sourceLocationPathPattern = /^[a-z0-9][a-z0-9._/-]*\.json$/;
const reservedDefaultInstallIds = new Set([
  "admin",
  "api",
  "app",
  "apps",
  "asset",
  "assets",
  "favicon",
  "new",
  "robots",
  "schema",
  "setup",
  "sites",
  "sitemap",
  "static",
]);
const currentBundledPackageAppRevision = 1 satisfies PackageAppRevision;

export const bundledAppPackageManifests = [
  bundledAppPackageManifest({
    packageAppKey: "site",
    label: schemaAppDefinitions.site.label,
    description: "Public website app backed by the bundled Site schema and starter records.",
    defaultInstallId: "site",
    sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
    publicSite: true,
  }),
  bundledAppPackageManifest({
    packageAppKey: "tasks",
    label: schemaAppDefinitions.tasks.label,
    description: "Task tracking app backed by the bundled Tasks schema and starter records.",
    defaultInstallId: "tasks",
    sourceSchemaHash: bundledSourceSchemaHashFixtures.tasks,
  }),
  bundledAppPackageManifest({
    packageAppKey: "estii",
    label: schemaAppDefinitions.estii.label,
    description: "Rate-card app backed by the bundled Estii schema and starter records.",
    defaultInstallId: "estii",
    sourceSchemaHash: bundledSourceSchemaHashFixtures.estii,
  }),
  bundledAppPackageManifest({
    packageAppKey: "crm",
    label: schemaAppDefinitions.crm.label,
    description: "CRM app backed by the bundled CRM schema and demo records.",
    defaultInstallId: "crm",
    sourceSchemaHash: bundledSourceSchemaHashFixtures.crm,
  }),
] as const satisfies readonly AppPackageManifest[];

export const bundledAppPackageResolver = createAppPackageResolver(bundledAppPackageManifests);

export function parseAppPackageManifest(
  value: unknown,
  context = "app package manifest",
): AppPackageManifest {
  const object = parseObject(value, context);
  rejectUnknownKeys(object, context, [
    "capabilities",
    "defaultInstallId",
    "description",
    "kind",
    "label",
    "packageAppKey",
    "packageRevision",
    "seedRecords",
    "sourceSchema",
    "sourceSchemaHash",
    "supportsMultipleInstalls",
    "version",
  ]);

  if (object.kind !== appPackageManifestKind) {
    throw new Error(`${context} kind must be "${appPackageManifestKind}".`);
  }

  if (object.version !== appPackageManifestVersion) {
    throw new Error(`${context} version must be ${appPackageManifestVersion}.`);
  }

  const packageAppKey = parseRouteSafeId(object.packageAppKey, `${context} packageAppKey`);
  const defaultInstallId = parseRouteSafeId(object.defaultInstallId, `${context} defaultInstallId`);

  if (reservedDefaultInstallIds.has(defaultInstallId)) {
    throw new Error(`${context} defaultInstallId "${defaultInstallId}" is reserved.`);
  }

  const label = parseRequiredString(object.label, `${context} label`);
  const description =
    object.description === undefined
      ? undefined
      : parseRequiredString(object.description, `${context} description`);
  const supportsMultipleInstalls = parseBoolean(
    object.supportsMultipleInstalls,
    `${context} supportsMultipleInstalls`,
  );
  const packageRevision = parsePackageRevision(
    object.packageRevision,
    `${context} packageRevision`,
  );
  const sourceSchema = parseSourceLocation(
    object.sourceSchema,
    `${context} sourceSchema`,
    "schema.json",
  );
  const seedRecords = parseSourceLocation(
    object.seedRecords,
    `${context} seedRecords`,
    "seed-records.json",
  );
  const sourceSchemaHash = parseSourceSchemaHash(
    object.sourceSchemaHash,
    `${context} sourceSchemaHash`,
  );
  const capabilities = parseCapabilities(object.capabilities, `${context} capabilities`);

  return {
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey,
    label,
    ...(description === undefined ? {} : { description }),
    defaultInstallId,
    supportsMultipleInstalls,
    packageRevision,
    sourceSchema,
    seedRecords,
    sourceSchemaHash,
    capabilities,
  };
}

export function createAppPackageResolver(manifests: readonly unknown[]): AppPackageResolver {
  const packages = manifests.map((manifest, index) =>
    resolveAppPackageManifest(manifest, `app package manifests[${index}]`),
  );
  const packagesByKey = new Map<string, ResolvedAppPackage>();

  for (const appPackage of packages) {
    if (packagesByKey.has(appPackage.packageAppKey)) {
      throw new Error(`Package app key "${appPackage.packageAppKey}" is already resolved.`);
    }

    packagesByKey.set(appPackage.packageAppKey, appPackage);
  }

  return {
    findPackage(packageAppKey) {
      const appPackage = packagesByKey.get(packageAppKey);

      return appPackage ? cloneResolvedAppPackage(appPackage) : undefined;
    },
    listPackages() {
      return packages.map(cloneResolvedAppPackage);
    },
  };
}

export function listResolvedAppPackages(
  resolver: AppPackageResolver = bundledAppPackageResolver,
): ResolvedAppPackage[] {
  return resolver.listPackages();
}

export function findResolvedAppPackage(
  packageAppKey: string,
  resolver: AppPackageResolver = bundledAppPackageResolver,
): ResolvedAppPackage | undefined {
  return resolver.findPackage(packageAppKey);
}

function resolveAppPackageManifest(manifest: unknown, context: string): ResolvedAppPackage {
  const parsed = parseAppPackageManifest(manifest, context);
  const generatedAdmin = parsed.capabilities.find(
    (capability): capability is Extract<AppPackageCapability, { kind: "generatedAdmin" }> =>
      capability.kind === "generatedAdmin",
  );
  const publicSite = parsed.capabilities.find(
    (capability): capability is Extract<AppPackageCapability, { kind: "publicSite" }> =>
      capability.kind === "publicSite",
  );

  if (!generatedAdmin) {
    throw new Error(`${context} capabilities must include generatedAdmin.`);
  }

  return {
    packageAppKey: parsed.packageAppKey,
    packageRevision: parsed.packageRevision,
    sourceSchemaHash: parsed.sourceSchemaHash,
    label: parsed.label,
    description: parsed.description ?? "",
    defaultInstallId: parsed.defaultInstallId,
    supportsMultipleInstalls: parsed.supportsMultipleInstalls,
    sourceOrigin: parsed.sourceSchema.kind,
    sourceSchemaKey: parsed.sourceSchema.key,
    seedRecordsKey: parsed.seedRecords.key,
    sourceSchemaLocation: cloneSourceLocation(parsed.sourceSchema),
    seedRecordsLocation: cloneSourceLocation(parsed.seedRecords),
    adminRouteBase: generatedAdmin.routeBase,
    ...(publicSite === undefined ? {} : { publicRouteBase: publicSite.routeBase }),
  };
}

function bundledAppPackageManifest(input: {
  packageAppKey: SchemaKey;
  label: string;
  description: string;
  defaultInstallId: string;
  sourceSchemaHash: SourceSchemaHash;
  publicSite?: boolean;
}): AppPackageManifest {
  const sourcePath = `schema/apps/${input.packageAppKey}/schema.json`;
  const seedRecordsPath = `schema/apps/${input.packageAppKey}/seed-records.json`;

  return parseAppPackageManifest({
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey: input.packageAppKey,
    label: input.label,
    description: input.description,
    defaultInstallId: input.defaultInstallId,
    supportsMultipleInstalls: true,
    packageRevision: currentBundledPackageAppRevision,
    sourceSchema: {
      kind: "bundled",
      key: input.packageAppKey,
      path: sourcePath,
    },
    seedRecords: {
      kind: "bundled",
      key: input.packageAppKey,
      path: seedRecordsPath,
    },
    sourceSchemaHash: input.sourceSchemaHash,
    capabilities: [
      {
        kind: "generatedAdmin",
        routeBase: "/apps",
      },
      ...(input.publicSite
        ? [
            {
              kind: "publicSite" as const,
              routeBase: "/sites" as const,
            },
          ]
        : []),
    ],
  });
}

function parseSourceLocation(
  value: unknown,
  context: string,
  expectedFileName: "schema.json" | "seed-records.json",
): AppPackageSourceLocation {
  const object = parseObject(value, context);
  rejectUnknownKeys(object, context, ["key", "kind", "path"]);

  if (object.kind !== "bundled" && object.kind !== "workspace") {
    throw new Error(`${context} kind must be "bundled" or "workspace".`);
  }

  const key = parseRouteSafeId(object.key, `${context} key`);
  const path = parseSourceLocationPath(object.path, context, expectedFileName);

  return {
    kind: object.kind,
    key,
    path,
  };
}

function parseCapabilities(value: unknown, context: string): AppPackageCapability[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  const capabilities = value.map((capability, index) =>
    parseCapability(capability, `${context}[${index}]`),
  );
  const seen = new Set<AppPackageCapability["kind"]>();

  for (const capability of capabilities) {
    if (seen.has(capability.kind)) {
      throw new Error(`${context} must not repeat "${capability.kind}".`);
    }

    seen.add(capability.kind);
  }

  if (!seen.has("generatedAdmin")) {
    throw new Error(`${context} must include generatedAdmin.`);
  }

  return capabilities;
}

function parseCapability(value: unknown, context: string): AppPackageCapability {
  const object = parseObject(value, context);
  rejectUnknownKeys(object, context, ["kind", "routeBase"]);

  if (object.kind === "generatedAdmin") {
    if (object.routeBase !== "/apps") {
      throw new Error(`${context} routeBase must be "/apps".`);
    }

    return {
      kind: "generatedAdmin",
      routeBase: "/apps",
    };
  }

  if (object.kind === "publicSite") {
    if (object.routeBase !== "/sites") {
      throw new Error(`${context} routeBase must be "/sites".`);
    }

    return {
      kind: "publicSite",
      routeBase: "/sites",
    };
  }

  throw new Error(`${context} kind is unsupported.`);
}

function parseRouteSafeId(value: unknown, context: string): string {
  if (typeof value !== "string") {
    throw new Error(`${context} must be a string.`);
  }

  if (value.length < routeSafeIdMinLength) {
    throw new Error(`${context} must be at least ${routeSafeIdMinLength} characters.`);
  }

  if (value.length > routeSafeIdMaxLength) {
    throw new Error(`${context} must be ${routeSafeIdMaxLength} characters or fewer.`);
  }

  if (!routeSafeIdPattern.test(value)) {
    throw new Error(
      `${context} must start with a lowercase letter and use lowercase letters, numbers, and single hyphens.`,
    );
  }

  return value;
}

function parseRequiredString(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function parseBoolean(value: unknown, context: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${context} must be a boolean.`);
  }

  return value;
}

function parsePackageRevision(value: unknown, context: string): PackageAppRevision {
  if (!Number.isInteger(value) || typeof value !== "number" || value <= 0) {
    throw new Error(`${context} must be a positive integer.`);
  }

  return value;
}

function parseSourceSchemaHash(value: unknown, context: string): SourceSchemaHash {
  if (!isSourceSchemaHash(value)) {
    throw new Error(`${context} must be a sha256 source schema hash.`);
  }

  return value;
}

function parseSourceLocationPath(
  value: unknown,
  context: string,
  expectedFileName: "schema.json" | "seed-records.json",
): string {
  if (typeof value !== "string" || !sourceLocationPathPattern.test(value)) {
    throw new Error(`${context} path must be a relative JSON path.`);
  }

  if (value.startsWith("/") || value.includes("//") || value.split("/").includes("..")) {
    throw new Error(`${context} path must stay within the package source.`);
  }

  if (!value.endsWith(`/${expectedFileName}`) && value !== expectedFileName) {
    throw new Error(`${context} path must end with "${expectedFileName}".`);
  }

  return value;
}

function parseObject(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function rejectUnknownKeys(
  object: Record<string, unknown>,
  context: string,
  allowedKeys: readonly string[],
) {
  const allowed = new Set(allowedKeys);
  const unknownKey = Object.keys(object).find((key) => !allowed.has(key));

  if (unknownKey) {
    throw new Error(`${context} contains unsupported field "${unknownKey}".`);
  }
}

function cloneResolvedAppPackage(appPackage: ResolvedAppPackage): ResolvedAppPackage {
  return {
    ...appPackage,
    sourceSchemaLocation: cloneSourceLocation(appPackage.sourceSchemaLocation),
    seedRecordsLocation: cloneSourceLocation(appPackage.seedRecordsLocation),
  };
}

function cloneSourceLocation(location: AppPackageSourceLocation): AppPackageSourceLocation {
  return {
    ...location,
  };
}
