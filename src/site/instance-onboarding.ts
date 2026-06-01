import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  FORMLESS_DEPLOY_METADATA_PATH,
  type FormlessDeployMetadata,
} from "../shared/deploy-metadata.ts";
import { parseOwnerSetupToken } from "../shared/protocol.ts";
import { appendDotEnvValue, parseDotEnv } from "./dotenv.ts";

export const ALCHEMY_PASSWORD_ENV_NAME = "ALCHEMY_PASSWORD";
export const DEFAULT_FORMLESS_INSTANCE_NAME = "formless";
export const FORMLESS_ALCHEMY_APP_NAME = "formless-instance";
export const FORMLESS_HOME_DIRECTORY = ".formless";
export const FORMLESS_INSTANCE_DIRECTORY = "instances";
export const FORMLESS_INSTANCE_LOCAL_ENV_FILE = "deploy.env";
export const FORMLESS_INSTANCE_STATE_FILE = "formless.instance.json";
export const FORMLESS_INSTANCE_STATE_VERSION = 1;
export const FORMLESS_INSTANCE_STATE_KIND = "formless-instance";
export const FORMLESS_WORKER_COMPATIBILITY_DATE = "2026-04-28";
export const FORMLESS_OWNER_SETUP_ROUTE_PATH = "/setup";

const FORMLESS_OWNER_SETUP_CAPABILITY_API_PATH = "/api/formless/setup/capability";

export type FormlessInstanceDeploymentAccount = {
  id: string;
  name?: string;
  workersDevSubdomain: string;
};

export type FormlessInstanceDeploymentDefaults = {
  instanceName?: string | null;
};

export type ListFormlessInstanceAccountsInput = {
  credentialProfile: string | null;
};

export type SelectFormlessInstanceAccountInput = {
  accounts: FormlessInstanceDeploymentAccount[];
  credentialProfile: string | null;
};

export type FormlessInstanceAccountDiscoveryAdapter = {
  listAccounts: (
    input: ListFormlessInstanceAccountsInput,
  ) => Promise<FormlessInstanceDeploymentAccount[]>;
};

type AlchemyCloudflareApiClient = {
  accountId?: string;
  get: (path: string, init?: RequestInit) => Promise<Response>;
};

export type AlchemyFormlessInstanceAccountDiscoveryDependencies = {
  createCloudflareApi: (options: { profile?: string }) => Promise<AlchemyCloudflareApiClient>;
};

export type PlanFormlessInstanceDeploymentInput = {
  account: FormlessInstanceDeploymentAccount;
  defaults?: FormlessInstanceDeploymentDefaults;
  instanceName?: string | null;
  mediaBucketName?: string | null;
  migrationPolicy?: FormlessInstanceDeploymentMigrationPolicy;
  packageVersion: string;
};

export type FormlessInstanceDeploymentMigrationPolicy = "existing" | "new";

export type FormlessInstanceDeploymentPlan = {
  account: FormlessInstanceDeploymentAccount;
  deploymentTarget: "workers.dev";
  expectedUrl: {
    host: string;
    kind: "workers.dev";
    url: string;
  };
  instanceName: string;
  migrationPolicy: FormlessInstanceDeploymentMigrationPolicy;
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
    FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID: string;
    FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID: string;
    FORMLESS_DOMAIN_PROVIDER_WORKER_NAME: string;
    FORMLESS_RUNTIME_PROFILE: "instance";
    VITE_FORMLESS_RUNTIME_PROFILE: "instance";
  };
  secretRequirements: Array<{
    envName: "ALCHEMY_PASSWORD" | "CLOUDFLARE_API_TOKEN" | "FORMLESS_ADMIN_TOKEN";
    purpose:
      | "apply-cloudflare-domain-provider-resources"
      | "encrypt-domain-provider-alchemy-state"
      | "protect-authority-and-media-writes";
    storage: "cloudflare-worker-secret";
  }>;
};

export type FormlessInstanceDeploymentSecrets = {
  ALCHEMY_PASSWORD: string;
  CLOUDFLARE_API_TOKEN?: string;
  FORMLESS_ADMIN_TOKEN: string;
};

export type DeployFormlessInstanceInput = {
  credentialProfile: string | null;
  packageRoot: string;
  plan: FormlessInstanceDeploymentPlan;
  secrets: FormlessInstanceDeploymentSecrets;
  stateRoot: string;
};

export type DeployFormlessInstanceResult = {
  url: string;
};

export type FormlessInstanceDeploymentAdapter = {
  deploy: (input: DeployFormlessInstanceInput) => Promise<DeployFormlessInstanceResult>;
};

export type CheckFormlessInstanceDeployMetadataInput = {
  expectedVersion: string;
  url: string;
};

export type CheckFormlessInstanceDeployMetadataResult = {
  cacheControl: string;
  metadataUrl: string;
  url: string;
  version: string;
};

export type CheckFormlessInstanceDeployMetadataDependencies = {
  fetch: typeof fetch;
};

export type FormlessInstanceDeploymentHealthCheckAdapter = {
  check: (
    input: CheckFormlessInstanceDeployMetadataInput,
  ) => Promise<CheckFormlessInstanceDeployMetadataResult>;
};

export type CreateFormlessInstanceOwnerSetupCapabilityInput = {
  adminToken: string;
  deploymentUrl: string;
  setupToken: string;
};

export type CreateFormlessInstanceOwnerSetupCapabilityResult = {
  capabilityCreated: true;
  endpointUrl: string;
  expiresAt?: string;
  setupComplete: false;
};

export type CreateFormlessInstanceOwnerSetupCapabilityDependencies = {
  fetch: typeof fetch;
};

export type FormlessInstanceOwnerSetupCapabilityAdapter = {
  create: (
    input: CreateFormlessInstanceOwnerSetupCapabilityInput,
  ) => Promise<CreateFormlessInstanceOwnerSetupCapabilityResult>;
};

export type WriteFormlessInstanceStateInput = {
  root: string;
  state: FormlessInstanceState;
};

export type WriteFormlessInstanceStateResult = {
  path: string;
  state: FormlessInstanceState;
};

export type FormlessInstanceStateWriter = {
  write: (input: WriteFormlessInstanceStateInput) => Promise<WriteFormlessInstanceStateResult>;
};

export type WriteFormlessInstanceStateDependencies = {
  prepareStateDirectory: (root: string) => Promise<void>;
  statePath: (root: string, fileName: typeof FORMLESS_INSTANCE_STATE_FILE) => string;
  writeFile: (filePath: string, contents: string) => Promise<void>;
};

export type AlchemyFormlessInstanceDeploymentAppOptions = {
  phase: "up";
  password: string;
  profile?: string;
  rootDir: string;
  stage: string;
};

export type AlchemyFormlessInstanceDeploymentWorkerProps = {
  adopt: boolean;
  accountId: string;
  assets: {
    directory: "dist/client";
    not_found_handling: "single-page-application";
    run_worker_first: string[];
  };
  bindings: Record<string, unknown>;
  build: {
    command: "bun run build";
    env: FormlessInstanceDeploymentPlan["runtimeVars"];
  };
  compatibilityDate: typeof FORMLESS_WORKER_COMPATIBILITY_DATE;
  cwd: string;
  entrypoint: "src/worker/index.ts";
  name: string;
  previewSubdomains: false;
  profile?: string;
  url: true;
};

export type AlchemyFormlessInstanceDeploymentDependencies = {
  createApp: (
    name: typeof FORMLESS_ALCHEMY_APP_NAME,
    options: AlchemyFormlessInstanceDeploymentAppOptions,
  ) => Promise<{
    finalize: () => Promise<void>;
  }>;
  createDurableObjectNamespace: (
    id: "authority",
    props: {
      className: "FormlessAuthority";
      sqlite: true;
    },
  ) => unknown;
  createR2Bucket: (
    id: "media",
    props: {
      adopt: boolean;
      accountId: string;
      name: string;
      profile?: string;
    },
  ) => Promise<unknown>;
  createSecret: (value: string) => unknown;
  deployViteWorker: (
    id: "worker",
    props: AlchemyFormlessInstanceDeploymentWorkerProps,
  ) => Promise<{
    url?: string | null;
  }>;
};

export type RunFormlessInstanceOnboardingInput = {
  credentialProfile?: string | null;
  instanceName?: string | null;
  open?: boolean;
};

export type RunFormlessInstanceOnboardingDependencies = {
  accountDiscovery: FormlessInstanceAccountDiscoveryAdapter;
  deploymentAdapter: FormlessInstanceDeploymentAdapter;
  healthCheck: FormlessInstanceDeploymentHealthCheckAdapter;
  localSecretEnv: FormlessInstanceLocalSecretEnvStore;
  openBrowser: (url: string) => Promise<void>;
  packageRoot: string;
  packageVersion: string;
  randomToken: () => string;
  selectAccount?: (
    input: SelectFormlessInstanceAccountInput,
  ) => Promise<FormlessInstanceDeploymentAccount> | FormlessInstanceDeploymentAccount;
  stateRoot: string;
  stateWriter: FormlessInstanceStateWriter;
  setupCapability: FormlessInstanceOwnerSetupCapabilityAdapter;
};

export type RunFormlessInstanceOnboardingResult = {
  account: FormlessInstanceDeploymentAccount;
  browserOpened: boolean;
  credentialProfile: string | null;
  deployment: DeployFormlessInstanceResult;
  healthCheck: CheckFormlessInstanceDeployMetadataResult;
  instanceName: string;
  localSecretEnv: EnsureFormlessInstanceLocalSecretEnvResult;
  mode: "deployed";
  open: boolean;
  ownerSetup: {
    capability: CreateFormlessInstanceOwnerSetupCapabilityResult;
    url: string;
  };
  plan: FormlessInstanceDeploymentPlan;
  state: FormlessInstanceState;
  stateWrite: WriteFormlessInstanceStateResult;
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

export type FormlessInstanceLocalSecretEnv = {
  ALCHEMY_PASSWORD: string;
};

export type EnsureFormlessInstanceLocalSecretEnvInput = {
  createSecret: () => string;
  root: string;
};

export type EnsureFormlessInstanceLocalSecretEnvResult = {
  created: boolean;
  path: string;
  secrets: FormlessInstanceLocalSecretEnv;
};

export type FormlessInstanceLocalSecretEnvStore = {
  ensure: (
    input: EnsureFormlessInstanceLocalSecretEnvInput,
  ) => Promise<EnsureFormlessInstanceLocalSecretEnvResult>;
};

export type EnsureFormlessInstanceLocalSecretEnvDependencies = {
  prepareStateDirectory: (root: string) => Promise<void>;
  readFile: (filePath: string, encoding: BufferEncoding) => Promise<string>;
  statePath: (root: string, fileName: typeof FORMLESS_INSTANCE_LOCAL_ENV_FILE) => string;
  writeFile: (filePath: string, contents: string) => Promise<void>;
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
  const migrationPolicy = parseDeploymentMigrationPolicy(input.migrationPolicy ?? "new");
  const workerName = instanceName;
  const mediaBucketName =
    parseOptionalString(
      "Formless instance media bucket name",
      input.mediaBucketName ?? undefined,
    ) ?? `${instanceName}-media`;
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
    migrationPolicy,
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
      FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID: account.id,
      FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID: instanceName,
      FORMLESS_DOMAIN_PROVIDER_WORKER_NAME: workerName,
      FORMLESS_RUNTIME_PROFILE: "instance",
      VITE_FORMLESS_RUNTIME_PROFILE: "instance",
    },
    secretRequirements: [
      {
        envName: "ALCHEMY_PASSWORD",
        purpose: "encrypt-domain-provider-alchemy-state",
        storage: "cloudflare-worker-secret",
      },
      {
        envName: "CLOUDFLARE_API_TOKEN",
        purpose: "apply-cloudflare-domain-provider-resources",
        storage: "cloudflare-worker-secret",
      },
      {
        envName: "FORMLESS_ADMIN_TOKEN",
        purpose: "protect-authority-and-media-writes",
        storage: "cloudflare-worker-secret",
      },
    ],
  };
}

export async function runFormlessInstanceOnboarding(
  input: RunFormlessInstanceOnboardingInput,
  dependencies: RunFormlessInstanceOnboardingDependencies,
): Promise<RunFormlessInstanceOnboardingResult> {
  const credentialProfile = normalizeCredentialProfile(input.credentialProfile);
  const stateRoot = parseRequiredString("Formless instance home", dependencies.stateRoot);
  const accounts = await dependencies.accountDiscovery.listAccounts({ credentialProfile });

  if (!Array.isArray(accounts)) {
    throw new Error("Cloudflare account discovery adapter must return an account array.");
  }

  const account = await (dependencies.selectAccount ?? selectOnlyFormlessInstanceAccount)({
    accounts,
    credentialProfile,
  });
  const plan = planFormlessInstanceDeployment({
    account,
    instanceName: input.instanceName,
    packageVersion: dependencies.packageVersion,
  });
  const instanceStateRoot = formlessInstanceStateRoot(stateRoot, plan.instanceName);
  const adminToken = parseRequiredString(
    "Generated Formless admin token",
    dependencies.randomToken(),
  );
  const setupToken = parseOwnerSetupToken(dependencies.randomToken());
  const localSecretEnv = await dependencies.localSecretEnv.ensure({
    createSecret: dependencies.randomToken,
    root: instanceStateRoot,
  });
  const deployment = parseDeployFormlessInstanceResult(
    await dependencies.deploymentAdapter.deploy({
      credentialProfile,
      packageRoot: parseRequiredString("Formless package root", dependencies.packageRoot),
      plan,
      secrets: {
        ALCHEMY_PASSWORD: localSecretEnv.secrets.ALCHEMY_PASSWORD,
        FORMLESS_ADMIN_TOKEN: adminToken,
      },
      stateRoot: instanceStateRoot,
    }),
  );
  const healthCheck = await dependencies.healthCheck.check({
    expectedVersion: plan.packageVersion,
    url: deployment.url,
  });
  const setupCapability = await dependencies.setupCapability.create({
    adminToken,
    deploymentUrl: deployment.url,
    setupToken,
  });
  const setupUrl = formatFormlessOwnerSetupUrl({
    deploymentUrl: deployment.url,
    setupToken,
  });

  const state = createFormlessInstanceState({
    credentialProfile,
    plan,
  });
  const stateWrite = await dependencies.stateWriter.write({
    root: instanceStateRoot,
    state,
  });

  if (input.open ?? false) {
    await dependencies.openBrowser(setupUrl);
  }

  return {
    account: plan.account,
    browserOpened: input.open ?? false,
    credentialProfile,
    deployment,
    healthCheck,
    instanceName: plan.instanceName,
    localSecretEnv,
    mode: "deployed",
    open: input.open ?? false,
    ownerSetup: {
      capability: setupCapability,
      url: setupUrl,
    },
    plan,
    state,
    stateWrite,
  };
}

export async function listFormlessInstanceAccountsWithAlchemy(
  input: ListFormlessInstanceAccountsInput,
  dependencies?: AlchemyFormlessInstanceAccountDiscoveryDependencies,
): Promise<FormlessInstanceDeploymentAccount[]> {
  const resolvedDependencies =
    dependencies ?? (await nodeAlchemyFormlessInstanceAccountDiscoveryDependencies());
  const credentialProfile = normalizeCredentialProfile(input.credentialProfile);
  const api = await resolvedDependencies.createCloudflareApi(
    credentialProfile ? { profile: credentialProfile } : {},
  );
  const resolvedAccountId = parseOptionalString("Alchemy Cloudflare account id", api.accountId);

  if (resolvedAccountId !== undefined) {
    return [
      parseDeploymentAccount({
        id: resolvedAccountId,
        workersDevSubdomain: await readFormlessInstanceWorkersDevSubdomainWithAlchemy(
          api,
          resolvedAccountId,
          credentialProfile,
        ),
      }),
    ];
  }

  const accounts = await readCloudflareResult<CloudflareAccountApiResult[]>(
    "list Cloudflare accounts",
    api.get("/accounts", {
      headers: { accept: "application/json" },
    }),
  );

  return Promise.all(
    accounts.map(async (account) => {
      const accountId = parseRequiredString("Cloudflare account id", account.id);
      const accountName = parseOptionalString("Cloudflare account name", account.name);
      const workersDevSubdomain = await readFormlessInstanceWorkersDevSubdomainWithAlchemy(
        api,
        accountId,
        credentialProfile,
      );

      return parseDeploymentAccount({
        id: accountId,
        ...(accountName === undefined ? {} : { name: accountName }),
        workersDevSubdomain,
      });
    }),
  );
}

async function readFormlessInstanceWorkersDevSubdomainWithAlchemy(
  api: AlchemyCloudflareApiClient,
  accountId: string,
  credentialProfile: string | null,
): Promise<string> {
  let subdomain: { subdomain: string };

  try {
    subdomain = await readCloudflareResult<{ subdomain: string }>(
      `read workers.dev subdomain for Cloudflare account ${accountId}`,
      api.get(`/accounts/${accountId}/workers/subdomain`, {
        headers: { accept: "application/json" },
      }),
    );
  } catch (error) {
    if (isCloudflareAuthenticationFailure(error)) {
      const profileFlag = credentialProfile ? ` -p ${credentialProfile}` : "";

      throw new Error(
        [
          error instanceof Error ? error.message : String(error),
          `Cloudflare rejected the credentials resolved by Alchemy for account ${accountId}.`,
          `Re-run \`alchemy login cloudflare${profileFlag}\` and \`alchemy configure${profileFlag}\`, or use a Cloudflare API token that can manage Workers and R2 for that account.`,
          "If CLOUDFLARE_API_TOKEN or CLOUDFLARE_API_KEY is set, it overrides the Alchemy profile.",
        ].join(" "),
      );
    }

    throw error;
  }

  return subdomain.subdomain;
}

function isCloudflareAuthenticationFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("HTTP 401") ||
    error.message.includes("HTTP 403") ||
    error.message.includes("Authentication error") ||
    error.message.includes("Unauthorized to access requested resource")
  );
}

export const alchemyFormlessInstanceAccountDiscoveryAdapter: FormlessInstanceAccountDiscoveryAdapter =
  {
    listAccounts: listFormlessInstanceAccountsWithAlchemy,
  };

export async function checkFormlessInstanceDeployMetadata(
  input: CheckFormlessInstanceDeployMetadataInput,
  dependencies: CheckFormlessInstanceDeployMetadataDependencies,
): Promise<CheckFormlessInstanceDeployMetadataResult> {
  const url = parseWorkersDevUrl("Formless instance health check URL", input.url);
  const expectedVersion = parseRequiredString(
    "Expected Formless deploy metadata version",
    input.expectedVersion,
  );
  const metadataUrl = new URL(FORMLESS_DEPLOY_METADATA_PATH, `${url}/`).toString();
  const response = await dependencies.fetch(metadataUrl, {
    headers: { accept: "application/json" },
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Formless instance health check failed for ${url}: HTTP ${response.status} ${text}`,
    );
  }

  const cacheControl = response.headers.get("Cache-Control") ?? "";

  if (!cacheControlIncludesNoStore(cacheControl)) {
    throw new Error(
      `Formless instance health check failed for ${url}: deploy metadata must send Cache-Control: no-store.`,
    );
  }

  const metadata = parseFormlessDeployMetadata(text, url);

  if (metadata.version !== expectedVersion) {
    throw new Error(
      `Formless instance health check failed for ${url}: expected deploy version ${expectedVersion}, got ${metadata.version ?? "<missing>"}.`,
    );
  }

  return {
    cacheControl,
    metadataUrl,
    url,
    version: metadata.version,
  };
}

export async function deployFormlessInstanceWithAlchemy(
  input: DeployFormlessInstanceInput,
  dependencies?: AlchemyFormlessInstanceDeploymentDependencies,
): Promise<DeployFormlessInstanceResult> {
  const resolvedDependencies = dependencies ?? (await nodeAlchemyFormlessInstanceDependencies());
  const plan = input.plan;
  const credentialProfile = normalizeCredentialProfile(input.credentialProfile);
  const packageRoot = parseRequiredString("Formless package root", input.packageRoot);
  const stateRoot = parseRequiredString("Formless instance Alchemy state root", input.stateRoot);
  const adminToken = parseRequiredString(
    "Formless admin token",
    input.secrets.FORMLESS_ADMIN_TOKEN,
  );
  const alchemyPassword = parseRequiredString(
    "Alchemy encryption password",
    input.secrets.ALCHEMY_PASSWORD,
  );
  const cloudflareApiToken = parseOptionalString(
    "Cloudflare API token",
    input.secrets.CLOUDFLARE_API_TOKEN,
  );
  const profileOptions = credentialProfile ? { profile: credentialProfile } : {};
  const adoptExistingDeployment = plan.migrationPolicy === "existing";
  const app = await resolvedDependencies.createApp(FORMLESS_ALCHEMY_APP_NAME, {
    phase: "up",
    password: alchemyPassword,
    ...profileOptions,
    rootDir: stateRoot,
    stage: plan.instanceName,
  });
  const mediaBucket = await resolvedDependencies.createR2Bucket("media", {
    adopt: adoptExistingDeployment,
    accountId: plan.account.id,
    ...profileOptions,
    name: plan.resources.mediaBucket.name,
  });
  const authorityNamespace = resolvedDependencies.createDurableObjectNamespace("authority", {
    className: plan.resources.authority.className,
    sqlite: true,
  });
  const worker = await resolvedDependencies.deployViteWorker("worker", {
    adopt: adoptExistingDeployment,
    accountId: plan.account.id,
    assets: formlessInstanceAlchemyAssets(),
    bindings: {
      [plan.resources.authority.bindingName]: authorityNamespace,
      [plan.resources.mediaBucket.bindingName]: mediaBucket,
      ALCHEMY_PASSWORD: resolvedDependencies.createSecret(alchemyPassword),
      ...(cloudflareApiToken === undefined
        ? {}
        : { CLOUDFLARE_API_TOKEN: resolvedDependencies.createSecret(cloudflareApiToken) }),
      FORMLESS_ADMIN_TOKEN: resolvedDependencies.createSecret(adminToken),
      FORMLESS_DEPLOY_VERSION: plan.runtimeVars.FORMLESS_DEPLOY_VERSION,
      FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID:
        plan.runtimeVars.FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID,
      FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID: plan.runtimeVars.FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID,
      FORMLESS_DOMAIN_PROVIDER_WORKER_NAME: plan.runtimeVars.FORMLESS_DOMAIN_PROVIDER_WORKER_NAME,
      FORMLESS_RUNTIME_PROFILE: plan.runtimeVars.FORMLESS_RUNTIME_PROFILE,
    },
    build: {
      command: "bun run build",
      env: plan.runtimeVars,
    },
    compatibilityDate: FORMLESS_WORKER_COMPATIBILITY_DATE,
    cwd: packageRoot,
    entrypoint: "src/worker/index.ts",
    name: plan.resources.worker.name,
    previewSubdomains: false,
    ...profileOptions,
    url: plan.resources.worker.workersDevEnabled,
  });

  await app.finalize();

  return parseDeployFormlessInstanceResult({
    url: worker.url ?? plan.expectedUrl.url,
  });
}

export const alchemyFormlessInstanceDeploymentAdapter: FormlessInstanceDeploymentAdapter = {
  deploy: deployFormlessInstanceWithAlchemy,
};

export const fetchFormlessInstanceDeploymentHealthCheckAdapter: FormlessInstanceDeploymentHealthCheckAdapter =
  {
    check: (input) => checkFormlessInstanceDeployMetadata(input, { fetch }),
  };

export async function createFormlessInstanceOwnerSetupCapability(
  input: CreateFormlessInstanceOwnerSetupCapabilityInput,
  dependencies: CreateFormlessInstanceOwnerSetupCapabilityDependencies,
): Promise<CreateFormlessInstanceOwnerSetupCapabilityResult> {
  const deploymentUrl = parseWorkersDevUrl(
    "Formless owner setup deployment URL",
    input.deploymentUrl,
  );
  const adminToken = parseRequiredString("Formless owner setup admin token", input.adminToken);
  const setupToken = parseOwnerSetupToken(input.setupToken);
  const endpointUrl = new URL(
    FORMLESS_OWNER_SETUP_CAPABILITY_API_PATH,
    `${deploymentUrl}/`,
  ).toString();
  const response = await dependencies.fetch(endpointUrl, {
    body: JSON.stringify({ setupToken }),
    headers: {
      accept: "application/json",
      authorization: `Bearer ${adminToken}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Formless owner setup capability creation failed for ${deploymentUrl}: HTTP ${response.status} ${text}`,
    );
  }

  return parseOwnerSetupCapabilityResponse(text, endpointUrl);
}

export const fetchFormlessInstanceOwnerSetupCapabilityAdapter: FormlessInstanceOwnerSetupCapabilityAdapter =
  {
    create: (input) => createFormlessInstanceOwnerSetupCapability(input, { fetch }),
  };

export function formatFormlessOwnerSetupUrl(input: {
  deploymentUrl: string;
  setupToken: string;
}): string {
  const deploymentUrl = parseWorkersDevUrl(
    "Formless owner setup URL deployment URL",
    input.deploymentUrl,
  );
  const setupToken = parseOwnerSetupToken(input.setupToken);
  const url = new URL(FORMLESS_OWNER_SETUP_ROUTE_PATH, `${deploymentUrl}/`);

  url.searchParams.set("token", setupToken);

  return url.toString();
}

function formlessInstanceAlchemyAssets(): AlchemyFormlessInstanceDeploymentWorkerProps["assets"] {
  return {
    directory: "dist/client",
    not_found_handling: "single-page-application",
    run_worker_first: ["/*", "!/assets/*", "!/src/*", "!/@vite/*", "!/@react-refresh"],
  };
}

async function nodeAlchemyFormlessInstanceDependencies(): Promise<AlchemyFormlessInstanceDeploymentDependencies> {
  const [{ default: alchemy }, cloudflare] = await Promise.all([
    import("alchemy"),
    import("alchemy/cloudflare"),
  ]);

  return {
    createApp: (name, options) => alchemy(name, options),
    createDurableObjectNamespace: (id, props) => cloudflare.DurableObjectNamespace(id, props),
    createR2Bucket: (id, props) => cloudflare.R2Bucket(id, props),
    createSecret: (value) => alchemy.secret(value),
    deployViteWorker: (id, props) => cloudflare.Vite(id, props as never),
  };
}

async function nodeAlchemyFormlessInstanceAccountDiscoveryDependencies(): Promise<AlchemyFormlessInstanceAccountDiscoveryDependencies> {
  const cloudflare = await import("alchemy/cloudflare");

  return {
    createCloudflareApi: (options) => cloudflare.createCloudflareApi(options),
  };
}

export function selectOnlyFormlessInstanceAccount(
  input: SelectFormlessInstanceAccountInput,
): FormlessInstanceDeploymentAccount {
  if (input.accounts.length === 0) {
    throw new Error(
      [
        "No Cloudflare accounts were found for the selected credentials.",
        "Formless uses Alchemy's resolved Cloudflare credentials first.",
        "Check --credential-profile or ALCHEMY_PROFILE, and unset CLOUDFLARE_API_TOKEN or CLOUDFLARE_API_KEY if either points at the wrong account.",
      ].join(" "),
    );
  }

  if (input.accounts.length > 1) {
    throw new Error(
      "Multiple Cloudflare accounts were found; account selection is required before deployment.",
    );
  }

  return input.accounts[0] as FormlessInstanceDeploymentAccount;
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

export async function writeFormlessInstanceState(
  input: WriteFormlessInstanceStateInput,
  dependencies: WriteFormlessInstanceStateDependencies = nodeFormlessInstanceStateWriteDependencies(),
): Promise<WriteFormlessInstanceStateResult> {
  const root = parseRequiredString("Formless instance state root", input.root);
  const state = parseFormlessInstanceState(input.state);
  const contents = formatFormlessInstanceState(state);

  await dependencies.prepareStateDirectory(root);

  const statePath = dependencies.statePath(root, FORMLESS_INSTANCE_STATE_FILE);

  await dependencies.writeFile(statePath, contents);

  return {
    path: statePath,
    state,
  };
}

export async function ensureFormlessInstanceLocalSecretEnv(
  input: EnsureFormlessInstanceLocalSecretEnvInput,
  dependencies: EnsureFormlessInstanceLocalSecretEnvDependencies = nodeFormlessInstanceLocalSecretEnvDependencies(),
): Promise<EnsureFormlessInstanceLocalSecretEnvResult> {
  const root = parseRequiredString("Formless instance local secret root", input.root);

  await dependencies.prepareStateDirectory(root);

  const envPath = dependencies.statePath(root, FORMLESS_INSTANCE_LOCAL_ENV_FILE);
  const contents = await readTextFileIfExists(envPath, dependencies);
  const values = parseDotEnv(contents ?? "");
  const existingPassword = nonEmptyEnvValue(values[ALCHEMY_PASSWORD_ENV_NAME]);

  if (existingPassword) {
    return {
      created: false,
      path: envPath,
      secrets: {
        ALCHEMY_PASSWORD: existingPassword,
      },
    };
  }

  const generatedPassword = parseRequiredString(
    "Generated Alchemy encryption password",
    input.createSecret(),
  );

  await dependencies.writeFile(
    envPath,
    appendDotEnvValue(contents ?? "", ALCHEMY_PASSWORD_ENV_NAME, generatedPassword),
  );

  return {
    created: true,
    path: envPath,
    secrets: {
      ALCHEMY_PASSWORD: generatedPassword,
    },
  };
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

export function formlessInstanceStateRoot(root: string, instanceName: string): string {
  return path.join(
    parseRequiredString("Formless instance home", root),
    FORMLESS_INSTANCE_DIRECTORY,
    parseCanonicalSlug("Formless instance state name", instanceName, maxInstanceNameLength),
  );
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

function parseDeployFormlessInstanceResult(result: unknown): DeployFormlessInstanceResult {
  if (!isRecord(result)) {
    throw new Error("Formless deployment adapter result must be an object.");
  }

  return {
    url: parseWorkersDevUrl("Formless deployment adapter URL", result.url),
  };
}

function normalizeCredentialProfile(value: string | null | undefined): string | null {
  return parseOptionalString("Cloudflare credential profile", value ?? undefined) ?? null;
}

function nodeFormlessInstanceStateWriteDependencies(): WriteFormlessInstanceStateDependencies {
  return {
    prepareStateDirectory: prepareFormlessInstanceStateDirectory,
    statePath: formlessInstanceStatePath,
    writeFile,
  };
}

function nodeFormlessInstanceLocalSecretEnvDependencies(): EnsureFormlessInstanceLocalSecretEnvDependencies {
  return {
    prepareStateDirectory: prepareFormlessInstanceStateDirectory,
    readFile,
    statePath: formlessInstanceStatePath,
    writeFile,
  };
}

async function prepareFormlessInstanceStateDirectory(root: string) {
  await mkdir(root, { recursive: true });
}

function formlessInstanceStatePath(root: string, fileName: string): string {
  return path.join(root, fileName);
}

async function readTextFileIfExists(
  filePath: string,
  dependencies: Pick<EnsureFormlessInstanceLocalSecretEnvDependencies, "readFile">,
): Promise<string | null> {
  try {
    return await dependencies.readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function nonEmptyEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

type CloudflareAccountApiResult = {
  id?: unknown;
  name?: unknown;
};

type CloudflareApiResponse<T> = {
  errors?: Array<{ message?: string }>;
  result?: T;
  success?: boolean;
};

async function readCloudflareResult<T>(
  context: string,
  responsePromise: Promise<Response>,
): Promise<T> {
  const response = await responsePromise;
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${context} failed: HTTP ${response.status} ${text}`);
  }

  let parsed: CloudflareApiResponse<T>;

  try {
    parsed = JSON.parse(text) as CloudflareApiResponse<T>;
  } catch {
    throw new Error(`${context} failed: response was not JSON.`);
  }

  if (parsed.success === false) {
    const message = parsed.errors
      ?.map((error) => error.message)
      .filter(Boolean)
      .join("; ");

    throw new Error(`${context} failed${message ? `: ${message}` : "."}`);
  }

  if (parsed.result === undefined) {
    throw new Error(`${context} failed: response did not include a result.`);
  }

  return parsed.result;
}

function parseFormlessDeployMetadata(text: string, url: string): FormlessDeployMetadata {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `Formless instance health check failed for ${url}: deploy metadata was not JSON.`,
    );
  }

  if (!isRecord(parsed)) {
    throw new Error(
      `Formless instance health check failed for ${url}: deploy metadata must be an object.`,
    );
  }

  if (parsed.version !== null && typeof parsed.version !== "string") {
    throw new Error(
      `Formless instance health check failed for ${url}: deploy metadata version must be a string or null.`,
    );
  }

  return {
    version: parsed.version,
  };
}

function parseOwnerSetupCapabilityResponse(
  text: string,
  endpointUrl: string,
): CreateFormlessInstanceOwnerSetupCapabilityResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `Formless owner setup capability creation failed for ${endpointUrl}: response was not JSON.`,
    );
  }

  if (!isRecord(parsed)) {
    throw new Error(
      `Formless owner setup capability creation failed for ${endpointUrl}: response must be an object.`,
    );
  }

  if (parsed.capabilityCreated !== true || parsed.setupComplete !== false) {
    throw new Error(
      `Formless owner setup capability creation failed for ${endpointUrl}: response did not confirm setup capability creation.`,
    );
  }

  const expiresAt = parseOptionalString(
    "Formless owner setup capability response expiresAt",
    parsed.expiresAt,
  );

  return {
    capabilityCreated: true,
    endpointUrl,
    ...(expiresAt === undefined ? {} : { expiresAt }),
    setupComplete: false,
  };
}

function cacheControlIncludesNoStore(cacheControl: string): boolean {
  return cacheControl
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .includes("no-store");
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

function parseDeploymentMigrationPolicy(value: unknown): FormlessInstanceDeploymentMigrationPolicy {
  if (value === "existing" || value === "new") {
    return value;
  }

  throw new Error('Formless instance deployment migration policy must be "new" or "existing".');
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
