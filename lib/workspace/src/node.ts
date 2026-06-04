/**
 * Local Node Workspace package adapter entrypoint.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_ENTITIES,
  WORKSPACE_OPERATION_STATE_ROOT,
  formatWorkspaceOperationState,
  formatInstanceWorkspaceControlPlaneRecordSourceFile,
  initialWorkspaceOperationState,
  instanceWorkspaceControlPlaneRecordSourceFileName,
  instanceWorkspaceControlPlaneRecordSourceRecords,
  instanceWorkspaceControlPlaneRecordSourceRelativePath,
  nextWorkspaceOperationState,
  parseWorkspaceOperationStateJson,
  parseInstanceWorkspaceControlPlaneRecordSourceControlPlane,
  parseInstanceWorkspaceControlPlaneRecordSourceFileJson,
  workspaceOperationStateFileName,
} from "./index.ts";
import type {
  InitialWorkspaceOperationStateInput,
  InstanceWorkspaceControlPlaneRecordSourceControlPlane,
  InstanceWorkspaceControlPlaneRecordSourceEntity,
  InstanceWorkspaceManifest,
  UpdateWorkspaceOperationStateInput,
  WorkspaceOperationState,
} from "./index.ts";

export * from "./index.ts";

export const INSTANCE_WORKSPACE_SECRET_STATE_DIRECTORY = ".formless";
export const INSTANCE_WORKSPACE_SECRET_STATE_FILE = "instance.env";
export const INSTANCE_WORKSPACE_SECRET_STATE_PATH = ".formless/instance.env";
export const INSTANCE_WORKSPACE_LOCAL_DEV_SECRET_STATE_FILE = "dev.env";
export const INSTANCE_WORKSPACE_LOCAL_DEV_SECRET_STATE_PATH = ".formless/local/dev.env";
export const INSTANCE_WORKSPACE_GITIGNORE_ENTRY = ".formless/";
export const INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME = "FORMLESS_ADMIN_TOKEN";
export const INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME = "FORMLESS_OWNER_SESSION_SECRET";

export type InstanceWorkspaceSecretState = {
  adminToken?: string;
};

export type InstanceWorkspaceLocalDevSecretState = {
  adminToken: string;
  ownerSessionSecret: string;
};

export type WriteInstanceWorkspaceSecretStateResult = {
  path: string;
  state: InstanceWorkspaceSecretState;
};

export type WriteInstanceWorkspaceLocalDevSecretStateResult = {
  path: string;
  state: InstanceWorkspaceLocalDevSecretState;
};

export type CreateWorkspaceOperationStateInput = Omit<
  InitialWorkspaceOperationStateInput,
  "id" | "workspaceLabel"
> & {
  id?: string;
  workspaceLabel?: string;
};

export function instanceWorkspaceSecretStatePath(workspaceRoot: string): string {
  return path.join(
    workspaceRoot,
    INSTANCE_WORKSPACE_SECRET_STATE_DIRECTORY,
    INSTANCE_WORKSPACE_SECRET_STATE_FILE,
  );
}

export function instanceWorkspaceLocalDevSecretStatePath(localStateRoot: string): string {
  return path.join(localStateRoot, INSTANCE_WORKSPACE_LOCAL_DEV_SECRET_STATE_FILE);
}

export function workspaceOperationStateRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, WORKSPACE_OPERATION_STATE_ROOT);
}

export function workspaceOperationStatePath(workspaceRoot: string, operationId: string): string {
  return path.join(
    workspaceOperationStateRoot(workspaceRoot),
    `${workspaceOperationStateFileName(operationId)}.json`,
  );
}

export function parseWorkspaceDotEnv(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex);
    const value = trimmed.slice(equalsIndex + 1);

    values[key] = parseWorkspaceDotEnvValue(value);
  }

  return values;
}

export function formatWorkspaceDotEnv(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => `${key}=${formatWorkspaceDotEnvValue(value)}`)
    .join("\n")
    .concat("\n");
}

export function parseInstanceWorkspaceSecretState(contents: string): InstanceWorkspaceSecretState {
  const values = parseWorkspaceDotEnv(contents);
  const adminToken = parseOptionalEnvValue(values[INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME]);

  return adminToken === undefined ? {} : { adminToken };
}

export function formatInstanceWorkspaceSecretState(state: InstanceWorkspaceSecretState): string {
  const adminToken = parseOptionalEnvValue(state.adminToken);

  return adminToken === undefined
    ? ""
    : formatWorkspaceDotEnv({ [INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME]: adminToken });
}

export function parseInstanceWorkspaceLocalDevSecretState(
  contents: string,
): Partial<InstanceWorkspaceLocalDevSecretState> {
  const values = parseWorkspaceDotEnv(contents);
  const adminToken = parseOptionalEnvValue(values[INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME]);
  const ownerSessionSecret = parseOptionalEnvValue(
    values[INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME],
  );

  return {
    ...(adminToken === undefined ? {} : { adminToken }),
    ...(ownerSessionSecret === undefined ? {} : { ownerSessionSecret }),
  };
}

export function formatInstanceWorkspaceLocalDevSecretState(
  state: InstanceWorkspaceLocalDevSecretState,
): string {
  return formatWorkspaceDotEnv({
    [INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME]: state.adminToken,
    [INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME]: state.ownerSessionSecret,
  });
}

export function resolveInstanceWorkspaceAdminToken(input: {
  env?: NodeJS.ProcessEnv;
  explicitAdminToken?: string | null;
  secretState?: InstanceWorkspaceSecretState;
}): string | null {
  return (
    parseOptionalEnvValue(input.explicitAdminToken) ??
    parseOptionalEnvValue(input.env?.[INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME]) ??
    parseOptionalEnvValue(input.secretState?.adminToken) ??
    null
  );
}

export async function readInstanceWorkspaceSecretState(
  workspaceRoot: string,
): Promise<InstanceWorkspaceSecretState> {
  const filePath = instanceWorkspaceSecretStatePath(workspaceRoot);

  try {
    return parseInstanceWorkspaceSecretState(await readFile(filePath, "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

export async function writeInstanceWorkspaceSecretState(
  workspaceRoot: string,
  state: InstanceWorkspaceSecretState,
): Promise<WriteInstanceWorkspaceSecretStateResult> {
  const parsed = parseInstanceWorkspaceSecretState(formatInstanceWorkspaceSecretState(state));
  const filePath = instanceWorkspaceSecretStatePath(workspaceRoot);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, formatInstanceWorkspaceSecretState(parsed));

  return {
    path: filePath,
    state: parsed,
  };
}

export async function readInstanceWorkspaceLocalDevSecretState(
  localStateRoot: string,
): Promise<Partial<InstanceWorkspaceLocalDevSecretState>> {
  const filePath = instanceWorkspaceLocalDevSecretStatePath(localStateRoot);

  try {
    return parseInstanceWorkspaceLocalDevSecretState(await readFile(filePath, "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

export async function writeInstanceWorkspaceLocalDevSecretState(
  localStateRoot: string,
  state: InstanceWorkspaceLocalDevSecretState,
): Promise<WriteInstanceWorkspaceLocalDevSecretStateResult> {
  const filePath = instanceWorkspaceLocalDevSecretStatePath(localStateRoot);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, formatInstanceWorkspaceLocalDevSecretState(state));

  return {
    path: filePath,
    state,
  };
}

export async function ensureInstanceWorkspaceLocalDevSecretState(
  workspaceRoot: string,
  localStateRoot: string,
  createSecret: () => string,
): Promise<WriteInstanceWorkspaceLocalDevSecretStateResult> {
  const existing = await readInstanceWorkspaceLocalDevSecretState(localStateRoot);
  const state: InstanceWorkspaceLocalDevSecretState = {
    adminToken: existing.adminToken ?? createSecret(),
    ownerSessionSecret: existing.ownerSessionSecret ?? createSecret(),
  };
  const write = await writeInstanceWorkspaceLocalDevSecretState(localStateRoot, state);

  await ensureInstanceWorkspaceSecretStateIgnored(workspaceRoot);

  return write;
}

export async function ensureInstanceWorkspaceSecretStateIgnored(
  workspaceRoot: string,
): Promise<string> {
  const gitignorePath = path.join(workspaceRoot, ".gitignore");
  const current = await readTextFileIfExists(gitignorePath);
  const lines = (current ?? "").split(/\r?\n/);

  if (lines.some((line) => isSecretStateIgnoreLine(line))) {
    return gitignorePath;
  }

  const prefix = !current || current.endsWith("\n") ? (current ?? "") : `${current}\n`;

  await writeFile(gitignorePath, `${prefix}${INSTANCE_WORKSPACE_GITIGNORE_ENTRY}\n`);

  return gitignorePath;
}

export async function createWorkspaceOperationState(
  input: CreateWorkspaceOperationStateInput,
): Promise<WorkspaceOperationState> {
  const state = initialWorkspaceOperationState({
    ...input,
    id: input.id ?? `op_${randomUUID()}`,
    workspaceLabel: input.workspaceLabel ?? (path.basename(input.workspaceRoot) || "."),
  });

  await writeWorkspaceOperationState(input.workspaceRoot, state);

  return state;
}

export async function readWorkspaceOperationState(input: {
  operationId: string;
  workspaceRoot: string;
}): Promise<WorkspaceOperationState> {
  return parseWorkspaceOperationStateJson(
    await readFile(workspaceOperationStatePath(input.workspaceRoot, input.operationId), "utf8"),
  );
}

export async function listWorkspaceOperationStates(
  workspaceRoot: string,
): Promise<WorkspaceOperationState[]> {
  let entries: Array<{ isFile(): boolean; name: string }>;

  try {
    entries = await readdir(workspaceOperationStateRoot(workspaceRoot), {
      withFileTypes: true,
    });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const states = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) =>
        readFile(path.join(workspaceOperationStateRoot(workspaceRoot), entry.name), "utf8"),
      ),
  );

  return states
    .map(parseWorkspaceOperationStateJson)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function updateWorkspaceOperationState(
  operationId: string,
  input: UpdateWorkspaceOperationStateInput,
): Promise<WorkspaceOperationState> {
  const current = await readWorkspaceOperationState({
    operationId,
    workspaceRoot: input.workspaceRoot,
  });
  const next = nextWorkspaceOperationState(current, input);

  await writeWorkspaceOperationState(input.workspaceRoot, next);

  return next;
}

export async function writeWorkspaceOperationState(
  workspaceRoot: string,
  state: WorkspaceOperationState,
): Promise<void> {
  await mkdir(workspaceRoot, { recursive: true });
  await ensureInstanceWorkspaceSecretStateIgnored(workspaceRoot);
  await mkdir(workspaceOperationStateRoot(workspaceRoot), { recursive: true });
  await writeFile(
    workspaceOperationStatePath(workspaceRoot, state.id),
    formatWorkspaceOperationState(state),
  );
}

export function instanceWorkspaceControlPlaneRecordSourcePath(
  workspaceRoot: string,
  manifest: InstanceWorkspaceManifest,
  entity: InstanceWorkspaceControlPlaneRecordSourceEntity,
): string {
  return path.join(
    workspaceRoot,
    instanceWorkspaceControlPlaneRecordSourceRelativePath(manifest, entity),
  );
}

export async function readInstanceWorkspaceControlPlaneRecordSource(input: {
  manifest: InstanceWorkspaceManifest;
  workspaceRoot: string;
}): Promise<InstanceWorkspaceControlPlaneRecordSourceControlPlane | undefined> {
  const sourceRoot = path.join(input.workspaceRoot, input.manifest.source.records);
  let entries: Array<{ isFile(): boolean; name: string }>;

  try {
    entries = await readdir(sourceRoot, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }

  const allowedFileNames = new Set(
    INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_ENTITIES.map(
      instanceWorkspaceControlPlaneRecordSourceFileName,
    ),
  );
  const fileNames = entries
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  for (const entry of entries) {
    if (!entry.isFile() || !allowedFileNames.has(entry.name)) {
      throw new Error(
        `Workspace control-plane record source ${input.manifest.source.records} has unsupported file "${entry.name}".`,
      );
    }
  }

  const files = [];

  for (const entity of INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_ENTITIES) {
    const fileName = instanceWorkspaceControlPlaneRecordSourceFileName(entity);

    if (!fileNames.includes(fileName)) {
      continue;
    }

    files.push(
      parseInstanceWorkspaceControlPlaneRecordSourceFileJson(
        await readFile(path.join(sourceRoot, fileName), "utf8"),
        {
          context: `Workspace control-plane record source ${input.manifest.source.records}/${fileName}`,
          expectedEntity: entity,
        },
      ),
    );
  }

  if (files.length === 0) {
    return undefined;
  }

  const schemaUpdatedAt = files
    .map((file) => file.schemaUpdatedAt)
    .sort((left, right) => right.localeCompare(left))[0];

  return parseInstanceWorkspaceControlPlaneRecordSourceControlPlane(
    `Workspace control-plane record source ${input.manifest.source.records}`,
    schemaUpdatedAt,
    files.flatMap((file) => file.records),
  );
}

export async function writeInstanceWorkspaceControlPlaneRecordSource(input: {
  controlPlane: InstanceWorkspaceControlPlaneRecordSourceControlPlane | undefined;
  manifest: InstanceWorkspaceManifest;
  workspaceRoot: string;
}): Promise<void> {
  const sourceRoot = path.join(input.workspaceRoot, input.manifest.source.records);

  await rm(sourceRoot, { force: true, recursive: true });

  if (input.controlPlane === undefined) {
    return;
  }

  await mkdir(sourceRoot, { recursive: true });

  const sourceControlPlane = parseInstanceWorkspaceControlPlaneRecordSourceControlPlane(
    `Workspace control-plane record source ${input.manifest.source.records}`,
    input.controlPlane.schemaUpdatedAt,
    instanceWorkspaceControlPlaneRecordSourceRecords(input.controlPlane.records),
  );

  for (const entity of INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_ENTITIES) {
    const records = sourceControlPlane.records.filter((record) => record.entity === entity);
    const contents = formatInstanceWorkspaceControlPlaneRecordSourceFile({
      entity,
      records,
      schemaUpdatedAt: sourceControlPlane.schemaUpdatedAt,
    });

    await writeFile(
      path.join(sourceRoot, instanceWorkspaceControlPlaneRecordSourceFileName(entity)),
      contents,
    );
  }
}

function parseOptionalEnvValue(value: string | null | undefined): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed === "" ? undefined : trimmed;
}

function isSecretStateIgnoreLine(line: string): boolean {
  const value = line.trim();

  return (
    value === INSTANCE_WORKSPACE_SECRET_STATE_DIRECTORY ||
    value === INSTANCE_WORKSPACE_GITIGNORE_ENTRY
  );
}

function formatWorkspaceDotEnvValue(value: string): string {
  return /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : JSON.stringify(value);
}

function parseWorkspaceDotEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }

  return value;
}

async function readTextFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
