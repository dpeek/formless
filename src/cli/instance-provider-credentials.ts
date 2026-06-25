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

  const accounts = await input.accountDiscovery.listAccounts({ credentialProfile });

  if (!Array.isArray(accounts)) {
    throw new Error("Cloudflare account discovery adapter must return an account array.");
  }

  const account =
    configuredAccountId === undefined || configuredAccountId === ""
      ? selectOnlyFormlessInstanceAccount({ accounts, credentialProfile })
      : accounts.find((candidate) => candidate.id === configuredAccountId);

  if (!account) {
    throw new Error(
      `Cloudflare account ${configuredAccountId} was not found for the selected credentials.`,
    );
  }

  return account;
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
  const token =
    env?.[CLOUDFLARE_API_TOKEN_ENV_NAME]?.trim() ?? env?.[CF_API_TOKEN_ENV_NAME]?.trim();

  return token ? token : undefined;
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
