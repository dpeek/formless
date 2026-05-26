import {
  findAppInstall,
  validateAppInstallId,
  type AppInstall,
  type AppInstallId,
} from "./app-installs.ts";

export type InstanceDomainMappingSurface = "site";

export type InstanceDomainMapping = {
  host: string;
  surface: InstanceDomainMappingSurface;
  installId: AppInstallId;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateInstanceDomainMappingRequest = {
  host: string;
  surface: string;
  installId: string;
  enabled?: boolean;
};

export type InstanceDomainMappingsResponse = {
  mappings: InstanceDomainMapping[];
};

export type InstanceDomainMappingLookupResponse = {
  mapping: InstanceDomainMapping | null;
};

export type InstanceDomainMappingRegistryErrorCode =
  | "duplicate-domain-mapping"
  | "install-not-found"
  | "invalid-enabled"
  | "invalid-host"
  | "invalid-install-id"
  | "invalid-surface"
  | "unsupported-install-package";

export type InstanceDomainMappingRegistryError = {
  code: InstanceDomainMappingRegistryErrorCode;
  field?: "enabled" | "host" | "installId" | "surface";
  message: string;
};

export type CreateInstanceDomainMappingInput = {
  existingMappings: readonly InstanceDomainMapping[];
  installs: readonly AppInstall[];
  host: string;
  surface: string;
  installId: string;
  enabled?: boolean;
  now: string;
};

export type CreateInstanceDomainMappingResult =
  | {
      ok: true;
      mapping: InstanceDomainMapping;
      mappings: InstanceDomainMapping[];
    }
  | {
      ok: false;
      error: InstanceDomainMappingRegistryError;
      mappings: readonly InstanceDomainMapping[];
    };

export type InstanceDomainHostValidationResult =
  | {
      ok: true;
      host: string;
    }
  | {
      ok: false;
      error: InstanceDomainMappingRegistryError;
    };

const hostnameLabelPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function parseCreateInstanceDomainMappingRequest(
  value: unknown,
): CreateInstanceDomainMappingRequest {
  if (!isRecord(value)) {
    throw new Error("Domain mapping request must be an object.");
  }

  assertCreateInstanceDomainMappingRequestKeys(value);

  return {
    host: parseTrimmedNonEmptyString("Domain mapping host", value.host),
    surface: parseTrimmedNonEmptyString("Domain mapping surface", value.surface),
    installId: parseTrimmedNonEmptyString("Domain mapping install id", value.installId),
    ...(value.enabled === undefined
      ? {}
      : { enabled: parseBoolean("Domain mapping enabled", value.enabled) }),
  };
}

export function buildInstanceDomainMapping(
  input: CreateInstanceDomainMappingInput,
): CreateInstanceDomainMappingResult {
  const hostResult = normalizeInstanceDomainHost(input.host);

  if (!hostResult.ok) {
    return {
      ok: false,
      error: hostResult.error,
      mappings: input.existingMappings,
    };
  }

  const surfaceResult = parseInstanceDomainMappingSurface(input.surface);

  if (!surfaceResult.ok) {
    return {
      ok: false,
      error: surfaceResult.error,
      mappings: input.existingMappings,
    };
  }

  const installIdResult = validateAppInstallId(input.installId);

  if (!installIdResult.ok) {
    return {
      ok: false,
      error: {
        code: "invalid-install-id",
        field: "installId",
        message: installIdResult.error.message,
      },
      mappings: input.existingMappings,
    };
  }

  if (
    input.existingMappings.some(
      (mapping) => mapping.host === hostResult.host && mapping.surface === surfaceResult.surface,
    )
  ) {
    return {
      ok: false,
      error: domainMappingError(
        "duplicate-domain-mapping",
        "host",
        `Domain mapping for host "${hostResult.host}" and surface "${surfaceResult.surface}" already exists.`,
      ),
      mappings: input.existingMappings,
    };
  }

  const install = findAppInstall(input.installs, installIdResult.installId);

  if (!install) {
    return {
      ok: false,
      error: domainMappingError(
        "install-not-found",
        "installId",
        `Install id "${installIdResult.installId}" is not installed.`,
      ),
      mappings: input.existingMappings,
    };
  }

  if (install.packageAppKey !== "site") {
    return {
      ok: false,
      error: domainMappingError(
        "unsupported-install-package",
        "installId",
        `Install id "${install.installId}" uses package "${install.packageAppKey}", not "site".`,
      ),
      mappings: input.existingMappings,
    };
  }

  const mapping: InstanceDomainMapping = {
    host: hostResult.host,
    surface: surfaceResult.surface,
    installId: install.installId,
    enabled: input.enabled ?? true,
    createdAt: input.now,
    updatedAt: input.now,
  };

  return {
    ok: true,
    mapping,
    mappings: listInstanceDomainMappings([...input.existingMappings, mapping]),
  };
}

export function listInstanceDomainMappings(
  mappings: readonly InstanceDomainMapping[],
): InstanceDomainMapping[] {
  return [...mappings].sort((left, right) => {
    const hostOrder = left.host.localeCompare(right.host);
    const surfaceOrder = left.surface.localeCompare(right.surface);

    return hostOrder === 0
      ? surfaceOrder === 0
        ? left.installId.localeCompare(right.installId)
        : surfaceOrder
      : hostOrder;
  });
}

export function normalizeInstanceDomainHost(value: string): InstanceDomainHostValidationResult {
  const raw = value.trim().toLowerCase();

  if (raw === "") {
    return {
      ok: false,
      error: domainMappingError("invalid-host", "host", "Domain mapping host is required."),
    };
  }

  if (raw.includes("://")) {
    return invalidHost();
  }

  try {
    const url = new URL(`https://${raw}`);
    const normalized = stripTrailingDots(url.hostname.toLowerCase());

    if (
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== "" ||
      !isValidDnsHostname(normalized)
    ) {
      return invalidHost();
    }

    return { ok: true, host: normalized };
  } catch {
    return invalidHost();
  }
}

function parseInstanceDomainMappingSurface(value: string):
  | {
      ok: true;
      surface: InstanceDomainMappingSurface;
    }
  | {
      ok: false;
      error: InstanceDomainMappingRegistryError;
    } {
  if (value === "site") {
    return { ok: true, surface: value };
  }

  return {
    ok: false,
    error: domainMappingError(
      "invalid-surface",
      "surface",
      'Domain mapping surface must be "site".',
    ),
  };
}

function stripTrailingDots(value: string): string {
  return value.replaceAll(/\.+$/g, "");
}

function isValidDnsHostname(value: string): boolean {
  if (value === "" || value.length > 253 || value.includes("_")) {
    return false;
  }

  return value
    .split(".")
    .every((label) => label.length > 0 && label.length <= 63 && hostnameLabelPattern.test(label));
}

function invalidHost(): InstanceDomainHostValidationResult {
  return {
    ok: false,
    error: domainMappingError("invalid-host", "host", "Domain mapping host must be a hostname."),
  };
}

function parseTrimmedNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function parseBoolean(context: string, value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${context} must be a boolean.`);
  }

  return value;
}

function assertCreateInstanceDomainMappingRequestKeys(value: Record<string, unknown>) {
  const requiredKeys = ["host", "surface", "installId"];
  const allowedKeys = new Set([...requiredKeys, "enabled"]);

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Domain mapping request has unsupported key "${key}".`);
    }
  }

  for (const key of requiredKeys) {
    if (!(key in value)) {
      throw new Error(`Domain mapping request must include "${key}".`);
    }
  }
}

function domainMappingError(
  code: InstanceDomainMappingRegistryErrorCode,
  field: InstanceDomainMappingRegistryError["field"],
  message: string,
): InstanceDomainMappingRegistryError {
  return {
    code,
    ...(field === undefined ? {} : { field }),
    message,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
