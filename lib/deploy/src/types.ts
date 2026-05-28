/**
 * Public Deploy contract version.
 *
 * Version 1 covers schema-owned control-plane deployment intent, actor-scoped
 * action ids, display-safe evidence, secret references, and deterministic
 * projection inputs. Provider execution, credentials, and canonical provider
 * resource truth stay outside this package contract.
 *
 * This file is intentionally import-free so runtime-neutral, client, React, and
 * Worker entrypoints can share declarations without adapter dependencies.
 */
export const DEPLOY_PUBLIC_CONTRACT_VERSION = 1;

export const DEPLOY_CONTROL_PLANE_ACTION_IDS = {
  createAppInstall: "createAppInstall",
  createAppRoute: "createAppRoute",
  materializeDesiredState: "materializeDesiredState",
  recordDeploymentDrift: "recordDeploymentDrift",
  recordDeploymentFailure: "recordDeploymentFailure",
  recordDeploymentPlan: "recordDeploymentPlan",
  recordDeploymentSuccess: "recordDeploymentSuccess",
  setRouteEnabled: "setRouteEnabled",
  startDeploymentAttempt: "startDeploymentAttempt",
} as const;

export type DeployControlPlaneActionId =
  (typeof DEPLOY_CONTROL_PLANE_ACTION_IDS)[keyof typeof DEPLOY_CONTROL_PLANE_ACTION_IDS];

export const DEPLOY_ACTOR_KINDS = ["owner", "admin", "cliDeployer", "runner", "system"] as const;

export type DeployActorKind = (typeof DEPLOY_ACTOR_KINDS)[number];

export type DeployActor = {
  actorId: string;
  displayName?: string;
  kind: DeployActorKind;
  runnerId?: string;
};

export type DeploySecretReference = {
  configured: boolean;
  envNames?: string[];
  label?: string;
  providerFamily?: DeployProviderFamily;
  ref: string;
};

export type DeployProviderFamily = "cloudflare";

export type DeployResourceKind =
  | "cloudflare-dns-records"
  | "cloudflare-redirect-rule"
  | "cloudflare-worker-custom-domain";

export type DeployJsonPrimitive = boolean | number | string | null;

export type DeployJsonValue =
  | DeployJsonPrimitive
  | DeployJsonValue[]
  | { [key: string]: DeployJsonValue };

export type DeployResourceDependency = {
  logicalId: string;
  reason?: string;
};

export type DeployResource = {
  dependencies: DeployResourceDependency[];
  inputs: Record<string, DeployJsonValue>;
  kind: DeployResourceKind;
  logicalId: string;
  providerFamily: DeployProviderFamily;
  targetId: string;
};

export type DeployResourceGraph = {
  resources: DeployResource[];
  targetId: string;
};

export type DeployDesiredStateProjection = {
  resourceGraph: DeployResourceGraph;
  routeTargets: DeployRouteTargetProjection[];
  sourceFingerprint: string;
  targetId: string;
};

export type DeployDesiredStateProjectionInput = {
  appRoutes?: readonly ControlPlaneAppRouteProjectionRecord[];
  domainMappings?: readonly ControlPlaneDomainMappingProjectionRecord[];
  instanceId: string;
  redirectIntents?: readonly ControlPlaneRedirectIntentProjectionRecord[];
  targetId: string;
  workerName?: string;
};

export type DeployRouteTargetProjection = {
  appInstallId: string;
  packageAppKey: string;
  path: string;
  prefix?: string;
  routeId: string;
  routeKind: ControlPlaneAppRouteKind;
  surface: ControlPlaneAppRouteSurface;
};

export type ControlPlaneAppRouteKind = "admin" | "publicSite" | "schema";
export type ControlPlaneAppRouteSurface = "admin" | "publicSite" | "schema";

export type ControlPlaneAppRouteProjectionRecord = {
  appInstallId: string;
  enabled: boolean;
  id: string;
  packageAppKey: string;
  path: string;
  prefix?: string;
  routeKind: ControlPlaneAppRouteKind;
  surface: ControlPlaneAppRouteSurface;
};

export type ControlPlaneDomainMappingProfile = "app" | "instance" | "publicSite";

export type ControlPlaneDomainMappingProjectionRecord = {
  appInstallId?: string;
  appRouteId?: string;
  enabled: boolean;
  host: string;
  id: string;
  profile: ControlPlaneDomainMappingProfile;
};

export type ControlPlaneRedirectStatusCode = 301 | 302 | 303 | 307 | 308;

export type ControlPlaneRedirectIntentProjectionRecord = {
  enabled: boolean;
  fromHost: string;
  id: string;
  preservePath: boolean;
  preserveQueryString: boolean;
  statusCode: ControlPlaneRedirectStatusCode;
  toHost?: string;
  toUrl?: string;
};

export type DeployEvidenceAction = "adopted" | "created" | "deleted" | "no-change" | "updated";

export type DeployEvidenceSummary = {
  action: DeployEvidenceAction;
  alchemyResourceId?: string;
  displayName?: string;
  kind: DeployResourceKind;
  logicalId: string;
  providerFamily: DeployProviderFamily;
  providerResourceIds: string[];
  recordedAt: string;
  targetId: string;
};

export type DeployAttemptMode = "apply" | "destroy" | "plan";
export type DeployAttemptStatus = "failed" | "planned" | "started" | "succeeded";

export type DeployAttemptSummary = {
  actor: DeployActor;
  attemptId: string;
  desiredStateHash: string;
  mode: DeployAttemptMode;
  status: DeployAttemptStatus;
  targetId: string;
  updatedAt: string;
  versionId: string;
};

export type DeployDriftStatus = "drifted" | "in-sync" | "unknown";

export type DeployDriftSummary = {
  affectedLogicalIds: string[];
  create: number;
  delete: number;
  status: DeployDriftStatus;
  targetId: string;
  update: number;
};

export type DeployProjectionHashInput = {
  projection: DeployDesiredStateProjection;
  schemaVersion: typeof DEPLOY_PUBLIC_CONTRACT_VERSION;
};
