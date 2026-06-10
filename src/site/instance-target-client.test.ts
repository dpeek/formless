import { describe, expect, it } from "vite-plus/test";

import {
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
} from "../shared/deploy-metadata.ts";
import { listBundledAppPackages } from "../shared/app-installs.ts";
import { bundledSourceSchemaHashFixtures } from "../shared/upgrade-migrations.ts";
import {
  readFormlessInstanceAppRegistry,
  readFormlessInstanceControlPlaneRecords,
  readFormlessInstanceDeploymentCommandContext,
  readFormlessInstanceDeployMetadata,
  readFormlessInstanceTargetStatus,
} from "./instance-target-client.ts";

type CapturedTargetRequest = {
  headers: Record<string, string>;
  url: string;
};

describe("Formless instance target client", () => {
  it("parses deployed upgrade metadata facts", async () => {
    const result = await readFormlessInstanceDeployMetadata(
      { targetUrl: "https://instance.example" },
      {
        fetch: async () =>
          Response.json(
            {
              packageApps: [
                {
                  packageAppKey: "site",
                  packageRevision: 1,
                  sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
                },
              ],
              packageVersion: "0.1.8",
              runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
              storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
              version: "0.1.8",
            },
            { headers: { "Cache-Control": "no-store" } },
          ),
      },
    );

    expect(result).toEqual({
      cacheControl: "no-store",
      metadataUrl: "https://instance.example/api/formless/deploy",
      packageApps: [
        {
          packageAppKey: "site",
          packageRevision: 1,
          sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
        },
      ],
      packageVersion: "0.1.8",
      runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
      storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
      version: "0.1.8",
    });
  });

  it("parses app registry package facts and fills legacy install facts from packages", async () => {
    const result = await readFormlessInstanceAppRegistry(
      { targetUrl: "https://instance.example" },
      {
        fetch: async () =>
          Response.json({
            packages: [
              {
                adminRouteBase: "/apps",
                defaultInstallId: "site",
                description: "Site package",
                label: "Site",
                packageAppKey: "site",
                packageRevision: 1,
                publicRouteBase: "/sites",
                seedRecordsKey: "site",
                sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
                sourceSchemaKey: "site",
                supportsMultipleInstalls: true,
              },
            ],
            installs: [
              {
                adminRoute: "/apps/site",
                createdAt: "2026-05-28T00:00:00.000Z",
                installId: "site",
                label: "Site",
                packageAppKey: "site",
                publicRoute: "/sites/site",
                publicRoutePrefix: "/sites/site/",
                schemaRoute: "/apps/site/schema",
                status: "installed",
                updatedAt: "2026-05-28T00:00:00.000Z",
              },
            ],
          }),
      },
    );

    expect(result.installs).toEqual([
      expect.objectContaining({
        installId: "site",
        packageAppKey: "site",
        packageRevision: 1,
        sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
      }),
    ]);
    expect(result.packages).toEqual([
      expect.objectContaining({
        packageAppKey: "site",
        packageRevision: 1,
        sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
      }),
    ]);
  });

  it("surfaces target upgrade facts through HTTP reads without Durable Object SQLite access", async () => {
    const requests: string[] = [];
    const result = await readFormlessInstanceTargetStatus(
      {
        archiveInput: {
          archivePath: "/workspace/archive/archive.json",
          kind: "formless.instanceArchive",
          present: true,
          readable: true,
          version: 1,
        },
        includeDeploymentStatus: true,
        adminToken: "status-token",
        targetUrl: "https://instance.example",
      },
      {
        fetch: async (url, init) => {
          const requestUrl =
            typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
          const pathname = new URL(requestUrl).pathname;
          const headers = new Headers(init?.headers);

          requests.push(`GET ${requestUrl}`);

          if (pathname === "/api/formless/deploy") {
            return Response.json(
              {
                packageApps: listBundledAppPackages().map((appPackage) => ({
                  packageAppKey: appPackage.packageAppKey,
                  packageRevision: appPackage.packageRevision,
                  sourceSchemaHash: appPackage.sourceSchemaHash,
                })),
                packageVersion: "0.1.8",
                runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
                storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
                version: "0.1.8",
              },
              { headers: { "Cache-Control": "no-store" } },
            );
          }

          if (pathname === "/api/formless/setup") {
            return Response.json({ setupComplete: true });
          }

          if (pathname === "/api/formless/app-installs") {
            expect(headers.get("authorization")).toBe("Bearer status-token");
            return Response.json({
              packages: listBundledAppPackages(),
              installs: [
                {
                  adminRoute: "/apps/site",
                  createdAt: "2026-05-28T00:00:00.000Z",
                  installId: "site",
                  label: "Site",
                  packageAppKey: "site",
                  packageRevision: 1,
                  publicRoute: "/sites/site",
                  publicRoutePrefix: "/sites/site/",
                  schemaRoute: "/apps/site/schema",
                  sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
                  status: "installed",
                  updatedAt: "2026-05-28T00:00:00.000Z",
                },
              ],
            });
          }

          if (pathname === "/api/formless/deployments/status") {
            return Response.json({
              status: {
                attemptId: "attempt.11111111-1111-4111-8111-111111111111",
                checkedAt: "2026-05-28T00:00:00.000Z",
                deployedAt: "2026-05-28T00:00:00.000Z",
                latestDesiredState: {
                  hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                  revision: 2,
                  targetId: "instance.primary",
                  versionId: "desired-state.instance.primary.2",
                },
                state: "deployed",
                targetId: "instance.primary",
              },
              target: {
                kind: "instance",
                label: "Primary instance target",
                targetId: "instance.primary",
              },
            });
          }

          return Response.json({ error: "not found" }, { status: 404 });
        },
      },
    );

    expect(requests).toEqual([
      "GET https://instance.example/api/formless/deploy",
      "GET https://instance.example/api/formless/setup",
      "GET https://instance.example/api/formless/app-installs",
      "GET https://instance.example/api/formless/deployments/status",
    ]);
    expect(result.upgradeStatus.verificationFailures).toEqual([]);
    expect(result.upgradeStatus.archiveInput).toEqual({
      archivePath: "/workspace/archive/archive.json",
      kind: "formless.instanceArchive",
      present: true,
      readable: true,
      version: 1,
    });
    expect(result.upgradeStatus.localPackages).toEqual(
      listBundledAppPackages().map((appPackage) => ({
        packageAppKey: appPackage.packageAppKey,
        packageRevision: appPackage.packageRevision,
        sourceSchemaHash: appPackage.sourceSchemaHash,
      })),
    );
    expect(result.upgradeStatus.installedApps).toEqual([
      {
        installId: "site",
        packageAppKey: "site",
        packageRevision: 1,
        sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
      },
    ]);
    expect(result.upgradeStatus.deployedMetadata.packageVersion).toBe("0.1.8");
    expect(result.upgradeStatus.deployment?.status.state).toBe("deployed");
  });

  it("returns explicit upgrade verification failures for legacy target metadata", async () => {
    const result = await readFormlessInstanceTargetStatus(
      { includeDeploymentStatus: true, targetUrl: "https://instance.example" },
      {
        fetch: async (url) => {
          const requestUrl =
            typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
          const pathname = new URL(requestUrl).pathname;

          if (pathname === "/api/formless/deploy") {
            return Response.json({ version: "0.1.7" });
          }

          if (pathname === "/api/formless/setup") {
            return Response.json({ setupComplete: true });
          }

          if (pathname === "/api/formless/app-installs") {
            return Response.json({
              packages: listBundledAppPackages(),
              installs: [
                {
                  adminRoute: "/apps/site",
                  createdAt: "2026-05-28T00:00:00.000Z",
                  installId: "site",
                  label: "Site",
                  packageAppKey: "site",
                  publicRoute: "/sites/site",
                  publicRoutePrefix: "/sites/site/",
                  schemaRoute: "/apps/site/schema",
                  status: "installed",
                  updatedAt: "2026-05-28T00:00:00.000Z",
                },
              ],
            });
          }

          if (pathname === "/api/formless/deployments/status") {
            return Response.json({ error: "not found" }, { status: 404 });
          }

          return Response.json({ error: "not found" }, { status: 404 });
        },
      },
    );

    expect(result.upgradeStatus.verificationFailures.map((failure) => failure.code)).toEqual([
      "deploy-metadata-cacheable",
      "deploy-metadata-package-version-missing",
      "deploy-metadata-runtime-protocol-version-missing",
      "deploy-metadata-storage-migration-set-missing",
      "deploy-metadata-package-apps-missing",
      "installed-app-package-facts-missing",
      "deployment-status-unavailable",
    ]);
  });
});

describe("Formless instance target control-plane client", () => {
  it("reads app, route, domain, and deployment records with a CLI deployer actor", async () => {
    const requests: CapturedTargetRequest[] = [];

    const records = await readFormlessInstanceControlPlaneRecords(
      {
        actorKind: "cliDeployer",
        targetUrl: "https://instance.example",
      },
      {
        fetch: controlPlaneFetch(requests),
      },
    );

    expect(requests).toEqual([
      {
        headers: {
          "X-Formless-Control-Plane-Actor": "cliDeployer",
          accept: "application/json",
        },
        url: "https://instance.example/api/formless/control-plane/bootstrap?actorKind=cliDeployer",
      },
    ]);
    expect(records.appInstalls.map((record) => record.id)).toEqual(["site"]);
    expect(records.appRoutes.map((record) => record.id)).toEqual(["app-route:site:publicSite"]);
    expect(records.domainMappings.map((record) => record.id)).toEqual(["domain:www.example.com"]);
    expect(records.deployTargets.map((record) => record.id)).toEqual(["instance.primary"]);
    expect(records.deployDesiredResources.map((record) => record.id)).toEqual([
      "desired:www.example.com",
    ]);
  });

  it("reads runner control-plane context before binding an exact desired-state version", async () => {
    const requests: CapturedTargetRequest[] = [];
    const desiredStateRef = {
      hash: `sha256:${"a".repeat(64)}`,
      revision: 11,
      targetId: "instance.primary",
      versionId: "desired.instance.primary.11",
    };
    const context = await readFormlessInstanceDeploymentCommandContext(
      {
        actorKind: "runner",
        targetUrl: "https://instance.example",
      },
      {
        fetch: async (input, init) => {
          const request = capturedRequest(input, init);

          requests.push(request);

          if (request.url.endsWith("/api/formless/deployments/desired-state")) {
            return Response.json({
              desiredState: {
                ...desiredStateRef,
                createdAt: "2026-06-01T00:00:00.000Z",
                display: {
                  resourceCount: 1,
                  resourcesByKind: { "cloudflare-worker-custom-domain": 1 },
                  title: "Primary instance target",
                },
                resourceGraph: { resources: [], targetId: desiredStateRef.targetId },
                schemaVersion: 1,
                source: { fingerprint: "control-plane:abc", intentRevision: 5 },
              },
              target: { kind: "instance", targetId: desiredStateRef.targetId },
            });
          }

          if (request.url.endsWith("/api/formless/deployments/status")) {
            return Response.json({
              status: {
                checkedAt: "2026-06-01T00:00:00.000Z",
                state: "no-target",
                targetId: desiredStateRef.targetId,
              },
              target: { kind: "instance", targetId: desiredStateRef.targetId },
            });
          }

          return controlPlaneBootstrapResponse();
        },
      },
    );

    expect(context.controlPlane?.actorKind).toBe("runner");
    expect(context.controlPlane?.domainMappings).toHaveLength(1);
    expect(context.desiredStateRef).toEqual(desiredStateRef);
    expect(requests.map((request) => request.url)).toEqual([
      "https://instance.example/api/formless/control-plane/bootstrap?actorKind=runner",
      "https://instance.example/api/formless/deployments/desired-state",
      "https://instance.example/api/formless/deployments/status",
    ]);
    expect(requests[0]?.headers["X-Formless-Control-Plane-Actor"]).toBe("runner");
  });
});

function controlPlaneFetch(requests: CapturedTargetRequest[]): typeof fetch {
  return async (input, init) => {
    requests.push(capturedRequest(input, init));

    return controlPlaneBootstrapResponse();
  };
}

function controlPlaneBootstrapResponse(): Response {
  return Response.json({
    cursor: 3,
    records: [
      { entity: "app-install", id: "site", values: { installId: "site" } },
      {
        entity: "app-route",
        id: "app-route:site:publicSite",
        values: { appInstall: "site", path: "/sites/site" },
      },
      {
        entity: "domain-mapping",
        id: "domain:www.example.com",
        values: { appRoute: "app-route:site:publicSite", host: "www.example.com" },
      },
      {
        entity: "deploy-target",
        id: "instance.primary",
        values: { targetId: "instance.primary" },
      },
      {
        entity: "deploy-desired-resource",
        id: "desired:www.example.com",
        values: { deployTarget: "instance.primary", logicalId: "custom-domain:www" },
      },
    ],
    schema: {},
  });
}

function capturedRequest(input: RequestInfo | URL, init: RequestInit | undefined) {
  return {
    headers: normalizeHeaders(init?.headers),
    url: typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
  };
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return headers;
}
