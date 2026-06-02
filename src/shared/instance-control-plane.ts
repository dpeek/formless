import type { AppInstall, AppInstallId, PackageAppKey } from "./app-installs.ts";
import type { AppSchema, EntityMutationPolicy, FieldEditor, FieldSchema } from "./schema.ts";
import type { PackageAppRevision, SourceSchemaHash } from "./upgrade-migrations.ts";

export const INSTANCE_CONTROL_PLANE_SCHEMA_KEY = "instance-control-plane";
export const INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY = "instance:control-plane";
export const INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX = "/api/formless/control-plane";

export const instanceControlPlaneEntityNames = [
  "app-install",
  "app-route",
  "deploy-target",
  "provider-config-ref",
  "domain-mapping",
  "redirect-intent",
  "deploy-desired-resource",
  "deploy-attempt",
  "deploy-evidence-summary",
  "deploy-drift-report",
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
  "app-install": InstanceControlPlaneAppInstallValues;
  "app-route": InstanceControlPlaneAppRouteValues;
  "deploy-attempt": InstanceControlPlaneDeployAttemptValues;
  "deploy-desired-resource": InstanceControlPlaneDeployDesiredResourceValues;
  "deploy-drift-report": InstanceControlPlaneDeployDriftReportValues;
  "deploy-evidence-summary": InstanceControlPlaneDeployEvidenceSummaryValues;
  "deploy-target": InstanceControlPlaneDeployTargetValues;
  "domain-mapping": InstanceControlPlaneDomainMappingValues;
  "provider-config-ref": InstanceControlPlaneProviderConfigRefValues;
  "redirect-intent": InstanceControlPlaneRedirectIntentValues;
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
  "app-route": ["appInstall", "packageCapability", "surface"],
  "deploy-attempt": ["deployTarget", "versionId", "desiredStateHash", "revision", "idempotencyKey"],
  "deploy-desired-resource": ["deployTarget", "logicalId", "kind", "providerFamily"],
  "deploy-drift-report": ["deployTarget", "versionId", "desiredStateHash", "revision"],
  "deploy-evidence-summary": ["deployAttempt", "logicalId", "kind", "providerFamily"],
  "deploy-target": ["targetId", "targetKind"],
  "domain-mapping": ["host", "profile"],
  "provider-config-ref": ["providerFamily", "configRef"],
  "redirect-intent": ["fromHost"],
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
    "app-route": {
      label: "App route",
      fields: {
        appInstall: referenceField("App install", "app-install", "label"),
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
    "domain-mapping": {
      label: "Domain mapping",
      fields: {
        host: textField("Host"),
        profile: enumField("Profile", {
          app: "App",
          instance: "Instance",
          publicSite: "Public Site",
        }),
        appInstall: optionalReferenceField("App install", "app-install", "label"),
        appRoute: optionalReferenceField("App route", "app-route", "path"),
        providerConfigRef: optionalReferenceField(
          "Provider config",
          "provider-config-ref",
          "label",
        ),
        enabled: booleanField("Enabled", true),
        createdAt: textField("Created at"),
        updatedAt: textField("Updated at"),
      },
      mutations: editableMutations,
      constraints: {
        uniqueHostProfile: { kind: "unique", fields: ["host", "profile"] },
      },
    },
    "redirect-intent": {
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
    "deploy-desired-resource": {
      label: "Desired resource",
      fields: {
        deployTarget: referenceField("Deploy target", "deploy-target", "label"),
        domainMapping: optionalReferenceField("Domain mapping", "domain-mapping", "host"),
        redirectIntent: optionalReferenceField("Redirect intent", "redirect-intent", "fromHost"),
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
    appRouteInstall: toOne("App route install", "app-route", "appInstall", "app-install"),
    domainMappingInstall: toOne(
      "Domain mapping install",
      "domain-mapping",
      "appInstall",
      "app-install",
    ),
    domainMappingRoute: toOne("Domain mapping route", "domain-mapping", "appRoute", "app-route"),
    domainMappingProviderConfig: toOne(
      "Domain mapping provider config",
      "domain-mapping",
      "providerConfigRef",
      "provider-config-ref",
    ),
    desiredResourceTarget: toOne(
      "Desired resource target",
      "deploy-desired-resource",
      "deployTarget",
      "deploy-target",
    ),
    desiredResourceDomainMapping: toOne(
      "Desired resource domain mapping",
      "deploy-desired-resource",
      "domainMapping",
      "domain-mapping",
    ),
    desiredResourceRedirectIntent: toOne(
      "Desired resource redirect intent",
      "deploy-desired-resource",
      "redirectIntent",
      "redirect-intent",
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
    appRouteAll: allQuery("App routes", "app-route"),
    appRouteEnabled: whereQuery("Enabled routes", "app-route", "enabled", true),
    deployTargetAll: allQuery("Deploy targets", "deploy-target"),
    providerConfigRefAll: allQuery("Provider config", "provider-config-ref"),
    domainMappingAll: allQuery("Domain mappings", "domain-mapping"),
    domainMappingEnabled: whereQuery("Enabled mappings", "domain-mapping", "enabled", true),
    redirectIntentAll: allQuery("Redirects", "redirect-intent"),
    redirectIntentEnabled: whereQuery("Enabled redirects", "redirect-intent", "enabled", true),
    deployDesiredResourceAll: allQuery("Desired resources", "deploy-desired-resource"),
    deployAttemptAll: allQuery("Deploy attempts", "deploy-attempt"),
    deployEvidenceSummaryAll: allQuery("Evidence summaries", "deploy-evidence-summary"),
    deployDriftReportAll: allQuery("Drift reports", "deploy-drift-report"),
  },
  itemViews: {
    appInstallItem: itemView("app-install", ["label", "installId", "packageAppKey", "status"]),
    appRouteItem: itemView("app-route", ["path", "routeKind", "enabled"]),
    deployTargetItem: itemView("deploy-target", ["label", "targetId", "enabled"]),
    providerConfigRefItem: itemView("provider-config-ref", [
      "label",
      "providerFamily",
      "configRef",
    ]),
    domainMappingItem: itemView("domain-mapping", ["host", "profile", "enabled"]),
    redirectIntentItem: itemView("redirect-intent", ["fromHost", "statusCode", "enabled"]),
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
    appRouteTable: tableView("app-route", [
      { field: "appInstall", display: "readOnly" },
      { field: "routeKind", display: "readOnly" },
      { field: "path", display: "editor" },
      { field: "prefix", display: "editor" },
      { field: "enabled", display: "editor" },
      { field: "surface", display: "readOnly" },
      { field: "packageCapability", display: "readOnly" },
    ]),
    deployTargetTable: tableView("deploy-target", ["label", "targetId", "targetKind", "enabled"]),
    providerConfigRefTable: tableView("provider-config-ref", [
      "label",
      "providerFamily",
      "configRef",
      "accountId",
      "workerName",
    ]),
    domainMappingTable: tableView("domain-mapping", [
      "host",
      "profile",
      "appInstall",
      "appRoute",
      "enabled",
    ]),
    redirectIntentTable: tableView("redirect-intent", [
      "fromHost",
      "toHost",
      "toUrl",
      "statusCode",
      "enabled",
    ]),
    deployDesiredResourceTable: tableView("deploy-desired-resource", [
      "deployTarget",
      "domainMapping",
      "redirectIntent",
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
    appRouteCreate: createView("app-route", [
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
    appRouteList: collectionView("App routes", "app-route", "appRouteAll", "appRouteTable", {
      extraQueries: ["appRouteEnabled"],
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
    domainMappingCreate: createView("domain-mapping", [
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
      "domain-mapping",
      "domainMappingAll",
      "domainMappingTable",
      {
        createView: "domainMappingCreate",
        extraQueries: ["domainMappingEnabled"],
        navigation: true,
      },
    ),
    redirectIntentCreate: createView("redirect-intent", [
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
      "redirect-intent",
      "redirectIntentAll",
      "redirectIntentTable",
      { createView: "redirectIntentCreate", extraQueries: ["redirectIntentEnabled"] },
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
        "app-install": {
          immutableFields: [...instanceControlPlaneImmutableFields["app-install"]],
        },
        "app-route": {
          immutableFields: [...instanceControlPlaneImmutableFields["app-route"]],
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
        "domain-mapping": {
          immutableFields: [...instanceControlPlaneImmutableFields["domain-mapping"]],
        },
        "provider-config-ref": {
          immutableFields: [...instanceControlPlaneImmutableFields["provider-config-ref"]],
          secretReferenceFields: ["secretRef"],
        },
        "redirect-intent": {
          immutableFields: [...instanceControlPlaneImmutableFields["redirect-intent"]],
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
  ...InstanceControlPlaneRecord<"app-route", InstanceControlPlaneAppRouteValues>[],
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
}): InstanceControlPlaneRecord<"app-route", InstanceControlPlaneAppRouteValues>[] {
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
): InstanceControlPlaneRecord<"app-route", InstanceControlPlaneAppRouteValues> {
  return {
    createdAt: input.now,
    entity: "app-route",
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
