import {
  findResolvedAppPackage,
  isSourceSchemaHash,
  listAppInstalls,
  type AppInstall,
  type AppInstallId,
  type AppInstallRouteAccess,
  type AppInstallRoute,
  type AppInstallRouteKind,
  type AppPackageResolver,
  type PackageAppKey,
  type PackageAppRevision,
  type SourceSchemaHash,
} from "@dpeek/formless-installed-apps";
import {
  CONTROL_PLANE_DEPLOYMENT_CONFIG_OBSERVED_FIELDS,
  type ControlPlaneDeploymentConfigObservedStatus,
} from "@dpeek/formless-deploy";
import {
  formatQualifiedEntityName,
  isRuntimeControlPlaneObservedField,
  isRuntimeControlPlaneSecretReferenceField,
  isValidStoredFieldValue,
  parseQualifiedEntityName,
} from "@dpeek/formless-schema";
import type {
  AppSchema,
  EntityMutationPolicy,
  FieldEditor,
  FieldSchema,
} from "@dpeek/formless-schema";
import {
  parseStorageSnapshot,
  type RecordValues,
  type StorageSnapshot,
  type StoredRecord,
} from "@dpeek/formless-storage";
export * from "./types.ts";

export const INSTANCE_CONTROL_PLANE_SCHEMA_KEY = "instance-control-plane";
export const INSTANCE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY = "instance";
export const INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY = "instance:control-plane";
export const INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX = "/api/formless/control-plane";
export const INSTANCE_CONTROL_PLANE_SOURCE_SCHEMA_HASH =
  "sha256:c7591a4db25fa821ef2f46620318414cea01bfb3627cff7c4b0230b4bde6dd0a" satisfies SourceSchemaHash;
export const instanceControlPlaneSchemaProvenance = {
  kind: "instance-control-plane",
  sourceSchemaHash: INSTANCE_CONTROL_PLANE_SOURCE_SCHEMA_HASH,
} as const;

export const instanceControlPlaneEntityNames = [
  "app-install",
  "route",
  "deployment-config",
] as const;

export type InstanceControlPlaneEntityName = (typeof instanceControlPlaneEntityNames)[number];

export function isInstanceControlPlaneEntityName(
  value: string,
): value is InstanceControlPlaneEntityName {
  return instanceControlPlaneEntityNames.includes(value as InstanceControlPlaneEntityName);
}

export function formatInstanceControlPlaneBoundaryEntityName(
  entityName: InstanceControlPlaneEntityName,
): string {
  return formatQualifiedEntityName({
    schemaKey: INSTANCE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY,
    entityKey: entityName,
  });
}

export function parseInstanceControlPlaneBoundaryEntityName(
  context: string,
  value: string,
): InstanceControlPlaneEntityName {
  const qualifiedName = parseQualifiedEntityName(context, value);

  if (qualifiedName.schemaKey !== INSTANCE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY) {
    throw new Error(
      `${context} schema key must be "${INSTANCE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY}".`,
    );
  }

  if (!isInstanceControlPlaneEntityName(qualifiedName.entityKey)) {
    throw new Error(`${context} "${value}" is not an instance control-plane entity.`);
  }

  return qualifiedName.entityKey;
}

export type InstanceControlPlaneRecord<Entity extends InstanceControlPlaneEntityName, Values> = {
  createdAt: string;
  deletedAt?: string;
  entity: Entity;
  id: string;
  updatedAt: string;
  values: Values;
};

export type InstanceControlPlaneProjectionRecord = {
  createdAt: string;
  deletedAt?: string;
  entity: string;
  id: string;
  updatedAt: string;
  values: Readonly<Record<string, unknown>>;
};

export type InstanceControlPlaneAppInstallStatus = "disabled" | "failed" | "installed";

export type InstanceControlPlaneAppInstallValues = {
  installId: AppInstallId;
  packageAppKey: PackageAppKey;
  packageRevision?: PackageAppRevision;
  sourceSchemaHash?: SourceSchemaHash;
  label: string;
  status: InstanceControlPlaneAppInstallStatus;
  storageIdentity: `app:${AppInstallId}`;
};

export type InstanceControlPlaneAppRouteKind = "admin" | "publicSite";
export type InstanceControlPlaneAppRouteCapability = "generatedApp" | "publicSite";
export type InstanceControlPlaneAppRouteSurface = "admin" | "publicSite";
export type InstanceControlPlaneRouteKind = "mount" | "redirect";
export type InstanceControlPlaneRouteSurface = "admin" | "public-site";
export type InstanceControlPlaneRouteTargetProfile = "app" | "instance" | "public-site";
export type InstanceControlPlaneRouteAccess = AppInstallRouteAccess;

export type InstanceControlPlaneRouteValues = {
  enabled: boolean;
  matchHost?: string;
  matchPath: `/${string}`;
  matchPrefix?: `/${string}`;
  kind: InstanceControlPlaneRouteKind;
  targetProfile?: InstanceControlPlaneRouteTargetProfile;
  appInstall?: AppInstallId;
  surface?: InstanceControlPlaneRouteSurface;
  access?: InstanceControlPlaneRouteAccess;
  deploymentConfig?: string;
  toHost?: string;
  toUrl?: string;
  statusCode?: InstanceControlPlaneRedirectStatusCode;
  preservePath?: boolean;
  preserveQueryString?: boolean;
};

export type InstanceControlPlaneProviderFamily = "cloudflare";

export type InstanceControlPlaneDeploymentConfigTargetKind = "instance";
export type InstanceControlPlaneDeploymentConfigObservedStatus =
  ControlPlaneDeploymentConfigObservedStatus;

export const instanceControlPlaneDeploymentConfigObservedFields =
  CONTROL_PLANE_DEPLOYMENT_CONFIG_OBSERVED_FIELDS;

export type InstanceControlPlaneDeploymentConfigValues = {
  targetId: string;
  targetKind: InstanceControlPlaneDeploymentConfigTargetKind;
  label: string;
  enabled: boolean;
  targetUrl: string;
  providerFamily: InstanceControlPlaneProviderFamily;
  accountId?: string;
  workerName?: string;
  credentialRef?: string;
  observedStatus?: InstanceControlPlaneDeploymentConfigObservedStatus;
  observedAt?: string;
  observedDesiredStateHash?: string;
  observedSummary?: string;
  observedError?: string;
  observedRunnerId?: string;
};

export type InstanceControlPlaneRedirectStatusCode = "301" | "302" | "303" | "307" | "308";

export type InstanceControlPlaneRecordValuesByEntity = {
  "app-install": InstanceControlPlaneAppInstallValues;
  "deployment-config": InstanceControlPlaneDeploymentConfigValues;
  route: InstanceControlPlaneRouteValues;
};

type InstanceControlPlaneTableField =
  | string
  | {
      display?: "editor" | "hidden" | "readOnly";
      field: string;
    };

type InstanceControlPlaneViewField =
  | string
  | {
      field: string;
      visibleWhen?: { field: string; values: Array<string | boolean | number> };
    };
type InstanceControlPlaneQueryValue = string | boolean | number | { kind: "context"; name: string };
type InstanceControlPlaneCollectionContext = NonNullable<
  Extract<AppSchema["views"][string], { type: "collection" }>["context"]
>;

export type AnyInstanceControlPlaneRecord = {
  [Entity in InstanceControlPlaneEntityName]: InstanceControlPlaneRecord<
    Entity,
    InstanceControlPlaneRecordValuesByEntity[Entity]
  >;
}[InstanceControlPlaneEntityName];

export const instanceControlPlaneImmutableFields = {
  "app-install": ["installId", "packageAppKey", "storageIdentity"],
  "deployment-config": ["targetId", "targetKind", "providerFamily"],
  route: ["kind"],
} as const satisfies Record<InstanceControlPlaneEntityName, readonly string[]>;

export const instanceControlPlaneReservedRoutePaths = [
  "/api",
  "/assets",
  "/favicon.ico",
  "/favicon.svg",
  "/login",
  "/robots.txt",
  "/schema",
  "/setup",
  "/sitemap.xml",
  "/static",
] as const;

const editableMutations = {
  create: { enabled: true },
  patch: { enabled: true },
  delete: { enabled: false },
} satisfies EntityMutationPolicy;

export const instanceControlPlaneSchema = {
  version: 1,
  entities: {
    "app-install": {
      label: "App install",
      fields: {
        installId: textField("Install id"),
        packageAppKey: textField("Package"),
        packageRevision: optionalNumberField("Package revision"),
        sourceSchemaHash: optionalTextField("Source schema hash"),
        label: textField("Label"),
        status: enumField("Status", {
          disabled: "Disabled",
          failed: "Failed",
          installed: "Installed",
        }),
        storageIdentity: textField("Storage identity"),
      },
      mutations: editableMutations,
      operations: writeOperations("App install", [
        "installId",
        "packageAppKey",
        "packageRevision",
        "sourceSchemaHash",
        "label",
        "status",
        "storageIdentity",
      ]),
      constraints: {
        uniqueInstallId: { kind: "unique", fields: ["installId"] },
        uniqueStorageIdentity: { kind: "unique", fields: ["storageIdentity"] },
      },
    },
    route: {
      label: "Route",
      fields: {
        enabled: booleanField("Enabled", true),
        matchHost: optionalTextField("Match host"),
        matchPath: textField("Match path"),
        matchPrefix: optionalTextField("Match prefix"),
        kind: enumField("Kind", {
          mount: "Mount",
          redirect: "Redirect",
        }),
        targetProfile: optionalEnumField("Target profile", {
          app: "App",
          instance: "Instance",
          "public-site": "Public Site",
        }),
        appInstall: optionalReferenceField("App install", "app-install", "label"),
        surface: optionalEnumField("Surface", {
          admin: "Admin",
          "public-site": "Public Site",
        }),
        access: optionalEnumField("Access", {
          anonymous: "Anonymous",
          owner: "Owner",
        }),
        deploymentConfig: optionalReferenceField("Deployment config", "deployment-config", "label"),
        toHost: optionalTextField("To host"),
        toUrl: optionalTextField("To URL", "href"),
        statusCode: optionalEnumField("Status code", {
          "301": "301",
          "302": "302",
          "303": "303",
          "307": "307",
          "308": "308",
        }),
        preservePath: optionalBooleanField("Preserve path", true),
        preserveQueryString: optionalBooleanField("Preserve query string", true),
      },
      mutations: editableMutations,
      operations: writeOperations("Route", [
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
      ]),
    },
    "deployment-config": {
      label: "Deployment config",
      fields: {
        targetId: textField("Target id"),
        targetKind: enumField("Kind", { instance: "Instance" }),
        label: textField("Label"),
        enabled: booleanField("Enabled", true),
        targetUrl: textField("Target URL", "href"),
        providerFamily: enumField("Provider", { cloudflare: "Cloudflare" }),
        accountId: optionalTextField("Account id"),
        workerName: optionalTextField("Worker name"),
        credentialRef: optionalTextField("Credential ref"),
        observedStatus: optionalEnumField("Observed status", {
          deployed: "Deployed",
          drifted: "Drifted",
          failed: "Failed",
          "in-sync": "In sync",
          unknown: "Unknown",
        }),
        observedAt: optionalTextField("Observed at"),
        observedDesiredStateHash: optionalTextField("Observed desired-state hash"),
        observedSummary: optionalTextField("Observed summary", "longText"),
        observedError: optionalTextField("Observed error", "longText"),
        observedRunnerId: optionalTextField("Observed runner"),
      },
      mutations: editableMutations,
      operations: writeOperations(
        "Deployment config",
        [
          "targetId",
          "targetKind",
          "label",
          "enabled",
          "targetUrl",
          "providerFamily",
          "accountId",
          "workerName",
          "credentialRef",
        ],
        {
          updateFields: [
            "targetId",
            "targetKind",
            "label",
            "enabled",
            "targetUrl",
            "providerFamily",
            "accountId",
            "workerName",
            "credentialRef",
            "observedStatus",
            "observedAt",
            "observedDesiredStateHash",
            "observedSummary",
            "observedError",
            "observedRunnerId",
          ],
        },
      ),
      constraints: {
        uniqueTargetId: { kind: "unique", fields: ["targetId"] },
      },
    },
  },
  relationships: {
    routeInstall: toOne("Route install", "route", "appInstall", "app-install"),
    routeDeploymentConfig: toOne(
      "Route deployment config",
      "route",
      "deploymentConfig",
      "deployment-config",
      "deploymentConfigRoutes",
    ),
    deploymentConfigRoutes: toMany(
      "Deployment config routes",
      "deployment-config",
      "route",
      "deploymentConfig",
      "routeDeploymentConfig",
    ),
  },
  queries: {
    appInstallAll: allQuery("App installs", "app-install"),
    routeAll: allQuery("Routes", "route"),
    routeEnabled: whereQuery("Enabled routes", "route", "enabled", true),
    routeMount: whereQuery("Mounts", "route", "kind", "mount"),
    routeHostMapping: andWhereQuery("Host mappings", "route", [
      { field: "kind", value: "mount" },
      { field: "matchPath", value: "/" },
    ]),
    routeRedirect: whereQuery("Redirects", "route", "kind", "redirect"),
    routeInstanceMount: whereQuery("Instance paths", "route", "targetProfile", "instance"),
    routeAppMount: whereQuery("App install routes", "route", "targetProfile", "app"),
    routePublicSiteMount: whereQuery("Public Site routes", "route", "targetProfile", "public-site"),
    routesForSelectedDeploymentConfig: whereQuery(
      "Selected deployment config",
      "route",
      "deploymentConfig",
      { kind: "context", name: "deploymentConfig" },
    ),
    deploymentConfigAll: allQuery("Deployment configs", "deployment-config"),
    deploymentConfigEnabled: whereQuery(
      "Enabled deployment configs",
      "deployment-config",
      "enabled",
      true,
    ),
  },
  itemViews: {
    appInstallItem: itemView("app-install", ["label", "installId", "packageAppKey", "status"]),
    routeItem: itemView("route", ["matchHost", "matchPath", "kind", "enabled"]),
    deploymentConfigItem: itemView("deployment-config", [
      "label",
      "targetId",
      "providerFamily",
      "enabled",
      "observedStatus",
      "observedAt",
    ]),
  },
  tableViews: {
    appInstallTable: tableView("app-install", [
      { field: "label", display: "editor" },
      { field: "installId", display: "readOnly" },
      { field: "packageAppKey", display: "readOnly" },
      { field: "status", display: "readOnly" },
      { field: "storageIdentity", display: "readOnly" },
      { field: "packageRevision", display: "readOnly" },
      { field: "sourceSchemaHash", display: "readOnly" },
    ]),
    routeTable: tableView(
      "route",
      [
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
      ],
      {
        actions: {
          editRoute: {
            type: "editRecord",
            label: "Edit route",
            target: { kind: "row" },
            editView: "routeEdit",
          },
        },
        actionLabel: "Route actions",
      },
    ),
    deploymentConfigTable: tableView("deployment-config", [
      "label",
      "targetId",
      "targetKind",
      "providerFamily",
      "accountId",
      "workerName",
      "targetUrl",
      "enabled",
      "observedStatus",
      "observedAt",
      "observedDesiredStateHash",
      "observedSummary",
      "observedError",
      "observedRunnerId",
    ]),
  },
  views: {
    appInstallCreate: createView("app-install", [
      "installId",
      "packageAppKey",
      "packageRevision",
      "sourceSchemaHash",
      "label",
      "status",
      "storageIdentity",
    ]),
    appInstallList: collectionView(
      "App installs",
      "app-install",
      "appInstallAll",
      "appInstallTable",
      {
        navigation: true,
      },
    ),
    routeCreate: createView("route", [
      "enabled",
      "matchHost",
      "matchPath",
      "matchPrefix",
      "kind",
      { field: "targetProfile", visibleWhen: { field: "kind", values: ["mount"] } },
      {
        field: "appInstall",
        visibleWhen: { field: "targetProfile", values: ["app", "public-site"] },
      },
      {
        field: "surface",
        visibleWhen: { field: "targetProfile", values: ["app", "public-site"] },
      },
      { field: "access", visibleWhen: { field: "kind", values: ["mount"] } },
      { field: "toHost", visibleWhen: { field: "kind", values: ["redirect"] } },
      { field: "toUrl", visibleWhen: { field: "kind", values: ["redirect"] } },
      { field: "statusCode", visibleWhen: { field: "kind", values: ["redirect"] } },
      { field: "preservePath", visibleWhen: { field: "kind", values: ["redirect"] } },
      { field: "preserveQueryString", visibleWhen: { field: "kind", values: ["redirect"] } },
    ]),
    routeEdit: editView("route", [
      "enabled",
      "matchHost",
      "matchPath",
      "matchPrefix",
      { field: "targetProfile", visibleWhen: { field: "kind", values: ["mount"] } },
      {
        field: "appInstall",
        visibleWhen: { field: "targetProfile", values: ["app", "public-site"] },
      },
      {
        field: "surface",
        visibleWhen: { field: "targetProfile", values: ["app", "public-site"] },
      },
      { field: "access", visibleWhen: { field: "kind", values: ["mount"] } },
      { field: "toHost", visibleWhen: { field: "kind", values: ["redirect"] } },
      { field: "toUrl", visibleWhen: { field: "kind", values: ["redirect"] } },
      { field: "statusCode", visibleWhen: { field: "kind", values: ["redirect"] } },
      { field: "preservePath", visibleWhen: { field: "kind", values: ["redirect"] } },
      { field: "preserveQueryString", visibleWhen: { field: "kind", values: ["redirect"] } },
    ]),
    routeList: collectionView("Routes", "route", "routeAll", "routeTable", {
      createView: "routeCreate",
      navigation: true,
    }),
    deploymentConfigCreate: createView("deployment-config", [
      "targetId",
      "targetKind",
      "label",
      "enabled",
      "targetUrl",
      "providerFamily",
      "accountId",
      "workerName",
      "credentialRef",
    ]),
    deploymentConfigList: collectionView(
      "Deployment configs",
      "deployment-config",
      "deploymentConfigAll",
      "deploymentConfigTable",
      {
        createView: "deploymentConfigCreate",
        extraQueries: ["deploymentConfigEnabled"],
      },
    ),
  },
  screens: {
    apps: {
      type: "workspace",
      label: "Apps",
      path: "/",
      navigation: { primary: true },
      layout: {
        type: "stack",
        sections: [{ id: "app-installs", type: "collection", view: "appInstallList" }],
      },
    },
    routes: {
      type: "workspace",
      label: "Routes",
      path: "/routes",
      navigation: { primary: true },
      layout: {
        type: "stack",
        sections: [{ id: "routes", type: "collection", view: "routeList" }],
      },
    },
    deployments: {
      type: "workspace",
      label: "Deployments",
      path: "/deployments",
      navigation: { primary: true },
      layout: {
        type: "stack",
        sections: [{ id: "deployment-configs", type: "collection", view: "deploymentConfigList" }],
      },
    },
  },
  runtime: {
    owner: "runtime",
    controlPlane: {
      entities: {
        "app-install": {
          immutableFields: [...instanceControlPlaneImmutableFields["app-install"]],
        },
        route: {
          immutableFields: [...instanceControlPlaneImmutableFields.route],
        },
        "deployment-config": {
          immutableFields: [...instanceControlPlaneImmutableFields["deployment-config"]],
          observedFields: [...instanceControlPlaneDeploymentConfigObservedFields],
          secretReferenceFields: ["credentialRef"],
        },
      },
    },
  },
} satisfies AppSchema;

export function instanceControlPlaneStorageIdentityForInstall(
  installId: AppInstallId,
): `app:${AppInstallId}` {
  return `app:${installId}`;
}

export function instanceControlPlaneAppInstallRecord(
  install: AppInstall,
): InstanceControlPlaneRecord<"app-install", InstanceControlPlaneAppInstallValues> {
  return {
    createdAt: install.createdAt,
    entity: "app-install",
    id: install.installId,
    updatedAt: install.updatedAt,
    values: {
      installId: install.installId,
      packageAppKey: install.packageAppKey,
      packageRevision: install.packageRevision,
      sourceSchemaHash: install.sourceSchemaHash,
      label: install.label,
      status: install.status,
      storageIdentity: instanceControlPlaneStorageIdentityForInstall(install.installId),
    },
  };
}

export function instanceControlPlaneRecordsForAppInstall(input: {
  install: AppInstall;
  now: string;
}): [
  InstanceControlPlaneRecord<"app-install", InstanceControlPlaneAppInstallValues>,
  ...InstanceControlPlaneRecord<"route", InstanceControlPlaneRouteValues>[],
] {
  return [
    instanceControlPlaneAppInstallRecord(input.install),
    ...instanceControlPlaneRouteRecordsForAppInstall(input),
  ];
}

export function instanceControlPlaneAppInstallsFromRecords(
  records: readonly InstanceControlPlaneProjectionRecord[],
  packageResolver?: AppPackageResolver,
): AppInstall[] {
  const activeRecords = records.filter((record) => record.deletedAt === undefined);
  const routeRecords = activeRecords.filter((record) => record.entity === "route");

  return listAppInstalls(
    activeRecords
      .filter((record) => record.entity === "app-install" && record.values.status === "installed")
      .map((record) =>
        appInstallFromControlPlaneRecord(
          record,
          routeRecords
            .filter(
              (routeRecord) =>
                routeRecord.values.appInstall === record.id &&
                routeRecord.values.matchHost === undefined,
            )
            .map((routeRecord) => ({
              id: routeRecord.id,
              values: routeRecord.values as InstanceControlPlaneRouteValues,
            })),
          packageResolver,
        ),
      ),
  );
}

function appInstallFromControlPlaneRecord(
  record: InstanceControlPlaneProjectionRecord,
  routeRecords: { id: string; values: InstanceControlPlaneRouteValues }[],
  packageResolver?: AppPackageResolver,
): AppInstall {
  const values = record.values;
  const packageAppKey = stringControlPlaneValue(values.packageAppKey);
  const packageApp =
    packageAppKey && packageResolver
      ? findResolvedAppPackage(packageAppKey, packageResolver)
      : undefined;

  if (!packageApp) {
    throw new Error(`Stored app install "${String(values.installId)}" has unsupported package.`);
  }

  const installId = stringControlPlaneValue(values.installId) ?? "";
  const routes = appInstallRoutesFromControlPlaneRoutes(routeRecords);
  const hasRouteRecords = routes.length > 0;
  const adminRoute =
    enabledRoutePath(routes, "admin") ?? `${packageApp.adminRouteBase}/${installId}`;
  const publicRoute = enabledAppInstallRoute(routes, "publicSite");

  return {
    installId,
    packageAppKey: packageApp.packageAppKey,
    packageRevision: packageRevisionFromControlPlaneValue(
      values.packageRevision,
      packageApp.packageRevision,
    ),
    sourceSchemaHash: sourceSchemaHashFromControlPlaneValue(
      values.sourceSchemaHash,
      packageApp.sourceSchemaHash,
    ),
    label: stringControlPlaneValue(values.label) ?? "",
    status: "installed",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    adminRoute,
    ...(publicRoute
      ? {
          publicRoute: publicRoute.path,
          publicRoutePrefix:
            publicRoute.prefix ?? (`${publicRoute.path.replace(/\/+$/, "")}/` as `/${string}/`),
        }
      : packageApp.publicRouteBase === undefined || hasRouteRecords
        ? {}
        : {
            publicRoute: `${packageApp.publicRouteBase}/${installId}`,
            publicRoutePrefix: `${packageApp.publicRouteBase}/${installId}/`,
          }),
    ...(hasRouteRecords ? { routes } : {}),
  };
}

function appInstallRoutesFromControlPlaneRoutes(
  routeRecords: { id: string; values: InstanceControlPlaneRouteValues }[],
): AppInstallRoute[] {
  return routeRecords
    .flatMap((record) => {
      const route = appInstallRouteFromControlPlaneRoute(record.id, record.values);

      return route ? [route] : [];
    })
    .sort(compareAppInstallRoutes);
}

function appInstallRouteFromControlPlaneRoute(
  id: string,
  values: InstanceControlPlaneRouteValues,
): AppInstallRoute | undefined {
  if (values.kind !== "mount" || values.surface === undefined) {
    return undefined;
  }

  const routeKind = appInstallRouteKindFromRouteSurface(values.surface);

  if (routeKind === undefined) {
    return undefined;
  }

  return {
    access: instanceControlPlaneEffectiveRouteAccess(values),
    enabled: values.enabled,
    id,
    path: values.matchPath,
    ...(values.matchPrefix === undefined ? {} : { prefix: values.matchPrefix as `/${string}/` }),
    routeKind,
  };
}

function compareAppInstallRoutes(left: AppInstallRoute, right: AppInstallRoute) {
  const kindOrder =
    appInstallRouteKindOrder(left.routeKind) - appInstallRouteKindOrder(right.routeKind);

  return kindOrder === 0 ? left.path.localeCompare(right.path) : kindOrder;
}

function appInstallRouteKindOrder(kind: AppInstallRouteKind) {
  switch (kind) {
    case "admin":
      return 0;
    case "publicSite":
      return 1;
  }
}

function appInstallRouteKindFromRouteSurface(
  surface: InstanceControlPlaneRouteValues["surface"],
): AppInstallRouteKind | undefined {
  switch (surface) {
    case "admin":
      return "admin";
    case "public-site":
      return "publicSite";
    default:
      return undefined;
  }
}

function enabledRoutePath(
  routes: readonly AppInstallRoute[],
  routeKind: AppInstallRoute["routeKind"],
): `/${string}` | undefined {
  return enabledAppInstallRoute(routes, routeKind)?.path;
}

function enabledAppInstallRoute(
  routes: readonly AppInstallRoute[],
  routeKind: AppInstallRoute["routeKind"],
): AppInstallRoute | undefined {
  return routes.find((route) => route.enabled && route.routeKind === routeKind);
}

function packageRevisionFromControlPlaneValue(
  value: unknown,
  fallback: PackageAppRevision,
): PackageAppRevision {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function sourceSchemaHashFromControlPlaneValue(
  value: unknown,
  fallback: SourceSchemaHash,
): SourceSchemaHash {
  return isSourceSchemaHash(value) ? value : fallback;
}

function stringControlPlaneValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function instanceControlPlaneAppRouteId(
  installId: AppInstallId,
  routeKind: InstanceControlPlaneAppRouteKind,
): string {
  return `route:${installId}:${routeKind === "publicSite" ? "public-site" : routeKind}`;
}

export function instanceControlPlaneDefaultRoutesForInstall(input: {
  installId: AppInstallId;
  packageAppKey: PackageAppKey;
  packageResolver?: AppPackageResolver;
  now: string;
}): InstanceControlPlaneRecord<"route", InstanceControlPlaneRouteValues>[] {
  const packageApp = input.packageResolver
    ? findResolvedAppPackage(input.packageAppKey, input.packageResolver)
    : undefined;
  const adminRouteBase = packageApp?.adminRouteBase ?? "/apps";
  const publicRouteBase = packageApp?.publicRouteBase;
  const routeInput = { install: { installId: input.installId }, now: input.now };
  const adminRoute = mountRouteRecord(routeInput, {
    matchPath: `${adminRouteBase}/${input.installId}`,
    surface: "admin",
    targetProfile: "app",
  });

  if (publicRouteBase === undefined) {
    return [adminRoute];
  }

  return [
    adminRoute,
    mountRouteRecord(routeInput, {
      matchPath: `${publicRouteBase}/${input.installId}`,
      matchPrefix: `${publicRouteBase}/${input.installId}/`,
      surface: "public-site",
      targetProfile: "public-site",
    }),
  ];
}

export function instanceControlPlaneRouteRecordsForAppInstall(input: {
  install: Pick<
    AppInstall,
    "adminRoute" | "installId" | "packageAppKey" | "publicRoute" | "publicRoutePrefix"
  >;
  now: string;
}): InstanceControlPlaneRecord<"route", InstanceControlPlaneRouteValues>[] {
  const records = [
    mountRouteRecord(input, {
      matchPath: input.install.adminRoute,
      surface: "admin",
      targetProfile: "app",
    }),
  ];

  if (input.install.publicRoute !== undefined) {
    records.push(
      mountRouteRecord(input, {
        matchPath: input.install.publicRoute,
        matchPrefix:
          input.install.publicRoutePrefix ??
          (`${input.install.publicRoute.replace(/\/+$/, "")}/` as `/${string}/`),
        surface: "public-site",
        targetProfile: "public-site",
      }),
    );
  }

  return records;
}

export function isInstanceControlPlaneRouteSafePath(path: string): path is `/${string}` {
  if (!/^\/[a-z0-9._~-]+(?:\/[a-z0-9._~-]+)*$/.test(path)) {
    return false;
  }

  return !instanceControlPlaneReservedRoutePaths.some(
    (reservedPath) => path === reservedPath || path.startsWith(`${reservedPath}/`),
  );
}

function mountRouteRecord(
  input: { install: Pick<AppInstall, "installId">; now: string },
  route: {
    matchPath: `/${string}`;
    matchPrefix?: `/${string}`;
    surface: InstanceControlPlaneRouteSurface;
    targetProfile: InstanceControlPlaneRouteTargetProfile;
  },
): InstanceControlPlaneRecord<"route", InstanceControlPlaneRouteValues> {
  return {
    createdAt: input.now,
    entity: "route",
    id: instanceControlPlaneAppRouteId(
      input.install.installId,
      route.surface === "public-site" ? "publicSite" : route.surface,
    ),
    updatedAt: input.now,
    values: {
      enabled: true,
      matchPath: route.matchPath,
      ...(route.matchPrefix === undefined ? {} : { matchPrefix: route.matchPrefix }),
      kind: "mount",
      targetProfile: route.targetProfile,
      appInstall: input.install.installId,
      surface: route.surface,
      access: instanceControlPlaneDefaultRouteAccess({
        kind: "mount",
        surface: route.surface,
        targetProfile: route.targetProfile,
      }),
    },
  };
}

export function instanceControlPlaneDefaultRouteAccess(
  route: Pick<InstanceControlPlaneRouteValues, "kind"> &
    Partial<Pick<InstanceControlPlaneRouteValues, "surface" | "targetProfile">>,
): InstanceControlPlaneRouteAccess {
  return route.kind === "mount" &&
    (route.targetProfile === "public-site" || route.surface === "public-site")
    ? "anonymous"
    : "owner";
}

export function instanceControlPlaneEffectiveRouteAccess(
  route: Pick<InstanceControlPlaneRouteValues, "kind"> &
    Partial<Pick<InstanceControlPlaneRouteValues, "access" | "surface" | "targetProfile">>,
): InstanceControlPlaneRouteAccess {
  return route.access ?? instanceControlPlaneDefaultRouteAccess(route);
}

export const instanceControlPlaneRecordSourceExcludedEntityNames = [
  "deploy-desired-resource",
  "deploy-target",
  "deploy-attempt",
  "deploy-evidence-summary",
  "deploy-drift-report",
  "provider-config-ref",
] as const;

export type InstanceControlPlaneRecordSourceExcludedEntityName =
  (typeof instanceControlPlaneRecordSourceExcludedEntityNames)[number];

export type InstanceControlPlaneRecordValidationOptions = {
  context?: string;
  packageResolver?: AppPackageResolver;
  publicSitePackageFallback?: "allow" | "site";
  sourceLabel?: string;
};

export function parseInstanceControlPlaneStorageSnapshot(
  context: string,
  value: unknown,
  options: InstanceControlPlaneRecordValidationOptions = {},
): StorageSnapshot {
  const snapshot = parseStorageSnapshot(value, {
    schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
    storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  });

  validateInstanceControlPlaneRecords(`${context} records`, snapshot.records, options);

  return snapshot;
}

export function reviewableInstanceControlPlaneStorageSnapshot(
  snapshot: StorageSnapshot,
  options: InstanceControlPlaneRecordValidationOptions = {},
): StorageSnapshot {
  const parsed = parseStorageSnapshot(snapshot, {
    schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
    storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  });
  const records = reviewableInstanceControlPlaneRecords(parsed.records, options);

  return {
    ...parsed,
    records,
    sourceCursor: records.length,
  };
}

export function canonicalizeInstanceControlPlaneStorageSnapshot(
  snapshot: StorageSnapshot,
  options: InstanceControlPlaneRecordValidationOptions = {},
): StorageSnapshot {
  const reviewable = reviewableInstanceControlPlaneStorageSnapshot(snapshot, options);

  return {
    kind: reviewable.kind,
    version: reviewable.version,
    storageIdentity: reviewable.storageIdentity,
    schemaKey: reviewable.schemaKey,
    exportedAt: reviewable.exportedAt,
    schemaUpdatedAt: reviewable.schemaUpdatedAt,
    sourceCursor: reviewable.sourceCursor,
    schema: stableJsonValue(reviewable.schema) as AppSchema,
    records: reviewable.records.map(canonicalInstanceControlPlaneRecord).sort(compareRecords),
  };
}

export function parseInstanceControlPlaneRecords(context: string, value: unknown): StoredRecord[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  return value.map((record, index) =>
    parseInstanceControlPlaneRecord(`${context}[${index}]`, record),
  );
}

export function reviewableInstanceControlPlaneRecords(
  records: readonly StoredRecord[],
  options: InstanceControlPlaneRecordValidationOptions = {},
): StoredRecord[] {
  const context = options.context ?? "Instance control-plane record source records";
  const sourceLabel = options.sourceLabel ?? "Instance control-plane record source";
  const sourceRecords: StoredRecord[] = [];

  for (const record of records) {
    const entity = instanceControlPlaneRecordSourceEntityName(record.entity);

    if (entity !== undefined) {
      sourceRecords.push(
        canonicalInstanceControlPlaneRecord({
          ...record,
          entity,
          values: reviewableInstanceControlPlaneRecordValues(entity, record.values),
        }),
      );
      continue;
    }

    if (excludedInstanceControlPlaneRecordSourceEntityName(record.entity) !== undefined) {
      continue;
    }

    throw new Error(
      `${sourceLabel} does not support entity "${controlPlaneEntityLabel(record.entity)}".`,
    );
  }

  validateInstanceControlPlaneRecords(context, sourceRecords, options);

  return sourceRecords;
}

export function validateInstanceControlPlaneRecords(
  context: string,
  records: readonly StoredRecord[],
  options: InstanceControlPlaneRecordValidationOptions = {},
) {
  const recordsById = new Map<string, StoredRecord>();

  for (const record of records) {
    if (recordsById.has(record.id)) {
      throw new Error(`${context} includes duplicate control-plane record id "${record.id}".`);
    }

    recordsById.set(record.id, record);
  }

  for (const record of records) {
    validateInstanceControlPlaneRecord(context, record, recordsById, options);
  }

  validateInstanceControlPlaneUniqueConstraints(context, records);
  assertInstanceControlPlaneRoutesAreValid(context, records, options);
}

export function reviewableInstanceControlPlaneRecordValues(
  entity: InstanceControlPlaneEntityName,
  values: RecordValues,
): RecordValues {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([fieldName]) =>
        fieldName !== "createdAt" &&
        fieldName !== "updatedAt" &&
        !isRuntimeControlPlaneObservedField(instanceControlPlaneSchema, entity, fieldName),
    ),
  ) as RecordValues;
}

export function parseInstanceControlPlaneEntityName(
  context: string,
  value: unknown,
): InstanceControlPlaneEntityName {
  const entity = parseNonEmptyString(context, value);

  if (isInstanceControlPlaneEntityName(entity)) {
    return entity;
  }

  return parseInstanceControlPlaneBoundaryEntityName(context, entity);
}

export function instanceControlPlaneRecordSourceEntityName(
  value: string,
): InstanceControlPlaneEntityName | undefined {
  const localEntity = value.startsWith(`${INSTANCE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY}:`)
    ? tryParseBoundaryEntityName(value)
    : isInstanceControlPlaneEntityName(value)
      ? value
      : undefined;

  return localEntity !== undefined && isInstanceControlPlaneEntityName(localEntity)
    ? localEntity
    : undefined;
}

export function excludedInstanceControlPlaneRecordSourceEntityName(
  value: string,
): InstanceControlPlaneRecordSourceExcludedEntityName | undefined {
  const localEntity = value.startsWith(`${INSTANCE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY}:`)
    ? tryParseBoundaryEntityName(value)
    : value;

  return localEntity !== undefined &&
    instanceControlPlaneRecordSourceExcludedEntityNames.includes(
      localEntity as InstanceControlPlaneRecordSourceExcludedEntityName,
    )
    ? (localEntity as InstanceControlPlaneRecordSourceExcludedEntityName)
    : undefined;
}

export function normalizeInstanceControlPlaneTargetUrl(value: string): string {
  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("invalid protocol");
    }

    return url.origin;
  } catch {
    throw new Error(`Instance control-plane target URL is invalid: ${value}`);
  }
}

function parseInstanceControlPlaneRecord(context: string, value: unknown): StoredRecord {
  if (!isPlainRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(
    context,
    value,
    ["id", "entity", "values", "createdAt", "updatedAt"],
    ["deletedAt"],
  );

  const id = parseNonEmptyString(`${context} id`, value.id);
  const entity = parseInstanceControlPlaneEntityName(
    `${context} record "${id}" entity`,
    value.entity,
  );

  return {
    id,
    entity,
    values: parseRecordValues(`${context} values`, value.values),
    createdAt: parseIsoTimestamp(`${context} createdAt`, value.createdAt),
    updatedAt: parseIsoTimestamp(`${context} updatedAt`, value.updatedAt),
    ...(value.deletedAt === undefined
      ? {}
      : { deletedAt: parseIsoTimestamp(`${context} deletedAt`, value.deletedAt) }),
  };
}

function validateInstanceControlPlaneRecord(
  context: string,
  record: StoredRecord,
  recordsById: ReadonlyMap<string, StoredRecord>,
  options: InstanceControlPlaneRecordValidationOptions,
) {
  const entity = instanceControlPlaneRecordSourceEntityName(record.entity);

  if (entity === undefined) {
    throw new Error(
      `${context} record "${record.id}" references unknown entity "${controlPlaneEntityLabel(record.entity)}".`,
    );
  }

  const entitySchema = instanceControlPlaneSchema.entities[entity];
  const fields = entitySchema.fields as Record<string, FieldSchema>;

  for (const fieldName of Object.keys(record.values)) {
    if (isRuntimeControlPlaneObservedField(instanceControlPlaneSchema, entity, fieldName)) {
      throw new Error(
        `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" cannot store runtime-observed deployment cache fields.`,
      );
    }

    if (!fields[fieldName]) {
      throw new Error(
        `${context} record "${record.id}" includes unknown field "${controlPlaneFieldLabel(record, fieldName)}".`,
      );
    }
  }

  assertControlPlaneRecordValuesAreReviewable(context, record);

  for (const [fieldName, field] of Object.entries(fields)) {
    const value = record.values[fieldName];

    if (!isValidStoredFieldValue(value, field)) {
      throw new Error(
        `${context} record "${record.id}" has invalid field "${controlPlaneFieldLabel(record, fieldName)}".`,
      );
    }

    if (
      entity === "app-install" &&
      fieldName === "packageAppKey" &&
      typeof value === "string" &&
      !schemaLocalEntityKeyPattern.test(value)
    ) {
      throw new Error(
        `${context} record "${record.id}" has invalid field "${controlPlaneFieldLabel(record, fieldName)}".`,
      );
    }

    if (field.type === "reference" && value !== undefined) {
      validateInstanceControlPlaneReference(
        context,
        record,
        fieldName,
        field.to,
        value,
        recordsById,
      );
    }
  }

  if (entity === "app-install") {
    validateAppInstallImmutableIdentity(context, record);
  }

  if (entity === "deployment-config") {
    validateDeploymentConfigImmutableIdentity(context, record);
  }

  if (entity === "app-install" && options.packageResolver !== undefined) {
    const packageAppKey = requiredStringValue(context, record, "packageAppKey");

    if (!findResolvedAppPackage(packageAppKey, options.packageResolver)) {
      throw new Error(
        `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, "packageAppKey")}" references unsupported package "${packageAppKey}".`,
      );
    }
  }
}

function validateInstanceControlPlaneReference(
  context: string,
  record: StoredRecord,
  fieldName: string,
  entityName: string,
  value: RecordValues[string],
  recordsById: ReadonlyMap<string, StoredRecord>,
) {
  if (typeof value !== "string") {
    return;
  }

  const target = recordsById.get(value);

  if (!target) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" references unknown ${controlPlaneEntityLabel(entityName)} record "${value}".`,
    );
  }

  if (instanceControlPlaneRecordSourceEntityName(target.entity) !== entityName) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" must reference a ${controlPlaneEntityLabel(entityName)} record.`,
    );
  }

  if (target.deletedAt) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" cannot reference tombstoned record "${value}".`,
    );
  }
}

function validateInstanceControlPlaneUniqueConstraints(
  context: string,
  records: readonly StoredRecord[],
) {
  for (const [entityName, entity] of Object.entries(instanceControlPlaneSchema.entities)) {
    const activeRecords = records.filter(
      (record) =>
        instanceControlPlaneRecordSourceEntityName(record.entity) === entityName &&
        !record.deletedAt,
    );
    const constraints = ("constraints" in entity ? entity.constraints : {}) as Record<
      string,
      { fields: readonly string[]; kind: string }
    >;

    for (const [constraintName, constraint] of Object.entries(constraints)) {
      if (constraint.kind !== "unique") {
        continue;
      }

      const seen = new Set<string>();

      for (const record of activeRecords) {
        const key = JSON.stringify(
          constraint.fields.map((fieldName) => record.values[fieldName] ?? null),
        );

        if (seen.has(key)) {
          throw new Error(
            `${context} violates unique constraint "${controlPlaneEntityLabel(entityName)}.${constraintName}".`,
          );
        }

        seen.add(key);
      }
    }
  }
}

function validateAppInstallImmutableIdentity(context: string, record: StoredRecord) {
  const installId = requiredStringValue(context, record, "installId");
  const storageIdentity = requiredStringValue(context, record, "storageIdentity");

  if (record.id !== installId) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, "installId")}" must match record id.`,
    );
  }

  if (storageIdentity !== `app:${installId}`) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, "storageIdentity")}" must be "app:${installId}".`,
    );
  }
}

function validateDeploymentConfigImmutableIdentity(context: string, record: StoredRecord) {
  const targetId = requiredStringValue(context, record, "targetId");
  const targetUrl = requiredStringValue(context, record, "targetUrl");

  if (record.id !== targetId) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, "targetId")}" must match record id.`,
    );
  }

  if (targetUrl !== normalizeInstanceControlPlaneTargetUrl(targetUrl)) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, "targetUrl")}" must be a normalized HTTP origin.`,
    );
  }
}

function assertInstanceControlPlaneRoutesAreValid(
  context: string,
  records: readonly StoredRecord[],
  options: InstanceControlPlaneRecordValidationOptions,
) {
  const activeRecords = new Map(
    records.filter((record) => !record.deletedAt).map((record) => [record.id, record]),
  );
  const routes = records.filter(
    (record) =>
      instanceControlPlaneRecordSourceEntityName(record.entity) === "route" && !record.deletedAt,
  );

  for (const route of routes) {
    validateSourceRoute(context, route, activeRecords, routes, options);
  }
}

function validateSourceRoute(
  context: string,
  route: StoredRecord,
  activeRecords: ReadonlyMap<string, StoredRecord>,
  routes: readonly StoredRecord[],
  options: InstanceControlPlaneRecordValidationOptions,
) {
  const matchHost = optionalStringValue(context, route, "matchHost");
  const matchPath = requiredStringValue(context, route, "matchPath");
  const matchPrefix = optionalStringValue(context, route, "matchPrefix");
  const kind = requiredStringValue(context, route, "kind");
  const deploymentConfig = optionalStringValue(context, route, "deploymentConfig");

  if (matchHost !== undefined) {
    assertNormalizedExactHost(context, route, "matchHost", matchHost);
  }

  assertNormalizedAbsoluteMatchPath(context, route, "matchPath", matchPath);

  if (matchPrefix !== undefined) {
    assertNormalizedMatchPrefix(context, route, matchPath, matchPrefix);
  }

  if (deploymentConfig !== undefined && matchHost === undefined) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "deploymentConfig")}" can only be set on exact-host route records.`,
    );
  }

  if (kind === "mount") {
    validateSourceMountRoute(
      context,
      route,
      activeRecords,
      matchHost,
      matchPath,
      matchPrefix,
      options,
    );
  } else if (kind === "redirect") {
    validateSourceRedirectRoute(context, route, matchHost);
  } else {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "kind")}" must be "mount" or "redirect".`,
    );
  }

  if (route.values.enabled === true) {
    assertEnabledSourceRouteIsUnique(context, route, routes);
  }
}

function validateSourceMountRoute(
  context: string,
  route: StoredRecord,
  activeRecords: ReadonlyMap<string, StoredRecord>,
  matchHost: string | undefined,
  matchPath: string,
  matchPrefix: string | undefined,
  options: InstanceControlPlaneRecordValidationOptions,
) {
  const targetProfile = optionalStringValue(context, route, "targetProfile");
  const appInstall = optionalStringValue(context, route, "appInstall");
  const surface = optionalStringValue(context, route, "surface");

  for (const fieldName of ["toHost", "toUrl", "statusCode"] as const) {
    if (optionalStringValue(context, route, fieldName) !== undefined) {
      throw new Error(
        `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, fieldName)}" is incompatible with mount routes.`,
      );
    }
  }

  if (targetProfile === undefined) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "targetProfile")}" is required for mount routes.`,
    );
  }

  if (targetProfile === "instance") {
    if (appInstall !== undefined) {
      throw new Error(
        `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "appInstall")}" is incompatible with instance mount routes.`,
      );
    }

    if (surface !== undefined && surface !== "admin") {
      throw new Error(
        `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "surface")}" is incompatible with instance mount routes.`,
      );
    }

    return;
  }

  if (targetProfile !== "app" && targetProfile !== "public-site") {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "targetProfile")}" is invalid for mount routes.`,
    );
  }

  if (appInstall === undefined) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "appInstall")}" is required for ${targetProfile} mount routes.`,
    );
  }

  const install = activeRecords.get(appInstall);

  if (!install || instanceControlPlaneRecordSourceEntityName(install.entity) !== "app-install") {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "appInstall")}" references unknown instance:app-install record "${appInstall}".`,
    );
  }

  if (install.values.status !== "installed") {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "appInstall")}" references non-installed instance:app-install record "${appInstall}".`,
    );
  }

  if (targetProfile === "app") {
    if (surface !== "admin") {
      throw new Error(
        `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "surface")}" must be "admin" for app mount routes.`,
      );
    }

    return;
  }

  if (surface !== "public-site") {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "surface")}" must be "public-site" for public-site mount routes.`,
    );
  }

  if (!installSupportsPublicSiteRoute(install, options)) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "appInstall")}" references app-install record "${appInstall}" without public Site capability.`,
    );
  }

  if (matchHost !== undefined && (matchPath !== "/" || matchPrefix !== "/")) {
    throw new Error(
      `${context} route "${route.id}" host-mounted public Site routes must set field "${controlPlaneFieldLabel(route, "matchPath")}" to "/" and field "${controlPlaneFieldLabel(route, "matchPrefix")}" to "/".`,
    );
  }
}

function validateSourceRedirectRoute(
  context: string,
  route: StoredRecord,
  matchHost: string | undefined,
) {
  if (matchHost === undefined) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "matchHost")}" is required for redirect routes.`,
    );
  }

  for (const fieldName of ["targetProfile", "appInstall", "surface"] as const) {
    if (optionalStringValue(context, route, fieldName) !== undefined) {
      throw new Error(
        `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, fieldName)}" is incompatible with redirect routes.`,
      );
    }
  }

  const toHost = optionalStringValue(context, route, "toHost");
  const toUrl = optionalStringValue(context, route, "toUrl");

  if (
    (toHost === undefined && toUrl === undefined) ||
    (toHost !== undefined && toUrl !== undefined)
  ) {
    throw new Error(
      `${context} route "${route.id}" must set exactly one of field "${controlPlaneFieldLabel(route, "toHost")}" or field "${controlPlaneFieldLabel(route, "toUrl")}".`,
    );
  }

  if (toHost !== undefined) {
    assertNormalizedExactHost(context, route, "toHost", toHost);
  }

  if (toUrl !== undefined) {
    assertNormalizedHttpsUrl(context, route, "toUrl", toUrl);
  }

  if (optionalStringValue(context, route, "statusCode") === undefined) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "statusCode")}" is required for redirect routes.`,
    );
  }

  for (const fieldName of ["preservePath", "preserveQueryString"] as const) {
    if (typeof route.values[fieldName] !== "boolean") {
      throw new Error(
        `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, fieldName)}" is required for redirect routes.`,
      );
    }
  }
}

function installSupportsPublicSiteRoute(
  install: StoredRecord,
  options: InstanceControlPlaneRecordValidationOptions,
): boolean {
  const packageAppKey =
    typeof install.values.packageAppKey === "string" ? install.values.packageAppKey : "";

  if (options.packageResolver === undefined) {
    return options.publicSitePackageFallback === "site" ? packageAppKey === "site" : true;
  }

  return (
    findResolvedAppPackage(packageAppKey, options.packageResolver)?.publicRouteBase !== undefined
  );
}

function assertEnabledSourceRouteIsUnique(
  context: string,
  route: StoredRecord,
  routes: readonly StoredRecord[],
) {
  const candidate = sourceRouteMatch(context, route);

  for (const record of routes) {
    if (record.id === route.id || record.values.enabled !== true) {
      continue;
    }

    const existing = sourceRouteMatch(context, record);

    if (candidate.host !== existing.host || !sourceRoutesOverlap(candidate, existing)) {
      continue;
    }

    throw new Error(
      `${context} route "${route.id}" enabled route match "${formatSourceRouteMatch(candidate)}" conflicts with enabled route "${record.id}".`,
    );
  }
}

function sourceRouteMatch(
  context: string,
  route: StoredRecord,
): {
  host: string;
  path: string;
  prefix?: string;
} {
  const prefix = optionalStringValue(context, route, "matchPrefix");

  return {
    host: optionalStringValue(context, route, "matchHost") ?? "<hostless>",
    path: requiredStringValue(context, route, "matchPath"),
    ...(prefix === undefined ? {} : { prefix }),
  };
}

function sourceRoutesOverlap(
  left: { path: string; prefix?: string },
  right: { path: string; prefix?: string },
) {
  return (
    left.path === right.path ||
    (left.prefix !== undefined && routePathMatchesPrefix(right.path, left.prefix)) ||
    (right.prefix !== undefined && routePathMatchesPrefix(left.path, right.prefix)) ||
    (left.prefix !== undefined &&
      right.prefix !== undefined &&
      routePrefixesOverlap(left.prefix, right.prefix))
  );
}

function routePathMatchesPrefix(path: string, prefix: string) {
  return prefix === "/" || path.startsWith(prefix);
}

function routePrefixesOverlap(left: string, right: string) {
  return left === "/" || right === "/" || left.startsWith(right) || right.startsWith(left);
}

function formatSourceRouteMatch(match: { host: string; path: string; prefix?: string }) {
  return `${match.host}${match.path}${match.prefix === undefined ? "" : ` ${match.prefix}`}`;
}

function assertNormalizedExactHost(
  context: string,
  route: StoredRecord,
  fieldName: string,
  value: string,
) {
  const normalized = normalizeExactHost(value);

  if (normalized !== value) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, fieldName)}" must be a normalized exact host.`,
    );
  }
}

function assertNormalizedHttpsUrl(
  context: string,
  route: StoredRecord,
  fieldName: string,
  value: string,
) {
  try {
    const url = new URL(value);
    const normalizedHost = normalizeExactHost(url.hostname);
    const normalized = url.toString().replace(/\/$/, "");

    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.hash !== "" ||
      normalizedHost !== url.hostname ||
      normalized !== value
    ) {
      throw new Error("invalid URL");
    }
  } catch {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, fieldName)}" must be a normalized absolute HTTPS URL without credentials or fragment.`,
    );
  }
}

function assertNormalizedAbsoluteMatchPath(
  context: string,
  route: StoredRecord,
  fieldName: string,
  value: string,
) {
  if (!isNormalizedAbsoluteRoutePath(value)) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, fieldName)}" must be a normalized absolute path.`,
    );
  }
}

function assertNormalizedMatchPrefix(
  context: string,
  route: StoredRecord,
  matchPath: string,
  matchPrefix: string,
) {
  const normalizedPrefix =
    matchPrefix === "/" ? matchPrefix : matchPrefix.endsWith("/") ? matchPrefix.slice(0, -1) : "";

  if (matchPrefix !== "/" && !matchPrefix.endsWith("/")) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "matchPrefix")}" must be a normalized absolute path prefix.`,
    );
  }

  if (matchPrefix !== "/" && !isNormalizedAbsoluteRoutePath(normalizedPrefix)) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "matchPrefix")}" must be a normalized absolute path prefix.`,
    );
  }

  if (matchPath === "/") {
    if (matchPrefix !== "/") {
      throw new Error(
        `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "matchPrefix")}" must begin at or below field "${controlPlaneFieldLabel(route, "matchPath")}".`,
      );
    }

    return;
  }

  if (!matchPrefix.startsWith(`${matchPath}/`)) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "matchPrefix")}" must begin at or below field "${controlPlaneFieldLabel(route, "matchPath")}".`,
    );
  }
}

function isNormalizedAbsoluteRoutePath(value: string) {
  if (value === "/") {
    return true;
  }

  if (!/^\/[a-z0-9._~-]+(?:\/[a-z0-9._~-]+)*$/.test(value)) {
    return false;
  }

  const segments = value.slice(1).split("/");

  if (segments.some((segment) => segment === "." || segment === "..")) {
    return false;
  }

  return !instanceControlPlaneReservedRoutePaths.some(
    (reservedPath) => value === reservedPath || value.startsWith(`${reservedPath}/`),
  );
}

function assertControlPlaneRecordValuesAreReviewable(context: string, record: StoredRecord) {
  for (const [fieldName, value] of Object.entries(record.values)) {
    const entity = instanceControlPlaneRecordSourceEntityName(record.entity) ?? record.entity;
    const isSecretReference = isRuntimeControlPlaneSecretReferenceField(
      instanceControlPlaneSchema,
      entity,
      fieldName,
    );

    if (!isSecretReference && isForbiddenControlPlaneFieldName(fieldName)) {
      throw new Error(
        `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" cannot store control-plane secrets or provider truth.`,
      );
    }

    if (typeof value === "string") {
      assertControlPlaneStringValueIsReviewable(context, record, fieldName, value);
    }
  }
}

function assertControlPlaneStringValueIsReviewable(
  context: string,
  record: StoredRecord,
  fieldName: string,
  value: string,
) {
  if (containsForbiddenControlPlaneSecretValue(value)) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" cannot store control-plane secret values.`,
    );
  }

  const parsed = parseMaybeJson(value);

  if (parsed !== undefined) {
    assertControlPlaneJsonValueIsReviewable(context, record, fieldName, parsed);
  }
}

function assertControlPlaneJsonValueIsReviewable(
  context: string,
  record: StoredRecord,
  fieldName: string,
  value: unknown,
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertControlPlaneJsonValueIsReviewable(context, record, fieldName, item);
    }

    return;
  }

  if (typeof value === "string") {
    assertControlPlaneStringValueIsReviewable(context, record, fieldName, value);
    return;
  }

  if (!isPlainRecord(value)) {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (isForbiddenControlPlaneFieldName(key)) {
      throw new Error(
        `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" cannot store control-plane secrets or provider truth.`,
      );
    }

    assertControlPlaneJsonValueIsReviewable(context, record, fieldName, item);
  }
}

function parseMaybeJson(value: string): Record<string, unknown> | unknown[] | undefined {
  const trimmed = value.trim();

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (Array.isArray(parsed)) {
      return parsed;
    }

    return isPlainRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function tryParseBoundaryEntityName(value: string): string | undefined {
  try {
    return parseQualifiedEntityName("Instance control-plane record entity", value).entityKey;
  } catch {
    return undefined;
  }
}

function canonicalInstanceControlPlaneRecord(record: StoredRecord): StoredRecord {
  const entity = parseInstanceControlPlaneEntityName(
    `Instance control-plane record "${record.id}" entity`,
    record.entity,
  );

  return {
    id: record.id,
    entity,
    values: stableJsonValue(
      reviewableInstanceControlPlaneRecordValues(entity, record.values),
    ) as RecordValues,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.deletedAt === undefined ? {} : { deletedAt: record.deletedAt }),
  };
}

function requiredStringValue(context: string, record: StoredRecord, fieldName: string): string {
  const value = record.values[fieldName];

  if (typeof value !== "string") {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" must be a string.`,
    );
  }

  return value;
}

function optionalStringValue(
  context: string,
  record: StoredRecord,
  fieldName: string,
): string | undefined {
  const value = record.values[fieldName];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" must be a string.`,
    );
  }

  return value;
}

function controlPlaneEntityLabel(entityName: string): string {
  const sourceEntity = instanceControlPlaneRecordSourceEntityName(entityName);

  if (sourceEntity !== undefined) {
    return formatInstanceControlPlaneBoundaryEntityName(sourceEntity);
  }

  return entityName;
}

function controlPlaneFieldLabel(record: Pick<StoredRecord, "entity">, fieldName: string): string {
  return `${controlPlaneEntityLabel(record.entity)}.${fieldName}`;
}

function parseRecordValues(context: string, value: unknown): RecordValues {
  if (!isPlainRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const values: RecordValues = {};

  for (const [fieldName, fieldValue] of Object.entries(value)) {
    if (
      typeof fieldValue !== "string" &&
      typeof fieldValue !== "boolean" &&
      !isFiniteNumber(fieldValue)
    ) {
      throw new Error(`${context} field "${fieldName}" must be a scalar value.`);
    }

    values[fieldName] = fieldValue;
  }

  return values;
}

function parseIsoTimestamp(context: string, value: unknown): string {
  const timestamp = parseNonEmptyString(context, value);
  const date = new Date(timestamp);

  if (Number.isNaN(date.valueOf()) || date.toISOString() !== timestamp) {
    throw new Error(`${context} must be an ISO timestamp.`);
  }

  return timestamp;
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value;
}

function assertExactKeys(
  context: string,
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
) {
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }

  for (const key of requiredKeys) {
    if (!(key in value)) {
      throw new Error(`${context} must include "${key}".`);
    }
  }
}

function compareRecords(left: StoredRecord, right: StoredRecord): number {
  const entityOrder = left.entity.localeCompare(right.entity);

  return entityOrder === 0 ? left.id.localeCompare(right.id) : entityOrder;
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }

  if (!isPlainRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableJsonValue(child)]),
  );
}

function isForbiddenControlPlaneFieldName(fieldName: string) {
  const normalized = normalizeControlPlaneSecretText(fieldName);

  return (
    normalized.includes("api_token") ||
    normalized.includes("access_token") ||
    normalized.includes("auth_token") ||
    normalized.includes("password") ||
    normalized.includes("secret_value") ||
    normalized.includes("raw_lease_token") ||
    normalized.includes("lease_token") ||
    normalized.includes("alchemy_state_token") ||
    normalized.includes("provider_truth") ||
    normalized.includes("provider_state") ||
    normalized.includes("provider_resource_json") ||
    normalized.includes("provider_resources_json")
  );
}

function containsForbiddenControlPlaneSecretValue(value: string) {
  const normalized = normalizeControlPlaneSecretText(value);

  return (
    normalized.includes("cf_api_token") ||
    normalized.includes("cloudflare_api_token") ||
    normalized.includes("alchemy_password") ||
    normalized.includes("alchemy_state_token") ||
    normalized.includes("raw_lease_token") ||
    normalized.includes("lease_token") ||
    value.includes("-----BEGIN PRIVATE KEY-----")
  );
}

function normalizeControlPlaneSecretText(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function normalizeExactHost(value: string): string | undefined {
  const raw = value.trim().toLowerCase();

  if (raw === "" || raw.includes("://")) {
    return undefined;
  }

  try {
    const url = new URL(`https://${raw}`);
    const normalized = stripTrailingDots(url.hostname.toLowerCase());

    if (
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== "" ||
      !isValidDnsHostname(normalized)
    ) {
      return undefined;
    }

    return normalized;
  } catch {
    return undefined;
  }
}

function stripTrailingDots(value: string): string {
  return value.replaceAll(/\.+$/g, "");
}

function isValidDnsHostname(value: string): boolean {
  if (value === "" || value.length > 253 || value.includes("_")) {
    return false;
  }

  return value
    .split(".")
    .every((label) => label.length > 0 && label.length <= 63 && hostnameLabelPattern.test(label));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const schemaLocalEntityKeyPattern = /^[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$/;
const hostnameLabelPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function textField(label: string, format?: "href" | "longText"): FieldSchema {
  return { type: "text", required: true, label, ...(format === undefined ? {} : { format }) };
}

function optionalTextField(label: string, format?: "href" | "longText"): FieldSchema {
  return { type: "text", required: false, label, ...(format === undefined ? {} : { format }) };
}

function booleanField(label: string, defaultValue: boolean): FieldSchema {
  return { type: "boolean", required: true, label, default: defaultValue };
}

function optionalBooleanField(label: string, defaultValue: boolean): FieldSchema {
  return { type: "boolean", required: false, label, default: defaultValue };
}

function optionalNumberField(label: string): FieldSchema {
  return { type: "number", required: false, label, integer: true, min: 0 };
}

function enumField(
  label: string,
  values: Record<string, string>,
  defaultValue?: string,
): FieldSchema {
  const entries = Object.fromEntries(
    Object.entries(values).map(([value, valueLabel]) => [value, { label: valueLabel }]),
  );

  return {
    type: "enum",
    required: true,
    label,
    values: entries,
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
  };
}

function optionalEnumField(
  label: string,
  values: Record<string, string>,
  defaultValue?: string,
): FieldSchema {
  const field = enumField(label, values, defaultValue);

  return { ...field, required: false };
}

function optionalReferenceField(label: string, to: string, displayField: string): FieldSchema {
  return { type: "reference", required: false, label, to, displayField };
}

function toOne(
  label: string,
  fromEntity: string,
  fromField: string,
  toEntity: string,
  inverse?: string,
): NonNullable<AppSchema["relationships"]>[string] {
  return {
    kind: "toOne",
    label,
    from: { entity: fromEntity, field: fromField },
    to: { entity: toEntity },
    ...(inverse === undefined ? {} : { inverse }),
  };
}

function toMany(
  label: string,
  fromEntity: string,
  toEntity: string,
  toField: string,
  inverse?: string,
): NonNullable<AppSchema["relationships"]>[string] {
  return {
    kind: "toMany",
    label,
    from: { entity: fromEntity },
    to: { entity: toEntity, field: toField },
    ...(inverse === undefined ? {} : { inverse }),
  };
}

function allQuery(label: string, entity: InstanceControlPlaneEntityName) {
  return {
    label,
    entity,
    expression: { kind: "all" },
  } satisfies AppSchema["queries"][string];
}

function whereQuery(
  label: string,
  entity: InstanceControlPlaneEntityName,
  field: string,
  value: InstanceControlPlaneQueryValue,
) {
  return {
    label,
    entity,
    expression: {
      kind: "where",
      ref: { kind: "value", name: field },
      op: "eq",
      value,
    },
  } satisfies AppSchema["queries"][string];
}

function andWhereQuery(
  label: string,
  entity: InstanceControlPlaneEntityName,
  filters: Array<{ field: string; value: InstanceControlPlaneQueryValue }>,
) {
  return {
    label,
    entity,
    expression: {
      kind: "and",
      expressions: filters.map((filter) => ({
        kind: "where",
        ref: { kind: "value", name: filter.field },
        op: "eq",
        value: filter.value,
      })),
    },
  } satisfies AppSchema["queries"][string];
}

function itemView(entity: InstanceControlPlaneEntityName, fields: string[]) {
  return {
    entity,
    fields: Object.fromEntries(fields.map((field) => [field, viewField(editorForField(field))])),
  } satisfies AppSchema["itemViews"][string];
}

function tableView(
  entity: InstanceControlPlaneEntityName,
  fields: InstanceControlPlaneTableField[],
  options: {
    actionLabel?: string;
    actions?: NonNullable<AppSchema["tableViews"][string]["actions"]>;
  } = {},
) {
  return {
    entity,
    ...(options.actions === undefined ? {} : { actions: options.actions }),
    columns: [
      ...fields.map(tableFieldColumn),
      ...(options.actions === undefined
        ? []
        : [
            {
              type: "invokeAction",
              label: options.actionLabel ?? "Actions",
              actions: Object.keys(options.actions),
              align: "end",
              width: "xs",
              presentation: "dropdown",
            } satisfies AppSchema["tableViews"][string]["columns"][number],
          ]),
    ],
  } satisfies AppSchema["tableViews"][string];
}

function tableFieldColumn(fieldInput: InstanceControlPlaneTableField) {
  const field = typeof fieldInput === "string" ? fieldInput : fieldInput.field;
  const display = typeof fieldInput === "string" ? "readOnly" : (fieldInput.display ?? "readOnly");

  return {
    type: "field",
    field,
    display,
  } satisfies AppSchema["tableViews"][string]["columns"][number];
}

function createView(
  entity: InstanceControlPlaneEntityName,
  fields: InstanceControlPlaneViewField[],
) {
  return {
    type: "create",
    entity,
    fields: Object.fromEntries(fields.map(createFieldEntry)),
  } satisfies AppSchema["views"][string];
}

function editView(entity: InstanceControlPlaneEntityName, fields: InstanceControlPlaneViewField[]) {
  return {
    type: "edit",
    entity,
    fields: Object.fromEntries(fields.map(viewFieldEntry)),
  } satisfies AppSchema["views"][string];
}

function collectionView(
  label: string,
  entity: InstanceControlPlaneEntityName,
  defaultQuery: string,
  tableViewName: string,
  options: {
    context?: InstanceControlPlaneCollectionContext;
    createView?: string;
    extraQueries?: string[];
    navigation?: boolean;
  } = {},
) {
  return {
    type: "collection",
    label,
    entity,
    ...(options.navigation ? { navigation: { primary: true } } : {}),
    ...(options.context === undefined ? {} : { context: options.context }),
    queries: [defaultQuery, ...(options.extraQueries ?? [])].map((query) => ({
      query,
      count: { type: "count" },
    })),
    defaultQuery,
    result: {
      type: "table",
      tableView: tableViewName,
    },
    ...(options.createView === undefined
      ? {}
      : { operations: [{ operation: `${entity}.create`, createView: options.createView }] }),
  } satisfies AppSchema["views"][string];
}

function writeOperations(
  label: string,
  fields: string[],
  options: { updateFields?: string[] } = {},
) {
  const input = {
    fields: Object.fromEntries(fields.map((field) => [field, { field }])),
  };
  const updateInput = {
    fields: Object.fromEntries((options.updateFields ?? fields).map((field) => [field, { field }])),
  };

  return {
    create: {
      label: `Create ${label}`,
      kind: "create",
      scope: "collection",
      input,
      effect: { type: "createRecord" },
      output: { type: "create" },
      idempotency: { required: true },
      audit: { input: "summary" },
    },
    update: {
      label: `Update ${label}`,
      kind: "update",
      scope: "record",
      input: updateInput,
      effect: { type: "patchRecord" },
      output: { type: "update" },
      idempotency: { required: true },
      audit: { input: "summary" },
    },
  } satisfies NonNullable<AppSchema["entities"][string]["operations"]>;
}

function viewField(editor: FieldEditor) {
  return {
    editor,
    commit:
      editor === "boolean" || editor === "enum" || editor === "reference"
        ? "immediate"
        : "field-commit",
  } satisfies AppSchema["itemViews"][string]["fields"][string];
}

function createField(editor: FieldEditor) {
  return { editor } satisfies NonNullable<
    Extract<AppSchema["views"][string], { type: "create" }>["fields"]
  >[string];
}

function createFieldEntry(fieldInput: InstanceControlPlaneViewField) {
  const field = typeof fieldInput === "string" ? fieldInput : fieldInput.field;

  return [
    field,
    {
      ...createField(editorForField(field)),
      ...(typeof fieldInput === "string" || fieldInput.visibleWhen === undefined
        ? {}
        : { visibleWhen: fieldInput.visibleWhen }),
    },
  ] as const;
}

function viewFieldEntry(fieldInput: InstanceControlPlaneViewField) {
  const field = typeof fieldInput === "string" ? fieldInput : fieldInput.field;

  return [
    field,
    {
      ...viewField(editorForField(field)),
      ...(typeof fieldInput === "string" || fieldInput.visibleWhen === undefined
        ? {}
        : { visibleWhen: fieldInput.visibleWhen }),
    },
  ] as const;
}

function editorForField(field: string): FieldEditor {
  if (field === "enabled" || field === "preservePath" || field === "preserveQueryString") {
    return "boolean";
  }

  if (
    field === "revision" ||
    field === "packageRevision" ||
    field === "createCount" ||
    field === "updateCount" ||
    field === "deleteCount"
  ) {
    return "number";
  }

  if (
    field === "status" ||
    field === "routeKind" ||
    field === "surface" ||
    field === "access" ||
    field === "packageCapability" ||
    field === "targetKind" ||
    field === "targetProfile" ||
    field === "providerFamily" ||
    field === "observedStatus" ||
    field === "profile" ||
    field === "statusCode" ||
    field === "kind" ||
    field === "mode" ||
    field === "actorKind" ||
    field === "action"
  ) {
    return "enum";
  }

  if (
    field === "appInstall" ||
    field === "appRoute" ||
    field === "deploymentConfig" ||
    field === "route" ||
    field === "domainMapping" ||
    field === "redirectIntent" ||
    field === "deployAttempt"
  ) {
    return "reference";
  }

  if (
    field === "inputsJson" ||
    field === "dependenciesJson" ||
    field === "providerResourceIdsJson" ||
    field === "affectedLogicalIdsJson"
  ) {
    return "textarea";
  }

  if (field === "toUrl") {
    return "href";
  }

  return "text";
}
