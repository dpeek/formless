import packageJson from "../../package.json";
import type { PackageAppKey } from "../shared/app-installs.ts";
import type {
  InstanceUpgradeApplyResponse,
  InstanceUpgradeStatusResponse,
  UpgradePackageAppMigrationAppliedState,
  UpgradeStorageIdentity,
  UpgradeStorageIdentityStatus,
} from "../shared/upgrade-status.ts";
import {
  applyFormlessInstalledAppAutoSafePackageMigrations,
  applyFormlessInstanceAutoSafeSqlMigrations,
  readFormlessInstanceTargetStatus,
  readFormlessInstanceUpgradeStatus,
  type FormlessInstancePackageMigrationApplyResponse,
  type FormlessInstanceTargetClientDependencies,
} from "./instance-target-client.ts";
import {
  assertCliUpgradePlanningReady,
  buildCliUpgradePlanningReport,
  formatCliUpgradePlanningReport,
  type CliUpgradePlanningReport,
} from "./upgrade-plan.ts";

export type CliAutoSafePackageAppApplyEvidence = {
  installId: string;
  packageAppKey: PackageAppKey;
  response: FormlessInstancePackageMigrationApplyResponse;
  verifiedStatus: InstanceUpgradeStatusResponse;
};

export type CliAutoSafeUpgradeApplyResult = {
  packageApps: CliAutoSafePackageAppApplyEvidence[];
  planning: CliUpgradePlanningReport;
  sql: InstanceUpgradeApplyResponse;
  verifiedSqlStatus: InstanceUpgradeStatusResponse;
};

export type CliAutoSafeUpgradeApplyDependencies = FormlessInstanceTargetClientDependencies & {
  log: (message: string) => void;
};

export async function applyCliAutoSafeUpgradeMigrations(
  input: {
    adminToken?: string | null;
    targetUrl: string;
  },
  dependencies: CliAutoSafeUpgradeApplyDependencies,
): Promise<CliAutoSafeUpgradeApplyResult> {
  const targetStatus = await readFormlessInstanceTargetStatus(
    {
      targetUrl: input.targetUrl,
    },
    dependencies,
  );
  const deploymentTarget = targetStatus.upgradeStatus.deployment?.target;
  const planning = buildCliUpgradePlanningReport({
    localPackageVersion: packageJson.version,
    status: targetStatus.upgradeStatus,
    target: {
      ...(deploymentTarget?.label === undefined ? {} : { label: deploymentTarget.label }),
      ...(deploymentTarget?.targetId === undefined ? {} : { targetId: deploymentTarget.targetId }),
      targetUrl: input.targetUrl,
    },
  });

  if (planning.blockers.length > 0) {
    dependencies.log(formatCliUpgradePlanningReport(planning).trimEnd());
    assertCliUpgradePlanningReady(planning);
  }

  const sql = await applyFormlessInstanceAutoSafeSqlMigrations(
    {
      adminToken: input.adminToken,
      targetUrl: input.targetUrl,
    },
    dependencies,
  );
  const verifiedSqlStatus = await readFormlessInstanceUpgradeStatus(
    {
      adminToken: input.adminToken,
      targetUrl: input.targetUrl,
    },
    dependencies,
  );
  const packageApps: CliAutoSafePackageAppApplyEvidence[] = [];

  verifySqlApplyEvidence(sql, verifiedSqlStatus);

  for (const install of targetStatus.upgradeStatus.installedApps) {
    const response = await applyFormlessInstalledAppAutoSafePackageMigrations(
      {
        adminToken: input.adminToken,
        installId: install.installId,
        packageAppKey: install.packageAppKey,
        targetUrl: input.targetUrl,
      },
      dependencies,
    );
    const verifiedStatus = await readFormlessInstanceUpgradeStatus(
      {
        adminToken: input.adminToken,
        targetUrl: input.targetUrl,
      },
      dependencies,
    );

    verifyPackageAppApplyEvidence({
      installId: install.installId,
      packageAppKey: install.packageAppKey,
      response,
      status: verifiedStatus,
    });
    packageApps.push({
      installId: install.installId,
      packageAppKey: install.packageAppKey,
      response,
      verifiedStatus,
    });
  }

  const result = {
    packageApps,
    planning,
    sql,
    verifiedSqlStatus,
  };

  dependencies.log(formatCliAutoSafeUpgradeApplyEvidence(result).trimEnd());

  return result;
}

export function formatCliAutoSafeUpgradeApplyEvidence(
  result: CliAutoSafeUpgradeApplyResult,
): string {
  const sqlRows = result.sql.storageIdentities.flatMap((storage) =>
    storage.sqlMigrations.map((migration) => ({
      identity: formatUpgradeStorageIdentity(storage.identity),
      migration,
    })),
  );
  const lines = [
    "Upgrade apply evidence.",
    `SQL storage identities: ${result.sql.storageIdentities.length}.`,
    `SQL migrations: ${sqlRows.length}.`,
    ...sqlRows.map(
      ({ identity, migration }) =>
        `SQL migration: ${identity} ${migration.storageFamily}/${migration.migrationId} checksum=${migration.checksum}.`,
    ),
    `Package app applies: ${result.packageApps.length}.`,
    ...result.packageApps.map(
      (app) =>
        `Package app: ${app.packageAppKey}/${app.installId} revision=${app.response.packageRevision} sourceSchemaHash=${app.response.sourceSchemaHash} applied=${app.response.applied.length} skipped=${app.response.skipped.length}.`,
    ),
  ];

  return `${lines.join("\n")}\n`;
}

function verifyPackageAppApplyEvidence(input: {
  installId: string;
  packageAppKey: PackageAppKey;
  response: FormlessInstancePackageMigrationApplyResponse;
  status: InstanceUpgradeStatusResponse;
}) {
  const storage = findAppInstallStorageStatus(input.status, input.installId, input.packageAppKey);

  if (!storage?.packageAppMigrations?.state) {
    throw new Error(
      `Upgrade apply evidence missing package app state for "${input.packageAppKey}/${input.installId}".`,
    );
  }

  const state = storage.packageAppMigrations.state;

  if (
    state.packageRevision !== input.response.packageRevision ||
    state.sourceSchemaHash !== input.response.sourceSchemaHash
  ) {
    throw new Error(
      `Upgrade apply evidence for "${input.packageAppKey}/${input.installId}" did not match applied package facts.`,
    );
  }

  const appliedById = new Map(
    storage.packageAppMigrations.applied.map((migration) => [migration.migrationId, migration]),
  );

  for (const migration of [...input.response.applied, ...input.response.skipped]) {
    verifyAppliedPackageMigrationEvidence(input, appliedById, migration);
  }
}

function verifySqlApplyEvidence(
  response: InstanceUpgradeApplyResponse,
  status: InstanceUpgradeStatusResponse,
) {
  const statusRows = new Set(
    status.storageIdentities.flatMap((storage) =>
      storage.sqlMigrations.map(
        (migration) =>
          `${formatUpgradeStorageIdentity(storage.identity)}:${migration.storageFamily}:${migration.migrationId}:${migration.checksum}`,
      ),
    ),
  );

  for (const storage of response.storageIdentities) {
    const identity = formatUpgradeStorageIdentity(storage.identity);

    for (const migration of storage.sqlMigrations) {
      const key = `${identity}:${migration.storageFamily}:${migration.migrationId}:${migration.checksum}`;

      if (!statusRows.has(key)) {
        throw new Error(
          `Upgrade apply evidence missing SQL migration "${migration.migrationId}" for "${identity}".`,
        );
      }
    }
  }
}

function verifyAppliedPackageMigrationEvidence(
  input: {
    installId: string;
    packageAppKey: PackageAppKey;
  },
  appliedById: ReadonlyMap<string, UpgradePackageAppMigrationAppliedState>,
  migration: UpgradePackageAppMigrationAppliedState,
) {
  const applied = appliedById.get(migration.migrationId);

  if (!applied || applied.checksum !== migration.checksum) {
    throw new Error(
      `Upgrade apply evidence missing package app migration "${migration.migrationId}" for "${input.packageAppKey}/${input.installId}".`,
    );
  }
}

function findAppInstallStorageStatus(
  status: InstanceUpgradeStatusResponse,
  installId: string,
  packageAppKey: PackageAppKey,
): UpgradeStorageIdentityStatus | undefined {
  return status.storageIdentities.find(
    (storage) =>
      storage.identity.kind === "appInstall" &&
      storage.identity.installId === installId &&
      storage.identity.packageAppKey === packageAppKey,
  );
}

function formatUpgradeStorageIdentity(identity: UpgradeStorageIdentity): string {
  if (identity.kind === "instance") {
    return identity.authorityName;
  }

  if (identity.kind === "appInstall") {
    return `${identity.packageAppKey}/${identity.installId}`;
  }

  return identity.sourceSchemaKey;
}
