import { describe, expect, it } from "vite-plus/test";
import {
  INSTANCE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  formatInstanceControlPlaneBoundaryEntityName,
  instanceControlPlaneAppInstallRecord,
  instanceControlPlaneDefaultRoutesForInstall,
  instanceControlPlaneDeploymentConfigObservedFields,
  instanceControlPlaneEffectiveRouteAccess,
  instanceControlPlaneEntityNames,
  instanceControlPlaneImmutableFields,
  instanceControlPlaneSchema,
  isInstanceControlPlaneEntityName,
  isInstanceControlPlaneRouteSafePath,
  parseInstanceControlPlaneBoundaryEntityName,
} from "./instance-control-plane.ts";
import { parseAppSchema } from "@dpeek/formless-schema";
import { bundledSourceSchemaHashFixtures } from "./upgrade-migrations.ts";
import {
  isRuntimeControlPlaneImmutableField,
  isRuntimeControlPlaneObservedField,
  isRuntimeControlPlaneSecretReferenceField,
} from "@dpeek/formless-schema";

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
    expect(referenceTargets).toEqual(expect.arrayContaining(["app-install", "deployment-config"]));
    expect(Object.keys(schema.entities)).not.toEqual(
      expect.arrayContaining(["deploy-target", "provider-config-ref", "deploy-desired-resource"]),
    );
    expect(schema.relationships?.routeInstall).toEqual({
      kind: "toOne",
      label: "Route install",
      from: { entity: "route", field: "appInstall" },
      to: { entity: "app-install" },
    });
    expect(schema.entities["app-install"]?.fields.packageAppKey).toMatchObject({
      type: "enum",
      values: {
        cleartrace: { label: "ClearTrace" },
        crm: { label: "CRM" },
        estii: { label: "Estii" },
        site: { label: "Site" },
        tasks: { label: "Tasks" },
      },
    });
    expect(schema.screens?.apps.path).toBe("/");
    expect(schema.screens?.routes.path).toBe("/routes");
    expect(schema.screens?.deployments.path).toBe("/deployments");
    expect(schema.runtime?.owner).toBe("runtime");
    expect(schema.runtime?.builder.editable).toBe(false);
  });

  it("defines deployment config intent and observation cache fields", () => {
    const schema = parseAppSchema(instanceControlPlaneSchema);
    const deploymentFields = schema.entities["deployment-config"]?.fields;

    expect(deploymentFields).toMatchObject({
      targetId: { type: "text", required: true },
      targetKind: {
        type: "enum",
        required: true,
        values: { instance: { label: "Instance" } },
      },
      label: { type: "text", required: true },
      enabled: { type: "boolean", required: true, default: true },
      targetUrl: { type: "text", required: true, format: "href" },
      providerFamily: {
        type: "enum",
        required: true,
        values: { cloudflare: { label: "Cloudflare" } },
      },
      accountId: { type: "text", required: false },
      workerName: { type: "text", required: false },
      credentialRef: { type: "text", required: false },
      observedStatus: {
        type: "enum",
        required: false,
        values: {
          deployed: { label: "Deployed" },
          drifted: { label: "Drifted" },
          failed: { label: "Failed" },
          "in-sync": { label: "In sync" },
          unknown: { label: "Unknown" },
        },
      },
      observedAt: { type: "text", required: false },
      observedDesiredStateHash: { type: "text", required: false },
      observedSummary: { type: "text", required: false, format: "longText" },
      observedError: { type: "text", required: false, format: "longText" },
      observedRunnerId: { type: "text", required: false },
      createdAt: { type: "text", required: true },
      updatedAt: { type: "text", required: true },
    });
    expect(Object.keys(deploymentFields ?? {})).toEqual([
      "targetId",
      "targetKind",
      "label",
      "enabled",
      "targetUrl",
      "providerFamily",
      "accountId",
      "workerName",
      "credentialRef",
      ...instanceControlPlaneDeploymentConfigObservedFields,
      "createdAt",
      "updatedAt",
    ]);
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
      access: {
        type: "enum",
        required: false,
        values: {
          anonymous: { label: "Anonymous" },
          owner: { label: "Owner" },
        },
      },
      deploymentConfig: {
        type: "reference",
        required: false,
        to: "deployment-config",
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
      "access",
      "deploymentConfig",
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
    expect(instanceControlPlaneImmutableFields["deployment-config"]).toEqual([
      "targetId",
      "targetKind",
      "providerFamily",
    ]);
    expect(instanceControlPlaneImmutableFields.route).toEqual(["kind"]);
    expect(isInstanceControlPlaneEntityName("app-install")).toBe(true);
    expect(isInstanceControlPlaneEntityName("deployment-config")).toBe(true);
    expect(isInstanceControlPlaneEntityName("app-route")).toBe(false);
    expect(isInstanceControlPlaneEntityName("deploy-target")).toBe(false);
    expect(isInstanceControlPlaneEntityName("missing")).toBe(false);

    const schema = parseAppSchema(instanceControlPlaneSchema);
    expect(isRuntimeControlPlaneImmutableField(schema, "app-install", "installId")).toBe(true);
    expect(isRuntimeControlPlaneImmutableField(schema, "app-install", "label")).toBe(false);
    expect(
      isRuntimeControlPlaneSecretReferenceField(schema, "deployment-config", "credentialRef"),
    ).toBe(true);
    expect(
      instanceControlPlaneDeploymentConfigObservedFields.every((field) =>
        isRuntimeControlPlaneObservedField(schema, "deployment-config", field),
      ),
    ).toBe(true);
    expect(isRuntimeControlPlaneObservedField(schema, "deployment-config", "targetUrl")).toBe(
      false,
    );
    expect(schema.entities["deploy-attempt"]).toBeUndefined();
    expect(schema.entities["deploy-evidence-summary"]).toBeUndefined();
    expect(schema.entities["deploy-drift-report"]).toBeUndefined();
  });

  it("marks generated install and route editor fields by ownership", () => {
    const schema = parseAppSchema(instanceControlPlaneSchema);
    const routeTable = schema.tableViews.routeTable;
    const routesByDeploymentConfigList = schema.views.routesByDeploymentConfigList;
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
      routesByDeploymentConfigList?.type === "collection"
        ? {
            context: routesByDeploymentConfigList.context,
            defaultQuery: routesByDeploymentConfigList.defaultQuery,
          }
        : undefined,
    ).toMatchObject({
      context: {
        name: "deploymentConfig",
        entity: "deployment-config",
        relationship: "deploymentConfigRoutes",
      },
      defaultQuery: "routesForSelectedDeploymentConfig",
    });
    expect(routesScreen?.layout.sections.map((section) => section.view)).toEqual([
      "routeList",
      "routesByDeploymentConfigList",
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
      { field: "access", display: "readOnly" },
      { field: "deploymentConfig", display: "readOnly" },
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
      access: { visibleWhen: { field: "kind", values: ["mount"] } },
      toHost: { visibleWhen: { field: "kind", values: ["redirect"] } },
      statusCode: { visibleWhen: { field: "kind", values: ["redirect"] } },
    });
  });

  it("renders deployment intent as generated sections without execution history", () => {
    const schema = parseAppSchema(instanceControlPlaneSchema);
    const deployments = schema.screens?.deployments;

    expect(deployments?.layout.sections.map((section) => section.view)).toEqual([
      "deploymentConfigList",
    ]);
    expect(schema.views.deploymentConfigList?.type === "collection").toBe(true);
    expect(
      schema.views.deploymentConfigList?.type === "collection"
        ? schema.views.deploymentConfigList.actions
        : undefined,
    ).toEqual([{ type: "create", createView: "deploymentConfigCreate" }]);
    expect(schema.views.deployAttemptList).toBeUndefined();
    expect(schema.views.deployEvidenceSummaryList).toBeUndefined();
    expect(schema.views.deployDriftReportList).toBeUndefined();
    expect(schema.tableViews.deploymentConfigTable?.columns).toMatchObject([
      { field: "label", display: "readOnly" },
      { field: "targetId", display: "readOnly" },
      { field: "targetKind", display: "readOnly" },
      { field: "providerFamily", display: "readOnly" },
      { field: "accountId", display: "readOnly" },
      { field: "workerName", display: "readOnly" },
      { field: "targetUrl", display: "readOnly" },
      { field: "enabled", display: "readOnly" },
      { field: "observedStatus", display: "readOnly" },
      { field: "observedAt", display: "readOnly" },
      { field: "observedDesiredStateHash", display: "readOnly" },
      { field: "observedSummary", display: "readOnly" },
      { field: "observedError", display: "readOnly" },
      { field: "observedRunnerId", display: "readOnly" },
    ]);
    expect(schema.tableViews.deployDesiredResourceTable).toBeUndefined();
    expect(schema.tableViews.deployEvidenceSummaryTable).toBeUndefined();
    expect(schema.tableViews.deployDriftReportTable).toBeUndefined();
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
        access: "owner",
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
        access: "owner",
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
        access: "anonymous",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    expect(
      instanceControlPlaneDefaultRoutesForInstall({
        installId: "cleartrace",
        packageAppKey: "cleartrace",
        now,
      }).map((record) => record.values.surface),
    ).toEqual(["admin", "schema"]);
    expect(
      instanceControlPlaneDefaultRoutesForInstall({
        installId: "cleartrace",
        packageAppKey: "cleartrace",
        now,
      }).map((record) => record.values.access),
    ).toEqual(["owner", "owner"]);
    expect(
      instanceControlPlaneEffectiveRouteAccess({
        kind: "mount",
        targetProfile: "public-site",
        surface: "public-site",
      }),
    ).toBe("anonymous");
    expect(
      instanceControlPlaneEffectiveRouteAccess({
        kind: "mount",
        targetProfile: "public-site",
        surface: "public-site",
        access: "owner",
      }),
    ).toBe("owner");
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
