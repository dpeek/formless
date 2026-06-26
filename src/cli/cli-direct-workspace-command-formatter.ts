import {
  formatCliOutputLines,
  formatCliRelativePath,
  formatCliSelectedTarget,
  type CliSelectedTargetDisplay,
} from "./cli-formatter-helpers.ts";

export type CliInstanceWorkspaceTokenAdoptResult = {
  secretPath: string;
  selectedTarget?: CliSelectedTargetDisplay;
  workspaceRoot: string;
};

export type CliInstanceWorkspaceTokenRotateResult = CliInstanceWorkspaceTokenAdoptResult & {
  workerName: string;
};

export type CliOwnerSetupStatus = {
  owner?: {
    email?: string;
    name: string;
  };
  setupComplete: boolean;
};

export type CliInstanceOwnerSetupResult = {
  opened: boolean;
  selectedTarget: CliSelectedTargetDisplay;
  setupStatus: CliOwnerSetupStatus;
  setupUrl?: string;
  workspaceRoot: string;
};

export type CliDestroyRouteProviderResources = {
  enabledHosts: string[];
  resourceCount: number;
  routeCount: number;
  source: string;
};

export type CliDestroyedResources = {
  alchemyState: string;
  customDomains: number;
  dnsRecords: number;
  durableObjectNamespace: string;
  mediaBucket: string;
  turnstileWidget: string;
  worker: string;
  workerAssets: string;
  workerSecrets: string;
};

export type CliInstanceWorkspaceDestroyResult = {
  deploymentStatePath: string;
  deploymentStateRoot: string;
  destroy: {
    resources: CliDestroyedResources;
  };
  localSecretPath: string;
  plan: {
    resources: {
      authority: {
        namespaceName: string;
      };
      mediaBucket: {
        name: string;
      };
      worker: {
        name: string;
      };
    };
  };
  routeProviderResources: CliDestroyRouteProviderResources;
  selectedTarget: CliSelectedTargetDisplay;
  workspaceRoot: string;
};

export function formatCliInstanceWorkspaceTokenAdoptOutput(
  result: CliInstanceWorkspaceTokenAdoptResult,
  cwd: string,
): string {
  return formatCliOutputLines([
    "Instance workspace admin token adopted.",
    `Workspace: ${formatCliRelativePath(cwd, result.workspaceRoot)}.`,
    `Secret state: ${formatCliRelativePath(cwd, result.secretPath)}.`,
    `Target: ${formatCliSelectedTarget(result.selectedTarget)}.`,
  ]);
}

export function formatCliInstanceWorkspaceTokenRotateOutput(
  result: CliInstanceWorkspaceTokenRotateResult,
  cwd: string,
): string {
  return formatCliOutputLines([
    "Instance workspace admin token rotated.",
    `Workspace: ${formatCliRelativePath(cwd, result.workspaceRoot)}.`,
    `Secret state: ${formatCliRelativePath(cwd, result.secretPath)}.`,
    `Worker: ${result.workerName}.`,
    `Target: ${formatCliSelectedTarget(result.selectedTarget)}.`,
  ]);
}

export function formatCliInstanceOwnerSetupOutput(
  result: CliInstanceOwnerSetupResult,
  cwd: string,
): string {
  return formatCliOutputLines([
    result.setupUrl
      ? "Instance owner setup URL created."
      : "Instance owner setup already complete.",
    `Workspace: ${formatCliRelativePath(cwd, result.workspaceRoot)}.`,
    `Target: ${formatCliSelectedTarget(result.selectedTarget)}.`,
    `Owner setup: ${formatCliOwnerSetupStatus(result.setupStatus)}.`,
    result.setupUrl ? `Setup URL: ${result.setupUrl}.` : null,
    result.setupUrl ? `Browser opened: ${formatCliBrowserOpened(result.opened)}.` : null,
  ]);
}

export function formatCliInstanceWorkspaceDestroyOutput(
  result: CliInstanceWorkspaceDestroyResult,
  cwd: string,
): string {
  return formatCliOutputLines([
    "Instance workspace destroyed.",
    `Workspace: ${formatCliRelativePath(cwd, result.workspaceRoot)}.`,
    `Target: ${formatCliSelectedTarget(result.selectedTarget)}.`,
    `Worker: ${result.plan.resources.worker.name}.`,
    `Durable Object namespace: ${result.plan.resources.authority.namespaceName}.`,
    `Media bucket: ${result.plan.resources.mediaBucket.name}.`,
    `Route provider resources: ${formatCliDestroyRouteProviderResources(
      result.routeProviderResources,
    )}.`,
    `Destroyed resources: ${formatCliDestroyedResources(result.destroy.resources)}.`,
    `Ignored deploy state: ${formatCliRelativePath(cwd, result.deploymentStateRoot)}.`,
    `Deployment facts: ${formatCliRelativePath(cwd, result.deploymentStatePath)}.`,
    `Local deploy secrets: ${formatCliRelativePath(cwd, result.localSecretPath)}.`,
  ]);
}

export function formatCliDestroyRouteProviderResources(
  resources: CliDestroyRouteProviderResources,
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

export function formatCliDestroyedResources(resources: CliDestroyedResources): string {
  return `Worker ${resources.worker}, Durable Object namespace ${resources.durableObjectNamespace}, R2 media bucket ${resources.mediaBucket}, Turnstile widget ${resources.turnstileWidget}, Worker assets ${resources.workerAssets}, Worker secrets ${resources.workerSecrets}, custom domains ${resources.customDomains}, DNS records ${resources.dnsRecords}, Alchemy state ${resources.alchemyState}`;
}

export function formatCliOwnerSetupStatus(status: CliOwnerSetupStatus): string {
  if (!status.setupComplete) {
    return "incomplete";
  }

  const owner = status.owner;

  if (!owner) {
    return "complete";
  }

  return owner.email ? `complete (${owner.name} <${owner.email}>)` : `complete (${owner.name})`;
}

export function formatCliBrowserOpened(opened: boolean): "no" | "yes" {
  return opened ? "yes" : "no";
}
