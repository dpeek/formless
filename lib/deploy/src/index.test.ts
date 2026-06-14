import { describe, expect, it } from "vite-plus/test";
import {
  CONTROL_PLANE_DEPLOYMENT_CONFIG_OBSERVED_FIELDS,
  computeDeployProjectionHash,
  deployDesiredStateProjectionInputFromControlPlaneRecords,
  deployProjectionCanonicalJson,
  projectDeployControlPlaneDesiredState,
  projectDeployRouteTargets,
} from "./index.ts";
import type {
  ControlPlaneAppInstallProjectionRecord,
  ControlPlaneProviderConfigProjectionRecord,
  ControlPlaneProjectionSourceRecord,
  ControlPlaneRouteProjectionRecord,
} from "./types.ts";

describe("Deploy control-plane projection helpers", () => {
  it("declares display-safe deployment-config observation fields", () => {
    expect(CONTROL_PLANE_DEPLOYMENT_CONFIG_OBSERVED_FIELDS).toEqual([
      "observedStatus",
      "observedAt",
      "observedDesiredStateHash",
      "observedSummary",
      "observedError",
      "observedRunnerId",
    ]);
  });

  it("adapts active control-plane records into deploy projection input", () => {
    expect(
      deployDesiredStateProjectionInputFromControlPlaneRecords({
        instanceId: "demo-instance",
        records: sourceRecords,
        targetId: "instance.primary",
        workerName: "fallback-worker",
      }),
    ).toEqual({
      appInstalls: [
        {
          id: "app-install:site",
          installId: "site",
          packageAppKey: "site",
        },
      ],
      instanceId: "demo-instance",
      providerConfigs: [
        {
          id: "cloudflare-primary",
          providerFamily: "cloudflare",
          workerName: "primary-worker",
        },
        {
          id: "cloudflare-secondary",
          providerFamily: "cloudflare",
          workerName: "secondary-worker",
        },
      ],
      routes: [
        {
          appInstall: "site",
          enabled: true,
          id: "route:site:public",
          kind: "mount",
          matchHost: "www.example.com",
          matchPath: "/",
          providerConfig: "cloudflare-primary",
          surface: "public-site",
          targetProfile: "public-site",
        },
      ],
      targetId: "instance.primary",
      workerName: "primary-worker",
    });
  });

  it("projects enabled hostless mount routes as deterministic route targets", () => {
    expect(projectDeployRouteTargets([...appRoutes].reverse(), appInstalls)).toEqual([
      {
        appInstallId: "site",
        packageAppKey: "site",
        path: "/apps/site",
        routeId: "route:site:admin",
        routeKind: "admin",
        surface: "admin",
      },
      {
        appInstallId: "site",
        packageAppKey: "site",
        path: "/sites/site",
        prefix: "/sites/site/",
        routeId: "route:site:public-site",
        routeKind: "publicSite",
        surface: "publicSite",
      },
    ]);
  });

  it("omits route-derived resources when route records are absent", async () => {
    const projection = projectDeployControlPlaneDesiredState(
      deployDesiredStateProjectionInputFromControlPlaneRecords({
        instanceId: "demo-instance",
        records: sourceRecords.filter((record) => record.entity !== "route"),
        targetId: "instance.primary",
        workerName: "fallback-worker",
      }),
    );
    const reorderedProjection = projectDeployControlPlaneDesiredState(
      deployDesiredStateProjectionInputFromControlPlaneRecords({
        instanceId: "demo-instance",
        records: sourceRecords.filter((record) => record.entity !== "route").reverse(),
        targetId: "instance.primary",
        workerName: "fallback-worker",
      }),
    );

    expect(projection.resourceGraph.resources).toEqual([]);
    expect(projection.routeTargets).toEqual([]);
    expect(projection.sourceFingerprint).toMatch(/^control-plane:/);
    expect(await computeDeployProjectionHash(reorderedProjection)).toBe(
      await computeDeployProjectionHash(projection),
    );
  });

  it("keeps route-derived custom-domain projection stable and display-safe", async () => {
    const projection = projectDeployControlPlaneDesiredState({
      appInstalls,
      instanceId: "demo-instance",
      providerConfigs,
      routes: [...appRoutes, ...domainRoutes],
      targetId: "instance.primary",
    });

    expect(projection.resourceGraph.resources).toEqual([
      {
        dependencies: [],
        inputs: {
          adopt: false,
          host: "www.example.com",
          name: "www.example.com",
          overrideExistingOrigin: false,
          profile: "publicSite",
          targetInstallId: "site",
          workerName: "demo-worker",
        },
        kind: "cloudflare-worker-custom-domain",
        logicalId: "demo-instance-custom-domain-www-example-com-publicsite-site",
        providerFamily: "cloudflare",
        targetId: "instance.primary",
      },
    ]);
    expect(deployProjectionCanonicalJson(projection)).not.toContain("secret");
    expect(await computeDeployProjectionHash(projection)).toBe(
      "sha256:d10fb30437c1d03a5b1b71b2fdaf9fe372690d71e18c14e1c63174516aa96668",
    );
  });

  it("uses deployment-config worker names without hashing observation or secret fields", async () => {
    const projection = projectDeployControlPlaneDesiredState(
      deployDesiredStateProjectionInputFromControlPlaneRecords({
        instanceId: "demo-instance",
        records: sourceRecords,
        targetId: "instance.primary",
        workerName: "fallback-worker",
      }),
    );
    const changedNonIntentRecords = sourceRecords.map((record) => {
      if (record.id === "cloudflare-primary") {
        return {
          ...record,
          values: {
            ...record.values,
            credentialRef: "secret:cloudflare:rotated",
            observedAt: "2026-06-14T00:05:00.000Z",
            observedDesiredStateHash: "sha256:changed",
            observedError: "secret-cloudflare-token",
            observedStatus: "failed",
          },
        } satisfies ControlPlaneProjectionSourceRecord;
      }

      if (record.id === "route:site:public") {
        return {
          ...record,
          values: {
            ...record.values,
            updatedAt: "2026-06-14T00:05:00.000Z",
          },
        } satisfies ControlPlaneProjectionSourceRecord;
      }

      return record;
    });
    const changedProjection = projectDeployControlPlaneDesiredState(
      deployDesiredStateProjectionInputFromControlPlaneRecords({
        instanceId: "demo-instance",
        records: changedNonIntentRecords,
        targetId: "instance.primary",
        workerName: "fallback-worker",
      }),
    );
    const serialized = deployProjectionCanonicalJson(changedProjection);

    expect(projection.resourceGraph.resources).toEqual([
      expect.objectContaining({
        inputs: expect.objectContaining({
          host: "www.example.com",
          profile: "publicSite",
          targetInstallId: "site",
          workerName: "primary-worker",
        }),
        logicalId: "demo-instance-custom-domain-www-example-com-publicsite-site",
      }),
    ]);
    expect(changedProjection).toEqual(projection);
    expect(await computeDeployProjectionHash(changedProjection)).toBe(
      await computeDeployProjectionHash(projection),
    );
    expect(serialized).not.toContain("secret");
    expect(changedProjection.sourceFingerprint).not.toContain("secret");
  });

  it("keeps route-derived redirect projection stable and display-safe", async () => {
    const projection = projectDeployControlPlaneDesiredState({
      instanceId: "demo-instance",
      routes: redirectRoutes,
      targetId: "instance.primary",
    });

    expect(projection.resourceGraph.resources.map((resource) => resource.kind)).toEqual([
      "cloudflare-dns-records",
      "cloudflare-redirect-rule",
    ]);
    expect(projection.resourceGraph.resources[1]?.inputs).toMatchObject({
      fromHost: "old.example.com",
      preservePath: true,
      preserveQueryString: true,
      statusCode: 308,
      targetHost: "www.example.com",
      targetUrl: "https://www.example.com/${1}",
    });
    expect(await computeDeployProjectionHash(projection)).toBe(
      "sha256:ffe2831e12a71e20db5bd4a1a72251818291485d1ea36e6219c82f2b4530d628",
    );
  });

  it("normalizes redirect target URL bases", () => {
    const projection = projectDeployControlPlaneDesiredState({
      instanceId: "demo-instance",
      routes: [
        {
          enabled: true,
          id: "route:redirect:docs.example.com",
          kind: "redirect",
          matchHost: "docs.example.com",
          matchPath: "/",
          preservePath: false,
          preserveQueryString: false,
          statusCode: 302,
          toUrl: "https://example.com/docs/?utm=ignored",
        },
      ],
      targetId: "instance.primary",
    });

    expect(projection.resourceGraph.resources[1]?.inputs).toMatchObject({
      targetHost: "example.com",
      targetUrl: "https://example.com/docs",
    });
  });

  it("keeps route-only projection stable", async () => {
    const projection = projectDeployControlPlaneDesiredState({
      appInstalls,
      instanceId: "demo-instance",
      routes: appRoutes,
      targetId: "instance.primary",
    });

    expect(projection.resourceGraph.resources).toEqual([]);
    expect(projection.routeTargets).toHaveLength(2);
    expect(await computeDeployProjectionHash(projection)).toBe(
      "sha256:9058f85d6d930141bb05d43e9dfce724d1db89a785e77a7664876de2a654e5e5",
    );
  });
});

const appInstalls = [
  {
    id: "app-install:site",
    installId: "site",
    packageAppKey: "site",
  },
  {
    id: "app-install:docs",
    installId: "docs",
    packageAppKey: "site",
  },
] satisfies ControlPlaneAppInstallProjectionRecord[];

const appRoutes = [
  {
    appInstall: "site",
    enabled: true,
    id: "route:site:admin",
    kind: "mount",
    matchPath: "/apps/site",
    surface: "admin",
    targetProfile: "app",
  },
  {
    appInstall: "site",
    enabled: true,
    id: "route:site:public-site",
    kind: "mount",
    matchPath: "/sites/site",
    matchPrefix: "/sites/site/",
    surface: "public-site",
    targetProfile: "public-site",
  },
  {
    appInstall: "docs",
    enabled: false,
    id: "route:docs:public-site",
    kind: "mount",
    matchPath: "/sites/docs",
    matchPrefix: "/sites/docs/",
    surface: "public-site",
    targetProfile: "public-site",
  },
] satisfies ControlPlaneRouteProjectionRecord[];

const domainRoutes = [
  {
    appInstall: "site",
    enabled: true,
    id: "route:host:publicSite:www.example.com",
    kind: "mount",
    matchHost: "WWW.Example.com.",
    matchPath: "/",
    matchPrefix: "/",
    providerConfig: "cloudflare-primary",
    surface: "public-site",
    targetProfile: "public-site",
  },
  {
    appInstall: "site",
    enabled: false,
    id: "route:host:publicSite:disabled.example.com",
    kind: "mount",
    matchHost: "disabled.example.com",
    matchPath: "/",
    matchPrefix: "/",
    surface: "public-site",
    targetProfile: "public-site",
  },
] satisfies ControlPlaneRouteProjectionRecord[];

const redirectRoutes = [
  {
    enabled: true,
    id: "route:redirect:old.example.com",
    kind: "redirect",
    matchHost: "Old.Example.com.",
    matchPath: "/",
    matchPrefix: "/",
    preservePath: true,
    preserveQueryString: true,
    statusCode: "308",
    toHost: "www.example.com",
  },
] satisfies ControlPlaneRouteProjectionRecord[];

const providerConfigs = [
  {
    id: "cloudflare-primary",
    providerFamily: "cloudflare",
    workerName: "demo-worker",
  },
] satisfies ControlPlaneProviderConfigProjectionRecord[];

const sourceRecords = [
  {
    id: "app-install:site",
    entity: "app-install",
    createdAt: "2026-06-14T00:00:00.000Z",
    values: {
      installId: "site",
      packageAppKey: "site",
      status: "installed",
    },
  },
  {
    id: "app-install:deleted",
    entity: "app-install",
    createdAt: "2026-06-14T00:00:00.000Z",
    deletedAt: "2026-06-14T00:00:01.000Z",
    values: {
      installId: "deleted",
      packageAppKey: "site",
      status: "installed",
    },
  },
  {
    id: "cloudflare-primary",
    entity: "deployment-config",
    createdAt: "2026-06-14T00:00:00.000Z",
    values: {
      credentialRef: "secret:cloudflare:primary",
      enabled: true,
      observedDesiredStateHash: "sha256:ignored",
      providerFamily: "cloudflare",
      targetId: "instance.primary",
      targetKind: "instance",
      workerName: "primary-worker",
    },
  },
  {
    id: "cloudflare-secondary",
    entity: "deployment-config",
    createdAt: "2026-06-14T00:00:00.000Z",
    values: {
      enabled: true,
      providerFamily: "cloudflare",
      targetId: "instance.secondary",
      targetKind: "instance",
      workerName: "secondary-worker",
    },
  },
  {
    id: "route:site:public",
    entity: "route",
    createdAt: "2026-06-14T00:00:00.000Z",
    values: {
      appInstall: "site",
      deploymentConfig: "cloudflare-primary",
      enabled: true,
      kind: "mount",
      matchHost: "www.example.com",
      matchPath: "/",
      surface: "public-site",
      targetProfile: "public-site",
    },
  },
  {
    id: "route:site:secondary",
    entity: "route",
    createdAt: "2026-06-14T00:00:00.000Z",
    values: {
      appInstall: "site",
      deploymentConfig: "cloudflare-secondary",
      enabled: true,
      kind: "mount",
      matchHost: "secondary.example.com",
      matchPath: "/",
      surface: "public-site",
      targetProfile: "public-site",
    },
  },
] satisfies ControlPlaneProjectionSourceRecord[];
