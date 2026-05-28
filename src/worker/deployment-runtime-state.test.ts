import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
  INSTANCE_DEPLOYMENT_RUNTIME_INDEXES,
  INSTANCE_DEPLOYMENT_RUNTIME_TABLES,
} from "./deployment-runtime-state.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

let harness: Harness | undefined;
let harnessDir: string | undefined;

afterEach(async () => {
  await harness?.dispose();
  harness = undefined;

  if (harnessDir) {
    await rm(harnessDir, { recursive: true, force: true });
    harnessDir = undefined;
  }
});

describe("instance deployment runtime state", () => {
  it("creates desired-state, attempt, lease, evidence, and drift storage tables", async () => {
    harness = await createWorkerHarness(await writeDeploymentRuntimeStateHarness(), {
      DEPLOYMENT_RUNTIME_STATE: { className: "DeploymentRuntimeStateHarness", useSQLite: true },
    });

    const response = await harness.fetch("/ensure");

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      indexes: string[];
      tableDefinitions: Record<string, string>;
      tables: string[];
    };

    expect(body.tables).toEqual([...INSTANCE_DEPLOYMENT_RUNTIME_TABLES].sort());
    expect(body.indexes).toEqual([...INSTANCE_DEPLOYMENT_RUNTIME_INDEXES].sort());
    expect(body.tableDefinitions.instance_deployment_desired_state_versions).toContain(
      "resource_graph_json TEXT NOT NULL",
    );
    expect(body.tableDefinitions.instance_deployment_attempts).toContain(
      "idempotency_key TEXT NOT NULL",
    );
    expect(body.tableDefinitions.instance_deployment_leases).toContain("token TEXT NOT NULL");
    expect(body.tableDefinitions.instance_deployment_evidence_summaries).toContain(
      "provider_resource_ids_json TEXT NOT NULL",
    );
    expect(body.tableDefinitions.instance_deployment_drift_reports).toContain(
      "summary_json TEXT NOT NULL",
    );
  });

  it("keeps version revisions and active leases target scoped", async () => {
    harness = await createWorkerHarness(await writeDeploymentRuntimeStateHarness(), {
      DEPLOYMENT_RUNTIME_STATE: { className: "DeploymentRuntimeStateHarness", useSQLite: true },
    });

    const response = await harness.fetch("/constraint-check");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      activeLeaseTargetScoped: true,
      duplicateRevisionRejected: true,
      invalidAttemptStatusRejected: true,
      releasedLeaseSameTargetAllowed: true,
      sameRevisionOtherTargetAllowed: true,
    });
  });

  it("materializes latest desired state versions for the primary instance target", async () => {
    harness = await createWorkerHarness(await writeDeploymentRuntimeStateHarness(), {
      DEPLOYMENT_RUNTIME_STATE: { className: "DeploymentRuntimeStateHarness", useSQLite: true },
    });

    const response = await harness.fetch("/materialize-check");

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      byIdMatchesLatest: boolean;
      firstCreatedAt: string;
      firstHash: string;
      firstRevision: number;
      firstVersionId: string;
      latestDisplay: unknown;
      latestResourceGraphJson: string;
      latestResourceOrder: { kind: string; logicalId: string }[];
      latestRevision: number;
      latestVersionId: string;
      secondCreatedAt: string;
      secondSameVersion: boolean;
      storedGraphHasSecret: boolean;
      userIntentTablesCreated: boolean;
      versionsCount: number;
    };

    expect(body).toEqual({
      byIdMatchesLatest: true,
      firstCreatedAt: "2026-05-28T00:00:00.000Z",
      firstHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      firstRevision: 1,
      firstVersionId: `desired.${INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID}.1`,
      latestDisplay: {
        resourceCount: 2,
        resourcesByKind: {
          "cloudflare-dns-records": 1,
          "cloudflare-worker-custom-domain": 1,
        },
        title: "Primary instance target",
      },
      latestResourceGraphJson: expect.not.stringContaining("secret-token"),
      latestResourceOrder: [
        { kind: "cloudflare-worker-custom-domain", logicalId: "custom-domain:app.example.com" },
        { kind: "cloudflare-dns-records", logicalId: "dns:app.example.com" },
      ],
      latestRevision: 2,
      latestVersionId: `desired.${INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID}.2`,
      secondCreatedAt: "2026-05-28T00:00:00.000Z",
      secondSameVersion: true,
      storedGraphHasSecret: false,
      userIntentTablesCreated: false,
      versionsCount: 2,
    });
  });

  it("heartbeats active leases and releases them on terminal writeback", async () => {
    harness = await createWorkerHarness(await writeDeploymentRuntimeStateHarness(), {
      DEPLOYMENT_RUNTIME_STATE: { className: "DeploymentRuntimeStateHarness", useSQLite: true },
    });

    const response = await harness.fetch("/lease-lifecycle-check");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      firstLeaseStatus: "active",
      heartbeatAttemptStatus: "started",
      heartbeatExpiresAt: "2026-05-28T00:20:00.000Z",
      heartbeatOk: true,
      releaseAttemptCompletedAt: "2026-05-28T00:06:00.000Z",
      releaseAttemptStatus: "succeeded",
      releaseLeaseReleasedAt: "2026-05-28T00:06:00.000Z",
      releaseLeaseStatus: "released",
      releaseOk: true,
      releasedHeartbeatCode: "deployment-attempt-not-active",
      secondStartOk: true,
      wrongHeartbeatCode: "deployment-lease-token-mismatch",
    });
  });

  it("derives latest deployment status for target, attempt, result, failure, and drift states", async () => {
    harness = await createWorkerHarness(await writeDeploymentRuntimeStateHarness(), {
      DEPLOYMENT_RUNTIME_STATE: { className: "DeploymentRuntimeStateHarness", useSQLite: true },
    });

    const response = await harness.fetch("/status-derivation-check");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      active: {
        leaseExpiresAt: "2026-05-28T00:16:00.000Z",
        mode: "apply",
        state: "in-progress",
      },
      deployed: {
        deployedAt: "2026-05-28T00:02:00.000Z",
        state: "deployed",
      },
      drift: {
        affectedLogicalIds: ["custom-domain:app.example.com"],
        state: "drift",
      },
      failedCurrent: {
        code: "provider-error",
        failedAt: "2026-05-28T00:05:00.000Z",
        state: "failed-current-version",
      },
      failedOlder: {
        failedRevision: 2,
        latestRevision: 3,
        state: "failed-older-version",
      },
      noTarget: {
        state: "no-target",
      },
      pending: {
        latestRevision: 2,
        latestSuccessfulRevision: 1,
        state: "pending-changes",
      },
    });
  });
});

async function writeDeploymentRuntimeStateHarness() {
  harnessDir = await mkdtemp(join(tmpdir(), "formless-deployment-runtime-state-harness-"));
  const harnessPath = join(harnessDir, "deployment-runtime-state-harness.ts");

  await writeFile(
    harnessPath,
    `
      import { DurableObject } from "cloudflare:workers";
      import {
        ensureInstanceDeploymentRuntimeTables,
        INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
        INSTANCE_DEPLOYMENT_RUNTIME_INDEXES,
        INSTANCE_DEPLOYMENT_RUNTIME_TABLES,
        heartbeatDeploymentAttemptLease,
        materializeDeploymentDesiredStateVersion,
        readDeploymentDesiredStateVersion,
        readLatestDeploymentStatus,
        readLatestDeploymentDesiredStateVersion,
        releaseDeploymentAttemptLeaseForTerminalWriteback,
        startDeploymentAttempt,
        writeDeploymentAttemptFailure,
        writeDeploymentAttemptSuccess,
        writeDeploymentDriftReport,
      } from "${process.cwd()}/src/worker/deployment-runtime-state.ts";

      export default {
        fetch(request, env) {
          const id = env.DEPLOYMENT_RUNTIME_STATE.idFromName("state");
          return env.DEPLOYMENT_RUNTIME_STATE.get(id).fetch(request);
        },
      };

      export class DeploymentRuntimeStateHarness extends DurableObject {
        async fetch(request) {
          const url = new URL(request.url);

          if (url.pathname === "/ensure") {
            ensureInstanceDeploymentRuntimeTables(this.ctx.storage);
            return Response.json({
              indexes: storageObjectNames(
                this.ctx.storage,
                "index",
                INSTANCE_DEPLOYMENT_RUNTIME_INDEXES,
              ),
              tableDefinitions: tableDefinitions(
                this.ctx.storage,
                INSTANCE_DEPLOYMENT_RUNTIME_TABLES,
              ),
              tables: storageObjectNames(
                this.ctx.storage,
                "table",
                INSTANCE_DEPLOYMENT_RUNTIME_TABLES,
              ),
            });
          }

          if (url.pathname === "/constraint-check") {
            ensureInstanceDeploymentRuntimeTables(this.ctx.storage);
            return Response.json(runConstraintCheck(this.ctx.storage));
          }

          if (url.pathname === "/materialize-check") {
            ensureInstanceDeploymentRuntimeTables(this.ctx.storage);
            return Response.json(await runMaterializeCheck(this.ctx.storage));
          }

          if (url.pathname === "/lease-lifecycle-check") {
            ensureInstanceDeploymentRuntimeTables(this.ctx.storage);
            return Response.json(await runLeaseLifecycleCheck(this.ctx.storage));
          }

          if (url.pathname === "/status-derivation-check") {
            ensureInstanceDeploymentRuntimeTables(this.ctx.storage);
            return Response.json(await runStatusDerivationCheck(this.ctx.storage));
          }

          return Response.json({ error: "Not found." }, { status: 404 });
        }
      }

      async function runMaterializeCheck(storage) {
        const targetId = INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID;
        const first = await materializeDeploymentDesiredStateVersion(storage, {
          now: "2026-05-28T00:00:00.000Z",
          resourceGraph: { resources: [], targetId },
          source: { fingerprint: "intent:empty", intentRevision: 0 },
          targetId,
        });
        const second = await materializeDeploymentDesiredStateVersion(storage, {
          now: "2026-05-28T00:05:00.000Z",
          resourceGraph: { resources: [], targetId },
          source: { fingerprint: "intent:empty", intentRevision: 0 },
          targetId,
        });

        await materializeDeploymentDesiredStateVersion(storage, {
          now: "2026-05-28T00:10:00.000Z",
          resourceGraph: {
            resources: [
              {
                dependencies: [],
                inputs: {
                  apiToken: "secret-token",
                  name: "app.example.com",
                  zoneId: "zone-example",
                },
                kind: "cloudflare-worker-custom-domain",
                logicalId: "custom-domain:app.example.com",
                providerFamily: "cloudflare",
                targetId,
              },
              {
                dependencies: [],
                inputs: { name: "app.example.com", zoneId: "zone-example" },
                kind: "cloudflare-dns-records",
                logicalId: "dns:app.example.com",
                providerFamily: "cloudflare",
                targetId,
              },
            ],
            targetId,
          },
          source: { fingerprint: "intent:domain-app-example", intentRevision: 1 },
          targetId,
          title: "Primary instance target",
        });

        const latest = readLatestDeploymentDesiredStateVersion(storage, targetId);
        const latestById = readDeploymentDesiredStateVersion(storage, {
          targetId,
          versionId: latest.versionId,
        });
        const latestResourceGraphJson = JSON.stringify(latest.resourceGraph);

        return {
          byIdMatchesLatest: latestById?.versionId === latest.versionId,
          firstCreatedAt: first.createdAt,
          firstHash: first.hash,
          firstRevision: first.revision,
          firstVersionId: first.versionId,
          latestDisplay: latest.display,
          latestResourceGraphJson,
          latestResourceOrder: latest.resourceGraph.resources.map((resource) => ({
            kind: resource.kind,
            logicalId: resource.logicalId,
          })),
          latestRevision: latest.revision,
          latestVersionId: latest.versionId,
          secondCreatedAt: second.createdAt,
          secondSameVersion: second.versionId === first.versionId,
          storedGraphHasSecret: latestResourceGraphJson.includes("secret-token"),
          userIntentTablesCreated: storage.sql
            .exec(
              \`
                SELECT name FROM sqlite_master
                WHERE type = 'table'
                  AND name IN (
                    'instance_domain_mappings',
                    'instance_domain_provider_redirect_intents'
                  )
              \`,
            )
            .toArray().length > 0,
          versionsCount: storage.sql
            .exec(
              "SELECT COUNT(*) AS count FROM instance_deployment_desired_state_versions WHERE target_id = ?",
              targetId,
            )
            .one().count,
        };
      }

      async function runLeaseLifecycleCheck(storage) {
        const targetId = INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID;
        const desiredState = await materializeDeploymentDesiredStateVersion(storage, {
          now: "2026-05-28T00:00:00.000Z",
          resourceGraph: { resources: [], targetId },
          source: { fingerprint: "intent:empty", intentRevision: 0 },
          targetId,
        });
        const desiredStateRef = {
          hash: desiredState.hash,
          revision: desiredState.revision,
          targetId: desiredState.targetId,
          versionId: desiredState.versionId,
        };
        const actor = {
          actorId: "runner:primary",
          kind: "runner",
          runnerId: "runner.primary",
        } as const;
        const first = startDeploymentAttempt(storage, {
          actor,
          desiredState: desiredStateRef,
          idempotencyKey: "apply:primary:lease-lifecycle:one",
          mode: "apply",
          now: "2026-05-28T00:00:00.000Z",
        });
        if (!first.ok || !first.lease) {
          throw new Error("First mutating deployment attempt did not acquire a lease.");
        }
        const wrongHeartbeat = heartbeatDeploymentAttemptLease(storage, {
          attemptId: first.attempt.attemptId,
          desiredState: desiredStateRef,
          leaseToken: "lease:wrong",
          now: "2026-05-28T00:05:00.000Z",
        });
        const heartbeat = heartbeatDeploymentAttemptLease(storage, {
          attemptId: first.attempt.attemptId,
          desiredState: desiredStateRef,
          leaseToken: first.lease.token,
          now: "2026-05-28T00:05:00.000Z",
        });
        if (!heartbeat.ok) {
          throw new Error("Deployment lease heartbeat failed.");
        }
        const release = releaseDeploymentAttemptLeaseForTerminalWriteback(storage, {
          attemptId: first.attempt.attemptId,
          desiredState: desiredStateRef,
          leaseToken: first.lease.token,
          now: "2026-05-28T00:06:00.000Z",
          terminalStatus: "succeeded",
        });
        if (!release.ok) {
          throw new Error("Deployment lease release failed.");
        }
        const releasedHeartbeat = heartbeatDeploymentAttemptLease(storage, {
          attemptId: first.attempt.attemptId,
          desiredState: desiredStateRef,
          leaseToken: first.lease.token,
          now: "2026-05-28T00:07:00.000Z",
        });
        const second = startDeploymentAttempt(storage, {
          actor,
          desiredState: desiredStateRef,
          idempotencyKey: "apply:primary:lease-lifecycle:two",
          mode: "apply",
          now: "2026-05-28T00:07:00.000Z",
        });

        return {
          firstLeaseStatus: first.lease.status,
          heartbeatAttemptStatus: heartbeat.attempt.status,
          heartbeatExpiresAt: heartbeat.lease.expiresAt,
          heartbeatOk: heartbeat.ok,
          releaseAttemptCompletedAt: release.attempt.completedAt,
          releaseAttemptStatus: release.attempt.status,
          releaseLeaseReleasedAt: release.lease.releasedAt,
          releaseLeaseStatus: release.lease.status,
          releaseOk: release.ok,
          releasedHeartbeatCode: releasedHeartbeat.ok ? undefined : releasedHeartbeat.code,
          secondStartOk: second.ok,
          wrongHeartbeatCode: wrongHeartbeat.ok ? undefined : wrongHeartbeat.code,
        };
      }

      async function runStatusDerivationCheck(storage) {
        const targetId = INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID;
        const actor = {
          actorId: "runner:primary",
          kind: "runner",
          runnerId: "runner.primary",
        } as const;
        const noTarget = readLatestDeploymentStatus(storage, {
          now: "2026-05-28T00:00:00.000Z",
          targetId,
        });
        const firstDesired = await materializeDeploymentDesiredStateVersion(storage, {
          now: "2026-05-28T00:00:30.000Z",
          resourceGraph: { resources: [], targetId },
          source: { fingerprint: "intent:status:first", intentRevision: 1 },
          targetId,
        });
        const firstDesiredRef = desiredStateRef(firstDesired);
        const firstAttempt = startDeploymentAttempt(storage, {
          actor,
          desiredState: firstDesiredRef,
          idempotencyKey: "apply:primary:status:first",
          mode: "apply",
          now: "2026-05-28T00:01:00.000Z",
        });
        if (!firstAttempt.ok || !firstAttempt.lease) {
          throw new Error("Status derivation first attempt did not acquire a lease.");
        }
        const active = readLatestDeploymentStatus(storage, {
          now: "2026-05-28T00:01:30.000Z",
          targetId,
        });
        const success = writeDeploymentAttemptSuccess(storage, {
          alchemy: { app: "formless", scope: "instance.primary", stage: "prod" },
          attemptId: firstAttempt.attempt.attemptId,
          desiredState: firstDesiredRef,
          evidence: [],
          leaseToken: firstAttempt.lease.token,
          now: "2026-05-28T00:02:00.000Z",
          runnerId: "runner.primary",
        });
        if (!success.ok) {
          throw new Error("Status derivation success writeback failed.");
        }
        const deployed = readLatestDeploymentStatus(storage, {
          now: "2026-05-28T00:02:30.000Z",
          targetId,
        });
        const driftReport = writeDeploymentDriftReport(storage, {
          actor,
          desiredState: firstDesiredRef,
          now: "2026-05-28T00:03:00.000Z",
          status: "drifted",
          summary: {
            affectedLogicalIds: ["custom-domain:app.example.com"],
            create: 0,
            delete: 0,
            update: 1,
          },
        });
        if (!driftReport.ok) {
          throw new Error("Status derivation drift writeback failed.");
        }
        const drift = readLatestDeploymentStatus(storage, {
          now: "2026-05-28T00:03:30.000Z",
          targetId,
        });
        const secondDesired = await materializeDeploymentDesiredStateVersion(storage, {
          now: "2026-05-28T00:04:00.000Z",
          resourceGraph: { resources: [], targetId },
          source: { fingerprint: "intent:status:second", intentRevision: 2 },
          targetId,
        });
        const pending = readLatestDeploymentStatus(storage, {
          now: "2026-05-28T00:04:30.000Z",
          targetId,
        });
        const secondDesiredRef = desiredStateRef(secondDesired);
        const secondAttempt = startDeploymentAttempt(storage, {
          actor,
          desiredState: secondDesiredRef,
          idempotencyKey: "apply:primary:status:second",
          mode: "apply",
          now: "2026-05-28T00:04:40.000Z",
        });
        if (!secondAttempt.ok || !secondAttempt.lease) {
          throw new Error("Status derivation second attempt did not acquire a lease.");
        }
        const failure = writeDeploymentAttemptFailure(storage, {
          actor,
          attemptId: secondAttempt.attempt.attemptId,
          desiredState: secondDesiredRef,
          leaseToken: secondAttempt.lease.token,
          now: "2026-05-28T00:05:00.000Z",
          runnerId: "runner.primary",
          summary: {
            code: "provider-error",
            details: "Cloudflare rejected the mutation.",
            displayMessage: "Provider apply failed.",
          },
        });
        if (!failure.ok) {
          throw new Error("Status derivation failure writeback failed.");
        }
        const failedCurrent = readLatestDeploymentStatus(storage, {
          now: "2026-05-28T00:05:30.000Z",
          targetId,
        });
        await materializeDeploymentDesiredStateVersion(storage, {
          now: "2026-05-28T00:06:00.000Z",
          resourceGraph: { resources: [], targetId },
          source: { fingerprint: "intent:status:third", intentRevision: 3 },
          targetId,
        });
        const failedOlder = readLatestDeploymentStatus(storage, {
          now: "2026-05-28T00:06:30.000Z",
          targetId,
        });

        return {
          active: {
            leaseExpiresAt: active.state === "in-progress" ? active.leaseExpiresAt : undefined,
            mode: active.state === "in-progress" ? active.mode : undefined,
            state: active.state,
          },
          deployed: {
            deployedAt: deployed.state === "deployed" ? deployed.deployedAt : undefined,
            state: deployed.state,
          },
          drift: {
            affectedLogicalIds:
              drift.state === "drift" ? drift.report.summary.affectedLogicalIds : undefined,
            state: drift.state,
          },
          failedCurrent: {
            code:
              failedCurrent.state === "failed-current-version"
                ? failedCurrent.summary.code
                : undefined,
            failedAt:
              failedCurrent.state === "failed-current-version" ? failedCurrent.failedAt : undefined,
            state: failedCurrent.state,
          },
          failedOlder: {
            failedRevision:
              failedOlder.state === "failed-older-version"
                ? failedOlder.failedDesiredState.revision
                : undefined,
            latestRevision:
              failedOlder.state === "failed-older-version"
                ? failedOlder.latestDesiredState.revision
                : undefined,
            state: failedOlder.state,
          },
          noTarget: {
            state: noTarget.state,
          },
          pending: {
            latestRevision:
              pending.state === "pending-changes"
                ? pending.latestDesiredState.revision
                : undefined,
            latestSuccessfulRevision:
              pending.state === "pending-changes"
                ? pending.latestSuccessfulDesiredState?.revision
                : undefined,
            state: pending.state,
          },
        };
      }

      function desiredStateRef(desiredState) {
        return {
          hash: desiredState.hash,
          revision: desiredState.revision,
          targetId: desiredState.targetId,
          versionId: desiredState.versionId,
        };
      }

      function runConstraintCheck(storage) {
        const hash = "sha256:" + "a".repeat(64);
        const otherHash = "sha256:" + "b".repeat(64);
        const now = "2026-05-28T00:00:00.000Z";
        const later = "2026-05-28T00:05:00.000Z";
        const actorJson = JSON.stringify({ actorId: "runner:primary", kind: "runner" });

        insertDesiredStateVersion(storage, {
          versionId: "version-1",
          targetId: "primary",
          revision: 1,
          hash,
          now,
        });

        const duplicateRevisionRejected = statementFails(() =>
          insertDesiredStateVersion(storage, {
            versionId: "version-2",
            targetId: "primary",
            revision: 1,
            hash: otherHash,
            now,
          })
        );

        const sameRevisionOtherTargetAllowed = statementSucceeds(() =>
          insertDesiredStateVersion(storage, {
            versionId: "version-3",
            targetId: "secondary",
            revision: 1,
            hash: otherHash,
            now,
          })
        );

        const invalidAttemptStatusRejected = statementFails(() =>
          storage.sql.exec(
            \`
              INSERT INTO instance_deployment_attempts (
                attempt_id,
                target_id,
                version_id,
                revision,
                hash,
                mode,
                status,
                idempotency_key,
                actor_id,
                actor_kind,
                actor_json,
                started_at,
                updated_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            \`,
            "attempt-1",
            "primary",
            "version-1",
            1,
            hash,
            "apply",
            "ready",
            "idempotency-1",
            "runner:primary",
            "runner",
            actorJson,
            now,
            now,
          )
        );

        insertLease(storage, {
          leaseId: "lease-1",
          targetId: "primary",
          attemptId: "attempt-lease-1",
          status: "active",
          actorJson,
          acquiredAt: now,
          expiresAt: later,
        });

        const activeLeaseTargetScoped = statementFails(() =>
          insertLease(storage, {
            leaseId: "lease-2",
            targetId: "primary",
            attemptId: "attempt-lease-2",
            status: "active",
            actorJson,
            acquiredAt: now,
            expiresAt: later,
          })
        );

        const releasedLeaseSameTargetAllowed = statementSucceeds(() =>
          insertLease(storage, {
            leaseId: "lease-3",
            targetId: "primary",
            attemptId: "attempt-lease-3",
            status: "released",
            actorJson,
            acquiredAt: now,
            expiresAt: later,
            releasedAt: later,
          })
        );

        return {
          activeLeaseTargetScoped,
          duplicateRevisionRejected,
          invalidAttemptStatusRejected,
          releasedLeaseSameTargetAllowed,
          sameRevisionOtherTargetAllowed,
        };
      }

      function insertDesiredStateVersion(storage, input) {
        storage.sql.exec(
          \`
            INSERT INTO instance_deployment_desired_state_versions (
              version_id,
              target_id,
              revision,
              hash,
              schema_version,
              source_fingerprint,
              source_intent_revision,
              resource_graph_json,
              display_json,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          \`,
          input.versionId,
          input.targetId,
          input.revision,
          input.hash,
          1,
          "intent:fingerprint",
          input.revision,
          JSON.stringify({ resources: [], targetId: input.targetId }),
          JSON.stringify({ resourceCount: 0, resourcesByKind: {} }),
          input.now,
        );
      }

      function insertLease(storage, input) {
        storage.sql.exec(
          \`
            INSERT INTO instance_deployment_leases (
              lease_id,
              target_id,
              attempt_id,
              mode,
              status,
              token,
              actor_id,
              actor_kind,
              actor_json,
              acquired_at,
              expires_at,
              released_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          \`,
          input.leaseId,
          input.targetId,
          input.attemptId,
          "apply",
          input.status,
          input.leaseId + ":token",
          "runner:primary",
          "runner",
          input.actorJson,
          input.acquiredAt,
          input.expiresAt,
          input.releasedAt ?? null,
        );
      }

      function statementFails(operation) {
        try {
          operation();
          return false;
        } catch {
          return true;
        }
      }

      function statementSucceeds(operation) {
        try {
          operation();
          return true;
        } catch {
          return false;
        }
      }

      function storageObjectNames(storage, type, allowedNames) {
        const allowed = new Set(allowedNames);
        return storage.sql
          .exec("SELECT name FROM sqlite_master WHERE type = ? ORDER BY name ASC", type)
          .toArray()
          .map((row) => row.name)
          .filter((name) => allowed.has(name));
      }

      function tableDefinitions(storage, tableNames) {
        const allowed = new Set(tableNames);
        return Object.fromEntries(
          storage.sql
            .exec("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name ASC")
            .toArray()
            .filter((row) => allowed.has(row.name))
            .map((row) => [row.name, row.sql])
        );
      }
    `,
  );

  return harnessPath;
}
