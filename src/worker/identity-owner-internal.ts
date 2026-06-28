import { IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY } from "@dpeek/formless-identity-control-plane";
import type { OwnerIdentity } from "../shared/protocol.ts";

export const INTERNAL_IDENTITY_OWNER_PATH = "/_internal/identity-owner";
export const INTERNAL_IDENTITY_OWNER_RESET_PATH = "/_internal/identity-owner/reset";
export const INTERNAL_IDENTITY_ACTIVE_PRINCIPAL_PATH = "/_internal/identity-owner/active-principal";
export const INTERNAL_IDENTITY_OWNER_PRINCIPAL_PATH =
  "/_internal/identity-owner/principal-authority";

export type IdentityOwnerInternalEnv = {
  FORMLESS_AUTHORITY?: DurableObjectNamespace;
};

export type ActiveIdentityPrincipal = {
  id: string;
};

export async function readInternalActiveIdentityPrincipal(
  env: IdentityOwnerInternalEnv,
  principalId: string,
): Promise<ActiveIdentityPrincipal | null> {
  if (!env.FORMLESS_AUTHORITY) {
    return null;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY);
  const url = new URL(`http://internal${INTERNAL_IDENTITY_ACTIVE_PRINCIPAL_PATH}`);

  url.searchParams.set("principalId", principalId);

  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(url.toString(), {
      method: "GET",
    }),
  );
  const body = (await response.json()) as {
    error?: string;
    principal?: ActiveIdentityPrincipal | null;
  };

  if (!response.ok) {
    throw new Error(body.error ?? "Identity active principal lookup failed.");
  }

  return body.principal ?? null;
}

export async function readInternalIdentityOwnerForPrincipal(
  env: IdentityOwnerInternalEnv,
  principalId: string,
): Promise<OwnerIdentity | null> {
  if (!env.FORMLESS_AUTHORITY) {
    return null;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY);
  const url = new URL(`http://internal${INTERNAL_IDENTITY_OWNER_PRINCIPAL_PATH}`);

  url.searchParams.set("principalId", principalId);

  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(url.toString(), {
      method: "GET",
    }),
  );
  const body = (await response.json()) as { error?: string; owner?: OwnerIdentity | null };

  if (!response.ok) {
    throw new Error(body.error ?? "Identity owner principal lookup failed.");
  }

  return body.owner ?? null;
}
