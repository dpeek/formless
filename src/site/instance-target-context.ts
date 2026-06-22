import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  INSTANCE_WORKSPACE_MANIFEST_FILE,
  normalizeInstanceWorkspaceTargetUrl,
  parseInstanceWorkspaceManifestJson,
  type InstanceWorkspaceManifest,
  type InstanceWorkspaceTarget,
} from "@dpeek/formless-workspace";
import {
  INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME,
  createWorkspaceAppPackageResolver,
  readInstanceWorkspaceControlPlaneStorageSnapshot,
  readInstanceWorkspaceSecretState,
  type InstanceWorkspaceSecretState,
} from "@dpeek/formless-workspace/node";
import type { StoredRecord } from "@dpeek/formless-storage";
import { bundledAppPackageManifests } from "../shared/app-packages.ts";

export type FormlessCliAdminTokenSource = "env" | "explicit" | "missing" | "stored";

export type FormlessCliResolvedAdminToken = {
  displayLabel: "[redacted]" | "missing";
  source: FormlessCliAdminTokenSource;
  token: string | null;
};

export type FormlessCliTargetContext = {
  adminToken: string | null;
  adminTokenDisplayLabel: "[redacted]" | "missing";
  adminTokenSource: FormlessCliAdminTokenSource;
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

export type RequiredFormlessCliTargetContext = FormlessCliTargetContext & {
  selectedTarget: InstanceWorkspaceTarget;
  targetUrl: string;
};

export type ResolveFormlessCliTargetContextInput = {
  commandName: string;
  cwd: string;
  explicitAdminToken?: string | null;
  requireTarget?: boolean;
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type ResolveFormlessCliTargetContextDependencies = {
  env?: NodeJS.ProcessEnv;
};

export async function resolveFormlessCliTargetContext(
  input: ResolveFormlessCliTargetContextInput,
  dependencies: ResolveFormlessCliTargetContextDependencies,
): Promise<FormlessCliTargetContext> {
  const workspaceRoot = path.resolve(input.cwd, input.workspacePath ?? ".");
  const { manifest, manifestPath } = await readFormlessCliWorkspaceManifest(workspaceRoot);
  const selectedTarget = await resolveFormlessCliWorkspaceTarget({
    commandName: input.commandName,
    manifest,
    required: input.requireTarget === true,
    targetAlias: input.targetAlias,
    workspaceRoot,
  });
  const secretState = await readInstanceWorkspaceSecretState(workspaceRoot);
  const adminToken = resolveFormlessCliAdminToken({
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
      selectedTarget: formatFormlessCliSelectedTargetDisplay(selectedTarget),
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

export async function requireFormlessCliTargetContext(
  input: ResolveFormlessCliTargetContextInput,
  dependencies: ResolveFormlessCliTargetContextDependencies,
): Promise<RequiredFormlessCliTargetContext> {
  const context = await resolveFormlessCliTargetContext(
    { ...input, requireTarget: true },
    dependencies,
  );

  if (!context.selectedTarget || !context.targetUrl) {
    throw new Error(`Formless instance ${input.commandName} requires a workspace target.`);
  }

  return context as RequiredFormlessCliTargetContext;
}

export function resolveFormlessCliAdminToken(input: {
  env?: NodeJS.ProcessEnv;
  explicitAdminToken?: string | null;
  secretState?: InstanceWorkspaceSecretState;
}): FormlessCliResolvedAdminToken {
  const explicit = normalizedFormlessCliAdminToken(input.explicitAdminToken);

  if (explicit) {
    return redactedResolvedAdminToken(explicit, "explicit");
  }

  const envToken = normalizedFormlessCliAdminToken(
    input.env?.[INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME],
  );

  if (envToken) {
    return redactedResolvedAdminToken(envToken, "env");
  }

  const stored = normalizedFormlessCliAdminToken(input.secretState?.adminToken);

  if (stored) {
    return redactedResolvedAdminToken(stored, "stored");
  }

  return {
    displayLabel: "missing",
    source: "missing",
    token: null,
  };
}

export function formlessCliTargetAcceptHeaders(input: {
  adminToken?: string | null;
  headers?: Record<string, string>;
}): Record<string, string> {
  return formlessCliTargetHeaders({
    accept: "application/json",
    adminToken: input.adminToken,
    headers: input.headers,
  });
}

export function formlessCliTargetJsonHeaders(input: {
  adminToken?: string | null;
  headers?: Record<string, string>;
}): Record<string, string> {
  return formlessCliTargetHeaders({
    accept: "application/json",
    adminToken: input.adminToken,
    contentType: "application/json",
    headers: input.headers,
  });
}

export function formlessCliTargetFetchHeaders(input: {
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

  const authorization = formlessCliAdminAuthorizationHeader(input.adminToken);

  if (authorization) {
    headers.set("authorization", authorization);
  }

  return headers;
}

export function formlessCliTargetHeaders(input: {
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
  const authorization = formlessCliAdminAuthorizationHeader(input.adminToken);

  if (authorization) {
    headers.authorization = authorization;
  }

  return headers;
}

export function formlessCliAdminAuthorizationHeader(adminToken: string | null | undefined) {
  const token = normalizedFormlessCliAdminToken(adminToken);

  return token ? `Bearer ${token}` : undefined;
}

export function formlessCliWorkspaceStatusSecretStateLabel(
  context: Pick<FormlessCliTargetContext, "adminTokenSource" | "secretState">,
): "env" | "missing" | "stored" {
  if (context.adminTokenSource === "env" || context.adminTokenSource === "explicit") {
    return "env";
  }

  return context.secretState.adminToken ? "stored" : "missing";
}

async function readFormlessCliWorkspaceManifest(workspaceRoot: string): Promise<{
  manifest: InstanceWorkspaceManifest;
  manifestPath: string;
}> {
  const manifestPath = path.join(workspaceRoot, INSTANCE_WORKSPACE_MANIFEST_FILE);

  return {
    manifest: parseInstanceWorkspaceManifestJson(await readFile(manifestPath, "utf8")),
    manifestPath,
  };
}

async function resolveFormlessCliWorkspaceTarget(input: {
  commandName: string;
  manifest: InstanceWorkspaceManifest;
  required: boolean;
  targetAlias: string | null | undefined;
  workspaceRoot: string;
}): Promise<InstanceWorkspaceTarget | undefined> {
  const activePackages = await createWorkspaceAppPackageResolver({
    bundledManifests: bundledAppPackageManifests,
    workspaceRoot: input.workspaceRoot,
  });
  const controlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest: input.manifest,
    packageResolver: activePackages.resolver,
    workspaceRoot: input.workspaceRoot,
  });
  const deploymentConfig = selectFormlessCliDeploymentConfig(
    controlPlane?.records.filter((record) => !record.deletedAt) ?? [],
    input.targetAlias,
    {
      commandName: input.commandName,
      required: input.required,
    },
  );

  return deploymentConfig === undefined
    ? undefined
    : formlessCliTargetFromDeploymentConfig(deploymentConfig, input.commandName);
}

function selectFormlessCliDeploymentConfig(
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
    (record) => stringRecordValue(record, "targetId") === formlessCliPrimaryTargetId(),
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

function formlessCliTargetFromDeploymentConfig(
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

function formatFormlessCliSelectedTargetDisplay(
  target: InstanceWorkspaceTarget | undefined,
): string {
  return target ? `${target.alias} (${target.url})` : "<none>";
}

function redactedResolvedAdminToken(
  token: string,
  source: Exclude<FormlessCliAdminTokenSource, "missing">,
): FormlessCliResolvedAdminToken {
  return {
    displayLabel: "[redacted]",
    source,
    token,
  };
}

function normalizedFormlessCliAdminToken(value: string | null | undefined): string | null {
  const token = value?.trim();

  return token ? token : null;
}

function formlessCliPrimaryTargetId() {
  return "instance.primary";
}

function stringRecordValue(
  record: StoredRecord | undefined,
  fieldName: string,
): string | undefined {
  const value = record?.values[fieldName];

  return typeof value === "string" ? value : undefined;
}
