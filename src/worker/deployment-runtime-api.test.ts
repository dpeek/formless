import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import type { CreateAppInstallResponse } from "../shared/protocol.ts";
import {
  INSTANCE_DEPLOYMENT_ATTEMPT_FAILURE_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_HEARTBEAT_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_PLAN_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_SUCCESS_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_START_API_PATH,
  INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
  INSTANCE_DEPLOYMENT_DRIFT_API_PATH,
  INSTANCE_DEPLOYMENT_STATUS_API_PATH,
  type DeploymentDesiredStateVersionRef,
  type InstanceDeploymentAttemptFailureWritebackRequest,
  type InstanceDeploymentAttemptFailureWritebackResponse,
  type InstanceDeploymentAttemptHeartbeatRequest,
  type InstanceDeploymentAttemptHeartbeatResponse,
  type InstanceDeploymentAttemptPlanWritebackRequest,
  type InstanceDeploymentAttemptPlanWritebackResponse,
  type InstanceDeploymentAttemptStartRequest,
  type InstanceDeploymentAttemptStartResponse,
  type InstanceDeploymentAttemptSuccessWritebackRequest,
  type InstanceDeploymentAttemptSuccessWritebackResponse,
  type InstanceDeploymentDesiredStateResponse,
  type InstanceDeploymentDriftWritebackRequest,
  type InstanceDeploymentDriftWritebackResponse,
  type InstanceDeploymentStatusResponse,
} from "../shared/deployment-runtime.ts";
import {
  INSTANCE_DOMAIN_PROVIDER_REDIRECTS_API_PATH,
  type CreateInstanceDomainProviderRedirectIntentResponse,
} from "../shared/domain-provider-api.ts";
import { CLOUDFLARE_ORIGINLESS_REDIRECT_PLACEHOLDER_DNS } from "../shared/domain-provider-protocol.ts";
import type { CreateInstanceDomainMappingResponse } from "../shared/instance-domain-mappings.ts";
import { INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID } from "./deployment-runtime-state.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";

let harness: Harness;

beforeEach(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        ALCHEMY_PASSWORD: "secret-alchemy-password",
        CLOUDFLARE_API_TOKEN: "secret-cloudflare-token",
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID: "primary",
        FORMLESS_DOMAIN_PROVIDER_WORKER_NAME: "formless-primary",
      },
    },
  );
});

afterEach(async () => {
  await harness.dispose();
});

describe("instance deployment runtime API routes", () => {
  it("reads the primary desired-state version without provider secrets", async () => {
    const first = await getJson<InstanceDeploymentDesiredStateResponse>(
      INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
    );
    const second = await getJson<InstanceDeploymentDesiredStateResponse>(
      INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
    );
    const serialized = JSON.stringify(first.body);

    expect(first.response.headers.get("Cache-Control")).toBe("no-store");
    expect(first.body.target).toEqual({
      kind: "instance",
      label: "Primary instance target",
      targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
    });
    expect(first.body.desiredState).toMatchObject({
      display: {
        resourceCount: 0,
        resourcesByKind: {},
        title: "Primary instance target",
      },
      resourceGraph: {
        resources: [],
        targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
      },
      revision: 1,
      schemaVersion: 1,
      source: {
        fingerprint: "intent:instance.primary.empty",
        intentRevision: 0,
      },
      targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
      versionId: `desired.${INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID}.1`,
    });
    expect(first.body.desiredState.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.body.desiredState.createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(second.body.desiredState).toEqual(first.body.desiredState);
    expect(serialized).not.toContain("secret-cloudflare-token");
    expect(serialized).not.toContain("secret-alchemy-password");
  });

  it("projects enabled custom-domain mappings into desired-state resources", async () => {
    await createAppInstall({ packageAppKey: "tasks", installId: "tasks", label: "Tasks" });
    await createAppInstall({ packageAppKey: "site", installId: "personal", label: "Personal" });
    await postAdminJson<CreateInstanceDomainMappingResponse>("/api/formless/domain-mappings", {
      host: "disabled.example.com",
      profile: "instance",
      enabled: false,
    });
    await postAdminJson<CreateInstanceDomainMappingResponse>("/api/formless/domain-mappings", {
      host: "admin.example.com",
      profile: "instance",
    });
    await postAdminJson<CreateInstanceDomainMappingResponse>("/api/formless/domain-mappings", {
      host: "app.example.com",
      profile: "app",
      targetInstallId: "tasks",
    });
    await postAdminJson<CreateInstanceDomainMappingResponse>("/api/formless/domain-mappings", {
      host: "www.example.com",
      surface: "site",
      installId: "personal",
    });

    const desired = await getJson<InstanceDeploymentDesiredStateResponse>(
      INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
    );
    const serialized = JSON.stringify(desired.body);

    expect(desired.body.desiredState.display).toEqual({
      resourceCount: 3,
      resourcesByKind: { "cloudflare-worker-custom-domain": 3 },
      title: "Primary instance target",
    });
    expect(
      desired.body.desiredState.resourceGraph.resources.map((resource) => ({
        inputs: resource.inputs,
        kind: resource.kind,
        logicalId: resource.logicalId,
        providerFamily: resource.providerFamily,
        targetId: resource.targetId,
      })),
    ).toEqual([
      {
        inputs: {
          adopt: false,
          host: "admin.example.com",
          name: "admin.example.com",
          overrideExistingOrigin: false,
          profile: "instance",
          workerName: "formless-primary",
        },
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-custom-domain-admin-example-com-instance",
        providerFamily: "cloudflare",
        targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
      },
      {
        inputs: {
          adopt: false,
          host: "app.example.com",
          name: "app.example.com",
          overrideExistingOrigin: false,
          profile: "app",
          targetInstallId: "tasks",
          workerName: "formless-primary",
        },
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-custom-domain-app-example-com-app-tasks",
        providerFamily: "cloudflare",
        targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
      },
      {
        inputs: {
          adopt: false,
          host: "www.example.com",
          name: "www.example.com",
          overrideExistingOrigin: false,
          profile: "publicSite",
          targetInstallId: "personal",
          workerName: "formless-primary",
        },
        kind: "cloudflare-worker-custom-domain",
        logicalId: "primary-custom-domain-www-example-com-publicsite-personal",
        providerFamily: "cloudflare",
        targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
      },
    ]);
    expect(desired.body.desiredState.source).toMatchObject({
      fingerprint: expect.stringMatching(/^intent:instance\.primary\.domain-provider:/),
      intentRevision: 3,
    });
    expect(serialized).not.toContain("disabled.example.com");
    expect(serialized).not.toContain("secret-cloudflare-token");
    expect(serialized).not.toContain("secret-alchemy-password");
  });

  it("projects enabled redirect intent into desired-state resources", async () => {
    await createRedirectIntent({
      enabled: false,
      fromHost: "disabled.example.com",
      toHost: "example.com",
    });
    await createRedirectIntent({
      fromHost: "www.example.com",
      toHost: "example.com",
    });
    await createRedirectIntent({
      fromHost: "docs.example.com",
      preservePath: false,
      preserveQueryString: false,
      statusCode: 302,
      toUrl: "https://example.com/docs/?utm=ignored",
    });

    const desired = await getJson<InstanceDeploymentDesiredStateResponse>(
      INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
    );
    const serialized = JSON.stringify(desired.body);

    expect(desired.body.desiredState.display).toEqual({
      resourceCount: 4,
      resourcesByKind: {
        "cloudflare-dns-records": 2,
        "cloudflare-redirect-rule": 2,
      },
      title: "Primary instance target",
    });
    expect(
      desired.body.desiredState.resourceGraph.resources.map((resource) => ({
        dependencies: resource.dependencies,
        inputs: resource.inputs,
        kind: resource.kind,
        logicalId: resource.logicalId,
        providerFamily: resource.providerFamily,
        targetId: resource.targetId,
      })),
    ).toEqual([
      {
        dependencies: [],
        inputs: {
          fromHost: "docs.example.com",
          records: [
            {
              ...CLOUDFLARE_ORIGINLESS_REDIRECT_PLACEHOLDER_DNS,
              name: "docs.example.com",
            },
          ],
        },
        kind: "cloudflare-dns-records",
        logicalId: "primary-redirect-dns-docs-example-com",
        providerFamily: "cloudflare",
        targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
      },
      {
        dependencies: [],
        inputs: {
          fromHost: "www.example.com",
          records: [
            {
              ...CLOUDFLARE_ORIGINLESS_REDIRECT_PLACEHOLDER_DNS,
              name: "www.example.com",
            },
          ],
        },
        kind: "cloudflare-dns-records",
        logicalId: "primary-redirect-dns-www-example-com",
        providerFamily: "cloudflare",
        targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
      },
      {
        dependencies: [
          {
            logicalId: "primary-redirect-dns-docs-example-com",
            reason: "redirect placeholder dns",
          },
        ],
        inputs: {
          description: "Formless redirect docs.example.com to example.com",
          fromHost: "docs.example.com",
          preservePath: false,
          preserveQueryString: false,
          requestUrl: "https://docs.example.com/",
          statusCode: 302,
          targetHost: "example.com",
          targetUrl: "https://example.com/docs",
        },
        kind: "cloudflare-redirect-rule",
        logicalId: "primary-redirect-rule-docs-example-com-example-com",
        providerFamily: "cloudflare",
        targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
      },
      {
        dependencies: [
          {
            logicalId: "primary-redirect-dns-www-example-com",
            reason: "redirect placeholder dns",
          },
        ],
        inputs: {
          description: "Formless redirect www.example.com to example.com",
          fromHost: "www.example.com",
          preservePath: true,
          preserveQueryString: true,
          requestUrl: "https://www.example.com/*",
          statusCode: 301,
          targetHost: "example.com",
          targetUrl: "https://example.com/${1}",
        },
        kind: "cloudflare-redirect-rule",
        logicalId: "primary-redirect-rule-www-example-com-example-com",
        providerFamily: "cloudflare",
        targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
      },
    ]);
    expect(desired.body.desiredState.source).toMatchObject({
      fingerprint: expect.stringMatching(/^intent:instance\.primary\.domain-provider:/),
      intentRevision: 4,
    });
    expect(serialized).not.toContain("disabled.example.com");
    expect(serialized).not.toContain("secret-cloudflare-token");
    expect(serialized).not.toContain("secret-alchemy-password");
  });

  it("uses no-store cache policy for method and target errors", async () => {
    const methodRejected = await harness.fetch(INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH, {
      method: "POST",
    });
    const targetRejected = await harness.fetch(
      `${INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH}?targetId=instance.secondary`,
    );
    const invalidTargetRejected = await harness.fetch(
      `${INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH}?targetId=Primary`,
    );

    expect(methodRejected.status).toBe(405);
    expect(methodRejected.headers.get("Allow")).toBe("GET");
    expect(methodRejected.headers.get("Cache-Control")).toBe("no-store");
    expect(await methodRejected.json()).toEqual({ error: "Method not allowed." });

    expect(targetRejected.status).toBe(404);
    expect(targetRejected.headers.get("Cache-Control")).toBe("no-store");
    expect(await targetRejected.json()).toEqual({
      error: 'Deployment target "instance.secondary" was not found.',
    });

    expect(invalidTargetRejected.status).toBe(400);
    expect(invalidTargetRejected.headers.get("Cache-Control")).toBe("no-store");
    expect(await invalidTargetRejected.json()).toMatchObject({
      code: "invalid-target-id",
      field: "targetId",
    });
  });

  it("reads latest deployment status without materializing desired state", async () => {
    const empty = await getJson<InstanceDeploymentStatusResponse>(
      INSTANCE_DEPLOYMENT_STATUS_API_PATH,
    );
    const methodRejected = await harness.fetch(INSTANCE_DEPLOYMENT_STATUS_API_PATH, {
      method: "POST",
    });
    const targetRejected = await harness.fetch(
      `${INSTANCE_DEPLOYMENT_STATUS_API_PATH}?targetId=instance.secondary`,
    );

    expect(empty.response.headers.get("Cache-Control")).toBe("no-store");
    expect(empty.body.target).toEqual({
      kind: "instance",
      label: "Primary instance target",
      targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
    });
    expect(empty.body.status).toMatchObject({
      state: "no-target",
    });

    expect(methodRejected.status).toBe(405);
    expect(methodRejected.headers.get("Allow")).toBe("GET");
    expect(methodRejected.headers.get("Cache-Control")).toBe("no-store");

    expect(targetRejected.status).toBe(404);
    expect(targetRejected.headers.get("Cache-Control")).toBe("no-store");
    expect(await targetRejected.json()).toEqual({
      error: 'Deployment target "instance.secondary" was not found.',
    });
  });

  it("starts apply attempts with a lease and replays idempotency keys", async () => {
    const desiredState = (
      await getJson<InstanceDeploymentDesiredStateResponse>(
        INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
      )
    ).body.desiredState;
    const request = attemptStartRequest(desiredStateRef(desiredState), {
      idempotencyKey: "apply:primary:one",
      mode: "apply",
    });
    const started = await postAttemptStart(request);

    expect(started.response.status).toBe(201);
    expect(started.response.headers.get("Cache-Control")).toBe("no-store");
    expect(started.body).toMatchObject({
      attempt: {
        actor: {
          actorId: "runner:primary",
          kind: "runner",
          runnerId: "runner.primary",
        },
        hash: desiredState.hash,
        idempotencyKey: "apply:primary:one",
        mode: "apply",
        revision: desiredState.revision,
        status: "started",
        targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
        versionId: desiredState.versionId,
      },
      lease: {
        actor: {
          actorId: "runner:primary",
          kind: "runner",
          runnerId: "runner.primary",
        },
        mode: "apply",
        status: "active",
        targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
      },
      replayed: false,
    });
    expect(started.body.attempt.attemptId).toMatch(/^attempt\.[a-f0-9-]{36}$/);
    expect(started.body.attempt.leaseId).toMatch(/^lease\.[a-f0-9-]{36}$/);
    expect(started.body.lease?.leaseId).toBe(started.body.attempt.leaseId);
    expect(started.body.lease?.attemptId).toBe(started.body.attempt.attemptId);
    expect(started.body.lease?.token).toMatch(/^lease:[a-f0-9-]{36}$/);
    expect(Date.parse(started.body.lease?.expiresAt ?? "")).toBeGreaterThan(
      Date.parse(started.body.lease?.acquiredAt ?? ""),
    );
    expect(JSON.stringify(started.body)).not.toContain("secret-cloudflare-token");
    expect(JSON.stringify(started.body)).not.toContain("secret-alchemy-password");

    const replayed = await postAttemptStart(request);

    expect(replayed.response.status).toBe(200);
    expect(replayed.body).toEqual({
      ...started.body,
      replayed: true,
    });
  });

  it("rejects stale desired-state starts before acquiring a mutating lease", async () => {
    const desiredState = (
      await getJson<InstanceDeploymentDesiredStateResponse>(
        INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
      )
    ).body.desiredState;
    const stale = await postAttemptStart(
      attemptStartRequest(
        {
          ...desiredStateRef(desiredState),
          hash: `sha256:${"b".repeat(64)}`,
        },
        {
          idempotencyKey: "apply:primary:stale",
          mode: "apply",
        },
      ),
    );

    expect(stale.response.status).toBe(409);
    expect(stale.body).toEqual({
      code: "deployment-desired-state-stale",
      error: `Deployment desired state for target "${INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID}" is stale. Read the latest desired state before starting an attempt.`,
    });

    const first = await postAttemptStart(
      attemptStartRequest(desiredStateRef(desiredState), {
        idempotencyKey: "apply:primary:first",
        mode: "apply",
      }),
    );
    const second = await postAttemptStart(
      attemptStartRequest(desiredStateRef(desiredState), {
        idempotencyKey: "apply:primary:second",
        mode: "destroy",
      }),
    );

    expect(first.response.status).toBe(201);
    expect(second.response.status).toBe(409);
    expect(second.body).toEqual({
      code: "deployment-attempt-active-lease",
      error: `Deployment target "${INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID}" already has an active apply attempt.`,
    });
  });

  it("starts plan attempts without a deployment lease", async () => {
    const desiredState = (
      await getJson<InstanceDeploymentDesiredStateResponse>(
        INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
      )
    ).body.desiredState;
    const planned = await postAttemptStart(
      attemptStartRequest(desiredStateRef(desiredState), {
        idempotencyKey: "plan:primary:one",
        mode: "plan",
      }),
    );

    expect(planned.response.status).toBe(201);
    expect(planned.body.attempt).toMatchObject({
      idempotencyKey: "plan:primary:one",
      mode: "plan",
      status: "started",
    });
    expect(planned.body.attempt.leaseId).toBeUndefined();
    expect(planned.body.lease).toBeUndefined();
  });

  it("heartbeats active mutating attempt leases", async () => {
    const desiredState = (
      await getJson<InstanceDeploymentDesiredStateResponse>(
        INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
      )
    ).body.desiredState;
    const started = await postAttemptStart(
      attemptStartRequest(desiredStateRef(desiredState), {
        idempotencyKey: "apply:primary:heartbeat",
        mode: "apply",
      }),
    );

    expect(started.response.status).toBe(201);
    expect(started.body.lease).toBeDefined();

    const heartbeat = await postAttemptHeartbeat({
      attemptId: started.body.attempt.attemptId,
      desiredState: desiredStateRef(desiredState),
      leaseToken: started.body.lease?.token ?? "",
    });

    expect(heartbeat.response.status).toBe(200);
    expect(heartbeat.response.headers.get("Cache-Control")).toBe("no-store");
    expect(heartbeat.body).toMatchObject({
      attempt: {
        attemptId: started.body.attempt.attemptId,
        status: "started",
      },
      lease: {
        attemptId: started.body.attempt.attemptId,
        leaseId: started.body.lease?.leaseId,
        status: "active",
      },
    });
    expect(Date.parse(heartbeat.body.lease.expiresAt)).toBeGreaterThanOrEqual(
      Date.parse(started.body.lease?.expiresAt ?? ""),
    );

    const tokenRejected = await postAttemptHeartbeat({
      attemptId: started.body.attempt.attemptId,
      desiredState: desiredStateRef(desiredState),
      leaseToken: "lease:wrong",
    });

    expect(tokenRejected.response.status).toBe(409);
    expect(tokenRejected.body).toEqual({
      code: "deployment-lease-token-mismatch",
      error: `Deployment lease token for attempt "${started.body.attempt.attemptId}" does not match.`,
    });
  });

  it("writes plan, success, failure, and drift facts for exact desired-state versions", async () => {
    const desiredState = (
      await getJson<InstanceDeploymentDesiredStateResponse>(
        INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
      )
    ).body.desiredState;
    const desired = desiredStateRef(desiredState);

    const planStarted = await postAttemptStart(
      attemptStartRequest(desired, {
        idempotencyKey: "plan:primary:writeback",
        mode: "plan",
      }),
    );
    const plan = await postAttemptPlan({
      attemptId: planStarted.body.attempt.attemptId,
      desiredState: desired,
      runnerId: "runner.primary",
      summary: {
        blockers: [],
        changes: { create: 1, delete: 0, noChange: 2, update: 1 },
        displayText: "1 create, 1 update",
        warnings: [
          { code: "preview", logicalId: "custom-domain:app.example.com", message: "Preview only." },
        ],
      },
    });

    expect(plan.response.status).toBe(200);
    expect(plan.response.headers.get("Cache-Control")).toBe("no-store");
    expect(plan.body.attempt).toMatchObject({
      attemptId: planStarted.body.attempt.attemptId,
      mode: "plan",
      status: "planned",
    });
    expect(plan.body.attempt.completedAt).toBeDefined();
    expect(plan.body.plan).toMatchObject({
      attemptId: planStarted.body.attempt.attemptId,
      kind: "plan",
      runnerId: "runner.primary",
      summary: {
        changes: { create: 1, delete: 0, noChange: 2, update: 1 },
        displayText: "1 create, 1 update",
      },
      versionId: desired.versionId,
    });

    const applyStarted = await postAttemptStart(
      attemptStartRequest(desired, {
        idempotencyKey: "apply:primary:success-writeback",
        mode: "apply",
      }),
    );
    const applyPlan = await postAttemptPlan({
      attemptId: applyStarted.body.attempt.attemptId,
      desiredState: desired,
      summary: {
        blockers: [],
        changes: { create: 1, delete: 0, noChange: 0, update: 0 },
        warnings: [],
      },
    });

    expect(applyPlan.response.status).toBe(200);
    expect(applyPlan.body.attempt.status).toBe("started");

    const staleSuccess = await postAttemptSuccess({
      alchemy: { app: "formless", scope: "instance.primary", stage: "prod" },
      attemptId: applyStarted.body.attempt.attemptId,
      desiredState: { ...desired, hash: `sha256:${"c".repeat(64)}` },
      evidence: [],
      leaseToken: applyStarted.body.lease?.token ?? "",
      runnerId: "runner.primary",
    });

    expect(staleSuccess.response.status).toBe(409);
    expect(staleSuccess.body).toMatchObject({
      code: "deployment-attempt-version-mismatch",
    });

    const success = await postAttemptSuccess({
      alchemy: { app: "formless", scope: "instance.primary", stage: "prod" },
      attemptId: applyStarted.body.attempt.attemptId,
      desiredState: desired,
      evidence: [
        {
          action: "created",
          alchemyResourceId: "alchemy:custom-domain:app.example.com",
          displayName: "app.example.com",
          kind: "cloudflare-worker-custom-domain",
          logicalId: "custom-domain:app.example.com",
          providerFamily: "cloudflare",
          providerResourceIds: ["cf-custom-domain-1"],
          targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
        },
      ],
      leaseToken: applyStarted.body.lease?.token ?? "",
      runnerId: "runner.primary",
    });

    expect(success.response.status).toBe(200);
    expect(success.body).toMatchObject({
      attempt: {
        attemptId: applyStarted.body.attempt.attemptId,
        status: "succeeded",
      },
      lease: {
        attemptId: applyStarted.body.attempt.attemptId,
        status: "released",
      },
      result: {
        alchemy: { app: "formless", scope: "instance.primary", stage: "prod" },
        evidence: [
          {
            action: "created",
            kind: "cloudflare-worker-custom-domain",
            logicalId: "custom-domain:app.example.com",
          },
        ],
        kind: "success",
        runnerId: "runner.primary",
        versionId: desired.versionId,
      },
    });
    expect(success.body.result.completedAt).toBe(success.body.attempt.completedAt);
    expect(JSON.stringify(success.body)).not.toContain("secret-cloudflare-token");
    expect(JSON.stringify(success.body)).not.toContain("secret-alchemy-password");

    const failureStarted = await postAttemptStart(
      attemptStartRequest(desired, {
        idempotencyKey: "apply:primary:failure-writeback",
        mode: "apply",
      }),
    );
    const missingLeaseFailure = await postAttemptFailure({
      actor: {
        actorId: "runner:primary",
        kind: "runner",
        runnerId: "runner.primary",
      },
      attemptId: failureStarted.body.attempt.attemptId,
      desiredState: desired,
      summary: {
        code: "provider-error",
        details: "Cloudflare rejected the mutation.",
        displayMessage: "Provider apply failed.",
      },
    });

    expect(missingLeaseFailure.response.status).toBe(409);
    expect(missingLeaseFailure.body).toMatchObject({
      code: "deployment-lease-token-missing",
    });

    const failure = await postAttemptFailure({
      actor: {
        actorId: "runner:primary",
        kind: "runner",
        runnerId: "runner.primary",
      },
      attemptId: failureStarted.body.attempt.attemptId,
      desiredState: desired,
      leaseToken: failureStarted.body.lease?.token ?? "",
      runnerId: "runner.primary",
      summary: {
        code: "provider-error",
        details: "Cloudflare rejected the mutation.",
        displayMessage: "Provider apply failed.",
      },
    });

    expect(failure.response.status).toBe(200);
    expect(failure.body).toMatchObject({
      attempt: {
        attemptId: failureStarted.body.attempt.attemptId,
        status: "failed",
      },
      lease: {
        attemptId: failureStarted.body.attempt.attemptId,
        status: "released",
      },
      result: {
        actor: {
          actorId: "runner:primary",
          kind: "runner",
          runnerId: "runner.primary",
        },
        kind: "failure",
        runnerId: "runner.primary",
        summary: {
          code: "provider-error",
          displayMessage: "Provider apply failed.",
        },
        versionId: desired.versionId,
      },
    });

    const drift = await postDeploymentDrift({
      actor: {
        actorId: "runner:primary",
        kind: "runner",
        runnerId: "runner.primary",
      },
      desiredState: desired,
      status: "drifted",
      summary: {
        affectedLogicalIds: ["custom-domain:app.example.com"],
        create: 0,
        delete: 0,
        update: 1,
      },
    });

    expect(drift.response.status).toBe(200);
    expect(drift.body.report).toMatchObject({
      actor: {
        actorId: "runner:primary",
        kind: "runner",
        runnerId: "runner.primary",
      },
      status: "drifted",
      summary: {
        affectedLogicalIds: ["custom-domain:app.example.com"],
        update: 1,
      },
      versionId: desired.versionId,
    });
    expect(drift.body.report.reportId).toMatch(/^drift\.[a-f0-9-]{36}$/);

    const staleDrift = await postDeploymentDrift({
      actor: {
        actorId: "runner:primary",
        kind: "runner",
        runnerId: "runner.primary",
      },
      desiredState: { ...desired, hash: `sha256:${"d".repeat(64)}` },
      status: "unknown",
      summary: {
        affectedLogicalIds: [],
        create: 0,
        delete: 0,
        update: 0,
      },
    });

    expect(staleDrift.response.status).toBe(409);
    expect(staleDrift.body).toMatchObject({
      code: "deployment-desired-state-stale",
    });
  });

  it("guards and validates attempt start writes", async () => {
    const desiredState = (
      await getJson<InstanceDeploymentDesiredStateResponse>(
        INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
      )
    ).body.desiredState;
    const methodRejected = await harness.fetch(INSTANCE_DEPLOYMENT_ATTEMPT_START_API_PATH);
    const unauthorized = await harness.fetch(INSTANCE_DEPLOYMENT_ATTEMPT_START_API_PATH, {
      body: JSON.stringify(attemptStartRequest(desiredStateRef(desiredState))),
      method: "POST",
    });
    const invalid = await postAttemptStart({
      ...attemptStartRequest(desiredStateRef(desiredState)),
      mode: "launch",
    } as unknown as InstanceDeploymentAttemptStartRequest);

    expect(methodRejected.status).toBe(405);
    expect(methodRejected.headers.get("Allow")).toBe("POST");
    expect(methodRejected.headers.get("Cache-Control")).toBe("no-store");

    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
    expect(unauthorized.headers.get("Cache-Control")).toBe("no-store");

    expect(invalid.response.status).toBe(400);
    expect(invalid.body).toMatchObject({
      code: "invalid-attempt-mode",
      field: "mode",
    });
  });
});

async function getJson<T>(path: string) {
  const response = await harness.fetch(path);

  expect(response.status).toBe(200);

  return {
    body: (await response.json()) as T,
    response,
  };
}

async function createAppInstall(input: {
  packageAppKey: string;
  installId: string;
  label: string;
}) {
  return postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", input);
}

async function createRedirectIntent(input: {
  enabled?: boolean;
  fromHost: string;
  preservePath?: boolean;
  preserveQueryString?: boolean;
  statusCode?: number;
  toHost?: string;
  toUrl?: string;
}) {
  return postAdminJson<CreateInstanceDomainProviderRedirectIntentResponse>(
    INSTANCE_DOMAIN_PROVIDER_REDIRECTS_API_PATH,
    input,
  );
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

async function postAttemptStart(request: InstanceDeploymentAttemptStartRequest) {
  const response = await harness.fetch(INSTANCE_DEPLOYMENT_ATTEMPT_START_API_PATH, {
    body: JSON.stringify(request),
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  return {
    body: (await response.json()) as InstanceDeploymentAttemptStartResponse & {
      code?: string;
      error?: string;
    },
    response,
  };
}

async function postAttemptHeartbeat(request: InstanceDeploymentAttemptHeartbeatRequest) {
  const response = await harness.fetch(INSTANCE_DEPLOYMENT_ATTEMPT_HEARTBEAT_API_PATH, {
    body: JSON.stringify(request),
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  return {
    body: (await response.json()) as InstanceDeploymentAttemptHeartbeatResponse & {
      code?: string;
      error?: string;
    },
    response,
  };
}

async function postAttemptPlan(request: InstanceDeploymentAttemptPlanWritebackRequest) {
  const response = await harness.fetch(INSTANCE_DEPLOYMENT_ATTEMPT_PLAN_API_PATH, {
    body: JSON.stringify(request),
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  return {
    body: (await response.json()) as InstanceDeploymentAttemptPlanWritebackResponse & {
      code?: string;
      error?: string;
    },
    response,
  };
}

async function postAttemptSuccess(request: InstanceDeploymentAttemptSuccessWritebackRequest) {
  const response = await harness.fetch(INSTANCE_DEPLOYMENT_ATTEMPT_SUCCESS_API_PATH, {
    body: JSON.stringify(request),
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  return {
    body: (await response.json()) as InstanceDeploymentAttemptSuccessWritebackResponse & {
      code?: string;
      error?: string;
    },
    response,
  };
}

async function postAttemptFailure(request: InstanceDeploymentAttemptFailureWritebackRequest) {
  const response = await harness.fetch(INSTANCE_DEPLOYMENT_ATTEMPT_FAILURE_API_PATH, {
    body: JSON.stringify(request),
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  return {
    body: (await response.json()) as InstanceDeploymentAttemptFailureWritebackResponse & {
      code?: string;
      error?: string;
    },
    response,
  };
}

async function postDeploymentDrift(request: InstanceDeploymentDriftWritebackRequest) {
  const response = await harness.fetch(INSTANCE_DEPLOYMENT_DRIFT_API_PATH, {
    body: JSON.stringify(request),
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  return {
    body: (await response.json()) as InstanceDeploymentDriftWritebackResponse & {
      code?: string;
      error?: string;
    },
    response,
  };
}

function attemptStartRequest(
  desiredState: DeploymentDesiredStateVersionRef,
  input: Partial<Pick<InstanceDeploymentAttemptStartRequest, "idempotencyKey" | "mode">> = {},
): InstanceDeploymentAttemptStartRequest {
  return {
    actor: {
      actorId: "runner:primary",
      kind: "runner",
      runnerId: "runner.primary",
    },
    desiredState,
    idempotencyKey: input.idempotencyKey ?? "apply:primary:default",
    mode: input.mode ?? "apply",
  };
}

function desiredStateRef(
  desiredState: InstanceDeploymentDesiredStateResponse["desiredState"],
): DeploymentDesiredStateVersionRef {
  return {
    hash: desiredState.hash,
    revision: desiredState.revision,
    targetId: desiredState.targetId,
    versionId: desiredState.versionId,
  };
}
