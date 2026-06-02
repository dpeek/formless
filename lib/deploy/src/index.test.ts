import { describe, expect, it } from "vite-plus/test";
import {
  computeDeployProjectionHash,
  deployProjectionCanonicalJson,
  projectDeployControlPlaneDesiredState,
  projectDeployRouteTargets,
} from "./index.ts";
import type {
  ControlPlaneAppInstallProjectionRecord,
  ControlPlaneProviderConfigProjectionRecord,
  ControlPlaneRouteProjectionRecord,
} from "./types.ts";

describe("Deploy control-plane projection helpers", () => {
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
