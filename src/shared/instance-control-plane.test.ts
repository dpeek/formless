import { describe, expect, it } from "vite-plus/test";
import {
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  instanceControlPlaneAppInstallRecord,
  instanceControlPlaneDefaultRoutesForInstall,
  instanceControlPlaneEntityNames,
  instanceControlPlaneImmutableFields,
  instanceControlPlaneSchema,
  isInstanceControlPlaneEntityName,
  isInstanceControlPlaneRouteSafePath,
} from "./instance-control-plane.ts";
import { parseAppSchema } from "./schema.ts";
import { bundledSourceSchemaHashFixtures } from "./upgrade-migrations.ts";
import {
  isRuntimeControlPlaneImmutableField,
  isRuntimeControlPlaneSecretReferenceField,
} from "./schema-runtime.ts";

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
    expect(schema.runtime?.owner).toBe("runtime");
    expect(schema.runtime?.builder.editable).toBe(false);
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

    const schema = parseAppSchema(instanceControlPlaneSchema);
    expect(isRuntimeControlPlaneImmutableField(schema, "appInstall", "installId")).toBe(true);
    expect(isRuntimeControlPlaneImmutableField(schema, "appInstall", "label")).toBe(false);
    expect(
      isRuntimeControlPlaneSecretReferenceField(schema, "providerConfigRef", "secretRef"),
    ).toBe(true);
    expect(schema.runtime?.controlPlane?.entities.deployAttempt?.history).toEqual({
      kind: "actionCreated",
    });
  });

  it("marks generated install and route editor fields by ownership", () => {
    const schema = parseAppSchema(instanceControlPlaneSchema);

    expect(schema.views.appInstallList?.type === "collection").toBe(true);
    expect(
      schema.views.appInstallList?.type === "collection"
        ? schema.views.appInstallList.actions
        : undefined,
    ).toBeUndefined();
    expect(schema.views.appRouteList?.type === "collection").toBe(true);
    expect(
      schema.views.appRouteList?.type === "collection"
        ? schema.views.appRouteList.actions
        : undefined,
    ).toBeUndefined();
    expect(schema.tableViews.appInstallTable?.columns).toMatchObject([
      { field: "label", display: "editor" },
      { field: "installId", display: "readOnly" },
      { field: "packageAppKey", display: "readOnly" },
      { field: "status", display: "readOnly" },
      { field: "storageIdentity", display: "readOnly" },
    ]);
    expect(schema.tableViews.appRouteTable?.columns).toMatchObject([
      { field: "appInstall", display: "readOnly" },
      { field: "routeKind", display: "readOnly" },
      { field: "path", display: "editor" },
      { field: "prefix", display: "editor" },
      { field: "enabled", display: "editor" },
      { field: "surface", display: "readOnly" },
      { field: "packageCapability", display: "readOnly" },
    ]);
  });

  it("renders deployment management as separate read-only generated sections", () => {
    const schema = parseAppSchema(instanceControlPlaneSchema);
    const deployments = schema.screens?.deployments;

    expect(deployments?.layout.sections.map((section) => section.view)).toEqual([
      "deployTargetList",
      "providerConfigRefList",
      "deployDesiredResourceList",
      "deployAttemptList",
      "deployEvidenceSummaryList",
      "deployDriftReportList",
    ]);
    expect(schema.views.deployTargetList?.type === "collection").toBe(true);
    expect(
      schema.views.deployTargetList?.type === "collection"
        ? schema.views.deployTargetList.actions
        : undefined,
    ).toEqual([{ type: "create", createView: "deployTargetCreate" }]);
    expect(
      schema.views.deployAttemptList?.type === "collection"
        ? schema.views.deployAttemptList.actions
        : undefined,
    ).toBeUndefined();
    expect(schema.tableViews.deployDesiredResourceTable?.columns).toMatchObject([
      { field: "deployTarget", display: "readOnly" },
      { field: "domainMapping", display: "readOnly" },
      { field: "redirectIntent", display: "readOnly" },
      { field: "logicalId", display: "readOnly" },
      { field: "kind", display: "readOnly" },
      { field: "providerFamily", display: "readOnly" },
      { field: "enabled", display: "readOnly" },
      { field: "sourceFingerprint", display: "readOnly" },
    ]);
    expect(schema.tableViews.deployEvidenceSummaryTable?.columns).toMatchObject([
      { field: "deployAttempt", display: "readOnly" },
      { field: "deployDesiredResource", display: "readOnly" },
      { field: "logicalId", display: "readOnly" },
      { field: "kind", display: "readOnly" },
      { field: "action", display: "readOnly" },
      { field: "providerResourceIdsJson", display: "readOnly" },
      { field: "recordedAt", display: "readOnly" },
    ]);
    expect(schema.tableViews.deployDriftReportTable?.columns).toMatchObject([
      { field: "deployTarget", display: "readOnly" },
      { field: "versionId", display: "readOnly" },
      { field: "status", display: "readOnly" },
      { field: "createCount", display: "readOnly" },
      { field: "updateCount", display: "readOnly" },
      { field: "deleteCount", display: "readOnly" },
      { field: "affectedLogicalIdsJson", display: "readOnly" },
      { field: "reportedAt", display: "readOnly" },
    ]);
  });

  it("derives default app route records without nesting installed app data", () => {
    const now = "2026-05-28T00:00:00.000Z";

    expect(
      instanceControlPlaneAppInstallRecord({
        adminRoute: "/apps/personal",
        createdAt: now,
        installId: "personal",
        label: "Personal Site",
        packageAppKey: "site",
        packageRevision: 1,
        publicRoute: "/sites/personal",
        publicRoutePrefix: "/sites/personal/",
        schemaRoute: "/apps/personal/schema",
        sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
        status: "installed",
        updatedAt: now,
      }),
    ).toEqual({
      createdAt: now,
      entity: "appInstall",
      id: "personal",
      updatedAt: now,
      values: {
        installId: "personal",
        packageAppKey: "site",
        packageRevision: 1,
        sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
        label: "Personal Site",
        status: "installed",
        storageIdentity: "app:personal",
        createdAt: now,
        updatedAt: now,
      },
    });

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
    expect(isInstanceControlPlaneRouteSafePath("/api/jobs")).toBe(false);
  });
});
