import {
  FORMLESS_DEPLOY_METADATA_PATH,
  type FormlessDeployMetadata,
} from "../shared/deploy-metadata.ts";
import {
  INSTANCE_DOMAIN_PROVIDER_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_APPLY_JOBS_API_PATH,
  type InstanceDomainProviderApplyJobResultRequest,
  type InstanceDomainProviderApplyJobResponse,
  type InstanceDomainProviderApplyRequest,
  type InstanceDomainProviderApplyResponse,
  type InstanceDomainProviderPlanResponse,
} from "../shared/domain-provider-api.ts";
import type {
  InstanceDomainMappingsResponse,
  RecordInstanceDomainMappingApplyEvidenceRequest,
  RecordInstanceDomainMappingApplyEvidenceResponse,
} from "../shared/instance-domain-mappings.ts";
import type { AppInstallsResponse, OwnerSetupStatusResponse } from "../shared/protocol.ts";
import { normalizeFormlessInstanceWorkspaceTargetUrl } from "./instance-workspace-config.ts";

const OWNER_SETUP_STATUS_API_PATH = "/api/formless/setup";
const APP_INSTALLS_API_PATH = "/api/formless/app-installs";
const DOMAIN_MAPPINGS_API_PATH = "/api/formless/domain-mappings";
const DOMAIN_MAPPINGS_APPLY_EVIDENCE_API_PATH = `${DOMAIN_MAPPINGS_API_PATH}/apply-evidence`;

export type FormlessInstanceTargetStatus = {
  appRegistry: AppInstallsResponse;
  deployMetadata: FormlessInstanceTargetDeployMetadata;
  ownerSetup: OwnerSetupStatusResponse;
  targetUrl: string;
};

export type FormlessInstanceTargetDeployMetadata = {
  cacheControl: string;
  metadataUrl: string;
  version: string | null;
};

export type FormlessInstanceTargetClientDependencies = {
  fetch: typeof fetch;
};

export async function readFormlessInstanceTargetStatus(
  input: { targetUrl: string },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<FormlessInstanceTargetStatus> {
  const targetUrl = normalizeFormlessInstanceWorkspaceTargetUrl(input.targetUrl);
  const [deployMetadata, ownerSetup, appRegistry] = await Promise.all([
    readFormlessInstanceDeployMetadata({ targetUrl }, dependencies),
    readFormlessInstanceOwnerSetupStatus({ targetUrl }, dependencies),
    readFormlessInstanceAppRegistry({ targetUrl }, dependencies),
  ]);

  return {
    appRegistry,
    deployMetadata,
    ownerSetup,
    targetUrl,
  };
}

export async function readFormlessInstanceDeployMetadata(
  input: { targetUrl: string },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<FormlessInstanceTargetDeployMetadata> {
  const targetUrl = normalizeFormlessInstanceWorkspaceTargetUrl(input.targetUrl);
  const metadataUrl = apiUrl(targetUrl, FORMLESS_DEPLOY_METADATA_PATH);
  const response = await dependencies.fetch(metadataUrl, {
    headers: { accept: "application/json" },
  });
  const metadata = parseDeployMetadata(
    await readJsonResponse(response, `GET ${metadataUrl}`),
    metadataUrl,
  );

  return {
    cacheControl: response.headers.get("Cache-Control") ?? "",
    metadataUrl,
    version: metadata.version,
  };
}

export async function readFormlessInstanceOwnerSetupStatus(
  input: { targetUrl: string },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<OwnerSetupStatusResponse> {
  const targetUrl = normalizeFormlessInstanceWorkspaceTargetUrl(input.targetUrl);
  const statusUrl = apiUrl(targetUrl, OWNER_SETUP_STATUS_API_PATH);

  return parseOwnerSetupStatus(
    await fetchJson(dependencies.fetch, statusUrl, { headers: { accept: "application/json" } }),
    statusUrl,
  );
}

export async function readFormlessInstanceAppRegistry(
  input: { targetUrl: string },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<AppInstallsResponse> {
  const targetUrl = normalizeFormlessInstanceWorkspaceTargetUrl(input.targetUrl);
  const registryUrl = apiUrl(targetUrl, APP_INSTALLS_API_PATH);

  return parseAppRegistry(
    await fetchJson(dependencies.fetch, registryUrl, { headers: { accept: "application/json" } }),
    registryUrl,
  );
}

export async function readFormlessInstanceDomainMappings(
  input: { targetUrl: string },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDomainMappingsResponse> {
  const targetUrl = normalizeFormlessInstanceWorkspaceTargetUrl(input.targetUrl);
  const mappingsUrl = apiUrl(targetUrl, DOMAIN_MAPPINGS_API_PATH);

  return parseDomainMappings(
    await fetchJson(dependencies.fetch, mappingsUrl, { headers: { accept: "application/json" } }),
    mappingsUrl,
  );
}

export async function readFormlessInstanceDomainProviderPlan(
  input: { targetUrl: string },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDomainProviderPlanResponse> {
  const targetUrl = normalizeFormlessInstanceWorkspaceTargetUrl(input.targetUrl);
  const providerUrl = apiUrl(targetUrl, INSTANCE_DOMAIN_PROVIDER_API_PATH);

  return parseDomainProviderPlan(
    await fetchJson(dependencies.fetch, providerUrl, { headers: { accept: "application/json" } }),
    providerUrl,
  );
}

export async function requestFormlessInstanceDomainProviderApply(
  input: {
    adminToken?: string | null;
    request?: InstanceDomainProviderApplyRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDomainProviderApplyResponse> {
  const targetUrl = normalizeFormlessInstanceWorkspaceTargetUrl(input.targetUrl);
  const applyUrl = apiUrl(targetUrl, INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH);
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };

  if (input.adminToken && input.adminToken.trim() !== "") {
    headers.authorization = `Bearer ${input.adminToken.trim()}`;
  }

  return parseDomainProviderApplyResponse(
    await postJson(dependencies.fetch, applyUrl, {
      body: JSON.stringify(input.request ?? {}),
      headers,
      method: "POST",
    }),
    applyUrl,
  );
}

export async function completeFormlessInstanceDomainProviderApplyJob(
  input: {
    adminToken?: string | null;
    jobId: string;
    result: InstanceDomainProviderApplyJobResultRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDomainProviderApplyJobResponse> {
  const targetUrl = normalizeFormlessInstanceWorkspaceTargetUrl(input.targetUrl);
  const resultUrl = apiUrl(
    targetUrl,
    `${INSTANCE_DOMAIN_PROVIDER_APPLY_JOBS_API_PATH}/${encodeURIComponent(input.jobId)}/result`,
  );
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };

  if (input.adminToken && input.adminToken.trim() !== "") {
    headers.authorization = `Bearer ${input.adminToken.trim()}`;
  }

  return parseDomainProviderApplyJobResponse(
    await postJson(dependencies.fetch, resultUrl, {
      body: JSON.stringify(input.result),
      headers,
      method: "POST",
    }),
    resultUrl,
  );
}

export async function recordFormlessInstanceDomainMappingApplyEvidence(
  input: {
    adminToken?: string | null;
    evidence: RecordInstanceDomainMappingApplyEvidenceRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<RecordInstanceDomainMappingApplyEvidenceResponse> {
  const targetUrl = normalizeFormlessInstanceWorkspaceTargetUrl(input.targetUrl);
  const evidenceUrl = apiUrl(targetUrl, DOMAIN_MAPPINGS_APPLY_EVIDENCE_API_PATH);
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };

  if (input.adminToken && input.adminToken.trim() !== "") {
    headers.authorization = `Bearer ${input.adminToken.trim()}`;
  }

  return parseApplyEvidenceResponse(
    await postJson(dependencies.fetch, evidenceUrl, {
      body: JSON.stringify(input.evidence),
      headers,
      method: "POST",
    }),
    evidenceUrl,
  );
}

async function fetchJson(fetcher: typeof fetch, url: string, init: RequestInit): Promise<unknown> {
  const response = await fetcher(url, init);

  return readJsonResponse(response, `GET ${url}`);
}

async function postJson(fetcher: typeof fetch, url: string, init: RequestInit): Promise<unknown> {
  const response = await fetcher(url, init);

  return readJsonResponse(response, `POST ${url}`);
}

async function readJsonResponse(response: Response, context: string): Promise<unknown> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${context} failed: HTTP ${response.status} ${text}`);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${context} failed: response was not JSON.`);
  }
}

function parseDeployMetadata(value: unknown, context: string): FormlessDeployMetadata {
  if (!isRecord(value)) {
    throw new Error(`${context} failed: deploy metadata must be an object.`);
  }

  if (value.version !== null && typeof value.version !== "string") {
    throw new Error(`${context} failed: deploy metadata version must be a string or null.`);
  }

  return {
    version: value.version,
  };
}

function parseOwnerSetupStatus(value: unknown, context: string): OwnerSetupStatusResponse {
  if (!isRecord(value) || typeof value.setupComplete !== "boolean") {
    throw new Error(`${context} failed: setup status must include setupComplete.`);
  }

  return {
    setupComplete: value.setupComplete,
    ...(isRecord(value.owner) ? { owner: value.owner as OwnerSetupStatusResponse["owner"] } : {}),
  };
}

function parseAppRegistry(value: unknown, context: string): AppInstallsResponse {
  if (!isRecord(value) || !Array.isArray(value.packages) || !Array.isArray(value.installs)) {
    throw new Error(`${context} failed: app registry must include packages and installs arrays.`);
  }

  return {
    installs: value.installs as AppInstallsResponse["installs"],
    packages: value.packages as AppInstallsResponse["packages"],
  };
}

function parseDomainMappings(value: unknown, context: string): InstanceDomainMappingsResponse {
  if (!isRecord(value) || !Array.isArray(value.mappings)) {
    throw new Error(`${context} failed: domain mappings response must include mappings.`);
  }

  return {
    appliedStates: Array.isArray(value.appliedStates)
      ? (value.appliedStates as InstanceDomainMappingsResponse["appliedStates"])
      : [],
    auditEvents: Array.isArray(value.auditEvents)
      ? (value.auditEvents as InstanceDomainMappingsResponse["auditEvents"])
      : [],
    mappings: value.mappings as InstanceDomainMappingsResponse["mappings"],
  };
}

function parseDomainProviderPlan(
  value: unknown,
  context: string,
): InstanceDomainProviderPlanResponse {
  if (!isRecord(value) || !isRecord(value.config) || !isRecord(value.plan)) {
    throw new Error(`${context} failed: domain provider plan response is invalid.`);
  }

  return value as InstanceDomainProviderPlanResponse;
}

function parseDomainProviderApplyResponse(
  value: unknown,
  context: string,
): InstanceDomainProviderApplyResponse {
  if (!isRecord(value) || typeof value.status !== "string") {
    throw new Error(`${context} failed: domain provider apply response is invalid.`);
  }

  return value as InstanceDomainProviderApplyResponse;
}

function parseDomainProviderApplyJobResponse(
  value: unknown,
  context: string,
): InstanceDomainProviderApplyJobResponse {
  if (!isRecord(value) || !isRecord(value.job)) {
    throw new Error(`${context} failed: domain provider apply job response is invalid.`);
  }

  return value as InstanceDomainProviderApplyJobResponse;
}

function parseApplyEvidenceResponse(
  value: unknown,
  context: string,
): RecordInstanceDomainMappingApplyEvidenceResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.appliedState) ||
    !Array.isArray(value.appliedStates) ||
    !isRecord(value.auditEvent) ||
    !Array.isArray(value.auditEvents)
  ) {
    throw new Error(`${context} failed: apply evidence response is invalid.`);
  }

  return value as RecordInstanceDomainMappingApplyEvidenceResponse;
}

function apiUrl(targetUrl: string, apiPath: string): string {
  return new URL(apiPath, `${targetUrl}/`).toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
