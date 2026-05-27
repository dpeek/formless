import type {
  DomainProviderApplyPolicy,
  DomainProviderPlan,
  DomainProviderResourceKind,
  DomainProviderZone,
} from "./domain-provider-protocol.ts";
import type {
  InstanceDomainMappingAppliedAction,
  InstanceDomainMappingProfile,
} from "./instance-domain-mappings.ts";

export const INSTANCE_DOMAIN_PROVIDER_API_PATH = "/api/formless/domain-provider";
export const INSTANCE_DOMAIN_PROVIDER_PLAN_API_PATH = `${INSTANCE_DOMAIN_PROVIDER_API_PATH}/plan`;
export const INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH = `${INSTANCE_DOMAIN_PROVIDER_API_PATH}/apply`;
export const INSTANCE_DOMAIN_PROVIDER_APPLY_JOBS_API_PATH = `${INSTANCE_DOMAIN_PROVIDER_API_PATH}/apply-jobs`;

export type DomainProviderConfigIssueCode =
  | "invalid-zone-config"
  | "missing-account-id"
  | "missing-alchemy-password"
  | "missing-cloudflare-api-token"
  | "missing-instance-id"
  | "missing-worker-name"
  | "missing-zone-config";

export type DomainProviderConfigIssue = {
  code: DomainProviderConfigIssueCode;
  envNames: string[];
  message: string;
};

export type DomainProviderSecretStatus = {
  configured: boolean;
  envNames: string[];
};

export type DomainProviderConfigStatus = {
  accountId?: string;
  alchemyPassword: DomainProviderSecretStatus;
  applyReady: boolean;
  cloudflareApiToken: DomainProviderSecretStatus;
  instanceId?: string;
  issues: DomainProviderConfigIssue[];
  planReady: boolean;
  workerName?: string;
  zones: DomainProviderZone[];
};

export type InstanceDomainProviderPlanResponse = {
  config: DomainProviderConfigStatus;
  plan: DomainProviderPlan;
};

export type InstanceDomainProviderApplyRequest = {
  host?: string;
  policy?: DomainProviderApplyPolicy;
  runnerId?: string;
};

export type InstanceDomainProviderApplyBlockedCode =
  | "domain-provider-apply-not-configured"
  | "domain-provider-apply-running"
  | "domain-provider-plan-blocked";

export type InstanceDomainProviderApplyBlockedResponse = {
  code: InstanceDomainProviderApplyBlockedCode;
  config: DomainProviderConfigStatus;
  error: string;
  plan: DomainProviderPlan;
  status: "blocked";
};

export type InstanceDomainProviderApplyNotImplementedResponse = {
  code: "domain-provider-apply-executor-missing";
  config: DomainProviderConfigStatus;
  error: string;
  plan: DomainProviderPlan;
  status: "not-implemented";
};

export type InstanceDomainProviderApplyJobStatus = "failed" | "ready" | "running" | "succeeded";

export type InstanceDomainProviderApplyJob = {
  createdAt: string;
  jobId: string;
  plan: DomainProviderPlan;
  result?: InstanceDomainProviderApplyJobResultSummary;
  runnerId?: string;
  status: InstanceDomainProviderApplyJobStatus;
  updatedAt: string;
};

export type InstanceDomainProviderApplyJobResultSummary = {
  error?: string;
  evidenceCount: number;
};

export type InstanceDomainProviderApplyReadyResponse = {
  code: "domain-provider-apply-job-ready";
  config: DomainProviderConfigStatus;
  job: InstanceDomainProviderApplyJob;
  plan: DomainProviderPlan;
  status: "ready";
};

export type InstanceDomainProviderApplyJobResourceEvidence = {
  accountId: string;
  action: InstanceDomainMappingAppliedAction;
  alchemyResourceId: string;
  host: string;
  kind: DomainProviderResourceKind;
  logicalId: string;
  profile: InstanceDomainMappingProfile;
  targetInstallId?: string;
  workerDomainId: string;
  workerName: string;
  zoneId: string;
  zoneName: string;
};

export type InstanceDomainProviderApplyJobResultRequest =
  | {
      error: string;
      runnerId?: string;
      status: "failed";
    }
  | {
      resources: InstanceDomainProviderApplyJobResourceEvidence[];
      runnerId?: string;
      status: "succeeded";
    };

export type InstanceDomainProviderApplyJobResponse = {
  job: InstanceDomainProviderApplyJob;
};

export type InstanceDomainProviderApplyResponse =
  | InstanceDomainProviderApplyBlockedResponse
  | InstanceDomainProviderApplyNotImplementedResponse
  | InstanceDomainProviderApplyReadyResponse;
