import path from "node:path";

import { formatDotEnv, parseDotEnv } from "./dotenv.ts";

export const FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_DIRECTORY = ".formless";
export const FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_FILE = "instance.env";
export const FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_PATH = ".formless/instance.env";
export const FORMLESS_INSTANCE_WORKSPACE_GITIGNORE_ENTRY = ".formless/";
export const FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME = "FORMLESS_ADMIN_TOKEN";

export type FormlessInstanceWorkspaceSecretState = {
  adminToken?: string;
};

export function formlessInstanceWorkspaceSecretStatePath(workspaceRoot: string): string {
  return path.join(
    workspaceRoot,
    FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_DIRECTORY,
    FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_FILE,
  );
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

function parseOptionalEnvValue(value: string | null | undefined): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed === "" ? undefined : trimmed;
}
