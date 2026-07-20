import path from "node:path";

import { mkdir, writeFile } from "node:fs/promises";

import rawTaskSeedRecords from "@dpeek/formless-tasks-app/seed-records.json";
import rawTaskSourceSchema from "@dpeek/formless-tasks-app/schema.json";
import {
  appPackageManifestKind,
  appPackageManifestVersion,
  computeSourceSchemaHash,
  parseAppPackageManifest,
  type AppPackageCapability,
  type AppPackageManifest,
  type SourceSchemaHash,
} from "@dpeek/formless-installed-apps";

export type WorkspaceAppPackageFixture = {
  manifest: AppPackageManifest;
  manifestPath: string;
  packageRoot: string;
  seedRecords: unknown[];
  seedRecordsPath: string;
  sourceSchema: unknown;
  sourceSchemaHash: SourceSchemaHash;
  sourceSchemaPath: string;
};

type WorkspaceAppPackageFixtureOptions = {
  capabilities?: AppPackageCapability[];
  defaultInstallId?: string;
  description?: string;
  label?: string;
  packageAppKey?: string;
  packageRevision?: number;
  seedRecords?: unknown[];
  seedRecordsPath?: string;
  sourceSchema?: unknown;
  sourceSchemaHash?: SourceSchemaHash;
  sourceSchemaPath?: string;
  supportsMultipleInstalls?: boolean;
};

export async function writeWorkspaceAppPackageFixture(
  packageRoot: string,
  options: WorkspaceAppPackageFixtureOptions = {},
): Promise<WorkspaceAppPackageFixture> {
  const sourceSchema = options.sourceSchema ?? rawTaskSourceSchema;
  const seedRecords = options.seedRecords ?? rawTaskSeedRecords;
  const sourceSchemaHash =
    options.sourceSchemaHash ?? (await computeSourceSchemaHash(sourceSchema));
  const sourceSchemaPath = options.sourceSchemaPath ?? "source/schema.json";
  const seedRecordsPath = options.seedRecordsPath ?? "source/seed-records.json";
  const manifest = workspaceAppPackageManifestFixture({
    ...options,
    seedRecordsPath,
    sourceSchemaHash,
    sourceSchemaPath,
  });
  const manifestPath = path.join(packageRoot, "formless.app.json");
  const resolvedSourceSchemaPath = path.join(packageRoot, sourceSchemaPath);
  const resolvedSeedRecordsPath = path.join(packageRoot, seedRecordsPath);

  await writeJsonFile(resolvedSourceSchemaPath, sourceSchema);
  await writeJsonFile(resolvedSeedRecordsPath, seedRecords);
  await writeJsonFile(manifestPath, manifest);

  return {
    manifest,
    manifestPath,
    packageRoot,
    seedRecords,
    seedRecordsPath: resolvedSeedRecordsPath,
    sourceSchema,
    sourceSchemaHash,
    sourceSchemaPath: resolvedSourceSchemaPath,
  };
}

export function workspaceAppPackageManifestFixture(
  options: WorkspaceAppPackageFixtureOptions & { sourceSchemaHash: SourceSchemaHash },
): AppPackageManifest {
  const packageAppKey = options.packageAppKey ?? "private-labs";
  const label = options.label ?? "Private Labs";
  const defaultInstallId = options.defaultInstallId ?? "labs";
  const sourceSchemaPath = options.sourceSchemaPath ?? "source/schema.json";
  const seedRecordsPath = options.seedRecordsPath ?? "source/seed-records.json";

  return parseAppPackageManifest({
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey,
    label,
    description: options.description ?? "Private lab package fixture.",
    defaultInstallId,
    supportsMultipleInstalls: options.supportsMultipleInstalls ?? false,
    packageRevision: options.packageRevision ?? 7,
    sourceSchema: {
      kind: "workspace",
      key: packageAppKey,
      path: sourceSchemaPath,
    },
    seedRecords: {
      kind: "workspace",
      key: packageAppKey,
      path: seedRecordsPath,
    },
    sourceSchemaHash: options.sourceSchemaHash,
    capabilities: options.capabilities ?? [{ kind: "generatedAdmin", routeBase: "/apps" }],
  });
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
