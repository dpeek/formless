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
  instanceControlPlaneRecordsForAppInstall,
  instanceControlPlaneSchema,
  isInstanceControlPlaneEntityName,
  isInstanceControlPlaneRouteSafePath,
  parseInstanceControlPlaneBoundaryEntityName,
  parseInstanceControlPlaneStorageSnapshot,
  reviewableInstanceControlPlaneStorageSnapshot,
} from "./index.ts";
import {
  appPackageManifestKind,
  appPackageManifestVersion,
  createAppInstall,
  createAppPackageResolver,
  type CreateAppInstallResult,
} from "@dpeek/formless-installed-apps";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import { parseAppSchema } from "@dpeek/formless-schema";
import {
  isRuntimeControlPlaneImmutableField,
  isRuntimeControlPlaneObservedField,
  isRuntimeControlPlaneSecretReferenceField,
} from "@dpeek/formless-schema";

const siteSourceSchemaHash =
  "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const verifiSourceSchemaHash =
  "sha256:2222222222222222222222222222222222222222222222222222222222222222";
const privateSourceSchemaHash =
  "sha256:3333333333333333333333333333333333333333333333333333333333333333";
const controlPlanePackageManifests = [
  packageManifest({
    label: "Site",
    packageAppKey: "site",
    publicSite: true,
    sourceSchemaHash: siteSourceSchemaHash,
  }),
  packageManifest({
    label: "Verifi Labs",
    packageAppKey: "verifi",
    sourceSchemaHash: verifiSourceSchemaHash,
  }),
];
const controlPlanePackageResolver = createAppPackageResolver(controlPlanePackageManifests);

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
      type: "text",
      required: true,
    });
    expect(schema.screens?.apps.path).toBe("/");
    expect(schema.screens?.routes.path).toBe("/routes");
    expect(schema.screens?.deployments.path).toBe("/deployments");
    expect(schema.runtime?.owner).toBe("runtime");
    expect(schema.runtime).not.toHaveProperty("builder");
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
    const routesScreen = schema.screens?.routes;
    const routeCreateFields =
      schema.views.routeCreate?.type === "create"
        ? Object.keys(schema.views.routeCreate.fields)
        : [];
    const routeEditFields =
      schema.views.routeEdit?.type === "edit" ? Object.keys(schema.views.routeEdit.fields) : [];

    expect(schema.views.appInstallList?.type === "collection").toBe(true);
    expect(
      schema.views.appInstallList?.type === "collection"
        ? schema.views.appInstallList.operations
        : undefined,
    ).toBeUndefined();
    expect(schema.views.routeList?.type === "collection").toBe(true);
    expect(
      schema.views.routeList?.type === "collection" ? schema.views.routeList.operations : undefined,
    ).toEqual([{ operation: "route.create", createView: "routeCreate" }]);
    expect(
      schema.views.routeList?.type === "collection"
        ? schema.views.routeList.queries.map((slot) => slot.query)
        : undefined,
    ).toEqual(["routeAll"]);
    expect(schema.views.routesByDeploymentConfigList).toBeUndefined();
    expect(routesScreen?.layout.sections.map((section) => section.view)).toEqual(["routeList"]);
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
      { field: "toHost", display: "readOnly" },
      { field: "toUrl", display: "readOnly" },
      { field: "statusCode", display: "readOnly" },
      { type: "invokeAction", actions: ["editRoute"] },
    ]);
    expect(routeCreateFields).not.toContain("deploymentConfig");
    expect(routeEditFields).not.toContain("deploymentConfig");
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
        ? schema.views.deploymentConfigList.operations
        : undefined,
    ).toEqual([{ operation: "deployment-config.create", createView: "deploymentConfigCreate" }]);
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
        sourceSchemaHash: siteSourceSchemaHash,
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
        sourceSchemaHash: siteSourceSchemaHash,
        label: "Personal Site",
        status: "installed",
        storageIdentity: "app:personal",
      },
    });

    expect(
      instanceControlPlaneDefaultRoutesForInstall({
        installId: "personal",
        packageAppKey: "site",
        packageResolver: controlPlanePackageResolver,
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
      },
    ]);

    expect(
      instanceControlPlaneDefaultRoutesForInstall({
        installId: "verifi",
        packageAppKey: "verifi",
        packageResolver: controlPlanePackageResolver,
        now,
      }).map((record) => record.values.surface),
    ).toEqual(["admin"]);
    expect(
      instanceControlPlaneDefaultRoutesForInstall({
        installId: "verifi",
        packageAppKey: "verifi",
        packageResolver: controlPlanePackageResolver,
        now,
      }).map((record) => record.values.access),
    ).toEqual(["owner"]);
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

  it("derives private package route records from resolved capabilities", () => {
    const now = "2026-05-28T00:00:00.000Z";
    const resolver = createAppPackageResolver([
      ...controlPlanePackageManifests,
      privatePackageManifest(),
    ]);
    const result = expectCreateAppInstallSuccess(
      createAppInstall({
        existingInstalls: [],
        installId: "labs",
        label: "Private Labs",
        now,
        packageAppKey: "private-labs",
        packageResolver: resolver,
      }),
    );
    const records = instanceControlPlaneRecordsForAppInstall({
      install: result.install,
      now,
    });

    expect(records.map((record) => record.id)).toEqual([
      "labs",
      "route:labs:admin",
      "route:labs:public-site",
    ]);
    expect(records.map((record) => record.entity)).toEqual(["app-install", "route", "route"]);
    expect(records.map((record) => record.values).slice(1)).toEqual(
      instanceControlPlaneDefaultRoutesForInstall({
        installId: "labs",
        packageAppKey: "private-labs",
        packageResolver: resolver,
        now,
      }).map((record) => record.values),
    );
    expect(JSON.stringify(records[0].values)).not.toContain("packages/private-labs");
    expect(JSON.stringify(records[0].values)).not.toContain("workspace");
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

  it("validates reviewable control-plane storage snapshots", () => {
    const snapshot = controlPlaneSnapshot();

    expect(
      parseInstanceControlPlaneStorageSnapshot("Instance archive controlPlane", snapshot),
    ).toEqual(snapshot);
    expect(
      reviewableInstanceControlPlaneStorageSnapshot({
        ...snapshot,
        records: controlPlaneRecords({ observedCache: true }),
      }).records.find((record) => record.entity === "deployment-config")?.values,
    ).not.toHaveProperty("observedStatus");

    expect(() =>
      parseInstanceControlPlaneStorageSnapshot("Instance archive controlPlane", {
        ...snapshot,
        records: controlPlaneRecords({ observedCache: true }),
      }),
    ).toThrow("cannot store runtime-observed deployment cache fields");
    expect(() =>
      parseInstanceControlPlaneStorageSnapshot("Instance archive controlPlane", {
        ...snapshot,
        records: controlPlaneRecords({ accountId: "CF_API_TOKEN" }),
      }),
    ).toThrow("cannot store control-plane secret values");
  });
});

function expectCreateAppInstallSuccess(
  result: CreateAppInstallResult,
): Extract<CreateAppInstallResult, { ok: true }> {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result;
}

function privatePackageManifest(): Record<string, unknown> {
  return packageManifest({
    label: "Private Labs",
    packageAppKey: "private-labs",
    packageRevision: 7,
    publicSite: true,
    sourceSchemaHash: privateSourceSchemaHash,
    sourceSchemaKind: "workspace",
    sourceSchemaPath: "packages/private-labs/schema.json",
    seedRecordsPath: "packages/private-labs/seed-records.json",
  });
}

function packageManifest(input: {
  label: string;
  packageAppKey: string;
  packageRevision?: number;
  publicSite?: boolean;
  sourceSchemaHash: string;
  sourceSchemaKind?: "bundled" | "workspace";
  sourceSchemaPath?: string;
  seedRecordsPath?: string;
}): Record<string, unknown> {
  return {
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey: input.packageAppKey,
    label: input.label,
    description: `${input.label} package fixture.`,
    defaultInstallId: input.packageAppKey === "private-labs" ? "labs" : input.packageAppKey,
    supportsMultipleInstalls: false,
    packageRevision: input.packageRevision ?? 1,
    sourceSchema: {
      kind: input.sourceSchemaKind ?? "bundled",
      key: input.packageAppKey,
      path: input.sourceSchemaPath ?? "schema.json",
    },
    seedRecords: {
      kind: input.sourceSchemaKind ?? "bundled",
      key: input.packageAppKey,
      path: input.seedRecordsPath ?? "seed-records.json",
    },
    sourceSchemaHash: input.sourceSchemaHash,
    capabilities: [
      {
        kind: "generatedAdmin",
        routeBase: "/apps",
      },
      ...(input.publicSite
        ? [
            {
              kind: "publicSite",
              routeBase: "/sites",
            },
          ]
        : []),
    ],
  };
}

function controlPlaneSnapshot(overrides: Partial<StorageSnapshot> = {}): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
    schemaKey: "instance-control-plane",
    exportedAt: "2026-05-28T00:00:00.000Z",
    schemaUpdatedAt: "2026-05-28T00:00:00.000Z",
    sourceCursor: controlPlaneRecords().length,
    schema: instanceControlPlaneSchema,
    records: controlPlaneRecords(),
    ...overrides,
  };
}

function controlPlaneRecords(
  options: { accountId?: string; observedCache?: boolean } = {},
): StoredRecord[] {
  const now = "2026-05-28T00:00:00.000Z";

  return [
    {
      id: "site",
      entity: "app-install",
      values: {
        installId: "site",
        packageAppKey: "site",
        label: "Site",
        status: "installed",
        storageIdentity: "app:site",
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "route:site:public-site",
      entity: "route",
      values: {
        enabled: true,
        matchPath: "/sites/site",
        matchPrefix: "/sites/site/",
        kind: "mount",
        targetProfile: "public-site",
        appInstall: "site",
        surface: "public-site",
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "instance.primary",
      entity: "deployment-config",
      values: {
        targetId: "instance.primary",
        targetKind: "instance",
        label: "instance.primary",
        enabled: true,
        targetUrl: "https://personal.dpeek.workers.dev",
        providerFamily: "cloudflare",
        ...(options.accountId === undefined ? {} : { accountId: options.accountId }),
        ...(options.observedCache
          ? {
              observedAt: now,
              observedDesiredStateHash:
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              observedError: "none",
              observedRunnerId: "local-gateway",
              observedStatus: "deployed",
              observedSummary: "Deployed revision 2",
            }
          : {}),
      },
      createdAt: now,
      updatedAt: now,
    },
  ];
}
