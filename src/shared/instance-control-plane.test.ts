import { describe, expect, it } from "vite-plus/test";
import {
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  instanceControlPlaneDefaultRoutesForInstall,
  instanceControlPlaneEntityNames,
  instanceControlPlaneImmutableFields,
  instanceControlPlaneSchema,
  isInstanceControlPlaneEntityName,
  isInstanceControlPlaneRouteSafePath,
} from "./instance-control-plane.ts";
import { parseAppSchema } from "./schema.ts";

describe("instance control-plane schema contracts", () => {
  it("defines the runtime-owned flat record schema", () => {
    const schema = parseAppSchema(instanceControlPlaneSchema);

    expect(Object.keys(schema.entities).sort()).toEqual(
      [...instanceControlPlaneEntityNames].sort(),
    );
    expect(schema.relationships?.appRouteInstall).toEqual({
      kind: "toOne",
      label: "App route install",
      from: { entity: "appRoute", field: "appInstall" },
      to: { entity: "appInstall" },
    });
    expect(schema.screens?.apps.path).toBe("/");
    expect(schema.screens?.domains.path).toBe("/domains");
    expect(schema.screens?.deployments.path).toBe("/deployments");
  });

  it("records identity invariants outside mutable generated fields", () => {
    expect(INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY).toBe("instance:control-plane");
    expect(instanceControlPlaneImmutableFields.appInstall).toEqual([
      "installId",
      "packageAppKey",
      "storageIdentity",
    ]);
    expect(instanceControlPlaneImmutableFields.appRoute).toEqual([
      "appInstall",
      "packageCapability",
      "surface",
    ]);
    expect(isInstanceControlPlaneEntityName("appInstall")).toBe(true);
    expect(isInstanceControlPlaneEntityName("missing")).toBe(false);
  });

  it("derives default app route records without nesting installed app data", () => {
    const now = "2026-05-28T00:00:00.000Z";

    expect(
      instanceControlPlaneDefaultRoutesForInstall({
        installId: "personal",
        packageAppKey: "site",
        now,
      }).map((record) => record.values),
    ).toEqual([
      {
        appInstall: "personal",
        routeKind: "admin",
        path: "/apps/personal",
        surface: "admin",
        packageCapability: "generatedApp",
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        appInstall: "personal",
        routeKind: "schema",
        path: "/apps/personal/schema",
        surface: "schema",
        packageCapability: "schema",
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        appInstall: "personal",
        routeKind: "publicSite",
        path: "/sites/personal",
        prefix: "/sites/personal/",
        surface: "publicSite",
        packageCapability: "publicSite",
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    expect(
      instanceControlPlaneDefaultRoutesForInstall({
        installId: "tasks",
        packageAppKey: "tasks",
        now,
      }).map((record) => record.values.routeKind),
    ).toEqual(["admin", "schema"]);
  });

  it("keeps route paths static, app-relative, lowercase, and away from reserved roots", () => {
    expect(isInstanceControlPlaneRouteSafePath("/apps/personal")).toBe(true);
    expect(isInstanceControlPlaneRouteSafePath("/sites/personal")).toBe(true);
    expect(isInstanceControlPlaneRouteSafePath("apps/personal")).toBe(false);
    expect(isInstanceControlPlaneRouteSafePath("/Apps/personal")).toBe(false);
    expect(isInstanceControlPlaneRouteSafePath("/apps//personal")).toBe(false);
    expect(isInstanceControlPlaneRouteSafePath("/api")).toBe(false);
  });
});
