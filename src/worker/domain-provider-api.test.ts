import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  INSTANCE_DOMAIN_PROVIDER_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_APPLY_JOBS_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH,
  type InstanceDomainProviderApplyJobResponse,
  type InstanceDomainProviderApplyResponse,
  type InstanceDomainProviderPlanResponse,
} from "../shared/domain-provider-api.ts";
import type { CreateInstanceDomainMappingResponse } from "../shared/instance-domain-mappings.ts";
import type { InstanceDomainMappingsResponse } from "../shared/instance-domain-mappings.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";
const cloudflareToken = "secret-cloudflare-token";
const alchemyPassword = "secret-alchemy-password";

let harness: Harness;

afterEach(async () => {
  await harness.dispose();
});

describe("instance domain provider API routes", () => {
  beforeEach(async () => {
    harness = await createHarness({
      ALCHEMY_PASSWORD: alchemyPassword,
      CLOUDFLARE_API_TOKEN: cloudflareToken,
      FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID: "account-123",
      FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID: "primary",
      FORMLESS_DOMAIN_PROVIDER_WORKER_NAME: "formless-primary",
      FORMLESS_DOMAIN_PROVIDER_ZONES: JSON.stringify([{ id: "zone-1", name: "example.com" }]),
    });
  });

  it("returns dry-run provider config and plan without exposing provider secrets", async () => {
    await postAdminJson<CreateInstanceDomainMappingResponse>("/api/formless/domain-mappings", {
      host: "admin.example.com",
      profile: "instance",
    });

    const response = await getJson<InstanceDomainProviderPlanResponse>(
      INSTANCE_DOMAIN_PROVIDER_API_PATH,
    );
    const serialized = JSON.stringify(response.body);

    expect(response.body.config).toMatchObject({
      accountId: "account-123",
      alchemyPassword: { configured: true },
      applyReady: true,
      cloudflareApiToken: { configured: true },
      instanceId: "primary",
      issues: [],
      planReady: true,
      workerName: "formless-primary",
    });
    expect(response.body.plan.blockers).toEqual([]);
    expect(response.body.plan.resources).toEqual([
      expect.objectContaining({
        host: "admin.example.com",
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-custom-domain-admin-example-com-instance",
        props: expect.objectContaining({
          workerName: "formless-primary",
          zoneId: "zone-1",
        }),
      }),
    ]);
    expect(serialized).not.toContain(cloudflareToken);
    expect(serialized).not.toContain(alchemyPassword);
  });

  it("requires owner or admin authorization for apply", async () => {
    const response = await harness.fetch(INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH, {
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
    expect(await response.json()).toEqual({
      error: "Owner session or admin authorization is required for this write endpoint.",
    });
  });

  it("reports missing provider config as actionable apply status", async () => {
    await harness.dispose();
    harness = await createHarness({});

    const plan = await getJson<InstanceDomainProviderPlanResponse>(
      INSTANCE_DOMAIN_PROVIDER_API_PATH,
    );
    const apply = await postAdminJson<InstanceDomainProviderApplyResponse>(
      INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH,
      {},
    );

    expect(plan.body.config.applyReady).toBe(false);
    expect(plan.body.config.issues.map((issue) => issue.code)).toEqual([
      "missing-instance-id",
      "missing-worker-name",
      "missing-account-id",
      "missing-cloudflare-api-token",
      "missing-alchemy-password",
      "missing-zone-config",
    ]);
    expect(apply.response.status).toBe(409);
    expect(apply.body).toMatchObject({
      code: "domain-provider-apply-not-configured",
      status: "blocked",
    });
    expect(JSON.stringify(apply.body)).not.toContain(cloudflareToken);
    expect(JSON.stringify(apply.body)).not.toContain(alchemyPassword);
  });

  it("serializes a reviewed apply job and records runner evidence", async () => {
    await postAdminJson<CreateInstanceDomainMappingResponse>("/api/formless/domain-mappings", {
      host: "admin.example.com",
      profile: "instance",
    });

    const apply = await postAdminJson<InstanceDomainProviderApplyResponse>(
      INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH,
      { runnerId: "runner-1" },
    );

    expect(apply.response.status).toBe(202);
    expect(apply.body).toMatchObject({
      code: "domain-provider-apply-job-ready",
      status: "ready",
    });
    expect(JSON.stringify(apply.body)).not.toContain(cloudflareToken);
    expect(JSON.stringify(apply.body)).not.toContain(alchemyPassword);

    if (apply.body.status !== "ready") {
      throw new Error("Apply did not create a job.");
    }

    const job = apply.body.job;
    const resource = job.plan.resources[0];

    if (resource?.kind !== "cloudflare-worker-custom-domain") {
      throw new Error("Expected a CustomDomain job resource.");
    }

    expect(job).toMatchObject({
      runnerId: "runner-1",
      status: "ready",
    });

    const status = await getJson<InstanceDomainProviderApplyJobResponse>(
      `${INSTANCE_DOMAIN_PROVIDER_APPLY_JOBS_API_PATH}/${job.jobId}`,
    );

    expect(status.body.job).toMatchObject({
      jobId: job.jobId,
      status: "ready",
    });

    const concurrent = await postAdminJson<InstanceDomainProviderApplyResponse>(
      INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH,
      { runnerId: "runner-2" },
    );

    expect(concurrent.response.status).toBe(409);
    expect(concurrent.body).toMatchObject({
      code: "domain-provider-apply-running",
      status: "blocked",
    });

    const completion = await postAdminJson<InstanceDomainProviderApplyJobResponse>(
      `${INSTANCE_DOMAIN_PROVIDER_APPLY_JOBS_API_PATH}/${job.jobId}/result`,
      {
        resources: [
          {
            accountId: "account-123",
            action: "created",
            alchemyResourceId: resource.logicalId,
            host: resource.host,
            kind: resource.kind,
            logicalId: resource.logicalId,
            profile: resource.profile,
            workerDomainId: "custom-domain-123",
            workerName: resource.props.workerName,
            zoneId: resource.zone.id,
            zoneName: resource.zone.name,
          },
        ],
        runnerId: "runner-1",
        status: "succeeded",
      },
    );

    expect(completion.body.job).toMatchObject({
      result: { evidenceCount: 1 },
      status: "succeeded",
    });

    const mappings = await getJson<InstanceDomainMappingsResponse>("/api/formless/domain-mappings");

    expect(mappings.body.appliedStates).toEqual([
      expect.objectContaining({
        action: "created",
        alchemyResourceId: resource.logicalId,
        host: "admin.example.com",
        profile: "instance",
        runnerId: "runner-1",
        workerDomainId: "custom-domain-123",
      }),
    ]);
  });
});

async function createHarness(bindings: Record<string, string>) {
  return createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        ...bindings,
      },
    },
  );
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
