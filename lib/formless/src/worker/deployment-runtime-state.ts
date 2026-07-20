import {
  type DeploymentDesiredStateSource,
  type DeploymentDesiredStateVersion,
  type DeploymentStatus,
  type DeploymentTargetId,
} from "../shared/deployment-runtime.ts";
import {
  deriveDeployLatestStatus,
  materializeDeployDesiredStateVersion,
  type DeployResourceGraph,
} from "@dpeek/formless-deploy";
import type { StoredRecord } from "@dpeek/formless-storage";

export const INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID = "instance.primary" as DeploymentTargetId;

export type MaterializeDeploymentDesiredStateVersionInput = {
  now: string;
  resourceGraph: DeployResourceGraph;
  source: DeploymentDesiredStateSource;
  targetId: DeploymentTargetId;
  title?: string;
};

export type ReadLatestDeploymentStatusInput = {
  deploymentConfig?: StoredRecord;
  desiredState?: DeploymentDesiredStateVersion;
  now: string;
  targetId: DeploymentTargetId;
};

export async function materializeDeploymentDesiredStateVersion(
  _storage: DurableObjectStorage,
  input: MaterializeDeploymentDesiredStateVersionInput,
): Promise<DeploymentDesiredStateVersion> {
  return buildDeploymentDesiredStateVersion(input);
}

export async function buildDeploymentDesiredStateVersion(
  input: MaterializeDeploymentDesiredStateVersionInput,
): Promise<DeploymentDesiredStateVersion> {
  return materializeDeployDesiredStateVersion(input);
}

export function readLatestDeploymentStatus(
  input: ReadLatestDeploymentStatusInput,
): DeploymentStatus {
  return deriveDeployLatestStatus(input);
}
