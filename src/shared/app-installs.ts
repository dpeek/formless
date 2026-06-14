import {
  type AppPackageKey,
  type AppPackageResolver,
  findResolvedAppPackage,
  listResolvedAppPackages,
  type ResolvedAppPackage,
} from "./app-packages.ts";
import type { RuntimeRouteAccess } from "./runtime-topology.ts";
import type { PackageAppRevision, SourceSchemaHash } from "./upgrade-migrations.ts";

export type PackageAppKey = AppPackageKey;
export type AppInstallId = string;
export type AppInstallStatus = "installed";
export type AppInstallRouteKind = "admin" | "publicSite" | "schema";

export type AppInstallRoute = {
  access?: RuntimeRouteAccess;
  enabled: boolean;
  id: string;
  path: `/${string}`;
  prefix?: `/${string}/`;
  routeKind: AppInstallRouteKind;
};

export type AppInstall = {
  installId: AppInstallId;
  packageAppKey: PackageAppKey;
  packageRevision: PackageAppRevision;
  sourceSchemaHash: SourceSchemaHash;
  label: string;
  status: AppInstallStatus;
  createdAt: string;
  updatedAt: string;
  adminRoute: `/${string}`;
  schemaRoute: `/${string}`;
  publicRoute?: `/${string}`;
  publicRoutePrefix?: `/${string}/`;
  routes?: AppInstallRoute[];
};

export type InstallableAppPackage = ResolvedAppPackage;

export type AppInstallInitializationPlan = {
  installId: AppInstallId;
  packageAppKey: PackageAppKey;
  sourceSchemaKey: string;
  seedRecordsKey: string;
};

export type AppInstallRegistryErrorCode =
  | "duplicate-install-id"
  | "invalid-install-id"
  | "invalid-label"
  | "source-validation-failed"
  | "unsupported-package";

export type AppInstallRegistryError = {
  code: AppInstallRegistryErrorCode;
  field?: "installId" | "label" | "packageAppKey" | "source";
  message: string;
};

export type AppInstallIdValidationResult =
  | {
      ok: true;
      installId: AppInstallId;
    }
  | {
      ok: false;
      error: AppInstallRegistryError;
    };

export type CreateAppInstallInput = {
  existingInstalls: readonly AppInstall[];
  installId: string;
  label: string;
  now: string;
  packageAppKey: string;
  packageResolver?: AppPackageResolver;
  validateInitialSource?: (
    context: AppInstallSourceValidationContext,
  ) => AppInstallRegistryError | undefined;
};

export type AppInstallSourceValidationContext = {
  install: AppInstall;
  initialization: AppInstallInitializationPlan;
  packageApp: ResolvedAppPackage;
};

export type CreateAppInstallResult =
  | {
      ok: true;
      initialization: AppInstallInitializationPlan;
      install: AppInstall;
      installs: AppInstall[];
    }
  | {
      ok: false;
      error: AppInstallRegistryError;
      installs: readonly AppInstall[];
    };

const installIdMinLength = 2;
const installIdMaxLength = 48;
const installIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const reservedInstallIds = new Set([
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

export function listInstallableAppPackages(resolver?: AppPackageResolver): InstallableAppPackage[] {
  return listResolvedAppPackages(resolver);
}

export function packageAppFactsForKey(
  packageAppKey: string,
  resolver?: AppPackageResolver,
):
  | {
      packageRevision: PackageAppRevision;
      sourceSchemaHash: SourceSchemaHash;
    }
  | undefined {
  const packageApp = findResolvedAppPackage(packageAppKey, resolver);

  return packageApp
    ? {
        packageRevision: packageApp.packageRevision,
        sourceSchemaHash: packageApp.sourceSchemaHash,
      }
    : undefined;
}

export function listAppInstalls(installs: readonly AppInstall[]): AppInstall[] {
  return [...installs].sort((left, right) => {
    const createdAtOrder = left.createdAt.localeCompare(right.createdAt);

    return createdAtOrder === 0 ? left.installId.localeCompare(right.installId) : createdAtOrder;
  });
}

export function findAppInstall(
  installs: readonly AppInstall[],
  installId: string,
): AppInstall | undefined {
  return installs.find((install) => install.installId === installId);
}

export function validateAppInstallId(value: string): AppInstallIdValidationResult {
  const installId = value.trim();

  if (installId === "") {
    return {
      ok: false,
      error: appInstallRegistryError("invalid-install-id", "installId", "Install id is required."),
    };
  }

  if (installId.length < installIdMinLength) {
    return {
      ok: false,
      error: appInstallRegistryError(
        "invalid-install-id",
        "installId",
        `Install id must be at least ${installIdMinLength} characters.`,
      ),
    };
  }

  if (installId.length > installIdMaxLength) {
    return {
      ok: false,
      error: appInstallRegistryError(
        "invalid-install-id",
        "installId",
        `Install id must be ${installIdMaxLength} characters or fewer.`,
      ),
    };
  }

  if (reservedInstallIds.has(installId)) {
    return {
      ok: false,
      error: appInstallRegistryError(
        "invalid-install-id",
        "installId",
        `Install id "${installId}" is reserved.`,
      ),
    };
  }

  if (!installIdPattern.test(installId)) {
    return {
      ok: false,
      error: appInstallRegistryError(
        "invalid-install-id",
        "installId",
        "Install id must start with a lowercase letter and use lowercase letters, numbers, and single hyphens.",
      ),
    };
  }

  return {
    ok: true,
    installId,
  };
}

export function createAppInstall(input: CreateAppInstallInput): CreateAppInstallResult {
  const packageApp = findResolvedAppPackage(input.packageAppKey, input.packageResolver);

  if (!packageApp) {
    return {
      ok: false,
      error: appInstallRegistryError(
        "unsupported-package",
        "packageAppKey",
        `Package app "${input.packageAppKey}" is not installable.`,
      ),
      installs: input.existingInstalls,
    };
  }

  const installIdResult = validateAppInstallId(input.installId);

  if (!installIdResult.ok) {
    return {
      ok: false,
      error: installIdResult.error,
      installs: input.existingInstalls,
    };
  }

  if (findAppInstall(input.existingInstalls, installIdResult.installId)) {
    return {
      ok: false,
      error: appInstallRegistryError(
        "duplicate-install-id",
        "installId",
        `Install id "${installIdResult.installId}" is already installed.`,
      ),
      installs: input.existingInstalls,
    };
  }

  const label = input.label.trim();

  if (label === "") {
    return {
      ok: false,
      error: appInstallRegistryError("invalid-label", "label", "Install label is required."),
      installs: input.existingInstalls,
    };
  }

  const install = appInstallFromPackage({
    installId: installIdResult.installId,
    label,
    now: input.now,
    packageApp,
  });
  const initialization = initializationPlanForInstall(packageApp, install);

  try {
    const sourceValidationError = input.validateInitialSource?.({
      install,
      initialization,
      packageApp,
    });

    if (sourceValidationError) {
      return {
        ok: false,
        error: sourceValidationError,
        installs: input.existingInstalls,
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: appInstallRegistryError(
        "source-validation-failed",
        "source",
        error instanceof Error && error.message.trim() !== ""
          ? error.message
          : "Initial source validation failed.",
      ),
      installs: input.existingInstalls,
    };
  }

  return {
    ok: true,
    initialization,
    install,
    installs: [...input.existingInstalls, install],
  };
}

export function appInstallInitializationPlan(
  install: AppInstall,
  resolver?: AppPackageResolver,
): AppInstallInitializationPlan {
  const packageApp = findResolvedAppPackage(install.packageAppKey, resolver);

  if (!packageApp) {
    throw new Error(`Package app "${install.packageAppKey}" is not installable.`);
  }

  return initializationPlanForInstall(packageApp, install);
}

export function appInstallRegistryError(
  code: AppInstallRegistryErrorCode,
  field: AppInstallRegistryError["field"],
  message: string,
): AppInstallRegistryError {
  return {
    code,
    ...(field === undefined ? {} : { field }),
    message,
  };
}

function appInstallFromPackage(input: {
  installId: AppInstallId;
  label: string;
  now: string;
  packageApp: ResolvedAppPackage;
}): AppInstall {
  return {
    installId: input.installId,
    packageAppKey: input.packageApp.packageAppKey,
    packageRevision: input.packageApp.packageRevision,
    sourceSchemaHash: input.packageApp.sourceSchemaHash,
    label: input.label,
    status: "installed",
    createdAt: input.now,
    updatedAt: input.now,
    adminRoute: `${input.packageApp.adminRouteBase}/${input.installId}`,
    schemaRoute: `${input.packageApp.adminRouteBase}/${input.installId}/schema`,
    ...(input.packageApp.publicRouteBase === undefined
      ? {}
      : {
          publicRoute: `${input.packageApp.publicRouteBase}/${input.installId}`,
          publicRoutePrefix: `${input.packageApp.publicRouteBase}/${input.installId}/`,
        }),
  };
}

function initializationPlanForInstall(
  packageApp: ResolvedAppPackage,
  install: AppInstall,
): AppInstallInitializationPlan {
  return {
    installId: install.installId,
    packageAppKey: packageApp.packageAppKey,
    sourceSchemaKey: packageApp.sourceSchemaKey,
    seedRecordsKey: packageApp.seedRecordsKey,
  };
}
