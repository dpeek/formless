import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  INSTANCE_DOMAIN_PROVIDER_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_APPLY_JOBS_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_DELETE_JOBS_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_DELETE_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_MANUAL_CLEANUP_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_REDIRECTS_FORGET_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_REDIRECTS_API_PATH,
  type ForgetInstanceDomainProviderRedirectIntentResponse,
  type InstanceDomainProviderApplyJobResponse,
  type InstanceDomainProviderApplyResponse,
  type InstanceDomainProviderDeleteJobResponse,
  type InstanceDomainProviderDeleteResponse,
  type InstanceDomainProviderManualCleanupResponse,
  type InstanceDomainProviderPlanResponse,
  type InstanceDomainProviderRedirectsResponse,
} from "../shared/domain-provider-api.ts";
import {
  INSTANCE_DEPLOYMENT_STATUS_API_PATH,
  type InstanceDeploymentStatusResponse,
} from "../shared/deployment-runtime.ts";
import { INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX } from "../shared/instance-control-plane.ts";
import type { CreateInstanceDomainMappingResponse } from "../shared/instance-domain-mappings.ts";
import type { InstanceDomainMappingsResponse } from "../shared/instance-domain-mappings.ts";
import type { BootstrapResponse } from "../shared/protocol.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

type DomainProviderFailureResponse = {
  code?: string;
  error: string;
};

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
      jobReady: true,
      planReady: true,
      runnerMutation: {
        checkedBy: "node-runner",
        requiredEnvNames: expect.arrayContaining([
          "ALCHEMY_PASSWORD",
          "ALCHEMY_STATE_TOKEN",
          "CLOUDFLARE_API_TOKEN",
        ]),
      },
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

  it("requires owner or admin authorization for manual provider cleanup", async () => {
    const response = await harness.fetch(INSTANCE_DOMAIN_PROVIDER_MANUAL_CLEANUP_API_PATH, {
      body: JSON.stringify({
        host: "admin.example.com",
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-custom-domain-admin-example-com-instance",
      }),
      headers: { "Content-Type": "application/json" },
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
    expect(plan.body.config.jobReady).toBe(false);
    expect(plan.body.config.issues.map((issue) => issue.code)).toEqual([
      "missing-instance-id",
      "missing-worker-name",
      "missing-account-id",
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

  it("creates apply and delete jobs without Worker-held runner secrets", async () => {
    await harness.dispose();
    harness = await createHarness({
      FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID: "account-123",
      FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID: "primary",
      FORMLESS_DOMAIN_PROVIDER_WORKER_NAME: "formless-primary",
      FORMLESS_DOMAIN_PROVIDER_ZONES: JSON.stringify([{ id: "zone-1", name: "example.com" }]),
    });

    await postAdminJson<CreateInstanceDomainMappingResponse>("/api/formless/domain-mappings", {
      host: "admin.example.com",
      profile: "instance",
    });

    const plan = await getJson<InstanceDomainProviderPlanResponse>(
      INSTANCE_DOMAIN_PROVIDER_API_PATH,
    );

    expect(plan.body.config).toMatchObject({
      accountId: "account-123",
      alchemyPassword: { configured: false },
      applyReady: true,
      cloudflareApiToken: { configured: false },
      issues: [],
      jobReady: true,
      planReady: true,
    });
    expect(plan.body.plan.blockers).toEqual([]);

    const apply = await postAdminJson<InstanceDomainProviderApplyResponse>(
      INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH,
      { runnerId: "runner-with-external-secrets" },
    );

    expect(apply.response.status).toBe(202);

    if (apply.body.status !== "ready") {
      throw new Error("Apply did not create a job without Worker-held runner secrets.");
    }

    const resource = apply.body.job.plan.resources[0];

    if (resource?.kind !== "cloudflare-worker-custom-domain") {
      throw new Error("Expected a CustomDomain job resource.");
    }

    await postAdminJson<InstanceDomainProviderApplyJobResponse>(
      `${INSTANCE_DOMAIN_PROVIDER_APPLY_JOBS_API_PATH}/${apply.body.job.jobId}/result`,
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
        runnerId: "runner-with-external-secrets",
        status: "succeeded",
      },
    );

    const deleteJob = await postAdminJson<InstanceDomainProviderDeleteResponse>(
      INSTANCE_DOMAIN_PROVIDER_DELETE_API_PATH,
      {
        host: "admin.example.com",
        kind: "cloudflare-worker-custom-domain",
        runnerId: "runner-delete-with-external-secrets",
      },
    );

    expect(deleteJob.response.status).toBe(202);
    expect(deleteJob.body).toMatchObject({
      code: "domain-provider-delete-job-ready",
      status: "ready",
      targets: [
        expect.objectContaining({
          host: "admin.example.com",
          kind: "cloudflare-worker-custom-domain",
          resourceId: "custom-domain-123",
        }),
      ],
    });
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

    const deployed = await getJson<InstanceDeploymentStatusResponse>(
      INSTANCE_DEPLOYMENT_STATUS_API_PATH,
    );

    expect(deployed.body.status).toMatchObject({
      latestDesiredState: {
        targetId: "instance.primary",
        versionId: "desired.instance.primary.1",
      },
      state: "deployed",
      targetId: "instance.primary",
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

    await deleteAdminJson("/api/formless/domain-mappings?host=admin.example.com&profile=instance");
    const afterDesiredDelete = await getJson<InstanceDomainMappingsResponse>(
      "/api/formless/domain-mappings",
    );

    expect(afterDesiredDelete.body.mappings).toEqual([
      expect.objectContaining({ enabled: false, host: "admin.example.com" }),
    ]);
    expect(afterDesiredDelete.body.appliedStates).toHaveLength(1);

    const deleteJob = await postAdminJson<InstanceDomainProviderDeleteResponse>(
      INSTANCE_DOMAIN_PROVIDER_DELETE_API_PATH,
      {
        host: "admin.example.com",
        kind: "cloudflare-worker-custom-domain",
        runnerId: "runner-delete",
      },
    );

    expect(deleteJob.response.status).toBe(202);

    if (deleteJob.body.status !== "ready") {
      throw new Error("Delete did not create a job.");
    }

    expect(Object.keys(deleteJob.body.job).sort()).toEqual([
      "createdAt",
      "jobId",
      "plan",
      "runnerId",
      "status",
      "targets",
      "updatedAt",
    ]);
    expect(JSON.stringify(deleteJob.body)).not.toContain("lease:");

    const cleanupStatus = await getJson<InstanceDeploymentStatusResponse>(
      INSTANCE_DEPLOYMENT_STATUS_API_PATH,
    );

    expect(cleanupStatus.body.status).toMatchObject({
      actor: {
        actorId: "domain-provider.delete",
        kind: "runner",
        runnerId: "runner-delete",
      },
      mode: "destroy",
      state: "in-progress",
      targetId: "instance.primary",
    });

    expect(deleteJob.body.targets).toEqual([
      expect.objectContaining({
        host: "admin.example.com",
        kind: "cloudflare-worker-custom-domain",
        resourceId: "custom-domain-123",
      }),
    ]);

    const deleteCompletion = await postAdminJson<InstanceDomainProviderDeleteJobResponse>(
      `${INSTANCE_DOMAIN_PROVIDER_DELETE_JOBS_API_PATH}/${deleteJob.body.job.jobId}/result`,
      {
        resources: deleteJob.body.targets.map((target) => ({
          action: "deleted",
          host: target.host,
          kind: target.kind,
          logicalId: target.logicalId,
        })),
        runnerId: "runner-delete",
        status: "succeeded",
      },
    );
    const afterProviderDelete = await getJson<InstanceDomainMappingsResponse>(
      "/api/formless/domain-mappings",
    );

    expect(deleteCompletion.body.job).toMatchObject({
      result: { evidenceCount: 1 },
      status: "succeeded",
    });
    expect(afterProviderDelete.body.mappings).toEqual([
      expect.objectContaining({ enabled: false, host: "admin.example.com" }),
    ]);
    expect(afterProviderDelete.body.appliedStates).toEqual([]);
    expect(afterProviderDelete.body.auditEvents.map((event) => event.action)).toEqual([
      "created",
      "deleted",
    ]);

    const cleanupDeployed = await getJson<InstanceDeploymentStatusResponse>(
      INSTANCE_DEPLOYMENT_STATUS_API_PATH,
    );

    expect(cleanupDeployed.body.status).toMatchObject({
      latestDesiredState: {
        revision: 2,
        targetId: "instance.primary",
        versionId: "desired.instance.primary.2",
      },
      state: "deployed",
      targetId: "instance.primary",
    });
  });

  it("bridges apply job creation to a deployment attempt without changing apply response shape", async () => {
    await postAdminJson<CreateInstanceDomainMappingResponse>("/api/formless/domain-mappings", {
      host: "bridge.example.com",
      profile: "instance",
    });

    const apply = await postAdminJson<InstanceDomainProviderApplyResponse>(
      INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH,
      { runnerId: "runner-bridge" },
    );

    expect(apply.response.status).toBe(202);
    expect(apply.body).toMatchObject({
      code: "domain-provider-apply-job-ready",
      status: "ready",
    });

    if (apply.body.status !== "ready") {
      throw new Error("Apply did not create a job.");
    }

    expect(Object.keys(apply.body.job).sort()).toEqual([
      "createdAt",
      "jobId",
      "plan",
      "runnerId",
      "status",
      "updatedAt",
    ]);
    expect(JSON.stringify(apply.body)).not.toContain("lease:");

    const deployment = await getJson<InstanceDeploymentStatusResponse>(
      INSTANCE_DEPLOYMENT_STATUS_API_PATH,
    );

    expect(deployment.body.status).toMatchObject({
      actor: {
        actorId: "domain-provider.apply",
        kind: "runner",
        runnerId: "runner-bridge",
      },
      mode: "apply",
      state: "in-progress",
      targetId: "instance.primary",
    });

    if (deployment.body.status.state !== "in-progress") {
      throw new Error("Domain provider apply did not start a deployment attempt.");
    }

    expect(deployment.body.status.attemptId).toMatch(/^attempt\.[a-f0-9-]{36}$/);
    expect(deployment.body.status.desiredState).toMatchObject({
      revision: 1,
      targetId: "instance.primary",
      versionId: "desired.instance.primary.1",
    });

    const failure = await postAdminJson<InstanceDomainProviderApplyJobResponse>(
      `${INSTANCE_DOMAIN_PROVIDER_APPLY_JOBS_API_PATH}/${apply.body.job.jobId}/result`,
      {
        error: "Cloudflare rejected the custom domain.",
        runnerId: "runner-bridge",
        status: "failed",
      },
    );
    const failedDeployment = await getJson<InstanceDeploymentStatusResponse>(
      INSTANCE_DEPLOYMENT_STATUS_API_PATH,
    );

    expect(failure.body.job).toMatchObject({
      result: {
        error: "Cloudflare rejected the custom domain.",
        evidenceCount: 0,
      },
      status: "failed",
    });
    expect(Object.keys(failure.body.job).sort()).toEqual([
      "createdAt",
      "jobId",
      "plan",
      "result",
      "runnerId",
      "status",
      "updatedAt",
    ]);
    expect(failedDeployment.body.status).toMatchObject({
      state: "failed-current-version",
      summary: {
        code: "domain-provider-apply-failed",
        displayMessage: "Cloudflare rejected the custom domain.",
      },
      targetId: "instance.primary",
    });
  });

  it("marks manually removed CustomDomain evidence without Cloudflare credentials", async () => {
    await harness.dispose();
    harness = await createHarness({
      FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID: "account-123",
      FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID: "primary",
      FORMLESS_DOMAIN_PROVIDER_WORKER_NAME: "formless-primary",
      FORMLESS_DOMAIN_PROVIDER_ZONES: JSON.stringify([{ id: "zone-1", name: "example.com" }]),
    });

    await postAdminJson<CreateInstanceDomainMappingResponse>("/api/formless/domain-mappings", {
      host: "manual.example.com",
      profile: "instance",
    });

    const apply = await postAdminJson<InstanceDomainProviderApplyResponse>(
      INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH,
      { host: "manual.example.com", runnerId: "runner-1" },
    );

    if (apply.body.status !== "ready") {
      throw new Error("Apply did not create a CustomDomain job.");
    }

    const resource = apply.body.job.plan.resources[0];

    if (resource?.kind !== "cloudflare-worker-custom-domain") {
      throw new Error("Expected a CustomDomain job resource.");
    }

    await postAdminJson<InstanceDomainProviderApplyJobResponse>(
      `${INSTANCE_DOMAIN_PROVIDER_APPLY_JOBS_API_PATH}/${apply.body.job.jobId}/result`,
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
    await deleteAdminJson("/api/formless/domain-mappings?host=manual.example.com&profile=instance");

    const unrelated = await postAdminJson<DomainProviderFailureResponse>(
      INSTANCE_DOMAIN_PROVIDER_MANUAL_CLEANUP_API_PATH,
      {
        host: "manual.example.com",
        kind: "cloudflare-worker-custom-domain",
        logicalId: "unrelated-resource",
      },
    );
    const stillApplied = await getJson<InstanceDomainMappingsResponse>(
      "/api/formless/domain-mappings",
    );

    expect(unrelated.response.status).toBe(404);
    expect(unrelated.body).toMatchObject({
      code: "domain-provider-manual-cleanup-not-found",
    });
    expect(stillApplied.body.appliedStates).toHaveLength(1);

    const cleanup = await postAdminJson<InstanceDomainProviderManualCleanupResponse>(
      INSTANCE_DOMAIN_PROVIDER_MANUAL_CLEANUP_API_PATH,
      {
        host: "manual.example.com",
        kind: "cloudflare-worker-custom-domain",
        logicalId: resource.logicalId,
      },
    );
    const after = await getJson<InstanceDomainMappingsResponse>("/api/formless/domain-mappings");

    expect(cleanup.response.status).toBe(200);
    expect(cleanup.body).toMatchObject({
      action: "manually-removed",
      status: "cleaned",
      target: expect.objectContaining({
        host: "manual.example.com",
        kind: "cloudflare-worker-custom-domain",
        logicalId: resource.logicalId,
      }),
    });
    expect(after.body.appliedStates).toEqual([]);
    expect(after.body.auditEvents.map((event) => event.action)).toEqual([
      "created",
      "manually-removed",
    ]);
  });

  it("stores redirect intents, plans redirect resources, and records runner evidence", async () => {
    const created = await postAdminJson<InstanceDomainProviderRedirectsResponse>(
      INSTANCE_DOMAIN_PROVIDER_REDIRECTS_API_PATH,
      {
        fromHost: "WWW.Example.COM.",
        toHost: "example.com",
      },
    );
    const plan = await getJson<InstanceDomainProviderPlanResponse>(
      INSTANCE_DOMAIN_PROVIDER_API_PATH,
    );

    expect(created.response.status).toBe(201);
    expect(plan.body.redirectIntents).toEqual([
      expect.objectContaining({
        enabled: true,
        fromHost: "www.example.com",
        preservePath: true,
        preserveQueryString: true,
        statusCode: 301,
        toHost: "example.com",
      }),
    ]);
    expect(plan.body.plan.resources.map((resource) => resource.kind)).toEqual([
      "cloudflare-dns-records",
      "cloudflare-redirect-rule",
    ]);
    const controlPlaneIntent = await getJson<BootstrapResponse>(
      `${INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX}/bootstrap`,
    );

    expect(controlPlaneIntent.body.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: "route",
          id: "route:redirect:www.example.com",
          values: expect.objectContaining({
            enabled: true,
            matchHost: "www.example.com",
            preservePath: true,
            preserveQueryString: true,
            statusCode: "301",
            toHost: "example.com",
          }),
        }),
      ]),
    );

    const apply = await postAdminJson<InstanceDomainProviderApplyResponse>(
      INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH,
      { runnerId: "runner-redirects" },
    );

    if (apply.body.status !== "ready") {
      throw new Error("Apply did not create a redirect job.");
    }

    const dns = apply.body.job.plan.resources.find(
      (resource) => resource.kind === "cloudflare-dns-records",
    );
    const redirect = apply.body.job.plan.resources.find(
      (resource) => resource.kind === "cloudflare-redirect-rule",
    );

    if (!dns || !redirect) {
      throw new Error("Expected DNS and redirect resources.");
    }

    const completion = await postAdminJson<InstanceDomainProviderApplyJobResponse>(
      `${INSTANCE_DOMAIN_PROVIDER_APPLY_JOBS_API_PATH}/${apply.body.job.jobId}/result`,
      {
        resources: [
          {
            accountId: "account-123",
            action: "created",
            alchemyResourceId: dns.logicalId,
            dnsRecordIds: ["dns-1"],
            host: "www.example.com",
            kind: "cloudflare-dns-records",
            logicalId: dns.logicalId,
            zoneId: dns.zone.id,
            zoneName: dns.zone.name,
          },
          {
            accountId: "account-123",
            action: "created",
            alchemyResourceId: redirect.logicalId,
            host: "www.example.com",
            kind: "cloudflare-redirect-rule",
            logicalId: redirect.logicalId,
            preserveQueryString: redirect.props.preserveQueryString,
            redirectRuleId: "rule-1",
            redirectRulesetId: "ruleset-1",
            statusCode: redirect.props.statusCode,
            targetUrl: redirect.targetUrl,
            zoneId: redirect.zone.id,
            zoneName: redirect.zone.name,
          },
        ],
        runnerId: "runner-redirects",
        status: "succeeded",
      },
    );
    const redirects = await getJson<InstanceDomainProviderRedirectsResponse>(
      INSTANCE_DOMAIN_PROVIDER_REDIRECTS_API_PATH,
    );

    expect(completion.body.job).toMatchObject({
      result: { evidenceCount: 2 },
      status: "succeeded",
    });
    expect(redirects.body.appliedResources.map((resource) => resource.kind)).toEqual([
      "cloudflare-dns-records",
      "cloudflare-redirect-rule",
    ]);
    expect(redirects.body.auditEvents).toHaveLength(2);

    const disabled = await harness.fetch(
      `${INSTANCE_DOMAIN_PROVIDER_REDIRECTS_API_PATH}?fromHost=www.example.com`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
        method: "DELETE",
      },
    );
    const afterDesiredDelete = await getJson<InstanceDomainProviderRedirectsResponse>(
      INSTANCE_DOMAIN_PROVIDER_REDIRECTS_API_PATH,
    );

    expect(disabled.status).toBe(200);
    expect(afterDesiredDelete.body.redirectIntents).toEqual([
      expect.objectContaining({ enabled: false, fromHost: "www.example.com" }),
    ]);
    expect(afterDesiredDelete.body.appliedResources).toHaveLength(2);

    const deleteJob = await postAdminJson<InstanceDomainProviderDeleteResponse>(
      INSTANCE_DOMAIN_PROVIDER_DELETE_API_PATH,
      { host: "www.example.com", runnerId: "runner-delete-redirects" },
    );

    expect(deleteJob.response.status).toBe(202);

    if (deleteJob.body.status !== "ready") {
      throw new Error("Redirect delete did not create a job.");
    }

    expect(deleteJob.body.targets.map((target) => target.kind)).toEqual([
      "cloudflare-dns-records",
      "cloudflare-redirect-rule",
    ]);

    await postAdminJson<InstanceDomainProviderDeleteJobResponse>(
      `${INSTANCE_DOMAIN_PROVIDER_DELETE_JOBS_API_PATH}/${deleteJob.body.job.jobId}/result`,
      {
        resources: deleteJob.body.targets.map((target) => ({
          action: "deleted",
          host: target.host,
          kind: target.kind,
          logicalId: target.logicalId,
        })),
        runnerId: "runner-delete-redirects",
        status: "succeeded",
      },
    );

    const afterProviderDelete = await getJson<InstanceDomainProviderRedirectsResponse>(
      INSTANCE_DOMAIN_PROVIDER_REDIRECTS_API_PATH,
    );

    expect(afterProviderDelete.body.appliedResources).toEqual([]);
    expect(afterProviderDelete.body.auditEvents.map((event) => event.action)).toEqual([
      "created",
      "created",
      "deleted",
      "deleted",
    ]);

    const controlPlaneHistory = await getJson<BootstrapResponse>(
      `${INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX}/bootstrap?actorKind=runner`,
    );

    expect(controlPlaneHistory.body.records.map((record) => record.entity)).not.toContain(
      "deploy-attempt",
    );
    expect(controlPlaneHistory.body.records.map((record) => record.entity)).not.toContain(
      "deploy-evidence-summary",
    );
  });

  it("marks manually removed redirect and DNS evidence without Cloudflare credentials", async () => {
    await harness.dispose();
    harness = await createHarness({
      FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID: "account-123",
      FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID: "primary",
      FORMLESS_DOMAIN_PROVIDER_WORKER_NAME: "formless-primary",
      FORMLESS_DOMAIN_PROVIDER_ZONES: JSON.stringify([{ id: "zone-1", name: "example.com" }]),
    });

    await postAdminJson<InstanceDomainProviderRedirectsResponse>(
      INSTANCE_DOMAIN_PROVIDER_REDIRECTS_API_PATH,
      {
        fromHost: "manual-redirect.example.com",
        toHost: "example.com",
      },
    );

    const apply = await postAdminJson<InstanceDomainProviderApplyResponse>(
      INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH,
      { host: "manual-redirect.example.com", runnerId: "runner-redirects" },
    );

    if (apply.body.status !== "ready") {
      throw new Error("Apply did not create a redirect job.");
    }

    const dns = apply.body.job.plan.resources.find(
      (resource) => resource.kind === "cloudflare-dns-records",
    );
    const redirect = apply.body.job.plan.resources.find(
      (resource) => resource.kind === "cloudflare-redirect-rule",
    );

    if (!dns || !redirect) {
      throw new Error("Expected DNS and redirect resources.");
    }

    await postAdminJson<InstanceDomainProviderApplyJobResponse>(
      `${INSTANCE_DOMAIN_PROVIDER_APPLY_JOBS_API_PATH}/${apply.body.job.jobId}/result`,
      {
        resources: [
          {
            accountId: "account-123",
            action: "created",
            alchemyResourceId: dns.logicalId,
            dnsRecordIds: ["dns-1"],
            host: "manual-redirect.example.com",
            kind: "cloudflare-dns-records",
            logicalId: dns.logicalId,
            zoneId: dns.zone.id,
            zoneName: dns.zone.name,
          },
          {
            accountId: "account-123",
            action: "created",
            alchemyResourceId: redirect.logicalId,
            host: "manual-redirect.example.com",
            kind: "cloudflare-redirect-rule",
            logicalId: redirect.logicalId,
            preserveQueryString: redirect.props.preserveQueryString,
            redirectRuleId: "rule-1",
            redirectRulesetId: "ruleset-1",
            statusCode: redirect.props.statusCode,
            targetUrl: redirect.targetUrl,
            zoneId: redirect.zone.id,
            zoneName: redirect.zone.name,
          },
        ],
        runnerId: "runner-redirects",
        status: "succeeded",
      },
    );
    await deleteAdminJson<InstanceDomainProviderRedirectsResponse>(
      `${INSTANCE_DOMAIN_PROVIDER_REDIRECTS_API_PATH}?fromHost=manual-redirect.example.com`,
    );

    for (const resource of [dns, redirect]) {
      const cleanup = await postAdminJson<InstanceDomainProviderManualCleanupResponse>(
        INSTANCE_DOMAIN_PROVIDER_MANUAL_CLEANUP_API_PATH,
        {
          host: "manual-redirect.example.com",
          kind: resource.kind,
          logicalId: resource.logicalId,
        },
      );

      expect(cleanup.response.status).toBe(200);
      expect(cleanup.body).toMatchObject({
        action: "manually-removed",
        target: expect.objectContaining({
          host: "manual-redirect.example.com",
          kind: resource.kind,
          logicalId: resource.logicalId,
        }),
      });
    }

    const after = await getJson<InstanceDomainProviderRedirectsResponse>(
      INSTANCE_DOMAIN_PROVIDER_REDIRECTS_API_PATH,
    );

    expect(after.body.appliedResources).toEqual([]);
    expect(after.body.auditEvents.map((event) => event.action)).toEqual([
      "created",
      "created",
      "manually-removed",
      "manually-removed",
    ]);
  });

  it("forgets disabled redirect intents with no provider evidence and records cleanup audit", async () => {
    await postAdminJson<InstanceDomainProviderRedirectsResponse>(
      INSTANCE_DOMAIN_PROVIDER_REDIRECTS_API_PATH,
      {
        enabled: false,
        fromHost: "Draft.Example.COM.",
        toHost: "example.com",
      },
    );

    const forgotten = await deleteAdminJson<ForgetInstanceDomainProviderRedirectIntentResponse>(
      `${INSTANCE_DOMAIN_PROVIDER_REDIRECTS_FORGET_API_PATH}?fromHost=draft.example.com`,
    );
    const after = await getJson<InstanceDomainProviderRedirectsResponse>(
      INSTANCE_DOMAIN_PROVIDER_REDIRECTS_API_PATH,
    );

    expect(forgotten.response.status).toBe(200);
    expect(forgotten.body.redirectIntent).toMatchObject({
      enabled: false,
      fromHost: "draft.example.com",
      toHost: "example.com",
    });
    expect(forgotten.body.redirectIntents).toEqual([]);
    expect(forgotten.body.redirectIntentCleanupEvent).toMatchObject({
      action: "forgotten",
      enabled: false,
      fromHost: "draft.example.com",
      reason: "disabled-unapplied",
      toHost: "example.com",
    });
    expect(after.body.redirectIntents).toEqual([]);
    expect(after.body.redirectIntentCleanupEvents).toEqual(
      forgotten.body.redirectIntentCleanupEvents,
    );
  });

  it("rejects redirect intent forget for enabled rows or rows with provider evidence", async () => {
    await postAdminJson<InstanceDomainProviderRedirectsResponse>(
      INSTANCE_DOMAIN_PROVIDER_REDIRECTS_API_PATH,
      {
        fromHost: "enabled.example.com",
        toHost: "example.com",
      },
    );

    const enabled = await deleteAdminJsonAllowingFailure<DomainProviderFailureResponse>(
      `${INSTANCE_DOMAIN_PROVIDER_REDIRECTS_FORGET_API_PATH}?fromHost=enabled.example.com`,
    );

    expect(enabled.response.status).toBe(409);
    expect(enabled.body).toMatchObject({
      code: "domain-provider-redirect-enabled",
    });

    await postAdminJson<InstanceDomainProviderRedirectsResponse>(
      INSTANCE_DOMAIN_PROVIDER_REDIRECTS_API_PATH,
      {
        fromHost: "applied.example.com",
        toHost: "example.com",
      },
    );

    const apply = await postAdminJson<InstanceDomainProviderApplyResponse>(
      INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH,
      { host: "applied.example.com", runnerId: "runner-redirects" },
    );

    if (apply.body.status !== "ready") {
      throw new Error("Apply did not create a redirect job.");
    }

    const dns = apply.body.job.plan.resources.find(
      (resource) => resource.kind === "cloudflare-dns-records",
    );
    const redirect = apply.body.job.plan.resources.find(
      (resource) => resource.kind === "cloudflare-redirect-rule",
    );

    if (!dns || !redirect) {
      throw new Error("Expected DNS and redirect resources.");
    }

    await postAdminJson<InstanceDomainProviderApplyJobResponse>(
      `${INSTANCE_DOMAIN_PROVIDER_APPLY_JOBS_API_PATH}/${apply.body.job.jobId}/result`,
      {
        resources: [
          {
            accountId: "account-123",
            action: "created",
            alchemyResourceId: dns.logicalId,
            dnsRecordIds: ["dns-1"],
            host: "applied.example.com",
            kind: "cloudflare-dns-records",
            logicalId: dns.logicalId,
            zoneId: dns.zone.id,
            zoneName: dns.zone.name,
          },
          {
            accountId: "account-123",
            action: "created",
            alchemyResourceId: redirect.logicalId,
            host: "applied.example.com",
            kind: "cloudflare-redirect-rule",
            logicalId: redirect.logicalId,
            preserveQueryString: redirect.props.preserveQueryString,
            redirectRuleId: "rule-1",
            redirectRulesetId: "ruleset-1",
            statusCode: redirect.props.statusCode,
            targetUrl: redirect.targetUrl,
            zoneId: redirect.zone.id,
            zoneName: redirect.zone.name,
          },
        ],
        runnerId: "runner-redirects",
        status: "succeeded",
      },
    );

    await deleteAdminJson<InstanceDomainProviderRedirectsResponse>(
      `${INSTANCE_DOMAIN_PROVIDER_REDIRECTS_API_PATH}?fromHost=applied.example.com`,
    );

    const applied = await deleteAdminJsonAllowingFailure<DomainProviderFailureResponse>(
      `${INSTANCE_DOMAIN_PROVIDER_REDIRECTS_FORGET_API_PATH}?fromHost=applied.example.com`,
    );
    const after = await getJson<InstanceDomainProviderRedirectsResponse>(
      INSTANCE_DOMAIN_PROVIDER_REDIRECTS_API_PATH,
    );

    expect(applied.response.status).toBe(409);
    expect(applied.body).toMatchObject({
      code: "domain-provider-redirect-has-applied-resources",
    });
    expect(after.body.redirectIntents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ enabled: false, fromHost: "applied.example.com" }),
      ]),
    );
    expect(after.body.appliedResources.map((resource) => resource.host)).toEqual([
      "applied.example.com",
      "applied.example.com",
    ]);
  });

  it("requires owner or admin authorization for redirect intent forget", async () => {
    await postAdminJson<InstanceDomainProviderRedirectsResponse>(
      INSTANCE_DOMAIN_PROVIDER_REDIRECTS_API_PATH,
      {
        enabled: false,
        fromHost: "draft.example.com",
        toHost: "example.com",
      },
    );

    const rejected = await harness.fetch(
      `${INSTANCE_DOMAIN_PROVIDER_REDIRECTS_FORGET_API_PATH}?fromHost=draft.example.com`,
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

async function deleteAdminJson<T = unknown>(path: string) {
  const response = await harness.fetch(path, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
    method: "DELETE",
  });

  expect(response.status).toBe(200);

  return {
    body: (await response.json()) as T,
    response,
  };
}

async function deleteAdminJsonAllowingFailure<T>(path: string) {
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
