import {
  buildInstanceDomainMappingAppliedState,
  buildInstanceDomainMapping,
  listInstanceDomainMappings,
  normalizeInstanceDomainHost,
  type BuildInstanceDomainMappingAppliedStateResult,
  type CreateInstanceDomainMappingInput,
  type CreateInstanceDomainMappingResult,
  type InstanceDomainMapping,
  type InstanceDomainMappingAppliedAction,
  type InstanceDomainMappingAppliedProvider,
  type InstanceDomainMappingAppliedState,
  type InstanceDomainMappingAuditEvent,
  type RecordInstanceDomainMappingApplyEvidenceRequest,
  type InstanceDomainMappingSurface,
} from "../shared/instance-domain-mappings.ts";
import { readInstanceAppInstalls } from "./instance-app-installs-state.ts";

type InstanceDomainMappingRow = {
  host: string;
  surface: InstanceDomainMappingSurface;
  install_id: string;
  enabled: number;
  created_at: string;
  updated_at: string;
};

type InstanceDomainMappingAppliedStateRow = {
  host: string;
  surface: InstanceDomainMappingSurface;
  install_id: string;
  provider: InstanceDomainMappingAppliedProvider;
  account_id: string;
  zone_id: string;
  zone_name: string;
  worker_name: string;
  worker_domain_id: string;
  action: InstanceDomainMappingAppliedAction;
  applied_at: string;
  updated_at: string;
};

type InstanceDomainMappingAuditEventRow = InstanceDomainMappingAppliedStateRow & {
  event_id: number;
};

export type RecordInstanceDomainMappingApplyEvidenceResult =
  | {
      ok: true;
      appliedState: InstanceDomainMappingAppliedState;
      appliedStates: InstanceDomainMappingAppliedState[];
      auditEvent: InstanceDomainMappingAuditEvent;
      auditEvents: InstanceDomainMappingAuditEvent[];
    }
  | Extract<BuildInstanceDomainMappingAppliedStateResult, { ok: false }>;

export function ensureInstanceDomainMappingTables(storage: DurableObjectStorage) {
  storage.sql.exec(`
    CREATE TABLE IF NOT EXISTS instance_domain_mappings (
      host TEXT NOT NULL,
      surface TEXT NOT NULL CHECK (surface = 'site'),
      install_id TEXT NOT NULL,
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (host, surface)
    );

    CREATE TABLE IF NOT EXISTS instance_domain_mapping_applied_state (
      host TEXT NOT NULL,
      surface TEXT NOT NULL CHECK (surface = 'site'),
      install_id TEXT NOT NULL,
      provider TEXT NOT NULL CHECK (provider = 'cloudflare-worker-custom-domain'),
      account_id TEXT NOT NULL,
      zone_id TEXT NOT NULL,
      zone_name TEXT NOT NULL,
      worker_name TEXT NOT NULL,
      worker_domain_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('adopted', 'created', 'overridden')),
      applied_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (host, surface)
    );

    CREATE TABLE IF NOT EXISTS instance_domain_mapping_audit_events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      host TEXT NOT NULL,
      surface TEXT NOT NULL CHECK (surface = 'site'),
      install_id TEXT NOT NULL,
      provider TEXT NOT NULL CHECK (provider = 'cloudflare-worker-custom-domain'),
      account_id TEXT NOT NULL,
      zone_id TEXT NOT NULL,
      zone_name TEXT NOT NULL,
      worker_name TEXT NOT NULL,
      worker_domain_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('adopted', 'created', 'overridden')),
      applied_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function readInstanceDomainMappings(storage: DurableObjectStorage): InstanceDomainMapping[] {
  ensureInstanceDomainMappingTables(storage);

  return listInstanceDomainMappings(readDomainMappings(storage));
}

export function readInstanceDomainMappingAppliedStates(
  storage: DurableObjectStorage,
): InstanceDomainMappingAppliedState[] {
  ensureInstanceDomainMappingTables(storage);

  return readAppliedStates(storage);
}

export function readInstanceDomainMappingAuditEvents(
  storage: DurableObjectStorage,
): InstanceDomainMappingAuditEvent[] {
  ensureInstanceDomainMappingTables(storage);

  return readAuditEvents(storage);
}

export function createInstanceDomainMapping(
  storage: DurableObjectStorage,
  input: Omit<CreateInstanceDomainMappingInput, "existingMappings" | "installs">,
): CreateInstanceDomainMappingResult {
  ensureInstanceDomainMappingTables(storage);

  return storage.transactionSync(() => {
    const result = buildInstanceDomainMapping({
      ...input,
      existingMappings: readDomainMappings(storage),
      installs: readInstanceAppInstalls(storage),
    });

    if (!result.ok) {
      return result;
    }

    storage.sql.exec(
      `
        INSERT INTO instance_domain_mappings (
          host,
          surface,
          install_id,
          enabled,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      result.mapping.host,
      result.mapping.surface,
      result.mapping.installId,
      result.mapping.enabled ? 1 : 0,
      result.mapping.createdAt,
      result.mapping.updatedAt,
    );

    return {
      ...result,
      mappings: readInstanceDomainMappings(storage),
    };
  });
}

export function readEnabledInstanceDomainMappingForHost(
  storage: DurableObjectStorage,
  input: { host: string; surface: InstanceDomainMappingSurface },
): InstanceDomainMapping | undefined {
  ensureInstanceDomainMappingTables(storage);

  const hostResult = normalizeInstanceDomainHost(input.host);

  if (!hostResult.ok) {
    throw new Error(hostResult.error.message);
  }

  for (const row of storage.sql.exec<InstanceDomainMappingRow>(
    `
      SELECT host, surface, install_id, enabled, created_at, updated_at
      FROM instance_domain_mappings
      WHERE host = ? AND surface = ? AND enabled = 1
      LIMIT 1
    `,
    hostResult.host,
    input.surface,
  )) {
    return domainMappingFromRow(row);
  }

  return undefined;
}

export function recordInstanceDomainMappingApplyEvidence(
  storage: DurableObjectStorage,
  input: RecordInstanceDomainMappingApplyEvidenceRequest & { now: string },
): RecordInstanceDomainMappingApplyEvidenceResult {
  ensureInstanceDomainMappingTables(storage);

  return storage.transactionSync(() => {
    const result = buildInstanceDomainMappingAppliedState({
      ...input,
      existingMappings: readDomainMappings(storage),
    });

    if (!result.ok) {
      return result;
    }

    writeAppliedState(storage, result.appliedState);
    writeAuditEvent(storage, result.appliedState);

    const auditEvent = readLastAuditEvent(storage);

    return {
      ok: true,
      appliedState: result.appliedState,
      appliedStates: readAppliedStates(storage),
      auditEvent,
      auditEvents: readAuditEvents(storage),
    };
  });
}

function readDomainMappings(storage: DurableObjectStorage): InstanceDomainMapping[] {
  const mappings: InstanceDomainMapping[] = [];

  for (const row of storage.sql.exec<InstanceDomainMappingRow>(
    `
      SELECT host, surface, install_id, enabled, created_at, updated_at
      FROM instance_domain_mappings
      ORDER BY host ASC, surface ASC
    `,
  )) {
    mappings.push(domainMappingFromRow(row));
  }

  return mappings;
}

function readAppliedStates(storage: DurableObjectStorage): InstanceDomainMappingAppliedState[] {
  const states: InstanceDomainMappingAppliedState[] = [];

  for (const row of storage.sql.exec<InstanceDomainMappingAppliedStateRow>(
    `
      SELECT
        host,
        surface,
        install_id,
        provider,
        account_id,
        zone_id,
        zone_name,
        worker_name,
        worker_domain_id,
        action,
        applied_at,
        updated_at
      FROM instance_domain_mapping_applied_state
      ORDER BY host ASC, surface ASC
    `,
  )) {
    states.push(appliedStateFromRow(row));
  }

  return states;
}

function readAuditEvents(storage: DurableObjectStorage): InstanceDomainMappingAuditEvent[] {
  const events: InstanceDomainMappingAuditEvent[] = [];

  for (const row of storage.sql.exec<InstanceDomainMappingAuditEventRow>(
    `
      SELECT
        event_id,
        host,
        surface,
        install_id,
        provider,
        account_id,
        zone_id,
        zone_name,
        worker_name,
        worker_domain_id,
        action,
        applied_at,
        updated_at
      FROM instance_domain_mapping_audit_events
      ORDER BY event_id ASC
    `,
  )) {
    events.push(auditEventFromRow(row));
  }

  return events;
}

function writeAppliedState(
  storage: DurableObjectStorage,
  state: InstanceDomainMappingAppliedState,
) {
  storage.sql.exec(
    `
      INSERT INTO instance_domain_mapping_applied_state (
        host,
        surface,
        install_id,
        provider,
        account_id,
        zone_id,
        zone_name,
        worker_name,
        worker_domain_id,
        action,
        applied_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(host, surface) DO UPDATE SET
        install_id = excluded.install_id,
        provider = excluded.provider,
        account_id = excluded.account_id,
        zone_id = excluded.zone_id,
        zone_name = excluded.zone_name,
        worker_name = excluded.worker_name,
        worker_domain_id = excluded.worker_domain_id,
        action = excluded.action,
        applied_at = excluded.applied_at,
        updated_at = excluded.updated_at
    `,
    state.host,
    state.surface,
    state.installId,
    state.provider,
    state.accountId,
    state.zoneId,
    state.zoneName,
    state.workerName,
    state.workerDomainId,
    state.action,
    state.appliedAt,
    state.updatedAt,
  );
}

function writeAuditEvent(storage: DurableObjectStorage, state: InstanceDomainMappingAppliedState) {
  storage.sql.exec(
    `
      INSERT INTO instance_domain_mapping_audit_events (
        host,
        surface,
        install_id,
        provider,
        account_id,
        zone_id,
        zone_name,
        worker_name,
        worker_domain_id,
        action,
        applied_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    state.host,
    state.surface,
    state.installId,
    state.provider,
    state.accountId,
    state.zoneId,
    state.zoneName,
    state.workerName,
    state.workerDomainId,
    state.action,
    state.appliedAt,
    state.updatedAt,
  );
}

function readLastAuditEvent(storage: DurableObjectStorage): InstanceDomainMappingAuditEvent {
  for (const row of storage.sql.exec<InstanceDomainMappingAuditEventRow>(
    `
      SELECT
        event_id,
        host,
        surface,
        install_id,
        provider,
        account_id,
        zone_id,
        zone_name,
        worker_name,
        worker_domain_id,
        action,
        applied_at,
        updated_at
      FROM instance_domain_mapping_audit_events
      WHERE event_id = last_insert_rowid()
      LIMIT 1
    `,
  )) {
    return auditEventFromRow(row);
  }

  throw new Error("Domain mapping audit event was not written.");
}

function domainMappingFromRow(row: InstanceDomainMappingRow): InstanceDomainMapping {
  return {
    host: row.host,
    surface: row.surface,
    installId: row.install_id,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function appliedStateFromRow(
  row: InstanceDomainMappingAppliedStateRow,
): InstanceDomainMappingAppliedState {
  return {
    host: row.host,
    surface: row.surface,
    installId: row.install_id,
    provider: row.provider,
    accountId: row.account_id,
    zoneId: row.zone_id,
    zoneName: row.zone_name,
    workerName: row.worker_name,
    workerDomainId: row.worker_domain_id,
    action: row.action,
    appliedAt: row.applied_at,
    updatedAt: row.updated_at,
  };
}

function auditEventFromRow(
  row: InstanceDomainMappingAuditEventRow,
): InstanceDomainMappingAuditEvent {
  return {
    eventId: row.event_id,
    ...appliedStateFromRow(row),
  };
}
