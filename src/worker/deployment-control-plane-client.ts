import {
  INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
} from "../shared/instance-control-plane.ts";
import type {
  DeploymentAttempt,
  DeploymentDriftReport,
  DeploymentResource,
  DeploymentResourceEvidenceSummary,
  DeploymentTarget,
} from "../shared/deployment-runtime.ts";
import type { InstanceDomainProviderRedirectIntent } from "../shared/domain-provider-api.ts";
import type { InstanceDomainMapping } from "../shared/instance-domain-mappings.ts";
import type { StoredRecord } from "../shared/protocol.ts";
import {
  INTERNAL_RECORD_DEPLOYMENT_ATTEMPT_PATH,
  INTERNAL_RECORD_DEPLOYMENT_DRIFT_PATH,
  INTERNAL_RECORD_DEPLOYMENT_EVIDENCE_PATH,
  INTERNAL_SYNC_DOMAIN_INTENT_PATH,
  INTERNAL_SYNC_DEPLOYMENT_PROJECTION_PATH,
} from "./instance-control-plane.ts";

export type DeploymentControlPlaneClientEnv = {
  FORMLESS_AUTHORITY?: DurableObjectNamespace;
};

export async function syncDeploymentProjectionToControlPlane(input: {
  env: DeploymentControlPlaneClientEnv;
  now: string;
  requestUrl: string;
  resources: DeploymentResource[];
  sourceFingerprint: string;
  target: DeploymentTarget;
}): Promise<StoredRecord[] | undefined> {
  return postInternalControlPlaneRecords(input.env, input.requestUrl, {
    body: {
      now: input.now,
      resources: input.resources,
      sourceFingerprint: input.sourceFingerprint,
      target: input.target,
    },
    path: INTERNAL_SYNC_DEPLOYMENT_PROJECTION_PATH,
  });
}

export async function syncDomainIntentToControlPlane(input: {
  env: DeploymentControlPlaneClientEnv;
  mappings?: InstanceDomainMapping[];
  now: string;
  redirectIntents?: InstanceDomainProviderRedirectIntent[];
  requestUrl: string;
}): Promise<StoredRecord[] | undefined> {
  return postInternalControlPlaneRecords(input.env, input.requestUrl, {
    body: {
      ...(input.mappings === undefined ? {} : { mappings: input.mappings }),
      now: input.now,
      ...(input.redirectIntents === undefined ? {} : { redirectIntents: input.redirectIntents }),
    },
    path: INTERNAL_SYNC_DOMAIN_INTENT_PATH,
  });
}

export async function readControlPlaneRecords(input: {
  env: DeploymentControlPlaneClientEnv;
  requestUrl: string;
}): Promise<StoredRecord[] | undefined> {
  if (!input.env.FORMLESS_AUTHORITY) {
    return undefined;
  }

  const id = input.env.FORMLESS_AUTHORITY.idFromName(INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY);
  const response = await input.env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(new URL(`${INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX}/bootstrap`, input.requestUrl), {
      headers: { Accept: "application/json" },
      method: "GET",
    }),
  );
  const body = (await response.json()) as { error?: string; records?: StoredRecord[] };

  if (!response.ok || !Array.isArray(body.records)) {
    throw new Error(body.error ?? "Control-plane record read failed.");
  }

  return body.records;
}

export async function recordDeploymentAttemptInControlPlane(input: {
  attempt: DeploymentAttempt;
  env: DeploymentControlPlaneClientEnv;
  requestUrl: string;
  target: DeploymentTarget;
}): Promise<void> {
  await postInternalControlPlaneRecords(input.env, input.requestUrl, {
    body: {
      attempt: input.attempt,
      target: input.target,
    },
    path: INTERNAL_RECORD_DEPLOYMENT_ATTEMPT_PATH,
  });
}

export async function recordDeploymentEvidenceInControlPlane(input: {
  attempt: DeploymentAttempt;
  env: DeploymentControlPlaneClientEnv;
  evidence: DeploymentResourceEvidenceSummary[];
  now: string;
  requestUrl: string;
  target: DeploymentTarget;
}): Promise<void> {
  await postInternalControlPlaneRecords(input.env, input.requestUrl, {
    body: {
      attempt: input.attempt,
      evidence: input.evidence,
      now: input.now,
      target: input.target,
    },
    path: INTERNAL_RECORD_DEPLOYMENT_EVIDENCE_PATH,
  });
}

export async function recordDeploymentDriftInControlPlane(input: {
  env: DeploymentControlPlaneClientEnv;
  now: string;
  report: DeploymentDriftReport;
  requestUrl: string;
  target: DeploymentTarget;
}): Promise<void> {
  await postInternalControlPlaneRecords(input.env, input.requestUrl, {
    body: {
      now: input.now,
      report: input.report,
      target: input.target,
    },
    path: INTERNAL_RECORD_DEPLOYMENT_DRIFT_PATH,
  });
}

async function postInternalControlPlaneRecords(
  env: DeploymentControlPlaneClientEnv,
  requestUrl: string,
  input: {
    body: unknown;
    path: string;
  },
): Promise<StoredRecord[] | undefined> {
  if (!env.FORMLESS_AUTHORITY) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(new URL(`${INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX}${input.path}`, requestUrl), {
      body: JSON.stringify(input.body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  const body = (await response.json()) as { error?: string; records?: StoredRecord[] };

  if (!response.ok || !Array.isArray(body.records)) {
    throw new Error(body.error ?? "Control-plane deployment record write failed.");
  }

  return body.records;
}
