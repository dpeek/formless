import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  INSTANCE_WORKSPACE_MANIFEST_FILE,
  LEGACY_INSTANCE_WORKSPACE_MANIFEST_FILES,
  normalizeInstanceWorkspaceTargetUrl,
  parseInstanceWorkspaceManifestJson,
  type InstanceWorkspaceManifest,
  type InstanceWorkspaceTarget,
} from "@dpeek/formless-workspace";
import {
  INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME,
  readInstanceWorkspaceControlPlaneStorageSnapshot,
  readInstanceWorkspaceSecretState,
  type InstanceWorkspaceSecretState,
} from "@dpeek/formless-workspace/node";
import type { StoredRecord } from "@dpeek/formless-storage";

export type SiteCliAdminTokenSource = "env" | "explicit" | "missing" | "stored";

export type SiteCliResolvedAdminToken = {
  displayLabel: "[redacted]" | "missing";
  source: SiteCliAdminTokenSource;
  token: string | null;
};

export type SiteCliTargetContext = {
  adminToken: string | null;
  adminTokenDisplayLabel: "[redacted]" | "missing";
  adminTokenSource: SiteCliAdminTokenSource;
  display: {
    adminToken: "[redacted]" | "missing";
    selectedTarget: string;
    targetUrl: string | null;
    workspaceRoot: string;
  };
  manifest: InstanceWorkspaceManifest;
  manifestPath: string;
  secretState: InstanceWorkspaceSecretState;
  selectedTarget?: InstanceWorkspaceTarget;
  targetUrl?: string;
  workspaceRoot: string;
};

export type RequiredSiteCliTargetContext = SiteCliTargetContext & {
  selectedTarget: InstanceWorkspaceTarget;
  targetUrl: string;
};

export type ResolveSiteCliTargetContextInput = {
  commandName: string;
  cwd: string;
  explicitAdminToken?: string | null;
  requireTarget?: boolean;
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type ResolveSiteCliTargetContextDependencies = {
  env?: NodeJS.ProcessEnv;
};

export async function resolveSiteCliTargetContext(
  input: ResolveSiteCliTargetContextInput,
  dependencies: ResolveSiteCliTargetContextDependencies,
): Promise<SiteCliTargetContext> {
  const workspaceRoot = path.resolve(input.cwd, input.workspacePath ?? ".");
  const { manifest, manifestPath } = await readSiteCliWorkspaceManifest(workspaceRoot);
  const selectedTarget = await resolveSiteCliWorkspaceTarget({
    commandName: input.commandName,
    manifest,
    required: input.requireTarget === true,
    targetAlias: input.targetAlias,
    workspaceRoot,
  });
  const secretState = await readInstanceWorkspaceSecretState(workspaceRoot);
  const adminToken = resolveSiteCliAdminToken({
    env: dependencies.env,
    explicitAdminToken: input.explicitAdminToken,
    secretState,
  });

  return {
    adminToken: adminToken.token,
    adminTokenDisplayLabel: adminToken.displayLabel,
    adminTokenSource: adminToken.source,
    display: {
      adminToken: adminToken.displayLabel,
      selectedTarget: formatSiteCliSelectedTargetDisplay(selectedTarget),
      targetUrl: selectedTarget?.url ?? null,
      workspaceRoot,
    },
    manifest,
    manifestPath,
    secretState,
    ...(selectedTarget === undefined ? {} : { selectedTarget, targetUrl: selectedTarget.url }),
    workspaceRoot,
  };
}

export async function requireSiteCliTargetContext(
  input: ResolveSiteCliTargetContextInput,
  dependencies: ResolveSiteCliTargetContextDependencies,
): Promise<RequiredSiteCliTargetContext> {
  const context = await resolveSiteCliTargetContext(
    { ...input, requireTarget: true },
    dependencies,
  );

  if (!context.selectedTarget || !context.targetUrl) {
    throw new Error(`Formless instance ${input.commandName} requires a workspace target.`);
  }

  return context as RequiredSiteCliTargetContext;
}

export function resolveSiteCliAdminToken(input: {
  env?: NodeJS.ProcessEnv;
  explicitAdminToken?: string | null;
  secretState?: InstanceWorkspaceSecretState;
}): SiteCliResolvedAdminToken {
  const explicit = normalizedSiteCliAdminToken(input.explicitAdminToken);

  if (explicit) {
    return redactedResolvedAdminToken(explicit, "explicit");
  }

  const envToken = normalizedSiteCliAdminToken(
    input.env?.[INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME],
  );

  if (envToken) {
    return redactedResolvedAdminToken(envToken, "env");
  }

  const stored = normalizedSiteCliAdminToken(input.secretState?.adminToken);

  if (stored) {
    return redactedResolvedAdminToken(stored, "stored");
  }

  return {
    displayLabel: "missing",
    source: "missing",
    token: null,
  };
}

export function siteCliTargetAcceptHeaders(input: {
  adminToken?: string | null;
  headers?: Record<string, string>;
}): Record<string, string> {
  return siteCliTargetHeaders({
    accept: "application/json",
    adminToken: input.adminToken,
    headers: input.headers,
  });
}

export function siteCliTargetJsonHeaders(input: {
  adminToken?: string | null;
  headers?: Record<string, string>;
}): Record<string, string> {
  return siteCliTargetHeaders({
    accept: "application/json",
    adminToken: input.adminToken,
    contentType: "application/json",
    headers: input.headers,
  });
}

export function siteCliTargetFetchHeaders(input: {
  accept: string;
  adminToken?: string | null;
  contentType?: string;
  headers?: HeadersInit;
}): Headers {
  const headers = new Headers(input.headers);

  headers.set("accept", input.accept);

  if (input.contentType) {
    headers.set("content-type", input.contentType);
  }

  const authorization = siteCliAdminAuthorizationHeader(input.adminToken);

  if (authorization) {
    headers.set("authorization", authorization);
  }

  return headers;
}

export function siteCliTargetHeaders(input: {
  accept?: string;
  adminToken?: string | null;
  contentType?: string;
  headers?: Record<string, string>;
}): Record<string, string> {
  const headers: Record<string, string> = {
    ...(input.accept === undefined ? {} : { accept: input.accept }),
    ...(input.contentType === undefined ? {} : { "content-type": input.contentType }),
    ...input.headers,
  };
  const authorization = siteCliAdminAuthorizationHeader(input.adminToken);

  if (authorization) {
    headers.authorization = authorization;
  }

  return headers;
}

export function siteCliAdminAuthorizationHeader(adminToken: string | null | undefined) {
  const token = normalizedSiteCliAdminToken(adminToken);

  return token ? `Bearer ${token}` : undefined;
}

export function siteCliWorkspaceStatusSecretStateLabel(
  context: Pick<SiteCliTargetContext, "adminTokenSource" | "secretState">,
): "env" | "missing" | "stored" {
  if (context.adminTokenSource === "env" || context.adminTokenSource === "explicit") {
    return "env";
  }

  return context.secretState.adminToken ? "stored" : "missing";
}

async function readSiteCliWorkspaceManifest(workspaceRoot: string): Promise<{
  manifest: InstanceWorkspaceManifest;
  manifestPath: string;
}> {
  const manifestPath = path.join(workspaceRoot, INSTANCE_WORKSPACE_MANIFEST_FILE);

  await assertNoLegacySiteCliWorkspaceManifest(workspaceRoot);

  return {
    manifest: parseInstanceWorkspaceManifestJson(await readFile(manifestPath, "utf8")),
    manifestPath,
  };
}

async function assertNoLegacySiteCliWorkspaceManifest(workspaceRoot: string) {
  for (const fileName of LEGACY_INSTANCE_WORKSPACE_MANIFEST_FILES) {
    const manifestPath = path.join(workspaceRoot, fileName);

    try {
      await readFile(manifestPath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        continue;
      }

      throw error;
    }

    throw new Error(
      `Legacy Formless workspace manifest found at ${manifestPath}. Local-first workspaces use ${INSTANCE_WORKSPACE_MANIFEST_FILE}; run \`formless dev\` and complete setup in the browser.`,
    );
  }
}

async function resolveSiteCliWorkspaceTarget(input: {
  commandName: string;
  manifest: InstanceWorkspaceManifest;
  required: boolean;
  targetAlias: string | null | undefined;
  workspaceRoot: string;
}): Promise<InstanceWorkspaceTarget | undefined> {
  const controlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest: input.manifest,
    workspaceRoot: input.workspaceRoot,
  });
  const deploymentConfig = selectSiteCliDeploymentConfig(
    controlPlane?.records.filter((record) => !record.deletedAt) ?? [],
    input.targetAlias,
    {
      commandName: input.commandName,
      required: input.required,
    },
  );

  return deploymentConfig === undefined
    ? undefined
    : siteCliTargetFromDeploymentConfig(deploymentConfig, input.commandName);
}

function selectSiteCliDeploymentConfig(
  records: readonly StoredRecord[],
  targetAlias: string | null | undefined,
  options: { commandName: string; required: boolean },
): StoredRecord | undefined {
  const targets = records.filter(
    (record) =>
      record.entity === "deployment-config" &&
      record.values.targetKind === "instance" &&
      record.values.enabled !== false,
  );
  const requestedTargetId = targetAlias?.trim();

  if (requestedTargetId) {
    const target = targets.find(
      (record) =>
        record.id === requestedTargetId ||
        stringRecordValue(record, "targetId") === requestedTargetId,
    );

    if (!target) {
      throw new Error(
        `Formless instance ${options.commandName} target "${requestedTargetId}" was not found.`,
      );
    }

    return target;
  }

  const primary = targets.find(
    (record) => stringRecordValue(record, "targetId") === siteCliPrimaryTargetId(),
  );

  if (primary) {
    return primary;
  }

  if (targets.length === 1 && targets[0]) {
    return targets[0];
  }

  if (targets.length === 0) {
    if (options.required) {
      throw new Error(
        `Formless instance ${options.commandName} requires an enabled instance deployment-config record.`,
      );
    }

    return undefined;
  }

  throw new Error(
    `Formless instance ${options.commandName} targetAlias is required when multiple deployment configs exist.`,
  );
}

function siteCliTargetFromDeploymentConfig(
  record: StoredRecord,
  commandName: string,
): InstanceWorkspaceTarget {
  const targetId = stringRecordValue(record, "targetId") ?? record.id;
  const targetUrl = stringRecordValue(record, "targetUrl");

  if (targetUrl === undefined) {
    throw new Error(
      `Formless instance ${commandName} deployment-config "${targetId}" requires targetUrl.`,
    );
  }

  return {
    alias: targetId,
    url: normalizeInstanceWorkspaceTargetUrl(targetUrl),
  };
}

function formatSiteCliSelectedTargetDisplay(target: InstanceWorkspaceTarget | undefined): string {
  return target ? `${target.alias} (${target.url})` : "<none>";
}

function redactedResolvedAdminToken(
  token: string,
  source: Exclude<SiteCliAdminTokenSource, "missing">,
): SiteCliResolvedAdminToken {
  return {
    displayLabel: "[redacted]",
    source,
    token,
  };
}

function normalizedSiteCliAdminToken(value: string | null | undefined): string | null {
  const token = value?.trim();

  return token ? token : null;
}

function siteCliPrimaryTargetId() {
  return "instance.primary";
}

function stringRecordValue(
  record: StoredRecord | undefined,
  fieldName: string,
): string | undefined {
  const value = record?.values[fieldName];

  return typeof value === "string" ? value : undefined;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
