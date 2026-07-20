import { createInterface } from "node:readline/promises";

import type { FormlessCliCommand } from "./cli-command.ts";
import type {
  AlchemyCloudflareCredentialSetupInput,
  AlchemyCloudflareCredentialSetupResult,
  FormlessCloudflareCredentialSetupDependencies,
} from "./instance-workspace-credential-setup.ts";
import { setupCloudflareCredentialsWithFormlessOAuth as setupCloudflareCredentialsWithFormlessOAuthCommand } from "./instance-workspace-credential-setup.ts";
import {
  preflightPushFormlessCloudflareOAuthCredential as preflightPushFormlessCloudflareOAuthCredentialCommand,
  type PushFormlessInstanceWorkspaceCloudflareOAuthPreflightResult,
} from "./instance-workspace-deployment.ts";
import type {
  FormlessCloudflareOAuthAccount,
  FormlessCloudflareOAuthAdapter,
} from "./cloudflare-oauth.ts";

export type FormlessCliWorkspacePushCredentialPreflightCommand = Extract<
  FormlessCliCommand,
  { kind: "workspacePush" }
>;

export type FormlessCliCloudflareOAuthAccountSelectionInput = {
  accounts: readonly FormlessCloudflareOAuthAccount[];
  credentialRef: string;
  targetAlias: string;
};

export type FormlessCliWorkspacePushCredentialPreflightDependencies = {
  cloudflareOAuth?: FormlessCloudflareOAuthAdapter;
  cwd: string;
  log: (message: string) => void;
  now: () => string;
  openBrowser: (url: string) => Promise<void>;
  preflightPushCloudflareOAuthCredential?: (
    input: Pick<FormlessCliWorkspacePushCredentialPreflightCommand, "targetAlias"> & {
      workspacePath?: string;
    },
    dependencies: { cwd: string },
  ) => Promise<PushFormlessInstanceWorkspaceCloudflareOAuthPreflightResult>;
  selectCloudflareAccount?: (
    input: FormlessCliCloudflareOAuthAccountSelectionInput,
  ) => Promise<string | null | undefined>;
  setupCloudflareCredentialsWithFormlessOAuth?: (
    input: AlchemyCloudflareCredentialSetupInput,
    dependencies: FormlessCloudflareCredentialSetupDependencies,
  ) => Promise<AlchemyCloudflareCredentialSetupResult>;
};

export async function runFormlessCliWorkspacePushCredentialPreflight(
  command: FormlessCliWorkspacePushCredentialPreflightCommand,
  dependencies: FormlessCliWorkspacePushCredentialPreflightDependencies,
): Promise<void> {
  if (command.dryRun) {
    return;
  }

  const preflightPushCredential =
    dependencies.preflightPushCloudflareOAuthCredential ??
    preflightPushFormlessCloudflareOAuthCredentialCommand;
  const preflight = await preflightPushCredential(
    {
      targetAlias: command.targetAlias,
      workspacePath: command.workspacePath ?? undefined,
    },
    { cwd: dependencies.cwd },
  );

  await completeFormlessCliWorkspacePushCredentialPreflight(preflight, dependencies);
}

async function completeFormlessCliWorkspacePushCredentialPreflight(
  preflight: PushFormlessInstanceWorkspaceCloudflareOAuthPreflightResult,
  dependencies: FormlessCliWorkspacePushCredentialPreflightDependencies,
): Promise<void> {
  if (!preflight.needsSetup) {
    return;
  }

  const setupInput = {
    deploymentConfigId: preflight.deploymentConfigId,
    profileLabel: preflight.credentialId,
    provider: "cloudflare" as const,
    targetAlias: preflight.selectedTarget.alias,
    workspaceRoot: preflight.workspaceRoot,
  };
  const setup = await runFormlessCliCloudflareOAuthCredentialSetup(setupInput, dependencies);
  const completed = await completeCliCloudflareOAuthSetup(setup, dependencies);

  if (cliCloudflareOAuthSetupRequiresAccountSelection(completed)) {
    const selection = cliCloudflareOAuthAccountSelectionInput(
      completed,
      preflight.selectedTarget.alias,
    );
    const selectedAccountId = await selectCliCloudflareOAuthAccount(selection, dependencies);

    if (selectedAccountId === null || selectedAccountId === undefined) {
      throw new Error(formatCliCloudflareOAuthNonInteractiveAccountSelectionError(selection));
    }

    const selectedSetup = await runFormlessCliCloudflareOAuthCredentialSetup(
      { ...setupInput, accountId: selectedAccountId },
      dependencies,
    );
    const selectedCompleted = await completeCliCloudflareOAuthSetup(selectedSetup, dependencies);

    assertCliCloudflareOAuthSetupCompleted(selectedCompleted);
    return;
  }

  assertCliCloudflareOAuthSetupCompleted(completed);
}

function runFormlessCliCloudflareOAuthCredentialSetup(
  input: AlchemyCloudflareCredentialSetupInput,
  dependencies: FormlessCliWorkspacePushCredentialPreflightDependencies,
): Promise<AlchemyCloudflareCredentialSetupResult> {
  const setupCredential =
    dependencies.setupCloudflareCredentialsWithFormlessOAuth ??
    setupCloudflareCredentialsWithFormlessOAuthCommand;
  const setupDependencies = {
    now: dependencies.now,
    ...(dependencies.cloudflareOAuth === undefined ? {} : { oauth: dependencies.cloudflareOAuth }),
  };

  return setupCredential(input, setupDependencies);
}

async function completeCliCloudflareOAuthSetup(
  setup: AlchemyCloudflareCredentialSetupResult,
  dependencies: Pick<
    FormlessCliWorkspacePushCredentialPreflightDependencies,
    "log" | "openBrowser"
  >,
): Promise<AlchemyCloudflareCredentialSetupResult> {
  await openCliCloudflareOAuthAuthorizationUrls(setup, dependencies);

  return setup.continue === undefined ? setup : setup.continue();
}

async function openCliCloudflareOAuthAuthorizationUrls(
  setup: AlchemyCloudflareCredentialSetupResult,
  dependencies: Pick<
    FormlessCliWorkspacePushCredentialPreflightDependencies,
    "log" | "openBrowser"
  >,
): Promise<void> {
  for (const event of setup.events ?? []) {
    if (event.type !== "externalAuthorizationUrl") {
      continue;
    }

    dependencies.log(`Cloudflare authorization URL: ${event.url}`);
    await dependencies.openBrowser(event.url);
  }
}

function assertCliCloudflareOAuthSetupCompleted(
  setup: AlchemyCloudflareCredentialSetupResult,
): void {
  if (setup.status !== "succeeded" || setup.result?.summary.fields.status !== "validated") {
    throw new Error("Cloudflare credential setup requires a selected account before push.");
  }
}

function cliCloudflareOAuthSetupRequiresAccountSelection(
  setup: AlchemyCloudflareCredentialSetupResult,
): boolean {
  return (
    setup.status === "succeeded" &&
    setup.result?.summary.fields.status === "account-selection-required"
  );
}

function cliCloudflareOAuthAccountSelectionInput(
  setup: AlchemyCloudflareCredentialSetupResult,
  targetAlias: string,
): FormlessCliCloudflareOAuthAccountSelectionInput {
  const details = setup.result?.details;

  if (!isPlainCliObject(details)) {
    throw new Error("Cloudflare account selection details were missing from credential setup.");
  }

  const credentialRef = stringCliField(details.credentialRef);
  const accounts = Array.isArray(details.accounts)
    ? details.accounts.map(parseDisplaySafeCliCloudflareOAuthAccount)
    : undefined;

  if (credentialRef === undefined || accounts === undefined) {
    throw new Error("Cloudflare account selection details were incomplete.");
  }

  return { accounts, credentialRef, targetAlias };
}

async function selectCliCloudflareOAuthAccount(
  input: FormlessCliCloudflareOAuthAccountSelectionInput,
  dependencies: Pick<
    FormlessCliWorkspacePushCredentialPreflightDependencies,
    "log" | "selectCloudflareAccount"
  >,
): Promise<string | null | undefined> {
  dependencies.log("Cloudflare account selection required:");

  input.accounts.forEach((account, index) => {
    dependencies.log(`  ${index + 1}. ${formatCliCloudflareOAuthAccount(account)}`);
  });

  const selector =
    dependencies.selectCloudflareAccount ??
    ((selection: FormlessCliCloudflareOAuthAccountSelectionInput) =>
      selectInteractiveCloudflareOAuthAccount(selection));

  return selector(input);
}

async function selectInteractiveCloudflareOAuthAccount(
  input: FormlessCliCloudflareOAuthAccountSelectionInput,
): Promise<string | null> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return null;
  }

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    while (true) {
      const answer = await readline.question(
        `Select Cloudflare account [1-${input.accounts.length}]: `,
      );
      const selectedAccount = cliCloudflareOAuthAccountForAnswer(input.accounts, answer);

      if (selectedAccount) {
        return selectedAccount.id;
      }

      console.log("Invalid Cloudflare account selection.");
    }
  } finally {
    readline.close();
  }
}

function cliCloudflareOAuthAccountForAnswer(
  accounts: readonly FormlessCloudflareOAuthAccount[],
  answer: string,
): FormlessCloudflareOAuthAccount | undefined {
  const trimmed = answer.trim();
  const selectedIndex = Number(trimmed);

  if (Number.isInteger(selectedIndex)) {
    return accounts[selectedIndex - 1];
  }

  return accounts.find((account) => account.id === trimmed);
}

function formatCliCloudflareOAuthNonInteractiveAccountSelectionError(
  input: FormlessCliCloudflareOAuthAccountSelectionInput,
): string {
  return [
    "Multiple Cloudflare accounts were found for the Formless OAuth credential.",
    "Run `formless push` from an interactive terminal and select one account before provider mutation.",
    `Target: ${input.targetAlias}.`,
    `Credential: ${input.credentialRef}.`,
    "Available accounts:",
    ...input.accounts.map(
      (account, index) => `  ${index + 1}. ${formatCliCloudflareOAuthAccount(account)}`,
    ),
  ].join("\n");
}

function formatCliCloudflareOAuthAccount(account: FormlessCloudflareOAuthAccount): string {
  return [
    `id=${account.id}`,
    ...(account.name === undefined ? [] : [`name=${account.name}`]),
    `workers.dev=${account.workersDevSubdomain}.workers.dev`,
  ].join(" ");
}

function parseDisplaySafeCliCloudflareOAuthAccount(value: unknown): FormlessCloudflareOAuthAccount {
  if (!isPlainCliObject(value)) {
    throw new Error("Cloudflare account selection details included an invalid account.");
  }

  const id = stringCliField(value.id);
  const name = stringCliField(value.name);
  const workersDevSubdomain = stringCliField(value.workersDevSubdomain);

  if (id === undefined || workersDevSubdomain === undefined) {
    throw new Error("Cloudflare account selection details included an incomplete account.");
  }

  return {
    id,
    ...(name === undefined ? {} : { name }),
    workersDevSubdomain,
  };
}

function isPlainCliObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringCliField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
