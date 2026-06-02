import type { AppInstall, AppInstallId, PackageAppKey } from "./app-installs.ts";
import { formatQualifiedEntityName, parseQualifiedEntityName } from "./schema-entity-names.ts";
import type { AppSchema, EntityMutationPolicy, FieldEditor, FieldSchema } from "./schema.ts";
import type { PackageAppRevision, SourceSchemaHash } from "./upgrade-migrations.ts";

export const INSTANCE_CONTROL_PLANE_SCHEMA_KEY = "instance-control-plane";
export const INSTANCE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY = "instance";
export const INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY = "instance:control-plane";
export const INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX = "/api/formless/control-plane";

export const instanceControlPlaneEntityNames = [
  "app-install",
  "route",
  "deploy-target",
  "provider-config-ref",
  "deploy-desired-resource",
  "deploy-attempt",
  "deploy-evidence-summary",
  "deploy-drift-report",
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
    throw new Error(`${context} entity "${value}" is not an instance control-plane entity.`);
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

export type InstanceControlPlaneRouteValues = {
  enabled: boolean;
  "match-host"?: string;
  "match-path": `/${string}`;
  "match-prefix"?: `/${string}`;
  kind: InstanceControlPlaneRouteKind;
  "target-profile"?: InstanceControlPlaneRouteTargetProfile;
  "app-install"?: AppInstallId;
  surface?: InstanceControlPlaneRouteSurface;
  "provider-config"?: string;
  "to-host"?: string;
  "to-url"?: string;
  "status-code"?: InstanceControlPlaneRedirectStatusCode;
  "preserve-path"?: boolean;
  "preserve-query-string"?: boolean;
  "created-at": string;
  "updated-at": string;
};

export type InstanceControlPlaneDeployTargetKind = "instance";

export type InstanceControlPlaneDeployTargetValues = {
  targetId: string;
  targetKind: InstanceControlPlaneDeployTargetKind;
  label: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InstanceControlPlaneProviderFamily = "cloudflare";

export type InstanceControlPlaneProviderConfigRefValues = {
  providerFamily: InstanceControlPlaneProviderFamily;
  configRef: string;
  label: string;
  accountId?: string;
  workerName?: string;
  secretRef?: string;
  createdAt: string;
  updatedAt: string;
};

export type InstanceControlPlaneRedirectStatusCode = "301" | "302" | "303" | "307" | "308";

export type InstanceControlPlaneDeploymentResourceKind =
  | "cloudflare-dns-records"
  | "cloudflare-redirect-rule"
  | "cloudflare-worker-custom-domain";

export type InstanceControlPlaneDeployDesiredResourceValues = {
  deployTarget: string;
  route?: string;
  logicalId: string;
  kind: InstanceControlPlaneDeploymentResourceKind;
  providerFamily: InstanceControlPlaneProviderFamily;
  inputsJson: string;
  dependenciesJson?: string;
  enabled: boolean;
  sourceFingerprint: string;
  createdAt: string;
  updatedAt: string;
};

export type InstanceControlPlaneDeploymentActorKind =
  | "admin"
  | "cliDeployer"
  | "owner"
  | "runner"
  | "system";

export type InstanceControlPlaneDeploymentAttemptMode = "apply" | "destroy" | "plan";
export type InstanceControlPlaneDeploymentAttemptStatus =
  | "failed"
  | "planned"
  | "started"
  | "succeeded";

export type InstanceControlPlaneDeployAttemptValues = {
  deployTarget: string;
  versionId: string;
  desiredStateHash: string;
  revision: number;
  mode: InstanceControlPlaneDeploymentAttemptMode;
  status: InstanceControlPlaneDeploymentAttemptStatus;
  actorKind: InstanceControlPlaneDeploymentActorKind;
  actorId: string;
  runnerId?: string;
  idempotencyKey: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type InstanceControlPlaneDeploymentEvidenceAction =
  | "adopted"
  | "created"
  | "deleted"
  | "no-change"
  | "updated";

export type InstanceControlPlaneDeployEvidenceSummaryValues = {
  deployAttempt: string;
  deployDesiredResource?: string;
  action: InstanceControlPlaneDeploymentEvidenceAction;
  logicalId: string;
  kind: InstanceControlPlaneDeploymentResourceKind;
  providerFamily: InstanceControlPlaneProviderFamily;
  providerResourceIdsJson: string;
  displayName?: string;
  alchemyResourceId?: string;
  recordedAt: string;
};

export type InstanceControlPlaneDeploymentDriftStatus = "drifted" | "in-sync" | "unknown";

export type InstanceControlPlaneDeployDriftReportValues = {
  deployTarget: string;
  versionId: string;
  desiredStateHash: string;
  revision: number;
  status: InstanceControlPlaneDeploymentDriftStatus;
  actorKind: InstanceControlPlaneDeploymentActorKind;
  actorId: string;
  affectedLogicalIdsJson: string;
  createCount: number;
  updateCount: number;
  deleteCount: number;
  reportedAt: string;
};

export type InstanceControlPlaneRecordValuesByEntity = {
  "app-install": InstanceControlPlaneAppInstallValues;
  "deploy-attempt": InstanceControlPlaneDeployAttemptValues;
  "deploy-desired-resource": InstanceControlPlaneDeployDesiredResourceValues;
  "deploy-drift-report": InstanceControlPlaneDeployDriftReportValues;
  "deploy-evidence-summary": InstanceControlPlaneDeployEvidenceSummaryValues;
  "deploy-target": InstanceControlPlaneDeployTargetValues;
  "provider-config-ref": InstanceControlPlaneProviderConfigRefValues;
  route: InstanceControlPlaneRouteValues;
};

type InstanceControlPlaneTableField =
  | string
  | {
      display?: "editor" | "hidden" | "readOnly";
      field: string;
    };

export type AnyInstanceControlPlaneRecord = {
  [Entity in InstanceControlPlaneEntityName]: InstanceControlPlaneRecord<
    Entity,
    InstanceControlPlaneRecordValuesByEntity[Entity]
  >;
}[InstanceControlPlaneEntityName];

export const instanceControlPlaneImmutableFields = {
  "app-install": ["installId", "packageAppKey", "storageIdentity"],
  "deploy-attempt": ["deployTarget", "versionId", "desiredStateHash", "revision", "idempotencyKey"],
  "deploy-desired-resource": ["deployTarget", "logicalId", "kind", "providerFamily"],
  "deploy-drift-report": ["deployTarget", "versionId", "desiredStateHash", "revision"],
  "deploy-evidence-summary": ["deployAttempt", "logicalId", "kind", "providerFamily"],
  "deploy-target": ["targetId", "targetKind"],
  "provider-config-ref": ["providerFamily", "configRef"],
  route: ["kind"],
} as const satisfies Record<InstanceControlPlaneEntityName, readonly string[]>;

export const instanceControlPlaneActionCreatedEntities = [
  "deploy-attempt",
  "deploy-evidence-summary",
  "deploy-drift-report",
] as const satisfies readonly InstanceControlPlaneEntityName[];

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

const appendOnlyMutations = {
  create: { enabled: false },
  patch: { enabled: false },
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
        "match-host": optionalTextField("Match host"),
        "match-path": textField("Match path"),
        "match-prefix": optionalTextField("Match prefix"),
        kind: enumField("Kind", {
          mount: "Mount",
          redirect: "Redirect",
        }),
        "target-profile": optionalEnumField("Target profile", {
          app: "App",
          instance: "Instance",
          "public-site": "Public Site",
        }),
        "app-install": optionalReferenceField("App install", "app-install", "label"),
        surface: optionalEnumField("Surface", {
          admin: "Admin",
          "public-site": "Public Site",
          schema: "Schema",
        }),
        "provider-config": optionalReferenceField(
          "Provider config",
          "provider-config-ref",
          "label",
        ),
        "to-host": optionalTextField("To host"),
        "to-url": optionalTextField("To URL", "href"),
        "status-code": optionalEnumField("Status code", {
          "301": "301",
          "302": "302",
          "303": "303",
          "307": "307",
          "308": "308",
        }),
        "preserve-path": optionalBooleanField("Preserve path", true),
        "preserve-query-string": optionalBooleanField("Preserve query string", true),
        "created-at": textField("Created at"),
        "updated-at": textField("Updated at"),
      },
      mutations: editableMutations,
    },
    "deploy-target": {
      label: "Deploy target",
      fields: {
        targetId: textField("Target id"),
        targetKind: enumField("Kind", { instance: "Instance" }),
        label: textField("Label"),
        enabled: booleanField("Enabled", true),
        createdAt: textField("Created at"),
        updatedAt: textField("Updated at"),
      },
      mutations: editableMutations,
      constraints: {
        uniqueTargetId: { kind: "unique", fields: ["targetId"] },
      },
    },
    "provider-config-ref": {
      label: "Provider config",
      fields: {
        providerFamily: enumField("Provider", { cloudflare: "Cloudflare" }),
        configRef: textField("Config ref"),
        label: textField("Label"),
        accountId: optionalTextField("Account id"),
        workerName: optionalTextField("Worker name"),
        secretRef: optionalTextField("Secret ref"),
        createdAt: textField("Created at"),
        updatedAt: textField("Updated at"),
      },
      mutations: editableMutations,
      constraints: {
        uniqueConfigRef: { kind: "unique", fields: ["configRef"] },
      },
    },
    "deploy-desired-resource": {
      label: "Desired resource",
      fields: {
        deployTarget: referenceField("Deploy target", "deploy-target", "label"),
        route: optionalReferenceField("Route", "route", "match-path"),
        logicalId: textField("Logical id"),
        kind: deploymentResourceKindField(),
        providerFamily: enumField("Provider", { cloudflare: "Cloudflare" }),
        inputsJson: textField("Inputs", "longText"),
        dependenciesJson: optionalTextField("Dependencies", "longText"),
        enabled: booleanField("Enabled", true),
        sourceFingerprint: textField("Source fingerprint"),
        createdAt: textField("Created at"),
        updatedAt: textField("Updated at"),
      },
      mutations: editableMutations,
      constraints: {
        uniqueTargetLogicalId: { kind: "unique", fields: ["deployTarget", "logicalId"] },
      },
    },
    "deploy-attempt": {
      label: "Deploy attempt",
      fields: {
        deployTarget: referenceField("Deploy target", "deploy-target", "label"),
        versionId: textField("Version id"),
        desiredStateHash: textField("Desired-state hash"),
        revision: numberField("Revision"),
        mode: enumField("Mode", {
          apply: "Apply",
          destroy: "Destroy",
          plan: "Plan",
        }),
        status: enumField("Status", {
          failed: "Failed",
          planned: "Planned",
          started: "Started",
          succeeded: "Succeeded",
        }),
        actorKind: actorKindField(),
        actorId: textField("Actor id"),
        runnerId: optionalTextField("Runner id"),
        idempotencyKey: textField("Idempotency key"),
        startedAt: textField("Started at"),
        updatedAt: textField("Updated at"),
        completedAt: optionalTextField("Completed at"),
      },
      mutations: appendOnlyMutations,
      constraints: {
        uniqueIdempotency: { kind: "unique", fields: ["deployTarget", "idempotencyKey"] },
      },
    },
    "deploy-evidence-summary": {
      label: "Evidence summary",
      fields: {
        deployAttempt: referenceField("Deploy attempt", "deploy-attempt", "versionId"),
        deployDesiredResource: optionalReferenceField(
          "Desired resource",
          "deploy-desired-resource",
          "logicalId",
        ),
        action: enumField("Action", {
          adopted: "Adopted",
          created: "Created",
          deleted: "Deleted",
          "no-change": "No change",
          updated: "Updated",
        }),
        logicalId: textField("Logical id"),
        kind: deploymentResourceKindField(),
        providerFamily: enumField("Provider", { cloudflare: "Cloudflare" }),
        providerResourceIdsJson: textField("Provider resource ids", "longText"),
        displayName: optionalTextField("Display name"),
        alchemyResourceId: optionalTextField("Alchemy resource id"),
        recordedAt: textField("Recorded at"),
      },
      mutations: appendOnlyMutations,
    },
    "deploy-drift-report": {
      label: "Drift report",
      fields: {
        deployTarget: referenceField("Deploy target", "deploy-target", "label"),
        versionId: textField("Version id"),
        desiredStateHash: textField("Desired-state hash"),
        revision: numberField("Revision"),
        status: enumField("Status", {
          drifted: "Drifted",
          "in-sync": "In sync",
          unknown: "Unknown",
        }),
        actorKind: actorKindField(),
        actorId: textField("Actor id"),
        affectedLogicalIdsJson: textField("Affected logical ids", "longText"),
        createCount: numberField("Create"),
        updateCount: numberField("Update"),
        deleteCount: numberField("Delete"),
        reportedAt: textField("Reported at"),
      },
      mutations: appendOnlyMutations,
    },
  },
  relationships: {
    routeInstall: toOne("Route install", "route", "app-install", "app-install"),
    routeProviderConfig: toOne(
      "Route provider config",
      "route",
      "provider-config",
      "provider-config-ref",
    ),
    desiredResourceTarget: toOne(
      "Desired resource target",
      "deploy-desired-resource",
      "deployTarget",
      "deploy-target",
    ),
    desiredResourceRoute: toOne(
      "Desired resource route",
      "deploy-desired-resource",
      "route",
      "route",
    ),
    deployAttemptTarget: toOne(
      "Deploy attempt target",
      "deploy-attempt",
      "deployTarget",
      "deploy-target",
    ),
    deployEvidenceAttempt: toOne(
      "Evidence attempt",
      "deploy-evidence-summary",
      "deployAttempt",
      "deploy-attempt",
    ),
    deployEvidenceDesiredResource: toOne(
      "Evidence desired resource",
      "deploy-evidence-summary",
      "deployDesiredResource",
      "deploy-desired-resource",
    ),
    deployDriftTarget: toOne(
      "Drift target",
      "deploy-drift-report",
      "deployTarget",
      "deploy-target",
    ),
  },
  queries: {
    appInstallAll: allQuery("App installs", "app-install"),
    routeAll: allQuery("Routes", "route"),
    routeEnabled: whereQuery("Enabled routes", "route", "enabled", true),
    deployTargetAll: allQuery("Deploy targets", "deploy-target"),
    providerConfigRefAll: allQuery("Provider config", "provider-config-ref"),
    deployDesiredResourceAll: allQuery("Desired resources", "deploy-desired-resource"),
    deployAttemptAll: allQuery("Deploy attempts", "deploy-attempt"),
    deployEvidenceSummaryAll: allQuery("Evidence summaries", "deploy-evidence-summary"),
    deployDriftReportAll: allQuery("Drift reports", "deploy-drift-report"),
  },
  itemViews: {
    appInstallItem: itemView("app-install", ["label", "installId", "packageAppKey", "status"]),
    routeItem: itemView("route", ["match-host", "match-path", "kind", "enabled"]),
    deployTargetItem: itemView("deploy-target", ["label", "targetId", "enabled"]),
    providerConfigRefItem: itemView("provider-config-ref", [
      "label",
      "providerFamily",
      "configRef",
    ]),
    deployDesiredResourceItem: itemView("deploy-desired-resource", [
      "logicalId",
      "kind",
      "enabled",
    ]),
    deployAttemptItem: itemView("deploy-attempt", ["versionId", "mode", "status", "updatedAt"]),
    deployEvidenceSummaryItem: itemView("deploy-evidence-summary", [
      "logicalId",
      "action",
      "recordedAt",
    ]),
    deployDriftReportItem: itemView("deploy-drift-report", ["versionId", "status", "reportedAt"]),
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
    routeTable: tableView("route", [
      { field: "enabled", display: "editor" },
      { field: "match-host", display: "editor" },
      { field: "match-path", display: "editor" },
      { field: "match-prefix", display: "editor" },
      { field: "kind", display: "readOnly" },
      { field: "target-profile", display: "editor" },
      { field: "app-install", display: "editor" },
      { field: "surface", display: "readOnly" },
      { field: "provider-config", display: "editor" },
      { field: "to-host", display: "editor" },
      { field: "to-url", display: "editor" },
      { field: "status-code", display: "editor" },
      { field: "preserve-path", display: "editor" },
      { field: "preserve-query-string", display: "editor" },
    ]),
    deployTargetTable: tableView("deploy-target", ["label", "targetId", "targetKind", "enabled"]),
    providerConfigRefTable: tableView("provider-config-ref", [
      "label",
      "providerFamily",
      "configRef",
      "accountId",
      "workerName",
    ]),
    deployDesiredResourceTable: tableView("deploy-desired-resource", [
      "deployTarget",
      "route",
      "logicalId",
      "kind",
      "providerFamily",
      "enabled",
      "sourceFingerprint",
    ]),
    deployAttemptTable: tableView("deploy-attempt", [
      "deployTarget",
      "versionId",
      "mode",
      "status",
      "actorKind",
      "runnerId",
      "updatedAt",
    ]),
    deployEvidenceSummaryTable: tableView("deploy-evidence-summary", [
      "deployAttempt",
      "deployDesiredResource",
      "logicalId",
      "kind",
      "action",
      "providerResourceIdsJson",
      "recordedAt",
    ]),
    deployDriftReportTable: tableView("deploy-drift-report", [
      "deployTarget",
      "versionId",
      "status",
      "createCount",
      "updateCount",
      "deleteCount",
      "affectedLogicalIdsJson",
      "reportedAt",
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
      "match-host",
      "match-path",
      "match-prefix",
      "kind",
      "target-profile",
      "app-install",
      "surface",
      "provider-config",
      "to-host",
      "to-url",
      "status-code",
      "preserve-path",
      "preserve-query-string",
      "created-at",
      "updated-at",
    ]),
    routeList: collectionView("Routes", "route", "routeAll", "routeTable", {
      createView: "routeCreate",
      extraQueries: ["routeEnabled"],
      navigation: true,
    }),
    deployTargetCreate: createView("deploy-target", [
      "targetId",
      "targetKind",
      "label",
      "enabled",
      "createdAt",
      "updatedAt",
    ]),
    deployTargetList: collectionView(
      "Deploy targets",
      "deploy-target",
      "deployTargetAll",
      "deployTargetTable",
      { createView: "deployTargetCreate" },
    ),
    providerConfigRefCreate: createView("provider-config-ref", [
      "providerFamily",
      "configRef",
      "label",
      "accountId",
      "workerName",
      "secretRef",
      "createdAt",
      "updatedAt",
    ]),
    providerConfigRefList: collectionView(
      "Provider config",
      "provider-config-ref",
      "providerConfigRefAll",
      "providerConfigRefTable",
      { createView: "providerConfigRefCreate" },
    ),
    deployDesiredResourceList: collectionView(
      "Desired resources",
      "deploy-desired-resource",
      "deployDesiredResourceAll",
      "deployDesiredResourceTable",
    ),
    deployAttemptList: collectionView(
      "Deploy attempts",
      "deploy-attempt",
      "deployAttemptAll",
      "deployAttemptTable",
    ),
    deployEvidenceSummaryList: collectionView(
      "Evidence summaries",
      "deploy-evidence-summary",
      "deployEvidenceSummaryAll",
      "deployEvidenceSummaryTable",
    ),
    deployDriftReportList: collectionView(
      "Drift reports",
      "deploy-drift-report",
      "deployDriftReportAll",
      "deployDriftReportTable",
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
        sections: [
          { id: "app-installs", type: "collection", view: "appInstallList" },
          { id: "routes", type: "collection", view: "routeList" },
        ],
      },
    },
    domains: {
      type: "workspace",
      label: "Domains",
      path: "/domains",
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
        sections: [
          { id: "deploy-targets", type: "collection", view: "deployTargetList" },
          { id: "provider-config", type: "collection", view: "providerConfigRefList" },
          { id: "desired-resources", type: "collection", view: "deployDesiredResourceList" },
          { id: "attempts", type: "collection", view: "deployAttemptList" },
          { id: "evidence", type: "collection", view: "deployEvidenceSummaryList" },
          { id: "drift", type: "collection", view: "deployDriftReportList" },
        ],
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
        "deploy-attempt": {
          immutableFields: [...instanceControlPlaneImmutableFields["deploy-attempt"]],
          history: { kind: "actionCreated" },
        },
        "deploy-desired-resource": {
          immutableFields: [...instanceControlPlaneImmutableFields["deploy-desired-resource"]],
        },
        "deploy-drift-report": {
          immutableFields: [...instanceControlPlaneImmutableFields["deploy-drift-report"]],
          history: { kind: "actionCreated" },
        },
        "deploy-evidence-summary": {
          immutableFields: [...instanceControlPlaneImmutableFields["deploy-evidence-summary"]],
          history: { kind: "actionCreated" },
        },
        "deploy-target": {
          immutableFields: [...instanceControlPlaneImmutableFields["deploy-target"]],
        },
        "provider-config-ref": {
          immutableFields: [...instanceControlPlaneImmutableFields["provider-config-ref"]],
          secretReferenceFields: ["secretRef"],
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
      "match-path": route.matchPath,
      ...(route.matchPrefix === undefined ? {} : { "match-prefix": route.matchPrefix }),
      kind: "mount",
      "target-profile": route.targetProfile,
      "app-install": input.install.installId,
      surface: route.surface,
      "created-at": input.now,
      "updated-at": input.now,
    },
  };
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

function numberField(label: string): FieldSchema {
  return { type: "number", required: true, label, integer: true, min: 0 };
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

function referenceField(label: string, to: string, displayField: string): FieldSchema {
  return { type: "reference", required: true, label, to, displayField };
}

function optionalReferenceField(label: string, to: string, displayField: string): FieldSchema {
  return { type: "reference", required: false, label, to, displayField };
}

function actorKindField(): FieldSchema {
  return enumField("Actor kind", {
    admin: "Admin",
    cliDeployer: "CLI deployer",
    owner: "Owner",
    runner: "Runner",
    system: "System",
  });
}

function deploymentResourceKindField(): FieldSchema {
  return enumField("Kind", {
    "cloudflare-dns-records": "Cloudflare DNS records",
    "cloudflare-redirect-rule": "Cloudflare redirect rule",
    "cloudflare-worker-custom-domain": "Cloudflare Worker custom domain",
  });
}

function toOne(
  label: string,
  fromEntity: string,
  fromField: string,
  toEntity: string,
): NonNullable<AppSchema["relationships"]>[string] {
  return {
    kind: "toOne",
    label,
    from: { entity: fromEntity, field: fromField },
    to: { entity: toEntity },
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
  value: boolean,
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

function itemView(entity: InstanceControlPlaneEntityName, fields: string[]) {
  return {
    entity,
    fields: Object.fromEntries(fields.map((field) => [field, viewField(editorForField(field))])),
  } satisfies AppSchema["itemViews"][string];
}

function tableView(
  entity: InstanceControlPlaneEntityName,
  fields: InstanceControlPlaneTableField[],
) {
  return {
    entity,
    columns: fields.map(tableFieldColumn),
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

function createView(entity: InstanceControlPlaneEntityName, fields: string[]) {
  return {
    type: "create",
    entity,
    fields: Object.fromEntries(fields.map((field) => [field, createField(editorForField(field))])),
  } satisfies AppSchema["views"][string];
}

function collectionView(
  label: string,
  entity: InstanceControlPlaneEntityName,
  defaultQuery: string,
  tableViewName: string,
  options: {
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

function editorForField(field: string): FieldEditor {
  if (
    field === "enabled" ||
    field === "preservePath" ||
    field === "preserveQueryString" ||
    field === "preserve-path" ||
    field === "preserve-query-string"
  ) {
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
    field === "packageCapability" ||
    field === "targetKind" ||
    field === "target-profile" ||
    field === "providerFamily" ||
    field === "profile" ||
    field === "statusCode" ||
    field === "status-code" ||
    field === "kind" ||
    field === "mode" ||
    field === "actorKind" ||
    field === "action"
  ) {
    return "enum";
  }

  if (
    field === "appInstall" ||
    field === "app-install" ||
    field === "appRoute" ||
    field === "providerConfigRef" ||
    field === "provider-config" ||
    field === "route" ||
    field === "deployTarget" ||
    field === "domainMapping" ||
    field === "redirectIntent" ||
    field === "deployAttempt" ||
    field === "deployDesiredResource"
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

  if (field === "toUrl" || field === "to-url") {
    return "href";
  }

  return "text";
}
