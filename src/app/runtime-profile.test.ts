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
import type { AppInstall, PackageAppKey } from "../shared/app-installs.ts";

function appInstallFixture({
  installId,
  label,
  packageAppKey = "site",
}: {
  installId: string;
  label: string;
  packageAppKey?: PackageAppKey;
}): AppInstall {
  return {
    adminRoute: `/apps/${installId}`,
    createdAt: "2026-05-25T00:00:00.000Z",
    installId,
    label,
    packageAppKey,
    schemaRoute: `/apps/${installId}/schema`,
    status: "installed",
    updatedAt: "2026-05-25T00:00:00.000Z",
    ...(packageAppKey === "site"
      ? {
          publicRoute: `/sites/${installId}` as const,
          publicRoutePrefix: `/sites/${installId}/` as const,
        }
      : {}),
  };
}

describe("runtime profile resolver", () => {
  it("resolves the product instance profile without schema-keyed app mounts", () => {
    const profile = createInstanceRuntimeProfile();

    expect(profile.kind).toBe("instance");
    expect(profile.shell).toBe("instance");
    expect(profile.defaultRedirect).toBeUndefined();
    expect(profile.instanceShell).toBe(true);
    expect(profile.installedAppRoutes).toEqual({
      appRouteBase: "/apps",
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

  it("resolves installed admin route mounts from install records", () => {
    const profile = createDevRuntimeProfile();
    const appInstalls = [
      appInstallFixture({ installId: "personal", label: "Personal Site" }),
      appInstallFixture({
        installId: "task-workspace",
        label: "Task Workspace",
        packageAppKey: "tasks",
      }),
    ];
    const world = installedAppWorldMountFromInstallId(profile, "personal", { appInstalls });
    const tasksWorld = installedAppWorldMountFromInstallId(profile, "task-workspace", {
      appInstalls,
    });

    if (!world?.target || world.target.kind !== "appInstall") {
      throw new Error("Missing installed Site world.");
    }

    if (!tasksWorld?.target || tasksWorld.target.kind !== "appInstall") {
      throw new Error("Missing installed Tasks world.");
    }

    expect(world.app.key).toBe("site");
    expect(world.route).toBe("/apps/personal");
    expect(world.schemaRoute).toBe("/apps/personal/schema");
    expect(world.target.installId).toBe("personal");
    expect(world.target.apiRoutePrefix).toBe("/api/app-installs/site/personal");
    expect(tasksWorld.app.key).toBe("tasks");
    expect(tasksWorld.route).toBe("/apps/task-workspace");
    expect(tasksWorld.schemaRoute).toBe("/apps/task-workspace/schema");
    expect(tasksWorld.target.installId).toBe("task-workspace");
    expect(tasksWorld.target.apiRoutePrefix).toBe("/api/app-installs/tasks/task-workspace");
    expect(runtimeScreenRoute(world, "/")).toBe("/apps/personal");
    expect(runtimeScreenRoute(world, "/settings")).toBe("/apps/personal/settings");
    expect(runtimeScreenPathFromRoute(world, "/apps/personal")).toBe("/");
    expect(runtimeScreenPathFromRoute(world, "/apps/personal/settings")).toBe("/settings");
    expect(runtimeScreenPathFromRoute(world, "/apps/personal/schema")).toBeUndefined();
    expect(
      findRuntimeWorldMountByRoute(profile, "/apps/personal/settings", { appInstalls })?.target,
    ).toEqual(world.target);
    expect(
      findRuntimeWorldMountByRoute(profile, "/apps/task-workspace", { appInstalls })?.target,
    ).toEqual(tasksWorld.target);
    expect(
      installedAppWorldMountFromInstallId(profile, "missing", { appInstalls }),
    ).toBeUndefined();
  });

  it("preserves product instance schema policy for installed app routes", () => {
    const profile = createInstanceRuntimeProfile();
    const appInstalls = [
      appInstallFixture({
        installId: "task-workspace",
        label: "Task Workspace",
        packageAppKey: "tasks",
      }),
    ];
    const world = installedAppWorldMountFromInstallId(profile, "task-workspace", { appInstalls });

    if (!world?.target || world.target.kind !== "appInstall") {
      throw new Error("Missing installed Tasks world.");
    }

    expect(world.app.key).toBe("tasks");
    expect(world.route).toBe("/apps/task-workspace");
    expect(world.schemaRoute).toBeUndefined();
    expect(world.target.apiRoutePrefix).toBe("/api/app-installs/tasks/task-workspace");
    expect(findRuntimeWorldMountByRoute(profile, "/apps/task-workspace", { appInstalls })).toEqual(
      world,
    );
    expect(
      findRuntimeWorldMountByRoute(profile, "/apps/task-workspace/schema", { appInstalls }),
    ).toBeUndefined();
  });

  it("resolves installed Site public route surfaces from install ids", () => {
    const profile = createDevRuntimeProfile();
    const appInstalls = [
      appInstallFixture({ installId: "personal", label: "Personal Site" }),
      appInstallFixture({
        installId: "task-workspace",
        label: "Task Workspace",
        packageAppKey: "tasks",
      }),
    ];
    const home = installedSitePublicSurfaceFromRoute(profile, "/sites/personal", { appInstalls });
    const nested = installedSitePublicSurfaceFromRoute(profile, "/sites/personal/blog/post", {
      appInstalls,
    });

    if (!home?.target || home.target.kind !== "appInstall") {
      throw new Error("Missing installed Site public surface.");
    }

    expect(home.routeBase).toBe("/sites/personal");
    expect(home.slug).toBe("home");
    expect(home.target.installId).toBe("personal");
    expect(home.target.apiRoutePrefix).toBe("/api/app-installs/site/personal");
    expect(nested?.routeBase).toBe("/sites/personal");
    expect(nested?.slug).toBe("blog/post");
    expect(isRuntimePublicSiteRoute(profile, "/sites/personal", { appInstalls })).toBe(true);
    expect(isRuntimePublicSiteRoute(profile, "/sites/personal/blog/post", { appInstalls })).toBe(
      true,
    );
    expect(
      installedSitePublicSurfaceFromRoute(profile, "/sites/task-workspace", { appInstalls }),
    ).toBeUndefined();
    expect(isRuntimePublicSiteRoute(profile, "/sites/task-workspace", { appInstalls })).toBe(false);
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
