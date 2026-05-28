import { DEPLOY_CONTROL_PLANE_ACTION_IDS } from "./types.ts";
import type { DeployControlPlaneActionId } from "./types.ts";

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

export function isDeployControlPlaneActionId(value: string): value is DeployControlPlaneActionId {
  return Object.values(DEPLOY_CONTROL_PLANE_ACTION_IDS).includes(
    value as DeployControlPlaneActionId,
  );
}
