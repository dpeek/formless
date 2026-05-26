import type { DomainProviderPlan, DomainProviderZone } from "./domain-provider-protocol.ts";

export const INSTANCE_DOMAIN_PROVIDER_API_PATH = "/api/formless/domain-provider";
export const INSTANCE_DOMAIN_PROVIDER_PLAN_API_PATH = `${INSTANCE_DOMAIN_PROVIDER_API_PATH}/plan`;
export const INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH = `${INSTANCE_DOMAIN_PROVIDER_API_PATH}/apply`;

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

export type InstanceDomainProviderApplyResponse =
  | InstanceDomainProviderApplyBlockedResponse
  | InstanceDomainProviderApplyNotImplementedResponse;
