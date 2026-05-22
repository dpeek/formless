import {
  appInstallRegistryError,
  createAppInstall,
  findBundledAppPackage,
  listAppInstalls,
  type AppInstall,
  type CreateAppInstallResult,
} from "../shared/app-installs.ts";
import type { CreateAppInstallRequest } from "../shared/protocol.ts";
import { findWorkerSchemaAppDefinition } from "./schema-apps.ts";

type AppInstallRow = {
  install_id: string;
  package_app_key: string;
  label: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export function ensureInstanceAppInstallTables(storage: DurableObjectStorage) {
  storage.sql.exec(`
    CREATE TABLE IF NOT EXISTS app_installs (
      install_id TEXT PRIMARY KEY,
      package_app_key TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status = 'installed'),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function readInstanceAppInstalls(storage: DurableObjectStorage): AppInstall[] {
  ensureInstanceAppInstallTables(storage);

  return listAppInstalls(readAppInstalls(storage));
}

export function createInstanceAppInstall(
  storage: DurableObjectStorage,
  input: CreateAppInstallRequest & { now: string },
): CreateAppInstallResult {
  ensureInstanceAppInstallTables(storage);

  return storage.transactionSync(() => {
    const result = createAppInstall({
      existingInstalls: readAppInstalls(storage),
      installId: input.installId,
      label: input.label,
      now: input.now,
      packageAppKey: input.packageAppKey,
      validateInitialSource: ({ initialization }) => {
        const source = findWorkerSchemaAppDefinition(initialization.sourceSchemaKey);
        const seed = findWorkerSchemaAppDefinition(initialization.seedRecordsKey);

        if (!source || !seed) {
          return appInstallRegistryError(
            "source-validation-failed",
            "source",
            `Package app "${initialization.packageAppKey}" source is unavailable.`,
          );
        }

        return undefined;
      },
    });

    if (!result.ok) {
      return result;
    }

    storage.sql.exec(
      `
        INSERT INTO app_installs (
          install_id,
          package_app_key,
          label,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      result.install.installId,
      result.install.packageAppKey,
      result.install.label,
      result.install.status,
      result.install.createdAt,
      result.install.updatedAt,
    );

    return {
      ...result,
      installs: readInstanceAppInstalls(storage),
    };
  });
}

function readAppInstalls(storage: DurableObjectStorage): AppInstall[] {
  const installs: AppInstall[] = [];

  for (const row of storage.sql.exec<AppInstallRow>(
    `
      SELECT install_id, package_app_key, label, status, created_at, updated_at
      FROM app_installs
      ORDER BY created_at ASC, install_id ASC
    `,
  )) {
    installs.push(appInstallFromRow(row));
  }

  return installs;
}

function appInstallFromRow(row: AppInstallRow): AppInstall {
  const packageApp = findBundledAppPackage(row.package_app_key);

  if (!packageApp) {
    throw new Error(`Stored app install "${row.install_id}" has unsupported package.`);
  }

  return {
    installId: row.install_id,
    packageAppKey: packageApp.packageAppKey,
    label: row.label,
    status: "installed",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    adminRoute: `${packageApp.adminRouteBase}/${row.install_id}`,
    schemaRoute: `${packageApp.adminRouteBase}/${row.install_id}/schema`,
    ...(packageApp.publicRouteBase === undefined
      ? {}
      : {
          publicRoute: `${packageApp.publicRouteBase}/${row.install_id}`,
          publicRoutePrefix: `${packageApp.publicRouteBase}/${row.install_id}/`,
        }),
  };
}
