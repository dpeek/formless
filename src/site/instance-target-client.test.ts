import { describe, expect, it } from "vite-plus/test";

import {
  readFormlessInstanceControlPlaneRecords,
  readFormlessInstanceDeploymentCommandContext,
} from "./instance-target-client.ts";

type CapturedTargetRequest = {
  headers: Record<string, string>;
  url: string;
};

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
      { entity: "appInstall", id: "site", values: { installId: "site" } },
      {
        entity: "appRoute",
        id: "app-route:site:publicSite",
        values: { appInstall: "site", path: "/sites/site" },
      },
      {
        entity: "domainMapping",
        id: "domain:www.example.com",
        values: { appRoute: "app-route:site:publicSite", host: "www.example.com" },
      },
      {
        entity: "deployTarget",
        id: "instance.primary",
        values: { targetId: "instance.primary" },
      },
      {
        entity: "deployDesiredResource",
        id: "desired:www.example.com",
        values: { deployTarget: "instance.primary", logicalId: "custom-domain:www" },
      },
      {
        deletedAt: "2026-06-01T00:00:00.000Z",
        entity: "deployAttempt",
        id: "attempt.deleted",
        values: { deployTarget: "instance.primary" },
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
