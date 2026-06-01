import { DEPLOY_CONTROL_PLANE_ACTION_IDS } from "./types.ts";
import type { DeployActorKind, DeployControlPlaneActionId } from "./types.ts";

export { DEPLOY_CONTROL_PLANE_ACTION_IDS, DEPLOY_PUBLIC_CONTRACT_VERSION } from "./types.ts";
export type {
  DeployActor,
  DeployActorKind,
  DeployAttemptSummary,
  DeployControlPlaneActionId,
  DeployDesiredStateProjection,
  DeployDriftSummary,
  DeployEvidenceSummary,
  DeploySecretReference,
} from "./types.ts";

export const DEPLOY_CONTROL_PLANE_API_ROUTE_PREFIX = "/api/formless/control-plane";
export const DEPLOY_CONTROL_PLANE_ACTOR_HEADER = "X-Formless-Control-Plane-Actor";

export type DeployControlPlaneProtocolActorKind = Extract<
  DeployActorKind,
  "admin" | "cliDeployer" | "owner" | "runner"
>;

export type DeployControlPlaneRecord = {
  createdAt?: string;
  deletedAt?: string;
  entity: string;
  id: string;
  updatedAt?: string;
  values: Record<string, unknown>;
};

export type DeployControlPlaneBootstrapResponse = {
  cursor?: number;
  records: DeployControlPlaneRecord[];
  schema?: unknown;
};

export type DeployDesiredStateVersionRef = {
  hash: string;
  revision: number;
  targetId: string;
  versionId: string;
};

export type DeployDesiredStateVersionLike = DeployDesiredStateVersionRef & {
  [key: string]: unknown;
};

export type DeployControlPlaneActionRequest = {
  actionId: DeployControlPlaneActionId;
  idempotencyKey?: string;
  input: Record<string, unknown>;
};

export type DeployControlPlaneActionResponse = {
  actionId: DeployControlPlaneActionId;
  recordIds: string[];
};

export function deployControlPlaneActionPath(actionId: DeployControlPlaneActionId): string {
  return `${DEPLOY_CONTROL_PLANE_API_ROUTE_PREFIX}/actions/${actionId}`;
}

export function deployControlPlaneBootstrapPath(
  actorKind?: DeployControlPlaneProtocolActorKind,
): string {
  if (actorKind === undefined) {
    return `${DEPLOY_CONTROL_PLANE_API_ROUTE_PREFIX}/bootstrap`;
  }

  const searchParams = new URLSearchParams({ actorKind });

  return `${DEPLOY_CONTROL_PLANE_API_ROUTE_PREFIX}/bootstrap?${searchParams.toString()}`;
}

export function deployControlPlaneActorHeaders(
  actorKind: DeployControlPlaneProtocolActorKind,
): Record<string, string> {
  return { [DEPLOY_CONTROL_PLANE_ACTOR_HEADER]: actorKind };
}

export function deployControlPlaneRecordsByEntity(
  records: readonly DeployControlPlaneRecord[],
  entity: string,
): DeployControlPlaneRecord[] {
  return records.filter((record) => record.entity === entity && record.deletedAt === undefined);
}

export function deployDesiredStateVersionRef(
  desiredState: DeployDesiredStateVersionLike,
): DeployDesiredStateVersionRef {
  return {
    hash: desiredState.hash,
    revision: desiredState.revision,
    targetId: desiredState.targetId,
    versionId: desiredState.versionId,
  };
}

export function isDeployControlPlaneActionId(value: string): value is DeployControlPlaneActionId {
  return Object.values(DEPLOY_CONTROL_PLANE_ACTION_IDS).includes(
    value as DeployControlPlaneActionId,
  );
}
