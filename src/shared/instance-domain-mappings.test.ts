import { describe, expect, it } from "vite-plus/test";
import type { AppInstall } from "./app-installs.ts";
import {
  buildInstanceDomainMappingAppliedState,
  buildInstanceDomainMapping,
  disableInstanceDomainMapping,
  normalizeInstanceDomainHost,
  parseCreateInstanceDomainMappingRequest,
  parseRecordInstanceDomainMappingApplyEvidenceRequest,
} from "./instance-domain-mappings.ts";

const now = "2026-05-26T01:00:00.000Z";

describe("instance domain mappings", () => {
  it("normalizes exact hostnames for durable lookup keys", () => {
    expect(normalizeInstanceDomainHost("WWW.Example.COM.:443")).toEqual({
      ok: true,
      host: "www.example.com",
    });
    expect(normalizeInstanceDomainHost("dpeek.com.")).toEqual({
      ok: true,
      host: "dpeek.com",
    });
  });

  it("rejects URLs and invalid hostnames", () => {
    expect(normalizeInstanceDomainHost("https://example.com")).toMatchObject({
      ok: false,
      error: { code: "invalid-host", field: "host" },
    });
    expect(normalizeInstanceDomainHost("bad_host.example.com")).toMatchObject({
      ok: false,
      error: { code: "invalid-host", field: "host" },
    });
  });

  it("builds enabled profile mappings and keeps legacy Site aliases", () => {
    const first = buildInstanceDomainMapping({
      existingMappings: [],
      installs: [siteInstall("personal")],
      host: "WWW.Example.COM.",
      profile: "publicSite",
      targetInstallId: "personal",
      now,
    });

    expect(first).toMatchObject({
      ok: true,
      mapping: {
        host: "www.example.com",
        profile: "publicSite",
        surface: "site",
        targetInstallId: "personal",
        installId: "personal",
        enabled: true,
      },
    });

    if (!first.ok) {
      throw new Error("Expected first domain mapping to build.");
    }

    const second = buildInstanceDomainMapping({
      existingMappings: first.mappings,
      installs: [siteInstall("personal")],
      host: "admin.example.com",
      profile: "instance",
      enabled: false,
      now,
    });

    expect(second).toMatchObject({
      ok: true,
      mappings: [
        { host: "admin.example.com", profile: "instance", enabled: false },
        { host: "www.example.com", profile: "publicSite", enabled: true },
      ],
    });
  });

  it("reads legacy surface input as a publicSite profile mapping", () => {
    const result = buildInstanceDomainMapping({
      existingMappings: [],
      installs: [siteInstall("personal")],
      host: "example.com",
      surface: "site",
      installId: "personal",
      now,
    });

    expect(result).toMatchObject({
      ok: true,
      mapping: {
        host: "example.com",
        profile: "publicSite",
        surface: "site",
        targetInstallId: "personal",
        installId: "personal",
      },
    });
  });

  it("rejects duplicate host/profile mappings and enabled cross-profile host conflicts", () => {
    const existing = [
      {
        host: "example.com",
        profile: "publicSite",
        surface: "site",
        targetInstallId: "personal",
        installId: "personal",
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    ] as const;

    expect(
      buildInstanceDomainMapping({
        existingMappings: existing,
        installs: [siteInstall("personal")],
        host: "EXAMPLE.COM.",
        profile: "publicSite",
        targetInstallId: "personal",
        now,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "duplicate-domain-mapping", field: "host" },
      mappings: existing,
    });

    expect(
      buildInstanceDomainMapping({
        existingMappings: existing,
        installs: [],
        host: "example.com",
        profile: "instance",
        now,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "duplicate-domain-mapping", field: "host" },
    });
  });

  it("validates profile targets", () => {
    expect(
      buildInstanceDomainMapping({
        existingMappings: [],
        installs: [siteInstall("personal")],
        host: "example.com",
        profile: "admin",
        now,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid-profile", field: "profile" },
    });

    expect(
      buildInstanceDomainMapping({
        existingMappings: [],
        installs: [tasksInstall("tasks")],
        host: "example.com",
        profile: "publicSite",
        targetInstallId: "tasks",
        now,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "unsupported-install-package", field: "targetInstallId" },
    });

    expect(
      buildInstanceDomainMapping({
        existingMappings: [],
        installs: [tasksInstall("tasks")],
        host: "tasks.example.com",
        profile: "app",
        targetInstallId: "tasks",
        now,
      }),
    ).toMatchObject({
      ok: true,
      mapping: { profile: "app", targetInstallId: "tasks", installId: "tasks" },
    });

    expect(
      buildInstanceDomainMapping({
        existingMappings: [],
        installs: [siteInstall("personal")],
        host: "admin.example.com",
        profile: "instance",
        targetInstallId: "personal",
        now,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid-install-id", field: "targetInstallId" },
    });
  });

  it("disables desired mappings without removing them", () => {
    const existing = [
      {
        host: "example.com",
        profile: "publicSite",
        surface: "site",
        targetInstallId: "personal",
        installId: "personal",
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    ] as const;

    expect(
      disableInstanceDomainMapping({
        existingMappings: existing,
        host: "EXAMPLE.COM.",
        profile: "publicSite",
        now: "2026-05-26T02:00:00.000Z",
      }),
    ).toMatchObject({
      ok: true,
      mapping: {
        host: "example.com",
        profile: "publicSite",
        enabled: false,
        updatedAt: "2026-05-26T02:00:00.000Z",
      },
      mappings: [{ host: "example.com", enabled: false }],
    });
  });

  it("parses the create request shape", () => {
    expect(
      parseCreateInstanceDomainMappingRequest({
        host: "example.com",
        profile: "publicSite",
        targetInstallId: "personal",
        enabled: false,
      }),
    ).toEqual({
      host: "example.com",
      profile: "publicSite",
      targetInstallId: "personal",
      enabled: false,
    });

    expect(() =>
      parseCreateInstanceDomainMappingRequest({
        host: "example.com",
        profile: "publicSite",
        targetInstallId: "personal",
        extra: true,
      }),
    ).toThrow('Domain mapping request has unsupported key "extra".');
  });

  it("builds Cloudflare applied state only for an existing desired mapping", () => {
    const result = buildInstanceDomainMappingAppliedState({
      existingMappings: [
        {
          host: "www.example.com",
          profile: "publicSite",
          surface: "site",
          targetInstallId: "personal",
          installId: "personal",
          enabled: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
      host: "WWW.Example.COM.",
      profile: "publicSite",
      targetInstallId: "personal",
      provider: "cloudflare-worker-custom-domain",
      accountId: "account-123",
      zoneId: "zone-1",
      zoneName: "example.com",
      workerName: "personal-worker",
      workerDomainId: "domain-1",
      action: "created",
      now,
    });

    expect(result).toEqual({
      ok: true,
      appliedState: {
        host: "www.example.com",
        profile: "publicSite",
        surface: "site",
        targetInstallId: "personal",
        installId: "personal",
        provider: "cloudflare-worker-custom-domain",
        accountId: "account-123",
        zoneId: "zone-1",
        zoneName: "example.com",
        workerName: "personal-worker",
        workerDomainId: "domain-1",
        action: "created",
        appliedAt: now,
        updatedAt: now,
      },
    });

    expect(
      buildInstanceDomainMappingAppliedState({
        existingMappings: [],
        host: "missing.example.com",
        surface: "site",
        installId: "personal",
        provider: "cloudflare-worker-custom-domain",
        accountId: "account-123",
        zoneId: "zone-1",
        zoneName: "example.com",
        workerName: "personal-worker",
        workerDomainId: "domain-1",
        action: "created",
        now,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "domain-mapping-not-found", field: "host" },
    });
  });

  it("records instance profile applied evidence without a fake install id", () => {
    const result = buildInstanceDomainMappingAppliedState({
      existingMappings: [
        {
          host: "admin.example.com",
          profile: "instance",
          enabled: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
      host: "admin.example.com",
      profile: "instance",
      provider: "cloudflare-worker-custom-domain",
      accountId: "account-123",
      zoneId: "zone-1",
      zoneName: "example.com",
      workerName: "personal-worker",
      workerDomainId: "domain-1",
      action: "created",
      now,
    });

    expect(result).toMatchObject({
      ok: true,
      appliedState: {
        host: "admin.example.com",
        profile: "instance",
      },
    });
  });

  it("parses the apply evidence request shape", () => {
    expect(
      parseRecordInstanceDomainMappingApplyEvidenceRequest({
        host: "example.com",
        surface: "site",
        installId: "personal",
        provider: "cloudflare-worker-custom-domain",
        accountId: "account-123",
        zoneId: "zone-1",
        zoneName: "example.com",
        workerName: "personal-worker",
        workerDomainId: "domain-1",
        action: "adopted",
      }),
    ).toEqual({
      host: "example.com",
      surface: "site",
      installId: "personal",
      provider: "cloudflare-worker-custom-domain",
      accountId: "account-123",
      zoneId: "zone-1",
      zoneName: "example.com",
      workerName: "personal-worker",
      workerDomainId: "domain-1",
      action: "adopted",
    });

    expect(() =>
      parseRecordInstanceDomainMappingApplyEvidenceRequest({
        host: "example.com",
      }),
    ).toThrow('Domain mapping apply evidence request must include "provider".');
  });
});

function siteInstall(installId: string): AppInstall {
  return {
    installId,
    packageAppKey: "site",
    label: "Personal Site",
    status: "installed",
    createdAt: now,
    updatedAt: now,
    adminRoute: `/apps/${installId}`,
    schemaRoute: `/apps/${installId}/schema`,
    publicRoute: `/sites/${installId}`,
    publicRoutePrefix: `/sites/${installId}/`,
  };
}

function tasksInstall(installId: string): AppInstall {
  return {
    installId,
    packageAppKey: "tasks",
    label: "Tasks",
    status: "installed",
    createdAt: now,
    updatedAt: now,
    adminRoute: `/apps/${installId}`,
    schemaRoute: `/apps/${installId}/schema`,
  };
}
