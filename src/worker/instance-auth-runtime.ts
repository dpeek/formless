import {
  FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME,
  FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME,
  FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME_ENV_NAME,
  parseInstanceAuthConfigInput,
  type InstanceAuthConfigInput,
} from "../shared/instance-auth.ts";
import { instanceControlPlaneProductionIdentityFromRecords } from "@dpeek/formless-instance-control-plane";
import { resolveRuntimeProfileKind } from "../shared/runtime-topology.ts";
import { readControlPlaneRecords } from "./deployment-control-plane-client.ts";
import { readInstanceAuthConfig, writeInstanceAuthConfig } from "./instance-auth-state.ts";

export type InstanceAuthRuntimeEnv = {
  [FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME]?: string;
  [FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME]?: string;
  [FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME_ENV_NAME]?: string;
  FORMLESS_AUTHORITY?: DurableObjectNamespace;
  FORMLESS_RUNTIME_PROFILE?: string;
};

const defaultRelyingPartyName = "Formless";

export function ensureRuntimeInstanceAuthConfig(
  storage: DurableObjectStorage,
  request: Request,
  env: InstanceAuthRuntimeEnv,
): Promise<void> {
  if (readInstanceAuthConfig(storage)) {
    return Promise.resolve();
  }

  return runtimeInstanceAuthConfigForRequest(request, env).then((config) => {
    if (!config) {
      return;
    }

    writeInstanceAuthConfig(storage, config);
  });
}

async function runtimeInstanceAuthConfigForRequest(
  request: Request,
  env: InstanceAuthRuntimeEnv,
): Promise<InstanceAuthConfigInput | undefined> {
  const requestUrl = new URL(request.url);
  const profileKind = resolveRuntimeProfileKind({
    hostname: requestUrl.hostname,
    profile: env.FORMLESS_RUNTIME_PROFILE,
  });

  if (profileKind !== "instance" && profileKind !== "dev" && profileKind !== "publishedSite") {
    return undefined;
  }

  const relyingPartyName =
    stringRuntimeEnvValue(env[FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME_ENV_NAME]) ??
    defaultRelyingPartyName;
  const explicitCanonicalOrigin = stringRuntimeEnvValue(
    env[FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME],
  );

  if (explicitCanonicalOrigin !== undefined) {
    return parseRuntimeAuthConfig({
      canonicalOrigin: explicitCanonicalOrigin,
      relyingPartyId: stringRuntimeEnvValue(env[FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME]),
      relyingPartyName,
    });
  }

  if (profileKind === "dev") {
    return parseRuntimeAuthConfig({
      canonicalOrigin: requestUrl.origin,
      relyingPartyId: stringRuntimeEnvValue(env[FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME]),
      relyingPartyName,
    });
  }

  const identity = instanceControlPlaneProductionIdentityFromRecords(
    (await readControlPlaneRecords({
      env,
      requestUrl: request.url,
    })) ?? [],
  );

  if (!identity) {
    return undefined;
  }

  return parseRuntimeAuthConfig({
    canonicalOrigin: identity.authOrigin,
    relyingPartyId:
      stringRuntimeEnvValue(env[FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME]) ??
      identity.relyingPartyId,
    relyingPartyName: identity.relyingPartyName ?? relyingPartyName,
  });
}

function parseRuntimeAuthConfig(input: {
  canonicalOrigin: string;
  relyingPartyId?: string;
  relyingPartyName: string;
}): InstanceAuthConfigInput | undefined {
  try {
    const canonicalHost = new URL(input.canonicalOrigin).hostname.toLowerCase();

    return parseInstanceAuthConfigInput({
      canonicalOrigin: input.canonicalOrigin,
      relyingPartyId: input.relyingPartyId ?? canonicalHost,
      relyingPartyName: input.relyingPartyName,
    });
  } catch {
    return undefined;
  }
}

function stringRuntimeEnvValue(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}
