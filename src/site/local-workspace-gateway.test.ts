import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import packageJson from "../../package.json";
import { createOwnerSessionCookie } from "../worker/owner-session.ts";
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
    credentialSetupUrl?: string;
    operationIds?: string[];
    packageVersion?: string;
    setupComplete?: boolean;
    timestamps?: string[];
  } = {},
): LocalWorkspaceGatewayDependencies {
  const operationIds = [...(options.operationIds ?? [])];

  return {
    ...(options.accountDiscovery === undefined
      ? {}
      : { accountDiscovery: options.accountDiscovery }),
    createOperationId: () => operationIds.shift() ?? "op_test_00000001",
    credentialSetup:
      options.credentialSetupUrl === undefined
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
          }),
    cwd: workspaceRoot,
    fetch: async () => Response.json({ setupComplete: options.setupComplete ?? false }),
    now: timestampSequence(...(options.timestamps ?? ["2026-06-02T01:00:00.000Z"])),
    ...(options.packageVersion === undefined ? {} : { packageVersion: options.packageVersion }),
    readOwnerSetupStatus: async () => ({ setupComplete: options.setupComplete ?? false }),
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
