import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";
import packageJson from "../../package.json";

import {
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
} from "../shared/deploy-metadata.ts";
import { packageAppFactsForKey, listInstallableAppPackages } from "@dpeek/formless-installed-apps";
import { bundledAppPackageResolver } from "../shared/app-packages.ts";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import {
  INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  instanceControlPlaneSchema,
} from "@dpeek/formless-instance-control-plane";
import {
  WORKSPACE_GATEWAY_ACTOR_HEADER,
  WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH,
  WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  WORKSPACE_GATEWAY_CSRF_COOKIE_NAME,
  WORKSPACE_GATEWAY_CSRF_HEADER,
  WORKSPACE_GATEWAY_OPERATION_KIND_HEADER,
  WORKSPACE_GATEWAY_OPERATIONS_API_PATH,
  WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
  WORKSPACE_GATEWAY_STATUS_API_PATH,
  handleWorkspaceGatewayLocalProxyRequest,
  handleWorkspaceGatewaySidecarRequest,
  startWorkspaceGatewaySidecar,
  type WorkspaceGatewaySidecar,
} from "@dpeek/formless-gateway/sidecar";
import {
  DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
  INSTANCE_WORKSPACE_MANIFEST_FILE as FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE,
  defaultInstanceWorkspaceManifest as defaultFormlessInstanceWorkspaceManifest,
  formatInstanceWorkspaceManifest as formatFormlessInstanceWorkspaceManifest,
  initialWorkspaceAutoSaveState,
  nextWorkspaceAutoSaveEnqueuedState,
  nextWorkspaceAutoSaveFailedState,
} from "@dpeek/formless-workspace";
import { createOwnerSessionCookie } from "../worker/owner-session.ts";
import { siteSourceSchema } from "../test/schema-apps.ts";
import {
  readInstanceWorkspaceAutoSaveState,
  writeInstanceWorkspaceAutoSaveState,
} from "@dpeek/formless-workspace/node";
import {
  createWorkspaceAutoSaveScheduler,
  createWorkspaceGatewayOperationHandlers,
  createWorkspaceGatewayProxyDependencies,
  type WorkspaceAutoSaveScheduler,
  type WorkspaceGatewayRuntimeDependencies,
  type WorkspaceGatewayRuntimeEnv,
} from "./workspace-gateway-runtime.ts";

const tempDirs: string[] = [];
const sidecars: WorkspaceGatewaySidecar[] = [];
const bootstrapToken = "bootstrap-local-token";
const csrfToken = "csrf-local-token";
const ownerSecret = "owner-session-secret";
const adminToken = "admin-local-token";
const proxyToken = "proxy-local-token";

afterEach(async () => {
  await Promise.all(sidecars.splice(0).map((sidecar) => sidecar.close()));
  await Promise.all(
    tempDirs
      .splice(0)
      .map((tempDir) =>
        rm(tempDir, { force: true, maxRetries: 10, recursive: true, retryDelay: 25 }),
      ),
  );
});

describe("local workspace gateway", () => {
  it("is available only for local workspace runtime env and not Worker runtime profiles", async () => {
    const workspaceRoot = await makeTempDir();
    const env = gatewayEnv(workspaceRoot);
    const deps = gatewayDeps(workspaceRoot);

    await expect(
      handleWorkspaceGatewayLocalProxyRequest(
        new Request("http://local.test/api/formless/app-installs"),
        env,
        createWorkspaceGatewayProxyDependencies(env, deps),
      ),
    ).resolves.toBeUndefined();

    await expect(
      gatewayJson(
        new Request(`http://local.test${WORKSPACE_GATEWAY_STATUS_API_PATH}`, {
          headers: bootstrapHeaders(),
        }),
        { env: { FORMLESS_RUNTIME_PROFILE: "instance" } },
      ),
    ).resolves.toMatchObject({ response: { status: 404 } });

    for (const profile of ["app", "siteAuthoring", "publishedSite"]) {
      const blocked = await gatewayJson(
        new Request(`http://local.test${WORKSPACE_GATEWAY_STATUS_API_PATH}`, {
          headers: bootstrapHeaders(),
        }),
        {
          env: gatewayEnv(workspaceRoot, {
            FORMLESS_RUNTIME_PROFILE: profile,
          }),
        },
      );

      expect(blocked.response.status).toBe(404);
    }
  });

  it("starts a loopback sidecar with generated endpoint, proxy token, and close lifecycle", async () => {
    const workspaceRoot = await makeTempDir();
    const sidecar = await startGatewaySidecar(
      workspaceRoot,
      gatewayDeps(workspaceRoot, { operationIds: ["op_sidecar_status_00000001"] }),
    );
    const endpoint = new URL(sidecar.endpoint);

    expect(endpoint.hostname).toBe("127.0.0.1");
    expect(endpoint.pathname).toBe("/");
    expect(endpoint.protocol).toBe("http:");
    expect(sidecar.proxyToken).toBe(proxyToken);

    const status = await fetch(sidecarPath(sidecar, WORKSPACE_GATEWAY_STATUS_API_PATH), {
      headers: sidecarProxyHeaders({ operation: "status", via: "bootstrap" }),
    });

    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toMatchObject({
      operation: {
        actor: "browser",
        id: "op_sidecar_status_00000001",
        operation: "status",
      },
    });

    await sidecar.close();
    await expect(
      fetch(sidecarPath(sidecar, WORKSPACE_GATEWAY_STATUS_API_PATH), {
        headers: sidecarProxyHeaders({ operation: "status", via: "bootstrap" }),
      }),
    ).rejects.toThrow();
  });

  it("rejects unavailable root and invalid internal proxy token before sidecar execution", async () => {
    const workspaceRoot = await makeTempDir();
    let credentialSetupCalls = 0;
    const unavailableRoot = await handleWorkspaceGatewaySidecarRequest(
      new Request(`http://127.0.0.1${WORKSPACE_GATEWAY_STATUS_API_PATH}`, {
        headers: sidecarProxyHeaders({ operation: "status", via: "bootstrap" }),
      }),
      {
        FORMLESS_LOCAL_WORKSPACE_GATEWAY: "1",
        FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN: proxyToken,
      },
      createWorkspaceGatewayOperationHandlers(gatewayDeps(workspaceRoot)),
    );

    expect(unavailableRoot?.status).toBe(404);

    const rejected = await handleWorkspaceGatewaySidecarRequest(
      operationRequest(
        { kind: "credentialSetup", provider: "cloudflare" },
        sidecarProxyHeaders({
          operation: "credentialSetup",
          token: "wrong-token",
          via: "owner-session",
        }),
      ),
      gatewayEnv(workspaceRoot, { FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN: proxyToken }),
      createWorkspaceGatewayOperationHandlers(
        gatewayDeps(workspaceRoot, {
          credentialSetup: async () => {
            credentialSetupCalls += 1;
            throw new Error("Unexpected credential setup.");
          },
        }),
      ),
    );

    expect(rejected?.status).toBe(401);
    await expect(rejected?.json()).resolves.toEqual({
      error: "Workspace gateway proxy authorization is required.",
    });
    expect(credentialSetupCalls).toBe(0);
  });

  it("allows direct non-browser admin bearer automation at the sidecar", async () => {
    const workspaceRoot = await makeTempDir();
    const sidecar = await startGatewaySidecar(
      workspaceRoot,
      gatewayDeps(workspaceRoot, {
        credentialSetupUrl: "https://dash.cloudflare.com/oauth2/authorize?client_id=formless",
        operationIds: ["op_sidecar_admin_00000001"],
      }),
    );
    const response = await fetch(sidecarPath(sidecar, WORKSPACE_GATEWAY_OPERATIONS_API_PATH), {
      body: JSON.stringify({ kind: "credentialSetup", provider: "cloudflare" }),
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      operation: {
        actor: "automation",
        id: "op_sidecar_admin_00000001",
        operation: "credentialSetup",
      },
    });
  });

  it("persists sidecar operation progress and keeps direct sidecar responses display-safe", async () => {
    const workspaceRoot = await makeTempDir();
    const sidecar = await startGatewaySidecar(
      workspaceRoot,
      gatewayDeps(workspaceRoot, {
        credentialSetup: async () => ({
          result: {
            details: {
              providerToken: "secret-token",
              rawAdapterOutput: "raw adapter output CF_API_TOKEN=secret-token",
            },
            summary: {
              fields: {
                provider: "cloudflare",
                token: "secret-token",
              },
              title: "Cloudflare credentials ready",
            },
          },
          status: "succeeded",
        }),
        operationIds: ["op_sidecar_progress_00000001"],
      }),
    );
    const started = await fetch(sidecarPath(sidecar, WORKSPACE_GATEWAY_OPERATIONS_API_PATH), {
      body: JSON.stringify({ kind: "credentialSetup", provider: "cloudflare" }),
      headers: {
        "Content-Type": "application/json",
        ...sidecarProxyHeaders({
          operation: "credentialSetup",
          via: "owner-session",
        }),
      },
      method: "POST",
    });
    const startedBody = (await started.json()) as Record<string, unknown>;
    const serializedStarted = JSON.stringify(startedBody);

    expect(started.status).toBe(200);
    expect(serializedStarted).not.toContain("secret-token");
    expect(serializedStarted).not.toContain("raw adapter");

    const read = await fetch(
      sidecarPath(sidecar, `${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/op_sidecar_progress_00000001`),
      {
        headers: sidecarProxyHeaders({ via: "owner-session" }),
      },
    );
    const readBody = (await read.json()) as Record<string, unknown>;

    expect(read.status).toBe(200);
    expect(readBody).toMatchObject({
      operation: {
        id: "op_sidecar_progress_00000001",
        logs: [{ message: "credentialSetup started." }, { message: "credentialSetup completed." }],
        operation: "credentialSetup",
        status: "succeeded",
      },
    });
    expect(JSON.stringify(readBody)).not.toContain("secret-token");
    expect(JSON.stringify(readBody)).not.toContain("raw adapter");
  });

  it("allows the process-scoped bootstrap capability to read status only", async () => {
    const workspaceRoot = await makeTempDir();

    await writeWorkspaceManifest(workspaceRoot);

    const status = await gatewayJson(
      new Request(`http://local.test${WORKSPACE_GATEWAY_STATUS_API_PATH}`, {
        headers: bootstrapHeaders(),
      }),
      { deps: gatewayDeps(workspaceRoot, { operationIds: ["op_status_00000001"] }) },
    );

    expect(status.response.status).toBe(200);
    expect(status.body.operation).toMatchObject({
      actor: "browser",
      id: "op_status_00000001",
      operation: "status",
      status: "succeeded",
      summary: {
        fields: { initialized: true },
        title: "Workspace status",
      },
    });

    await expect(
      stat(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE)),
    ).resolves.toMatchObject({});
    await expect(stat(path.join(workspaceRoot, "archives"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(path.join(workspaceRoot, "records"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(path.join(workspaceRoot, "media"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const expired = await gatewayJson(
      new Request(`http://local.test${WORKSPACE_GATEWAY_STATUS_API_PATH}`, {
        headers: bootstrapHeaders(),
      }),
      { deps: gatewayDeps(workspaceRoot, { setupComplete: true }) },
    );

    expect(expired.response.status).toBe(403);
    expect(expired.body.error).toBe("Workspace bootstrap authorization has expired.");
  });

  it("rejects bootstrap escalation and arbitrary filesystem or shell-shaped input", async () => {
    const workspaceRoot = await makeTempDir();

    for (const body of [
      { kind: "save" },
      { kind: "pull" },
      { kind: "push" },
      { kind: "credentialSetup", provider: "cloudflare" },
    ]) {
      const rejected = await gatewayJson(operationRequest(body, bootstrapHeaders()), {
        deps: gatewayDeps(workspaceRoot),
      });

      expect(rejected.response.status).toBe(403);
      expect(rejected.body.error).toBe(
        "Workspace bootstrap authorization is limited to status operations.",
      );
    }

    const init = await gatewayJson(
      operationRequest({ kind: "init", name: "personal-sites" }, bootstrapHeaders()),
      {
        deps: gatewayDeps(workspaceRoot),
      },
    );

    expect(init.response.status).toBe(400);
    expect(init.body.error).toBe('Workspace gateway operation "init" is not supported.');

    for (const body of [
      { kind: "status", workspacePath: "../outside" },
      { kind: "status", command: "rm -rf /tmp/workspace" },
      { kind: "status", rawAdapterOutput: "hidden" },
      { kind: "status", providerState: { account: "raw" } },
      { kind: "init", name: "CF_API_TOKEN=secret" },
      { apiToken: "pasted-browser-token", kind: "credentialSetup", provider: "cloudflare" },
      { globalApiKey: "pasted-browser-key", kind: "credentialSetup", provider: "cloudflare" },
      {
        cloudflareApiToken: "token-management-bootstrap",
        kind: "credentialSetup",
        provider: "cloudflare",
      },
    ]) {
      const rejected = await gatewayJson(operationRequest(body, bootstrapHeaders()), {
        deps: gatewayDeps(workspaceRoot),
      });

      expect(rejected.response.status).toBe(400);
    }
  });

  it("gates local gateway starts on required execution capability before execution", async () => {
    const workspaceRoot = await makeTempDir();
    const cookie = await ownerCookie();
    let credentialSetupCalls = 0;
    const rejected = await gatewayJson(
      operationRequest(
        { kind: "credentialSetup", provider: "cloudflare" },
        browserHeaders({ cookie, csrf: true }),
      ),
      {
        deps: gatewayDeps(workspaceRoot, {
          credentialSetup: async () => {
            credentialSetupCalls += 1;
            throw new Error("Credential setup should not execute.");
          },
          operationCapabilities: ["workspace-read"],
        }),
      },
    );

    expect(rejected.response.status).toBe(403);
    expect(rejected.body.error).toBe(
      'Workspace operation "credentialSetup" requires execution capability "credential-setup".',
    );
    expect(credentialSetupCalls).toBe(0);
  });

  it("requires same-origin owner session and CSRF proof for browser mutations", async () => {
    const workspaceRoot = await makeTempDir();
    const cookie = await ownerCookie();
    const deps = gatewayDeps(workspaceRoot, {
      credentialSetupUrl: "https://dash.cloudflare.com/oauth2/authorize?client_id=formless",
      operationIds: ["op_missing_csrf", "op_cross_origin", "op_credential_00000001"],
    });

    const missingCsrf = await gatewayJson(
      operationRequest(
        { kind: "credentialSetup", profileLabel: "Default", provider: "cloudflare" },
        browserHeaders({ cookie }),
      ),
      { deps },
    );
    expect(missingCsrf.response.status).toBe(403);
    expect(missingCsrf.body.error).toBe("Workspace gateway browser mutations require CSRF proof.");

    const crossOrigin = await gatewayJson(
      operationRequest(
        { kind: "credentialSetup", provider: "cloudflare" },
        browserHeaders({
          cookie,
          csrf: true,
          origin: "http://other.test",
        }),
      ),
      { deps },
    );
    expect(crossOrigin.response.status).toBe(403);

    const accepted = await gatewayJson(
      operationRequest(
        { kind: "credentialSetup", profileLabel: "Default", provider: "cloudflare" },
        browserHeaders({ cookie, csrf: true }),
      ),
      { deps },
    );

    expect(accepted.response.status).toBe(200);
    expect(accepted.body.operation).toMatchObject({
      actor: "browser",
      events: [
        {
          profileLabel: "Default",
          provider: "cloudflare",
          status: "waiting",
          type: "externalAuthorizationUrl",
          url: "https://dash.cloudflare.com/oauth2/authorize?client_id=formless",
        },
      ],
      operation: "credentialSetup",
      status: "succeeded",
    });
    expect(JSON.stringify(accepted.body)).not.toContain("secret-token");
    expect(JSON.stringify(accepted.body)).not.toContain("raw adapter");
  });

  it("exposes auto-save status and enqueue through the local gateway", async () => {
    const workspaceRoot = await makeTempDir();
    const cookie = await ownerCookie();
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    const scheduler = createWorkspaceAutoSaveScheduler({
      clearTimeout: () => undefined,
      debounceMs: 25,
      now: timestampSequence(
        "2026-06-02T01:00:00.000Z",
        "2026-06-02T01:00:01.000Z",
        "2026-06-02T01:00:02.000Z",
      ),
      save: async () => undefined,
      setTimeout: (callback, delayMs) => {
        scheduled.push({ callback, delayMs });
        return callback;
      },
    });
    const deps = gatewayDeps(workspaceRoot, { autoSaveScheduler: scheduler });
    const status = await gatewayJson(
      new Request(`http://local.test${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`, {
        headers: bootstrapHeaders(),
      }),
      { deps },
    );
    const enqueued = await gatewayJson(
      new Request(`http://local.test${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`, {
        body: JSON.stringify({ source: "schema-save", storageIdentity: "app:site" }),
        headers: {
          "Content-Type": "application/json",
          ...browserHeaders({ cookie, csrf: true }),
        },
        method: "POST",
      }),
      { deps },
    );
    const persisted = await readInstanceWorkspaceAutoSaveState(
      path.join(workspaceRoot, ".formless/local"),
    );

    expect(status.response.status).toBe(200);
    expect(status.body.autoSave).toMatchObject({
      displayState: "clean",
      dirtyGeneration: 0,
    });
    expect(enqueued.response.status).toBe(200);
    expect(enqueued.body).toMatchObject({
      autoSave: {
        dirtyGeneration: 1,
        displayState: "queued",
        storageIdentities: ["app:site"],
        writeSources: ["schema-save"],
      },
      csrfToken,
    });
    expect(persisted).toMatchObject({
      dirtyGeneration: 1,
      displayState: "queued",
      storageIdentities: ["app:site"],
      writeSources: ["schema-save"],
    });
    expect(scheduled.map((entry) => entry.delayMs)).toEqual([25]);
    expect(JSON.stringify(enqueued.body)).not.toContain(workspaceRoot);
  });

  it("passes browser-selected Cloudflare account id to credential setup without token input", async () => {
    const workspaceRoot = await makeTempDir();
    const cookie = await ownerCookie();
    const credentialSetupInputs: Array<{
      accountId?: string;
      profileLabel?: string;
      provider: "cloudflare";
    }> = [];
    const accepted = await gatewayJson(
      operationRequest(
        {
          accountId: "acct_personal",
          kind: "credentialSetup",
          profileLabel: "personal",
          provider: "cloudflare",
        },
        browserHeaders({ cookie, csrf: true }),
      ),
      {
        deps: gatewayDeps(workspaceRoot, {
          credentialSetup: async (input) => {
            credentialSetupInputs.push({
              accountId: input.accountId,
              profileLabel: input.profileLabel,
              provider: input.provider,
            });

            return {
              result: {
                summary: {
                  fields: {
                    profile: input.profileLabel ?? "default",
                    provider: input.provider,
                    selectedAccountId: input.accountId ?? "",
                    status: "validated",
                  },
                  title: "Cloudflare credentials ready",
                },
              },
              status: "succeeded",
            };
          },
          operationIds: ["op_credential_account_00000001"],
        }),
      },
    );

    expect(accepted.response.status).toBe(200);
    expect(credentialSetupInputs).toEqual([
      {
        accountId: "acct_personal",
        profileLabel: "personal",
        provider: "cloudflare",
      },
    ]);
    expect(accepted.body.operation).toMatchObject({
      id: "op_credential_account_00000001",
      input: {
        accountId: "acct_personal",
        profileLabel: "personal",
        provider: "cloudflare",
      },
      operation: "credentialSetup",
      status: "succeeded",
      summary: {
        fields: {
          profile: "personal",
          provider: "cloudflare",
          selectedAccountId: "acct_personal",
          status: "validated",
        },
        title: "Cloudflare credentials ready",
      },
    });
    expect(JSON.stringify(accepted.body)).not.toContain("pasted-browser-token");
  });

  it("runs Cloudflare credential setup through the sidecar without exposing local secrets", async () => {
    const workspaceRoot = await makeTempDir();
    const cookie = await ownerCookie();
    const credentialSetupInputs: Array<{
      profileLabel?: string;
      provider: "cloudflare";
      workspaceRoot: string;
    }> = [];
    const accepted = await gatewayJson(
      operationRequest(
        {
          kind: "credentialSetup",
          profileLabel: "personal",
          provider: "cloudflare",
        },
        browserHeaders({ cookie, csrf: true }),
      ),
      {
        deps: gatewayDeps(workspaceRoot, {
          credentialSetup: async (input) => {
            credentialSetupInputs.push({
              profileLabel: input.profileLabel,
              provider: input.provider,
              workspaceRoot: input.workspaceRoot,
            });

            return {
              events: [
                {
                  at: "2026-06-02T01:00:02.000Z",
                  profileLabel: input.profileLabel ?? "Default",
                  provider: "cloudflare",
                  status: "waiting",
                  type: "externalAuthorizationUrl",
                  url: "https://dash.cloudflare.com/oauth2/authorize?client_id=formless",
                },
              ],
              result: {
                details: {
                  alchemyPassword: "alchemy-password",
                  providerToken: "cloudflare-provider-token",
                  rawAdapterOutput: "CLOUDFLARE_API_TOKEN=cloudflare-provider-token",
                },
                summary: {
                  fields: {
                    localSecretPassword: "local-secret-value",
                    profile: input.profileLabel ?? "default",
                    provider: input.provider,
                  },
                  title: "Cloudflare credential setup waiting",
                },
              },
              status: "running",
            };
          },
          operationIds: ["op_credential_sidecar_00000001"],
        }),
      },
    );
    const serialized = JSON.stringify(accepted.body);

    expect(accepted.response.status).toBe(200);
    expect(credentialSetupInputs).toEqual([
      {
        profileLabel: "personal",
        provider: "cloudflare",
        workspaceRoot,
      },
    ]);
    expect(accepted.body.operation).toMatchObject({
      actor: "browser",
      events: [
        {
          profileLabel: "personal",
          provider: "cloudflare",
          status: "waiting",
          type: "externalAuthorizationUrl",
          url: "https://dash.cloudflare.com/oauth2/authorize?client_id=formless",
        },
      ],
      id: "op_credential_sidecar_00000001",
      operation: "credentialSetup",
      status: "running",
    });
    expect(serialized).not.toContain("cloudflare-provider-token");
    expect(serialized).not.toContain("alchemy-password");
    expect(serialized).not.toContain("local-secret-value");
    expect(serialized).not.toContain(workspaceRoot);
    expect(serialized).not.toContain(accepted.sidecar.endpoint);
    expect(serialized).not.toContain(proxyToken);
  });

  it("allows admin bearer only for non-browser automation callers", async () => {
    const workspaceRoot = await makeTempDir();
    const deps = gatewayDeps(workspaceRoot, {
      credentialSetupUrl: "https://dash.cloudflare.com/oauth2/authorize?client_id=formless",
      operationIds: ["op_admin_00000001"],
    });

    const automation = await gatewayJson(
      operationRequest(
        { kind: "credentialSetup", provider: "cloudflare" },
        { Authorization: `Bearer ${adminToken}` },
      ),
      { deps },
    );

    expect(automation.response.status).toBe(200);
    expect(automation.body.operation).toMatchObject({
      actor: "automation",
      id: "op_admin_00000001",
      operation: "credentialSetup",
    });
    expect(automation.body).not.toHaveProperty("csrfToken");

    const browserBearer = await gatewayJson(
      operationRequest(
        { kind: "credentialSetup", provider: "cloudflare" },
        {
          Authorization: `Bearer ${adminToken}`,
          Origin: "http://local.test",
        },
      ),
      { deps: gatewayDeps(workspaceRoot) },
    );

    expect(browserBearer.response.status).toBe(401);
  });

  it("rejects unsupported standalone deployment gateway operations before execution", async () => {
    const workspaceRoot = await makeTempDir();
    const cookie = await ownerCookie();
    let executed = false;

    for (const kind of ["deployPlan", "deployApply", "deploymentRefresh"]) {
      const rejected = await gatewayJson(
        operationRequest({ kind }, browserHeaders({ cookie, csrf: true })),
        {
          deps: gatewayDeps(workspaceRoot, {
            fetch: async () => {
              executed = true;
              return Response.json({});
            },
          }),
        },
      );

      expect(rejected.response.status).toBe(400);
      expect(rejected.body.error).toBe(`Workspace gateway operation "${kind}" is not supported.`);
    }

    expect(executed).toBe(false);
  });

  it("scopes operation ids to the configured workspace root", async () => {
    const workspaceRoot = await makeTempDir();
    const otherWorkspaceRoot = await makeTempDir();
    const started = await gatewayJson(
      new Request(`http://local.test${WORKSPACE_GATEWAY_STATUS_API_PATH}`, {
        headers: bootstrapHeaders(),
      }),
      { deps: gatewayDeps(workspaceRoot, { operationIds: ["op_status_scoped"] }) },
    );

    expect(started.response.status).toBe(200);

    const otherRead = await gatewayJson(
      new Request(`http://local.test${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/op_status_scoped`, {
        headers: {
          ...bootstrapHeaders(),
          [WORKSPACE_GATEWAY_OPERATION_KIND_HEADER]: "status",
        },
      }),
      {
        deps: gatewayDeps(otherWorkspaceRoot),
        env: gatewayEnv(otherWorkspaceRoot),
      },
    );

    expect(otherRead.response.status).toBe(404);

    const invalid = await gatewayJson(
      new Request(`http://local.test${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/..%2Fsecret`, {
        headers: bootstrapHeaders(),
      }),
      { deps: gatewayDeps(workspaceRoot) },
    );

    expect(invalid.response.status).toBe(400);
  });

  it("redacts invalid authorization handoff output from trusted adapters", async () => {
    const workspaceRoot = await makeTempDir();
    const cookie = await ownerCookie();
    const rejected = await gatewayJson(
      operationRequest(
        { kind: "credentialSetup", provider: "cloudflare" },
        browserHeaders({ cookie, csrf: true }),
      ),
      {
        deps: gatewayDeps(workspaceRoot, {
          credentialSetupUrl: "https://example.com/oauth/token?token=secret",
          operationIds: ["op_bad_auth_url"],
        }),
      },
    );

    expect(rejected.response.status).toBe(200);
    expect(rejected.body.operation).toMatchObject({
      operation: "credentialSetup",
      status: "failed",
      summary: {
        title: "Operation failed",
      },
    });
    expect(JSON.stringify(rejected.body)).not.toContain("https://example.com");
    expect(JSON.stringify(rejected.body)).not.toContain("token=secret");
  });
});

describe("workspace auto-save scheduler", () => {
  it("executes queued default auto-save through Authority-backed compact workspace writers", async () => {
    const workspaceRoot = await makeTempDir();
    const requests: CapturedRequest[] = [];
    const handlers = createWorkspaceGatewayOperationHandlers(
      gatewayDeps(workspaceRoot, {
        autoSaveDebounceMs: 0,
        fetch: workspaceSaveFetch(requests, "site"),
        operationIds: ["op_auto_save_00000001"],
        timestamps: [
          "2026-06-02T02:10:00.000Z",
          "2026-06-02T02:10:01.000Z",
          "2026-06-02T02:10:02.000Z",
          "2026-06-02T02:10:03.000Z",
          "2026-06-02T02:10:04.000Z",
          "2026-06-02T02:10:05.000Z",
          "2026-06-02T02:10:06.000Z",
        ],
      }),
    );

    await writeWorkspaceManifest(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless/local"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/local/dev.env"),
      "FORMLESS_ADMIN_TOKEN=local-save-token\nFORMLESS_OWNER_SESSION_SECRET=local-owner-secret\n",
    );
    await handlers.enqueueAutoSave({
      authorization: { actor: "browser", via: "owner-session" },
      enqueue: { source: "app-operation", storageIdentity: "app:site" },
      request: new Request("http://local.test"),
      workspaceRoot,
    });
    await waitUntil(async () => {
      const state = await readInstanceWorkspaceAutoSaveState(
        path.join(workspaceRoot, DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT),
      );

      return state?.displayState === "saved";
    });

    const autoSaveState = await readInstanceWorkspaceAutoSaveState(
      path.join(workspaceRoot, DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT),
    );
    const instanceState = JSON.parse(
      await readFile(path.join(workspaceRoot, "state/instance.json"), "utf8"),
    ) as StorageSnapshot;
    const appState = JSON.parse(
      await readFile(path.join(workspaceRoot, "state/apps/site.json"), "utf8"),
    ) as StorageSnapshot;

    expect(autoSaveState).toMatchObject({
      dirtyGeneration: 1,
      displayState: "saved",
      savedGeneration: 1,
      storageIdentities: [],
      suppressed: { reason: "auto-save" },
      writeSources: [],
    });
    expect(instanceState).toMatchObject({
      kind: STORAGE_SNAPSHOT_KIND,
      storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
    });
    expect(appState).toMatchObject({
      kind: STORAGE_SNAPSHOT_KIND,
      storageIdentity: "app:site",
    });
    await expect(stat(path.join(workspaceRoot, "archives"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(path.join(workspaceRoot, "state/media"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:5173/api/formless/app-installs",
      "GET http://localhost:5173/api/formless/control-plane/snapshot?actorKind=cliDeployer",
      "GET http://localhost:5173/api/app-installs/site/site/snapshot",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer local-save-token",
      "Bearer local-save-token",
      "Bearer local-save-token",
    ]);
  });

  it("lets manual gateway save flush failed dirty auto-save state", async () => {
    const workspaceRoot = await makeTempDir();
    const requests: CapturedRequest[] = [];
    const cookie = await ownerCookie();
    const localStateRoot = path.join(workspaceRoot, DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT);
    const failedState = nextWorkspaceAutoSaveFailedState(
      nextWorkspaceAutoSaveEnqueuedState(
        initialWorkspaceAutoSaveState({
          now: () => "2026-06-02T02:20:00.000Z",
        }),
        {
          now: () => "2026-06-02T02:20:01.000Z",
          source: "app-operation",
          storageIdentity: "app:site",
        },
      ),
      {
        error: new Error(`${workspaceRoot}/state failed`),
        now: () => "2026-06-02T02:20:02.000Z",
        workspaceRoot,
      },
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeInstanceWorkspaceAutoSaveState({
      localStateRoot,
      state: failedState,
      workspaceRoot,
    });
    await writeFile(
      path.join(workspaceRoot, ".formless/local/dev.env"),
      "FORMLESS_ADMIN_TOKEN=local-save-token\nFORMLESS_OWNER_SESSION_SECRET=local-owner-secret\n",
    );

    const saved = await gatewayJson(
      operationRequest({ kind: "save" }, browserHeaders({ cookie, csrf: true })),
      {
        deps: gatewayDeps(workspaceRoot, {
          fetch: workspaceSaveFetch(requests, "site"),
          operationIds: ["op_manual_save_00000001"],
          timestamps: [
            "2026-06-02T02:20:03.000Z",
            "2026-06-02T02:20:04.000Z",
            "2026-06-02T02:20:05.000Z",
            "2026-06-02T02:20:06.000Z",
            "2026-06-02T02:20:07.000Z",
          ],
        }),
      },
    );
    const autoSaveState = await readInstanceWorkspaceAutoSaveState(localStateRoot);

    expect(saved.body.operation).toMatchObject({
      operation: "save",
      status: "succeeded",
    });
    expect(autoSaveState).toMatchObject({
      dirtyGeneration: 1,
      displayState: "saved",
      retryCount: 0,
      savedGeneration: 1,
      storageIdentities: [],
      suppressed: { reason: "manual-save" },
      writeSources: [],
    });
  });

  it("coalesces dirty generations, serializes saves, and records retryable failures", async () => {
    const workspaceRoot = await makeTempDir();
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    const saves: Array<{ dirtyGeneration: number; sources: readonly string[] }> = [];
    let failNextSave = true;
    const scheduler = createWorkspaceAutoSaveScheduler({
      clearTimeout: () => undefined,
      debounceMs: 50,
      maxRetries: 1,
      now: timestampSequence(
        "2026-06-02T02:00:00.000Z",
        "2026-06-02T02:00:01.000Z",
        "2026-06-02T02:00:02.000Z",
        "2026-06-02T02:00:03.000Z",
        "2026-06-02T02:00:04.000Z",
        "2026-06-02T02:00:05.000Z",
        "2026-06-02T02:00:06.000Z",
        "2026-06-02T02:00:07.000Z",
      ),
      retryBackoffMs: (retryCount) => retryCount * 100,
      save: async (input) => {
        saves.push({
          dirtyGeneration: input.dirtyGeneration,
          sources: input.writeSources,
        });

        if (failNextSave) {
          failNextSave = false;
          throw new Error(`${workspaceRoot}/state failed`);
        }
      },
      setTimeout: (callback, delayMs) => {
        scheduled.push({ callback, delayMs });
        return callback;
      },
    });

    await scheduler.enqueue({
      source: "app-operation",
      storageIdentity: "app:site",
      workspaceRoot,
    });
    await scheduler.enqueue({
      source: "deployment-intent",
      storageIdentity: "instance:control-plane",
      workspaceRoot,
    });

    expect(scheduled.map((entry) => entry.delayMs)).toEqual([50, 50]);

    const failed = await scheduler.runNow(workspaceRoot);

    expect(failed).toMatchObject({
      dirtyGeneration: 2,
      displayState: "failed",
      retryCount: 1,
      savedGeneration: 0,
      storageIdentities: ["app:site", "instance:control-plane"],
      writeSources: ["app-operation", "deployment-intent"],
    });
    expect(failed.error?.message).toBe("<workspace>/state failed");
    expect(scheduled.map((entry) => entry.delayMs)).toEqual([50, 50, 100]);

    const saved = await scheduler.runNow(workspaceRoot);

    expect(saved).toMatchObject({
      dirtyGeneration: 2,
      displayState: "saved",
      retryCount: 0,
      savedGeneration: 2,
      storageIdentities: [],
      writeSources: [],
    });
    expect(saves).toEqual([
      {
        dirtyGeneration: 2,
        sources: ["app-operation", "deployment-intent"],
      },
      {
        dirtyGeneration: 2,
        sources: ["app-operation", "deployment-intent"],
      },
    ]);
  });
});

async function gatewayJson(
  request: Request,
  options: {
    deps?: WorkspaceGatewayRuntimeDependencies;
    env?: WorkspaceGatewayRuntimeEnv;
  } = {},
) {
  const workspaceRoot = options.deps?.cwd ?? (await makeTempDir());
  const deps = options.deps ?? gatewayDeps(workspaceRoot);
  const sidecar = await startGatewaySidecar(
    workspaceRoot,
    deps,
    gatewayEnv(workspaceRoot, options.env),
  );
  const proxyEnv = proxyGatewayEnv(options.env ?? gatewayEnv(workspaceRoot), sidecar);
  const proxyDeps = { ...deps, proxyFetch: fetch };
  const response = await handleWorkspaceGatewayLocalProxyRequest(
    request,
    proxyEnv,
    createWorkspaceGatewayProxyDependencies(proxyEnv, proxyDeps),
  );

  if (!response) {
    throw new Error("Expected local workspace gateway response.");
  }

  return {
    body: (await response.json()) as Record<string, unknown>,
    response,
    sidecar,
  };
}

async function startGatewaySidecar(
  workspaceRoot: string,
  deps: WorkspaceGatewayRuntimeDependencies,
  env: WorkspaceGatewayRuntimeEnv = gatewayEnv(workspaceRoot),
): Promise<WorkspaceGatewaySidecar> {
  const sidecar = await startWorkspaceGatewaySidecar(
    {
      env,
      workspaceRoot,
    },
    {
      createProxyToken: () => proxyToken,
      operations: createWorkspaceGatewayOperationHandlers(deps),
    },
  );

  sidecars.push(sidecar);
  return sidecar;
}

function proxyGatewayEnv(
  env: WorkspaceGatewayRuntimeEnv,
  sidecar: WorkspaceGatewaySidecar,
): WorkspaceGatewayRuntimeEnv {
  return {
    ...env,
    [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: sidecar.proxyToken,
    [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: sidecar.endpoint,
  };
}

function sidecarPath(sidecar: WorkspaceGatewaySidecar, pathname: string): string {
  return new URL(pathname, sidecar.endpoint).toString();
}

function sidecarProxyHeaders(input: {
  operation?: string;
  token?: string;
  via: "admin-bearer" | "bootstrap" | "owner-session";
}): Record<string, string> {
  return {
    [WORKSPACE_GATEWAY_ACTOR_HEADER]: input.via === "admin-bearer" ? "automation" : "browser",
    [WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER]: input.via,
    ...(input.operation === undefined
      ? {}
      : { [WORKSPACE_GATEWAY_OPERATION_KIND_HEADER]: input.operation }),
    [WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER]: input.token ?? proxyToken,
  };
}

function operationRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://local.test${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    method: "POST",
  });
}

function gatewayEnv(
  workspaceRoot: string,
  overrides: Partial<WorkspaceGatewayRuntimeEnv> = {},
): WorkspaceGatewayRuntimeEnv {
  return {
    FORMLESS_ADMIN_TOKEN: adminToken,
    FORMLESS_LOCAL_WORKSPACE_GATEWAY: "1",
    FORMLESS_OWNER_SESSION_SECRET: ownerSecret,
    FORMLESS_RUNTIME_PROFILE: "instance",
    FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN: bootstrapToken,
    FORMLESS_WORKSPACE_GATEWAY_CSRF_TOKEN: csrfToken,
    FORMLESS_WORKSPACE_GATEWAY_ROOT: workspaceRoot,
    ...overrides,
  };
}

function gatewayDeps(
  workspaceRoot: string,
  options: {
    accountDiscovery?: {
      listAccounts: () => Promise<Array<{ id: string; workersDevSubdomain: string }>>;
    };
    autoSaveDebounceMs?: number;
    autoSaveScheduler?: WorkspaceAutoSaveScheduler;
    credentialSetup?: WorkspaceGatewayRuntimeDependencies["credentialSetup"];
    credentialSetupUrl?: string;
    deploymentAdapter?: {
      deploy: (input: { plan: { expectedUrl: { url: string } } }) => Promise<{ url: string }>;
    };
    fetch?: typeof fetch;
    operationIds?: string[];
    operationCapabilities?: WorkspaceGatewayRuntimeDependencies["operationCapabilities"];
    packageRoot?: string;
    packageVersion?: string;
    randomTokens?: string[];
    setupComplete?: boolean;
    timestamps?: string[];
  } = {},
): WorkspaceGatewayRuntimeDependencies {
  const operationIds = [...(options.operationIds ?? [])];
  const randomTokens = [...(options.randomTokens ?? [])];

  return {
    accountDiscovery: options.accountDiscovery ?? {
      listAccounts: async () => [{ id: "account-123", workersDevSubdomain: "dpeek" }],
    },
    ...(options.autoSaveDebounceMs === undefined
      ? {}
      : { autoSaveDebounceMs: options.autoSaveDebounceMs }),
    ...(options.autoSaveScheduler === undefined
      ? {}
      : { autoSaveScheduler: options.autoSaveScheduler }),
    createOperationId: () => operationIds.shift() ?? "op_test_00000001",
    credentialSetup:
      options.credentialSetup ??
      (options.credentialSetupUrl === undefined
        ? undefined
        : async (input) => ({
            events: [
              {
                at: "2026-06-02T01:00:02.000Z",
                profileLabel: input.profileLabel ?? "Default",
                provider: "cloudflare",
                status: "waiting",
                type: "externalAuthorizationUrl",
                url: options.credentialSetupUrl ?? "",
              },
            ],
            result: {
              details: {
                rawAdapterOutput: "raw adapter output CF_API_TOKEN=secret-token",
              },
              summary: {
                fields: {
                  provider: "cloudflare",
                },
                title: "Credential setup started",
              },
            },
          })),
    cwd: workspaceRoot,
    deploymentAdapter: options.deploymentAdapter ?? {
      deploy: async (input: { plan: { expectedUrl: { url: string } } }) => ({
        url: input.plan.expectedUrl.url,
      }),
    },
    fetch:
      options.fetch ??
      (async () => Response.json({ setupComplete: options.setupComplete ?? false })),
    healthCheck: {
      check: async (input: { expectedVersion: string; url: string }) => ({
        cacheControl: "no-store",
        metadataUrl: new URL("/api/formless/deploy", `${input.url}/`).toString(),
        packageVersion: input.expectedVersion,
        runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
        storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
        url: input.url,
        version: input.expectedVersion,
      }),
    },
    localSecretEnv: {
      ensure: async (input: { root: string }) => ({
        created: false,
        path: path.join(input.root, "deploy.env"),
        secrets: { ALCHEMY_PASSWORD: "alchemy-password" },
      }),
    },
    now: timestampSequence(...(options.timestamps ?? ["2026-06-02T01:00:00.000Z"])),
    ...(options.operationCapabilities === undefined
      ? {}
      : { operationCapabilities: options.operationCapabilities }),
    packageRoot: options.packageRoot ?? process.cwd(),
    packageVersion: options.packageVersion ?? packageJson.version,
    randomToken: () => randomTokens.shift() ?? "generated-token",
    readOwnerSetupStatus: async () => ({ setupComplete: options.setupComplete ?? false }),
    setupCapability: {
      create: async (input: { deploymentUrl: string }) => ({
        capabilityCreated: true,
        endpointUrl: new URL(
          "/api/formless/setup/capability",
          `${input.deploymentUrl}/`,
        ).toString(),
        setupComplete: false,
      }),
    },
  };
}

function bootstrapHeaders(): Record<string, string> {
  return {
    [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
    Origin: "http://local.test",
  };
}

function browserHeaders(input: {
  cookie: string;
  csrf?: boolean;
  origin?: string;
}): Record<string, string> {
  return {
    Cookie: [
      input.cookie,
      ...(input.csrf ? [`${WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=${csrfToken}`] : []),
    ].join("; "),
    ...(input.csrf ? { [WORKSPACE_GATEWAY_CSRF_HEADER]: csrfToken } : {}),
    Origin: input.origin ?? "http://local.test",
  };
}

async function ownerCookie(): Promise<string> {
  const created = await createOwnerSessionCookie({
    env: { FORMLESS_OWNER_SESSION_SECRET: ownerSecret },
    now: "2026-06-02T01:00:00.000Z",
    owner: { createdAt: "2026-06-02T01:00:00.000Z", id: "owner-1", name: "Ada Owner" },
    request: new Request("http://local.test/"),
  });

  return created.cookie.split(";")[0] ?? created.cookie;
}

function timestampSequence(...timestamps: string[]): () => string {
  let index = 0;

  return () =>
    timestamps[index++ % timestamps.length] ?? timestamps.at(-1) ?? new Date(0).toISOString();
}

async function waitUntil(condition: () => Promise<boolean>, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("Timed out waiting for condition.");
}

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "formless-workspace-gateway-test-"));

  tempDirs.push(tempDir);
  return tempDir;
}

async function writeWorkspaceManifest(workspaceRoot: string) {
  const manifest = defaultFormlessInstanceWorkspaceManifest({ name: "personal-sites" });

  await mkdir(workspaceRoot, { recursive: true });
  await writeFile(
    path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE),
    formatFormlessInstanceWorkspaceManifest(manifest),
  );
}

type CapturedRequest = {
  body?: string;
  headers: Record<string, string>;
  method: string;
  url: string;
};

function workspaceSaveFetch(requests: CapturedRequest[], installId: string): typeof fetch {
  return async (url, init) => {
    const requestUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const parsedUrl = new URL(requestUrl);

    requests.push({
      body: typeof init?.body === "string" ? init.body : undefined,
      headers: normalizeHeaders(init?.headers),
      method: init?.method ?? "GET",
      url: requestUrl,
    });

    if (parsedUrl.pathname === "/api/formless/app-installs") {
      return Response.json({
        installs: [installedSite(installId, "Site")],
        packages: listInstallableAppPackages(bundledAppPackageResolver),
      });
    }

    if (parsedUrl.pathname === "/api/formless/control-plane/snapshot") {
      return Response.json(controlPlaneSnapshot(gatewayControlPlaneRecords(installId)));
    }

    if (parsedUrl.pathname === `/api/app-installs/site/${installId}/snapshot`) {
      return Response.json(snapshot([], `app:${installId}`));
    }

    return Response.json({ error: "not found" }, { status: 404 });
  };
}

function installedSite(installId: string, label: string) {
  const facts = packageAppFactsForKey("site", bundledAppPackageResolver);

  if (!facts) {
    throw new Error("Missing bundled package facts for site.");
  }

  return {
    adminRoute: `/apps/${installId}` as `/apps/${string}`,
    createdAt: "2026-05-01T00:00:00.000Z",
    installId,
    label,
    packageAppKey: "site" as const,
    packageRevision: facts.packageRevision,
    publicRoute: `/sites/${installId}` as `/sites/${string}`,
    publicRoutePrefix: `/sites/${installId}/` as `/sites/${string}/`,
    sourceSchemaHash: facts.sourceSchemaHash,
    status: "installed" as const,
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
}

function snapshot(
  records: StoredRecord[],
  storageIdentity: `app:${string}` = "app:david",
): StorageSnapshot {
  return {
    exportedAt: "2026-05-12T02:00:00.000Z",
    kind: STORAGE_SNAPSHOT_KIND,
    records,
    schema: siteSourceSchema,
    schemaKey: "site",
    schemaUpdatedAt: "2026-05-01T00:00:00.000Z",
    sourceCursor: 1,
    storageIdentity,
    version: STORAGE_SNAPSHOT_VERSION,
  };
}

function controlPlaneSnapshot(records: StoredRecord[]): StorageSnapshot {
  return {
    exportedAt: "2026-05-12T02:00:00.000Z",
    kind: STORAGE_SNAPSHOT_KIND,
    records,
    schema: instanceControlPlaneSchema,
    schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
    schemaUpdatedAt: "2026-05-01T00:00:00.000Z",
    sourceCursor: records.length,
    storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
    version: STORAGE_SNAPSHOT_VERSION,
  };
}

function gatewayControlPlaneRecords(installId: string): StoredRecord[] {
  const now = "2026-05-26T00:00:00.000Z";

  return [
    {
      createdAt: now,
      updatedAt: now,
      entity: "app-install",
      id: installId,
      values: {
        createdAt: now,
        installId,
        label: "Site",
        packageAppKey: "site",
        status: "installed",
        storageIdentity: `app:${installId}`,
        updatedAt: now,
      },
    },
    {
      createdAt: now,
      updatedAt: now,
      entity: "route",
      id: `route:${installId}:admin`,
      values: {
        appInstall: installId,
        createdAt: now,
        enabled: true,
        kind: "mount",
        matchPath: `/apps/${installId}`,
        surface: "admin",
        targetProfile: "app",
        updatedAt: now,
      },
    },
  ];
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(headers).entries());
}
