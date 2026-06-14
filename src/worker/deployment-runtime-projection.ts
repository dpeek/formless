import {
  type DeploymentDesiredStateSource,
  type DeploymentResourceGraph,
  type DeploymentTarget,
} from "../shared/deployment-runtime.ts";
import {
  deployDesiredStateProjectionInputFromControlPlaneRecords,
  projectDeployControlPlaneDesiredState,
} from "@dpeek/formless-deploy";
import type { StoredRecord } from "../shared/protocol.ts";
import { readControlPlaneRecords } from "./deployment-control-plane-client.ts";

export type PrimaryInstanceDeploymentProjectionEnv = {
  FORMLESS_AUTHORITY?: DurableObjectNamespace;
  FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID?: string;
  FORMLESS_DOMAIN_PROVIDER_WORKER_NAME?: string;
};

export async function buildPrimaryInstanceDeploymentDesiredStateProjection(input: {
  env: PrimaryInstanceDeploymentProjectionEnv;
  now: string;
  requestUrl: string;
  target?: DeploymentTarget;
  targetId: DeploymentTarget["targetId"];
}) {
  return buildDeploymentDesiredStateProjectionFromControlPlaneRecords(
    (await readControlPlaneRecords({
      env: input.env,
      requestUrl: input.requestUrl,
    })) ?? [],
    {
      env: input.env,
      targetId: input.targetId,
    },
  );
}

export function buildDeploymentDesiredStateProjectionFromControlPlaneRecords(
  records: readonly StoredRecord[],
  input: {
    env?: PrimaryInstanceDeploymentProjectionEnv;
    targetId: DeploymentTarget["targetId"];
  },
): {
  resourceGraph: DeploymentResourceGraph;
  source: DeploymentDesiredStateSource;
} {
  const projectionInput = deployDesiredStateProjectionInputFromControlPlaneRecords({
    instanceId:
      optionalDeploymentEnv(input.env?.FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID) ??
      "unconfigured-instance",
    records,
    targetId: input.targetId,
    workerName: optionalDeploymentEnv(input.env?.FORMLESS_DOMAIN_PROVIDER_WORKER_NAME),
  });
  const projection = projectDeployControlPlaneDesiredState(projectionInput);
  const resourceGraph = projection.resourceGraph;

  return {
    resourceGraph,
    source: {
      fingerprint: projection.sourceFingerprint,
      intentRevision: resourceGraph.resources.length,
    },
  };
}

function optionalDeploymentEnv(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
