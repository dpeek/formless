import { parseAppSchema } from "@dpeek/formless-schema";
import type { AppInstall } from "@dpeek/formless-installed-apps";
import {
  type AppStorageIdentity,
  type InstalledAppStorageIdentity,
} from "../shared/app-storage-identity.ts";
import type {
  LaunchFixtureAppInitializationPlan,
  LaunchFixtureInitializationPlan,
} from "../shared/launch-fixtures.ts";
import {
  createLaunchFixtureInitializationPlan,
  listLaunchFixtureNames,
} from "../shared/launch-fixtures.ts";
import { nowIsoString } from "../shared/clock.ts";
import {
  instanceControlPlaneAppInstallsFromRecords,
  instanceControlPlaneRecordsForAppInstall,
  instanceControlPlaneSchema,
  instanceControlPlaneSchemaProvenance,
} from "@dpeek/formless-instance-control-plane";
import { bundledAppPackageResolver, type AppPackageResolver } from "../shared/app-packages.ts";
import { findWorkerSchemaAppDefinition } from "./schema-apps.ts";
import {
  ensureStorageTables,
  getBootstrapRecords,
  initializeStorageFromSource,
  readCurrentStoredSchema,
  type StorageSource,
  type StoredSchema,
} from "./storage.ts";

export type LaunchFixtureInstanceInitializationResult = {
  createdInstalls: AppInstall[];
  fixtureName: LaunchFixtureInitializationPlan["fixtureName"];
  installs: AppInstall[];
};

export type LaunchFixtureStartupEnv = {
  FORMLESS_LAUNCH_FIXTURE?: string;
};

export class LaunchFixtureConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LaunchFixtureConfigurationError";
  }
}

export function launchFixtureControlPlaneRecords(
  plan: LaunchFixtureInitializationPlan,
): ReturnType<typeof instanceControlPlaneRecordsForAppInstall>[number][] {
  return plan.appInstalls.flatMap((appPlan) =>
    instanceControlPlaneRecordsForAppInstall({
      install: appPlan.install,
      now: appPlan.install.createdAt,
    }),
  );
}

export function launchFixtureControlPlaneRecordsForEnv(
  env: LaunchFixtureStartupEnv,
): ReturnType<typeof instanceControlPlaneRecordsForAppInstall>[number][] {
  const plan = configuredLaunchFixtureInitializationPlan(env);

  return plan ? launchFixtureControlPlaneRecords(plan) : [];
}

export function launchFixtureControlPlaneStorageSource(
  plan: LaunchFixtureInitializationPlan,
): StorageSource {
  return {
    changeWritePrefix: "seed-instance-control-plane",
    records: launchFixtureControlPlaneRecords(plan),
    schemaKey: "instance-control-plane",
    schemaProvenance: instanceControlPlaneSchemaProvenance,
    schema: parseAppSchema(instanceControlPlaneSchema),
    storageIdentity: "instance:control-plane",
  };
}

export function initializeControlPlaneFromLaunchFixture(
  storage: DurableObjectStorage,
  plan: LaunchFixtureInitializationPlan,
  packageResolver?: AppPackageResolver,
): LaunchFixtureInstanceInitializationResult {
  ensureStorageTables(storage);
  const initialized = readCurrentStoredSchema(storage) !== undefined;
  const resolver = packageResolver ?? bundledAppPackageResolver;
  initializeStorageFromSource(storage, launchFixtureControlPlaneStorageSource(plan));
  const installs = instanceControlPlaneAppInstallsFromRecords(
    getBootstrapRecords(storage),
    resolver,
  );

  return {
    createdInstalls: initialized ? [] : plan.appInstalls.map((appPlan) => appPlan.install),
    fixtureName: plan.fixtureName,
    installs,
  };
}

export function initializeLaunchFixtureAppStorage(
  storage: DurableObjectStorage,
  appPlan: LaunchFixtureAppInitializationPlan,
): StoredSchema {
  ensureStorageTables(storage);

  return initializeStorageFromSource(storage, launchFixtureStorageSourceForApp(appPlan));
}

export function launchFixtureStorageSourceForApp(
  appPlan: LaunchFixtureAppInitializationPlan,
): StorageSource {
  const source = findWorkerSchemaAppDefinition(appPlan.initialization.sourceSchemaKey);
  const seed = findWorkerSchemaAppDefinition(appPlan.initialization.seedRecordsKey);

  if (!source || !seed) {
    throw new Error(
      `Launch fixture "${appPlan.fixtureName}" install "${appPlan.install.installId}" has unavailable source.`,
    );
  }

  return {
    changeWritePrefix: seed.seedChangeWritePrefix,
    records: seed.seedRecords,
    schemaKey: source.key,
    schemaProvenance: {
      kind: "package-app",
      packageAppKey: appPlan.install.packageAppKey,
      packageRevision: appPlan.install.packageRevision,
      sourceSchemaHash: appPlan.install.sourceSchemaHash,
    },
    schema: source.sourceSchema,
    storageIdentity: `app:${appPlan.install.installId}`,
  };
}

export function launchFixtureStorageSourceForIdentity(
  identity: AppStorageIdentity,
  env: LaunchFixtureStartupEnv,
): StorageSource | undefined {
  const appPlan = configuredLaunchFixtureAppPlanForIdentity(identity, env);

  return appPlan ? launchFixtureStorageSourceForApp(appPlan) : undefined;
}

export function launchFixtureStorageSourceForAuthorityName(
  authorityName: string | undefined,
  env: LaunchFixtureStartupEnv,
): StorageSource | undefined {
  if (!authorityName?.startsWith("app:")) {
    return undefined;
  }

  const plan = configuredLaunchFixtureInitializationPlan(env);

  if (!plan) {
    return undefined;
  }

  const installId = authorityName.slice("app:".length);
  const appPlan = plan.appInstalls.find((candidate) => candidate.install.installId === installId);

  return appPlan ? launchFixtureStorageSourceForApp(appPlan) : undefined;
}

function configuredLaunchFixtureAppPlanForIdentity(
  identity: AppStorageIdentity,
  env: LaunchFixtureStartupEnv,
): LaunchFixtureAppInitializationPlan | undefined {
  if (identity.kind !== "appInstall") {
    return undefined;
  }

  const plan = configuredLaunchFixtureInitializationPlan(env);

  if (!plan) {
    return undefined;
  }

  return plan.appInstalls.find((appPlan) => appPlanMatchesIdentity(appPlan, identity));
}

function appPlanMatchesIdentity(
  appPlan: LaunchFixtureAppInitializationPlan,
  identity: InstalledAppStorageIdentity,
): boolean {
  return (
    appPlan.install.installId === identity.installId &&
    appPlan.install.packageAppKey === identity.packageAppKey
  );
}

export function configuredLaunchFixtureInitializationPlan(
  env: LaunchFixtureStartupEnv,
): LaunchFixtureInitializationPlan | undefined {
  const fixtureName = stringConfigValue(env.FORMLESS_LAUNCH_FIXTURE);

  if (!fixtureName) {
    return undefined;
  }

  if (fixtureName === "default-site") {
    throw new LaunchFixtureConfigurationError(
      'Launch fixture "default-site" has been removed. Use "empty" and install Site through /api/formless/app-installs.',
    );
  }

  const plan = createLaunchFixtureInitializationPlan(fixtureName, { now: nowIsoString() });

  if (!plan) {
    throw new LaunchFixtureConfigurationError(
      `Unknown launch fixture "${fixtureName}". Available fixtures: ${listLaunchFixtureNames().join(
        ", ",
      )}.`,
    );
  }

  return plan;
}

function stringConfigValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
