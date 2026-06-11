import type { AppInstall, AppInstallId, PackageAppKey } from "./app-installs.ts";
import {
  CONTROL_PLANE_DEPLOYMENT_CONFIG_OBSERVED_FIELDS,
  type ControlPlaneDeploymentConfigObservedStatus,
} from "@dpeek/formless-deploy";
import { formatQualifiedEntityName, parseQualifiedEntityName } from "@dpeek/formless-schema";
import type {
  AppSchema,
  EntityMutationPolicy,
  FieldEditor,
  FieldSchema,
} from "@dpeek/formless-schema";
import type { RuntimeRouteAccess } from "./runtime-topology.ts";
import type { PackageAppRevision, SourceSchemaHash } from "./upgrade-migrations.ts";

export const INSTANCE_CONTROL_PLANE_SCHEMA_KEY = "instance-control-plane";
export const INSTANCE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY = "instance";
export const INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY = "instance:control-plane";
export const INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX = "/api/formless/control-plane";

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
  updatedAt?: string;
  values: Values;
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
  createdAt: string;
  updatedAt: string;
};

export type InstanceControlPlaneAppRouteKind = "admin" | "publicSite" | "schema";
export type InstanceControlPlaneAppRouteCapability = "generatedApp" | "publicSite" | "schema";
export type InstanceControlPlaneAppRouteSurface = "admin" | "publicSite" | "schema";
export type InstanceControlPlaneRouteKind = "mount" | "redirect";
export type InstanceControlPlaneRouteSurface = "admin" | "public-site" | "schema";
export type InstanceControlPlaneRouteTargetProfile = "app" | "instance" | "public-site";
export type InstanceControlPlaneRouteAccess = RuntimeRouteAccess;

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
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
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
        packageAppKey: enumField("Package", {
          cleartrace: "ClearTrace",
          crm: "CRM",
          estii: "Estii",
          site: "Site",
          tasks: "Tasks",
        }),
        packageRevision: optionalNumberField("Package revision"),
        sourceSchemaHash: optionalTextField("Source schema hash"),
        label: textField("Label"),
        status: enumField("Status", {
          disabled: "Disabled",
          failed: "Failed",
          installed: "Installed",
        }),
        storageIdentity: textField("Storage identity"),
        createdAt: textField("Created at"),
        updatedAt: textField("Updated at"),
      },
      mutations: editableMutations,
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
          schema: "Schema",
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
        createdAt: textField("Created at"),
        updatedAt: textField("Updated at"),
      },
      mutations: editableMutations,
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
        createdAt: textField("Created at"),
        updatedAt: textField("Updated at"),
      },
      mutations: editableMutations,
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
        { field: "deploymentConfig", display: "readOnly" },
        { field: "toHost", display: "readOnly" },
        { field: "toUrl", display: "readOnly" },
        { field: "statusCode", display: "readOnly" },
        { field: "createdAt", display: "readOnly" },
        { field: "updatedAt", display: "readOnly" },
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
      "createdAt",
      "updatedAt",
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
      "deploymentConfig",
      { field: "toHost", visibleWhen: { field: "kind", values: ["redirect"] } },
      { field: "toUrl", visibleWhen: { field: "kind", values: ["redirect"] } },
      { field: "statusCode", visibleWhen: { field: "kind", values: ["redirect"] } },
      { field: "preservePath", visibleWhen: { field: "kind", values: ["redirect"] } },
      { field: "preserveQueryString", visibleWhen: { field: "kind", values: ["redirect"] } },
      "createdAt",
      "updatedAt",
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
      "deploymentConfig",
      { field: "toHost", visibleWhen: { field: "kind", values: ["redirect"] } },
      { field: "toUrl", visibleWhen: { field: "kind", values: ["redirect"] } },
      { field: "statusCode", visibleWhen: { field: "kind", values: ["redirect"] } },
      { field: "preservePath", visibleWhen: { field: "kind", values: ["redirect"] } },
      { field: "preserveQueryString", visibleWhen: { field: "kind", values: ["redirect"] } },
    ]),
    routeList: collectionView("Routes", "route", "routeAll", "routeTable", {
      createView: "routeCreate",
      extraQueries: [
        "routeEnabled",
        "routeMount",
        "routeHostMapping",
        "routeRedirect",
        "routeInstanceMount",
        "routeAppMount",
        "routePublicSiteMount",
      ],
      navigation: true,
    }),
    routesByDeploymentConfigList: collectionView(
      "Routes by deployment config",
      "route",
      "routesForSelectedDeploymentConfig",
      "routeTable",
      {
        context: {
          name: "deploymentConfig",
          entity: "deployment-config",
          query: "deploymentConfigAll",
          labelField: "label",
          presentation: "listDetail",
          relationship: "deploymentConfigRoutes",
          createView: "deploymentConfigCreate",
          itemView: "deploymentConfigItem",
        },
      },
    ),
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
      "createdAt",
      "updatedAt",
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
        sections: [
          { id: "routes", type: "collection", view: "routeList" },
          {
            id: "routes-by-deployment-config",
            label: "Routes by deployment config",
            type: "collection",
            view: "routesByDeploymentConfigList",
          },
        ],
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
    builder: { editable: false },
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
      createdAt: install.createdAt,
      updatedAt: install.updatedAt,
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

export function instanceControlPlaneAppRouteId(
  installId: AppInstallId,
  routeKind: InstanceControlPlaneAppRouteKind,
): string {
  return `route:${installId}:${routeKind === "publicSite" ? "public-site" : routeKind}`;
}

export function instanceControlPlaneDefaultRoutesForInstall(input: {
  installId: AppInstallId;
  packageAppKey: PackageAppKey;
  now: string;
}): InstanceControlPlaneRecord<"route", InstanceControlPlaneRouteValues>[] {
  const routeInput = { install: { installId: input.installId }, now: input.now };
  const adminRoute = mountRouteRecord(routeInput, {
    matchPath: `/apps/${input.installId}`,
    surface: "admin",
    targetProfile: "app",
  });
  const schemaRoute = mountRouteRecord(routeInput, {
    matchPath: `/apps/${input.installId}/schema`,
    surface: "schema",
    targetProfile: "app",
  });

  if (input.packageAppKey !== "site") {
    return [adminRoute, schemaRoute];
  }

  return [
    adminRoute,
    schemaRoute,
    mountRouteRecord(routeInput, {
      matchPath: `/sites/${input.installId}`,
      matchPrefix: `/sites/${input.installId}/`,
      surface: "public-site",
      targetProfile: "public-site",
    }),
  ];
}

export function instanceControlPlaneRouteRecordsForAppInstall(input: {
  install: Pick<
    AppInstall,
    | "adminRoute"
    | "installId"
    | "packageAppKey"
    | "publicRoute"
    | "publicRoutePrefix"
    | "schemaRoute"
  >;
  now: string;
}): InstanceControlPlaneRecord<"route", InstanceControlPlaneRouteValues>[] {
  const records = [
    mountRouteRecord(input, {
      matchPath: input.install.adminRoute,
      surface: "admin",
      targetProfile: "app",
    }),
    mountRouteRecord(input, {
      matchPath: input.install.schemaRoute,
      surface: "schema",
      targetProfile: "app",
    }),
  ];

  if (input.install.packageAppKey === "site" && input.install.publicRoute !== undefined) {
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
      createdAt: input.now,
      updatedAt: input.now,
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
      : { actions: [{ type: "create", createView: options.createView }] }),
  } satisfies AppSchema["views"][string];
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
    field === "packageAppKey" ||
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
