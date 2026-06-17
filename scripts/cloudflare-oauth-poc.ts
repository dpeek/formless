#!/usr/bin/env bun
/**
 * Formless Cloudflare OAuth credential POC.
 *
 * Happy path:
 *   1. Open Cloudflare OAuth for a Formless-owned private OAuth client.
 *   2. Use Authorization Code + PKCE with explicit requested OAuth scopes.
 *   3. Exchange the auth code for Cloudflare OAuth credentials.
 *   4. Discover/select the Cloudflare account with GET /accounts.
 *   5. Pass the fresh OAuth access token into Alchemy as apiToken.
 *   6. Create and destroy a Formless Turnstile Alchemy resource.
 *   7. Create and destroy a built-in Alchemy Cloudflare R2 bucket resource.
 *
 * Run:
 *   bun scripts/cloudflare-oauth-poc.ts --confirm create-and-destroy-cloudflare-resources
 *
 * Guard:
 *   - The command refuses to run Cloudflare mutations unless the exact
 *     confirmation flag above is present.
 *   - OAuth credentials stay in memory only.
 *   - Alchemy state is written under an OS temp directory and removed before
 *     exit.
 *   - The POC does not write ~/.alchemy credentials, ~/.alchemy config, or
 *     reviewable workspace source.
 *
 * Cloudflare resources created and destroyed by each run:
 *   - One Turnstile widget named "Formless OAuth POC <ISO timestamp>" for
 *     domain formless.run. It is destroyed through Alchemy, with fallback
 *     cleanup at DELETE /accounts/:accountId/challenges/widgets/:siteKey.
 *   - One empty R2 bucket named
 *     "formless-oauth-poc-<timestamp-base36>-<8-hex>". It is destroyed
 *     through Alchemy, with fallback cleanup at
 *     DELETE /accounts/:accountId/r2/buckets/:bucketName.
 *   - No Worker, DNS record, custom domain, route, zone, Cloudflare account,
 *     Alchemy OAuth profile, or committed workspace file is created.
 *
 * OAuth client setup:
 *   - Client ID: source-owned Formless public OAuth client id
 *   - Response type: Code
 *   - Grant types: Authorization Code, Refresh Token
 *   - Token authentication method: none
 *   - Redirect URL: http://localhost:9976/auth/callback
 *   - Registered scopes, which must also be requested in the authorization URL:
 *     workers-r2.read, workers-r2.write, workers-routes.read,
 *     workers-routes.write, workers-scripts.read, workers-scripts.write,
 *     dns.read, dns.write, zone.read, challenge-widgets.read,
 *     challenge-widgets.write, account-settings.read, user-details.read,
 *     offline_access
 *   - Private client visibility only works for Cloudflare users who are members
 *     of the account that owns the OAuth client.
 *
 * Alchemy mapping:
 *   - This POC does not write ~/.alchemy credentials or config.
 *   - It discovers accountId after OAuth, then passes:
 *       { accountId, apiToken: alchemy.secret(oauthAccessToken) }
 *     into Alchemy resources.
 *   - This bypasses Alchemy's default Cloudflare OAuth client entirely.
 *
 * POC boundary:
 *   This script proves real Cloudflare OAuth credentials can be handed to
 *   Alchemy as explicit apiToken options without committing secrets. The
 *   product credential store and refresh path live in src/site/cloudflare-oauth.ts
 *   and local ignored .formless/cloudflare-oauth state, not in this POC.
 */

import alchemy from "alchemy";
import { R2Bucket, createCloudflareApi } from "alchemy/cloudflare";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import {
  FORMLESS_CLOUDFLARE_OAUTH_CLIENT_ID,
  FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES,
  FORMLESS_CLOUDFLARE_OAUTH_REDIRECT_URI,
} from "../src/site/cloudflare-oauth.ts";
import { CloudflareTurnstileWidget } from "../src/site/turnstile-alchemy.ts";

const cloudflareApiBaseUrl = "https://api.cloudflare.com/client/v4";
const openIdConfigurationUrl = "https://dash.cloudflare.com/.well-known/openid-configuration";
const fallbackAuthorizationEndpoint = "https://dash.cloudflare.com/oauth2/auth";
const fallbackTokenEndpoint = "https://dash.cloudflare.com/oauth2/token";
const redirectUri = FORMLESS_CLOUDFLARE_OAUTH_REDIRECT_URI;
const testTurnstileDomain = "formless.run";
const requestedOAuthScopes = FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES;
const mutationConfirmation = "create-and-destroy-cloudflare-resources";
const runCommand = `bun scripts/cloudflare-oauth-poc.ts --confirm ${mutationConfirmation}`;

type OAuthEndpoints = {
  authorizationEndpoint: string;
  tokenEndpoint: string;
};

type Authorization = {
  state: string;
  url: string;
  verifier: string;
};

type OAuthCredentials = {
  access: string;
  expires: number;
  refresh: string;
  scopes: string[];
  type: "oauth";
};

type CloudflareAccount = {
  id: string;
  name: string | undefined;
};

type AlchemyScopeForPoc = {
  finalize(options?: { force?: boolean; noop?: boolean }): Promise<void>;
};

type CloudflareApiForPoc = {
  delete(path: string, init?: RequestInit): Promise<Response>;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  if (!args.confirmed) {
    printUsage();
    throw new Error("Refusing to run Cloudflare mutations without the exact --confirm guard.");
  }

  const clientId = FORMLESS_CLOUDFLARE_OAUTH_CLIENT_ID;
  const endpoints = await readOAuthEndpoints();
  const authorization = createAuthorization({
    authorizationEndpoint: endpoints.authorizationEndpoint,
    clientId,
  });

  console.log("Requesting Cloudflare OAuth scopes:");
  for (const scope of requestedOAuthScopes) {
    console.log(`- ${scope}`);
  }
  console.log("");
  console.log("Opening Cloudflare authorization URL:");
  console.log(authorization.url);
  console.log("");
  console.log(`Waiting for OAuth callback on ${redirectUri} ...`);
  openUrl(authorization.url);

  const credentials = await waitForCredentials({
    authorization,
    clientId,
    tokenEndpoint: endpoints.tokenEndpoint,
  });

  console.log("");
  console.log("OAuth credentials received:");
  console.log(JSON.stringify(redactCredentialSummary(credentials), null, 2));

  const account = await selectCloudflareAccount(await listCloudflareAccounts(credentials));
  console.log("");
  console.log(
    `Selected Cloudflare account: ${account.name ? `${account.name} ` : ""}(${account.id})`,
  );

  await assertTurnstileListAuthorized({ accountId: account.id, credentials });
  await runAlchemyResourceProofs({ account, credentials });

  console.log("");
  console.log("POC complete: Formless OAuth token created and destroyed test Alchemy resources.");
}

async function readOAuthEndpoints(): Promise<OAuthEndpoints> {
  try {
    const response = await fetch(openIdConfigurationUrl, {
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const body = (await response.json()) as Partial<{
      authorization_endpoint: unknown;
      token_endpoint: unknown;
    }>;

    return {
      authorizationEndpoint:
        typeof body.authorization_endpoint === "string"
          ? body.authorization_endpoint
          : fallbackAuthorizationEndpoint,
      tokenEndpoint:
        typeof body.token_endpoint === "string" ? body.token_endpoint : fallbackTokenEndpoint,
    };
  } catch {
    return {
      authorizationEndpoint: fallbackAuthorizationEndpoint,
      tokenEndpoint: fallbackTokenEndpoint,
    };
  }
}

function createAuthorization(input: {
  authorizationEndpoint: string;
  clientId: string;
}): Authorization {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(96).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(input.authorizationEndpoint);

  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", requestedOAuthScopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  return { state, url: url.toString(), verifier };
}

async function waitForCredentials(input: {
  authorization: Authorization;
  clientId: string;
  tokenEndpoint: string;
}): Promise<OAuthCredentials> {
  const redirect = new URL(redirectUri);
  const port = Number(redirect.port);
  const pathname = redirect.pathname;

  return new Promise((resolve, reject) => {
    let settled = false;
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url ?? "/", redirectUri);

        if (url.pathname !== pathname) {
          throw new Error("Cloudflare authorization callback path is invalid.");
        }

        const error = url.searchParams.get("error");
        if (error) {
          const description =
            url.searchParams.get("error_description") ?? "Cloudflare authorization failed.";
          throw new Error(
            error === "invalid_scope"
              ? `${description}\n\nUpdate the Formless Cloudflare OAuth client to allow exactly these scopes:\n${requestedOAuthScopes.map((scope) => `- ${scope}`).join("\n")}`
              : description,
          );
        }

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || state !== input.authorization.state) {
          throw new Error("Cloudflare authorization callback is invalid.");
        }

        const credentials = await exchangeCode({
          clientId: input.clientId,
          code,
          tokenEndpoint: input.tokenEndpoint,
          verifier: input.authorization.verifier,
        });

        settled = true;
        clearTimeout(timeout);
        response.statusCode = 200;
        response.setHeader("content-type", "text/plain; charset=utf-8");
        response.end("Formless Cloudflare OAuth POC received credentials. Return to terminal.\n");
        resolve(credentials);
      } catch (error) {
        settled = true;
        clearTimeout(timeout);
        response.statusCode = 400;
        response.setHeader("content-type", "text/plain; charset=utf-8");
        response.end("Formless Cloudflare OAuth POC failed. Return to terminal.\n");
        reject(error);
      } finally {
        server.close();
      }
    });

    const timeout = setTimeout(
      () => {
        if (!settled) {
          settled = true;
          server.close();
          reject(new Error("Cloudflare authorization timed out."));
        }
      },
      1000 * 60 * 5,
    );

    server.on("error", (error) => {
      clearTimeout(timeout);
      settled = true;
      reject(error);
    });
    server.listen(port, "127.0.0.1");
  });
}

async function exchangeCode(input: {
  clientId: string;
  code: string;
  tokenEndpoint: string;
  verifier: string;
}): Promise<OAuthCredentials> {
  const response = await fetch(input.tokenEndpoint, {
    body: new URLSearchParams({
      client_id: input.clientId,
      code: input.code,
      code_verifier: input.verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }).toString(),
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Cloudflare token exchange failed: HTTP ${response.status} ${redactText(text)}`,
    );
  }

  const parsed = parseJson<
    Partial<{
      access_token: string;
      expires_in: number;
      refresh_token: string;
      scope: string;
      token_type: string;
    }>
  >(text, "Cloudflare token exchange response");

  if (
    typeof parsed.access_token !== "string" ||
    typeof parsed.refresh_token !== "string" ||
    typeof parsed.expires_in !== "number" ||
    typeof parsed.scope !== "string"
  ) {
    throw new Error("Cloudflare token exchange response is missing OAuth credential fields.");
  }

  return {
    access: parsed.access_token,
    expires: Date.now() + parsed.expires_in * 1000,
    refresh: parsed.refresh_token,
    scopes: parsed.scope.split(" ").filter(Boolean),
    type: "oauth",
  };
}

async function listCloudflareAccounts(credentials: OAuthCredentials): Promise<CloudflareAccount[]> {
  const accounts = await readCloudflareResult<Array<{ id?: string; name?: string }>>(
    "/accounts",
    credentials,
  );

  return accounts.map((account) => ({
    id: requiredString(account.id, "Cloudflare account id"),
    name: optionalString(account.name),
  }));
}

async function selectCloudflareAccount(accounts: CloudflareAccount[]): Promise<CloudflareAccount> {
  if (accounts.length === 0) {
    throw new Error("No Cloudflare accounts were visible to the OAuth credential.");
  }

  if (accounts.length === 1) {
    return accounts[0] as CloudflareAccount;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Multiple Cloudflare accounts are visible; run interactively to choose one.");
  }

  const choices = accounts
    .map((account, index) => `${index + 1}. ${account.name ?? "(unnamed account)"} (${account.id})`)
    .join("\n");
  const readline = createInterface({ input: process.stdin, output: process.stdout });

  try {
    while (true) {
      console.log("");
      console.log("Cloudflare accounts:");
      console.log(choices);
      const answer = await readline.question(`Select account [1-${accounts.length}]: `);
      const selected = accounts[Number(answer.trim()) - 1];

      if (selected) {
        return selected;
      }

      console.log("Invalid account selection.");
    }
  } finally {
    readline.close();
  }
}

async function assertTurnstileListAuthorized(input: {
  accountId: string;
  credentials: OAuthCredentials;
}): Promise<void> {
  await readCloudflareResult(`/accounts/${input.accountId}/challenges/widgets`, input.credentials);
  console.log("Turnstile widget list authorized.");
}

async function runAlchemyResourceProofs(input: {
  account: CloudflareAccount;
  credentials: OAuthCredentials;
}): Promise<void> {
  const rootDir = await mkdtemp(path.join(tmpdir(), "formless-alchemy-oauth-poc-"));
  const password = randomBytes(24).toString("base64url");
  const apiToken = alchemy.secret(
    input.credentials.access,
    "formless-cloudflare-oauth-poc-access-token",
  );
  const createdResources: unknown[] = [];
  const turnstileName = `Formless OAuth POC ${new Date().toISOString()}`;
  const bucketName = `formless-oauth-poc-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  let turnstileSiteKey: string | undefined;
  let app: AlchemyScopeForPoc | undefined;

  printResourceMutationPlan({
    account: input.account,
    bucketName,
    rootDir,
    turnstileName,
  });

  try {
    app = (await alchemy("formless-cloudflare-oauth-poc", {
      noTrack: true,
      password,
      quiet: true,
      rootDir,
      stage: "happy-path",
    })) as AlchemyScopeForPoc;

    console.log("");
    console.log(`Creating Turnstile widget "${turnstileName}" through Formless Alchemy resource.`);
    const turnstile = await alchemy.run("turnstile-resource", { quiet: true }, async () =>
      CloudflareTurnstileWidget("oauth-token-turnstile", {
        accountId: input.account.id,
        apiToken,
        domains: [testTurnstileDomain],
        mode: "managed",
        name: turnstileName,
      }),
    );
    createdResources.push(turnstile);
    turnstileSiteKey = turnstile.siteKey;
    console.log(
      JSON.stringify(
        {
          domains: turnstile.domains,
          resource: "formless::CloudflareTurnstileWidget",
          siteKey: turnstile.siteKey,
          verificationSecret: "<redacted>",
        },
        null,
        2,
      ),
    );

    console.log("");
    console.log(`Creating R2 bucket "${bucketName}" through built-in Alchemy resource.`);
    const bucket = await alchemy.run("official-r2-resource", { quiet: true }, async () =>
      R2Bucket("oauth-token-r2-bucket", {
        accountId: input.account.id,
        apiToken,
        empty: true,
        name: bucketName,
      }),
    );
    createdResources.push(bucket);
    console.log(
      JSON.stringify(
        {
          accountId: bucket.accountId,
          bucketName: bucket.name,
          resource: "cloudflare::R2Bucket",
        },
        null,
        2,
      ),
    );

    await app.finalize({ force: true });
  } finally {
    await destroyCreatedResources({
      accountId: input.account.id,
      bucketName,
      credentials: input.credentials,
      resources: createdResources,
      rootDir,
      turnstileSiteKey,
      app,
    });
  }
}

async function destroyCreatedResources(input: {
  accountId: string;
  app: AlchemyScopeForPoc | undefined;
  bucketName: string;
  credentials: OAuthCredentials;
  resources: unknown[];
  rootDir: string;
  turnstileSiteKey: string | undefined;
}): Promise<void> {
  const destroyErrors: unknown[] = [];

  for (const resource of [...input.resources].reverse()) {
    try {
      await alchemy.destroy(resource as never, { quiet: true });
    } catch (error) {
      destroyErrors.push(error);
    }
  }

  try {
    await input.app?.finalize({ force: true });
  } finally {
    await rm(input.rootDir, { force: true, recursive: true });
  }

  if (destroyErrors.length === 0) {
    console.log("");
    console.log("Destroyed test Turnstile and R2 resources through Alchemy.");
    return;
  }

  await fallbackCleanup({
    accountId: input.accountId,
    bucketName: input.bucketName,
    credentials: input.credentials,
    turnstileSiteKey: input.turnstileSiteKey,
  });

  throw new Error(`Alchemy destroy failed for ${destroyErrors.length} test resource(s).`);
}

async function fallbackCleanup(input: {
  accountId: string;
  bucketName: string;
  credentials: OAuthCredentials;
  turnstileSiteKey: string | undefined;
}): Promise<void> {
  const api = await createCloudflareApi({
    accountId: input.accountId,
    apiToken: alchemy.secret(
      input.credentials.access,
      "formless-cloudflare-oauth-poc-cleanup-token",
    ),
  });

  if (input.turnstileSiteKey) {
    await deleteIfExists(
      api,
      `/accounts/${input.accountId}/challenges/widgets/${encodeURIComponent(input.turnstileSiteKey)}`,
      "Turnstile fallback cleanup",
    );
  }

  await deleteIfExists(
    api,
    `/accounts/${input.accountId}/r2/buckets/${encodeURIComponent(input.bucketName)}`,
    "R2 fallback cleanup",
  );
}

async function deleteIfExists(
  api: CloudflareApiForPoc,
  pathname: string,
  label: string,
): Promise<void> {
  const response = await api.delete(pathname);
  if (response.ok || response.status === 404) {
    console.log(`${label}: ok`);
    return;
  }

  const text = await response.text();
  console.log(`${label}: HTTP ${response.status} ${redactText(text)}`);
}

async function readCloudflareResult<T = unknown>(
  pathname: string,
  credentials: OAuthCredentials,
): Promise<T> {
  const response = await fetch(`${cloudflareApiBaseUrl}${pathname}`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${credentials.access}`,
    },
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Cloudflare API ${pathname} failed: HTTP ${response.status} ${redactText(text)}`,
    );
  }

  const parsed = parseJson<Partial<{ result: T; success: boolean }>>(
    text,
    `Cloudflare API ${pathname}`,
  );
  if (parsed.success !== true || parsed.result === undefined) {
    throw new Error(`Cloudflare API ${pathname} returned an unsuccessful response.`);
  }

  return parsed.result;
}

function openUrl(url: string): void {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

function parseJson<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label} was not JSON.`);
  }
}

function redactCredentialSummary(credentials: OAuthCredentials): Record<string, unknown> {
  return {
    access: `<redacted:${credentials.access.length}>`,
    expires: credentials.expires,
    refresh: `<redacted:${credentials.refresh.length}>`,
    scopes: credentials.scopes,
    type: credentials.type,
  };
}

function parseArgs(args: string[]): { confirmed: boolean; help: boolean } {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    return { confirmed: false, help: true };
  }

  if (args.length === 2 && args[0] === "--confirm" && args[1] === mutationConfirmation) {
    return { confirmed: true, help: false };
  }

  return { confirmed: false, help: false };
}

function printUsage(): void {
  console.log("Formless Cloudflare OAuth credential POC");
  console.log("");
  console.log("Run:");
  console.log(`  ${runCommand}`);
  console.log("");
  console.log("Creates and destroys exactly these real Cloudflare resources:");
  console.log('- 1 Turnstile widget named "Formless OAuth POC <ISO timestamp>".');
  console.log('- 1 empty R2 bucket named "formless-oauth-poc-<timestamp-base36>-<8-hex>".');
  console.log("");
  console.log("Does not create Workers, DNS records, custom domains, routes, zones, accounts,");
  console.log("Alchemy OAuth profiles, ~/.alchemy credentials/config, or workspace source files.");
}

function printResourceMutationPlan(input: {
  account: CloudflareAccount;
  bucketName: string;
  rootDir: string;
  turnstileName: string;
}): void {
  console.log("");
  console.log("Real Cloudflare mutation plan:");
  console.log(
    JSON.stringify(
      {
        account: {
          id: input.account.id,
          name: input.account.name ?? null,
        },
        creates: [
          {
            domains: [testTurnstileDomain],
            fallbackDestroy:
              "DELETE /accounts/:accountId/challenges/widgets/:siteKey after creation returns siteKey",
            mode: "managed",
            name: input.turnstileName,
            resource: "formless::CloudflareTurnstileWidget",
          },
          {
            empty: true,
            fallbackDestroy: `DELETE /accounts/${input.account.id}/r2/buckets/${input.bucketName}`,
            name: input.bucketName,
            resource: "cloudflare::R2Bucket",
          },
        ],
        destroys: [
          "Alchemy destroy for created resources in reverse order",
          "Fallback Cloudflare API deletes for Turnstile widget and R2 bucket if Alchemy destroy fails",
          `Remove temporary Alchemy root ${input.rootDir}`,
        ],
        secrets: [
          "OAuth access and refresh tokens remain in memory only",
          "Alchemy receives apiToken as alchemy.secret(oauthAccessToken)",
          "No ~/.alchemy credentials or config are written",
        ],
      },
      null,
      2,
    ),
  );
}

function redactText(value: string): string {
  return value
    .replace(/"access_token"\s*:\s*"[^"]+"/g, '"access_token":"<redacted>"')
    .replace(/"refresh_token"\s*:\s*"[^"]+"/g, '"refresh_token":"<redacted>"')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/g, "Bearer <redacted>");
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
