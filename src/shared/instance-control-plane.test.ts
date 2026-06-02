import { describe, expect, it } from "vite-plus/test";
import {
  INSTANCE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  formatInstanceControlPlaneBoundaryEntityName,
  instanceControlPlaneAppInstallRecord,
  instanceControlPlaneDefaultRoutesForInstall,
  instanceControlPlaneEntityNames,
  instanceControlPlaneImmutableFields,
  instanceControlPlaneSchema,
  isInstanceControlPlaneEntityName,
  isInstanceControlPlaneRouteSafePath,
  parseInstanceControlPlaneBoundaryEntityName,
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
    const referenceTargets = Object.values(schema.entities).flatMap((entity) =>
      Object.values(entity.fields).flatMap((field) =>
        field.type === "reference" ? [field.to] : [],
      ),
    );

    expect(Object.keys(schema.entities).sort()).toEqual(
      [...instanceControlPlaneEntityNames].sort(),
    );
    expect(Object.keys(schema.entities)).not.toContain("appInstall");
    expect(referenceTargets.filter((target) => target.includes(":"))).toEqual([]);
    expect(referenceTargets).toEqual(
      expect.arrayContaining(["app-install", "route", "deploy-target"]),
    );
    expect(schema.relationships?.routeInstall).toEqual({
      kind: "toOne",
      label: "Route install",
      from: { entity: "route", field: "appInstall" },
      to: { entity: "app-install" },
    });
    expect(schema.screens?.apps.path).toBe("/");
    expect(schema.screens?.routes.path).toBe("/routes");
    expect(schema.screens?.deployments.path).toBe("/deployments");
    expect(schema.runtime?.owner).toBe("runtime");
    expect(schema.runtime?.builder.editable).toBe(false);
  });

  it("defines flat unified route fields for mount and redirect intent", () => {
    const schema = parseAppSchema(instanceControlPlaneSchema);
    const routeFields = schema.entities.route?.fields;

    expect(routeFields).toMatchObject({
      enabled: { type: "boolean", required: true, default: true },
      matchHost: { type: "text", required: false },
      matchPath: { type: "text", required: true },
      matchPrefix: { type: "text", required: false },
      kind: {
        type: "enum",
        required: true,
        values: {
          mount: { label: "Mount" },
          redirect: { label: "Redirect" },
        },
      },
      targetProfile: {
        type: "enum",
        required: false,
        values: {
          app: { label: "App" },
          instance: { label: "Instance" },
          "public-site": { label: "Public Site" },
        },
      },
      appInstall: {
        type: "reference",
        required: false,
        to: "app-install",
        displayField: "label",
      },
      surface: {
        type: "enum",
        required: false,
        values: {
          admin: { label: "Admin" },
          "public-site": { label: "Public Site" },
          schema: { label: "Schema" },
        },
      },
      providerConfig: {
        type: "reference",
        required: false,
        to: "provider-config-ref",
        displayField: "label",
      },
      toHost: { type: "text", required: false },
      toUrl: { type: "text", required: false, format: "href" },
      statusCode: {
        type: "enum",
        required: false,
        values: {
          "301": { label: "301" },
          "302": { label: "302" },
          "303": { label: "303" },
          "307": { label: "307" },
          "308": { label: "308" },
        },
      },
      preservePath: { type: "boolean", required: false, default: true },
      preserveQueryString: { type: "boolean", required: false, default: true },
      createdAt: { type: "text", required: true },
      updatedAt: { type: "text", required: true },
    });
    expect(Object.keys(routeFields ?? {})).toEqual([
      "enabled",
      "matchHost",
      "matchPath",
      "matchPrefix",
      "kind",
      "targetProfile",
      "appInstall",
      "surface",
      "providerConfig",
      "toHost",
      "toUrl",
      "statusCode",
      "preservePath",
      "preserveQueryString",
      "createdAt",
      "updatedAt",
    ]);
    expect(schema.runtime?.controlPlane?.entities.route).toEqual({
      immutableFields: ["kind"],
    });
  });

  it("records identity invariants outside mutable generated fields", () => {
    expect(INSTANCE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY).toBe("instance");
    expect(INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY).toBe("instance:control-plane");
    expect(formatInstanceControlPlaneBoundaryEntityName("route")).toBe("instance:route");
    expect(
      parseInstanceControlPlaneBoundaryEntityName("Archive record entity", "instance:route"),
    ).toBe("route");
    expect(() =>
      parseInstanceControlPlaneBoundaryEntityName(
        "Archive record entity",
        "instance-control-plane:app-install",
      ),
    ).toThrow('Archive record entity schema key must be "instance".');
    expect(instanceControlPlaneImmutableFields["app-install"]).toEqual([
      "installId",
      "packageAppKey",
      "storageIdentity",
    ]);
    expect(instanceControlPlaneImmutableFields.route).toEqual(["kind"]);
    expect(isInstanceControlPlaneEntityName("app-install")).toBe(true);
    expect(isInstanceControlPlaneEntityName("app-route")).toBe(false);
    expect(isInstanceControlPlaneEntityName("missing")).toBe(false);

    const schema = parseAppSchema(instanceControlPlaneSchema);
    expect(isRuntimeControlPlaneImmutableField(schema, "app-install", "installId")).toBe(true);
    expect(isRuntimeControlPlaneImmutableField(schema, "app-install", "label")).toBe(false);
    expect(
      isRuntimeControlPlaneSecretReferenceField(schema, "provider-config-ref", "secretRef"),
    ).toBe(true);
    expect(schema.runtime?.controlPlane?.entities["deploy-attempt"]?.history).toEqual({
      kind: "actionCreated",
    });
  });

  it("marks generated install and route editor fields by ownership", () => {
    const schema = parseAppSchema(instanceControlPlaneSchema);
    const routeTable = schema.tableViews.routeTable;
    const routesByProviderConfigList = schema.views.routesByProviderConfigList;
    const routesScreen = schema.screens?.routes;

    expect(schema.views.appInstallList?.type === "collection").toBe(true);
    expect(
      schema.views.appInstallList?.type === "collection"
        ? schema.views.appInstallList.actions
        : undefined,
    ).toBeUndefined();
    expect(schema.views.routeList?.type === "collection").toBe(true);
    expect(
      schema.views.routeList?.type === "collection" ? schema.views.routeList.actions : undefined,
    ).toEqual([{ type: "create", createView: "routeCreate" }]);
    expect(
      schema.views.routeList?.type === "collection"
        ? schema.views.routeList.queries.map((slot) => slot.query)
        : undefined,
    ).toEqual([
      "routeAll",
      "routeEnabled",
      "routeMount",
      "routeHostMapping",
      "routeRedirect",
      "routeInstanceMount",
      "routeAppMount",
      "routePublicSiteMount",
    ]);
    expect(
      routesByProviderConfigList?.type === "collection"
        ? {
            context: routesByProviderConfigList.context,
            defaultQuery: routesByProviderConfigList.defaultQuery,
          }
        : undefined,
    ).toMatchObject({
      context: {
        name: "providerConfig",
        entity: "provider-config-ref",
        relationship: "providerConfigRoutes",
      },
      defaultQuery: "routesForSelectedProviderConfig",
    });
    expect(routesScreen?.layout.sections.map((section) => section.view)).toEqual([
      "routeList",
      "routesByProviderConfigList",
    ]);
    expect(JSON.stringify(routesScreen)).not.toContain("deployEvidenceSummaryList");
    expect(JSON.stringify(routesScreen)).not.toContain("deployDriftReportList");
    expect(
      routeTable?.actions?.editRoute?.type === "editRecord"
        ? routeTable.actions.editRoute.editView
        : undefined,
    ).toBe("routeEdit");
    expect(schema.tableViews.appInstallTable?.columns).toMatchObject([
      { field: "label", display: "editor" },
      { field: "installId", display: "readOnly" },
      { field: "packageAppKey", display: "readOnly" },
      { field: "status", display: "readOnly" },
      { field: "storageIdentity", display: "readOnly" },
      { field: "packageRevision", display: "readOnly" },
      { field: "sourceSchemaHash", display: "readOnly" },
    ]);
    expect(routeTable?.columns).toMatchObject([
      { field: "enabled", display: "editor" },
      { field: "matchHost", display: "readOnly" },
      { field: "matchPath", display: "readOnly" },
      { field: "matchPrefix", display: "readOnly" },
      { field: "kind", display: "readOnly" },
      { field: "targetProfile", display: "readOnly" },
      { field: "appInstall", display: "readOnly" },
      { field: "surface", display: "readOnly" },
      { field: "providerConfig", display: "readOnly" },
      { field: "toHost", display: "readOnly" },
      { field: "toUrl", display: "readOnly" },
      { field: "statusCode", display: "readOnly" },
      { field: "createdAt", display: "readOnly" },
      { field: "updatedAt", display: "readOnly" },
      { type: "invokeAction", actions: ["editRoute"] },
    ]);
    expect(
      schema.views.routeEdit?.type === "edit" ? schema.views.routeEdit.fields : undefined,
    ).toMatchObject({
      targetProfile: { visibleWhen: { field: "kind", values: ["mount"] } },
      appInstall: { visibleWhen: { field: "targetProfile", values: ["app", "public-site"] } },
      toHost: { visibleWhen: { field: "kind", values: ["redirect"] } },
      statusCode: { visibleWhen: { field: "kind", values: ["redirect"] } },
    });
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
      { field: "route", display: "readOnly" },
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
      entity: "app-install",
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
        enabled: true,
        matchPath: "/apps/personal",
        kind: "mount",
        targetProfile: "app",
        appInstall: "personal",
        surface: "admin",
        createdAt: now,
        updatedAt: now,
      },
      {
        enabled: true,
        matchPath: "/apps/personal/schema",
        kind: "mount",
        targetProfile: "app",
        appInstall: "personal",
        surface: "schema",
        createdAt: now,
        updatedAt: now,
      },
      {
        enabled: true,
        matchPath: "/sites/personal",
        matchPrefix: "/sites/personal/",
        kind: "mount",
        targetProfile: "public-site",
        appInstall: "personal",
        surface: "public-site",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    expect(
      instanceControlPlaneDefaultRoutesForInstall({
        installId: "tasks",
        packageAppKey: "tasks",
        now,
      }).map((record) => record.values.surface),
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
