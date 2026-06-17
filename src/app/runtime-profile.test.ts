import { describe, expect, it } from "vite-plus/test";
import {
  createAppRuntimeProfile,
  createDevWorkbenchRuntimeProfile,
  createDevRuntimeProfile,
  createInstalledAppRuntimeProfile,
  createInstanceRuntimeProfile,
  createPublishedSiteRuntimeProfile,
  createSiteAuthoringRuntimeProfile,
  FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME,
  FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME,
  FORMLESS_RUNTIME_PROFILE_META_NAME,
  findRuntimeWorldMountByRoute,
  installedAppWorldMountFromInstallId,
  installedSitePublicSurfaceFromRoute,
  isRuntimePublicSiteRoute,
  runtimeAppManagementHref,
  runtimeBrowserRoutePatterns,
  runtimeInstalledSitePublicPath,
  runtimeProfileNeedsInstalledAppRouteInstalls,
  readRuntimeProfileDocumentHint,
  readRuntimeProfileDocumentHints,
  resolveRuntimeProfile,
  runtimeRoutePolicy,
  runtimeScreenPathFromRoute,
  runtimeScreenRoute,
  selectBrowserRuntimeProfileHint,
  shouldRenderRuntimeRouteOutsideGeneratedAppFrame,
} from "./runtime-profile.ts";
import type { AppInstall } from "@dpeek/formless-installed-apps";
import type { SchemaKey } from "../shared/schema-apps.ts";
import { bundledSourceSchemaHashFixtures } from "../shared/upgrade-migrations.ts";

function appInstallFixture({
  installId,
  label,
  packageAppKey = "site",
}: {
  installId: string;
  label: string;
  packageAppKey?: SchemaKey;
}): AppInstall {
  return {
    adminRoute: `/apps/${installId}`,
    createdAt: "2026-05-25T00:00:00.000Z",
    installId,
    label,
    packageAppKey,
    packageRevision: 1,
    schemaRoute: `/apps/${installId}/schema`,
    sourceSchemaHash: bundledSourceSchemaHashFixtures[packageAppKey],
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
      siteRouteBase: "/sites",
    });
    expect(profile.worlds).toEqual([]);
    expect(findRuntimeWorldMountByRoute(profile, "/tasks")).toBeUndefined();
    expect(findRuntimeWorldMountByRoute(profile, "/crm")).toBeUndefined();
    expect(findRuntimeWorldMountByRoute(profile, "/site")).toBeUndefined();
    expect(findRuntimeWorldMountByRoute(profile, "/tasks/schema")).toBeUndefined();
    expect(runtimeRoutePolicy(profile)).toEqual({
      instanceBrowserRoutes: true,
      installedAppBrowserRoutes: true,
      installedSitePublicRoutes: true,
      ownerSessionBrowserRoutes: true,
      schemaKeyApiRoutes: false,
      schemaKeyBrowserRoutes: false,
    });
    expect(runtimeBrowserRoutePatterns(profile)).toEqual({
      instanceShellRoute: "/",
      installedAppHomeRoutePattern: "/apps/:installId",
      installedAppScreenRoutePattern: "/apps/:installId/*",
      installedSitePublicHomeRoutePattern: "/sites/:installId",
      installedSitePublicSlugRoutePattern: "/sites/:installId/*",
      ownerLoginRoute: "/login",
      ownerSetupRoute: "/setup",
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
      siteRouteBase: "/sites",
    });
    expect(profile.worlds.map((world) => world.app.key)).toEqual(["tasks", "site", "crm"]);
    expect(profile.worlds.map((world) => world.generatedRoutes)).toEqual([true, true, true]);
    expect(profile.worlds.map((world) => world.route)).toEqual(["/tasks", "/site", "/crm"]);
    expect(profile.worlds.map((world) => world.schemaRoute)).toEqual([
      "/tasks/schema",
      "/site/schema",
      "/crm/schema",
    ]);
    expect(profile.publicSitePreview?.homeRoute).toBe("/pages/home");
    expect(findRuntimeWorldMountByRoute(profile, "/rates")).toBeUndefined();
    expect(findRuntimeWorldMountByRoute(profile, "/rates/schema")).toBeUndefined();
    expect(runtimeRoutePolicy(profile)).toEqual({
      instanceBrowserRoutes: true,
      installedAppBrowserRoutes: true,
      installedSitePublicRoutes: true,
      ownerSessionBrowserRoutes: true,
      schemaKeyApiRoutes: true,
      schemaKeyBrowserRoutes: true,
    });
    expect(runtimeBrowserRoutePatterns(profile)).toEqual({
      instanceShellRoute: "/",
      installedAppHomeRoutePattern: "/apps/:installId",
      installedAppSchemaRoutePattern: "/apps/:installId/schema",
      installedAppScreenRoutePattern: "/apps/:installId/*",
      installedSitePublicHomeRoutePattern: "/sites/:installId",
      installedSitePublicSlugRoutePattern: "/sites/:installId/*",
      ownerLoginRoute: "/login",
      ownerSetupRoute: "/setup",
    });
    expect(runtimeProfileNeedsInstalledAppRouteInstalls(profile)).toBe(true);
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
      appInstallFixture({
        installId: "crm",
        label: "CRM",
        packageAppKey: "crm",
      }),
    ];
    const world = installedAppWorldMountFromInstallId(profile, "personal", { appInstalls });
    const tasksWorld = installedAppWorldMountFromInstallId(profile, "task-workspace", {
      appInstalls,
    });
    const crmWorld = installedAppWorldMountFromInstallId(profile, "crm", { appInstalls });

    if (!world?.target || world.target.kind !== "appInstall") {
      throw new Error("Missing installed Site world.");
    }

    if (!tasksWorld?.target || tasksWorld.target.kind !== "appInstall") {
      throw new Error("Missing installed Tasks world.");
    }

    if (!crmWorld?.target || crmWorld.target.kind !== "appInstall") {
      throw new Error("Missing installed CRM world.");
    }

    expect(world.app.key).toBe("site");
    expect(world.route).toBe("/apps/personal");
    expect(world.access).toBe("owner");
    expect(world.schemaRoute).toBe("/apps/personal/schema");
    expect(world.schemaRouteAccess).toBe("owner");
    expect(world.target.installId).toBe("personal");
    expect(world.target.apiRoutePrefix).toBe("/api/app-installs/site/personal");
    expect(tasksWorld.app.key).toBe("tasks");
    expect(tasksWorld.route).toBe("/apps/task-workspace");
    expect(tasksWorld.schemaRoute).toBe("/apps/task-workspace/schema");
    expect(tasksWorld.target.installId).toBe("task-workspace");
    expect(tasksWorld.target.apiRoutePrefix).toBe("/api/app-installs/tasks/task-workspace");
    expect(crmWorld.app.key).toBe("crm");
    expect(crmWorld.route).toBe("/apps/crm");
    expect(crmWorld.schemaRoute).toBe("/apps/crm/schema");
    expect(crmWorld.target.installId).toBe("crm");
    expect(crmWorld.target.apiRoutePrefix).toBe("/api/app-installs/crm/crm");
    expect(runtimeScreenRoute(world, "/")).toBe("/apps/personal");
    expect(runtimeScreenRoute(world, "/settings")).toBe("/apps/personal/settings");
    expect(runtimeScreenRoute(crmWorld, "/audiences")).toBe("/apps/crm/audiences");
    expect(runtimeScreenPathFromRoute(world, "/apps/personal")).toBe("/");
    expect(runtimeScreenPathFromRoute(world, "/apps/personal/settings")).toBe("/settings");
    expect(runtimeScreenPathFromRoute(world, "/apps/personal/schema")).toBeUndefined();
    expect(runtimeScreenPathFromRoute(crmWorld, "/apps/crm/audiences")).toBe("/audiences");
    expect(
      findRuntimeWorldMountByRoute(profile, "/apps/personal/settings", { appInstalls })?.target,
    ).toEqual(world.target);
    expect(
      findRuntimeWorldMountByRoute(profile, "/apps/task-workspace", { appInstalls })?.target,
    ).toEqual(tasksWorld.target);
    expect(
      findRuntimeWorldMountByRoute(profile, "/apps/crm/audiences", { appInstalls })?.target,
    ).toEqual(crmWorld.target);
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
    expect(shouldRenderRuntimeRouteOutsideGeneratedAppFrame(profile, "/", undefined)).toBe(true);
    expect(
      shouldRenderRuntimeRouteOutsideGeneratedAppFrame(profile, "/apps/task-workspace", world, {
        appInstalls,
      }),
    ).toBe(false);
    expect(runtimeAppManagementHref(profile, world)).toBe("/");
  });

  it("resolves installed app browser routes from enabled appRoute records", () => {
    const profile = createDevRuntimeProfile();
    const appInstalls: AppInstall[] = [
      {
        ...appInstallFixture({ installId: "personal", label: "Personal Site" }),
        routes: [
          {
            enabled: false,
            id: "app-route:personal:admin",
            path: "/apps/personal",
            routeKind: "admin",
          },
          {
            enabled: true,
            id: "app-route:personal:admin-custom",
            path: "/apps/personal-admin",
            routeKind: "admin",
          },
          {
            enabled: true,
            id: "app-route:personal:schema",
            path: "/apps/personal-admin/schema",
            routeKind: "schema",
          },
        ],
      },
    ];
    const world = findRuntimeWorldMountByRoute(profile, "/apps/personal-admin/settings", {
      appInstalls,
    });

    if (!world?.target || world.target.kind !== "appInstall") {
      throw new Error("Missing custom installed app route world.");
    }

    expect(world.route).toBe("/apps/personal-admin");
    expect(world.schemaRoute).toBe("/apps/personal-admin/schema");
    expect(world.target.installId).toBe("personal");
    expect(
      findRuntimeWorldMountByRoute(profile, "/apps/personal", { appInstalls }),
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
    expect(
      installedSitePublicSurfaceFromRoute(profile, "/sites/rates", { appInstalls }),
    ).toBeUndefined();
    expect(isRuntimePublicSiteRoute(profile, "/sites/task-workspace", { appInstalls })).toBe(false);
    expect(isRuntimePublicSiteRoute(profile, "/sites/rates", { appInstalls })).toBe(false);
    expect(runtimeInstalledSitePublicPath(profile, "personal", "home")).toBe("/sites/personal");
    expect(runtimeInstalledSitePublicPath(profile, "personal", "blog/post")).toBe(
      "/sites/personal/blog/post",
    );
    expect(
      shouldRenderRuntimeRouteOutsideGeneratedAppFrame(profile, "/sites/personal", undefined, {
        appInstalls,
      }),
    ).toBe(true);
  });

  it("resolves installed Site public surfaces from enabled public appRoute records", () => {
    const profile = createDevRuntimeProfile();
    const appInstalls: AppInstall[] = [
      {
        ...appInstallFixture({ installId: "personal", label: "Personal Site" }),
        routes: [
          {
            enabled: false,
            id: "app-route:personal:publicSite",
            path: "/sites/personal",
            prefix: "/sites/personal/",
            routeKind: "publicSite",
          },
          {
            enabled: true,
            id: "app-route:personal:publicSite-custom",
            path: "/public/personal",
            prefix: "/public/personal/",
            routeKind: "publicSite",
          },
        ],
      },
    ];
    const custom = installedSitePublicSurfaceFromRoute(profile, "/public/personal/blog/post", {
      appInstalls,
    });

    expect(custom?.routeBase).toBe("/public/personal");
    expect(custom?.slug).toBe("blog/post");
    expect(
      installedSitePublicSurfaceFromRoute(profile, "/sites/personal", { appInstalls }),
    ).toBeUndefined();
  });

  it("resolves an app profile with one app mounted at root paths", () => {
    const profile = createAppRuntimeProfile("crm");
    const world = profile.worlds[0];

    if (!world) {
      throw new Error("Missing app profile world mount.");
    }

    expect(profile.kind).toBe("app");
    expect(profile.shell).toBe("app");
    expect(profile.defaultRedirect).toBeUndefined();
    expect(world.app.key).toBe("crm");
    expect(world.generatedRoutes).toBe(true);
    expect(world.route).toBe("/");
    expect(world.schemaRoute).toBe("/schema");
    expect(runtimeScreenRoute(world, "/")).toBe("/");
    expect(runtimeScreenRoute(world, "/setup")).toBe("/setup");
    expect(runtimeScreenPathFromRoute(world, "/")).toBe("/");
    expect(runtimeScreenPathFromRoute(world, "/setup")).toBe("/setup");
    expect(runtimeScreenPathFromRoute(world, "/schema")).toBeUndefined();
    expect(runtimeBrowserRoutePatterns(profile)).toEqual({});
    expect(runtimeProfileNeedsInstalledAppRouteInstalls(profile)).toBe(false);
  });

  it("resolves an installed app profile with install-scoped root paths", () => {
    const profile = createInstalledAppRuntimeProfile({
      installId: "task-workspace",
      packageAppKey: "tasks",
    });
    const world = profile?.worlds[0];

    if (!profile || !world?.target || world.target.kind !== "appInstall") {
      throw new Error("Missing installed app profile world mount.");
    }

    expect(profile.kind).toBe("app");
    expect(profile.shell).toBe("app");
    expect(world.app.key).toBe("tasks");
    expect(world.route).toBe("/");
    expect(world.schemaRoute).toBe("/schema");
    expect(world.target.installId).toBe("task-workspace");
    expect(world.target.apiRoutePrefix).toBe("/api/app-installs/tasks/task-workspace");
    expect(world.target.browserDatabaseName).toBe("formless:app:task-workspace");
    expect(findRuntimeWorldMountByRoute(profile, "/")?.target).toEqual(world.target);
    expect(findRuntimeWorldMountByRoute(profile, "/schema")?.target).toEqual(world.target);
    expect(runtimeScreenRoute(world, "/")).toBe("/");
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
      packageAppKey: "site",
      rootRoute: "/",
      routePattern: "/*",
      homeSlug: "home",
      linkMode: "authoring",
    });
    expect(runtimeBrowserRoutePatterns(profile)).toEqual({});
    expect(runtimeScreenRoute(world, "/")).toBe("/admin");
    expect(runtimeScreenRoute(world, "/header")).toBe("/admin/header");
    expect(runtimeScreenPathFromRoute(world, "/admin")).toBe("/");
    expect(runtimeScreenPathFromRoute(world, "/admin/header")).toBe("/header");
  });

  it("can expose the Site authoring schema route explicitly", () => {
    const profile = createSiteAuthoringRuntimeProfile({ exposeSchemaRoute: true });

    expect(profile.worlds[0]?.schemaRoute).toBe("/admin/schema");
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
      homeSlug: "home",
      packageAppKey: "site",
      rootRoute: "/",
      routePattern: "/*",
    });
    expect(runtimeBrowserRoutePatterns(profile)).toEqual({
      ownerLoginRoute: "/login",
      ownerSetupRoute: "/setup",
    });
    expect(shouldRenderRuntimeRouteOutsideGeneratedAppFrame(profile, "/projects", undefined)).toBe(
      true,
    );
  });

  it("uses explicit config first and host config only as a deterministic fallback", () => {
    expect(resolveRuntimeProfile({ profile: "instance" }).kind).toBe("instance");
    expect(resolveRuntimeProfile({ profile: "app", schemaKey: "crm" }).kind).toBe("app");
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

  it("uses document app target hints for mapped installed app hosts", () => {
    const doc = {
      querySelector: (selector: string) => {
        const values = {
          [`meta[name="${FORMLESS_RUNTIME_PROFILE_META_NAME}"]`]: "app",
          [`meta[name="${FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME}"]`]: "task-workspace",
          [`meta[name="${FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME}"]`]: "tasks",
        };
        const value = values[selector as keyof typeof values];

        return value
          ? {
              getAttribute: (name: string) => (name === "content" ? value : null),
            }
          : null;
      },
    };
    const hints = readRuntimeProfileDocumentHints(doc);
    const profile = resolveRuntimeProfile({
      hostname: "tasks.example.com",
      ...hints,
    });
    const world = profile.worlds[0];

    if (!world?.target || world.target.kind !== "appInstall") {
      throw new Error("Missing installed app target.");
    }

    expect(readRuntimeProfileDocumentHint(doc)).toBe("app");
    expect(profile.kind).toBe("app");
    expect(world.app.key).toBe("tasks");
    expect(world.route).toBe("/");
    expect(world.schemaRoute).toBe("/schema");
    expect(world.target.installId).toBe("task-workspace");
  });

  it("uses document public Site target hints for mapped installed public hosts", () => {
    const profile = resolveRuntimeProfile({
      profile: "publishedSite",
      appInstallId: "personal",
      packageAppKey: "site",
    });

    if (!profile.publishedSite?.target || profile.publishedSite.target.kind !== "appInstall") {
      throw new Error("Missing published Site target.");
    }

    expect(profile.kind).toBe("publishedSite");
    expect(profile.publishedSite.packageAppKey).toBe("site");
    expect(profile.publishedSite.target.installId).toBe("personal");
    expect(profile.publishedSite.target.apiRoutePrefix).toBe("/api/app-installs/site/personal");
  });

  it("lets SSR document profile hints override the baked browser env profile", () => {
    expect(
      selectBrowserRuntimeProfileHint({
        documentProfile: "publishedSite",
        envProfile: "instance",
      }),
    ).toBe("publishedSite");
    expect(
      selectBrowserRuntimeProfileHint({
        documentProfile: undefined,
        envProfile: "instance",
      }),
    ).toBe("instance");
  });
});
