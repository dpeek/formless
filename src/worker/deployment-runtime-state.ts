import {
  canonicalizeDeploymentResourceGraph,
  computeDeploymentDesiredStateHash,
  type DeploymentDesiredStateDisplaySummary,
  type DeploymentDesiredStateHash,
  type DeploymentDesiredStateSource,
  type DeploymentDesiredStateVersion,
  type DeploymentDesiredStateVersionId,
  type DeploymentDesiredStateVersionRef,
  type DeploymentFailureSummary,
  type DeploymentResourceGraph,
  type DeploymentResourceKind,
  type DeploymentRunnerId,
  type DeploymentStatus,
  type DeploymentTargetId,
} from "../shared/deployment-runtime.ts";
import type { StoredRecord } from "../shared/protocol.ts";

export const INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID = "instance.primary" as DeploymentTargetId;

export type MaterializeDeploymentDesiredStateVersionInput = {
  now: string;
  resourceGraph: DeploymentResourceGraph;
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

type ObservedDeploymentStatus = "deployed" | "drifted" | "failed" | "in-sync" | "unknown";

export async function materializeDeploymentDesiredStateVersion(
  _storage: DurableObjectStorage,
  input: MaterializeDeploymentDesiredStateVersionInput,
): Promise<DeploymentDesiredStateVersion> {
  return buildDeploymentDesiredStateVersion(input);
}

export async function buildDeploymentDesiredStateVersion(
  input: MaterializeDeploymentDesiredStateVersionInput,
): Promise<DeploymentDesiredStateVersion> {
  assertGraphTarget(input);

  const resourceGraph = canonicalizeDeploymentResourceGraph(input.resourceGraph);
  const hash = await computeDeploymentDesiredStateHash({
    resourceGraph,
    schemaVersion: 1,
    targetId: input.targetId,
  });
  const display = deploymentDesiredStateDisplaySummary(resourceGraph, input.title);
  const revision = deploymentDesiredStateRevision(input.source);
  const versionId = deploymentDesiredStateVersionId(input.targetId, hash);

  return {
    createdAt: input.now,
    display,
    hash,
    resourceGraph,
    revision,
    schemaVersion: 1,
    source: input.source,
    targetId: input.targetId,
    versionId,
  };
}

export function readLatestDeploymentStatus(
  input: ReadLatestDeploymentStatusInput,
): DeploymentStatus {
  if (
    input.deploymentConfig === undefined ||
    !deploymentConfigMatchesTarget(input.deploymentConfig, input.targetId)
  ) {
    return {
      checkedAt: input.now,
      state: "no-target",
    };
  }

  if (input.desiredState === undefined) {
    return {
      checkedAt: input.now,
      state: "no-target",
    };
  }

  const latestDesiredState = desiredStateRefFromVersion(input.desiredState);
  const observedStatus = observedDeploymentStatus(input.deploymentConfig.values.observedStatus);
  const observedHash = observedDesiredStateHash(
    input.deploymentConfig.values.observedDesiredStateHash,
  );

  if (observedStatus === undefined || observedHash !== input.desiredState.hash) {
    return {
      checkedAt: input.now,
      latestDesiredState,
      state: "pending-changes",
      targetId: input.targetId,
    };
  }

  const observedAt = stringRecordValue(input.deploymentConfig.values.observedAt) ?? input.now;
  const runnerId = deploymentRunnerId(input.deploymentConfig.values.observedRunnerId);
  const summary = stringRecordValue(input.deploymentConfig.values.observedSummary);

  if (observedStatus === "deployed" || observedStatus === "in-sync") {
    return {
      checkedAt: input.now,
      deployedAt: observedAt,
      latestDesiredState,
      ...(runnerId === undefined ? {} : { runnerId }),
      ...(summary === undefined ? {} : { summary }),
      state: "deployed",
      targetId: input.targetId,
    };
  }

  if (observedStatus === "failed") {
    return {
      checkedAt: input.now,
      failedAt: observedAt,
      latestDesiredState,
      ...(runnerId === undefined ? {} : { runnerId }),
      state: "failed-current-version",
      summary: observedFailureSummary(input.deploymentConfig),
      targetId: input.targetId,
    };
  }

  if (observedStatus === "drifted") {
    return {
      checkedAt: input.now,
      latestDesiredState,
      ...(runnerId === undefined ? {} : { runnerId }),
      ...(summary === undefined ? {} : { summary }),
      state: "drift",
      targetId: input.targetId,
    };
  }

  return {
    checkedAt: input.now,
    latestDesiredState,
    state: "pending-changes",
    targetId: input.targetId,
  };
}

export function deploymentDesiredStateVersionId(
  targetId: DeploymentTargetId,
  hash: DeploymentDesiredStateHash,
): DeploymentDesiredStateVersionId {
  return `desired.${targetId}.${hash}` as DeploymentDesiredStateVersionId;
}

function deploymentConfigMatchesTarget(
  record: StoredRecord,
  targetId: DeploymentTargetId,
): boolean {
  return (
    !record.deletedAt &&
    record.entity === "deployment-config" &&
    record.values.enabled === true &&
    stringRecordValue(record.values.targetId) === targetId
  );
}

function observedDeploymentStatus(value: unknown): ObservedDeploymentStatus | undefined {
  return value === "deployed" ||
    value === "drifted" ||
    value === "failed" ||
    value === "in-sync" ||
    value === "unknown"
    ? value
    : undefined;
}

function observedDesiredStateHash(value: unknown): DeploymentDesiredStateHash | undefined {
  const hash = stringRecordValue(value);

  return hash?.startsWith("sha256:") ? (hash as DeploymentDesiredStateHash) : undefined;
}

function observedFailureSummary(record: StoredRecord): DeploymentFailureSummary {
  const displayMessage =
    stringRecordValue(record.values.observedError) ??
    stringRecordValue(record.values.observedSummary) ??
    "Deployment failed.";

  return {
    code: "observed-failure",
    displayMessage,
  };
}

function deploymentRunnerId(value: unknown): DeploymentRunnerId | undefined {
  const runnerId = stringRecordValue(value);

  return runnerId === undefined ? undefined : (runnerId as DeploymentRunnerId);
}

function stringRecordValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function desiredStateRefFromVersion(
  version: DeploymentDesiredStateVersion,
): DeploymentDesiredStateVersionRef {
  return {
    hash: version.hash,
    revision: version.revision,
    targetId: version.targetId,
    versionId: version.versionId,
  };
}

function deploymentDesiredStateRevision(source: DeploymentDesiredStateSource): number {
  return Number.isSafeInteger(source.intentRevision) && source.intentRevision >= 0
    ? source.intentRevision
    : 0;
}

function assertGraphTarget(input: MaterializeDeploymentDesiredStateVersionInput) {
  if (input.resourceGraph.targetId !== input.targetId) {
    throw new Error(
      `Deployment resource graph target "${input.resourceGraph.targetId}" does not match target "${input.targetId}".`,
    );
  }

  for (const resource of input.resourceGraph.resources) {
    if (resource.targetId !== input.targetId) {
      throw new Error(
        `Deployment resource "${resource.logicalId}" target "${resource.targetId}" does not match target "${input.targetId}".`,
      );
    }
  }
}

function deploymentDesiredStateDisplaySummary(
  resourceGraph: DeploymentResourceGraph,
  title?: string,
): DeploymentDesiredStateDisplaySummary {
  const resourcesByKind: Partial<Record<DeploymentResourceKind, number>> = {};

  for (const resource of resourceGraph.resources) {
    resourcesByKind[resource.kind] = (resourcesByKind[resource.kind] ?? 0) + 1;
  }

  return {
    resourceCount: resourceGraph.resources.length,
    resourcesByKind: resourcesByKind as Record<DeploymentResourceKind, number>,
    ...(title === undefined ? {} : { title }),
  };
}
