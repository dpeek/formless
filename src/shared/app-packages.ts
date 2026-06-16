import rawSiteAppPackageManifest from "@dpeek/formless-site-app/formless.app.json";
import {
  appPackageManifestKind,
  appPackageManifestVersion,
  createAppPackageResolver,
  findResolvedAppPackage as findResolvedAppPackageWithResolver,
  listResolvedAppPackages as listResolvedAppPackagesWithResolver,
  parseAppPackageManifest,
  type AppPackageManifest,
  type AppPackageResolver,
  type PackageAppRevision,
  type ResolvedAppPackage,
  type SourceSchemaHash,
} from "@dpeek/formless-installed-apps";

import { schemaAppDefinitions, type SchemaKey } from "./schema-apps.ts";
import { bundledSourceSchemaHashFixtures } from "./upgrade-migrations.ts";

export {
  appPackageManifestKind,
  appPackageManifestVersion,
  createAppPackageResolver,
  parseAppPackageManifest,
  type AppPackageCapability,
  type AppPackageKey,
  type AppPackageManifest,
  type AppPackageResolver,
  type AppPackageSourceLocation,
  type AppPackageSourceLocationKind,
  type AppPackageSourceOrigin,
  type ResolvedAppPackage,
} from "@dpeek/formless-installed-apps";

const currentBundledPackageAppRevision = 1 satisfies PackageAppRevision;

export const bundledAppPackageManifests = [
  bundledAppPackageManifestFromSource(rawSiteAppPackageManifest, {
    context: "bundled Site app package manifest",
    packageAppKey: "site",
  }),
  bundledAppPackageManifest({
    packageAppKey: "tasks",
    label: schemaAppDefinitions.tasks.label,
    description: "Task tracking app backed by the bundled Tasks schema and starter records.",
    defaultInstallId: "tasks",
    sourceSchemaHash: bundledSourceSchemaHashFixtures.tasks,
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

export function listResolvedAppPackages(
  resolver: AppPackageResolver = bundledAppPackageResolver,
): ResolvedAppPackage[] {
  return listResolvedAppPackagesWithResolver(resolver);
}

export function findResolvedAppPackage(
  packageAppKey: string,
  resolver: AppPackageResolver = bundledAppPackageResolver,
): ResolvedAppPackage | undefined {
  return findResolvedAppPackageWithResolver(packageAppKey, resolver);
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

function bundledAppPackageManifestFromSource(
  manifest: unknown,
  input: {
    context: string;
    packageAppKey: SchemaKey;
  },
): AppPackageManifest {
  const parsed = parseAppPackageManifest(manifest, input.context);

  if (parsed.packageAppKey !== input.packageAppKey) {
    throw new Error(`${input.context} packageAppKey must be "${input.packageAppKey}".`);
  }

  if (parsed.sourceSchema.kind !== "bundled") {
    throw new Error(`${input.context} sourceSchema kind must be "bundled".`);
  }

  if (parsed.seedRecords.kind !== "bundled") {
    throw new Error(`${input.context} seedRecords kind must be "bundled".`);
  }

  return parsed;
}
