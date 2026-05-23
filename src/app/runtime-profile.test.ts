import { describe, expect, it } from "vite-plus/test";
import {
  createAppRuntimeProfile,
  createDevWorkbenchRuntimeProfile,
  createDevRuntimeProfile,
  createInstanceRuntimeProfile,
  createPublishedSiteRuntimeProfile,
  createSiteAuthoringRuntimeProfile,
  FORMLESS_RUNTIME_PROFILE_META_NAME,
  findRuntimeWorldMountByRoute,
  installedAppWorldMountFromInstallId,
  installedSitePublicSurfaceFromRoute,
  isRuntimePublicSiteRoute,
  readRuntimeProfileDocumentHint,
  resolveRuntimeProfile,
  runtimeRoutePolicy,
  runtimeScreenPathFromRoute,
  runtimeScreenRoute,
} from "./runtime-profile.ts";

describe("runtime profile resolver", () => {
  it("resolves the product instance profile without schema-keyed app mounts", () => {
    const profile = createInstanceRuntimeProfile();

    expect(profile.kind).toBe("instance");
    expect(profile.shell).toBe("instance");
    expect(profile.defaultRedirect).toBeUndefined();
    expect(profile.instanceShell).toBe(true);
    expect(profile.installedAppRoutes).toEqual({
      appRouteBase: "/apps",
      packageAppKey: "site",
      schemaRoutes: false,
    });
    expect(profile.installedSitePublicRoutes).toEqual({
      homeSlug: "home",
      packageAppKey: "site",
      siteRouteBase: "/sites",
    });
    expect(profile.worlds).toEqual([]);
    expect(findRuntimeWorldMountByRoute(profile, "/tasks")).toBeUndefined();
    expect(findRuntimeWorldMountByRoute(profile, "/estii")).toBeUndefined();
    expect(findRuntimeWorldMountByRoute(profile, "/site")).toBeUndefined();
    expect(findRuntimeWorldMountByRoute(profile, "/tasks/schema")).toBeUndefined();
    expect(installedAppWorldMountFromInstallId(profile, "personal")?.schemaRoute).toBeUndefined();
    expect(installedAppWorldMountFromInstallId(profile, "site")?.route).toBe("/apps/site");
    expect(runtimeRoutePolicy(profile)).toEqual({
      installedAppBrowserRoutes: true,
      installedSitePublicRoutes: true,
      schemaKeyApiRoutes: false,
      schemaKeyBrowserRoutes: false,
    });
  });

  it("resolves the dev workbench profile with schema-keyed app mounts", () => {
    const profile = createDevWorkbenchRuntimeProfile();

    expect(profile.kind).toBe("dev");
    expect(profile.shell).toBe("dev");
    expect(profile.defaultRedirect).toBeUndefined();
    expect(profile.instanceShell).toBe(true);
    expect(profile.installedAppRoutes).toEqual({
      appRouteBase: "/apps",
      packageAppKey: "site",
      schemaRoutes: true,
    });
    expect(profile.installedSitePublicRoutes).toEqual({
      homeSlug: "home",
      packageAppKey: "site",
      siteRouteBase: "/sites",
    });
    expect(profile.worlds.map((world) => world.app.key)).toEqual(["tasks", "estii", "site"]);
    expect(profile.worlds.map((world) => world.generatedRoutes)).toEqual([true, true, true]);
    expect(profile.worlds.map((world) => world.route)).toEqual(["/tasks", "/estii", "/site"]);
    expect(profile.worlds.map((world) => world.schemaRoute)).toEqual([
      "/tasks/schema",
      "/estii/schema",
      "/site/schema",
    ]);
    expect(profile.publicSitePreview?.homeRoute).toBe("/pages/home");
    expect(findRuntimeWorldMountByRoute(profile, "/rates")).toBeUndefined();
    expect(findRuntimeWorldMountByRoute(profile, "/rates/schema")).toBeUndefined();
    expect(runtimeRoutePolicy(profile)).toEqual({
      installedAppBrowserRoutes: true,
      installedSitePublicRoutes: true,
      schemaKeyApiRoutes: true,
      schemaKeyBrowserRoutes: true,
    });
  });

  it("resolves installed Site admin route mounts from install ids", () => {
    const profile = createDevRuntimeProfile();
    const world = installedAppWorldMountFromInstallId(profile, "personal");

    if (!world?.target || world.target.kind !== "appInstall") {
      throw new Error("Missing installed Site world.");
    }

    expect(world.app.key).toBe("site");
    expect(world.route).toBe("/apps/personal");
    expect(world.schemaRoute).toBe("/apps/personal/schema");
    expect(world.target.installId).toBe("personal");
    expect(world.target.apiRoutePrefix).toBe("/api/app-installs/site/personal");
    expect(runtimeScreenRoute(world, "/")).toBe("/apps/personal");
    expect(runtimeScreenRoute(world, "/settings")).toBe("/apps/personal/settings");
    expect(runtimeScreenPathFromRoute(world, "/apps/personal")).toBe("/");
    expect(runtimeScreenPathFromRoute(world, "/apps/personal/settings")).toBe("/settings");
    expect(runtimeScreenPathFromRoute(world, "/apps/personal/schema")).toBeUndefined();
    expect(findRuntimeWorldMountByRoute(profile, "/apps/personal/settings")?.target).toEqual(
      world.target,
    );
    expect(installedAppWorldMountFromInstallId(profile, "site")?.route).toBe("/apps/site");
  });

  it("resolves installed Site public route surfaces from install ids", () => {
    const profile = createDevRuntimeProfile();
    const home = installedSitePublicSurfaceFromRoute(profile, "/sites/personal");
    const nested = installedSitePublicSurfaceFromRoute(profile, "/sites/personal/blog/post");

    if (!home?.target || home.target.kind !== "appInstall") {
      throw new Error("Missing installed Site public surface.");
    }

    expect(home.routeBase).toBe("/sites/personal");
    expect(home.slug).toBe("home");
    expect(home.target.installId).toBe("personal");
    expect(home.target.apiRoutePrefix).toBe("/api/app-installs/site/personal");
    expect(nested?.routeBase).toBe("/sites/personal");
    expect(nested?.slug).toBe("blog/post");
    expect(isRuntimePublicSiteRoute(profile, "/sites/personal")).toBe(true);
    expect(isRuntimePublicSiteRoute(profile, "/sites/personal/blog/post")).toBe(true);
    expect(installedSitePublicSurfaceFromRoute(profile, "/sites/site")?.routeBase).toBe(
      "/sites/site",
    );
  });

  it("resolves an app profile with one app mounted at root paths", () => {
    const profile = createAppRuntimeProfile("estii");
    const world = profile.worlds[0];

    if (!world) {
      throw new Error("Missing app profile world mount.");
    }

    expect(profile.kind).toBe("app");
    expect(profile.shell).toBe("app");
    expect(profile.defaultRedirect).toBeUndefined();
    expect(world.app.key).toBe("estii");
    expect(world.generatedRoutes).toBe(true);
    expect(world.route).toBe("/");
    expect(world.schemaRoute).toBe("/schema");
    expect(runtimeScreenRoute(world, "/")).toBe("/");
    expect(runtimeScreenRoute(world, "/setup")).toBe("/setup");
    expect(runtimeScreenPathFromRoute(world, "/")).toBe("/");
    expect(runtimeScreenPathFromRoute(world, "/setup")).toBe("/setup");
    expect(runtimeScreenPathFromRoute(world, "/schema")).toBeUndefined();
  });

  it("resolves the Site authoring profile with top-level preview and admin routes", () => {
    const profile = createSiteAuthoringRuntimeProfile();
    const world = profile.worlds[0];

    if (!world) {
      throw new Error("Missing Site authoring profile world mount.");
    }

    expect(profile.kind).toBe("siteAuthoring");
    expect(profile.shell).toBe("app");
    expect(profile.defaultRedirect).toBeUndefined();
    expect(world.app.key).toBe("site");
    expect(world.generatedRoutes).toBe(true);
    expect(world.route).toBe("/admin");
    expect(world.schemaRoute).toBeUndefined();
    expect(profile.publicSitePreview).toEqual({
      rootRoute: "/",
      routePattern: "/*",
      homeSlug: "home",
      linkMode: "authoring",
    });
    expect(runtimeScreenRoute(world, "/")).toBe("/admin");
    expect(runtimeScreenRoute(world, "/header")).toBe("/admin/header");
    expect(runtimeScreenPathFromRoute(world, "/admin")).toBe("/");
    expect(runtimeScreenPathFromRoute(world, "/admin/header")).toBe("/header");
  });

  it("can expose the Site authoring schema route explicitly", () => {
    const profile = createSiteAuthoringRuntimeProfile({ exposeSchemaRoute: true });

    expect(profile.worlds[0]?.schemaRoute).toBe("/admin/schema");
  });

  it("carries a local publish broker only when configured explicitly", () => {
    expect(createSiteAuthoringRuntimeProfile().localPublish).toBeUndefined();

    expect(
      createSiteAuthoringRuntimeProfile({
        localPublish: {
          endpoint: "http://127.0.0.1:43123/publish",
          token: "local-broker-token",
        },
      }).localPublish,
    ).toEqual({
      endpoint: "http://127.0.0.1:43123/publish",
      token: "local-broker-token",
    });
  });

  it("resolves the published Site profile without generated admin routes", () => {
    const profile = createPublishedSiteRuntimeProfile();
    const world = profile.worlds[0];

    if (!world) {
      throw new Error("Missing published Site profile world mount.");
    }

    expect(profile.kind).toBe("publishedSite");
    expect(profile.shell).toBe("publishedSite");
    expect(world.app.key).toBe("site");
    expect(world.generatedRoutes).toBe(false);
    expect(world.route).toBe("/");
    expect(world.schemaRoute).toBeUndefined();
    expect(profile.publishedSite).toEqual({
      rootRoute: "/",
      routePattern: "/*",
      homeSlug: "home",
    });
  });

  it("uses explicit config first and host config only as a deterministic fallback", () => {
    expect(resolveRuntimeProfile({ profile: "instance" }).kind).toBe("instance");
    expect(resolveRuntimeProfile({ profile: "app", schemaKey: "estii" }).kind).toBe("app");
    expect(resolveRuntimeProfile({ profile: "siteAuthoring" }).kind).toBe("siteAuthoring");
    expect(resolveRuntimeProfile({ profile: "publishedSite" }).kind).toBe("publishedSite");
    expect(
      resolveRuntimeProfile({
        hostname: "formless.twitchy.workers.dev",
        profile: "dev",
      }).kind,
    ).toBe("dev");
    expect(resolveRuntimeProfile({ hostname: "app.formless.local", schemaKey: "site" }).kind).toBe(
      "app",
    );
    expect(resolveRuntimeProfile({ hostname: "site-authoring.formless.local" }).kind).toBe(
      "siteAuthoring",
    );
    expect(resolveRuntimeProfile({ hostname: "published-site.formless.local" }).kind).toBe(
      "publishedSite",
    );
    expect(resolveRuntimeProfile({ hostname: "instance.formless.local" }).kind).toBe("instance");
    expect(resolveRuntimeProfile({ hostname: "formless.twitchy.workers.dev" }).kind).toBe(
      "publishedSite",
    );
    expect(resolveRuntimeProfile({ profile: "missing", schemaKey: "missing" }).kind).toBe("dev");
  });

  it("uses an SSR document profile hint before falling back to the host", () => {
    const doc = {
      querySelector: (selector: string) =>
        selector === `meta[name="${FORMLESS_RUNTIME_PROFILE_META_NAME}"]`
          ? {
              getAttribute: (name: string) => (name === "content" ? "publishedSite" : null),
            }
          : null,
    };

    const profile = resolveRuntimeProfile({
      hostname: "34-public-site-ssr.formless.local",
      profile: readRuntimeProfileDocumentHint(doc),
    });

    expect(profile.kind).toBe("publishedSite");
  });
});
