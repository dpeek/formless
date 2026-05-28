import type { AppInstall, AppInstallId, PackageAppKey } from "./app-installs.ts";
import type { AppSchema, EntityMutationPolicy, FieldEditor, FieldSchema } from "./schema.ts";
import type { PackageAppRevision, SourceSchemaHash } from "./upgrade-migrations.ts";

export const INSTANCE_CONTROL_PLANE_SCHEMA_KEY = "instance-control-plane";
export const INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY = "instance:control-plane";
export const INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX = "/api/formless/control-plane";

export const instanceControlPlaneEntityNames = [
  "appInstall",
  "appRoute",
  "deployTarget",
  "providerConfigRef",
  "domainMapping",
  "redirectIntent",
  "deployDesiredResource",
  "deployAttempt",
  "deployEvidenceSummary",
  "deployDriftReport",
] as const;

export type InstanceControlPlaneEntityName = (typeof instanceControlPlaneEntityNames)[number];

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
export type InstanceControlPlaneAppRouteSurface = "admin" | "publicSite" | "schema";
export type InstanceControlPlaneAppRouteCapability = "generatedApp" | "publicSite" | "schema";

export type InstanceControlPlaneAppRouteValues = {
  appInstall: AppInstallId;
  routeKind: InstanceControlPlaneAppRouteKind;
  path: `/${string}`;
  prefix?: `/${string}/`;
  surface: InstanceControlPlaneAppRouteSurface;
  packageCapability: InstanceControlPlaneAppRouteCapability;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
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

export type InstanceControlPlaneDomainMappingProfile = "app" | "instance" | "publicSite";

export type InstanceControlPlaneDomainMappingValues = {
  host: string;
  profile: InstanceControlPlaneDomainMappingProfile;
  appInstall?: AppInstallId;
  appRoute?: string;
  providerConfigRef?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InstanceControlPlaneRedirectStatusCode = "301" | "302" | "303" | "307" | "308";

export type InstanceControlPlaneRedirectIntentValues = {
  fromHost: string;
  toHost?: string;
  toUrl?: string;
  statusCode: InstanceControlPlaneRedirectStatusCode;
  preservePath: boolean;
  preserveQueryString: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InstanceControlPlaneDeploymentResourceKind =
  | "cloudflare-dns-records"
  | "cloudflare-redirect-rule"
  | "cloudflare-worker-custom-domain";

export type InstanceControlPlaneDeployDesiredResourceValues = {
  deployTarget: string;
  domainMapping?: string;
  redirectIntent?: string;
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
  appInstall: InstanceControlPlaneAppInstallValues;
  appRoute: InstanceControlPlaneAppRouteValues;
  deployAttempt: InstanceControlPlaneDeployAttemptValues;
  deployDesiredResource: InstanceControlPlaneDeployDesiredResourceValues;
  deployDriftReport: InstanceControlPlaneDeployDriftReportValues;
  deployEvidenceSummary: InstanceControlPlaneDeployEvidenceSummaryValues;
  deployTarget: InstanceControlPlaneDeployTargetValues;
  domainMapping: InstanceControlPlaneDomainMappingValues;
  providerConfigRef: InstanceControlPlaneProviderConfigRefValues;
  redirectIntent: InstanceControlPlaneRedirectIntentValues;
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
  appInstall: ["installId", "packageAppKey", "storageIdentity"],
  appRoute: ["appInstall", "packageCapability", "surface"],
  deployAttempt: ["deployTarget", "versionId", "desiredStateHash", "revision", "idempotencyKey"],
  deployDesiredResource: ["deployTarget", "logicalId", "kind", "providerFamily"],
  deployDriftReport: ["deployTarget", "versionId", "desiredStateHash", "revision"],
  deployEvidenceSummary: ["deployAttempt", "logicalId", "kind", "providerFamily"],
  deployTarget: ["targetId", "targetKind"],
  domainMapping: ["host", "profile"],
  providerConfigRef: ["providerFamily", "configRef"],
  redirectIntent: ["fromHost"],
} as const satisfies Record<InstanceControlPlaneEntityName, readonly string[]>;

export const instanceControlPlaneActionCreatedEntities = [
  "deployAttempt",
  "deployEvidenceSummary",
  "deployDriftReport",
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
    appInstall: {
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
    appRoute: {
      label: "App route",
      fields: {
        appInstall: referenceField("App install", "appInstall", "label"),
        routeKind: enumField("Kind", {
          admin: "Admin",
          publicSite: "Public Site",
          schema: "Schema",
        }),
        path: textField("Path"),
        prefix: optionalTextField("Prefix"),
        surface: enumField("Surface", {
          admin: "Admin",
          publicSite: "Public Site",
          schema: "Schema",
        }),
        packageCapability: enumField("Package capability", {
          generatedApp: "Generated app",
          publicSite: "Public Site",
          schema: "Schema",
        }),
        enabled: booleanField("Enabled", true),
        createdAt: textField("Created at"),
        updatedAt: textField("Updated at"),
      },
      mutations: editableMutations,
    },
    deployTarget: {
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
    providerConfigRef: {
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
    domainMapping: {
      label: "Domain mapping",
      fields: {
        host: textField("Host"),
        profile: enumField("Profile", {
          app: "App",
          instance: "Instance",
          publicSite: "Public Site",
        }),
        appInstall: optionalReferenceField("App install", "appInstall", "label"),
        appRoute: optionalReferenceField("App route", "appRoute", "path"),
        providerConfigRef: optionalReferenceField("Provider config", "providerConfigRef", "label"),
        enabled: booleanField("Enabled", true),
        createdAt: textField("Created at"),
        updatedAt: textField("Updated at"),
      },
      mutations: editableMutations,
      constraints: {
        uniqueHostProfile: { kind: "unique", fields: ["host", "profile"] },
      },
    },
    redirectIntent: {
      label: "Redirect intent",
      fields: {
        fromHost: textField("From host"),
        toHost: optionalTextField("To host"),
        toUrl: optionalTextField("To URL", "href"),
        statusCode: enumField("Status code", {
          "301": "301",
          "302": "302",
          "303": "303",
          "307": "307",
          "308": "308",
        }),
        preservePath: booleanField("Preserve path", true),
        preserveQueryString: booleanField("Preserve query string", true),
        enabled: booleanField("Enabled", true),
        createdAt: textField("Created at"),
        updatedAt: textField("Updated at"),
      },
      mutations: editableMutations,
      constraints: {
        uniqueRedirectFromHost: { kind: "unique", fields: ["fromHost"] },
      },
    },
    deployDesiredResource: {
      label: "Desired resource",
      fields: {
        deployTarget: referenceField("Deploy target", "deployTarget", "label"),
        domainMapping: optionalReferenceField("Domain mapping", "domainMapping", "host"),
        redirectIntent: optionalReferenceField("Redirect intent", "redirectIntent", "fromHost"),
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
    deployAttempt: {
      label: "Deploy attempt",
      fields: {
        deployTarget: referenceField("Deploy target", "deployTarget", "label"),
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
    deployEvidenceSummary: {
      label: "Evidence summary",
      fields: {
        deployAttempt: referenceField("Deploy attempt", "deployAttempt", "versionId"),
        deployDesiredResource: optionalReferenceField(
          "Desired resource",
          "deployDesiredResource",
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
    deployDriftReport: {
      label: "Drift report",
      fields: {
        deployTarget: referenceField("Deploy target", "deployTarget", "label"),
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
    appRouteInstall: toOne("App route install", "appRoute", "appInstall", "appInstall"),
    domainMappingInstall: toOne(
      "Domain mapping install",
      "domainMapping",
      "appInstall",
      "appInstall",
    ),
    domainMappingRoute: toOne("Domain mapping route", "domainMapping", "appRoute", "appRoute"),
    domainMappingProviderConfig: toOne(
      "Domain mapping provider config",
      "domainMapping",
      "providerConfigRef",
      "providerConfigRef",
    ),
    desiredResourceTarget: toOne(
      "Desired resource target",
      "deployDesiredResource",
      "deployTarget",
      "deployTarget",
    ),
    desiredResourceDomainMapping: toOne(
      "Desired resource domain mapping",
      "deployDesiredResource",
      "domainMapping",
      "domainMapping",
    ),
    desiredResourceRedirectIntent: toOne(
      "Desired resource redirect intent",
      "deployDesiredResource",
      "redirectIntent",
      "redirectIntent",
    ),
    deployAttemptTarget: toOne(
      "Deploy attempt target",
      "deployAttempt",
      "deployTarget",
      "deployTarget",
    ),
    deployEvidenceAttempt: toOne(
      "Evidence attempt",
      "deployEvidenceSummary",
      "deployAttempt",
      "deployAttempt",
    ),
    deployEvidenceDesiredResource: toOne(
      "Evidence desired resource",
      "deployEvidenceSummary",
      "deployDesiredResource",
      "deployDesiredResource",
    ),
    deployDriftTarget: toOne("Drift target", "deployDriftReport", "deployTarget", "deployTarget"),
  },
  queries: {
    appInstallAll: allQuery("App installs", "appInstall"),
    appRouteAll: allQuery("App routes", "appRoute"),
    appRouteEnabled: whereQuery("Enabled routes", "appRoute", "enabled", true),
    deployTargetAll: allQuery("Deploy targets", "deployTarget"),
    providerConfigRefAll: allQuery("Provider config", "providerConfigRef"),
    domainMappingAll: allQuery("Domain mappings", "domainMapping"),
    domainMappingEnabled: whereQuery("Enabled mappings", "domainMapping", "enabled", true),
    redirectIntentAll: allQuery("Redirects", "redirectIntent"),
    redirectIntentEnabled: whereQuery("Enabled redirects", "redirectIntent", "enabled", true),
    deployDesiredResourceAll: allQuery("Desired resources", "deployDesiredResource"),
    deployAttemptAll: allQuery("Deploy attempts", "deployAttempt"),
    deployEvidenceSummaryAll: allQuery("Evidence summaries", "deployEvidenceSummary"),
    deployDriftReportAll: allQuery("Drift reports", "deployDriftReport"),
  },
  itemViews: {
    appInstallItem: itemView("appInstall", ["label", "installId", "packageAppKey", "status"]),
    appRouteItem: itemView("appRoute", ["path", "routeKind", "enabled"]),
    deployTargetItem: itemView("deployTarget", ["label", "targetId", "enabled"]),
    providerConfigRefItem: itemView("providerConfigRef", ["label", "providerFamily", "configRef"]),
    domainMappingItem: itemView("domainMapping", ["host", "profile", "enabled"]),
    redirectIntentItem: itemView("redirectIntent", ["fromHost", "statusCode", "enabled"]),
    deployDesiredResourceItem: itemView("deployDesiredResource", ["logicalId", "kind", "enabled"]),
    deployAttemptItem: itemView("deployAttempt", ["versionId", "mode", "status", "updatedAt"]),
    deployEvidenceSummaryItem: itemView("deployEvidenceSummary", [
      "logicalId",
      "action",
      "recordedAt",
    ]),
    deployDriftReportItem: itemView("deployDriftReport", ["versionId", "status", "reportedAt"]),
  },
  tableViews: {
    appInstallTable: tableView("appInstall", [
      { field: "label", display: "editor" },
      { field: "installId", display: "readOnly" },
      { field: "packageAppKey", display: "readOnly" },
      { field: "status", display: "readOnly" },
      { field: "storageIdentity", display: "readOnly" },
      { field: "packageRevision", display: "readOnly" },
      { field: "sourceSchemaHash", display: "readOnly" },
    ]),
    appRouteTable: tableView("appRoute", [
      { field: "appInstall", display: "readOnly" },
      { field: "routeKind", display: "readOnly" },
      { field: "path", display: "editor" },
      { field: "prefix", display: "editor" },
      { field: "enabled", display: "editor" },
      { field: "surface", display: "readOnly" },
      { field: "packageCapability", display: "readOnly" },
    ]),
    deployTargetTable: tableView("deployTarget", ["label", "targetId", "targetKind", "enabled"]),
    providerConfigRefTable: tableView("providerConfigRef", [
      "label",
      "providerFamily",
      "configRef",
      "accountId",
      "workerName",
    ]),
    domainMappingTable: tableView("domainMapping", [
      "host",
      "profile",
      "appInstall",
      "appRoute",
      "enabled",
    ]),
    redirectIntentTable: tableView("redirectIntent", [
      "fromHost",
      "toHost",
      "toUrl",
      "statusCode",
      "enabled",
    ]),
    deployDesiredResourceTable: tableView("deployDesiredResource", [
      "deployTarget",
      "domainMapping",
      "redirectIntent",
      "logicalId",
      "kind",
      "providerFamily",
      "enabled",
      "sourceFingerprint",
    ]),
    deployAttemptTable: tableView("deployAttempt", [
      "deployTarget",
      "versionId",
      "mode",
      "status",
      "actorKind",
      "runnerId",
      "updatedAt",
    ]),
    deployEvidenceSummaryTable: tableView("deployEvidenceSummary", [
      "deployAttempt",
      "deployDesiredResource",
      "logicalId",
      "kind",
      "action",
      "providerResourceIdsJson",
      "recordedAt",
    ]),
    deployDriftReportTable: tableView("deployDriftReport", [
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
    appInstallCreate: createView("appInstall", [
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
      "appInstall",
      "appInstallAll",
      "appInstallTable",
      {
        navigation: true,
      },
    ),
    appRouteCreate: createView("appRoute", [
      "appInstall",
      "routeKind",
      "path",
      "prefix",
      "surface",
      "packageCapability",
      "enabled",
      "createdAt",
      "updatedAt",
    ]),
    appRouteList: collectionView("App routes", "appRoute", "appRouteAll", "appRouteTable", {
      extraQueries: ["appRouteEnabled"],
      navigation: true,
    }),
    deployTargetCreate: createView("deployTarget", [
      "targetId",
      "targetKind",
      "label",
      "enabled",
      "createdAt",
      "updatedAt",
    ]),
    deployTargetList: collectionView(
      "Deploy targets",
      "deployTarget",
      "deployTargetAll",
      "deployTargetTable",
      { createView: "deployTargetCreate" },
    ),
    providerConfigRefCreate: createView("providerConfigRef", [
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
      "providerConfigRef",
      "providerConfigRefAll",
      "providerConfigRefTable",
      { createView: "providerConfigRefCreate" },
    ),
    domainMappingCreate: createView("domainMapping", [
      "host",
      "profile",
      "appInstall",
      "appRoute",
      "providerConfigRef",
      "enabled",
      "createdAt",
      "updatedAt",
    ]),
    domainMappingList: collectionView(
      "Domain mappings",
      "domainMapping",
      "domainMappingAll",
      "domainMappingTable",
      {
        createView: "domainMappingCreate",
        extraQueries: ["domainMappingEnabled"],
        navigation: true,
      },
    ),
    redirectIntentCreate: createView("redirectIntent", [
      "fromHost",
      "toHost",
      "toUrl",
      "statusCode",
      "preservePath",
      "preserveQueryString",
      "enabled",
      "createdAt",
      "updatedAt",
    ]),
    redirectIntentList: collectionView(
      "Redirect intents",
      "redirectIntent",
      "redirectIntentAll",
      "redirectIntentTable",
      { createView: "redirectIntentCreate", extraQueries: ["redirectIntentEnabled"] },
    ),
    deployDesiredResourceList: collectionView(
      "Desired resources",
      "deployDesiredResource",
      "deployDesiredResourceAll",
      "deployDesiredResourceTable",
    ),
    deployAttemptList: collectionView(
      "Deploy attempts",
      "deployAttempt",
      "deployAttemptAll",
      "deployAttemptTable",
    ),
    deployEvidenceSummaryList: collectionView(
      "Evidence summaries",
      "deployEvidenceSummary",
      "deployEvidenceSummaryAll",
      "deployEvidenceSummaryTable",
    ),
    deployDriftReportList: collectionView(
      "Drift reports",
      "deployDriftReport",
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
          { id: "app-routes", type: "collection", view: "appRouteList" },
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
        sections: [
          { id: "domain-mappings", type: "collection", view: "domainMappingList" },
          { id: "redirect-intents", type: "collection", view: "redirectIntentList" },
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
        appInstall: {
          immutableFields: [...instanceControlPlaneImmutableFields.appInstall],
        },
        appRoute: {
          immutableFields: [...instanceControlPlaneImmutableFields.appRoute],
          routeValidation: {
            pathField: "path",
            prefixField: "prefix",
            enabledField: "enabled",
            routeKindField: "routeKind",
            packageCapabilityField: "packageCapability",
            appInstallField: "appInstall",
            reservedPaths: [...instanceControlPlaneReservedRoutePaths],
            routeKindCapabilities: {
              admin: "generatedApp",
              publicSite: "publicSite",
              schema: "schema",
            },
          },
        },
        deployAttempt: {
          immutableFields: [...instanceControlPlaneImmutableFields.deployAttempt],
          history: { kind: "actionCreated" },
        },
        deployDesiredResource: {
          immutableFields: [...instanceControlPlaneImmutableFields.deployDesiredResource],
        },
        deployDriftReport: {
          immutableFields: [...instanceControlPlaneImmutableFields.deployDriftReport],
          history: { kind: "actionCreated" },
        },
        deployEvidenceSummary: {
          immutableFields: [...instanceControlPlaneImmutableFields.deployEvidenceSummary],
          history: { kind: "actionCreated" },
        },
        deployTarget: {
          immutableFields: [...instanceControlPlaneImmutableFields.deployTarget],
        },
        domainMapping: {
          immutableFields: [...instanceControlPlaneImmutableFields.domainMapping],
        },
        providerConfigRef: {
          immutableFields: [...instanceControlPlaneImmutableFields.providerConfigRef],
          secretReferenceFields: ["secretRef"],
        },
        redirectIntent: {
          immutableFields: [...instanceControlPlaneImmutableFields.redirectIntent],
        },
      },
    },
  },
} satisfies AppSchema;

export function isInstanceControlPlaneEntityName(
  value: string,
): value is InstanceControlPlaneEntityName {
  return instanceControlPlaneEntityNames.includes(value as InstanceControlPlaneEntityName);
}

export function instanceControlPlaneStorageIdentityForInstall(
  installId: AppInstallId,
): `app:${AppInstallId}` {
  return `app:${installId}`;
}

export function instanceControlPlaneAppInstallRecord(
  install: AppInstall,
): InstanceControlPlaneRecord<"appInstall", InstanceControlPlaneAppInstallValues> {
  return {
    createdAt: install.createdAt,
    entity: "appInstall",
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
  InstanceControlPlaneRecord<"appInstall", InstanceControlPlaneAppInstallValues>,
  ...InstanceControlPlaneRecord<"appRoute", InstanceControlPlaneAppRouteValues>[],
] {
  return [
    instanceControlPlaneAppInstallRecord(input.install),
    ...instanceControlPlaneDefaultRoutesForInstall({
      installId: input.install.installId,
      packageAppKey: input.install.packageAppKey,
      now: input.now,
    }),
  ];
}

export function instanceControlPlaneAppRouteId(
  installId: AppInstallId,
  routeKind: InstanceControlPlaneAppRouteKind,
): string {
  return `app-route:${installId}:${routeKind}`;
}

export function instanceControlPlaneDefaultRoutesForInstall(input: {
  installId: AppInstallId;
  packageAppKey: PackageAppKey;
  now: string;
}): InstanceControlPlaneRecord<"appRoute", InstanceControlPlaneAppRouteValues>[] {
  const adminRoute = appRouteRecord(input, {
    kind: "admin",
    packageCapability: "generatedApp",
    path: `/apps/${input.installId}`,
    surface: "admin",
  });
  const schemaRoute = appRouteRecord(input, {
    kind: "schema",
    packageCapability: "schema",
    path: `/apps/${input.installId}/schema`,
    surface: "schema",
  });

  if (input.packageAppKey !== "site") {
    return [adminRoute, schemaRoute];
  }

  return [
    adminRoute,
    schemaRoute,
    appRouteRecord(input, {
      kind: "publicSite",
      packageCapability: "publicSite",
      path: `/sites/${input.installId}`,
      prefix: `/sites/${input.installId}/`,
      surface: "publicSite",
    }),
  ];
}

export function isInstanceControlPlaneRouteSafePath(path: string): path is `/${string}` {
  if (!/^\/[a-z0-9._~-]+(?:\/[a-z0-9._~-]+)*$/.test(path)) {
    return false;
  }

  return !instanceControlPlaneReservedRoutePaths.some(
    (reservedPath) => path === reservedPath || path.startsWith(`${reservedPath}/`),
  );
}

function appRouteRecord(
  input: { installId: AppInstallId; now: string },
  route: {
    kind: InstanceControlPlaneAppRouteKind;
    packageCapability: InstanceControlPlaneAppRouteCapability;
    path: `/${string}`;
    prefix?: `/${string}/`;
    surface: InstanceControlPlaneAppRouteSurface;
  },
): InstanceControlPlaneRecord<"appRoute", InstanceControlPlaneAppRouteValues> {
  return {
    createdAt: input.now,
    entity: "appRoute",
    id: instanceControlPlaneAppRouteId(input.installId, route.kind),
    updatedAt: input.now,
    values: {
      appInstall: input.installId,
      routeKind: route.kind,
      path: route.path,
      ...(route.prefix === undefined ? {} : { prefix: route.prefix }),
      surface: route.surface,
      packageCapability: route.packageCapability,
      enabled: true,
      createdAt: input.now,
      updatedAt: input.now,
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
    field === "packageCapability" ||
    field === "targetKind" ||
    field === "providerFamily" ||
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
    field === "providerConfigRef" ||
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

  if (field === "toUrl") {
    return "href";
  }

  return "text";
}
