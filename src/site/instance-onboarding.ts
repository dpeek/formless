export const DEFAULT_FORMLESS_INSTANCE_NAME = "formless";
export const FORMLESS_INSTANCE_STATE_FILE = "formless.instance.json";
export const FORMLESS_INSTANCE_STATE_VERSION = 1;
export const FORMLESS_INSTANCE_STATE_KIND = "formless-instance";

export type FormlessInstanceDeploymentAccount = {
  id: string;
  name?: string;
  workersDevSubdomain: string;
};

export type FormlessInstanceDeploymentDefaults = {
  instanceName?: string | null;
};

export type PlanFormlessInstanceDeploymentInput = {
  account: FormlessInstanceDeploymentAccount;
  defaults?: FormlessInstanceDeploymentDefaults;
  instanceName?: string | null;
  packageVersion: string;
};

export type FormlessInstanceDeploymentPlan = {
  account: FormlessInstanceDeploymentAccount;
  deploymentTarget: "workers.dev";
  expectedUrl: {
    host: string;
    kind: "workers.dev";
    url: string;
  };
  instanceName: string;
  packageVersion: string;
  resources: {
    assets: {
      bindingName: "ASSETS";
    };
    authority: {
      bindingName: "FORMLESS_AUTHORITY";
      className: "FormlessAuthority";
      namespaceName: string;
    };
    mediaBucket: {
      bindingName: "FORMLESS_MEDIA";
      name: string;
    };
    worker: {
      name: string;
      workersDevEnabled: true;
    };
  };
  runtimeVars: {
    FORMLESS_DEPLOY_VERSION: string;
    FORMLESS_RUNTIME_PROFILE: "dev";
    VITE_FORMLESS_RUNTIME_PROFILE: "dev";
  };
  secretRequirements: Array<{
    envName: "FORMLESS_ADMIN_TOKEN";
    purpose: "protect-authority-and-media-writes";
    storage: "cloudflare-worker-secret";
  }>;
};

export type FormlessInstanceState = {
  accountId: string;
  accountName?: string;
  authorityNamespaceName: string;
  credentialProfile?: string;
  deployedPackageVersion?: string;
  deploymentTarget: "workers.dev";
  instanceName: string;
  kind: typeof FORMLESS_INSTANCE_STATE_KIND;
  mediaBucketName: string;
  version: typeof FORMLESS_INSTANCE_STATE_VERSION;
  workerName: string;
  workersDevUrl: string;
};

export type CreateFormlessInstanceStateInput = {
  credentialProfile?: string | null;
  plan: FormlessInstanceDeploymentPlan;
};

const maxInstanceNameLength = 53;
const workersDevDomain = "workers.dev";
const stateKeys = new Set([
  "accountId",
  "accountName",
  "authorityNamespaceName",
  "credentialProfile",
  "deployedPackageVersion",
  "deploymentTarget",
  "instanceName",
  "kind",
  "mediaBucketName",
  "version",
  "workerName",
  "workersDevUrl",
]);
const forbiddenSecretKeys = new Set([
  "admintoken",
  "apitoken",
  "bootstraptoken",
  "cloudflareapitoken",
  "cloudflaretoken",
  "cfapitoken",
  "formlessadmintoken",
  "secret",
  "secrets",
  "token",
  "writeprotectionsecret",
]);

export function planFormlessInstanceDeployment(
  input: PlanFormlessInstanceDeploymentInput,
): FormlessInstanceDeploymentPlan {
  const rawInstanceName =
    input.instanceName ?? input.defaults?.instanceName ?? DEFAULT_FORMLESS_INSTANCE_NAME;
  const instanceName = normalizeFormlessInstanceName(rawInstanceName);
  const account = parseDeploymentAccount(input.account);
  const packageVersion = parseRequiredString("Package version", input.packageVersion);
  const workerName = instanceName;
  const mediaBucketName = `${instanceName}-media`;
  const authorityNamespaceName = `${instanceName}-authority`;
  const host = `${workerName}.${account.workersDevSubdomain}.${workersDevDomain}`;

  return {
    account,
    deploymentTarget: "workers.dev",
    expectedUrl: {
      host,
      kind: "workers.dev",
      url: `https://${host}`,
    },
    instanceName,
    packageVersion,
    resources: {
      assets: {
        bindingName: "ASSETS",
      },
      authority: {
        bindingName: "FORMLESS_AUTHORITY",
        className: "FormlessAuthority",
        namespaceName: authorityNamespaceName,
      },
      mediaBucket: {
        bindingName: "FORMLESS_MEDIA",
        name: mediaBucketName,
      },
      worker: {
        name: workerName,
        workersDevEnabled: true,
      },
    },
    runtimeVars: {
      FORMLESS_DEPLOY_VERSION: packageVersion,
      FORMLESS_RUNTIME_PROFILE: "dev",
      VITE_FORMLESS_RUNTIME_PROFILE: "dev",
    },
    secretRequirements: [
      {
        envName: "FORMLESS_ADMIN_TOKEN",
        purpose: "protect-authority-and-media-writes",
        storage: "cloudflare-worker-secret",
      },
    ],
  };
}

export function createFormlessInstanceState(
  input: CreateFormlessInstanceStateInput,
): FormlessInstanceState {
  const credentialProfile = parseOptionalString(
    `${FORMLESS_INSTANCE_STATE_FILE} credentialProfile`,
    input.credentialProfile ?? undefined,
  );
  const state = {
    version: FORMLESS_INSTANCE_STATE_VERSION,
    kind: FORMLESS_INSTANCE_STATE_KIND,
    instanceName: input.plan.instanceName,
    accountId: input.plan.account.id,
    ...(input.plan.account.name === undefined ? {} : { accountName: input.plan.account.name }),
    ...(credentialProfile === undefined ? {} : { credentialProfile }),
    workerName: input.plan.resources.worker.name,
    workersDevUrl: input.plan.expectedUrl.url,
    mediaBucketName: input.plan.resources.mediaBucket.name,
    authorityNamespaceName: input.plan.resources.authority.namespaceName,
    deploymentTarget: input.plan.deploymentTarget,
    deployedPackageVersion: input.plan.packageVersion,
  };

  return parseFormlessInstanceState(state);
}

export function parseFormlessInstanceStateJson(contents: string): FormlessInstanceState {
  try {
    return parseFormlessInstanceState(JSON.parse(contents) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${FORMLESS_INSTANCE_STATE_FILE} must be valid JSON.`);
    }

    throw error;
  }
}

export function parseFormlessInstanceState(value: unknown): FormlessInstanceState {
  if (!isRecord(value)) {
    throw new Error(`${FORMLESS_INSTANCE_STATE_FILE} must be an object.`);
  }

  assertNoForbiddenSecretKeys(value, FORMLESS_INSTANCE_STATE_FILE);
  assertOnlyKeys(value, stateKeys, FORMLESS_INSTANCE_STATE_FILE);

  if (value.version !== FORMLESS_INSTANCE_STATE_VERSION) {
    throw new Error(
      `${FORMLESS_INSTANCE_STATE_FILE} version must be ${FORMLESS_INSTANCE_STATE_VERSION}.`,
    );
  }

  if (value.kind !== FORMLESS_INSTANCE_STATE_KIND) {
    throw new Error(
      `${FORMLESS_INSTANCE_STATE_FILE} kind must be "${FORMLESS_INSTANCE_STATE_KIND}".`,
    );
  }

  const accountName = parseOptionalString(
    `${FORMLESS_INSTANCE_STATE_FILE} accountName`,
    value.accountName,
  );
  const credentialProfile = parseOptionalString(
    `${FORMLESS_INSTANCE_STATE_FILE} credentialProfile`,
    value.credentialProfile,
  );
  const deployedPackageVersion = parseOptionalString(
    `${FORMLESS_INSTANCE_STATE_FILE} deployedPackageVersion`,
    value.deployedPackageVersion,
  );

  return {
    version: FORMLESS_INSTANCE_STATE_VERSION,
    kind: FORMLESS_INSTANCE_STATE_KIND,
    instanceName: parseCanonicalSlug(
      `${FORMLESS_INSTANCE_STATE_FILE} instanceName`,
      value.instanceName,
      maxInstanceNameLength,
    ),
    accountId: parseRequiredString(`${FORMLESS_INSTANCE_STATE_FILE} accountId`, value.accountId),
    ...(accountName === undefined ? {} : { accountName }),
    ...(credentialProfile === undefined ? {} : { credentialProfile }),
    workerName: parseCanonicalSlug(
      `${FORMLESS_INSTANCE_STATE_FILE} workerName`,
      value.workerName,
      maxInstanceNameLength,
    ),
    workersDevUrl: parseWorkersDevUrl(
      `${FORMLESS_INSTANCE_STATE_FILE} workersDevUrl`,
      value.workersDevUrl,
    ),
    mediaBucketName: parseCanonicalSlug(
      `${FORMLESS_INSTANCE_STATE_FILE} mediaBucketName`,
      value.mediaBucketName,
      maxInstanceNameLength + "-media".length,
    ),
    authorityNamespaceName: parseCanonicalSlug(
      `${FORMLESS_INSTANCE_STATE_FILE} authorityNamespaceName`,
      value.authorityNamespaceName,
      maxInstanceNameLength + "-authority".length,
    ),
    deploymentTarget: parseDeploymentTarget(value.deploymentTarget),
    ...(deployedPackageVersion === undefined ? {} : { deployedPackageVersion }),
  };
}

export function formatFormlessInstanceState(state: FormlessInstanceState): string {
  const parsed = parseFormlessInstanceState(state);
  const formatted: Record<string, unknown> = {
    version: parsed.version,
    kind: parsed.kind,
    instanceName: parsed.instanceName,
    accountId: parsed.accountId,
    ...(parsed.accountName === undefined ? {} : { accountName: parsed.accountName }),
    ...(parsed.credentialProfile === undefined
      ? {}
      : { credentialProfile: parsed.credentialProfile }),
    workerName: parsed.workerName,
    workersDevUrl: parsed.workersDevUrl,
    mediaBucketName: parsed.mediaBucketName,
    authorityNamespaceName: parsed.authorityNamespaceName,
    deploymentTarget: parsed.deploymentTarget,
    ...(parsed.deployedPackageVersion === undefined
      ? {}
      : { deployedPackageVersion: parsed.deployedPackageVersion }),
  };

  return `${JSON.stringify(formatted, null, 2)}\n`;
}

export function normalizeFormlessInstanceName(value: string | null | undefined): string {
  const raw = parseRequiredString("Formless instance name", value);
  const normalized = normalizeResourceSlug(raw);

  if (!normalized) {
    throw new Error("Formless instance name must include at least one letter or number.");
  }

  if (normalized.length > maxInstanceNameLength) {
    throw new Error(
      `Formless instance name must produce a resource slug no longer than ${maxInstanceNameLength} characters.`,
    );
  }

  return normalized;
}

function parseDeploymentAccount(
  account: FormlessInstanceDeploymentAccount,
): FormlessInstanceDeploymentAccount {
  const name = parseOptionalString("Cloudflare account name", account.name);

  return {
    id: parseRequiredString("Cloudflare account id", account.id),
    ...(name === undefined ? {} : { name }),
    workersDevSubdomain: normalizeWorkersDevSubdomain(account.workersDevSubdomain),
  };
}

function normalizeWorkersDevSubdomain(value: unknown): string {
  const raw = parseRequiredString("Cloudflare workers.dev subdomain", value).toLowerCase();
  const subdomain = raw.endsWith(`.${workersDevDomain}`)
    ? raw.slice(0, -`.${workersDevDomain}`.length)
    : raw;

  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) {
    throw new Error("Cloudflare workers.dev subdomain must be one DNS label under workers.dev.");
  }

  return subdomain;
}

function parseCanonicalSlug(context: string, value: unknown, maxLength: number): string {
  const raw = parseRequiredString(context, value);
  const normalized = normalizeResourceSlug(raw);

  if (raw !== normalized) {
    throw new Error(`${context} must be a normalized resource slug.`);
  }

  if (raw.length > maxLength) {
    throw new Error(`${context} must be no longer than ${maxLength} characters.`);
  }

  return raw;
}

function parseWorkersDevUrl(context: string, value: unknown): string {
  const raw = parseRequiredString(context, value);

  try {
    const url = new URL(raw);

    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(`.${workersDevDomain}`) ||
      url.pathname !== "/"
    ) {
      throw new Error();
    }

    return url.origin;
  } catch {
    throw new Error(`${context} must be a workers.dev origin URL.`);
  }
}

function parseDeploymentTarget(value: unknown): "workers.dev" {
  if (value !== "workers.dev") {
    throw new Error(`${FORMLESS_INSTANCE_STATE_FILE} deploymentTarget must be "workers.dev".`);
  }

  return "workers.dev";
}

function parseRequiredString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function normalizeResourceSlug(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("'", "")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .replaceAll(/-+/g, "-");
}

function parseOptionalString(context: string, value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseRequiredString(context, value);
}

function assertOnlyKeys(value: Record<string, unknown>, allowedKeys: Set<string>, context: string) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }
}

function assertNoForbiddenSecretKeys(value: unknown, context: string) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoForbiddenSecretKeys(child, `${context}[${index}]`));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (forbiddenSecretKeys.has(normalizeSecretKey(key))) {
      throw new Error(
        `${FORMLESS_INSTANCE_STATE_FILE} must not store secret field "${context}.${key}".`,
      );
    }

    assertNoForbiddenSecretKeys(child, `${context}.${key}`);
  }
}

function normalizeSecretKey(key: string): string {
  return key.toLowerCase().replaceAll(/[-_]/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
