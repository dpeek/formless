import {
  FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME,
  FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME,
  FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME_ENV_NAME,
  parseInstanceAuthConfigInput,
  type InstanceAuthConfigInput,
} from "../shared/instance-auth.ts";
import { resolveRuntimeProfileKind } from "../shared/runtime-topology.ts";
import { readInstanceAuthConfig, writeInstanceAuthConfig } from "./instance-auth-state.ts";

export type InstanceAuthRuntimeEnv = {
  [FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME]?: string;
  [FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME]?: string;
  [FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME_ENV_NAME]?: string;
  FORMLESS_RUNTIME_PROFILE?: string;
};

const defaultRelyingPartyName = "Formless";

export function ensureRuntimeInstanceAuthConfig(
  storage: DurableObjectStorage,
  request: Request,
  env: InstanceAuthRuntimeEnv,
) {
  if (readInstanceAuthConfig(storage)) {
    return;
  }

  const config = runtimeInstanceAuthConfigForRequest(request, env);

  if (!config) {
    return;
  }

  writeInstanceAuthConfig(storage, config);
}

function runtimeInstanceAuthConfigForRequest(
  request: Request,
  env: InstanceAuthRuntimeEnv,
): InstanceAuthConfigInput | undefined {
  const requestUrl = new URL(request.url);
  const profileKind = resolveRuntimeProfileKind({
    hostname: requestUrl.hostname,
    profile: env.FORMLESS_RUNTIME_PROFILE,
  });

  if (profileKind !== "instance" && profileKind !== "dev") {
    return undefined;
  }

  const canonicalOrigin =
    stringRuntimeEnvValue(env[FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME]) ?? requestUrl.origin;
  const relyingPartyName =
    stringRuntimeEnvValue(env[FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME_ENV_NAME]) ??
    defaultRelyingPartyName;

  try {
    const canonicalHost = new URL(canonicalOrigin).hostname.toLowerCase();
    const relyingPartyId =
      stringRuntimeEnvValue(env[FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME]) ?? canonicalHost;

    return parseInstanceAuthConfigInput({
      canonicalOrigin,
      relyingPartyId,
      relyingPartyName,
    });
  } catch {
    return undefined;
  }
}

function stringRuntimeEnvValue(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}
