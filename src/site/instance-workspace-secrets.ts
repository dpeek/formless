import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { formatDotEnv, parseDotEnv } from "./dotenv.ts";

export const FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_DIRECTORY = ".formless";
export const FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_FILE = "instance.env";
export const FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_PATH = ".formless/instance.env";
export const FORMLESS_INSTANCE_WORKSPACE_LOCAL_DEV_SECRET_STATE_FILE = "dev.env";
export const FORMLESS_INSTANCE_WORKSPACE_LOCAL_DEV_SECRET_STATE_PATH = ".formless/local/dev.env";
export const FORMLESS_INSTANCE_WORKSPACE_GITIGNORE_ENTRY = ".formless/";
export const FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME = "FORMLESS_ADMIN_TOKEN";
export const FORMLESS_INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME =
  "FORMLESS_OWNER_SESSION_SECRET";

export type FormlessInstanceWorkspaceSecretState = {
  adminToken?: string;
};

export type FormlessInstanceWorkspaceLocalDevSecretState = {
  adminToken: string;
  ownerSessionSecret: string;
};

export type WriteFormlessInstanceWorkspaceSecretStateResult = {
  path: string;
  state: FormlessInstanceWorkspaceSecretState;
};

export type WriteFormlessInstanceWorkspaceLocalDevSecretStateResult = {
  path: string;
  state: FormlessInstanceWorkspaceLocalDevSecretState;
};

export function formlessInstanceWorkspaceSecretStatePath(workspaceRoot: string): string {
  return path.join(
    workspaceRoot,
    FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_DIRECTORY,
    FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_FILE,
  );
}

export function formlessInstanceWorkspaceLocalDevSecretStatePath(localStateRoot: string): string {
  return path.join(localStateRoot, FORMLESS_INSTANCE_WORKSPACE_LOCAL_DEV_SECRET_STATE_FILE);
}

export function parseFormlessInstanceWorkspaceSecretState(
  contents: string,
): FormlessInstanceWorkspaceSecretState {
  const values = parseDotEnv(contents);
  const adminToken = parseOptionalEnvValue(
    values[FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME],
  );

  return adminToken === undefined ? {} : { adminToken };
}

export function formatFormlessInstanceWorkspaceSecretState(
  state: FormlessInstanceWorkspaceSecretState,
): string {
  const adminToken = parseOptionalEnvValue(state.adminToken);

  return adminToken === undefined
    ? ""
    : formatDotEnv({ [FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME]: adminToken });
}

export function parseFormlessInstanceWorkspaceLocalDevSecretState(
  contents: string,
): Partial<FormlessInstanceWorkspaceLocalDevSecretState> {
  const values = parseDotEnv(contents);
  const adminToken = parseOptionalEnvValue(
    values[FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME],
  );
  const ownerSessionSecret = parseOptionalEnvValue(
    values[FORMLESS_INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME],
  );

  return {
    ...(adminToken === undefined ? {} : { adminToken }),
    ...(ownerSessionSecret === undefined ? {} : { ownerSessionSecret }),
  };
}

export function formatFormlessInstanceWorkspaceLocalDevSecretState(
  state: FormlessInstanceWorkspaceLocalDevSecretState,
): string {
  return formatDotEnv({
    [FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME]: state.adminToken,
    [FORMLESS_INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME]: state.ownerSessionSecret,
  });
}

export function resolveFormlessInstanceWorkspaceAdminToken(input: {
  env?: NodeJS.ProcessEnv;
  explicitAdminToken?: string | null;
  secretState?: FormlessInstanceWorkspaceSecretState;
}): string | null {
  return (
    parseOptionalEnvValue(input.explicitAdminToken) ??
    parseOptionalEnvValue(input.env?.[FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME]) ??
    parseOptionalEnvValue(input.secretState?.adminToken) ??
    null
  );
}

export async function readFormlessInstanceWorkspaceSecretState(
  workspaceRoot: string,
): Promise<FormlessInstanceWorkspaceSecretState> {
  const filePath = formlessInstanceWorkspaceSecretStatePath(workspaceRoot);

  try {
    return parseFormlessInstanceWorkspaceSecretState(await readFile(filePath, "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

export async function writeFormlessInstanceWorkspaceSecretState(
  workspaceRoot: string,
  state: FormlessInstanceWorkspaceSecretState,
): Promise<WriteFormlessInstanceWorkspaceSecretStateResult> {
  const parsed = parseFormlessInstanceWorkspaceSecretState(
    formatFormlessInstanceWorkspaceSecretState(state),
  );
  const filePath = formlessInstanceWorkspaceSecretStatePath(workspaceRoot);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, formatFormlessInstanceWorkspaceSecretState(parsed));

  return {
    path: filePath,
    state: parsed,
  };
}

export async function readFormlessInstanceWorkspaceLocalDevSecretState(
  localStateRoot: string,
): Promise<Partial<FormlessInstanceWorkspaceLocalDevSecretState>> {
  const filePath = formlessInstanceWorkspaceLocalDevSecretStatePath(localStateRoot);

  try {
    return parseFormlessInstanceWorkspaceLocalDevSecretState(await readFile(filePath, "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

export async function writeFormlessInstanceWorkspaceLocalDevSecretState(
  localStateRoot: string,
  state: FormlessInstanceWorkspaceLocalDevSecretState,
): Promise<WriteFormlessInstanceWorkspaceLocalDevSecretStateResult> {
  const filePath = formlessInstanceWorkspaceLocalDevSecretStatePath(localStateRoot);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, formatFormlessInstanceWorkspaceLocalDevSecretState(state));

  return {
    path: filePath,
    state,
  };
}

export async function ensureFormlessInstanceWorkspaceLocalDevSecretState(
  workspaceRoot: string,
  localStateRoot: string,
  createSecret: () => string,
): Promise<WriteFormlessInstanceWorkspaceLocalDevSecretStateResult> {
  const existing = await readFormlessInstanceWorkspaceLocalDevSecretState(localStateRoot);
  const state: FormlessInstanceWorkspaceLocalDevSecretState = {
    adminToken: existing.adminToken ?? createSecret(),
    ownerSessionSecret: existing.ownerSessionSecret ?? createSecret(),
  };
  const write = await writeFormlessInstanceWorkspaceLocalDevSecretState(localStateRoot, state);

  await ensureFormlessInstanceWorkspaceSecretStateIgnored(workspaceRoot);

  return write;
}

export async function ensureFormlessInstanceWorkspaceSecretStateIgnored(
  workspaceRoot: string,
): Promise<string> {
  const gitignorePath = path.join(workspaceRoot, ".gitignore");
  const current = await readTextFileIfExists(gitignorePath);
  const lines = (current ?? "").split(/\r?\n/);

  if (lines.some((line) => isSecretStateIgnoreLine(line))) {
    return gitignorePath;
  }

  const prefix = !current || current.endsWith("\n") ? (current ?? "") : `${current}\n`;

  await writeFile(gitignorePath, `${prefix}${FORMLESS_INSTANCE_WORKSPACE_GITIGNORE_ENTRY}\n`);

  return gitignorePath;
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
    value === FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_DIRECTORY ||
    value === FORMLESS_INSTANCE_WORKSPACE_GITIGNORE_ENTRY
  );
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
