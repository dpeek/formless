import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ensureInstanceWorkspaceSecretStateIgnored } from "@dpeek/formless-workspace/node";

export const FORMLESS_CLOUDFLARE_OAUTH_CLIENT_ID = "223a6ddec4aad6a652bf9b5ce840912c";
export const FORMLESS_CLOUDFLARE_OAUTH_REDIRECT_URI = "http://localhost:9976/auth/callback";
export const FORMLESS_CLOUDFLARE_OAUTH_CREDENTIAL_REF_PREFIX = "formless-cloudflare-oauth:";
export const FORMLESS_CLOUDFLARE_OAUTH_SECRET_STATE_DIRECTORY = "cloudflare-oauth";

export const FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES = [
  "workers-r2.read",
  "workers-r2.write",
  "workers-routes.read",
  "workers-routes.write",
  "workers-scripts.read",
  "workers-scripts.write",
  "dns.read",
  "dns.write",
  "zone.read",
  "challenge-widgets.read",
  "challenge-widgets.write",
  "account-settings.read",
  "user-details.read",
  "offline_access",
] as const;

export const FORMLESS_CLOUDFLARE_OAUTH_CREDENTIAL_KIND = "formless.cloudflareOAuthCredential";
export const FORMLESS_CLOUDFLARE_OAUTH_CREDENTIAL_VERSION = 1;

const cloudflareApiBaseUrl = "https://api.cloudflare.com/client/v4";
const cloudflareOAuthAuthorizeUrl = "https://dash.cloudflare.com/oauth2/auth";
const cloudflareOAuthTokenUrl = "https://dash.cloudflare.com/oauth2/token";
const credentialIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const refreshSkewMs = 1000 * 60 * 2;

export type FormlessCloudflareOAuthAuthorization = {
  requestedScopes: readonly string[];
  state: string;
  url: string;
  verifier: string;
};

export type FormlessCloudflareOAuthTokenSet = {
  accessToken: string;
  expiresAt: string;
  grantedScopes: string[];
  refreshToken: string;
};

export type FormlessCloudflareOAuthAccount = {
  id: string;
  name?: string;
  workersDevSubdomain: string;
};

export type FormlessCloudflareOAuthCredential = {
  client: {
    id: typeof FORMLESS_CLOUDFLARE_OAUTH_CLIENT_ID;
    redirectUri: typeof FORMLESS_CLOUDFLARE_OAUTH_REDIRECT_URI;
  };
  createdAt: string;
  credentialRef: string;
  id: string;
  kind: typeof FORMLESS_CLOUDFLARE_OAUTH_CREDENTIAL_KIND;
  provider: "cloudflare";
  selectedAccount?: FormlessCloudflareOAuthAccount;
  token: FormlessCloudflareOAuthTokenSet;
  updatedAt: string;
  version: typeof FORMLESS_CLOUDFLARE_OAUTH_CREDENTIAL_VERSION;
};

export type FormlessCloudflareOAuthAdapter = {
  createAuthorization: () => FormlessCloudflareOAuthAuthorization;
  exchangeCode: (input: {
    code: string;
    verifier: string;
  }) => Promise<FormlessCloudflareOAuthTokenSet>;
  listAccounts: (
    token: Pick<FormlessCloudflareOAuthTokenSet, "accessToken">,
  ) => Promise<FormlessCloudflareOAuthAccount[]>;
  refresh: (input: { refreshToken: string }) => Promise<FormlessCloudflareOAuthTokenSet>;
  waitForToken: (
    authorization: FormlessCloudflareOAuthAuthorization,
  ) => Promise<FormlessCloudflareOAuthTokenSet>;
};

export function createNodeFormlessCloudflareOAuthAdapter(
  dependencies: {
    fetch?: typeof fetch;
    now?: () => string;
  } = {},
): FormlessCloudflareOAuthAdapter {
  const fetchImpl = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? (() => new Date().toISOString());

  return {
    createAuthorization: () => createFormlessCloudflareOAuthAuthorization(),
    exchangeCode: (input) =>
      exchangeFormlessCloudflareOAuthCode({
        ...input,
        fetch: fetchImpl,
        now,
      }),
    listAccounts: (token) => listFormlessCloudflareAccounts({ fetch: fetchImpl, token }),
    refresh: (input) =>
      refreshFormlessCloudflareOAuthToken({
        ...input,
        fetch: fetchImpl,
        now,
      }),
    waitForToken: (authorization) =>
      waitForFormlessCloudflareOAuthToken({
        authorization,
        fetch: fetchImpl,
        now,
      }),
  };
}

export function createFormlessCloudflareOAuthAuthorization(): FormlessCloudflareOAuthAuthorization {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(96).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(cloudflareOAuthAuthorizeUrl);

  url.searchParams.set("client_id", FORMLESS_CLOUDFLARE_OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", FORMLESS_CLOUDFLARE_OAUTH_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  return {
    requestedScopes: FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES,
    state,
    url: url.toString(),
    verifier,
  };
}

export async function waitForFormlessCloudflareOAuthToken(input: {
  authorization: FormlessCloudflareOAuthAuthorization;
  fetch: typeof fetch;
  now: () => string;
}): Promise<FormlessCloudflareOAuthTokenSet> {
  const { createServer } = await import("node:http");
  const redirect = new URL(FORMLESS_CLOUDFLARE_OAUTH_REDIRECT_URI);
  const port = Number(redirect.port);
  const pathname = redirect.pathname;

  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>;
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url ?? "/", FORMLESS_CLOUDFLARE_OAUTH_REDIRECT_URI);

        if (url.pathname !== pathname) {
          throw new Error("Cloudflare authorization callback path is invalid.");
        }

        const error = url.searchParams.get("error");

        if (error) {
          throw new Error(
            url.searchParams.get("error_description") ?? "Cloudflare authorization failed.",
          );
        }

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (!code || state !== input.authorization.state) {
          throw new Error("Cloudflare authorization callback is invalid.");
        }

        const token = await exchangeFormlessCloudflareOAuthCode({
          code,
          fetch: input.fetch,
          now: input.now,
          verifier: input.authorization.verifier,
        });

        response.end("Formless Cloudflare authorization complete. Return to Formless.\n");
        clearTimeout(timeout);
        resolve(token);
      } catch (error) {
        response.statusCode = 400;
        response.end("Formless Cloudflare authorization failed. Return to Formless.\n");
        clearTimeout(timeout);
        reject(error);
      } finally {
        server.close();
      }
    });

    timeout = setTimeout(
      () => {
        reject(new Error("Cloudflare authorization timed out."));
        server.close();
      },
      1000 * 60 * 5,
    );

    server.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    server.listen(port);
  });
}

export async function exchangeFormlessCloudflareOAuthCode(input: {
  code: string;
  fetch: typeof fetch;
  now: () => string;
  verifier: string;
}): Promise<FormlessCloudflareOAuthTokenSet> {
  return readFormlessCloudflareOAuthTokenResponse({
    body: new URLSearchParams({
      client_id: FORMLESS_CLOUDFLARE_OAUTH_CLIENT_ID,
      code: input.code,
      code_verifier: input.verifier,
      grant_type: "authorization_code",
      redirect_uri: FORMLESS_CLOUDFLARE_OAUTH_REDIRECT_URI,
    }),
    fetch: input.fetch,
    now: input.now,
    operation: "Cloudflare OAuth token exchange",
  });
}

export async function refreshFormlessCloudflareOAuthToken(input: {
  fetch: typeof fetch;
  now: () => string;
  refreshToken: string;
}): Promise<FormlessCloudflareOAuthTokenSet> {
  return readFormlessCloudflareOAuthTokenResponse({
    body: new URLSearchParams({
      client_id: FORMLESS_CLOUDFLARE_OAUTH_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
    }),
    fetch: input.fetch,
    now: input.now,
    operation: "Cloudflare OAuth token refresh",
  });
}

export function assertFormlessCloudflareDeployScopesGranted(
  grantedScopes: readonly string[],
): void {
  const granted = new Set(grantedScopes);
  const missing = FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES.filter((scope) => !granted.has(scope));

  if (missing.length > 0) {
    throw new Error(
      `Cloudflare OAuth credential is missing required deploy scopes: ${missing.join(", ")}.`,
    );
  }
}

export function normalizeFormlessCloudflareOAuthCredentialId(
  value: string | null | undefined,
): string {
  const id = value?.trim() || "default";

  if (!credentialIdPattern.test(id)) {
    throw new Error(
      "Formless Cloudflare OAuth credential id must use letters, numbers, dots, dashes, or underscores.",
    );
  }

  return id;
}

export function formatFormlessCloudflareOAuthCredentialRef(id: string): string {
  return `${FORMLESS_CLOUDFLARE_OAUTH_CREDENTIAL_REF_PREFIX}${normalizeFormlessCloudflareOAuthCredentialId(id)}`;
}

export function parseFormlessCloudflareOAuthCredentialRef(value: string): string {
  if (!value.startsWith(FORMLESS_CLOUDFLARE_OAUTH_CREDENTIAL_REF_PREFIX)) {
    throw new Error(
      `Formless Cloudflare credentialRef must use ${FORMLESS_CLOUDFLARE_OAUTH_CREDENTIAL_REF_PREFIX}<credentialId>.`,
    );
  }

  return normalizeFormlessCloudflareOAuthCredentialId(
    value.slice(FORMLESS_CLOUDFLARE_OAUTH_CREDENTIAL_REF_PREFIX.length),
  );
}

export function createFormlessCloudflareOAuthCredential(input: {
  createdAt?: string;
  id: string;
  selectedAccount?: FormlessCloudflareOAuthAccount;
  token: FormlessCloudflareOAuthTokenSet;
  updatedAt: string;
}): FormlessCloudflareOAuthCredential {
  const id = normalizeFormlessCloudflareOAuthCredentialId(input.id);

  return {
    client: {
      id: FORMLESS_CLOUDFLARE_OAUTH_CLIENT_ID,
      redirectUri: FORMLESS_CLOUDFLARE_OAUTH_REDIRECT_URI,
    },
    createdAt: input.createdAt ?? input.updatedAt,
    credentialRef: formatFormlessCloudflareOAuthCredentialRef(id),
    id,
    kind: FORMLESS_CLOUDFLARE_OAUTH_CREDENTIAL_KIND,
    provider: "cloudflare",
    ...(input.selectedAccount === undefined ? {} : { selectedAccount: input.selectedAccount }),
    token: input.token,
    updatedAt: input.updatedAt,
    version: FORMLESS_CLOUDFLARE_OAUTH_CREDENTIAL_VERSION,
  };
}

export async function readFormlessCloudflareOAuthCredential(input: {
  id: string;
  workspaceRoot: string;
}): Promise<FormlessCloudflareOAuthCredential | undefined> {
  const filePath = formlessCloudflareOAuthCredentialPath(input.workspaceRoot, input.id);

  try {
    return parseFormlessCloudflareOAuthCredential(
      JSON.parse(await readFile(filePath, "utf8")) as unknown,
      filePath,
    );
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

export async function writeFormlessCloudflareOAuthCredential(input: {
  credential: FormlessCloudflareOAuthCredential;
  workspaceRoot: string;
}): Promise<{ path: string }> {
  const filePath = formlessCloudflareOAuthCredentialPath(input.workspaceRoot, input.credential.id);

  await ensureInstanceWorkspaceSecretStateIgnored(input.workspaceRoot);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(input.credential, null, 2)}\n`, { mode: 0o600 });

  return { path: filePath };
}

export function formlessCloudflareOAuthCredentialPath(workspaceRoot: string, id: string): string {
  return path.join(
    workspaceRoot,
    ".formless",
    FORMLESS_CLOUDFLARE_OAUTH_SECRET_STATE_DIRECTORY,
    `${normalizeFormlessCloudflareOAuthCredentialId(id)}.json`,
  );
}

export function shouldRefreshFormlessCloudflareOAuthCredential(
  credential: FormlessCloudflareOAuthCredential,
  now: () => string = () => new Date().toISOString(),
): boolean {
  const expiresAt = Date.parse(credential.token.expiresAt);
  const current = Date.parse(now());

  if (!Number.isFinite(expiresAt) || !Number.isFinite(current)) {
    return true;
  }

  return expiresAt - current <= refreshSkewMs;
}

export async function refreshStoredFormlessCloudflareOAuthCredential(input: {
  credential: FormlessCloudflareOAuthCredential;
  oauth: Pick<FormlessCloudflareOAuthAdapter, "refresh">;
  now: () => string;
  workspaceRoot: string;
}): Promise<FormlessCloudflareOAuthCredential> {
  if (!shouldRefreshFormlessCloudflareOAuthCredential(input.credential, input.now)) {
    return input.credential;
  }

  const token = await input.oauth.refresh({
    refreshToken: input.credential.token.refreshToken,
  });
  assertFormlessCloudflareDeployScopesGranted(token.grantedScopes);
  const credential = createFormlessCloudflareOAuthCredential({
    createdAt: input.credential.createdAt,
    id: input.credential.id,
    ...(input.credential.selectedAccount === undefined
      ? {}
      : { selectedAccount: input.credential.selectedAccount }),
    token,
    updatedAt: input.now(),
  });

  await writeFormlessCloudflareOAuthCredential({
    credential,
    workspaceRoot: input.workspaceRoot,
  });

  return credential;
}

async function readFormlessCloudflareOAuthTokenResponse(input: {
  body: URLSearchParams;
  fetch: typeof fetch;
  now: () => string;
  operation: string;
}): Promise<FormlessCloudflareOAuthTokenSet> {
  const response = await input.fetch(cloudflareOAuthTokenUrl, {
    body: input.body.toString(),
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`${input.operation} failed: HTTP ${response.status}.`);
  }

  const body = (await response.json()) as Partial<{
    access_token: unknown;
    expires_in: unknown;
    refresh_token: unknown;
    scope: unknown;
  }>;
  const token = {
    accessToken: requiredString(body.access_token, `${input.operation} access token`),
    expiresAt: expiresAtFromTokenResponse(body.expires_in, input.now),
    grantedScopes: requiredString(body.scope, `${input.operation} scope`)
      .split(" ")
      .filter((scope) => scope.trim() !== ""),
    refreshToken: requiredString(body.refresh_token, `${input.operation} refresh token`),
  };

  assertFormlessCloudflareDeployScopesGranted(token.grantedScopes);

  return token;
}

async function listFormlessCloudflareAccounts(input: {
  fetch: typeof fetch;
  token: Pick<FormlessCloudflareOAuthTokenSet, "accessToken">;
}): Promise<FormlessCloudflareOAuthAccount[]> {
  const accounts = await readCloudflareApiResult<Array<{ id?: unknown; name?: unknown }>>({
    fetch: input.fetch,
    pathname: "/accounts",
    token: input.token,
  });

  return Promise.all(
    accounts.map(async (account) => {
      const id = requiredString(account.id, "Cloudflare account id");
      const subdomain = await readCloudflareApiResult<{ subdomain?: unknown }>({
        fetch: input.fetch,
        pathname: `/accounts/${id}/workers/subdomain`,
        token: input.token,
      });

      return {
        id,
        ...(typeof account.name === "string" && account.name.trim() !== ""
          ? { name: account.name }
          : {}),
        workersDevSubdomain: requiredString(
          subdomain.subdomain,
          "Cloudflare workers.dev subdomain",
        ),
      };
    }),
  );
}

async function readCloudflareApiResult<T>(input: {
  fetch: typeof fetch;
  pathname: string;
  token: Pick<FormlessCloudflareOAuthTokenSet, "accessToken">;
}): Promise<T> {
  const response = await input.fetch(`${cloudflareApiBaseUrl}${input.pathname}`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${input.token.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Cloudflare API request failed: HTTP ${response.status}.`);
  }

  const body = (await response.json()) as Partial<{ result: T; success: boolean }>;

  if (body.success !== true || body.result === undefined) {
    throw new Error("Cloudflare API response was unsuccessful.");
  }

  return body.result;
}

function expiresAtFromTokenResponse(value: unknown, now: () => string): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error("Cloudflare OAuth token response is missing expiration.");
  }

  const current = Date.parse(now());

  if (!Number.isFinite(current)) {
    throw new Error("Current time is invalid for Cloudflare OAuth token expiration.");
  }

  return new Date(current + value * 1000).toISOString();
}

function parseFormlessCloudflareOAuthCredential(
  value: unknown,
  context: string,
): FormlessCloudflareOAuthCredential {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.kind !== FORMLESS_CLOUDFLARE_OAUTH_CREDENTIAL_KIND) {
    throw new Error(`${context} kind must be "${FORMLESS_CLOUDFLARE_OAUTH_CREDENTIAL_KIND}".`);
  }

  if (value.version !== FORMLESS_CLOUDFLARE_OAUTH_CREDENTIAL_VERSION) {
    throw new Error(`${context} version must be ${FORMLESS_CLOUDFLARE_OAUTH_CREDENTIAL_VERSION}.`);
  }

  const id = normalizeFormlessCloudflareOAuthCredentialId(
    requiredString(value.id, "Credential id"),
  );
  const credentialRef = requiredString(value.credentialRef, "Credential ref");

  if (parseFormlessCloudflareOAuthCredentialRef(credentialRef) !== id) {
    throw new Error(`${context} credentialRef does not match credential id.`);
  }

  const client = requireRecord(value.client, `${context} client`);
  const token = requireRecord(value.token, `${context} token`);
  const selectedAccount =
    value.selectedAccount === undefined
      ? undefined
      : parseFormlessCloudflareOAuthAccount(value.selectedAccount, `${context} selectedAccount`);

  if (client.id !== FORMLESS_CLOUDFLARE_OAUTH_CLIENT_ID) {
    throw new Error(`${context} client id does not match Formless Cloudflare OAuth client.`);
  }

  if (client.redirectUri !== FORMLESS_CLOUDFLARE_OAUTH_REDIRECT_URI) {
    throw new Error(`${context} redirect URI does not match Formless Cloudflare OAuth client.`);
  }

  const parsed = createFormlessCloudflareOAuthCredential({
    createdAt: requiredString(value.createdAt, `${context} createdAt`),
    id,
    ...(selectedAccount === undefined ? {} : { selectedAccount }),
    token: {
      accessToken: requiredString(token.accessToken, `${context} accessToken`),
      expiresAt: requiredString(token.expiresAt, `${context} expiresAt`),
      grantedScopes: requiredStringArray(token.grantedScopes, `${context} grantedScopes`),
      refreshToken: requiredString(token.refreshToken, `${context} refreshToken`),
    },
    updatedAt: requiredString(value.updatedAt, `${context} updatedAt`),
  });

  assertFormlessCloudflareDeployScopesGranted(parsed.token.grantedScopes);

  return parsed;
}

function parseFormlessCloudflareOAuthAccount(
  value: unknown,
  context: string,
): FormlessCloudflareOAuthAccount {
  const record = requireRecord(value, context);
  const name =
    typeof record.name === "string" && record.name.trim() !== "" ? record.name : undefined;

  return {
    id: requiredString(record.id, `${context} id`),
    ...(name === undefined ? {} : { name }),
    workersDevSubdomain: requiredString(
      record.workersDevSubdomain,
      `${context} workersDevSubdomain`,
    ),
  };
}

function requireRecord(value: unknown, context: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return value;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }

  return value;
}

function requiredStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be a string array.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
