import { describe, expect, it } from "vite-plus/test";
import {
  createAppRuntimeProfile,
  createDevRuntimeProfile,
  createPublishedSiteRuntimeProfile,
  FORMLESS_RUNTIME_PROFILE_META_NAME,
  readRuntimeProfileDocumentHint,
  resolveRuntimeProfile,
  runtimeScreenPathFromRoute,
  runtimeScreenRoute,
} from "./runtime-profile.ts";

describe("runtime profile resolver", () => {
  it("resolves the dev profile with schema-keyed app mounts", () => {
    const profile = createDevRuntimeProfile();

    expect(profile.kind).toBe("dev");
    expect(profile.shell).toBe("dev");
    expect(profile.defaultRedirect).toBe("/tasks");
    expect(profile.worlds.map((world) => world.app.key)).toEqual(["tasks", "estii", "site"]);
    expect(profile.worlds.map((world) => world.generatedRoutes)).toEqual([true, true, true]);
    expect(profile.worlds.map((world) => world.route)).toEqual(["/tasks", "/estii", "/site"]);
    expect(profile.worlds.map((world) => world.schemaRoute)).toEqual([
      "/tasks/schema",
      "/estii/schema",
      "/site/schema",
    ]);
    expect(profile.publicSitePreview?.homeRoute).toBe("/pages/home");
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
    expect(resolveRuntimeProfile({ profile: "app", schemaKey: "estii" }).kind).toBe("app");
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
    expect(resolveRuntimeProfile({ hostname: "published-site.formless.local" }).kind).toBe(
      "publishedSite",
    );
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
