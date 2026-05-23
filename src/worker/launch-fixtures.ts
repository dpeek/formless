import { findAppInstall, type AppInstall } from "../shared/app-installs.ts";
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
  createInstanceAppInstall,
  readInstanceAppInstalls,
} from "./instance-app-installs-state.ts";
import { findWorkerSchemaAppDefinition } from "./schema-apps.ts";
import {
  ensureStorageTables,
  initializeStorageFromSource,
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

export function initializeInstanceAppInstallsFromLaunchFixture(
  storage: DurableObjectStorage,
  plan: LaunchFixtureInitializationPlan,
): LaunchFixtureInstanceInitializationResult {
  const createdInstalls: AppInstall[] = [];

  for (const appPlan of plan.appInstalls) {
    const existing = readInstanceAppInstalls(storage);

    if (findAppInstall(existing, appPlan.install.installId)) {
      continue;
    }

    const result = createInstanceAppInstall(storage, {
      installId: appPlan.install.installId,
      label: appPlan.install.label,
      now: appPlan.install.createdAt,
      packageAppKey: appPlan.install.packageAppKey,
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    createdInstalls.push(result.install);
  }

  return {
    createdInstalls,
    fixtureName: plan.fixtureName,
    installs: readInstanceAppInstalls(storage),
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
    changeMutationPrefix: seed.seedChangeMutationPrefix,
    records: seed.seedRecords,
    schema: source.sourceSchema,
  };
}

export function initializeInstanceAppInstallsFromConfiguredLaunchFixture(
  storage: DurableObjectStorage,
  env: LaunchFixtureStartupEnv,
): LaunchFixtureInstanceInitializationResult | undefined {
  const plan = configuredLaunchFixtureInitializationPlan(env);

  return plan ? initializeInstanceAppInstallsFromLaunchFixture(storage, plan) : undefined;
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

function configuredLaunchFixtureInitializationPlan(
  env: LaunchFixtureStartupEnv,
): LaunchFixtureInitializationPlan | undefined {
  const fixtureName = stringConfigValue(env.FORMLESS_LAUNCH_FIXTURE);

  if (!fixtureName) {
    return undefined;
  }

  const plan = createLaunchFixtureInitializationPlan(fixtureName, { now: nowIsoString() });

  if (!plan) {
    throw new Error(
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
