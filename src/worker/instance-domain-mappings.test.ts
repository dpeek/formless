import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import type { CreateAppInstallResponse } from "../shared/protocol.ts";
import type {
  InstanceDomainMapping,
  InstanceDomainMappingLookupResponse,
  InstanceDomainMappingsResponse,
  RecordInstanceDomainMappingApplyEvidenceResponse,
} from "../shared/instance-domain-mappings.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

type CreateInstanceDomainMappingResponse = {
  mapping: InstanceDomainMapping;
  mappings: InstanceDomainMapping[];
};

type DomainMappingFailureResponse = {
  code: string;
  error: string;
  field?: string;
  mappings: InstanceDomainMapping[];
};

const adminToken = "test-admin-token";

let harness: Harness;

beforeEach(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: { FORMLESS_ADMIN_TOKEN: adminToken },
    },
  );
});

afterEach(async () => {
  await harness.dispose();
});

describe("instance domain mapping API routes", () => {
  it("lists, creates, persists, and looks up enabled Site domain mappings", async () => {
    const before = await getJson<InstanceDomainMappingsResponse>("/api/formless/domain-mappings");

    await createAppInstall({ packageAppKey: "site", installId: "personal", label: "Personal" });

    const created = await postAdminJson<CreateInstanceDomainMappingResponse>(
      "/api/formless/domain-mappings",
      {
        host: "WWW.Example.COM.:443",
        surface: "site",
        installId: "personal",
      },
    );
    const after = await getJson<InstanceDomainMappingsResponse>("/api/formless/domain-mappings");
    const lookup = await getJson<InstanceDomainMappingLookupResponse>(
      `/api/formless/domain-mappings/lookup?host=${encodeURIComponent(
        "www.example.com:443",
      )}&surface=site`,
    );

    expect(before.body.mappings).toEqual([]);
    expect(created.response.status).toBe(201);
    expect(created.body.mapping).toMatchObject({
      host: "www.example.com",
      profile: "publicSite",
      surface: "site",
      targetInstallId: "personal",
      installId: "personal",
      enabled: true,
    });
    expect(after.body.mappings).toEqual(created.body.mappings);
    expect(lookup.body.mapping).toEqual(created.body.mapping);
  });

  it("keeps disabled desired mappings out of enabled host lookup", async () => {
    await createAppInstall({ packageAppKey: "site", installId: "personal", label: "Personal" });

    const created = await postAdminJson<CreateInstanceDomainMappingResponse>(
      "/api/formless/domain-mappings",
      {
        host: "disabled.example.com",
        surface: "site",
        installId: "personal",
        enabled: false,
      },
    );
    const lookup = await getJson<InstanceDomainMappingLookupResponse>(
      "/api/formless/domain-mappings/lookup?host=disabled.example.com&surface=site",
    );

    expect(created.response.status).toBe(201);
    expect(created.body.mapping.enabled).toBe(false);
    expect(created.body.mapping.profile).toBe("publicSite");
    expect(lookup.body.mapping).toBeNull();
  });

  it("rejects duplicate host and surface mappings without mutating existing mappings", async () => {
    await createAppInstall({ packageAppKey: "site", installId: "personal", label: "Personal" });
    await postAdminJson<CreateInstanceDomainMappingResponse>("/api/formless/domain-mappings", {
      host: "example.com",
      surface: "site",
      installId: "personal",
    });

    const duplicate = await postAdminJson<DomainMappingFailureResponse>(
      "/api/formless/domain-mappings",
      {
        host: "EXAMPLE.COM.",
        surface: "site",
        installId: "personal",
      },
    );

    expect(duplicate.response.status).toBe(409);
    expect(duplicate.body).toMatchObject({
      code: "duplicate-domain-mapping",
      field: "host",
      mappings: [
        {
          host: "example.com",
          profile: "publicSite",
          surface: "site",
          targetInstallId: "personal",
          installId: "personal",
        },
      ],
    });
  });

  it("validates profile install targets", async () => {
    await createAppInstall({ packageAppKey: "tasks", installId: "tasks", label: "Tasks" });

    const rejected = await postAdminJson<DomainMappingFailureResponse>(
      "/api/formless/domain-mappings",
      {
        host: "tasks.example.com",
        profile: "publicSite",
        targetInstallId: "tasks",
      },
    );
    const app = await postAdminJson<CreateInstanceDomainMappingResponse>(
      "/api/formless/domain-mappings",
      {
        host: "tasks.example.com",
        profile: "app",
        targetInstallId: "tasks",
      },
    );
    const instanceWithTarget = await postAdminJson<DomainMappingFailureResponse>(
      "/api/formless/domain-mappings",
      {
        host: "admin.example.com",
        profile: "instance",
        targetInstallId: "tasks",
      },
    );

    expect(rejected.response.status).toBe(400);
    expect(rejected.body).toMatchObject({
      code: "unsupported-install-package",
      field: "targetInstallId",
      mappings: [],
    });
    expect(app.response.status).toBe(201);
    expect(app.body.mapping).toMatchObject({
      host: "tasks.example.com",
      profile: "app",
      targetInstallId: "tasks",
      installId: "tasks",
    });
    expect(instanceWithTarget.response.status).toBe(400);
    expect(instanceWithTarget.body).toMatchObject({
      code: "invalid-install-id",
      field: "targetInstallId",
    });
  });

  it("requires instance write authorization for domain mapping creation when configured", async () => {
    await createAppInstall({ packageAppKey: "site", installId: "personal", label: "Personal" });

    const rejected = await harness.fetch("/api/formless/domain-mappings", {
      body: JSON.stringify({
        host: "example.com",
        surface: "site",
        installId: "personal",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(rejected.status).toBe(401);
    expect(rejected.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
    expect(await rejected.json()).toEqual({
      error: "Owner session or admin authorization is required for this write endpoint.",
    });
  });

  it("requires instance write authorization for domain mapping deletion when configured", async () => {
    await createAppInstall({ packageAppKey: "site", installId: "personal", label: "Personal" });
    await postAdminJson<CreateInstanceDomainMappingResponse>("/api/formless/domain-mappings", {
      host: "example.com",
      surface: "site",
      installId: "personal",
    });

    const rejected = await harness.fetch(
      "/api/formless/domain-mappings?host=example.com&profile=publicSite",
      {
        method: "DELETE",
      },
    );

    expect(rejected.status).toBe(401);
    expect(rejected.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
    expect(await rejected.json()).toEqual({
      error: "Owner session or admin authorization is required for this write endpoint.",
    });
  });

  it("records applied Cloudflare state and appends audit evidence", async () => {
    await createAppInstall({ packageAppKey: "site", installId: "personal", label: "Personal" });
    await postAdminJson<CreateInstanceDomainMappingResponse>("/api/formless/domain-mappings", {
      host: "example.com",
      surface: "site",
      installId: "personal",
    });

    const first = await postAdminJson<RecordInstanceDomainMappingApplyEvidenceResponse>(
      "/api/formless/domain-mappings/apply-evidence",
      {
        host: "Example.COM.",
        surface: "site",
        installId: "personal",
        provider: "cloudflare-worker-custom-domain",
        accountId: "account-123",
        zoneId: "zone-1",
        zoneName: "example.com",
        workerName: "personal-worker",
        workerDomainId: "domain-1",
        action: "created",
      },
    );
    const second = await postAdminJson<RecordInstanceDomainMappingApplyEvidenceResponse>(
      "/api/formless/domain-mappings/apply-evidence",
      {
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
      },
    );
    const after = await getJson<InstanceDomainMappingsResponse>("/api/formless/domain-mappings");

    expect(first.response.status).toBe(200);
    expect(first.body.appliedState).toMatchObject({
      host: "example.com",
      profile: "publicSite",
      targetInstallId: "personal",
      installId: "personal",
      provider: "cloudflare-worker-custom-domain",
      action: "created",
      workerDomainId: "domain-1",
    });
    expect(second.body.appliedState).toMatchObject({
      host: "example.com",
      action: "adopted",
    });
    expect(second.body.auditEvents.map((event) => event.action)).toEqual(["created", "adopted"]);
    expect(after.body.appliedStates).toEqual(second.body.appliedStates);
    expect(after.body.auditEvents).toEqual(second.body.auditEvents);
  });

  it("records instance profile applied state without requiring a Site install id", async () => {
    const created = await postAdminJson<CreateInstanceDomainMappingResponse>(
      "/api/formless/domain-mappings",
      {
        host: "admin.example.com",
        profile: "instance",
      },
    );
    const evidence = await postAdminJson<RecordInstanceDomainMappingApplyEvidenceResponse>(
      "/api/formless/domain-mappings/apply-evidence",
      {
        host: "admin.example.com",
        profile: "instance",
        provider: "cloudflare-worker-custom-domain",
        accountId: "account-123",
        zoneId: "zone-1",
        zoneName: "example.com",
        workerName: "personal-worker",
        workerDomainId: "domain-1",
        action: "created",
      },
    );

    expect(created.response.status).toBe(201);
    expect(created.body.mapping).toMatchObject({
      host: "admin.example.com",
      profile: "instance",
      enabled: true,
    });
    expect(evidence.response.status).toBe(200);
    expect(evidence.body.appliedState).toMatchObject({
      host: "admin.example.com",
      profile: "instance",
      provider: "cloudflare-worker-custom-domain",
    });
    expect(evidence.body.appliedState.targetInstallId).toBeUndefined();
    expect(evidence.body.appliedState.installId).toBeUndefined();
  });

  it("disables desired mappings while preserving applied state and audit events", async () => {
    await createAppInstall({ packageAppKey: "site", installId: "personal", label: "Personal" });
    await postAdminJson<CreateInstanceDomainMappingResponse>("/api/formless/domain-mappings", {
      host: "example.com",
      surface: "site",
      installId: "personal",
    });
    await postAdminJson<RecordInstanceDomainMappingApplyEvidenceResponse>(
      "/api/formless/domain-mappings/apply-evidence",
      {
        host: "example.com",
        surface: "site",
        installId: "personal",
        provider: "cloudflare-worker-custom-domain",
        accountId: "account-123",
        zoneId: "zone-1",
        zoneName: "example.com",
        workerName: "personal-worker",
        workerDomainId: "domain-1",
        action: "created",
      },
    );

    const deleted = await deleteAdminJson<CreateInstanceDomainMappingResponse>(
      "/api/formless/domain-mappings?host=EXAMPLE.COM.&profile=publicSite",
    );
    const lookup = await getJson<InstanceDomainMappingLookupResponse>(
      "/api/formless/domain-mappings/lookup?host=example.com&profile=publicSite",
    );
    const after = await getJson<InstanceDomainMappingsResponse>("/api/formless/domain-mappings");

    expect(deleted.response.status).toBe(200);
    expect(deleted.body.mapping).toMatchObject({
      host: "example.com",
      profile: "publicSite",
      enabled: false,
    });
    expect(lookup.body.mapping).toBeNull();
    expect(after.body.appliedStates).toHaveLength(1);
    expect(after.body.auditEvents).toHaveLength(1);
  });

  it("requires instance write authorization for apply evidence", async () => {
    const rejected = await harness.fetch("/api/formless/domain-mappings/apply-evidence", {
      body: JSON.stringify({
        host: "example.com",
        surface: "site",
        installId: "personal",
        provider: "cloudflare-worker-custom-domain",
        accountId: "account-123",
        zoneId: "zone-1",
        zoneName: "example.com",
        workerName: "personal-worker",
        workerDomainId: "domain-1",
        action: "created",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(rejected.status).toBe(401);
    expect(await rejected.json()).toEqual({
      error: "Owner session or admin authorization is required for this write endpoint.",
    });
  });
});

async function createAppInstall(input: {
  packageAppKey: string;
  installId: string;
  label: string;
}) {
  return postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", input);
}

async function getJson<T>(path: string) {
  const response = await harness.fetch(path);

  expect(response.status).toBe(200);

  return {
    body: (await response.json()) as T,
    response,
  };
}

async function postAdminJson<T>(path: string, body: unknown) {
  const response = await harness.fetch(path, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  return {
    body: (await response.json()) as T,
    response,
  };
}

async function deleteAdminJson<T>(path: string) {
  const response = await harness.fetch(path, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
    method: "DELETE",
  });

  return {
    body: (await response.json()) as T,
    response,
  };
}
