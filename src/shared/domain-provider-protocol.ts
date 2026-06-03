import type { InstanceDomainMappingProfile } from "./instance-domain-mappings.ts";

export type DomainProviderPlanPolicy = "adopt" | "create-only" | "override";

export type DomainProviderZone = {
  id: string;
  name: string;
};

export type DomainProviderRedirectStatusCode = 301 | 302 | 303 | 307 | 308;

export type DomainProviderRedirectIntent = {
  enabled?: boolean;
  fromHost: string;
  preservePath?: boolean;
  preserveQueryString?: boolean;
  statusCode?: DomainProviderRedirectStatusCode;
  toHost?: string;
  toUrl?: string;
};

export type DomainProviderPlanInput = {
  instanceId: string;
  mappings: readonly DomainProviderProfileMappingIntent[];
  policy?: DomainProviderPlanPolicy;
  redirectIntents?: readonly DomainProviderRedirectIntent[];
  workerName: string;
  zones: readonly DomainProviderZone[];
};

export type DomainProviderProfileMappingIntent = {
  enabled: boolean;
  host: string;
  profile: InstanceDomainMappingProfile;
  targetInstallId?: string;
};

export type DomainProviderResourceKind =
  | "cloudflare-dns-records"
  | "cloudflare-redirect-rule"
  | "cloudflare-worker-custom-domain";

export type DomainProviderPlanIssueCode =
  | "duplicate-redirect-from-host"
  | "invalid-redirect-target"
  | "missing-zone"
  | "redirect-from-profile-host"
  | "redirect-loop";

export type DomainProviderPlanIssue = {
  code: DomainProviderPlanIssueCode;
  message: string;
  host?: string;
};

export type DomainProviderCustomDomainResource = {
  kind: "cloudflare-worker-custom-domain";
  logicalId: string;
  host: string;
  profile: InstanceDomainMappingProfile;
  targetInstallId?: string;
  zone: DomainProviderZone;
  props: {
    adopt: boolean;
    name: string;
    overrideExistingOrigin: boolean;
    workerName: string;
    zoneId: string;
  };
};

export type DomainProviderRedirectRuleResource = {
  kind: "cloudflare-redirect-rule";
  logicalId: string;
  fromHost: string;
  targetUrl: string;
  zone: DomainProviderZone;
  props: {
    description: string;
    preserveQueryString: boolean;
    requestUrl: string;
    statusCode: DomainProviderRedirectStatusCode;
    targetUrl: string;
    zone: string;
  };
};

export type DomainProviderDnsRecordsResource = {
  kind: "cloudflare-dns-records";
  logicalId: string;
  fromHost: string;
  zone: DomainProviderZone;
  props: {
    records: [
      {
        content: string;
        name: string;
        proxied: true;
        ttl: 1;
        type: "AAAA";
      },
    ];
    zoneId: string;
  };
};

export type DomainProviderResource =
  | DomainProviderCustomDomainResource
  | DomainProviderDnsRecordsResource
  | DomainProviderRedirectRuleResource;

export type DomainProviderPlan = {
  blockers: DomainProviderPlanIssue[];
  instanceId: string;
  policy: DomainProviderPlanPolicy;
  resources: DomainProviderResource[];
  workerName: string;
};

export const CLOUDFLARE_ORIGINLESS_REDIRECT_PLACEHOLDER_DNS = {
  content: "100::",
  proxied: true,
  ttl: 1,
  type: "AAAA",
} as const;
