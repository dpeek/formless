import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import packageJson from "../../package.json";
import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  formatAppArchive,
  type AppArchive,
} from "../shared/archive.ts";
import {
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
} from "../shared/deploy-metadata.ts";
import { packageAppFactsForKey, listBundledAppPackages } from "../shared/app-installs.ts";
import {
  STORE_SNAPSHOT_KIND,
  STORE_SNAPSHOT_VERSION,
  type StoreSnapshot,
  type StoredRecord,
} from "../shared/protocol.ts";
import { createOwnerSessionCookie } from "../worker/owner-session.ts";
import { siteSourceSchema } from "../test/schema-apps.ts";
import { PORTABLE_ARCHIVE_MANIFEST_FILE } from "./archive-workflows.ts";
import {
  FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE,
  defaultFormlessInstanceWorkspaceManifest,
  formatFormlessInstanceWorkspaceManifest,
} from "./instance-workspace-config.ts";
import { writeFormlessInstanceControlPlaneRecordSource } from "./instance-workspace-record-source.ts";
import {
  LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  LOCAL_WORKSPACE_GATEWAY_CSRF_COOKIE_NAME,
  LOCAL_WORKSPACE_GATEWAY_CSRF_HEADER,
  LOCAL_WORKSPACE_GATEWAY_OPERATIONS_API_PATH,
  LOCAL_WORKSPACE_GATEWAY_STATUS_API_PATH,
  handleLocalWorkspaceGatewayRequest,
  type LocalWorkspaceGatewayDependencies,
  type LocalWorkspaceGatewayEnv,
} from "./local-workspace-gateway.ts";

const tempDirs: string[] = [];
const bootstrapToken = "bootstrap-local-token";
const csrfToken = "csrf-local-token";
const ownerSecret = "owner-session-secret";
const adminToken = "admin-local-token";
const setupToken = "abcDEF0123456789_-abcDEF0123456789_-";

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("local workspace gateway", () => {
  it("is available only for local workspace runtime env and not Worker runtime profiles", async () => {
    const workspaceRoot = await makeTempDir();

    await expect(
      handleLocalWorkspaceGatewayRequest(
        new Request("http://local.test/api/formless/app-installs"),
        gatewayEnv(workspaceRoot),
        gatewayDeps(workspaceRoot),
      ),
    ).resolves.toBeUndefined();

    await expect(
      gatewayJson(
        new Request(`http://local.test${LOCAL_WORKSPACE_GATEWAY_STATUS_API_PATH}`, {
          headers: bootstrapHeaders(),
        }),
        { env: { FORMLESS_RUNTIME_PROFILE: "instance" } },
      ),
    ).resolves.toMatchObject({ response: { status: 404 } });

    for (const profile of ["app", "siteAuthoring", "publishedSite"]) {
      const blocked = await gatewayJson(
        new Request(`http://local.test${LOCAL_WORKSPACE_GATEWAY_STATUS_API_PATH}`, {
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

  it("allows the process-scoped bootstrap capability to read status and initialize only", async () => {
    const workspaceRoot = await makeTempDir();
    const status = await gatewayJson(
      new Request(`http://local.test${LOCAL_WORKSPACE_GATEWAY_STATUS_API_PATH}`, {
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
        fields: { initialized: false },
        title: "Workspace not initialized",
      },
    });

    const init = await gatewayJson(
      operationRequest({ kind: "init", name: "personal-sites" }, bootstrapHeaders()),
      {
        deps: gatewayDeps(workspaceRoot, {
          operationIds: ["op_init_00000001"],
          timestamps: [
            "2026-06-02T01:00:00.000Z",
            "2026-06-02T01:00:01.000Z",
            "2026-06-02T01:00:02.000Z",
          ],
        }),
      },
    );

    expect(init.response.status).toBe(200);
    expect(init.body.operation).toMatchObject({
      actor: "browser",
      id: "op_init_00000001",
      operation: "init",
      status: "succeeded",
    });
    await expect(
      stat(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE)),
    ).resolves.toMatchObject({});

    const expired = await gatewayJson(
      new Request(`http://local.test${LOCAL_WORKSPACE_GATEWAY_STATUS_API_PATH}`, {
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
      { kind: "deployPlan" },
      { kind: "deployApply" },
      { kind: "credentialSetup", provider: "cloudflare" },
    ]) {
      const rejected = await gatewayJson(operationRequest(body, bootstrapHeaders()), {
        deps: gatewayDeps(workspaceRoot),
      });

      expect(rejected.response.status).toBe(403);
      expect(rejected.body.error).toBe(
        "Workspace bootstrap authorization is limited to status and init operations.",
      );
    }

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

  it("runs deploy plan through the gateway with record-source desired-state projection", async () => {
    const workspaceRoot = await makeTempDir();
    const cookie = await ownerCookie();

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployRecordSource(workspaceRoot);

    const planned = await gatewayJson(
      operationRequest({ kind: "deployPlan" }, browserHeaders({ cookie, csrf: true })),
      {
        deps: gatewayDeps(workspaceRoot, {
          accountDiscovery: {
            listAccounts: async () => [
              {
                id: "account-123",
                workersDevSubdomain: "dpeek",
              },
            ],
          },
          operationIds: ["op_deploy_plan_00000001"],
          packageVersion: packageJson.version,
          timestamps: [
            "2026-06-02T01:10:00.000Z",
            "2026-06-02T01:10:01.000Z",
            "2026-06-02T01:10:02.000Z",
          ],
        }),
      },
    );

    expect(planned.response.status).toBe(200);
    expect(planned.body.operation).toMatchObject({
      actor: "browser",
      id: "op_deploy_plan_00000001",
      operation: "deployPlan",
      result: {
        deployment: {
          desiredState: {
            resourceCount: 1,
            resourcesByKind: {
              "cloudflare-worker-custom-domain": 1,
            },
            targetId: "instance.primary",
          },
          expectedUrl: "https://personal.dpeek.workers.dev",
          workerName: "personal",
        },
      },
      status: "succeeded",
    });
    expect(JSON.stringify(planned.body)).not.toContain("secret");
  });

  it("runs deploy apply through the gateway with exact desired-state writeback", async () => {
    const workspaceRoot = await makeTempDir();
    const cookie = await ownerCookie();
    const requests: CapturedRequest[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployRecordSource(workspaceRoot);
    await writeWorkspaceAppArchive(workspaceRoot, "site", "Site");

    const applied = await gatewayJson(
      operationRequest({ kind: "deployApply" }, browserHeaders({ cookie, csrf: true })),
      {
        deps: gatewayDeps(workspaceRoot, {
          accountDiscovery: {
            listAccounts: async () => [
              {
                id: "account-123",
                workersDevSubdomain: "dpeek",
              },
            ],
          },
          deploymentAdapter: {
            deploy: async (input) => ({ url: input.plan.expectedUrl.url }),
          },
          fetch: deployApplyFetch(requests, "site"),
          operationIds: ["op_deploy_apply_00000001"],
          packageRoot: "/package",
          packageVersion: packageJson.version,
          randomTokens: ["generated-admin-token", setupToken],
          timestamps: [
            "2026-06-02T01:11:00.000Z",
            "2026-06-02T01:11:01.000Z",
            "2026-06-02T01:11:02.000Z",
            "2026-06-02T01:11:03.000Z",
          ],
        }),
      },
    );

    expect(applied.response.status).toBe(200);
    if (
      typeof applied.body.operation === "object" &&
      applied.body.operation !== null &&
      "status" in applied.body.operation &&
      applied.body.operation.status !== "succeeded" &&
      "summary" in applied.body.operation
    ) {
      const summary = applied.body.operation.summary;
      throw new Error(JSON.stringify(summary));
    }
    expect(applied.body.operation).toMatchObject({
      actor: "browser",
      id: "op_deploy_apply_00000001",
      operation: "deployApply",
      result: {
        deployment: {
          attempt: {
            attemptId: "attempt.local-gateway.1",
            mode: "apply",
            status: "succeeded",
            targetId: "instance.primary",
          },
          cleanup: {
            status: "not-run",
          },
          drift: {
            status: "drift",
          },
          evidence: {
            count: 0,
          },
          plan: {
            changes: { create: 1, delete: 0, noChange: 0, update: 0 },
          },
          writeback: {
            attemptId: "attempt.local-gateway.1",
            desiredState: deploymentDesiredStateRef(),
            evidenceCount: 0,
            planRecordedAt: "2026-06-02T01:11:02.000Z",
            runnerId: "local-gateway",
            status: "succeeded",
            successCompletedAt: "2026-06-02T01:11:03.000Z",
          },
        },
      },
      status: "succeeded",
    });
    expect(
      capturedRequestJson<{ desiredState: ReturnType<typeof deploymentDesiredStateRef> }>(
        requestByPath(requests, "/api/formless/deployments/attempts/success"),
      ),
    ).toMatchObject({ desiredState: deploymentDesiredStateRef() });
    expect(JSON.stringify(applied.body)).not.toContain("generated-admin-token");
    expect(JSON.stringify(applied.body)).not.toContain("alchemy-password");
    expect(JSON.stringify(applied.body)).not.toContain("lease:local-gateway");
  });

  it("scopes operation ids to the configured workspace root", async () => {
    const workspaceRoot = await makeTempDir();
    const otherWorkspaceRoot = await makeTempDir();
    const started = await gatewayJson(
      new Request(`http://local.test${LOCAL_WORKSPACE_GATEWAY_STATUS_API_PATH}`, {
        headers: bootstrapHeaders(),
      }),
      { deps: gatewayDeps(workspaceRoot, { operationIds: ["op_status_scoped"] }) },
    );

    expect(started.response.status).toBe(200);

    const otherRead = await gatewayJson(
      new Request(
        `http://local.test${LOCAL_WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/op_status_scoped`,
        {
          headers: bootstrapHeaders(),
        },
      ),
      {
        deps: gatewayDeps(otherWorkspaceRoot),
        env: gatewayEnv(otherWorkspaceRoot),
      },
    );

    expect(otherRead.response.status).toBe(404);

    const invalid = await gatewayJson(
      new Request(`http://local.test${LOCAL_WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/..%2Fsecret`, {
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

async function gatewayJson(
  request: Request,
  options: {
    deps?: LocalWorkspaceGatewayDependencies;
    env?: LocalWorkspaceGatewayEnv;
  } = {},
) {
  const workspaceRoot = options.deps?.cwd ?? (await makeTempDir());
  const response = await handleLocalWorkspaceGatewayRequest(
    request,
    options.env ?? gatewayEnv(workspaceRoot),
    options.deps ?? gatewayDeps(workspaceRoot),
  );

  if (!response) {
    throw new Error("Expected local workspace gateway response.");
  }

  return {
    body: (await response.json()) as Record<string, unknown>,
    response,
  };
}

function operationRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://local.test${LOCAL_WORKSPACE_GATEWAY_OPERATIONS_API_PATH}`, {
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
  overrides: Partial<LocalWorkspaceGatewayEnv> = {},
): LocalWorkspaceGatewayEnv {
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
    credentialSetup?: LocalWorkspaceGatewayDependencies["credentialSetup"];
    credentialSetupUrl?: string;
    deploymentAdapter?: {
      deploy: (input: { plan: { expectedUrl: { url: string } } }) => Promise<{ url: string }>;
    };
    fetch?: typeof fetch;
    operationIds?: string[];
    packageRoot?: string;
    packageVersion?: string;
    randomTokens?: string[];
    setupComplete?: boolean;
    timestamps?: string[];
  } = {},
): LocalWorkspaceGatewayDependencies {
  const operationIds = [...(options.operationIds ?? [])];
  const randomTokens = [...(options.randomTokens ?? [])];

  return {
    ...(options.accountDiscovery === undefined
      ? {}
      : { accountDiscovery: options.accountDiscovery }),
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
    ...(options.deploymentAdapter === undefined
      ? {}
      : { deploymentAdapter: options.deploymentAdapter }),
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
    ...(options.packageRoot === undefined ? {} : { packageRoot: options.packageRoot }),
    ...(options.packageVersion === undefined ? {} : { packageVersion: options.packageVersion }),
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
    [LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
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
      ...(input.csrf ? [`${LOCAL_WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=${csrfToken}`] : []),
    ].join("; "),
    ...(input.csrf ? { [LOCAL_WORKSPACE_GATEWAY_CSRF_HEADER]: csrfToken } : {}),
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

function deployApplyFetch(requests: CapturedRequest[], installId: string): typeof fetch {
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

    if (parsedUrl.pathname === "/api/formless/deploy") {
      return Response.json({
        packageApps: listBundledAppPackages().map((appPackage) => ({
          packageAppKey: appPackage.packageAppKey,
          packageRevision: appPackage.packageRevision,
          sourceSchemaHash: appPackage.sourceSchemaHash,
        })),
        packageVersion: packageJson.version,
        runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
        storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
        version: packageJson.version,
      });
    }

    if (parsedUrl.pathname === "/api/formless/app-installs") {
      return Response.json({
        installs: [installedSite(installId, "Site")],
        packages: listBundledAppPackages(),
      });
    }

    if (parsedUrl.pathname === "/api/formless/control-plane/bootstrap") {
      return Response.json({
        cursor: 1,
        records: gatewayControlPlaneRecords(installId),
        schema: {},
      });
    }

    if (parsedUrl.pathname === `/api/app-installs/site/${installId}/snapshot`) {
      return Response.json(snapshot([]));
    }

    if (parsedUrl.pathname === "/api/formless/domain-mappings") {
      return Response.json({ mappings: [] });
    }

    if (parsedUrl.pathname === "/api/formless/archive/restore") {
      const body = parseCapturedBody<{ archive?: { restorePolicy?: { dryRun?: boolean } } }>(init);
      const dryRun = body.archive?.restorePolicy?.dryRun !== false;

      return Response.json(
        dryRun
          ? { ok: true, plan: { summary: restoreSummary(installId) } }
          : { ok: true, report: { applied: true, summary: restoreSummary(installId) } },
      );
    }

    if (parsedUrl.pathname === "/api/formless/deployments/desired-state") {
      const desiredState = deploymentDesiredStateRef();

      return Response.json({
        desiredState: {
          ...desiredState,
          createdAt: "2026-06-02T01:11:02.000Z",
          display: {
            resourceCount: 1,
            resourcesByKind: { "cloudflare-worker-custom-domain": 1 },
            title: "Primary instance target",
          },
          resourceGraph: { resources: [], targetId: desiredState.targetId },
          schemaVersion: 1,
          source: { fingerprint: "source-1", intentRevision: 1 },
        },
        target: { kind: "instance", targetId: desiredState.targetId },
      });
    }

    if (parsedUrl.pathname === "/api/formless/deployments/attempts/start") {
      const desiredState = deploymentDesiredStateRef();

      return Response.json(
        {
          attempt: deploymentAttempt({ desiredState, status: "started" }),
          lease: {
            actor: {
              actorId: "local-gateway.deploy",
              displayName: "Local workspace gateway",
              kind: "cli",
              runnerId: "local-gateway",
            },
            acquiredAt: "2026-06-02T01:11:02.000Z",
            attemptId: "attempt.local-gateway.1",
            expiresAt: "2026-06-02T01:21:02.000Z",
            leaseId: "lease.local-gateway.1",
            mode: "apply",
            status: "active",
            targetId: desiredState.targetId,
            token: "lease:local-gateway",
          },
          replayed: false,
        },
        { status: 201 },
      );
    }

    if (parsedUrl.pathname === "/api/formless/deployments/attempts/plan") {
      const desiredState = deploymentDesiredStateRef();

      return Response.json({
        attempt: deploymentAttempt({ desiredState, status: "started" }),
        plan: {
          ...desiredState,
          attemptId: "attempt.local-gateway.1",
          kind: "plan",
          recordedAt: "2026-06-02T01:11:02.000Z",
          summary: {
            blockers: [],
            changes: { create: 1, delete: 0, noChange: 0, update: 0 },
            warnings: [],
          },
        },
      });
    }

    if (parsedUrl.pathname === "/api/formless/deployments/attempts/success") {
      const desiredState = deploymentDesiredStateRef();

      return Response.json({
        attempt: deploymentAttempt({
          completedAt: "2026-06-02T01:11:03.000Z",
          desiredState,
          status: "succeeded",
        }),
        lease: {
          attemptId: "attempt.local-gateway.1",
          leaseId: "lease.local-gateway.1",
          releasedAt: "2026-06-02T01:11:03.000Z",
          status: "released",
          targetId: desiredState.targetId,
          token: "lease:local-gateway",
        },
        result: {
          ...desiredState,
          alchemy: { app: "formless-instance", scope: "instance.primary", stage: "personal" },
          attemptId: "attempt.local-gateway.1",
          completedAt: "2026-06-02T01:11:03.000Z",
          evidence: [],
          kind: "success",
          runnerId: "local-gateway",
        },
      });
    }

    if (parsedUrl.pathname === "/api/formless/deployments/attempts/failure") {
      const desiredState = deploymentDesiredStateRef();

      return Response.json({
        attempt: deploymentAttempt({ desiredState, status: "failed" }),
        result: {
          ...desiredState,
          actor: {
            actorId: "local-gateway.deploy",
            kind: "cli",
            runnerId: "local-gateway",
          },
          attemptId: "attempt.local-gateway.1",
          failedAt: "2026-06-02T01:11:03.000Z",
          kind: "failure",
          summary: { code: "local-gateway-deploy-apply-failed", displayMessage: "failed" },
        },
      });
    }

    return Response.json({ error: "not found" }, { status: 404 });
  };
}

async function writeDeployRecordSource(workspaceRoot: string) {
  const manifest = defaultFormlessInstanceWorkspaceManifest({ name: "personal-sites" });
  const now = "2026-05-26T00:00:00.000Z";

  await writeFormlessInstanceControlPlaneRecordSource({
    controlPlane: {
      schemaKey: "instance-control-plane",
      schemaUpdatedAt: now,
      records: [
        {
          createdAt: now,
          entity: "app-install",
          id: "site",
          values: {
            createdAt: now,
            installId: "site",
            label: "Site",
            packageAppKey: "site",
            status: "installed",
            storageIdentity: "app:site",
            updatedAt: now,
          },
        },
        {
          createdAt: now,
          entity: "route",
          id: "route:site:admin",
          values: {
            appInstall: "site",
            createdAt: now,
            enabled: true,
            kind: "mount",
            matchPath: "/apps/site",
            matchPrefix: "/apps/site/",
            surface: "admin",
            targetProfile: "app",
            updatedAt: now,
          },
        },
        {
          createdAt: now,
          entity: "route",
          id: "route:host:public-site:www.example.com",
          values: {
            appInstall: "site",
            createdAt: now,
            enabled: true,
            kind: "mount",
            matchHost: "www.example.com",
            matchPath: "/",
            matchPrefix: "/",
            providerConfig: "cloudflare-personal",
            surface: "public-site",
            targetProfile: "public-site",
            updatedAt: now,
          },
        },
        {
          createdAt: now,
          entity: "deploy-target",
          id: "instance.primary",
          values: {
            createdAt: now,
            enabled: true,
            label: "Primary instance",
            targetId: "instance.primary",
            targetKind: "instance",
            updatedAt: now,
          },
        },
        {
          createdAt: now,
          entity: "provider-config-ref",
          id: "cloudflare-personal",
          values: {
            accountId: "account-123",
            configRef: "cloudflare-personal",
            createdAt: now,
            label: "Cloudflare personal",
            providerFamily: "cloudflare",
            updatedAt: now,
            workerName: "personal",
          },
        },
      ],
    },
    manifest,
    workspaceRoot,
  });
}

async function writeWorkspaceAppArchive(workspaceRoot: string, installId: string, label: string) {
  const archiveRoot = path.join(workspaceRoot, "archives/apps", installId);

  await mkdir(archiveRoot, { recursive: true });
  await writeFile(
    path.join(archiveRoot, PORTABLE_ARCHIVE_MANIFEST_FILE),
    formatAppArchive(appArchive(installId, label)),
  );
}

function appArchive(installId: string, label: string): AppArchive {
  const facts = packageAppFactsForKey("site");

  if (!facts) {
    throw new Error("Missing bundled package facts for site.");
  }

  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: "2026-05-12T00:00:00.000Z",
    capabilities: ["app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    app: {
      installId,
      packageAppKey: "site",
      packageRevision: facts.packageRevision,
      sourceSchemaKey: "site",
      sourceSchemaHash: facts.sourceSchemaHash,
      label,
      status: "installed",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
    data: {
      kind: "storeSnapshot",
      snapshot: snapshot([]),
    },
    media: { objects: [] },
  };
}

function installedSite(installId: string, label: string) {
  const facts = packageAppFactsForKey("site");

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
    schemaRoute: `/apps/${installId}/schema` as `/apps/${string}/schema`,
    sourceSchemaHash: facts.sourceSchemaHash,
    status: "installed" as const,
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
}

function snapshot(records: StoredRecord[]): StoreSnapshot {
  return {
    exportedAt: "2026-05-12T02:00:00.000Z",
    kind: STORE_SNAPSHOT_KIND,
    records,
    schema: siteSourceSchema,
    schemaKey: "site",
    schemaUpdatedAt: "2026-05-01T00:00:00.000Z",
    sourceCursor: 1,
    version: STORE_SNAPSHOT_VERSION,
  };
}

function gatewayControlPlaneRecords(installId: string): StoredRecord[] {
  const now = "2026-05-26T00:00:00.000Z";

  return [
    {
      createdAt: now,
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

function deploymentDesiredStateRef() {
  return {
    hash: `sha256:${"b".repeat(64)}`,
    revision: 3,
    targetId: "instance.primary",
    versionId: "desired.instance.primary.3",
  };
}

function deploymentAttempt(input: {
  completedAt?: string;
  desiredState: ReturnType<typeof deploymentDesiredStateRef>;
  status: "failed" | "started" | "succeeded";
}) {
  return {
    ...input.desiredState,
    ...(input.completedAt === undefined ? {} : { completedAt: input.completedAt }),
    actor: {
      actorId: "local-gateway.deploy",
      displayName: "Local workspace gateway",
      kind: "cli",
      runnerId: "local-gateway",
    },
    attemptId: "attempt.local-gateway.1",
    idempotencyKey: "local-gateway-deploy:instance.primary:desired.instance.primary.3",
    mode: "apply",
    startedAt: "2026-06-02T01:11:02.000Z",
    status: input.status,
    updatedAt: "2026-06-02T01:11:03.000Z",
  };
}

function restoreSummary(installId: string) {
  return {
    appCount: 1,
    createdInstalls: [],
    mediaCountsByApp: { [installId]: 0 },
    recordCountsByApp: { [installId]: { total: 0 } },
    replacedInstalls: [installId],
  };
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(headers).entries());
}

function requestByPath(requests: readonly CapturedRequest[], pathname: string): CapturedRequest {
  const request = requests.find((candidate) => new URL(candidate.url).pathname === pathname);

  if (!request) {
    throw new Error(`Expected request to ${pathname}.`);
  }

  return request;
}

function capturedRequestJson<T>(request: CapturedRequest): T {
  return JSON.parse(request.body ?? "{}") as T;
}

function parseCapturedBody<T>(init: RequestInit | undefined): T {
  return JSON.parse(typeof init?.body === "string" ? init.body : "{}") as T;
}
