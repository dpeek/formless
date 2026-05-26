import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  INSTANCE_DOMAIN_PROVIDER_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH,
  type InstanceDomainProviderApplyResponse,
  type InstanceDomainProviderPlanResponse,
} from "../shared/domain-provider-api.ts";
import type { CreateInstanceDomainMappingResponse } from "../shared/instance-domain-mappings.ts";
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

  it("keeps apply bounded and token-free until the Alchemy executor chunk", async () => {
    const [left, right] = await Promise.all([
      postAdminJson<InstanceDomainProviderApplyResponse>(
        INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH,
        {},
      ),
      postAdminJson<InstanceDomainProviderApplyResponse>(
        INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH,
        {},
      ),
    ]);
    const responses = [left, right].sort((a, b) => a.response.status - b.response.status);

    expect(responses.map((response) => response.response.status)).toEqual([501, 501]);
    expect(responses.map((response) => response.body)).toEqual([
      expect.objectContaining({
        code: "domain-provider-apply-executor-missing",
        status: "not-implemented",
      }),
      expect.objectContaining({
        code: "domain-provider-apply-executor-missing",
        status: "not-implemented",
      }),
    ]);
    expect(JSON.stringify(responses.map((response) => response.body))).not.toContain(
      cloudflareToken,
    );
    expect(JSON.stringify(responses.map((response) => response.body))).not.toContain(
      alchemyPassword,
    );
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
