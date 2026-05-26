import { describe, expect, it } from "vite-plus/test";
import type { AppInstall } from "./app-installs.ts";
import {
  buildInstanceDomainMappingAppliedState,
  buildInstanceDomainMapping,
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

  it("builds enabled Site mappings and sorts them by host", () => {
    const first = buildInstanceDomainMapping({
      existingMappings: [],
      installs: [siteInstall("personal")],
      host: "WWW.Example.COM.",
      surface: "site",
      installId: "personal",
      now,
    });

    expect(first).toMatchObject({
      ok: true,
      mapping: {
        host: "www.example.com",
        surface: "site",
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
      host: "example.com",
      surface: "site",
      installId: "personal",
      enabled: false,
      now,
    });

    expect(second).toMatchObject({
      ok: true,
      mappings: [
        { host: "example.com", enabled: false },
        { host: "www.example.com", enabled: true },
      ],
    });
  });

  it("rejects duplicate host and surface mappings", () => {
    const existing = [
      {
        host: "example.com",
        surface: "site",
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
        surface: "site",
        installId: "personal",
        now,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "duplicate-domain-mapping", field: "host" },
      mappings: existing,
    });
  });

  it("rejects unsupported surfaces and non-Site installs", () => {
    expect(
      buildInstanceDomainMapping({
        existingMappings: [],
        installs: [siteInstall("personal")],
        host: "example.com",
        surface: "admin",
        installId: "personal",
        now,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid-surface", field: "surface" },
    });

    expect(
      buildInstanceDomainMapping({
        existingMappings: [],
        installs: [tasksInstall("tasks")],
        host: "example.com",
        surface: "site",
        installId: "tasks",
        now,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "unsupported-install-package", field: "installId" },
    });
  });

  it("parses the create request shape", () => {
    expect(
      parseCreateInstanceDomainMappingRequest({
        host: "example.com",
        surface: "site",
        installId: "personal",
        enabled: false,
      }),
    ).toEqual({
      host: "example.com",
      surface: "site",
      installId: "personal",
      enabled: false,
    });

    expect(() =>
      parseCreateInstanceDomainMappingRequest({
        host: "example.com",
        surface: "site",
        installId: "personal",
        extra: true,
      }),
    ).toThrow('Domain mapping request has unsupported key "extra".');
  });

  it("builds Cloudflare applied state only for an existing desired mapping", () => {
    const result = buildInstanceDomainMappingAppliedState({
      existingMappings: [
        {
          host: "www.example.com",
          surface: "site",
          installId: "personal",
          enabled: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
      host: "WWW.Example.COM.",
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
    });

    expect(result).toEqual({
      ok: true,
      appliedState: {
        host: "www.example.com",
        surface: "site",
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
    ).toThrow('Domain mapping apply evidence request must include "surface".');
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
