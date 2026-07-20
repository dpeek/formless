import type { StoredRecord } from "@dpeek/formless-storage";

import {
  CF_API_TOKEN_ENV_NAME,
  CLOUDFLARE_API_TOKEN_ENV_NAME,
} from "./cloudflare-domain-client.ts";
import {
  FORMLESS_CLOUDFLARE_OAUTH_CREDENTIAL_REF_PREFIX,
  createNodeFormlessCloudflareOAuthAdapter,
  parseFormlessCloudflareOAuthCredentialRef,
  readFormlessCloudflareOAuthCredential,
  refreshStoredFormlessCloudflareOAuthCredential,
  type FormlessCloudflareOAuthAccount,
  type FormlessCloudflareOAuthAdapter,
  type FormlessCloudflareOAuthCredential,
} from "./cloudflare-oauth.ts";
import {
  type FormlessInstanceAccountDiscoveryAdapter,
  type FormlessInstanceDeploymentAccount,
  selectOnlyFormlessInstanceAccount,
} from "./instance-onboarding.ts";
import {
  formlessCliWorkersDevTargetFacts,
  selectFormlessCliDeploymentConfig,
  type FormlessCliWorkspaceTargetCommandName,
} from "./instance-target-context.ts";
import { stringRecordValue } from "./instance-workspace-control-plane.ts";

export const FORMLESS_ALCHEMY_DEFAULT_PROFILE = "default";
export const FORMLESS_ALCHEMY_PROFILE_REF_PREFIX = "alchemy-profile:";

export type LocalWorkspaceDeploymentCredential =
  | {
      credentialProfile: string | null;
      kind: "alchemy-profile";
    }
  | {
      credentialId: string;
      credentialRef: string;
      kind: "formless-cloudflare-oauth";
    };

export type FormlessCliProviderCredentialAccess = "mutable" | "read-only";

export type FormlessCliDeploymentCredentialReference =
  | {
      credentialProfile: string | null;
      kind: "alchemy-profile";
      profile: string;
      profileRef: string;
    }
  | {
      credentialId: string;
      credentialRef: string;
      kind: "formless-cloudflare-oauth";
    };

export type FormlessCliProviderBearerMaterial =
  | {
      credentialRef: string;
      kind: "cloudflare-api-token";
      providerFamily: "cloudflare";
      source: "formless-cloudflare-oauth";
      token: string;
    }
  | {
      envName: typeof CLOUDFLARE_API_TOKEN_ENV_NAME | typeof CF_API_TOKEN_ENV_NAME;
      kind: "cloudflare-api-token";
      providerFamily: "cloudflare";
      source: "manual-cloudflare-api-token";
      token: string;
    };

export type FormlessCliProviderCredentialContext = {
  access: FormlessCliProviderCredentialAccess;
  account: FormlessInstanceDeploymentAccount;
  credential: LocalWorkspaceDeploymentCredential;
  credentialProfile: string | null;
  credentialReference: FormlessCliDeploymentCredentialReference;
  providerBearer?: FormlessCliProviderBearerMaterial;
  providerFamily: "cloudflare";
};

export type LocalWorkspaceDeploymentSource = {
  credential?: LocalWorkspaceDeploymentCredential;
  credentialProfile?: string | null;
  deploymentConfig?: StoredRecord;
};

export function selectLocalWorkspaceDeploymentSource(
  controlPlane: { records: readonly StoredRecord[] } | undefined,
  targetAlias: string | null | undefined,
  options: { commandName: FormlessCliWorkspaceTargetCommandName },
): LocalWorkspaceDeploymentSource {
  if (!controlPlane) {
    if (targetAlias?.trim()) {
      throw new Error(
        `Formless instance ${options.commandName} target "${targetAlias.trim()}" was not found.`,
      );
    }

    return {};
  }

  const records = controlPlane.records.filter((record) => !record.deletedAt);
  const deploymentConfig = selectFormlessCliDeploymentConfig(records, targetAlias, {
    commandName: options.commandName,
    required: false,
  });
  const credential =
    deploymentConfig === undefined
      ? undefined
      : deploymentCredentialFromDeploymentConfig(deploymentConfig);

  return {
    deploymentConfig,
    ...(credential === undefined
      ? {}
      : {
          credential,
          credentialProfile: deploymentCredentialProfile(credential),
        }),
  };
}

export function deploymentCredentialFromDeploymentConfig(
  record: StoredRecord,
): LocalWorkspaceDeploymentCredential | undefined {
  const credentialRef = stringRecordValue(record, "credentialRef")?.trim();

  if (credentialRef === undefined || credentialRef === "") {
    return undefined;
  }

  if (credentialRef.startsWith(FORMLESS_CLOUDFLARE_OAUTH_CREDENTIAL_REF_PREFIX)) {
    const credentialId = parseFormlessCloudflareOAuthCredentialRef(credentialRef);

    return {
      credentialId,
      credentialRef,
      kind: "formless-cloudflare-oauth",
    };
  }

  if (!credentialRef.startsWith(FORMLESS_ALCHEMY_PROFILE_REF_PREFIX)) {
    throw new Error(
      `Formless instance deployment-config "${record.id}" credentialRef must use ${FORMLESS_CLOUDFLARE_OAUTH_CREDENTIAL_REF_PREFIX}<credentialId> or ${FORMLESS_ALCHEMY_PROFILE_REF_PREFIX}<profile>.`,
    );
  }

  const profile = credentialRef.slice(FORMLESS_ALCHEMY_PROFILE_REF_PREFIX.length).trim();

  if (!profile) {
    throw new Error(`Formless instance deployment-config "${record.id}" credentialRef is empty.`);
  }

  return {
    credentialProfile: profile === FORMLESS_ALCHEMY_DEFAULT_PROFILE ? null : profile,
    kind: "alchemy-profile",
  };
}

export function defaultLocalWorkspaceDeploymentCredential(): LocalWorkspaceDeploymentCredential {
  return {
    credentialProfile: null,
    kind: "alchemy-profile",
  };
}

export function alchemyProfileDeploymentCredential(
  credentialProfile: string | null,
): LocalWorkspaceDeploymentCredential {
  return {
    credentialProfile,
    kind: "alchemy-profile",
  };
}

export function deploymentCredentialProfile(
  credential: LocalWorkspaceDeploymentCredential,
): string | null {
  return credential.kind === "alchemy-profile" ? credential.credentialProfile : null;
}

export function alchemyProfileRef(credentialProfile: string | null): string {
  return `${FORMLESS_ALCHEMY_PROFILE_REF_PREFIX}${credentialProfile ?? FORMLESS_ALCHEMY_DEFAULT_PROFILE}`;
}

export function deploymentCredentialReference(
  credential: LocalWorkspaceDeploymentCredential,
): FormlessCliDeploymentCredentialReference {
  if (credential.kind === "formless-cloudflare-oauth") {
    return {
      credentialId: credential.credentialId,
      credentialRef: credential.credentialRef,
      kind: "formless-cloudflare-oauth",
    };
  }

  return {
    credentialProfile: credential.credentialProfile,
    kind: "alchemy-profile",
    profile: credential.credentialProfile ?? FORMLESS_ALCHEMY_DEFAULT_PROFILE,
    profileRef: alchemyProfileRef(credential.credentialProfile),
  };
}

export async function resolveLocalWorkspaceDeploymentCredentialContext(input: {
  accountDiscovery?: FormlessInstanceAccountDiscoveryAdapter;
  credentialAccess: FormlessCliProviderCredentialAccess;
  credential?: LocalWorkspaceDeploymentCredential;
  credentialProfileFallback?: string | null;
  deploymentConfig?: StoredRecord;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  now?: () => string;
  oauth?: Pick<FormlessCloudflareOAuthAdapter, "listAccounts" | "refresh">;
  workspaceRoot: string;
}): Promise<FormlessCliProviderCredentialContext> {
  const credential =
    input.credential ??
    (input.credentialProfileFallback === undefined
      ? defaultLocalWorkspaceDeploymentCredential()
      : alchemyProfileDeploymentCredential(input.credentialProfileFallback));
  const credentialProfile = deploymentCredentialProfile(credential);
  const credentialReference = deploymentCredentialReference(credential);
  const configuredAccountId = stringRecordValue(input.deploymentConfig, "accountId");

  if (credential.kind === "formless-cloudflare-oauth") {
    const oauthCredentialReference = {
      credentialId: credential.credentialId,
      credentialRef: credential.credentialRef,
      kind: "formless-cloudflare-oauth",
    } satisfies Extract<
      FormlessCliDeploymentCredentialReference,
      { kind: "formless-cloudflare-oauth" }
    >;

    return resolveFormlessCloudflareOAuthDeploymentCredentialContext({
      configuredAccountId,
      credential,
      credentialAccess: input.credentialAccess,
      credentialProfile,
      credentialReference: oauthCredentialReference,
      deploymentConfig: input.deploymentConfig,
      ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
      ...(input.now === undefined ? {} : { now: input.now }),
      ...(input.oauth === undefined ? {} : { oauth: input.oauth }),
      workspaceRoot: input.workspaceRoot,
    });
  }

  const account = await resolveAlchemyProfileDeploymentAccount({
    accountDiscovery: input.accountDiscovery,
    configuredAccountId,
    credentialProfile,
    deploymentConfig: input.deploymentConfig,
  });
  const manualBearer =
    input.credentialAccess === "mutable" ? manualCloudflareApiTokenBearer(input.env) : undefined;

  return {
    access: input.credentialAccess,
    account,
    credential,
    credentialProfile,
    credentialReference,
    ...(manualBearer === undefined ? {} : { providerBearer: manualBearer }),
    providerFamily: "cloudflare",
  };
}

export async function resolveLocalWorkspaceDeploymentAccount(input: {
  accountDiscovery: FormlessInstanceAccountDiscoveryAdapter;
  credentialAccess: "mutable" | "read-only";
  credential?: LocalWorkspaceDeploymentCredential;
  deploymentConfig?: StoredRecord;
  fetch: typeof fetch;
  now: () => string;
  workspaceRoot: string;
}): Promise<FormlessInstanceDeploymentAccount> {
  const credential = input.credential ?? defaultLocalWorkspaceDeploymentCredential();
  const credentialProfile = deploymentCredentialProfile(credential);
  const configuredAccountId = stringRecordValue(input.deploymentConfig, "accountId");

  if (credential.kind === "formless-cloudflare-oauth") {
    if (input.credentialAccess === "read-only") {
      return resolveReadOnlyLocalWorkspaceCloudflareOAuthAccount({
        configuredAccountId,
        credential,
        deploymentConfig: input.deploymentConfig,
        workspaceRoot: input.workspaceRoot,
      });
    }

    const oauth = createNodeFormlessCloudflareOAuthAdapter({
      fetch: input.fetch,
      now: input.now,
    });
    const storedCredential = await readRefreshedLocalWorkspaceCloudflareOAuthCredential({
      credential,
      now: input.now,
      oauth,
      workspaceRoot: input.workspaceRoot,
    });
    const storedAccount = deploymentAccountFromStoredFormlessCloudflareOAuthCredential({
      configuredAccountId,
      credential,
      storedCredential,
    });

    if (storedAccount !== undefined) {
      return storedAccount;
    }

    const accounts = await oauth.listAccounts(storedCredential.token);

    return selectFormlessCloudflareOAuthDeploymentAccount({
      accounts,
      configuredAccountId,
      credential,
      selectedAccount: storedCredential.selectedAccount,
    });
  }

  return resolveAlchemyProfileDeploymentAccount({
    accountDiscovery: input.accountDiscovery,
    configuredAccountId,
    credentialProfile,
    deploymentConfig: input.deploymentConfig,
  });
}

export async function hasLocalWorkspaceFormlessCloudflareOAuthCredential(input: {
  credential: Extract<LocalWorkspaceDeploymentCredential, { kind: "formless-cloudflare-oauth" }>;
  workspaceRoot: string;
}): Promise<boolean> {
  return (
    (await readFormlessCloudflareOAuthCredential({
      id: input.credential.credentialId,
      workspaceRoot: input.workspaceRoot,
    })) !== undefined
  );
}

export function optionalCloudflareApiToken(env: NodeJS.ProcessEnv | undefined): string | undefined {
  return manualCloudflareApiTokenBearer(env)?.token;
}

function manualCloudflareApiTokenBearer(
  env: NodeJS.ProcessEnv | undefined,
):
  | Extract<FormlessCliProviderBearerMaterial, { source: "manual-cloudflare-api-token" }>
  | undefined {
  const cloudflareApiToken = env?.[CLOUDFLARE_API_TOKEN_ENV_NAME]?.trim();

  if (cloudflareApiToken) {
    return {
      envName: CLOUDFLARE_API_TOKEN_ENV_NAME,
      kind: "cloudflare-api-token",
      providerFamily: "cloudflare",
      source: "manual-cloudflare-api-token",
      token: cloudflareApiToken,
    };
  }

  const cfApiToken = env?.[CF_API_TOKEN_ENV_NAME]?.trim();

  if (cfApiToken) {
    return {
      envName: CF_API_TOKEN_ENV_NAME,
      kind: "cloudflare-api-token",
      providerFamily: "cloudflare",
      source: "manual-cloudflare-api-token",
      token: cfApiToken,
    };
  }

  return undefined;
}

export async function resolveLocalWorkspaceCloudflareApiToken(input: {
  credential: LocalWorkspaceDeploymentCredential;
  env: NodeJS.ProcessEnv | undefined;
  fetch?: typeof fetch;
  now?: () => string;
  workspaceRoot: string;
}): Promise<string | undefined> {
  if (input.credential.kind !== "formless-cloudflare-oauth") {
    return optionalCloudflareApiToken(input.env);
  }

  const now = input.now ?? (() => new Date().toISOString());
  const oauth = createNodeFormlessCloudflareOAuthAdapter({
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
    now,
  });
  const credential = await readRefreshedLocalWorkspaceCloudflareOAuthCredential({
    credential: input.credential,
    now,
    oauth,
    workspaceRoot: input.workspaceRoot,
  });

  return credential.token.accessToken;
}

export function rotateCommandEnv(
  env: NodeJS.ProcessEnv | undefined,
  deploymentConfig: StoredRecord | undefined,
): NodeJS.ProcessEnv {
  const accountId = stringRecordValue(deploymentConfig, "accountId");

  return {
    ...env,
    ...(accountId === undefined ? {} : { CLOUDFLARE_ACCOUNT_ID: accountId }),
  };
}

async function resolveFormlessCloudflareOAuthDeploymentCredentialContext(input: {
  configuredAccountId: string | undefined;
  credential: Extract<LocalWorkspaceDeploymentCredential, { kind: "formless-cloudflare-oauth" }>;
  credentialAccess: FormlessCliProviderCredentialAccess;
  credentialProfile: string | null;
  credentialReference: Extract<
    FormlessCliDeploymentCredentialReference,
    { kind: "formless-cloudflare-oauth" }
  >;
  deploymentConfig: StoredRecord | undefined;
  fetch?: typeof fetch;
  now?: () => string;
  oauth?: Pick<FormlessCloudflareOAuthAdapter, "listAccounts" | "refresh">;
  workspaceRoot: string;
}): Promise<FormlessCliProviderCredentialContext> {
  if (input.credentialAccess === "read-only") {
    const account = await resolveReadOnlyLocalWorkspaceCloudflareOAuthAccount({
      configuredAccountId: input.configuredAccountId,
      credential: input.credential,
      deploymentConfig: input.deploymentConfig,
      workspaceRoot: input.workspaceRoot,
    });

    return {
      access: input.credentialAccess,
      account,
      credential: input.credential,
      credentialProfile: input.credentialProfile,
      credentialReference: input.credentialReference,
      providerFamily: "cloudflare",
    };
  }

  const now = input.now ?? (() => new Date().toISOString());
  const oauth =
    input.oauth ??
    createNodeFormlessCloudflareOAuthAdapter({
      ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
      now,
    });
  const storedCredential = await readRefreshedLocalWorkspaceCloudflareOAuthCredential({
    credential: input.credential,
    now,
    oauth,
    workspaceRoot: input.workspaceRoot,
  });
  const storedAccount = deploymentAccountFromStoredFormlessCloudflareOAuthCredential({
    configuredAccountId: input.configuredAccountId,
    credential: input.credential,
    storedCredential,
  });
  const account =
    storedAccount ??
    selectFormlessCloudflareOAuthDeploymentAccount({
      accounts: await oauth.listAccounts(storedCredential.token),
      configuredAccountId: input.configuredAccountId,
      credential: input.credential,
      selectedAccount: storedCredential.selectedAccount,
    });

  return {
    access: input.credentialAccess,
    account,
    credential: input.credential,
    credentialProfile: input.credentialProfile,
    credentialReference: input.credentialReference,
    providerBearer: {
      credentialRef: input.credential.credentialRef,
      kind: "cloudflare-api-token",
      providerFamily: "cloudflare",
      source: "formless-cloudflare-oauth",
      token: storedCredential.token.accessToken,
    },
    providerFamily: "cloudflare",
  };
}

async function resolveAlchemyProfileDeploymentAccount(input: {
  accountDiscovery: FormlessInstanceAccountDiscoveryAdapter | undefined;
  configuredAccountId: string | undefined;
  credentialProfile: string | null;
  deploymentConfig?: StoredRecord;
}): Promise<FormlessInstanceDeploymentAccount> {
  if (input.accountDiscovery === undefined) {
    const accountId = input.configuredAccountId?.trim();

    if (!accountId) {
      throw new Error(
        "Formless deployment credential context requires deployment-config.accountId.",
      );
    }

    return deploymentAccountFromDeploymentConfig(input.deploymentConfig, accountId);
  }

  const accounts = await input.accountDiscovery.listAccounts({
    credentialProfile: input.credentialProfile,
  });

  if (!Array.isArray(accounts)) {
    throw new Error("Cloudflare account discovery adapter must return an account array.");
  }

  const account =
    input.configuredAccountId === undefined || input.configuredAccountId === ""
      ? selectOnlyFormlessInstanceAccount({
          accounts,
          credentialProfile: input.credentialProfile,
        })
      : accounts.find((candidate) => candidate.id === input.configuredAccountId);

  if (!account) {
    throw new Error(
      `Cloudflare account ${input.configuredAccountId} was not found for the selected credentials.`,
    );
  }

  return account;
}

function deploymentAccountFromStoredFormlessCloudflareOAuthCredential(input: {
  configuredAccountId: string | undefined;
  credential: Extract<LocalWorkspaceDeploymentCredential, { kind: "formless-cloudflare-oauth" }>;
  storedCredential: FormlessCloudflareOAuthCredential;
}): FormlessInstanceDeploymentAccount | undefined {
  if (input.storedCredential.selectedAccount === undefined) {
    return undefined;
  }

  const selectedAccountId = input.configuredAccountId ?? input.storedCredential.selectedAccount.id;

  if (selectedAccountId === input.storedCredential.selectedAccount.id) {
    return deploymentAccountFromFormlessCloudflareOAuthAccount(
      input.storedCredential.selectedAccount,
    );
  }

  throw new Error(
    `Cloudflare account ${selectedAccountId} was not found for Formless credentialRef ${input.credential.credentialRef}.`,
  );
}

async function resolveReadOnlyLocalWorkspaceCloudflareOAuthAccount(input: {
  configuredAccountId: string | undefined;
  credential: Extract<LocalWorkspaceDeploymentCredential, { kind: "formless-cloudflare-oauth" }>;
  deploymentConfig: StoredRecord | undefined;
  workspaceRoot: string;
}): Promise<FormlessInstanceDeploymentAccount> {
  const credential = await readFormlessCloudflareOAuthCredential({
    id: input.credential.credentialId,
    workspaceRoot: input.workspaceRoot,
  });

  if (credential === undefined) {
    throw new Error(
      `Formless Cloudflare OAuth credential "${input.credential.credentialId}" was not found in ignored local secret state.`,
    );
  }

  const selectedAccountId = input.configuredAccountId ?? credential.selectedAccount?.id;

  if (selectedAccountId === undefined || selectedAccountId === "") {
    throw new Error(
      "Cloudflare account selection is required before push dry-run can read deployment intent.",
    );
  }

  if (credential.selectedAccount?.id === selectedAccountId) {
    return deploymentAccountFromFormlessCloudflareOAuthAccount(credential.selectedAccount);
  }

  if (input.configuredAccountId === selectedAccountId) {
    return deploymentAccountFromDeploymentConfig(input.deploymentConfig, selectedAccountId);
  }

  throw new Error(
    `Cloudflare account ${selectedAccountId} was not found for Formless credentialRef ${input.credential.credentialRef}.`,
  );
}

async function readRefreshedLocalWorkspaceCloudflareOAuthCredential(input: {
  credential: Extract<LocalWorkspaceDeploymentCredential, { kind: "formless-cloudflare-oauth" }>;
  now: () => string;
  oauth: Pick<FormlessCloudflareOAuthAdapter, "refresh">;
  workspaceRoot: string;
}): Promise<FormlessCloudflareOAuthCredential> {
  const credential = await readFormlessCloudflareOAuthCredential({
    id: input.credential.credentialId,
    workspaceRoot: input.workspaceRoot,
  });

  if (credential === undefined) {
    throw new Error(
      `Formless Cloudflare OAuth credential "${input.credential.credentialId}" was not found in ignored local secret state.`,
    );
  }

  return refreshStoredFormlessCloudflareOAuthCredential({
    credential,
    now: input.now,
    oauth: input.oauth,
    workspaceRoot: input.workspaceRoot,
  });
}

function selectFormlessCloudflareOAuthDeploymentAccount(input: {
  accounts: readonly FormlessCloudflareOAuthAccount[];
  configuredAccountId: string | undefined;
  credential: Extract<LocalWorkspaceDeploymentCredential, { kind: "formless-cloudflare-oauth" }>;
  selectedAccount: FormlessCloudflareOAuthAccount | undefined;
}): FormlessInstanceDeploymentAccount {
  if (!Array.isArray(input.accounts)) {
    throw new Error("Cloudflare OAuth account discovery adapter must return an account array.");
  }

  if (input.accounts.length === 0) {
    throw new Error("No Cloudflare accounts were found for the Formless OAuth credential.");
  }

  const selectedAccountId = input.configuredAccountId ?? input.selectedAccount?.id;

  if (selectedAccountId === undefined || selectedAccountId === "") {
    if (input.accounts.length > 1) {
      throw new Error(
        "Multiple Cloudflare accounts were found for the Formless OAuth credential; account selection is required before deployment.",
      );
    }

    return deploymentAccountFromFormlessCloudflareOAuthAccount(input.accounts[0]);
  }

  const account = input.accounts.find((candidate) => candidate.id === selectedAccountId);

  if (!account) {
    throw new Error(
      `Cloudflare account ${selectedAccountId} was not found for Formless credentialRef ${input.credential.credentialRef}.`,
    );
  }

  return deploymentAccountFromFormlessCloudflareOAuthAccount(account);
}

function deploymentAccountFromDeploymentConfig(
  deploymentConfig: StoredRecord | undefined,
  accountId: string,
): FormlessInstanceDeploymentAccount {
  const targetUrl = stringRecordValue(deploymentConfig, "targetUrl");
  const workerName = stringRecordValue(deploymentConfig, "workerName");

  if (targetUrl === undefined) {
    throw new Error("Formless push dry-run requires deployment-config.targetUrl.");
  }

  return {
    id: accountId,
    workersDevSubdomain: formlessCliWorkersDevTargetFacts(targetUrl, workerName)
      .workersDevSubdomain,
  };
}

function deploymentAccountFromFormlessCloudflareOAuthAccount(
  account: FormlessCloudflareOAuthAccount,
): FormlessInstanceDeploymentAccount {
  return {
    id: account.id,
    ...(account.name === undefined ? {} : { name: account.name }),
    workersDevSubdomain: account.workersDevSubdomain,
  };
}
