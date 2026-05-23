import { findAppInstall, type AppInstall } from "../shared/app-installs.ts";
import type {
  LaunchFixtureAppInitializationPlan,
  LaunchFixtureInitializationPlan,
} from "../shared/launch-fixtures.ts";
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
