import type {
  DomainProviderApplyPolicy,
  DomainProviderPlan,
  DomainProviderRedirectStatusCode,
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
export const INSTANCE_DOMAIN_PROVIDER_REDIRECTS_API_PATH = `${INSTANCE_DOMAIN_PROVIDER_API_PATH}/redirects`;

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
  redirectIntents: InstanceDomainProviderRedirectIntent[];
};

export type InstanceDomainProviderRedirectIntent = {
  createdAt: string;
  enabled: boolean;
  fromHost: string;
  preservePath: boolean;
  preserveQueryString: boolean;
  statusCode: DomainProviderRedirectStatusCode;
  toHost?: string;
  toUrl?: string;
  updatedAt: string;
};

export type CreateInstanceDomainProviderRedirectIntentRequest = {
  enabled?: boolean;
  fromHost: string;
  preservePath?: boolean;
  preserveQueryString?: boolean;
  statusCode?: DomainProviderRedirectStatusCode;
  toHost?: string;
  toUrl?: string;
};

export type DeleteInstanceDomainProviderRedirectIntentRequest = {
  fromHost: string;
};

export type InstanceDomainProviderAppliedResourceAction = InstanceDomainMappingAppliedAction;

export type InstanceDomainProviderAppliedResourceState = {
  accountId: string;
  action: InstanceDomainProviderAppliedResourceAction;
  alchemyResourceId: string;
  appliedAt: string;
  host: string;
  kind: DomainProviderResourceKind;
  logicalId: string;
  resourceId: string;
  resourceJson: string;
  runnerId?: string;
  updatedAt: string;
  zoneId: string;
  zoneName: string;
};

export type InstanceDomainProviderAuditEvent = InstanceDomainProviderAppliedResourceState & {
  eventId: number;
};

export type InstanceDomainProviderRedirectsResponse = {
  appliedResources: InstanceDomainProviderAppliedResourceState[];
  auditEvents: InstanceDomainProviderAuditEvent[];
  redirectIntents: InstanceDomainProviderRedirectIntent[];
};

export type CreateInstanceDomainProviderRedirectIntentResponse = {
  redirectIntent: InstanceDomainProviderRedirectIntent;
  redirectIntents: InstanceDomainProviderRedirectIntent[];
};

export type DeleteInstanceDomainProviderRedirectIntentResponse = {
  redirectIntent: InstanceDomainProviderRedirectIntent;
  redirectIntents: InstanceDomainProviderRedirectIntent[];
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

export type InstanceDomainProviderApplyJobCustomDomainResourceEvidence = {
  accountId: string;
  action: InstanceDomainMappingAppliedAction;
  alchemyResourceId: string;
  host: string;
  kind: "cloudflare-worker-custom-domain";
  logicalId: string;
  profile: InstanceDomainMappingProfile;
  targetInstallId?: string;
  workerDomainId: string;
  workerName: string;
  zoneId: string;
  zoneName: string;
};

export type InstanceDomainProviderApplyJobRedirectRuleResourceEvidence = {
  accountId: string;
  action: InstanceDomainProviderAppliedResourceAction;
  alchemyResourceId: string;
  host: string;
  kind: "cloudflare-redirect-rule";
  logicalId: string;
  preserveQueryString: boolean;
  redirectRuleId: string;
  redirectRulesetId: string;
  statusCode: DomainProviderRedirectStatusCode;
  targetUrl: string;
  zoneId: string;
  zoneName: string;
};

export type InstanceDomainProviderApplyJobDnsRecordsResourceEvidence = {
  accountId: string;
  action: InstanceDomainProviderAppliedResourceAction;
  alchemyResourceId: string;
  dnsRecordIds: string[];
  host: string;
  kind: "cloudflare-dns-records";
  logicalId: string;
  zoneId: string;
  zoneName: string;
};

export type InstanceDomainProviderApplyJobResourceEvidence =
  | InstanceDomainProviderApplyJobCustomDomainResourceEvidence
  | InstanceDomainProviderApplyJobDnsRecordsResourceEvidence
  | InstanceDomainProviderApplyJobRedirectRuleResourceEvidence;

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
