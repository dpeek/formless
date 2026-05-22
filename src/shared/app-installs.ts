import { schemaAppDefinitions, type SchemaKey } from "./schema-apps.ts";

export type PackageAppKey = SchemaKey;
export type AppInstallId = string;
export type AppInstallStatus = "installed";

export type AppInstall = {
  installId: AppInstallId;
  packageAppKey: PackageAppKey;
  label: string;
  status: AppInstallStatus;
  createdAt: string;
  updatedAt: string;
  adminRoute: `/apps/${string}`;
  schemaRoute: `/apps/${string}/schema`;
  publicRoute?: `/sites/${string}`;
  publicRoutePrefix?: `/sites/${string}/`;
};

export type BundledAppPackage = {
  packageAppKey: PackageAppKey;
  label: string;
  description: string;
  defaultInstallId: AppInstallId;
  supportsMultipleInstalls: boolean;
  sourceSchemaKey: SchemaKey;
  seedRecordsKey: SchemaKey;
  adminRouteBase: "/apps";
  publicRouteBase?: "/sites";
};

export type AppInstallInitializationPlan = {
  installId: AppInstallId;
  packageAppKey: PackageAppKey;
  sourceSchemaKey: SchemaKey;
  seedRecordsKey: SchemaKey;
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
  validateInitialSource?: (
    context: AppInstallSourceValidationContext,
  ) => AppInstallRegistryError | undefined;
};

export type AppInstallSourceValidationContext = {
  install: AppInstall;
  initialization: AppInstallInitializationPlan;
  packageApp: BundledAppPackage;
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
  "site",
  "sites",
  "sitemap",
  "static",
]);

export const bundledAppPackages = [
  {
    packageAppKey: "site",
    label: schemaAppDefinitions.site.label,
    description: "Public website app backed by the bundled Site schema and starter records.",
    defaultInstallId: "personal",
    supportsMultipleInstalls: true,
    sourceSchemaKey: "site",
    seedRecordsKey: "site",
    adminRouteBase: "/apps",
    publicRouteBase: "/sites",
  },
] as const satisfies readonly BundledAppPackage[];

export function listBundledAppPackages(): BundledAppPackage[] {
  return [...bundledAppPackages];
}

export function findBundledAppPackage(packageAppKey: string): BundledAppPackage | undefined {
  return bundledAppPackages.find((appPackage) => appPackage.packageAppKey === packageAppKey);
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
  const packageApp = findBundledAppPackage(input.packageAppKey);

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
  packageApp: BundledAppPackage;
}): AppInstall {
  return {
    installId: input.installId,
    packageAppKey: input.packageApp.packageAppKey,
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
  packageApp: BundledAppPackage,
  install: AppInstall,
): AppInstallInitializationPlan {
  return {
    installId: install.installId,
    packageAppKey: packageApp.packageAppKey,
    sourceSchemaKey: packageApp.sourceSchemaKey,
    seedRecordsKey: packageApp.seedRecordsKey,
  };
}
