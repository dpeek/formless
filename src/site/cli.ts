import { spawn as nodeSpawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import packageJson from "../../package.json";
import {
  exportAppArchive as exportAppArchiveCommand,
  exportInstanceArchive as exportInstanceArchiveCommand,
  restoreAppArchive as restoreAppArchiveCommand,
  restorePortableArchive as restorePortableArchiveCommand,
  type ArchiveDiskWriteResult,
  type RestorePortableArchiveResult,
} from "./archive-workflows.ts";
import {
  cloudflareDomainClientFromEnv,
  type CloudflareDomainClient,
} from "./cloudflare-domain-client.ts";
import { formlessCliUsage, parseFormlessCliArgs } from "./cli-command.ts";
import type {
  ForgetInstanceDomainProviderRedirectIntentResponse,
  InstanceDomainProviderManualCleanupResponse,
  InstanceDomainProviderPlanResponse,
} from "../shared/domain-provider-api.ts";
import type { ForgetInstanceDomainMappingResponse } from "../shared/instance-domain-mappings.ts";
import { parseOwnerSetupToken, type OwnerSetupStatusResponse } from "../shared/protocol.ts";
import {
  nodeAlchemyDomainProviderRuntime,
  runFormlessInstanceDomainProviderDelete as runFormlessInstanceDomainProviderDeleteCommand,
  type RunFormlessInstanceDomainProviderDeleteDependencies,
  type RunFormlessInstanceDomainProviderDeleteInput,
  type RunFormlessInstanceDomainProviderDeleteResult,
} from "./domain-provider-runner.ts";
import type { InstanceWorkspaceTarget as FormlessInstanceWorkspaceTarget } from "@dpeek/formless-workspace";
import {
  INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME as FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME,
  INSTANCE_WORKSPACE_GITIGNORE_ENTRY as FORMLESS_INSTANCE_WORKSPACE_GITIGNORE_ENTRY,
  INSTANCE_WORKSPACE_SECRET_STATE_DIRECTORY as FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_DIRECTORY,
  INSTANCE_WORKSPACE_SECRET_STATE_FILE as FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_FILE,
  INSTANCE_WORKSPACE_SECRET_STATE_PATH as FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_PATH,
  ensureInstanceWorkspaceSecretStateIgnored as ensureFormlessInstanceWorkspaceSecretStateIgnored,
  formatInstanceWorkspaceSecretState as formatFormlessInstanceWorkspaceSecretState,
  instanceWorkspaceSecretStatePath as formlessInstanceWorkspaceSecretStatePath,
  parseInstanceWorkspaceSecretState as parseFormlessInstanceWorkspaceSecretState,
  readInstanceWorkspaceSecretState as readFormlessInstanceWorkspaceSecretState,
  resolveInstanceWorkspaceAdminToken as resolveFormlessInstanceWorkspaceAdminToken,
  writeInstanceWorkspaceSecretState as writeFormlessInstanceWorkspaceSecretState,
  type InstanceWorkspaceSecretState as FormlessInstanceWorkspaceSecretState,
  type WriteInstanceWorkspaceSecretStateResult as WriteFormlessInstanceWorkspaceSecretStateResult,
} from "@dpeek/formless-workspace/node";
import {
  adoptFormlessInstanceWorkspaceAdminToken as adoptFormlessInstanceWorkspaceAdminTokenCommand,
  checkFormlessInstanceWorkspace as checkFormlessInstanceWorkspaceCommand,
  destroyLocalFormlessWorkspace as destroyLocalFormlessWorkspaceCommand,
  destroyFormlessInstanceWorkspace as destroyFormlessInstanceWorkspaceCommand,
  deployLocalFormlessWorkspace as deployLocalFormlessWorkspaceCommand,
  deployFormlessInstanceWorkspace as deployFormlessInstanceWorkspaceCommand,
  getFormlessInstanceWorkspaceStatus as getFormlessInstanceWorkspaceStatusCommand,
  initFormlessInstanceWorkspace as initFormlessInstanceWorkspaceCommand,
  planFormlessInstanceWorkspaceDomains as planFormlessInstanceWorkspaceDomainsCommand,
  resolveFormlessInstanceWorkspaceProviderContext,
  resolveFormlessInstanceWorkspaceRoot as resolveFormlessInstanceWorkspaceRootCommand,
  resetFormlessInstanceWorkspaceLocalState as resetFormlessInstanceWorkspaceLocalStateCommand,
  runFormlessInstanceWorkspaceDev as runFormlessInstanceWorkspaceDevCommand,
  saveLocalFormlessWorkspace as saveLocalFormlessWorkspaceCommand,
  pullFormlessInstanceWorkspace as pullFormlessInstanceWorkspaceCommand,
  pushFormlessInstanceWorkspace as pushFormlessInstanceWorkspaceCommand,
  rotateFormlessInstanceWorkspaceAdminToken as rotateFormlessInstanceWorkspaceAdminTokenCommand,
  type AdoptFormlessInstanceWorkspaceAdminTokenResult,
  type CheckFormlessInstanceWorkspaceResult,
  type DestroyLocalFormlessWorkspaceInput,
  type DestroyFormlessInstanceWorkspaceInput,
  type DestroyFormlessInstanceWorkspaceResult,
  type DevFormlessInstanceWorkspaceDependencies,
  type DeployLocalFormlessWorkspaceInput,
  type DeployFormlessInstanceWorkspaceInput,
  type DeployFormlessInstanceWorkspaceResult,
  type FormlessInstanceWorkspaceDevCommand,
  type FormlessInstanceWorkspaceDevNameSelectionInput,
  type FormlessInstanceWorkspaceStatusResult,
  type FormlessInstanceWorkspaceProviderContext,
  type InitFormlessInstanceWorkspaceResult,
  type PlanFormlessInstanceWorkspaceDomainsInput,
  type PlanFormlessInstanceWorkspaceDomainsResult,
  type PullFormlessInstanceWorkspaceResult,
  type PushFormlessInstanceWorkspaceResult,
  type ResetFormlessInstanceWorkspaceLocalStateResult,
  type RotateFormlessInstanceWorkspaceAdminTokenResult,
  type SaveLocalFormlessWorkspaceInput,
  type SaveLocalFormlessWorkspaceResult,
} from "./instance-workspace.ts";
import { runFormlessWorkspaceOperation } from "./instance-workspace-operations.ts";
import {
  WORKSPACE_OPERATION_CAPABILITIES,
  assertWorkspaceOperationExecutionAllowed,
  workspaceOperationDefinitionForCliCommand,
  workspaceOperationInputDefaults,
  type RunnableWorkspaceOperationInput,
  type WorkspaceCliCommandName,
  type WorkspaceOperationDisplayObject,
  type WorkspaceOperationDisplayValue,
  type WorkspaceOperationState,
} from "@dpeek/formless-workspace";
import {
  forgetFormlessInstanceDomainMapping,
  forgetFormlessInstanceDomainProviderRedirect,
  markFormlessInstanceDomainProviderResourceManuallyRemoved,
  readFormlessInstanceDomainProviderPlan,
  readFormlessInstanceOwnerSetupStatus,
} from "./instance-target-client.ts";
import { requireSiteCliTargetContext } from "./instance-target-context.ts";
import { packageRunScriptCommand } from "./package-commands.ts";
import {
  alchemyFormlessInstanceAccountDiscoveryAdapter,
  alchemyFormlessInstanceDeploymentAdapter,
  fetchFormlessInstanceDeploymentHealthCheckAdapter,
  fetchFormlessInstanceOwnerSetupCapabilityAdapter,
  formatFormlessOwnerSetupUrl,
  ensureFormlessInstanceLocalSecretEnv,
  FORMLESS_HOME_DIRECTORY,
  FORMLESS_ALCHEMY_APP_NAME,
  writeFormlessInstanceState,
  type FormlessInstanceAccountDiscoveryAdapter,
  type FormlessInstanceDeploymentAdapter,
  type FormlessInstanceDeploymentHealthCheckAdapter,
  type FormlessInstanceLocalSecretEnvStore,
  type FormlessInstanceOwnerSetupCapabilityAdapter,
  type FormlessInstanceStateWriter,
} from "./instance-onboarding.ts";

export {
  formlessCliUsage,
  normalizeSourceUrl,
  parseFormlessCliArgs,
  type FormlessCliCommand,
} from "./cli-command.ts";
export {
  CF_API_TOKEN_ENV_NAME,
  CLOUDFLARE_API_TOKEN_ENV_NAME,
  cloudflareDomainClientFromEnv,
  createFetchCloudflareDomainClient,
  planCloudflareWorkerDomainPreflight,
  workerRoutePatternMatchesHost,
  type CloudflareDnsRecord,
  type CloudflareDomainClient,
  type CloudflareDomainIntent,
  type CloudflareDomainPreflightHostPlan,
  type CloudflareDomainPreflightIssue,
  type CloudflareDomainPreflightPlan,
  type CloudflareDomainPreflightPolicy,
  type CloudflareWorkerDomain,
  type CloudflareWorkerRoute,
  type CloudflareZone,
} from "./cloudflare-domain-client.ts";
export {
  ALCHEMY_STATE_TOKEN_ENV_NAME,
  nodeAlchemyDomainProviderRuntime,
  runFormlessInstanceDomainProviderDelete,
  type DomainProviderAlchemyRuntime,
  type RunFormlessInstanceDomainProviderDeleteInput,
  type RunFormlessInstanceDomainProviderDeleteResult,
} from "./domain-provider-runner.ts";
export {
  FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME,
  FORMLESS_INSTANCE_WORKSPACE_GITIGNORE_ENTRY,
  FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_DIRECTORY,
  FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_FILE,
  FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_PATH,
  ensureFormlessInstanceWorkspaceSecretStateIgnored,
  formlessInstanceWorkspaceSecretStatePath,
  formatFormlessInstanceWorkspaceSecretState,
  parseFormlessInstanceWorkspaceSecretState,
  readFormlessInstanceWorkspaceSecretState,
  resolveFormlessInstanceWorkspaceAdminToken,
  writeFormlessInstanceWorkspaceSecretState,
  type FormlessInstanceWorkspaceSecretState,
  type WriteFormlessInstanceWorkspaceSecretStateResult,
};
export {
  checkLocalFormlessWorkspace,
  discoverFormlessInstanceWorkspaceRoot,
  formlessInstanceWorkspaceDevEnv,
  formlessInstanceWorkspaceLocalStateRoot,
  formlessInstanceWorkspaceWranglerPersistPath,
  resolveFormlessInstanceWorkspaceProviderContext,
  resolveFormlessInstanceWorkspaceRoot,
  type AdoptFormlessInstanceWorkspaceAdminTokenDependencies,
  type AdoptFormlessInstanceWorkspaceAdminTokenInput,
  type AdoptFormlessInstanceWorkspaceAdminTokenResult,
  type CheckFormlessInstanceWorkspaceDependencies,
  type CheckFormlessInstanceWorkspaceInput,
  type CheckFormlessInstanceWorkspaceResult,
  type CheckLocalFormlessWorkspaceInput,
  type CheckLocalFormlessWorkspaceResult,
  type DestroyFormlessInstanceWorkspaceDependencies,
  type DestroyFormlessInstanceWorkspaceInput,
  type DestroyFormlessInstanceWorkspaceResult,
  type DestroyLocalFormlessWorkspaceDependencies,
  type DestroyLocalFormlessWorkspaceInput,
  type DeployFormlessInstanceWorkspaceDependencies,
  type DeployFormlessInstanceWorkspaceInput,
  type DeployFormlessInstanceWorkspaceResult,
  type DevFormlessInstanceWorkspaceDependencies,
  type DevFormlessInstanceWorkspaceInput,
  type FormlessInstanceWorkspaceStatusDependencies,
  type FormlessInstanceWorkspaceStatusInput,
  type FormlessInstanceWorkspaceStatusResult,
  type FormlessInstanceWorkspaceProviderContext,
  type FormlessInstanceWorkspaceDevCommand,
  type FormlessInstanceWorkspaceDevNameSelectionInput,
  type FormlessInstanceWorkspaceDiscoveryResult,
  type FormlessInstanceWorkspaceDriftSummary,
  type FormlessInstanceWorkspacePackageMismatch,
  type InitFormlessInstanceWorkspaceDependencies,
  type InitFormlessInstanceWorkspaceInput,
  type InitFormlessInstanceWorkspaceResult,
  type PullFormlessInstanceWorkspaceAppArchiveResult,
  type PlanFormlessInstanceWorkspaceDomainsDependencies,
  type PlanFormlessInstanceWorkspaceDomainsInput,
  type PlanFormlessInstanceWorkspaceDomainsResult,
  type PullFormlessInstanceWorkspaceDependencies,
  type PullFormlessInstanceWorkspaceInput,
  type PullFormlessInstanceWorkspaceResult,
  type PushFormlessInstanceWorkspaceDependencies,
  type PushFormlessInstanceWorkspaceInput,
  type PushFormlessInstanceWorkspaceResult,
  type ResetFormlessInstanceWorkspaceLocalStateDependencies,
  type ResetFormlessInstanceWorkspaceLocalStateInput,
  type ResetFormlessInstanceWorkspaceLocalStateResult,
  type RotateFormlessInstanceWorkspaceAdminTokenDependencies,
  type RotateFormlessInstanceWorkspaceAdminTokenInput,
  type RotateFormlessInstanceWorkspaceAdminTokenResult,
  type SaveLocalFormlessWorkspaceDependencies,
  type SaveLocalFormlessWorkspaceInput,
  type SaveLocalFormlessWorkspaceResult,
} from "./instance-workspace.ts";
export {
  readFormlessInstanceAppRegistry,
  readFormlessInstanceDeployMetadata,
  readFormlessInstanceDomainMappings,
  readFormlessInstanceOwnerSetupStatus,
  readFormlessInstanceTargetStatus,
  forgetFormlessInstanceDomainMapping,
  forgetFormlessInstanceDomainProviderRedirect,
  markFormlessInstanceDomainProviderResourceManuallyRemoved,
  type FormlessInstanceTargetClientDependencies,
  type FormlessInstanceTargetDeployMetadata,
  type FormlessInstanceTargetStatus,
} from "./instance-target-client.ts";
export {
  PORTABLE_ARCHIVE_MANIFEST_FILE,
  type ArchiveRestoreRemoteResult,
} from "./archive-workflows.ts";
export {
  ALCHEMY_PASSWORD_ENV_NAME,
  alchemyFormlessInstanceAccountDiscoveryAdapter,
  alchemyFormlessInstanceDeploymentAdapter,
  checkFormlessInstanceDeployMetadata,
  createFormlessInstanceState,
  DEFAULT_FORMLESS_INSTANCE_NAME,
  deployFormlessInstanceWithAlchemy,
  createFormlessInstanceOwnerSetupCapability,
  ensureFormlessInstanceLocalSecretEnv,
  fetchFormlessInstanceDeploymentHealthCheckAdapter,
  fetchFormlessInstanceOwnerSetupCapabilityAdapter,
  FORMLESS_ALCHEMY_APP_NAME,
  FORMLESS_HOME_DIRECTORY,
  FORMLESS_INSTANCE_DIRECTORY,
  FORMLESS_INSTANCE_LOCAL_ENV_FILE,
  FORMLESS_OWNER_SETUP_ROUTE_PATH,
  formatFormlessInstanceState,
  formlessInstanceStateRoot,
  formatFormlessOwnerSetupUrl,
  FORMLESS_WORKER_COMPATIBILITY_DATE,
  listFormlessInstanceAccountsWithAlchemy,
  normalizeFormlessInstanceName,
  parseFormlessInstanceState,
  parseFormlessInstanceStateJson,
  planFormlessInstanceDeployment,
  runFormlessInstanceOnboarding,
  selectOnlyFormlessInstanceAccount,
  writeFormlessInstanceState,
  type AlchemyFormlessInstanceAccountDiscoveryDependencies,
  type AlchemyFormlessInstanceDeploymentAppOptions,
  type AlchemyFormlessInstanceDeploymentDependencies,
  type AlchemyFormlessInstanceDeploymentWorkerProps,
  type CheckFormlessInstanceDeployMetadataDependencies,
  type CheckFormlessInstanceDeployMetadataInput,
  type CheckFormlessInstanceDeployMetadataResult,
  type CreateFormlessInstanceOwnerSetupCapabilityDependencies,
  type CreateFormlessInstanceOwnerSetupCapabilityInput,
  type CreateFormlessInstanceOwnerSetupCapabilityResult,
  type DeployFormlessInstanceInput,
  type DeployFormlessInstanceResult,
  type DestroyFormlessInstanceInput,
  type DestroyFormlessInstanceResourceStatus,
  type DestroyFormlessInstanceResourceSummary,
  type DestroyFormlessInstanceResult,
  type EnsureFormlessInstanceLocalSecretEnvDependencies,
  type EnsureFormlessInstanceLocalSecretEnvInput,
  type EnsureFormlessInstanceLocalSecretEnvResult,
  type FormlessInstanceAccountDiscoveryAdapter,
  type FormlessInstanceDeploymentAdapter,
  type FormlessInstanceDeploymentHealthCheckAdapter,
  type FormlessInstanceDeploymentPlan,
  type FormlessInstanceDeploymentSecrets,
  type FormlessInstanceLocalSecretEnv,
  type FormlessInstanceLocalSecretEnvStore,
  type FormlessInstanceOwnerSetupCapabilityAdapter,
  type FormlessInstanceState,
  type FormlessInstanceStateWriter,
  type ListFormlessInstanceAccountsInput,
  type RunFormlessInstanceOnboardingDependencies,
  type RunFormlessInstanceOnboardingInput,
  type RunFormlessInstanceOnboardingResult,
  type SelectFormlessInstanceAccountInput,
  type WriteFormlessInstanceStateDependencies,
  type WriteFormlessInstanceStateInput,
  type WriteFormlessInstanceStateResult,
} from "./instance-onboarding.ts";

export type FormlessCliRunCommandOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

export type FormlessCliDependencies = {
  accountDiscovery: FormlessInstanceAccountDiscoveryAdapter;
  cloudflareDomainClient: () => CloudflareDomainClient;
  cwd: string;
  deploymentAdapter: FormlessInstanceDeploymentAdapter;
  domainProviderDeleteRuntime?: RunFormlessInstanceDomainProviderDeleteDependencies["runtime"];
  env: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  healthCheck: FormlessInstanceDeploymentHealthCheckAdapter;
  localSecretEnv: FormlessInstanceLocalSecretEnvStore;
  log: (message: string) => void;
  now: () => string;
  openBrowser: (url: string) => Promise<void>;
  packageRoot: string;
  randomToken: () => string;
  runCommand: (
    command: string,
    args: string[],
    options: FormlessCliRunCommandOptions,
  ) => Promise<void>;
  selectWorkspaceName?: (
    input: FormlessInstanceWorkspaceDevNameSelectionInput,
  ) => Promise<string | null | undefined>;
  spawn: typeof nodeSpawn;
  startWorkspaceGatewaySidecar?: DevFormlessInstanceWorkspaceDependencies["startWorkspaceGatewaySidecar"];
  stateRoot: string;
  stateWriter: FormlessInstanceStateWriter;
  setupCapability: FormlessInstanceOwnerSetupCapabilityAdapter;
};

async function resolveTopLevelFormlessWorkspacePath(
  input: { workspacePath?: string | null },
  dependencies: Pick<FormlessCliDependencies, "cwd">,
): Promise<string> {
  return resolveFormlessInstanceWorkspaceRootCommand({
    cwd: dependencies.cwd,
    workspacePath: input.workspacePath,
  });
}

async function resolveTopLevelFormlessWorkspaceDevPath(
  input: { workspacePath?: string | null },
  dependencies: Pick<FormlessCliDependencies, "cwd">,
): Promise<string> {
  try {
    return await resolveTopLevelFormlessWorkspacePath(input, dependencies);
  } catch (error) {
    if (
      (input.workspacePath === undefined || input.workspacePath === null) &&
      error instanceof Error &&
      error.message.includes("Could not find formless.json")
    ) {
      return path.resolve(dependencies.cwd);
    }

    throw error;
  }
}

export async function runFormlessCli(
  args: string[],
  dependencies: FormlessCliDependencies = nodeFormlessCliDependencies(),
) {
  const command = parseFormlessCliArgs(args);

  switch (command.kind) {
    case "help":
      dependencies.log(formlessCliUsage());
      return;
    case "workspaceDev": {
      const workspacePath = await resolveTopLevelFormlessWorkspaceDevPath(command, dependencies);
      await runFormlessInstanceWorkspaceDev(
        {
          open: command.open,
          workspacePath,
        },
        dependencies,
        {
          devCommand: packageRunScriptCommand("dev", dependencies.env),
        },
      );
      return;
    }
    case "workspaceSave": {
      const result = await runCliWorkspaceOperation(
        "formless save",
        {
          check: command.check,
          kind: "save",
          workspacePath: command.workspacePath,
        },
        dependencies,
      );
      dependencies.log(formatCliWorkspaceOperationResult(result));
      return;
    }
    case "workspacePull": {
      const result = await runCliWorkspaceOperation(
        "formless pull",
        {
          kind: "pull",
          targetAlias: command.targetAlias,
          workspacePath: command.workspacePath,
        },
        dependencies,
      );
      dependencies.log(formatCliWorkspaceOperationResult(result));
      return;
    }
    case "workspacePush": {
      const result = await runCliWorkspaceOperation(
        "formless push",
        {
          allowStale: command.allowStale,
          apply: command.apply,
          kind: "push",
          replace: command.replace,
          replaceInstallSet: command.replaceInstallSet,
          targetAlias: command.targetAlias,
          workspacePath: command.workspacePath,
        },
        dependencies,
      );
      dependencies.log(formatCliWorkspaceOperationResult(result));
      return;
    }
    case "workspaceDeploy": {
      const result = await runCliWorkspaceOperation(
        command.dryRun ? "formless deploy --dry-run" : "formless deploy",
        {
          kind: command.dryRun ? "deployPlan" : "deployApply",
          migrationPolicy: command.migrationPolicy,
          targetAlias: command.targetAlias,
          workspacePath: command.workspacePath,
        },
        dependencies,
      );
      dependencies.log(formatCliWorkspaceOperationResult(result));
      return;
    }
    case "workspaceDestroy": {
      const result = await destroyLocalFormlessWorkspace(
        {
          confirm: command.confirm,
          targetAlias: command.targetAlias,
          workspacePath: await resolveTopLevelFormlessWorkspacePath(command, dependencies),
        },
        dependencies,
      );
      dependencies.log(formatInstanceWorkspaceDestroyResult(result, dependencies.cwd));
      return;
    }
    case "workspaceTokenAdopt": {
      const result = await adoptFormlessInstanceWorkspaceAdminToken(
        {
          adminToken: command.adminToken,
          targetAlias: command.targetAlias,
          workspacePath: command.workspacePath ?? undefined,
        },
        dependencies,
      );
      dependencies.log(formatInstanceWorkspaceTokenAdoptResult(result, dependencies.cwd));
      return;
    }
    case "workspaceTokenRotate": {
      const result = await rotateFormlessInstanceWorkspaceAdminToken(
        {
          adminToken: command.adminToken,
          targetAlias: command.targetAlias,
          workspacePath: command.workspacePath ?? undefined,
        },
        dependencies,
      );
      dependencies.log(formatInstanceWorkspaceTokenRotateResult(result, dependencies.cwd));
      return;
    }
    case "workspaceOwnerSetup": {
      const result = await setupFormlessInstanceOwner(
        {
          adminToken: command.adminToken,
          open: command.open,
          targetAlias: command.targetAlias,
          workspacePath: command.workspacePath ?? undefined,
        },
        dependencies,
      );
      dependencies.log(formatInstanceOwnerSetupResult(result, dependencies.cwd));
      return;
    }
  }
}

async function runCliWorkspaceOperation(
  commandName: WorkspaceCliCommandName,
  input: RunnableWorkspaceOperationInput,
  dependencies: FormlessCliDependencies,
): Promise<WorkspaceOperationState> {
  const operationInput = workspaceOperationInputForCliCommand(commandName, input);
  const state = await runFormlessWorkspaceOperation(
    operationInput,
    {
      ...dependencies,
      packageVersion: packageJson.version,
    },
    { actor: "cli", capabilities: WORKSPACE_OPERATION_CAPABILITIES },
  );

  if (state.status === "failed") {
    throw new Error(state.errors[0]?.message ?? "Workspace operation failed.");
  }

  return state;
}

function workspaceOperationInputForCliCommand(
  commandName: WorkspaceCliCommandName,
  input: RunnableWorkspaceOperationInput,
): RunnableWorkspaceOperationInput {
  const definition = workspaceOperationDefinitionForCliCommand(commandName);

  if (definition.kind !== input.kind) {
    throw new Error(
      `Workspace CLI command "${commandName}" is bound to operation "${definition.kind}", expected "${input.kind}".`,
    );
  }

  assertWorkspaceOperationExecutionAllowed({
    actor: "cli",
    capabilities: WORKSPACE_OPERATION_CAPABILITIES,
    kind: definition.kind,
  });

  return {
    ...workspaceOperationInputDefaults(definition.kind),
    ...input,
  } as RunnableWorkspaceOperationInput;
}

export async function exportInstanceArchive(
  input: { outDir: string; target: string },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "fetch" | "now"
  > = nodeFormlessCliDependencies(),
): Promise<ArchiveDiskWriteResult> {
  return exportInstanceArchiveCommand(input, dependencies);
}

export async function exportAppArchive(
  input: { installId: string; outDir: string; target: string },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "fetch" | "now"
  > = nodeFormlessCliDependencies(),
): Promise<ArchiveDiskWriteResult> {
  return exportAppArchiveCommand(input, dependencies);
}

export async function restorePortableArchive(
  input: {
    adminToken?: string | null;
    apply: boolean;
    archiveDir: string;
    replace: boolean;
    target: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "fetch" | "now"
  > = nodeFormlessCliDependencies(),
): Promise<RestorePortableArchiveResult> {
  return restorePortableArchiveCommand(input, dependencies);
}

export async function restoreAppArchive(
  input: {
    adminToken?: string | null;
    apply: boolean;
    archiveDir: string;
    installId: string;
    replace: boolean;
    target: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "fetch" | "now"
  > = nodeFormlessCliDependencies(),
): Promise<RestorePortableArchiveResult> {
  return restoreAppArchiveCommand(input, dependencies);
}

export async function initFormlessInstanceWorkspace(
  input: {
    fromArchive?: string | null;
    fromRemote?: boolean;
    name?: string | null;
    targetAlias?: string;
    targetUrl?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<FormlessCliDependencies, "cwd" | "fetch"> = nodeFormlessCliDependencies(),
): Promise<InitFormlessInstanceWorkspaceResult> {
  return initFormlessInstanceWorkspaceCommand(input, dependencies);
}

export async function getFormlessInstanceWorkspaceStatus(
  input: {
    adminToken?: string | null;
    includeDeploymentStatus?: boolean;
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "fetch"
  > = nodeFormlessCliDependencies(),
): Promise<FormlessInstanceWorkspaceStatusResult> {
  return getFormlessInstanceWorkspaceStatusCommand(input, dependencies);
}

export async function pullFormlessInstanceWorkspace(
  input: {
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "fetch" | "now"
  > = nodeFormlessCliDependencies(),
): Promise<PullFormlessInstanceWorkspaceResult> {
  return pullFormlessInstanceWorkspaceCommand(input, dependencies);
}

export async function checkFormlessInstanceWorkspace(
  input: {
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "fetch" | "now"
  > = nodeFormlessCliDependencies(),
): Promise<CheckFormlessInstanceWorkspaceResult> {
  return checkFormlessInstanceWorkspaceCommand(input, dependencies);
}

export async function saveLocalFormlessWorkspace(
  input: SaveLocalFormlessWorkspaceInput,
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "fetch" | "now"
  > = nodeFormlessCliDependencies(),
): Promise<SaveLocalFormlessWorkspaceResult> {
  return saveLocalFormlessWorkspaceCommand(input, dependencies);
}

export async function pushFormlessInstanceWorkspace(
  input: {
    allowStale?: boolean;
    apply?: boolean;
    replace?: boolean;
    replaceInstallSet?: boolean;
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "fetch" | "now"
  > = nodeFormlessCliDependencies(),
): Promise<PushFormlessInstanceWorkspaceResult> {
  return pushFormlessInstanceWorkspaceCommand(input, dependencies);
}

export async function runFormlessInstanceWorkspaceDev(
  input: {
    open?: boolean;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    | "accountDiscovery"
    | "cwd"
    | "deploymentAdapter"
    | "env"
    | "fetch"
    | "healthCheck"
    | "localSecretEnv"
    | "log"
    | "now"
    | "openBrowser"
    | "packageRoot"
    | "randomToken"
    | "selectWorkspaceName"
    | "setupCapability"
    | "spawn"
    | "startWorkspaceGatewaySidecar"
  > = nodeFormlessCliDependencies(),
  options: {
    devCommand?: FormlessInstanceWorkspaceDevCommand;
  } = {},
): Promise<void> {
  return runFormlessInstanceWorkspaceDevCommand(input, {
    ...dependencies,
    devCommand: options.devCommand ?? packageRunScriptCommand("dev", dependencies.env),
    packageVersion: packageJson.version,
  });
}

export async function resetFormlessInstanceWorkspaceLocalState(
  input: {
    workspacePath?: string;
  },
  dependencies: Pick<FormlessCliDependencies, "cwd"> = nodeFormlessCliDependencies(),
): Promise<ResetFormlessInstanceWorkspaceLocalStateResult> {
  return resetFormlessInstanceWorkspaceLocalStateCommand(input, dependencies);
}

export async function deployFormlessInstanceWorkspace(
  input: DeployFormlessInstanceWorkspaceInput,
  dependencies: Pick<
    FormlessCliDependencies,
    | "cwd"
    | "deploymentAdapter"
    | "env"
    | "healthCheck"
    | "localSecretEnv"
    | "packageRoot"
    | "randomToken"
  > = nodeFormlessCliDependencies(),
): Promise<DeployFormlessInstanceWorkspaceResult> {
  return deployFormlessInstanceWorkspaceCommand(input, {
    cwd: dependencies.cwd,
    deploymentAdapter: dependencies.deploymentAdapter,
    env: dependencies.env,
    healthCheck: dependencies.healthCheck,
    localSecretEnv: dependencies.localSecretEnv,
    packageRoot: dependencies.packageRoot,
    packageVersion: packageJson.version,
    randomToken: dependencies.randomToken,
  });
}

export async function deployLocalFormlessWorkspace(
  input: DeployLocalFormlessWorkspaceInput,
  dependencies: Pick<
    FormlessCliDependencies,
    | "accountDiscovery"
    | "cwd"
    | "deploymentAdapter"
    | "env"
    | "fetch"
    | "healthCheck"
    | "localSecretEnv"
    | "now"
    | "packageRoot"
    | "randomToken"
    | "setupCapability"
  > = nodeFormlessCliDependencies(),
): Promise<DeployFormlessInstanceWorkspaceResult> {
  return deployLocalFormlessWorkspaceCommand(input, {
    accountDiscovery: dependencies.accountDiscovery,
    cwd: dependencies.cwd,
    deploymentAdapter: dependencies.deploymentAdapter,
    env: dependencies.env,
    fetch: dependencies.fetch,
    healthCheck: dependencies.healthCheck,
    localSecretEnv: dependencies.localSecretEnv,
    now: dependencies.now,
    packageRoot: dependencies.packageRoot,
    packageVersion: packageJson.version,
    randomToken: dependencies.randomToken,
    setupCapability: dependencies.setupCapability,
  });
}

export async function destroyFormlessInstanceWorkspace(
  input: DestroyFormlessInstanceWorkspaceInput,
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "deploymentAdapter" | "env" | "packageRoot"
  > = nodeFormlessCliDependencies(),
): Promise<DestroyFormlessInstanceWorkspaceResult> {
  return destroyFormlessInstanceWorkspaceCommand(input, {
    cwd: dependencies.cwd,
    deploymentAdapter: dependencies.deploymentAdapter,
    env: dependencies.env,
    packageRoot: dependencies.packageRoot,
    packageVersion: packageJson.version,
  });
}

export async function destroyLocalFormlessWorkspace(
  input: DestroyLocalFormlessWorkspaceInput,
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "deploymentAdapter" | "env" | "packageRoot"
  > = nodeFormlessCliDependencies(),
): Promise<DestroyFormlessInstanceWorkspaceResult> {
  return destroyLocalFormlessWorkspaceCommand(input, {
    cwd: dependencies.cwd,
    deploymentAdapter: dependencies.deploymentAdapter,
    env: dependencies.env,
    packageRoot: dependencies.packageRoot,
    packageVersion: packageJson.version,
  });
}

export type PlanFormlessInstanceDomainProviderResult = {
  plan: InstanceDomainProviderPlanResponse;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type ForgetFormlessInstanceDomainRouteResult = {
  response: ForgetInstanceDomainMappingResponse;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type ForgetFormlessInstanceDomainRedirectResult = {
  response: ForgetInstanceDomainProviderRedirectIntentResponse;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type MarkFormlessInstanceDomainProviderResourceManuallyRemovedResult = {
  response: InstanceDomainProviderManualCleanupResponse;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type SetupFormlessInstanceOwnerResult = {
  opened: boolean;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  setupStatus: OwnerSetupStatusResponse;
  setupUrl?: string;
  workspaceRoot: string;
};

export async function setupFormlessInstanceOwner(
  input: {
    adminToken?: string | null;
    open?: boolean;
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "fetch" | "openBrowser" | "randomToken" | "setupCapability"
  > = nodeFormlessCliDependencies(),
): Promise<SetupFormlessInstanceOwnerResult> {
  const context = await requireSiteCliTargetContext(
    {
      commandName: "owner setup",
      cwd: dependencies.cwd,
      explicitAdminToken: input.adminToken,
      targetAlias: input.targetAlias,
      workspacePath: input.workspacePath,
    },
    { env: dependencies.env },
  );
  const setupStatus = await readFormlessInstanceOwnerSetupStatus(
    { targetUrl: context.targetUrl },
    { fetch: dependencies.fetch },
  );

  if (setupStatus.setupComplete) {
    return {
      opened: false,
      selectedTarget: context.selectedTarget,
      setupStatus,
      workspaceRoot: context.workspaceRoot,
    };
  }

  if (!context.adminToken) {
    throw new Error(
      "Formless owner setup requires an admin token; run `formless token adopt` or pass --admin-token.",
    );
  }

  const setupToken = generatedCliOwnerSetupToken(dependencies.randomToken);

  await dependencies.setupCapability.create({
    adminToken: context.adminToken,
    deploymentUrl: context.targetUrl,
    setupToken,
  });

  const setupUrl = formatFormlessOwnerSetupUrl({
    deploymentUrl: context.targetUrl,
    setupToken,
  });

  if (input.open) {
    await dependencies.openBrowser(setupUrl);
  }

  return {
    opened: input.open === true,
    selectedTarget: context.selectedTarget,
    setupStatus,
    setupUrl,
    workspaceRoot: context.workspaceRoot,
  };
}

export async function planFormlessInstanceDomainProviderFromWorkspace(
  input: {
    host?: string | null;
    policy?: PlanFormlessInstanceWorkspaceDomainsInput["policy"];
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "fetch"
  > = nodeFormlessCliDependencies(),
): Promise<PlanFormlessInstanceDomainProviderResult> {
  const context = await requireSiteCliTargetContext(
    {
      commandName: "domains remote-plan",
      cwd: dependencies.cwd,
      targetAlias: input.targetAlias,
      workspacePath: input.workspacePath,
    },
    { env: dependencies.env },
  );

  return {
    plan: await readFormlessInstanceDomainProviderPlan(
      {
        adminToken: context.adminToken,
        host: input.host,
        policy: input.policy,
        targetUrl: context.targetUrl,
      },
      dependencies,
    ),
    selectedTarget: context.selectedTarget,
    workspaceRoot: context.workspaceRoot,
  };
}

export async function planFormlessInstanceWorkspaceDomains(
  input: {
    host?: string | null;
    policy?: PlanFormlessInstanceWorkspaceDomainsInput["policy"];
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cloudflareDomainClient" | "cwd" | "env" | "fetch"
  > = nodeFormlessCliDependencies(),
): Promise<PlanFormlessInstanceWorkspaceDomainsResult> {
  return planFormlessInstanceWorkspaceDomainsCommand(input, {
    cloudflareDomainClient: dependencies.cloudflareDomainClient(),
    cwd: dependencies.cwd,
    env: dependencies.env,
    fetch: dependencies.fetch,
  });
}

export async function runFormlessInstanceDomainProviderDeleteFromWorkspace(
  input: {
    adminToken?: string | null;
    host: string;
    logicalId: string;
    resourceKind: RunFormlessInstanceDomainProviderDeleteInput["kind"];
    runnerId?: string | null;
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "domainProviderDeleteRuntime" | "env" | "fetch" | "randomToken"
  > = nodeFormlessCliDependencies(),
): Promise<RunFormlessInstanceDomainProviderDeleteResult> {
  const status = await getFormlessInstanceWorkspaceStatus(
    {
      targetAlias: input.targetAlias,
      workspacePath: input.workspacePath,
    },
    {
      cwd: dependencies.cwd,
      env: dependencies.env,
      fetch: dependencies.fetch,
    },
  );

  if (!status.selectedTarget) {
    throw new Error("Formless instance domains run-delete requires a selected target.");
  }

  const adminToken = await requireFormlessInstanceDomainCommandAdminToken(
    {
      explicitAdminToken: input.adminToken,
      workspaceRoot: status.workspaceRoot,
    },
    dependencies,
    "run-delete",
  );
  const providerContext = await resolveFormlessInstanceWorkspaceProviderContext(
    {
      commandName: "domains run",
      targetAlias: input.targetAlias,
      workspacePath: status.workspaceRoot,
    },
    {
      cwd: dependencies.cwd,
      env: dependencies.env,
      packageVersion: packageJson.version,
    },
  );

  return runFormlessInstanceDomainProviderDeleteCommand(
    {
      adminToken,
      host: input.host,
      kind: input.resourceKind,
      logicalId: input.logicalId,
      runnerId: input.runnerId,
      targetUrl: status.selectedTarget.url,
    },
    {
      createRunnerId: () => `formless-cli-${dependencies.randomToken()}`,
      env: dependencies.env,
      fetch: dependencies.fetch,
      ...(dependencies.domainProviderDeleteRuntime === undefined
        ? { runtime: workspaceDomainProviderAlchemyRuntime(providerContext) }
        : { runtime: dependencies.domainProviderDeleteRuntime }),
    },
  );
}

export function workspaceDomainProviderAlchemyRuntime(
  context: FormlessInstanceWorkspaceProviderContext,
  createRuntime: typeof nodeAlchemyDomainProviderRuntime = nodeAlchemyDomainProviderRuntime,
): RunFormlessInstanceDomainProviderDeleteDependencies["runtime"] {
  return ({ accountId, env }) =>
    createRuntime({
      accountId,
      appName: FORMLESS_ALCHEMY_APP_NAME,
      env: workspaceDomainProviderEnv(env, context),
      rootDir: context.deploymentStateRoot,
      stage: context.plan.instanceName,
    });
}

function workspaceDomainProviderEnv(
  env: NodeJS.ProcessEnv,
  context: FormlessInstanceWorkspaceProviderContext,
): NodeJS.ProcessEnv {
  return {
    ...env,
    ALCHEMY_PASSWORD: context.secrets.ALCHEMY_PASSWORD,
    ...(context.credentialProfile === null ? {} : { ALCHEMY_PROFILE: context.credentialProfile }),
    ...(context.secrets.CLOUDFLARE_API_TOKEN === undefined
      ? {}
      : { CLOUDFLARE_API_TOKEN: context.secrets.CLOUDFLARE_API_TOKEN }),
  };
}

export async function forgetFormlessInstanceDomainRouteFromWorkspace(
  input: {
    adminToken?: string | null;
    host: string;
    profile: ForgetFormlessInstanceDomainRouteResult["response"]["mapping"]["profile"];
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "fetch"
  > = nodeFormlessCliDependencies(),
): Promise<ForgetFormlessInstanceDomainRouteResult> {
  const status = await getFormlessInstanceWorkspaceStatus(
    {
      targetAlias: input.targetAlias,
      workspacePath: input.workspacePath,
    },
    {
      cwd: dependencies.cwd,
      env: dependencies.env,
      fetch: dependencies.fetch,
    },
  );

  if (!status.selectedTarget) {
    throw new Error("Formless instance domains forget-route requires a selected target.");
  }

  const adminToken = await requireFormlessInstanceDomainCommandAdminToken(
    {
      explicitAdminToken: input.adminToken,
      workspaceRoot: status.workspaceRoot,
    },
    dependencies,
    "forget-route",
  );

  return {
    response: await forgetFormlessInstanceDomainMapping(
      {
        adminToken,
        request: {
          host: input.host,
          profile: input.profile,
        },
        targetUrl: status.selectedTarget.url,
      },
      dependencies,
    ),
    selectedTarget: status.selectedTarget,
    workspaceRoot: status.workspaceRoot,
  };
}

export async function forgetFormlessInstanceDomainRedirectFromWorkspace(
  input: {
    adminToken?: string | null;
    fromHost: string;
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "fetch"
  > = nodeFormlessCliDependencies(),
): Promise<ForgetFormlessInstanceDomainRedirectResult> {
  const status = await getFormlessInstanceWorkspaceStatus(
    {
      targetAlias: input.targetAlias,
      workspacePath: input.workspacePath,
    },
    {
      cwd: dependencies.cwd,
      env: dependencies.env,
      fetch: dependencies.fetch,
    },
  );

  if (!status.selectedTarget) {
    throw new Error("Formless instance domains forget-redirect requires a selected target.");
  }

  const adminToken = await requireFormlessInstanceDomainCommandAdminToken(
    {
      explicitAdminToken: input.adminToken,
      workspaceRoot: status.workspaceRoot,
    },
    dependencies,
    "forget-redirect",
  );

  return {
    response: await forgetFormlessInstanceDomainProviderRedirect(
      {
        adminToken,
        request: {
          fromHost: input.fromHost,
        },
        targetUrl: status.selectedTarget.url,
      },
      dependencies,
    ),
    selectedTarget: status.selectedTarget,
    workspaceRoot: status.workspaceRoot,
  };
}

export async function markFormlessInstanceDomainProviderResourceManuallyRemovedFromWorkspace(
  input: {
    adminToken?: string | null;
    host: string;
    logicalId: string;
    resourceKind: MarkFormlessInstanceDomainProviderResourceManuallyRemovedResult["response"]["target"]["kind"];
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "fetch"
  > = nodeFormlessCliDependencies(),
): Promise<MarkFormlessInstanceDomainProviderResourceManuallyRemovedResult> {
  const status = await getFormlessInstanceWorkspaceStatus(
    {
      targetAlias: input.targetAlias,
      workspacePath: input.workspacePath,
    },
    {
      cwd: dependencies.cwd,
      env: dependencies.env,
      fetch: dependencies.fetch,
    },
  );

  if (!status.selectedTarget) {
    throw new Error("Formless instance domains mark-manually-removed requires a selected target.");
  }

  const adminToken = await requireFormlessInstanceDomainCommandAdminToken(
    {
      explicitAdminToken: input.adminToken,
      workspaceRoot: status.workspaceRoot,
    },
    dependencies,
    "mark-manually-removed",
  );

  return {
    response: await markFormlessInstanceDomainProviderResourceManuallyRemoved(
      {
        adminToken,
        request: {
          host: input.host,
          kind: input.resourceKind,
          logicalId: input.logicalId,
        },
        targetUrl: status.selectedTarget.url,
      },
      dependencies,
    ),
    selectedTarget: status.selectedTarget,
    workspaceRoot: status.workspaceRoot,
  };
}

async function requireFormlessInstanceDomainCommandAdminToken(
  input: { explicitAdminToken?: string | null; workspaceRoot: string },
  dependencies: Pick<FormlessCliDependencies, "env">,
  commandName: "forget-redirect" | "forget-route" | "mark-manually-removed" | "run-delete",
): Promise<string> {
  const secretState = await readFormlessInstanceWorkspaceSecretState(input.workspaceRoot);
  const adminToken = resolveFormlessInstanceWorkspaceAdminToken({
    env: dependencies.env,
    explicitAdminToken: input.explicitAdminToken,
    secretState,
  });

  if (!adminToken) {
    throw new Error(
      `Formless instance domains ${commandName} requires an admin token; run \`formless instance token adopt\` or pass --admin-token.`,
    );
  }

  return adminToken;
}

export async function adoptFormlessInstanceWorkspaceAdminToken(
  input: {
    adminToken?: string | null;
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<FormlessCliDependencies, "cwd" | "env"> = nodeFormlessCliDependencies(),
): Promise<AdoptFormlessInstanceWorkspaceAdminTokenResult> {
  return adoptFormlessInstanceWorkspaceAdminTokenCommand(input, dependencies);
}

export async function rotateFormlessInstanceWorkspaceAdminToken(
  input: {
    adminToken?: string | null;
    targetAlias?: string | null;
    workspacePath?: string;
  },
  dependencies: Pick<
    FormlessCliDependencies,
    "cwd" | "env" | "packageRoot" | "randomToken" | "runCommand"
  > = nodeFormlessCliDependencies(),
): Promise<RotateFormlessInstanceWorkspaceAdminTokenResult> {
  return rotateFormlessInstanceWorkspaceAdminTokenCommand(input, dependencies);
}

function runCommandWithSpawn(
  spawn: typeof nodeSpawn,
  command: string,
  args: string[],
  options: FormlessCliRunCommandOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `${command} ${args.join(" ")} exited with signal ${signal}.`
            : `${command} ${args.join(" ")} exited with code ${code ?? "unknown"}.`,
        ),
      );
    });
  });
}

function formatCliWorkspaceOperationResult(state: WorkspaceOperationState): string {
  return [
    `Workspace operation: ${formatWorkspaceOperationLabel(state.operation)} (${state.status}).`,
    "Workspace source: layout-only manifest, storage snapshots, media payloads.",
    `Summary: ${state.summary.title}.`,
    ...formatCliDisplayFields(state.summary.fields),
    ...(state.result?.details === undefined
      ? []
      : ["Details:", ...formatCliDisplayFields(state.result.details)]),
    ...(state.result?.deployment === undefined
      ? []
      : ["Deployment execution summary:", ...formatCliDisplayFields(state.result.deployment)]),
  ].join("\n");
}

function formatWorkspaceOperationLabel(operation: WorkspaceOperationState["operation"]) {
  switch (operation) {
    case "credentialSetup":
      return "credential setup";
    case "deployApply":
      return "deploy apply";
    case "deployPlan":
      return "deploy plan";
    case "deploymentRefresh":
      return "deployment refresh";
    default:
      return operation;
  }
}

function formatCliDisplayFields(fields: WorkspaceOperationDisplayObject): string[] {
  return Object.entries(fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}: ${formatCliDisplayValue(value)}.`);
}

function formatCliDisplayValue(value: WorkspaceOperationDisplayValue): string {
  if (value === null) {
    return "none";
  }

  if (Array.isArray(value)) {
    return value.length === 0
      ? "none"
      : value.map((entry) => formatCliDisplayValue(entry)).join(", ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatInstanceWorkspaceTokenAdoptResult(
  result: AdoptFormlessInstanceWorkspaceAdminTokenResult,
  cwd: string,
): string {
  return [
    "Instance workspace admin token adopted.",
    `Workspace: ${formatCliPath(cwd, result.workspaceRoot)}.`,
    `Secret state: ${formatCliPath(cwd, result.secretPath)}.`,
    `Target: ${formatSelectedTarget(result.selectedTarget)}.`,
  ].join("\n");
}

function formatInstanceWorkspaceTokenRotateResult(
  result: RotateFormlessInstanceWorkspaceAdminTokenResult,
  cwd: string,
): string {
  return [
    "Instance workspace admin token rotated.",
    `Workspace: ${formatCliPath(cwd, result.workspaceRoot)}.`,
    `Secret state: ${formatCliPath(cwd, result.secretPath)}.`,
    `Worker: ${result.workerName}.`,
    `Target: ${formatSelectedTarget(result.selectedTarget)}.`,
  ].join("\n");
}

function formatInstanceOwnerSetupResult(
  result: SetupFormlessInstanceOwnerResult,
  cwd: string,
): string {
  return [
    result.setupUrl
      ? "Instance owner setup URL created."
      : "Instance owner setup already complete.",
    `Workspace: ${formatCliPath(cwd, result.workspaceRoot)}.`,
    `Target: ${formatSelectedTarget(result.selectedTarget)}.`,
    `Owner setup: ${formatOwnerSetup(result.setupStatus)}.`,
    result.setupUrl ? `Setup URL: ${result.setupUrl}.` : null,
    result.setupUrl ? `Browser opened: ${result.opened ? "yes" : "no"}.` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function formatInstanceWorkspaceDestroyResult(
  result: DestroyFormlessInstanceWorkspaceResult,
  cwd: string,
): string {
  const resources = result.destroy.resources;

  return [
    "Instance workspace destroyed.",
    `Workspace: ${formatCliPath(cwd, result.workspaceRoot)}.`,
    `Target: ${formatSelectedTarget(result.selectedTarget)}.`,
    `Worker: ${result.plan.resources.worker.name}.`,
    `Durable Object namespace: ${result.plan.resources.authority.namespaceName}.`,
    `Media bucket: ${result.plan.resources.mediaBucket.name}.`,
    `Route provider resources: ${formatDestroyRouteProviderResources(
      result.routeProviderResources,
    )}.`,
    `Destroyed resources: Worker ${resources.worker}, Durable Object namespace ${resources.durableObjectNamespace}, R2 media bucket ${resources.mediaBucket}, Turnstile widget ${resources.turnstileWidget}, Worker assets ${resources.workerAssets}, Worker secrets ${resources.workerSecrets}, custom domains ${resources.customDomains}, DNS records ${resources.dnsRecords}, Alchemy state ${resources.alchemyState}.`,
    `Ignored deploy state: ${formatCliPath(cwd, result.deploymentStateRoot)}.`,
    `Deployment facts: ${formatCliPath(cwd, result.deploymentStatePath)}.`,
    `Local deploy secrets: ${formatCliPath(cwd, result.localSecretPath)}.`,
  ].join("\n");
}

function formatDestroyRouteProviderResources(
  resources: DestroyFormlessInstanceWorkspaceResult["routeProviderResources"],
): string {
  if (resources.resourceCount === 0) {
    return "none";
  }

  return `${resources.resourceCount} provider resource${
    resources.resourceCount === 1 ? "" : "s"
  } from ${resources.routeCount} route${resources.routeCount === 1 ? "" : "s"} (${
    resources.source
  }; ${resources.enabledHosts.length === 0 ? "no hosts" : resources.enabledHosts.join(", ")})`;
}

function formatSelectedTarget(target: FormlessInstanceWorkspaceTarget | undefined): string {
  return target ? `${target.alias} (${target.url})` : "<none>";
}

function formatOwnerSetup(status: {
  owner?: { email?: string; name: string };
  setupComplete: boolean;
}) {
  if (!status.setupComplete) {
    return "incomplete";
  }

  const owner = status.owner;

  if (!owner) {
    return "complete";
  }

  return owner.email ? `complete (${owner.name} <${owner.email}>)` : `complete (${owner.name})`;
}

function generatedCliOwnerSetupToken(randomToken: () => string): string {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return parseOwnerSetupToken(randomToken());
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function formatCliPath(cwd: string, filePath: string): string {
  const relativePath = path.relative(cwd, filePath);

  if (relativePath === "") {
    return ".";
  }

  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return filePath;
  }

  return relativePath;
}

function openUrlWithSpawn(spawn: typeof nodeSpawn, url: string): Promise<void> {
  const command = browserOpenCommand(process.platform, url);

  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      stdio: "ignore",
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `${command.command} ${command.args.join(" ")} exited with signal ${signal}.`
            : `${command.command} ${command.args.join(" ")} exited with code ${code ?? "unknown"}.`,
        ),
      );
    });
  });
}

function browserOpenCommand(
  platform: NodeJS.Platform,
  url: string,
): { args: string[]; command: string } {
  if (platform === "darwin") {
    return { args: [url], command: "open" };
  }

  if (platform === "win32") {
    return { args: ["/c", "start", "", url], command: "cmd" };
  }

  return { args: [url], command: "xdg-open" };
}

function nodeFormlessCliDependencies(): FormlessCliDependencies {
  const spawn = nodeSpawn;

  return {
    accountDiscovery: alchemyFormlessInstanceAccountDiscoveryAdapter,
    cloudflareDomainClient: () => cloudflareDomainClientFromEnv({ env: process.env, fetch }),
    cwd: process.cwd(),
    deploymentAdapter: alchemyFormlessInstanceDeploymentAdapter,
    env: process.env,
    fetch,
    healthCheck: fetchFormlessInstanceDeploymentHealthCheckAdapter,
    localSecretEnv: {
      ensure: ensureFormlessInstanceLocalSecretEnv,
    },
    log: (message) => console.log(message),
    now: () => new Date().toISOString(),
    openBrowser: (url) => openUrlWithSpawn(spawn, url),
    packageRoot: resolvePackageRoot(path.dirname(fileURLToPath(import.meta.url))),
    randomToken: () => randomBytes(32).toString("base64url"),
    runCommand: (command, args, options) => runCommandWithSpawn(spawn, command, args, options),
    selectWorkspaceName: selectInteractiveWorkspaceName,
    spawn,
    stateRoot: path.join(homedir(), FORMLESS_HOME_DIRECTORY),
    stateWriter: {
      write: writeFormlessInstanceState,
    },
    setupCapability: fetchFormlessInstanceOwnerSetupCapabilityAdapter,
  };
}

async function selectInteractiveWorkspaceName(
  input: FormlessInstanceWorkspaceDevNameSelectionInput,
): Promise<string | null> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return null;
  }

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await readline.question(`Workspace name [${input.defaultName}]: `);
    const trimmed = answer.trim();

    return trimmed === "" ? input.defaultName : trimmed;
  } finally {
    readline.close();
  }
}

function resolvePackageRoot(startDirectory: string): string {
  let directory = path.resolve(startDirectory);

  while (true) {
    if (existsSync(path.join(directory, "package.json"))) {
      return directory;
    }

    const parent = path.dirname(directory);

    if (parent === directory) {
      throw new Error(`Could not resolve Formless package root from ${startDirectory}.`);
    }

    directory = parent;
  }
}
