import { describe, expect, it } from "vite-plus/test";

import {
  acceptsRuntimeHtml,
  effectiveRuntimeRouteAccess,
  isRuntimeRouteAccess,
  isRuntimeApiPath,
  isRuntimeClientShellRoute,
  isRuntimeDynamicSiteIconPath,
  isRuntimeInstanceProfileClientShellRoute,
  isRuntimePublishedProfileClientShellRoute,
  isRuntimeReadRequestMethod,
  looksLikeRuntimeStaticAssetPath,
  matchRuntimeRouteBase,
  parseRuntimeProfileKind,
  parseRuntimeRouteAccess,
  publishedSiteRedirectLocation,
  resolveRuntimeProfileKind,
  runtimeRouteFromBase,
  runtimeProfileKindFromHost,
  runtimeRoutePolicyForProfileKind,
  stricterRuntimeRouteAccess,
  runtimeTopologyRoutes,
} from "./runtime-topology.ts";

describe("runtime topology", () => {
  it("parses the shared runtime profile vocabulary", () => {
    expect(parseRuntimeProfileKind("instance")).toBe("instance");
    expect(parseRuntimeProfileKind("dev")).toBe("dev");
    expect(parseRuntimeProfileKind("app")).toBe("app");
    expect(parseRuntimeProfileKind("siteAuthoring")).toBe("siteAuthoring");
    expect(parseRuntimeProfileKind("publishedSite")).toBe("publishedSite");
    expect(parseRuntimeProfileKind("")).toBeUndefined();
    expect(parseRuntimeProfileKind("missing")).toBeUndefined();
  });

  it("parses route access and resolves stricter effective access", () => {
    expect(parseRuntimeRouteAccess("anonymous")).toBe("anonymous");
    expect(parseRuntimeRouteAccess("authenticated")).toBe("authenticated");
    expect(parseRuntimeRouteAccess("owner")).toBe("owner");
    expect(parseRuntimeRouteAccess("")).toBeUndefined();
    expect(parseRuntimeRouteAccess("admin")).toBeUndefined();
    expect(isRuntimeRouteAccess("anonymous")).toBe(true);
    expect(isRuntimeRouteAccess("authenticated")).toBe(true);
    expect(isRuntimeRouteAccess("owner")).toBe(true);
    expect(isRuntimeRouteAccess("admin")).toBe(false);
    expect(stricterRuntimeRouteAccess("anonymous", "anonymous")).toBe("anonymous");
    expect(stricterRuntimeRouteAccess("anonymous", "authenticated")).toBe("authenticated");
    expect(stricterRuntimeRouteAccess("authenticated", "anonymous")).toBe("authenticated");
    expect(stricterRuntimeRouteAccess("authenticated", "owner")).toBe("owner");
    expect(stricterRuntimeRouteAccess("owner", "authenticated")).toBe("owner");
    expect(stricterRuntimeRouteAccess("anonymous", "owner")).toBe("owner");
    expect(stricterRuntimeRouteAccess("owner", "anonymous")).toBe("owner");
    expect(effectiveRuntimeRouteAccess({ routeAccess: "anonymous" })).toBe("anonymous");
    expect(effectiveRuntimeRouteAccess({ routeAccess: "authenticated" })).toBe("authenticated");
    expect(effectiveRuntimeRouteAccess({ routeAccess: "owner" })).toBe("owner");
    expect(
      effectiveRuntimeRouteAccess({ routeAccess: "authenticated", screenAccess: "anonymous" }),
    ).toBe("authenticated");
    expect(
      effectiveRuntimeRouteAccess({ routeAccess: "authenticated", screenAccess: "owner" }),
    ).toBe("owner");
    expect(effectiveRuntimeRouteAccess({ routeAccess: "anonymous", screenAccess: "owner" })).toBe(
      "owner",
    );
  });

  it("infers profile kinds from current host conventions", () => {
    expect(runtimeProfileKindFromHost("instance.formless.local")).toBe("instance");
    expect(runtimeProfileKindFromHost("app.formless.local")).toBe("app");
    expect(runtimeProfileKindFromHost("site-authoring.formless.local")).toBe("siteAuthoring");
    expect(runtimeProfileKindFromHost("published-site.formless.local")).toBe("publishedSite");
    expect(runtimeProfileKindFromHost("FORMLESS.TWITCHY.WORKERS.DEV")).toBe("publishedSite");
    expect(runtimeProfileKindFromHost("workers.dev")).toBe("publishedSite");
    expect(runtimeProfileKindFromHost("formless.local")).toBeUndefined();
  });

  it("uses explicit profile intent before host inference and falls back to dev", () => {
    expect(
      resolveRuntimeProfileKind({
        hostname: "published-site.formless.local",
        profile: "instance",
      }),
    ).toBe("instance");
    expect(resolveRuntimeProfileKind({ hostname: "app.formless.local" })).toBe("app");
    expect(resolveRuntimeProfileKind({ hostname: "formless.local" })).toBe("dev");
    expect(resolveRuntimeProfileKind({ fallback: "instance", profile: "missing" })).toBe(
      "instance",
    );
  });

  it("answers shared route policy by profile kind", () => {
    expect(runtimeRoutePolicyForProfileKind("instance")).toEqual({
      instanceBrowserRoutes: true,
      installedAppApiRoutes: true,
      installedAppBrowserRoutes: true,
      installedSitePublicRoutes: true,
      ownerSessionBrowserRoutes: true,
      schemaKeyApiRoutes: false,
      schemaKeyBrowserRoutes: false,
      workspaceGatewayApiRoutes: true,
    });
    expect(runtimeRoutePolicyForProfileKind("dev")).toEqual({
      instanceBrowserRoutes: true,
      installedAppApiRoutes: true,
      installedAppBrowserRoutes: true,
      installedSitePublicRoutes: true,
      ownerSessionBrowserRoutes: true,
      schemaKeyApiRoutes: true,
      schemaKeyBrowserRoutes: true,
      workspaceGatewayApiRoutes: true,
    });
    expect(runtimeRoutePolicyForProfileKind("app")).toMatchObject({
      instanceBrowserRoutes: false,
      installedAppApiRoutes: true,
      installedAppBrowserRoutes: false,
      installedSitePublicRoutes: false,
      ownerSessionBrowserRoutes: false,
      schemaKeyApiRoutes: true,
      schemaKeyBrowserRoutes: false,
      workspaceGatewayApiRoutes: false,
    });
    expect(runtimeRoutePolicyForProfileKind("siteAuthoring")).toMatchObject({
      ownerSessionBrowserRoutes: false,
      schemaKeyApiRoutes: true,
      schemaKeyBrowserRoutes: false,
      workspaceGatewayApiRoutes: false,
    });
    expect(runtimeRoutePolicyForProfileKind("publishedSite")).toMatchObject({
      ownerSessionBrowserRoutes: true,
      schemaKeyApiRoutes: true,
      schemaKeyBrowserRoutes: false,
      workspaceGatewayApiRoutes: false,
    });
  });

  it("owns installed route bases and public Site route constants", () => {
    expect(runtimeTopologyRoutes.accessRoute).toBe("/access");
    expect(runtimeTopologyRoutes.appRouteBase).toBe("/apps");
    expect(runtimeTopologyRoutes.formlessRouteBase).toBe("/formless");
    expect(runtimeTopologyRoutes.siteRouteBase).toBe("/sites");
    expect(runtimeTopologyRoutes.publicSiteHomeSlug).toBe("home");
    expect(runtimeTopologyRoutes.publicSitePackageAppKey).toBe("site");
    expect(runtimeTopologyRoutes.publicSitePreviewRouteBase).toBe("/pages");
    expect(runtimeTopologyRoutes.siteAdminRoute).toBe("/admin");
  });

  it("matches and builds runtime routes under shared route bases", () => {
    expect(matchRuntimeRouteBase("/apps/personal", "/apps")).toEqual({
      pathSuffix: "",
      routeBase: "/apps",
      routeId: "personal",
      suffixSegments: [],
    });
    expect(matchRuntimeRouteBase("/apps/personal/schema", "/apps")).toEqual({
      pathSuffix: "/schema",
      routeBase: "/apps",
      routeId: "personal",
      suffixSegments: ["schema"],
    });
    expect(matchRuntimeRouteBase("/sites/personal/blog/post", "/sites")).toEqual({
      pathSuffix: "/blog/post",
      routeBase: "/sites",
      routeId: "personal",
      suffixSegments: ["blog", "post"],
    });
    expect(matchRuntimeRouteBase("/apps", "/apps")).toBeUndefined();
    expect(matchRuntimeRouteBase("/app/personal", "/apps")).toBeUndefined();
    expect(runtimeRouteFromBase("/apps", "personal")).toBe("/apps/personal");
    expect(runtimeRouteFromBase("/sites", "personal", "/blog/post")).toBe(
      "/sites/personal/blog/post",
    );
  });

  it("classifies client-shell routes for general, published, and instance profiles", () => {
    expect(isRuntimeClientShellRoute("/pages/home")).toBe(true);
    expect(isRuntimeClientShellRoute("/tasks")).toBe(true);
    expect(isRuntimeClientShellRoute("/crm/audiences")).toBe(true);
    expect(isRuntimeClientShellRoute("/site/schema")).toBe(true);
    expect(isRuntimeClientShellRoute("/schema")).toBe(true);
    expect(isRuntimeClientShellRoute("/formless/auth/invitations/accept")).toBe(true);
    expect(isRuntimeClientShellRoute("/apps/personal")).toBe(true);
    expect(isRuntimeClientShellRoute("/sites/personal/blog")).toBe(true);
    expect(isRuntimeClientShellRoute("/local-session")).toBe(true);
    expect(isRuntimeClientShellRoute("/login")).toBe(true);
    expect(isRuntimeClientShellRoute("/setup")).toBe(true);
    expect(isRuntimeClientShellRoute("/rates")).toBe(false);
    expect(isRuntimeClientShellRoute("/blog")).toBe(false);

    expect(isRuntimePublishedProfileClientShellRoute("/apps/personal")).toBe(true);
    expect(isRuntimePublishedProfileClientShellRoute("/formless/auth/callback")).toBe(true);
    expect(isRuntimePublishedProfileClientShellRoute("/sites/personal/blog")).toBe(true);
    expect(isRuntimePublishedProfileClientShellRoute("/login")).toBe(true);
    expect(isRuntimePublishedProfileClientShellRoute("/setup")).toBe(true);
    expect(isRuntimePublishedProfileClientShellRoute("/local-session")).toBe(false);
    expect(isRuntimePublishedProfileClientShellRoute("/pages/home")).toBe(false);
    expect(isRuntimePublishedProfileClientShellRoute("/site")).toBe(false);

    expect(isRuntimeInstanceProfileClientShellRoute("/")).toBe(true);
    expect(isRuntimeInstanceProfileClientShellRoute("/access")).toBe(true);
    expect(isRuntimeInstanceProfileClientShellRoute("/local-session")).toBe(true);
    expect(isRuntimeInstanceProfileClientShellRoute("/deployments")).toBe(false);
    expect(isRuntimeInstanceProfileClientShellRoute("/apps/personal")).toBe(true);
    expect(isRuntimeInstanceProfileClientShellRoute("/sites/personal")).toBe(true);
    expect(isRuntimeInstanceProfileClientShellRoute("/tasks")).toBe(false);
    expect(isRuntimeInstanceProfileClientShellRoute("/pages/home")).toBe(false);
  });

  it("classifies API, read method, dynamic icon, static asset, and HTML accept facts", () => {
    expect(isRuntimeApiPath("/api")).toBe(true);
    expect(isRuntimeApiPath("/api/site/bootstrap")).toBe(true);
    expect(isRuntimeApiPath("/site")).toBe(false);
    expect(isRuntimeReadRequestMethod("GET")).toBe(true);
    expect(isRuntimeReadRequestMethod("HEAD")).toBe(true);
    expect(isRuntimeReadRequestMethod("POST")).toBe(false);
    expect(isRuntimeDynamicSiteIconPath("/favicon.svg")).toBe(true);
    expect(isRuntimeDynamicSiteIconPath("/assets/favicon.svg")).toBe(false);
    expect(looksLikeRuntimeStaticAssetPath("/assets/index.js")).toBe(true);
    expect(looksLikeRuntimeStaticAssetPath("/@vite/client")).toBe(true);
    expect(looksLikeRuntimeStaticAssetPath("/blog/post")).toBe(false);
    expect(acceptsRuntimeHtml(null)).toBe(true);
    expect(acceptsRuntimeHtml("text/html")).toBe(true);
    expect(acceptsRuntimeHtml("*/*")).toBe(true);
    expect(acceptsRuntimeHtml("application/json")).toBe(false);
  });

  it("builds published Site redirects from old preview routes", () => {
    expect(publishedSiteRedirectLocation("/pages")).toBe("/");
    expect(publishedSiteRedirectLocation("/pages/")).toBe("/");
    expect(publishedSiteRedirectLocation("/pages/home")).toBe("/");
    expect(publishedSiteRedirectLocation("/pages/projects")).toBe("/projects");
    expect(publishedSiteRedirectLocation("/pages/blog/agents", "?ref=old")).toBe(
      "/blog/agents?ref=old",
    );
    expect(publishedSiteRedirectLocation("/pages//projects")).toBe("/projects");
    expect(publishedSiteRedirectLocation("/pages/logo.svg")).toBe("/logo.svg");
    expect(publishedSiteRedirectLocation("/blog")).toBeUndefined();
  });
});
