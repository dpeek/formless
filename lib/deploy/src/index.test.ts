import { describe, expect, it } from "vite-plus/test";
import {
  computeDeployProjectionHash,
  deployProjectionCanonicalJson,
  projectDeployControlPlaneDesiredState,
  projectDeployRouteTargets,
} from "./index.ts";
import type {
  ControlPlaneAppRouteProjectionRecord,
  ControlPlaneDomainMappingProjectionRecord,
  ControlPlaneRedirectIntentProjectionRecord,
} from "./types.ts";

describe("Deploy control-plane projection helpers", () => {
  it("projects enabled app routes as deterministic route targets", () => {
    expect(projectDeployRouteTargets([...appRoutes].reverse())).toEqual([
      {
        appInstallId: "site",
        packageAppKey: "site",
        path: "/apps/site",
        routeId: "app-route:site:admin",
        routeKind: "admin",
        surface: "admin",
      },
      {
        appInstallId: "site",
        packageAppKey: "site",
        path: "/sites/site",
        prefix: "/sites/site/",
        routeId: "app-route:site:publicSite",
        routeKind: "publicSite",
        surface: "publicSite",
      },
    ]);
  });

  it("keeps domain mapping projection stable and display-safe", async () => {
    const projection = projectDeployControlPlaneDesiredState({
      appRoutes,
      domainMappings,
      instanceId: "demo-instance",
      targetId: "instance.primary",
      workerName: "demo-worker",
    });

    expect(projection.resourceGraph.resources).toEqual([
      {
        dependencies: [],
        inputs: {
          adopt: false,
          appInstallId: "site",
          appRouteId: "app-route:site:publicSite",
          host: "www.example.com",
          name: "www.example.com",
          overrideExistingOrigin: false,
          profile: "publicSite",
          routePath: "/sites/site",
          workerName: "demo-worker",
        },
        kind: "cloudflare-worker-custom-domain",
        logicalId:
          "demo-instance-custom-domain-www-example-com-publicsite-site-app-route-site-publicsite",
        providerFamily: "cloudflare",
        targetId: "instance.primary",
      },
    ]);
    expect(deployProjectionCanonicalJson(projection)).not.toContain("secret");
    expect(await computeDeployProjectionHash(projection)).toBe(
      "sha256:fb19572710672e22eb4f0e89658785de3fe25b2a05a8deeda667200c438ecf8a",
    );
  });

  it("keeps redirect projection stable and display-safe", async () => {
    const projection = projectDeployControlPlaneDesiredState({
      instanceId: "demo-instance",
      redirectIntents,
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
      "sha256:cdc6ec28af400225401a55847730c6cdb159fa7ec0e6856c6eca8f1a102888b2",
    );
  });

  it("keeps route-only projection stable", async () => {
    const projection = projectDeployControlPlaneDesiredState({
      appRoutes,
      instanceId: "demo-instance",
      targetId: "instance.primary",
    });

    expect(projection.resourceGraph.resources).toEqual([]);
    expect(projection.routeTargets).toHaveLength(2);
    expect(await computeDeployProjectionHash(projection)).toBe(
      "sha256:11c3de39bf3e5b95d59626abfe4066d57c130233530855ff1f5ec3345861632a",
    );
  });
});

const appRoutes = [
  {
    appInstallId: "site",
    enabled: true,
    id: "app-route:site:admin",
    packageAppKey: "site",
    path: "/apps/site",
    routeKind: "admin",
    surface: "admin",
  },
  {
    appInstallId: "site",
    enabled: true,
    id: "app-route:site:publicSite",
    packageAppKey: "site",
    path: "/sites/site",
    prefix: "/sites/site/",
    routeKind: "publicSite",
    surface: "publicSite",
  },
  {
    appInstallId: "docs",
    enabled: false,
    id: "app-route:docs:publicSite",
    packageAppKey: "site",
    path: "/sites/docs",
    prefix: "/sites/docs/",
    routeKind: "publicSite",
    surface: "publicSite",
  },
] satisfies ControlPlaneAppRouteProjectionRecord[];

const domainMappings = [
  {
    appInstallId: "site",
    appRouteId: "app-route:site:publicSite",
    enabled: true,
    host: "WWW.Example.com.",
    id: "domain:www.example.com",
    profile: "publicSite",
  },
] satisfies ControlPlaneDomainMappingProjectionRecord[];

const redirectIntents = [
  {
    enabled: true,
    fromHost: "Old.Example.com.",
    id: "redirect:old.example.com",
    preservePath: true,
    preserveQueryString: true,
    statusCode: 308,
    toHost: "www.example.com",
  },
] satisfies ControlPlaneRedirectIntentProjectionRecord[];
