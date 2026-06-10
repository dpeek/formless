import {
  canonicalizeDeploymentResourceGraph,
  computeDeploymentDesiredStateHash,
  deploymentAttemptModes,
  deploymentAttemptStatuses,
  deploymentDesiredStateVersionRefsEqual,
  type DeploymentActor,
  type DeploymentActorKind,
  type DeploymentAlchemyStatePointer,
  type DeploymentAttempt,
  type DeploymentAttemptId,
  type DeploymentAttemptMode,
  type DeploymentAttemptStatus,
  type DeploymentDesiredStateDisplaySummary,
  type DeploymentDesiredStateVersionRef,
  type DeploymentDesiredStateSource,
  type DeploymentDesiredStateVersion,
  type DeploymentDriftReport,
  type DeploymentDriftReportId,
  type DeploymentDriftStatus,
  type DeploymentEvidenceAction,
  type DeploymentFailureResult,
  type DeploymentFailureSummary,
  type DeploymentIdempotencyKey,
  type DeploymentLease,
  type DeploymentLeaseId,
  type DeploymentLeaseStatus,
  type DeploymentLeaseToken,
  type DeploymentPlanResult,
  type DeploymentPlanSummary,
  type DeploymentProviderFamily,
  type DeploymentResourceEvidenceSummary,
  type DeploymentResourceGraph,
  type DeploymentResourceKind,
  type DeploymentRunnerId,
  type DeploymentStatus,
  type DeploymentSuccessResult,
  type DeploymentTargetId,
} from "../shared/deployment-runtime.ts";

export const INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID = "instance.primary" as DeploymentTargetId;

export const INSTANCE_DEPLOYMENT_RUNTIME_TABLES = [
  "instance_deployment_desired_state_versions",
  "instance_deployment_attempts",
  "instance_deployment_leases",
  "instance_deployment_evidence_summaries",
  "instance_deployment_drift_reports",
] as const;

export const INSTANCE_DEPLOYMENT_RUNTIME_INDEXES = [
  "instance_deployment_desired_state_versions_latest_idx",
  "instance_deployment_attempts_by_target_idx",
  "instance_deployment_attempts_by_version_idx",
  "instance_deployment_attempts_idempotency_idx",
  "instance_deployment_leases_by_target_idx",
  "instance_deployment_active_leases_by_target_idx",
  "instance_deployment_evidence_by_version_idx",
  "instance_deployment_drift_reports_by_target_idx",
] as const;

const deploymentActorKinds = [
  "ci",
  "cli",
  "runner",
  "system",
] as const satisfies readonly DeploymentActorKind[];
const deploymentDriftStatuses = [
  "drifted",
  "in-sync",
  "unknown",
] as const satisfies readonly DeploymentDriftStatus[];
const deploymentEvidenceActions = [
  "adopted",
  "created",
  "deleted",
  "no-change",
  "updated",
] as const satisfies readonly DeploymentEvidenceAction[];
const deploymentLeaseStatuses = [
  "active",
  "expired",
  "released",
] as const satisfies readonly DeploymentLeaseStatus[];
const deploymentProviderFamilies = [
  "cloudflare",
] as const satisfies readonly DeploymentProviderFamily[];
const mutatingDeploymentAttemptModes = ["apply", "destroy"] as const satisfies readonly Exclude<
  DeploymentAttemptMode,
  "plan"
>[];

type DesiredStateVersionRow = {
  created_at: string;
  display_json: string;
  hash: string;
  resource_graph_json: string;
  revision: number;
  schema_version: 1;
  source_fingerprint: string;
  source_intent_revision: number;
  target_id: string;
  version_id: string;
};

type DeploymentAttemptRow = {
  actor_json: string;
  attempt_id: string;
  completed_at: string | null;
  hash: string;
  idempotency_key: string;
  lease_id: string | null;
  mode: DeploymentAttemptMode;
  plan_result_json: string | null;
  result_json: string | null;
  revision: number;
  runner_id: string | null;
  started_at: string;
  status: DeploymentAttempt["status"];
  target_id: string;
  updated_at: string;
  version_id: string;
};

type DeploymentLeaseRow = {
  actor_json: string;
  acquired_at: string;
  attempt_id: string;
  expires_at: string;
  lease_id: string;
  mode: Exclude<DeploymentAttemptMode, "plan">;
  released_at: string | null;
  status: DeploymentLeaseStatus;
  target_id: string;
  token: string;
};

type DeploymentDriftReportRow = {
  actor_json: string;
  hash: string;
  report_id: string;
  reported_at: string;
  revision: number;
  status: DeploymentDriftStatus;
  summary_json: string;
  target_id: string;
  version_id: string;
};

export type MaterializeDeploymentDesiredStateVersionInput = {
  now: string;
  resourceGraph: DeploymentResourceGraph;
  source: DeploymentDesiredStateSource;
  targetId: DeploymentTargetId;
  title?: string;
};

export type StartDeploymentAttemptInput = {
  actor: DeploymentActor;
  desiredState: DeploymentDesiredStateVersionRef;
  idempotencyKey: DeploymentIdempotencyKey;
  mode: DeploymentAttemptMode;
  now: string;
};

export type StartDeploymentAttemptResult =
  | {
      attempt: DeploymentAttempt;
      lease?: DeploymentLease;
      ok: true;
      replayed: boolean;
    }
  | {
      code:
        | "deployment-attempt-active-lease"
        | "deployment-desired-state-missing"
        | "deployment-desired-state-stale";
      error: string;
      ok: false;
      status: 409;
    };

export type HeartbeatDeploymentAttemptLeaseInput = {
  attemptId: DeploymentAttemptId;
  desiredState: DeploymentDesiredStateVersionRef;
  leaseToken: DeploymentLeaseToken;
  now: string;
};

export type HeartbeatDeploymentAttemptLeaseResult =
  | {
      attempt: DeploymentAttempt;
      lease: DeploymentLease;
      ok: true;
    }
  | DeploymentLeaseOperationError;

export type ReleaseDeploymentAttemptLeaseForTerminalWritebackInput = {
  attemptId: DeploymentAttemptId;
  desiredState: DeploymentDesiredStateVersionRef;
  leaseToken: DeploymentLeaseToken;
  now: string;
  terminalStatus: Extract<DeploymentAttemptStatus, "failed" | "succeeded">;
};

export type ReleaseDeploymentAttemptLeaseForTerminalWritebackResult =
  | {
      attempt: DeploymentAttempt;
      lease: DeploymentLease;
      ok: true;
    }
  | DeploymentLeaseOperationError;

export type WriteDeploymentAttemptPlanInput = {
  attemptId: DeploymentAttemptId;
  desiredState: DeploymentDesiredStateVersionRef;
  now: string;
  runnerId?: DeploymentRunnerId;
  summary: DeploymentPlanSummary;
};

export type WriteDeploymentAttemptPlanResult =
  | {
      attempt: DeploymentAttempt;
      ok: true;
      plan: DeploymentPlanResult;
    }
  | DeploymentAttemptWritebackError;

export type WriteDeploymentAttemptSuccessInput = {
  alchemy: DeploymentAlchemyStatePointer;
  attemptId: DeploymentAttemptId;
  desiredState: DeploymentDesiredStateVersionRef;
  evidence: DeploymentResourceEvidenceSummary[];
  leaseToken: DeploymentLeaseToken;
  now: string;
  runnerId?: DeploymentRunnerId;
};

export type WriteDeploymentAttemptSuccessResult =
  | {
      attempt: DeploymentAttempt;
      lease: DeploymentLease;
      ok: true;
      result: DeploymentSuccessResult;
    }
  | DeploymentAttemptWritebackError;

export type WriteDeploymentAttemptFailureInput = {
  actor: DeploymentActor;
  attemptId: DeploymentAttemptId;
  desiredState: DeploymentDesiredStateVersionRef;
  leaseToken?: DeploymentLeaseToken;
  now: string;
  runnerId?: DeploymentRunnerId;
  summary: DeploymentFailureSummary;
};

export type WriteDeploymentAttemptFailureResult =
  | {
      attempt: DeploymentAttempt;
      lease?: DeploymentLease;
      ok: true;
      result: DeploymentFailureResult;
    }
  | DeploymentAttemptWritebackError;

export type WriteDeploymentDriftReportInput = {
  actor: DeploymentActor;
  desiredState: DeploymentDesiredStateVersionRef;
  now: string;
  status: DeploymentDriftStatus;
  summary: DeploymentDriftReport["summary"];
};

export type WriteDeploymentDriftReportResult =
  | {
      ok: true;
      report: DeploymentDriftReport;
    }
  | DeploymentDesiredStateWritebackError;

export type ReadLatestDeploymentStatusInput = {
  now: string;
  targetId: DeploymentTargetId;
};

type DeploymentAttemptWritebackError = {
  code:
    | DeploymentLeaseOperationError["code"]
    | "deployment-attempt-actor-mismatch"
    | "deployment-attempt-mode-mismatch"
    | "deployment-attempt-not-active"
    | "deployment-attempt-not-found"
    | "deployment-attempt-version-mismatch"
    | "deployment-lease-token-missing";
  error: string;
  ok: false;
  status: 404 | 409;
};

type DeploymentDesiredStateWritebackError = {
  code: "deployment-desired-state-missing" | "deployment-desired-state-stale";
  error: string;
  ok: false;
  status: 409;
};

type DeploymentLeaseOperationError = {
  code:
    | "deployment-attempt-not-active"
    | "deployment-attempt-not-found"
    | "deployment-attempt-version-mismatch"
    | "deployment-lease-missing"
    | "deployment-lease-not-active"
    | "deployment-lease-token-mismatch";
  error: string;
  ok: false;
  status: 404 | 409;
};

const deploymentLeaseDurationMs = 15 * 60 * 1000;
const actorKindSql = sqlStringList(deploymentActorKinds);
const attemptModeSql = sqlStringList(deploymentAttemptModes);
const attemptStatusSql = sqlStringList(deploymentAttemptStatuses);
const driftStatusSql = sqlStringList(deploymentDriftStatuses);
const evidenceActionSql = sqlStringList(deploymentEvidenceActions);
const leaseStatusSql = sqlStringList(deploymentLeaseStatuses);
const mutatingAttemptModeSql = sqlStringList(mutatingDeploymentAttemptModes);
const providerFamilySql = sqlStringList(deploymentProviderFamilies);

const desiredStateVersionsTableSql = `
  CREATE TABLE IF NOT EXISTS instance_deployment_desired_state_versions (
    version_id TEXT PRIMARY KEY,
    target_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 0),
    hash TEXT NOT NULL CHECK (length(hash) = 71 AND hash LIKE 'sha256:%'),
    schema_version INTEGER NOT NULL CHECK (schema_version = 1),
    source_fingerprint TEXT NOT NULL,
    source_intent_revision INTEGER NOT NULL CHECK (source_intent_revision >= 0),
    resource_graph_json TEXT NOT NULL,
    display_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (target_id, revision)
  )
`;

const attemptsTableSql = `
  CREATE TABLE IF NOT EXISTS instance_deployment_attempts (
    attempt_id TEXT PRIMARY KEY,
    target_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 0),
    hash TEXT NOT NULL CHECK (length(hash) = 71 AND hash LIKE 'sha256:%'),
    mode TEXT NOT NULL CHECK (mode IN (${attemptModeSql})),
    status TEXT NOT NULL CHECK (status IN (${attemptStatusSql})),
    idempotency_key TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN (${actorKindSql})),
    actor_json TEXT NOT NULL,
    runner_id TEXT,
    lease_id TEXT,
    plan_result_json TEXT,
    terminal_result_json TEXT,
    started_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  )
`;

const leasesTableSql = `
  CREATE TABLE IF NOT EXISTS instance_deployment_leases (
    lease_id TEXT PRIMARY KEY,
    target_id TEXT NOT NULL,
    attempt_id TEXT NOT NULL UNIQUE,
    mode TEXT NOT NULL CHECK (mode IN (${mutatingAttemptModeSql})),
    status TEXT NOT NULL CHECK (status IN (${leaseStatusSql})),
    token TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN (${actorKindSql})),
    actor_json TEXT NOT NULL,
    acquired_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    released_at TEXT
  )
`;

const evidenceSummariesTableSql = `
  CREATE TABLE IF NOT EXISTS instance_deployment_evidence_summaries (
    attempt_id TEXT NOT NULL,
    logical_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 0),
    hash TEXT NOT NULL CHECK (length(hash) = 71 AND hash LIKE 'sha256:%'),
    kind TEXT NOT NULL,
    provider_family TEXT NOT NULL CHECK (provider_family IN (${providerFamilySql})),
    action TEXT NOT NULL CHECK (action IN (${evidenceActionSql})),
    display_name TEXT,
    alchemy_resource_id TEXT,
    provider_resource_ids_json TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    PRIMARY KEY (attempt_id, logical_id)
  )
`;

const driftReportsTableSql = `
  CREATE TABLE IF NOT EXISTS instance_deployment_drift_reports (
    report_id TEXT PRIMARY KEY,
    target_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 0),
    hash TEXT NOT NULL CHECK (length(hash) = 71 AND hash LIKE 'sha256:%'),
    status TEXT NOT NULL CHECK (status IN (${driftStatusSql})),
    actor_id TEXT NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN (${actorKindSql})),
    actor_json TEXT NOT NULL,
    summary_json TEXT NOT NULL,
    reported_at TEXT NOT NULL
  )
`;

export function ensureInstanceDeploymentRuntimeTables(storage: DurableObjectStorage) {
  storage.sql.exec(`
    ${desiredStateVersionsTableSql};
    ${attemptsTableSql};
    ${leasesTableSql};
    ${evidenceSummariesTableSql};
    ${driftReportsTableSql};
  `);

  storage.sql.exec(`
    CREATE INDEX IF NOT EXISTS instance_deployment_desired_state_versions_latest_idx
      ON instance_deployment_desired_state_versions (target_id, revision DESC);

    CREATE INDEX IF NOT EXISTS instance_deployment_attempts_by_target_idx
      ON instance_deployment_attempts (target_id, status, updated_at DESC);

    CREATE INDEX IF NOT EXISTS instance_deployment_attempts_by_version_idx
      ON instance_deployment_attempts (target_id, version_id, updated_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS instance_deployment_attempts_idempotency_idx
      ON instance_deployment_attempts (target_id, version_id, idempotency_key);

    CREATE INDEX IF NOT EXISTS instance_deployment_leases_by_target_idx
      ON instance_deployment_leases (target_id, status, expires_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS instance_deployment_active_leases_by_target_idx
      ON instance_deployment_leases (target_id)
      WHERE status = 'active';

    CREATE INDEX IF NOT EXISTS instance_deployment_evidence_by_version_idx
      ON instance_deployment_evidence_summaries (target_id, version_id, logical_id);

    CREATE INDEX IF NOT EXISTS instance_deployment_drift_reports_by_target_idx
      ON instance_deployment_drift_reports (target_id, reported_at DESC);
  `);
}

export function resetInstanceDeploymentRuntimeTables(storage: DurableObjectStorage) {
  ensureInstanceDeploymentRuntimeTables(storage);

  storage.transactionSync(() => {
    storage.sql.exec(`
      DELETE FROM instance_deployment_evidence_summaries;
      DELETE FROM instance_deployment_drift_reports;
      DELETE FROM instance_deployment_leases;
      DELETE FROM instance_deployment_attempts;
      DELETE FROM instance_deployment_desired_state_versions;
    `);
  });
}

export function readLatestDeploymentDesiredStateVersion(
  storage: DurableObjectStorage,
  targetId: DeploymentTargetId,
): DeploymentDesiredStateVersion | undefined {
  ensureInstanceDeploymentRuntimeTables(storage);

  for (const row of storage.sql.exec<DesiredStateVersionRow>(
    `
      SELECT
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
      FROM instance_deployment_desired_state_versions
      WHERE target_id = ?
      ORDER BY revision DESC
      LIMIT 1
    `,
    targetId,
  )) {
    return desiredStateVersionFromRow(row);
  }

  return undefined;
}

export function readDeploymentDesiredStateVersion(
  storage: DurableObjectStorage,
  input: {
    targetId: DeploymentTargetId;
    versionId: string;
  },
): DeploymentDesiredStateVersion | undefined {
  ensureInstanceDeploymentRuntimeTables(storage);

  for (const row of storage.sql.exec<DesiredStateVersionRow>(
    `
      SELECT
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
      FROM instance_deployment_desired_state_versions
      WHERE target_id = ? AND version_id = ?
      LIMIT 1
    `,
    input.targetId,
    input.versionId,
  )) {
    return desiredStateVersionFromRow(row);
  }

  return undefined;
}

export function startDeploymentAttempt(
  storage: DurableObjectStorage,
  input: StartDeploymentAttemptInput,
): StartDeploymentAttemptResult {
  ensureInstanceDeploymentRuntimeTables(storage);

  return storage.transactionSync(() => {
    const existingAttempt = readDeploymentAttemptByIdempotencyKey(storage, {
      idempotencyKey: input.idempotencyKey,
      targetId: input.desiredState.targetId,
      versionId: input.desiredState.versionId,
    });

    if (existingAttempt) {
      if (!deploymentDesiredStateVersionRefsEqual(existingAttempt, input.desiredState)) {
        return desiredStateStaleResult(input.desiredState.targetId);
      }

      return {
        attempt: existingAttempt,
        lease: readDeploymentLeaseByAttemptId(storage, existingAttempt.attemptId),
        ok: true,
        replayed: true,
      };
    }

    const latest = readLatestDeploymentDesiredStateVersion(storage, input.desiredState.targetId);

    if (!latest) {
      return {
        code: "deployment-desired-state-missing",
        error: `Deployment target "${input.desiredState.targetId}" does not have desired state. Read desired state before starting an attempt.`,
        ok: false,
        status: 409,
      };
    }

    if (!deploymentDesiredStateVersionRefsEqual(latest, input.desiredState)) {
      return desiredStateStaleResult(input.desiredState.targetId);
    }

    expireDeploymentLeases(storage, {
      now: input.now,
      targetId: input.desiredState.targetId,
    });

    const mutatingMode = isMutatingDeploymentAttemptMode(input.mode);
    const activeLease = mutatingMode
      ? readActiveDeploymentLease(storage, input.desiredState.targetId)
      : undefined;

    if (activeLease) {
      return {
        code: "deployment-attempt-active-lease",
        error: `Deployment target "${input.desiredState.targetId}" already has an active ${activeLease.mode} attempt.`,
        ok: false,
        status: 409,
      };
    }

    const attemptId = `attempt.${crypto.randomUUID()}` as DeploymentAttemptId;
    const leaseId = mutatingMode
      ? (`lease.${crypto.randomUUID()}` as DeploymentLeaseId)
      : undefined;
    const leaseToken = mutatingMode
      ? (`lease:${crypto.randomUUID()}` as DeploymentLeaseToken)
      : undefined;
    const leaseExpiresAt = mutatingMode
      ? isoStringAfter(input.now, deploymentLeaseDurationMs)
      : undefined;

    storage.sql.exec(
      `
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
          runner_id,
          lease_id,
          started_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      attemptId,
      input.desiredState.targetId,
      input.desiredState.versionId,
      input.desiredState.revision,
      input.desiredState.hash,
      input.mode,
      "started",
      input.idempotencyKey,
      input.actor.actorId,
      input.actor.kind,
      JSON.stringify(input.actor),
      input.actor.runnerId ?? null,
      leaseId ?? null,
      input.now,
      input.now,
    );

    if (mutatingMode && leaseId && leaseToken && leaseExpiresAt) {
      storage.sql.exec(
        `
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
            expires_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        leaseId,
        input.desiredState.targetId,
        attemptId,
        input.mode,
        "active",
        leaseToken,
        input.actor.actorId,
        input.actor.kind,
        JSON.stringify(input.actor),
        input.now,
        leaseExpiresAt,
      );
    }

    const attempt = readDeploymentAttemptById(storage, attemptId);

    if (!attempt) {
      throw new Error(`Deployment attempt "${attemptId}" was not written.`);
    }

    return {
      attempt,
      lease: readDeploymentLeaseByAttemptId(storage, attempt.attemptId),
      ok: true,
      replayed: false,
    };
  });
}

export function heartbeatDeploymentAttemptLease(
  storage: DurableObjectStorage,
  input: HeartbeatDeploymentAttemptLeaseInput,
): HeartbeatDeploymentAttemptLeaseResult {
  ensureInstanceDeploymentRuntimeTables(storage);

  return storage.transactionSync(() => {
    const active = readActiveAttemptLeaseForExactVersion(storage, input);

    if (!active.ok) {
      return active;
    }

    const expiresAt = isoStringAfter(input.now, deploymentLeaseDurationMs);

    storage.sql.exec(
      `
        UPDATE instance_deployment_leases
        SET expires_at = ?
        WHERE lease_id = ?
      `,
      expiresAt,
      active.lease.leaseId,
    );

    storage.sql.exec(
      `
        UPDATE instance_deployment_attempts
        SET updated_at = ?
        WHERE attempt_id = ?
      `,
      input.now,
      active.attempt.attemptId,
    );

    const attempt = readDeploymentAttemptById(storage, active.attempt.attemptId);
    const lease = readDeploymentLeaseByAttemptId(storage, active.attempt.attemptId);

    if (!attempt || !lease) {
      throw new Error(`Deployment lease heartbeat for "${input.attemptId}" was not written.`);
    }

    return { attempt, lease, ok: true };
  });
}

export function releaseDeploymentAttemptLeaseForTerminalWriteback(
  storage: DurableObjectStorage,
  input: ReleaseDeploymentAttemptLeaseForTerminalWritebackInput,
): ReleaseDeploymentAttemptLeaseForTerminalWritebackResult {
  ensureInstanceDeploymentRuntimeTables(storage);

  return storage.transactionSync(() => {
    const active = readActiveAttemptLeaseForExactVersion(storage, input);

    if (!active.ok) {
      return active;
    }

    storage.sql.exec(
      `
        UPDATE instance_deployment_attempts
        SET status = ?, updated_at = ?, completed_at = ?
        WHERE attempt_id = ?
      `,
      input.terminalStatus,
      input.now,
      input.now,
      active.attempt.attemptId,
    );

    storage.sql.exec(
      `
        UPDATE instance_deployment_leases
        SET status = 'released', released_at = ?
        WHERE lease_id = ?
      `,
      input.now,
      active.lease.leaseId,
    );

    const attempt = readDeploymentAttemptById(storage, active.attempt.attemptId);
    const lease = readDeploymentLeaseByAttemptId(storage, active.attempt.attemptId);

    if (!attempt || !lease) {
      throw new Error(
        `Deployment terminal lease release for "${input.attemptId}" was not written.`,
      );
    }

    return { attempt, lease, ok: true };
  });
}

export function writeDeploymentAttemptPlan(
  storage: DurableObjectStorage,
  input: WriteDeploymentAttemptPlanInput,
): WriteDeploymentAttemptPlanResult {
  ensureInstanceDeploymentRuntimeTables(storage);

  return storage.transactionSync(() => {
    const active = readStartedDeploymentAttemptForExactVersion(storage, input);

    if (!active.ok) {
      return active;
    }

    const runnerId = input.runnerId ?? active.attempt.runnerId;
    const plan: DeploymentPlanResult = {
      attemptId: active.attempt.attemptId,
      hash: input.desiredState.hash,
      kind: "plan",
      recordedAt: input.now,
      revision: input.desiredState.revision,
      ...(runnerId === undefined ? {} : { runnerId }),
      summary: input.summary,
      targetId: input.desiredState.targetId,
      versionId: input.desiredState.versionId,
    };
    const completedAt = active.attempt.mode === "plan" ? input.now : active.attempt.completedAt;
    const nextStatus = active.attempt.mode === "plan" ? "planned" : active.attempt.status;

    storage.sql.exec(
      `
        UPDATE instance_deployment_attempts
        SET
          status = ?,
          runner_id = ?,
          plan_result_json = ?,
          updated_at = ?,
          completed_at = ?
        WHERE attempt_id = ?
      `,
      nextStatus,
      runnerId ?? null,
      JSON.stringify(plan),
      input.now,
      completedAt ?? null,
      active.attempt.attemptId,
    );

    const attempt = readDeploymentAttemptById(storage, active.attempt.attemptId);

    if (!attempt?.plan) {
      throw new Error(`Deployment plan writeback for "${input.attemptId}" was not written.`);
    }

    return { attempt, ok: true, plan: attempt.plan };
  });
}

export function writeDeploymentAttemptSuccess(
  storage: DurableObjectStorage,
  input: WriteDeploymentAttemptSuccessInput,
): WriteDeploymentAttemptSuccessResult {
  ensureInstanceDeploymentRuntimeTables(storage);

  return storage.transactionSync(() => {
    const active = readActiveMutatingAttemptLeaseForExactVersion(storage, input);

    if (!active.ok) {
      return active;
    }

    const runnerId = input.runnerId ?? active.attempt.runnerId;
    const result: DeploymentSuccessResult = {
      alchemy: input.alchemy,
      attemptId: active.attempt.attemptId,
      completedAt: input.now,
      evidence: input.evidence,
      hash: input.desiredState.hash,
      kind: "success",
      revision: input.desiredState.revision,
      ...(runnerId === undefined ? {} : { runnerId }),
      targetId: input.desiredState.targetId,
      versionId: input.desiredState.versionId,
    };

    writeDeploymentResourceEvidenceSummaries(storage, {
      attemptId: active.attempt.attemptId,
      desiredState: input.desiredState,
      evidence: input.evidence,
      now: input.now,
    });

    storage.sql.exec(
      `
        UPDATE instance_deployment_attempts
        SET
          status = 'succeeded',
          runner_id = ?,
          terminal_result_json = ?,
          updated_at = ?,
          completed_at = ?
        WHERE attempt_id = ?
      `,
      runnerId ?? null,
      JSON.stringify(result),
      input.now,
      input.now,
      active.attempt.attemptId,
    );

    releaseDeploymentLease(storage, {
      leaseId: active.lease.leaseId,
      now: input.now,
    });

    const attempt = readDeploymentAttemptById(storage, active.attempt.attemptId);
    const lease = readDeploymentLeaseByAttemptId(storage, active.attempt.attemptId);

    if (!attempt?.result || !lease) {
      throw new Error(`Deployment success writeback for "${input.attemptId}" was not written.`);
    }

    if (attempt.result.kind !== "success") {
      throw new Error(`Deployment success writeback for "${input.attemptId}" stored failure.`);
    }

    return { attempt, lease, ok: true, result: attempt.result };
  });
}

export function writeDeploymentAttemptFailure(
  storage: DurableObjectStorage,
  input: WriteDeploymentAttemptFailureInput,
): WriteDeploymentAttemptFailureResult {
  ensureInstanceDeploymentRuntimeTables(storage);

  return storage.transactionSync(() => {
    const active = input.leaseToken
      ? readActiveMutatingAttemptLeaseForExactVersion(storage, {
          ...input,
          leaseToken: input.leaseToken,
        })
      : readStartedDeploymentAttemptForExactVersion(storage, input);

    if (!active.ok) {
      return active;
    }

    if (active.attempt.mode !== "plan" && !deploymentAttemptWritebackHasLease(active)) {
      return {
        code: "deployment-lease-token-missing",
        error: `Deployment attempt "${active.attempt.attemptId}" requires a lease token for failure writeback.`,
        ok: false,
        status: 409,
      };
    }

    if (!deploymentActorsEqual(active.attempt.actor, input.actor)) {
      return {
        code: "deployment-attempt-actor-mismatch",
        error: `Deployment attempt "${active.attempt.attemptId}" actor does not match the failure writeback actor.`,
        ok: false,
        status: 409,
      };
    }

    const runnerId = input.runnerId ?? active.attempt.runnerId;
    const result: DeploymentFailureResult = {
      actor: input.actor,
      attemptId: active.attempt.attemptId,
      failedAt: input.now,
      hash: input.desiredState.hash,
      kind: "failure",
      revision: input.desiredState.revision,
      ...(runnerId === undefined ? {} : { runnerId }),
      summary: input.summary,
      targetId: input.desiredState.targetId,
      versionId: input.desiredState.versionId,
    };

    storage.sql.exec(
      `
        UPDATE instance_deployment_attempts
        SET
          status = 'failed',
          runner_id = ?,
          terminal_result_json = ?,
          updated_at = ?,
          completed_at = ?
        WHERE attempt_id = ?
      `,
      runnerId ?? null,
      JSON.stringify(result),
      input.now,
      input.now,
      active.attempt.attemptId,
    );

    if (deploymentAttemptWritebackHasLease(active)) {
      releaseDeploymentLease(storage, {
        leaseId: active.lease.leaseId,
        now: input.now,
      });
    }

    const attempt = readDeploymentAttemptById(storage, active.attempt.attemptId);
    const lease = readDeploymentLeaseByAttemptId(storage, active.attempt.attemptId);

    if (!attempt?.result) {
      throw new Error(`Deployment failure writeback for "${input.attemptId}" was not written.`);
    }

    if (attempt.result.kind !== "failure") {
      throw new Error(`Deployment failure writeback for "${input.attemptId}" stored success.`);
    }

    return {
      attempt,
      ...(lease === undefined ? {} : { lease }),
      ok: true,
      result: attempt.result,
    };
  });
}

export function writeDeploymentDriftReport(
  storage: DurableObjectStorage,
  input: WriteDeploymentDriftReportInput,
): WriteDeploymentDriftReportResult {
  ensureInstanceDeploymentRuntimeTables(storage);

  return storage.transactionSync(() => {
    const desiredState = readDeploymentDesiredStateVersion(storage, {
      targetId: input.desiredState.targetId,
      versionId: input.desiredState.versionId,
    });

    if (!desiredState) {
      return {
        code: "deployment-desired-state-missing",
        error: `Deployment desired-state version "${input.desiredState.versionId}" was not found.`,
        ok: false,
        status: 409,
      };
    }

    if (!deploymentDesiredStateVersionRefsEqual(desiredState, input.desiredState)) {
      return desiredStateStaleResult(input.desiredState.targetId);
    }

    const reportId = `drift.${crypto.randomUUID()}` as DeploymentDriftReportId;
    const report: DeploymentDriftReport = {
      actor: input.actor,
      hash: input.desiredState.hash,
      reportedAt: input.now,
      reportId,
      revision: input.desiredState.revision,
      status: input.status,
      summary: input.summary,
      targetId: input.desiredState.targetId,
      versionId: input.desiredState.versionId,
    };

    storage.sql.exec(
      `
        INSERT INTO instance_deployment_drift_reports (
          report_id,
          target_id,
          version_id,
          revision,
          hash,
          status,
          actor_id,
          actor_kind,
          actor_json,
          summary_json,
          reported_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      report.reportId,
      report.targetId,
      report.versionId,
      report.revision,
      report.hash,
      report.status,
      report.actor.actorId,
      report.actor.kind,
      JSON.stringify(report.actor),
      JSON.stringify(report.summary),
      report.reportedAt,
    );

    const written = readDeploymentDriftReportById(storage, report.reportId);

    if (!written) {
      throw new Error(`Deployment drift report "${report.reportId}" was not written.`);
    }

    return { ok: true, report: written };
  });
}

export function readLatestDeploymentStatus(
  storage: DurableObjectStorage,
  input: ReadLatestDeploymentStatusInput,
): DeploymentStatus {
  ensureInstanceDeploymentRuntimeTables(storage);

  return storage.transactionSync(() => {
    expireDeploymentLeases(storage, {
      now: input.now,
      targetId: input.targetId,
    });

    const latestDesiredState = readLatestDeploymentDesiredStateVersion(storage, input.targetId);

    if (!latestDesiredState) {
      return {
        checkedAt: input.now,
        state: "no-target",
      };
    }

    const activeAttempt = readActiveDeploymentAttempt(storage, input.targetId);

    if (activeAttempt) {
      return {
        actor: activeAttempt.attempt.actor,
        attemptId: activeAttempt.attempt.attemptId,
        checkedAt: input.now,
        desiredState: desiredStateRefFromAttempt(activeAttempt.attempt),
        ...(activeAttempt.lease === undefined
          ? {}
          : { leaseExpiresAt: activeAttempt.lease.expiresAt }),
        mode: activeAttempt.attempt.mode,
        startedAt: activeAttempt.attempt.startedAt,
        state: "in-progress",
        targetId: input.targetId,
      };
    }

    const currentVersionFailure = readLatestFailedDeploymentAttemptForVersion(
      storage,
      latestDesiredState,
    );
    const currentVersionSuccess = readLatestSuccessfulDeploymentAttemptForVersion(
      storage,
      latestDesiredState,
    );

    if (
      currentVersionFailure?.result?.kind === "failure" &&
      (!currentVersionSuccess?.completedAt ||
        !isTimestampAfter(currentVersionSuccess.completedAt, currentVersionFailure.result.failedAt))
    ) {
      return {
        attemptId: currentVersionFailure.attemptId,
        checkedAt: input.now,
        failedAt: currentVersionFailure.result.failedAt,
        latestDesiredState: desiredStateRefFromVersion(latestDesiredState),
        state: "failed-current-version",
        summary: currentVersionFailure.result.summary,
        targetId: input.targetId,
      };
    }

    const latestFailure = readLatestFailedDeploymentAttempt(storage, input.targetId);

    if (
      latestFailure?.result?.kind === "failure" &&
      !deploymentDesiredStateVersionRefsEqual(latestFailure, latestDesiredState)
    ) {
      return {
        attemptId: latestFailure.attemptId,
        checkedAt: input.now,
        failedAt: latestFailure.result.failedAt,
        failedDesiredState: desiredStateRefFromAttempt(latestFailure),
        latestDesiredState: desiredStateRefFromVersion(latestDesiredState),
        state: "failed-older-version",
        summary: latestFailure.result.summary,
        targetId: input.targetId,
      };
    }

    const latestSuccess = readLatestSuccessfulDeploymentAttempt(storage, input.targetId);

    if (
      !latestSuccess ||
      !deploymentDesiredStateVersionRefsEqual(latestSuccess, latestDesiredState)
    ) {
      return {
        checkedAt: input.now,
        latestDesiredState: desiredStateRefFromVersion(latestDesiredState),
        ...(latestSuccess === undefined
          ? {}
          : { latestSuccessfulDesiredState: desiredStateRefFromAttempt(latestSuccess) }),
        state: "pending-changes",
        targetId: input.targetId,
      };
    }

    const latestDrift = readLatestDeploymentDriftReport(storage, input.targetId);

    if (
      latestDrift?.status === "drifted" &&
      deploymentDesiredStateVersionRefsEqual(latestDrift, latestDesiredState)
    ) {
      return {
        checkedAt: input.now,
        latestDesiredState: desiredStateRefFromVersion(latestDesiredState),
        latestSuccessfulDesiredState: desiredStateRefFromAttempt(latestSuccess),
        report: latestDrift,
        state: "drift",
        targetId: input.targetId,
      };
    }

    return {
      attemptId: latestSuccess.attemptId,
      checkedAt: input.now,
      deployedAt: latestSuccess.completedAt ?? latestSuccess.updatedAt,
      latestDesiredState: desiredStateRefFromVersion(latestDesiredState),
      state: "deployed",
      targetId: input.targetId,
    };
  });
}

export async function materializeDeploymentDesiredStateVersion(
  storage: DurableObjectStorage,
  input: MaterializeDeploymentDesiredStateVersionInput,
): Promise<DeploymentDesiredStateVersion> {
  assertGraphTarget(input);
  ensureInstanceDeploymentRuntimeTables(storage);

  const resourceGraph = canonicalizeDeploymentResourceGraph(input.resourceGraph);
  const hash = await computeDeploymentDesiredStateHash({
    resourceGraph,
    schemaVersion: 1,
    targetId: input.targetId,
  });
  const display = deploymentDesiredStateDisplaySummary(resourceGraph, input.title);

  return storage.transactionSync(() => {
    const latest = readLatestDeploymentDesiredStateVersion(storage, input.targetId);

    if (
      latest &&
      latest.hash === hash &&
      latest.source.fingerprint === input.source.fingerprint &&
      latest.source.intentRevision === input.source.intentRevision
    ) {
      return latest;
    }

    const revision = (latest?.revision ?? 0) + 1;
    const versionId = deploymentDesiredStateVersionId(input.targetId, revision);

    storage.sql.exec(
      `
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
      `,
      versionId,
      input.targetId,
      revision,
      hash,
      1,
      input.source.fingerprint,
      input.source.intentRevision,
      JSON.stringify(resourceGraph),
      JSON.stringify(display),
      input.now,
    );

    const version = readDeploymentDesiredStateVersion(storage, {
      targetId: input.targetId,
      versionId,
    });

    if (!version) {
      throw new Error(`Deployment desired-state version "${versionId}" was not materialized.`);
    }

    return version;
  });
}

export function deploymentDesiredStateVersionId(
  targetId: DeploymentTargetId,
  revision: number,
): string {
  return `desired.${targetId}.${revision}`;
}

function readDeploymentAttemptById(
  storage: DurableObjectStorage,
  attemptId: DeploymentAttemptId,
): DeploymentAttempt | undefined {
  for (const row of storage.sql.exec<DeploymentAttemptRow>(
    `
      SELECT
        attempt_id,
        target_id,
        version_id,
        revision,
        hash,
        mode,
        status,
        idempotency_key,
        actor_json,
        runner_id,
        lease_id,
        plan_result_json,
        terminal_result_json AS result_json,
        started_at,
        updated_at,
        completed_at
      FROM instance_deployment_attempts
      WHERE attempt_id = ?
      LIMIT 1
    `,
    attemptId,
  )) {
    return deploymentAttemptFromRow(row);
  }

  return undefined;
}

function readDeploymentAttemptByIdempotencyKey(
  storage: DurableObjectStorage,
  input: {
    idempotencyKey: DeploymentIdempotencyKey;
    targetId: DeploymentTargetId;
    versionId: string;
  },
): DeploymentAttempt | undefined {
  for (const row of storage.sql.exec<DeploymentAttemptRow>(
    `
      SELECT
        attempt_id,
        target_id,
        version_id,
        revision,
        hash,
        mode,
        status,
        idempotency_key,
        actor_json,
        runner_id,
        lease_id,
        plan_result_json,
        terminal_result_json AS result_json,
        started_at,
        updated_at,
        completed_at
      FROM instance_deployment_attempts
      WHERE target_id = ? AND version_id = ? AND idempotency_key = ?
      LIMIT 1
    `,
    input.targetId,
    input.versionId,
    input.idempotencyKey,
  )) {
    return deploymentAttemptFromRow(row);
  }

  return undefined;
}

function readDeploymentLeaseByAttemptId(
  storage: DurableObjectStorage,
  attemptId: DeploymentAttemptId,
): DeploymentLease | undefined {
  for (const row of storage.sql.exec<DeploymentLeaseRow>(
    `
      SELECT
        lease_id,
        target_id,
        attempt_id,
        mode,
        status,
        token,
        actor_json,
        acquired_at,
        expires_at,
        released_at
      FROM instance_deployment_leases
      WHERE attempt_id = ?
      LIMIT 1
    `,
    attemptId,
  )) {
    return deploymentLeaseFromRow(row);
  }

  return undefined;
}

function readActiveDeploymentLease(
  storage: DurableObjectStorage,
  targetId: DeploymentTargetId,
): DeploymentLease | undefined {
  for (const row of storage.sql.exec<DeploymentLeaseRow>(
    `
      SELECT
        lease_id,
        target_id,
        attempt_id,
        mode,
        status,
        token,
        actor_json,
        acquired_at,
        expires_at,
        released_at
      FROM instance_deployment_leases
      WHERE target_id = ? AND status = 'active'
      ORDER BY expires_at DESC
      LIMIT 1
    `,
    targetId,
  )) {
    return deploymentLeaseFromRow(row);
  }

  return undefined;
}

function readActiveDeploymentAttempt(
  storage: DurableObjectStorage,
  targetId: DeploymentTargetId,
):
  | {
      attempt: DeploymentAttempt;
      lease?: DeploymentLease;
    }
  | undefined {
  const activeLease = readActiveDeploymentLease(storage, targetId);

  if (activeLease) {
    const attempt = readDeploymentAttemptById(storage, activeLease.attemptId);

    if (attempt?.status === "started") {
      return { attempt, lease: activeLease };
    }
  }

  return readLatestStartedPlanDeploymentAttempt(storage, targetId);
}

function readLatestStartedPlanDeploymentAttempt(
  storage: DurableObjectStorage,
  targetId: DeploymentTargetId,
): { attempt: DeploymentAttempt } | undefined {
  for (const row of storage.sql.exec<DeploymentAttemptRow>(
    `
      SELECT
        attempt_id,
        target_id,
        version_id,
        revision,
        hash,
        mode,
        status,
        idempotency_key,
        actor_json,
        runner_id,
        lease_id,
        plan_result_json,
        terminal_result_json AS result_json,
        started_at,
        updated_at,
        completed_at
      FROM instance_deployment_attempts
      WHERE target_id = ? AND mode = 'plan' AND status = 'started'
      ORDER BY updated_at DESC, started_at DESC
      LIMIT 1
    `,
    targetId,
  )) {
    return { attempt: deploymentAttemptFromRow(row) };
  }

  return undefined;
}

function readLatestSuccessfulDeploymentAttempt(
  storage: DurableObjectStorage,
  targetId: DeploymentTargetId,
): DeploymentAttempt | undefined {
  for (const row of storage.sql.exec<DeploymentAttemptRow>(
    `
      SELECT
        attempt_id,
        target_id,
        version_id,
        revision,
        hash,
        mode,
        status,
        idempotency_key,
        actor_json,
        runner_id,
        lease_id,
        plan_result_json,
        terminal_result_json AS result_json,
        started_at,
        updated_at,
        completed_at
      FROM instance_deployment_attempts
      WHERE target_id = ? AND status = 'succeeded' AND terminal_result_json IS NOT NULL
      ORDER BY revision DESC, completed_at DESC, updated_at DESC
      LIMIT 1
    `,
    targetId,
  )) {
    const attempt = deploymentAttemptFromRow(row);

    if (attempt.result?.kind === "success") {
      return attempt;
    }
  }

  return undefined;
}

function readLatestSuccessfulDeploymentAttemptForVersion(
  storage: DurableObjectStorage,
  desiredState: DeploymentDesiredStateVersionRef,
): DeploymentAttempt | undefined {
  for (const row of storage.sql.exec<DeploymentAttemptRow>(
    `
      SELECT
        attempt_id,
        target_id,
        version_id,
        revision,
        hash,
        mode,
        status,
        idempotency_key,
        actor_json,
        runner_id,
        lease_id,
        plan_result_json,
        terminal_result_json AS result_json,
        started_at,
        updated_at,
        completed_at
      FROM instance_deployment_attempts
      WHERE target_id = ?
        AND version_id = ?
        AND status = 'succeeded'
        AND terminal_result_json IS NOT NULL
      ORDER BY completed_at DESC, updated_at DESC
      LIMIT 1
    `,
    desiredState.targetId,
    desiredState.versionId,
  )) {
    const attempt = deploymentAttemptFromRow(row);

    if (
      attempt.result?.kind === "success" &&
      deploymentDesiredStateVersionRefsEqual(attempt, desiredState)
    ) {
      return attempt;
    }
  }

  return undefined;
}

function readLatestFailedDeploymentAttempt(
  storage: DurableObjectStorage,
  targetId: DeploymentTargetId,
): DeploymentAttempt | undefined {
  for (const row of storage.sql.exec<DeploymentAttemptRow>(
    `
      SELECT
        attempt_id,
        target_id,
        version_id,
        revision,
        hash,
        mode,
        status,
        idempotency_key,
        actor_json,
        runner_id,
        lease_id,
        plan_result_json,
        terminal_result_json AS result_json,
        started_at,
        updated_at,
        completed_at
      FROM instance_deployment_attempts
      WHERE target_id = ? AND status = 'failed' AND terminal_result_json IS NOT NULL
      ORDER BY completed_at DESC, updated_at DESC
      LIMIT 1
    `,
    targetId,
  )) {
    const attempt = deploymentAttemptFromRow(row);

    if (attempt.result?.kind === "failure") {
      return attempt;
    }
  }

  return undefined;
}

function readLatestFailedDeploymentAttemptForVersion(
  storage: DurableObjectStorage,
  desiredState: DeploymentDesiredStateVersionRef,
): DeploymentAttempt | undefined {
  for (const row of storage.sql.exec<DeploymentAttemptRow>(
    `
      SELECT
        attempt_id,
        target_id,
        version_id,
        revision,
        hash,
        mode,
        status,
        idempotency_key,
        actor_json,
        runner_id,
        lease_id,
        plan_result_json,
        terminal_result_json AS result_json,
        started_at,
        updated_at,
        completed_at
      FROM instance_deployment_attempts
      WHERE target_id = ?
        AND version_id = ?
        AND status = 'failed'
        AND terminal_result_json IS NOT NULL
      ORDER BY completed_at DESC, updated_at DESC
      LIMIT 1
    `,
    desiredState.targetId,
    desiredState.versionId,
  )) {
    const attempt = deploymentAttemptFromRow(row);

    if (
      attempt.result?.kind === "failure" &&
      deploymentDesiredStateVersionRefsEqual(attempt, desiredState)
    ) {
      return attempt;
    }
  }

  return undefined;
}

function readLatestDeploymentDriftReport(
  storage: DurableObjectStorage,
  targetId: DeploymentTargetId,
): DeploymentDriftReport | undefined {
  for (const row of storage.sql.exec<DeploymentDriftReportRow>(
    `
      SELECT
        report_id,
        target_id,
        version_id,
        revision,
        hash,
        status,
        actor_json,
        summary_json,
        reported_at
      FROM instance_deployment_drift_reports
      WHERE target_id = ?
      ORDER BY reported_at DESC
      LIMIT 1
    `,
    targetId,
  )) {
    return deploymentDriftReportFromRow(row);
  }

  return undefined;
}

function expireDeploymentLeases(
  storage: DurableObjectStorage,
  input: { now: string; targetId: DeploymentTargetId },
) {
  storage.sql.exec(
    `
      UPDATE instance_deployment_leases
      SET status = 'expired'
      WHERE target_id = ? AND status = 'active' AND expires_at <= ?
    `,
    input.targetId,
    input.now,
  );
}

function readStartedDeploymentAttemptForExactVersion(
  storage: DurableObjectStorage,
  input: {
    attemptId: DeploymentAttemptId;
    desiredState: DeploymentDesiredStateVersionRef;
  },
):
  | {
      attempt: DeploymentAttempt;
      ok: true;
    }
  | DeploymentAttemptWritebackError {
  const attempt = readDeploymentAttemptById(storage, input.attemptId);

  if (!attempt) {
    return {
      code: "deployment-attempt-not-found",
      error: `Deployment attempt "${input.attemptId}" was not found.`,
      ok: false,
      status: 404,
    };
  }

  if (!deploymentDesiredStateVersionRefsEqual(attempt, input.desiredState)) {
    return {
      code: "deployment-attempt-version-mismatch",
      error: `Deployment attempt "${attempt.attemptId}" does not match the requested desired-state version.`,
      ok: false,
      status: 409,
    };
  }

  if (attempt.status !== "started") {
    return {
      code: "deployment-attempt-not-active",
      error: `Deployment attempt "${attempt.attemptId}" is not active.`,
      ok: false,
      status: 409,
    };
  }

  return { attempt, ok: true };
}

function readActiveMutatingAttemptLeaseForExactVersion(
  storage: DurableObjectStorage,
  input: {
    attemptId: DeploymentAttemptId;
    desiredState: DeploymentDesiredStateVersionRef;
    leaseToken: DeploymentLeaseToken;
    now: string;
  },
):
  | {
      attempt: DeploymentAttempt;
      lease: DeploymentLease;
      ok: true;
    }
  | DeploymentAttemptWritebackError {
  const active = readActiveAttemptLeaseForExactVersion(storage, input);

  if (!active.ok) {
    return active;
  }

  if (active.attempt.mode === "plan") {
    return {
      code: "deployment-attempt-mode-mismatch",
      error: `Deployment attempt "${active.attempt.attemptId}" is a plan attempt and cannot write a mutating result.`,
      ok: false,
      status: 409,
    };
  }

  return active;
}

function deploymentAttemptWritebackHasLease(value: {
  attempt: DeploymentAttempt;
  ok: true;
}): value is {
  attempt: DeploymentAttempt;
  lease: DeploymentLease;
  ok: true;
} {
  return "lease" in value;
}

function readActiveAttemptLeaseForExactVersion(
  storage: DurableObjectStorage,
  input: {
    attemptId: DeploymentAttemptId;
    desiredState: DeploymentDesiredStateVersionRef;
    leaseToken: DeploymentLeaseToken;
    now: string;
  },
):
  | {
      attempt: DeploymentAttempt;
      lease: DeploymentLease;
      ok: true;
    }
  | DeploymentLeaseOperationError {
  const attempt = readDeploymentAttemptById(storage, input.attemptId);

  if (!attempt) {
    return {
      code: "deployment-attempt-not-found",
      error: `Deployment attempt "${input.attemptId}" was not found.`,
      ok: false,
      status: 404,
    };
  }

  if (!deploymentDesiredStateVersionRefsEqual(attempt, input.desiredState)) {
    return {
      code: "deployment-attempt-version-mismatch",
      error: `Deployment attempt "${attempt.attemptId}" does not match the requested desired-state version.`,
      ok: false,
      status: 409,
    };
  }

  if (attempt.status !== "started") {
    return {
      code: "deployment-attempt-not-active",
      error: `Deployment attempt "${attempt.attemptId}" is not active.`,
      ok: false,
      status: 409,
    };
  }

  if (attempt.mode === "plan" || !attempt.leaseId) {
    return {
      code: "deployment-lease-missing",
      error: `Deployment attempt "${attempt.attemptId}" does not have a mutating lease.`,
      ok: false,
      status: 409,
    };
  }

  expireDeploymentLeases(storage, {
    now: input.now,
    targetId: attempt.targetId,
  });

  const lease = readDeploymentLeaseByAttemptId(storage, attempt.attemptId);

  if (!lease || lease.leaseId !== attempt.leaseId) {
    return {
      code: "deployment-lease-missing",
      error: `Deployment attempt "${attempt.attemptId}" does not have a deployment lease.`,
      ok: false,
      status: 409,
    };
  }

  if (lease.token !== input.leaseToken) {
    return {
      code: "deployment-lease-token-mismatch",
      error: `Deployment lease token for attempt "${attempt.attemptId}" does not match.`,
      ok: false,
      status: 409,
    };
  }

  if (lease.status !== "active") {
    return {
      code: "deployment-lease-not-active",
      error: `Deployment lease "${lease.leaseId}" is ${lease.status}.`,
      ok: false,
      status: 409,
    };
  }

  return { attempt, lease, ok: true };
}

function releaseDeploymentLease(
  storage: DurableObjectStorage,
  input: {
    leaseId: DeploymentLeaseId;
    now: string;
  },
) {
  storage.sql.exec(
    `
      UPDATE instance_deployment_leases
      SET status = 'released', released_at = ?
      WHERE lease_id = ?
    `,
    input.now,
    input.leaseId,
  );
}

function writeDeploymentResourceEvidenceSummaries(
  storage: DurableObjectStorage,
  input: {
    attemptId: DeploymentAttemptId;
    desiredState: DeploymentDesiredStateVersionRef;
    evidence: DeploymentResourceEvidenceSummary[];
    now: string;
  },
) {
  for (const evidence of input.evidence) {
    storage.sql.exec(
      `
        INSERT INTO instance_deployment_evidence_summaries (
          attempt_id,
          logical_id,
          target_id,
          version_id,
          revision,
          hash,
          kind,
          provider_family,
          action,
          display_name,
          alchemy_resource_id,
          provider_resource_ids_json,
          recorded_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      input.attemptId,
      evidence.logicalId,
      input.desiredState.targetId,
      input.desiredState.versionId,
      input.desiredState.revision,
      input.desiredState.hash,
      evidence.kind,
      evidence.providerFamily,
      evidence.action,
      evidence.displayName ?? null,
      evidence.alchemyResourceId ?? null,
      JSON.stringify(evidence.providerResourceIds),
      input.now,
    );
  }
}

function readDeploymentDriftReportById(
  storage: DurableObjectStorage,
  reportId: DeploymentDriftReportId,
): DeploymentDriftReport | undefined {
  for (const row of storage.sql.exec<DeploymentDriftReportRow>(
    `
      SELECT
        report_id,
        target_id,
        version_id,
        revision,
        hash,
        status,
        actor_json,
        summary_json,
        reported_at
      FROM instance_deployment_drift_reports
      WHERE report_id = ?
      LIMIT 1
    `,
    reportId,
  )) {
    return deploymentDriftReportFromRow(row);
  }

  return undefined;
}

function deploymentAttemptFromRow(row: DeploymentAttemptRow): DeploymentAttempt {
  return {
    actor: JSON.parse(row.actor_json) as DeploymentActor,
    attemptId: row.attempt_id,
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at }),
    hash: row.hash,
    idempotencyKey: row.idempotency_key,
    ...(row.lease_id === null ? {} : { leaseId: row.lease_id }),
    mode: row.mode,
    ...(row.plan_result_json === null ? {} : { plan: JSON.parse(row.plan_result_json) }),
    ...(row.result_json === null ? {} : { result: JSON.parse(row.result_json) }),
    revision: row.revision,
    ...(row.runner_id === null ? {} : { runnerId: row.runner_id }),
    startedAt: row.started_at,
    status: row.status,
    targetId: row.target_id,
    updatedAt: row.updated_at,
    versionId: row.version_id,
  };
}

function deploymentDriftReportFromRow(row: DeploymentDriftReportRow): DeploymentDriftReport {
  return {
    actor: JSON.parse(row.actor_json) as DeploymentActor,
    hash: row.hash,
    reportedAt: row.reported_at,
    reportId: row.report_id,
    revision: row.revision,
    status: row.status,
    summary: JSON.parse(row.summary_json) as DeploymentDriftReport["summary"],
    targetId: row.target_id,
    versionId: row.version_id,
  };
}

function deploymentLeaseFromRow(row: DeploymentLeaseRow): DeploymentLease {
  return {
    acquiredAt: row.acquired_at,
    actor: JSON.parse(row.actor_json) as DeploymentActor,
    attemptId: row.attempt_id,
    expiresAt: row.expires_at,
    leaseId: row.lease_id,
    mode: row.mode,
    ...(row.released_at === null ? {} : { releasedAt: row.released_at }),
    status: row.status,
    targetId: row.target_id,
    token: row.token,
  };
}

function desiredStateRefFromAttempt(attempt: DeploymentAttempt): DeploymentDesiredStateVersionRef {
  return {
    hash: attempt.hash,
    revision: attempt.revision,
    targetId: attempt.targetId,
    versionId: attempt.versionId,
  };
}

function desiredStateRefFromVersion(
  version: DeploymentDesiredStateVersion,
): DeploymentDesiredStateVersionRef {
  return {
    hash: version.hash,
    revision: version.revision,
    targetId: version.targetId,
    versionId: version.versionId,
  };
}

function desiredStateStaleResult(targetId: DeploymentTargetId): {
  code: "deployment-desired-state-stale";
  error: string;
  ok: false;
  status: 409;
} {
  return {
    code: "deployment-desired-state-stale",
    error: `Deployment desired state for target "${targetId}" is stale. Read the latest desired state before starting an attempt.`,
    ok: false,
    status: 409,
  };
}

function deploymentActorsEqual(left: DeploymentActor, right: DeploymentActor): boolean {
  return (
    left.actorId === right.actorId && left.kind === right.kind && left.runnerId === right.runnerId
  );
}

function isMutatingDeploymentAttemptMode(
  mode: DeploymentAttemptMode,
): mode is Exclude<DeploymentAttemptMode, "plan"> {
  return mode === "apply" || mode === "destroy";
}

function isoStringAfter(now: string, durationMs: number): string {
  const time = new Date(now).getTime();

  if (!Number.isFinite(time)) {
    throw new Error(`Invalid deployment timestamp "${now}".`);
  }

  return new Date(time + durationMs).toISOString();
}

function isTimestampAfter(left: string, right: string): boolean {
  return Date.parse(left) > Date.parse(right);
}

function sqlStringList(values: readonly string[]): string {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ");
}

function assertGraphTarget(input: MaterializeDeploymentDesiredStateVersionInput) {
  if (input.resourceGraph.targetId !== input.targetId) {
    throw new Error(
      `Deployment resource graph target "${input.resourceGraph.targetId}" does not match target "${input.targetId}".`,
    );
  }

  for (const resource of input.resourceGraph.resources) {
    if (resource.targetId !== input.targetId) {
      throw new Error(
        `Deployment resource "${resource.logicalId}" target "${resource.targetId}" does not match target "${input.targetId}".`,
      );
    }
  }
}

function deploymentDesiredStateDisplaySummary(
  resourceGraph: DeploymentResourceGraph,
  title?: string,
): DeploymentDesiredStateDisplaySummary {
  const resourcesByKind: Partial<Record<DeploymentResourceKind, number>> = {};

  for (const resource of resourceGraph.resources) {
    resourcesByKind[resource.kind] = (resourcesByKind[resource.kind] ?? 0) + 1;
  }

  return {
    resourceCount: resourceGraph.resources.length,
    resourcesByKind: resourcesByKind as Record<DeploymentResourceKind, number>,
    ...(title === undefined ? {} : { title }),
  };
}

function desiredStateVersionFromRow(row: DesiredStateVersionRow): DeploymentDesiredStateVersion {
  return {
    createdAt: row.created_at,
    display: JSON.parse(row.display_json) as DeploymentDesiredStateDisplaySummary,
    hash: row.hash,
    resourceGraph: JSON.parse(row.resource_graph_json) as DeploymentResourceGraph,
    revision: row.revision,
    schemaVersion: row.schema_version,
    source: {
      fingerprint: row.source_fingerprint,
      intentRevision: row.source_intent_revision,
    },
    targetId: row.target_id,
    versionId: row.version_id,
  };
}
