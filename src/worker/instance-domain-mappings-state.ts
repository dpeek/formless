import {
  buildInstanceDomainMappingAppliedState,
  buildInstanceDomainMapping,
  disableInstanceDomainMapping,
  listInstanceDomainMappings,
  normalizeInstanceDomainHost,
  resolveInstanceDomainMappingProfile,
  type BuildInstanceDomainMappingAppliedStateResult,
  type CreateInstanceDomainMappingInput,
  type CreateInstanceDomainMappingResult,
  type DisableInstanceDomainMappingInput,
  type DisableInstanceDomainMappingResult,
  type InstanceDomainMapping,
  type InstanceDomainMappingAppliedAction,
  type InstanceDomainMappingAppliedProvider,
  type InstanceDomainMappingAppliedState,
  type InstanceDomainMappingAuditEvent,
  type InstanceDomainMappingProfile,
  type InstanceDomainMappingSurface,
  type RecordInstanceDomainMappingApplyEvidenceRequest,
} from "../shared/instance-domain-mappings.ts";
import { readInstanceAppInstalls } from "./instance-app-installs-state.ts";

type InstanceDomainMappingRow = {
  host: string;
  profile: InstanceDomainMappingProfile;
  target_install_id: string | null;
  surface: InstanceDomainMappingSurface | null;
  enabled: number;
  created_at: string;
  updated_at: string;
};

type InstanceDomainMappingAppliedStateRow = {
  host: string;
  profile: InstanceDomainMappingProfile;
  target_install_id: string | null;
  surface: InstanceDomainMappingSurface | null;
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

type DomainMappingTableName =
  | "instance_domain_mappings"
  | "instance_domain_mapping_applied_state"
  | "instance_domain_mapping_audit_events";

export type RecordInstanceDomainMappingApplyEvidenceResult =
  | {
      ok: true;
      appliedState: InstanceDomainMappingAppliedState;
      appliedStates: InstanceDomainMappingAppliedState[];
      auditEvent: InstanceDomainMappingAuditEvent;
      auditEvents: InstanceDomainMappingAuditEvent[];
    }
  | Extract<BuildInstanceDomainMappingAppliedStateResult, { ok: false }>;

const domainMappingsTableSql = `
  CREATE TABLE IF NOT EXISTS instance_domain_mappings (
    host TEXT NOT NULL,
    profile TEXT NOT NULL CHECK (profile IN ('instance', 'app', 'publicSite')),
    target_install_id TEXT,
    surface TEXT CHECK (surface IS NULL OR surface = 'site'),
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (host, profile)
  )
`;

const appliedStateTableSql = `
  CREATE TABLE IF NOT EXISTS instance_domain_mapping_applied_state (
    host TEXT NOT NULL,
    profile TEXT NOT NULL CHECK (profile IN ('instance', 'app', 'publicSite')),
    target_install_id TEXT,
    surface TEXT CHECK (surface IS NULL OR surface = 'site'),
    provider TEXT NOT NULL CHECK (provider = 'cloudflare-worker-custom-domain'),
    account_id TEXT NOT NULL,
    zone_id TEXT NOT NULL,
    zone_name TEXT NOT NULL,
    worker_name TEXT NOT NULL,
    worker_domain_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('adopted', 'created', 'overridden')),
    applied_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (host, profile)
  )
`;

const auditEventsTableSql = `
  CREATE TABLE IF NOT EXISTS instance_domain_mapping_audit_events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    host TEXT NOT NULL,
    profile TEXT NOT NULL CHECK (profile IN ('instance', 'app', 'publicSite')),
    target_install_id TEXT,
    surface TEXT CHECK (surface IS NULL OR surface = 'site'),
    provider TEXT NOT NULL CHECK (provider = 'cloudflare-worker-custom-domain'),
    account_id TEXT NOT NULL,
    zone_id TEXT NOT NULL,
    zone_name TEXT NOT NULL,
    worker_name TEXT NOT NULL,
    worker_domain_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('adopted', 'created', 'overridden')),
    applied_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

export function ensureInstanceDomainMappingTables(storage: DurableObjectStorage) {
  migrateLegacySurfaceTables(storage);

  storage.sql.exec(`
    ${domainMappingsTableSql};
    ${appliedStateTableSql};
    ${auditEventsTableSql};
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
          profile,
          target_install_id,
          surface,
          enabled,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      result.mapping.host,
      result.mapping.profile,
      result.mapping.targetInstallId ?? null,
      result.mapping.surface ?? null,
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

export function disableStoredInstanceDomainMapping(
  storage: DurableObjectStorage,
  input: Omit<DisableInstanceDomainMappingInput, "existingMappings">,
): DisableInstanceDomainMappingResult {
  ensureInstanceDomainMappingTables(storage);

  return storage.transactionSync(() => {
    const result = disableInstanceDomainMapping({
      ...input,
      existingMappings: readDomainMappings(storage),
    });

    if (!result.ok) {
      return result;
    }

    storage.sql.exec(
      `
        UPDATE instance_domain_mappings
        SET enabled = 0, updated_at = ?
        WHERE host = ? AND profile = ?
      `,
      result.mapping.updatedAt,
      result.mapping.host,
      result.mapping.profile,
    );

    return {
      ...result,
      mapping: readDomainMappingByKey(storage, result.mapping) ?? result.mapping,
      mappings: readInstanceDomainMappings(storage),
    };
  });
}

export function readEnabledInstanceDomainMappingForHost(
  storage: DurableObjectStorage,
  input: {
    host: string;
    profile?: InstanceDomainMappingProfile;
    surface?: InstanceDomainMappingSurface;
  },
): InstanceDomainMapping | undefined {
  ensureInstanceDomainMappingTables(storage);

  const hostResult = normalizeInstanceDomainHost(input.host);

  if (!hostResult.ok) {
    throw new Error(hostResult.error.message);
  }

  const profileResult = resolveInstanceDomainMappingProfile(input, {
    defaultProfile: "publicSite",
  });

  if (!profileResult.ok) {
    throw new Error(profileResult.error.message);
  }

  for (const row of storage.sql.exec<InstanceDomainMappingRow>(
    `
      SELECT host, profile, target_install_id, surface, enabled, created_at, updated_at
      FROM instance_domain_mappings
      WHERE host = ? AND profile = ? AND enabled = 1
      LIMIT 1
    `,
    hostResult.host,
    profileResult.profile,
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
      SELECT host, profile, target_install_id, surface, enabled, created_at, updated_at
      FROM instance_domain_mappings
      ORDER BY host ASC, profile ASC
    `,
  )) {
    mappings.push(domainMappingFromRow(row));
  }

  return mappings;
}

function readDomainMappingByKey(
  storage: DurableObjectStorage,
  mapping: Pick<InstanceDomainMapping, "host" | "profile">,
): InstanceDomainMapping | undefined {
  for (const row of storage.sql.exec<InstanceDomainMappingRow>(
    `
      SELECT host, profile, target_install_id, surface, enabled, created_at, updated_at
      FROM instance_domain_mappings
      WHERE host = ? AND profile = ?
      LIMIT 1
    `,
    mapping.host,
    mapping.profile,
  )) {
    return domainMappingFromRow(row);
  }

  return undefined;
}

function readAppliedStates(storage: DurableObjectStorage): InstanceDomainMappingAppliedState[] {
  const states: InstanceDomainMappingAppliedState[] = [];

  for (const row of storage.sql.exec<InstanceDomainMappingAppliedStateRow>(
    `
      SELECT
        host,
        profile,
        target_install_id,
        surface,
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
      ORDER BY host ASC, profile ASC
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
        profile,
        target_install_id,
        surface,
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
        profile,
        target_install_id,
        surface,
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(host, profile) DO UPDATE SET
        target_install_id = excluded.target_install_id,
        surface = excluded.surface,
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
    state.profile,
    state.targetInstallId ?? null,
    state.surface ?? null,
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
        profile,
        target_install_id,
        surface,
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    state.host,
    state.profile,
    state.targetInstallId ?? null,
    state.surface ?? null,
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
        profile,
        target_install_id,
        surface,
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
    profile: row.profile,
    ...(row.surface === null ? {} : { surface: row.surface }),
    ...(row.target_install_id === null
      ? {}
      : { installId: row.target_install_id, targetInstallId: row.target_install_id }),
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
    profile: row.profile,
    ...(row.surface === null ? {} : { surface: row.surface }),
    ...(row.target_install_id === null
      ? {}
      : { installId: row.target_install_id, targetInstallId: row.target_install_id }),
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

function migrateLegacySurfaceTables(storage: DurableObjectStorage) {
  if (
    tableExists(storage, "instance_domain_mappings") &&
    !tableHasColumn(storage, "instance_domain_mappings", "profile")
  ) {
    migrateLegacyDomainMappingsTable(storage);
  }

  if (
    tableExists(storage, "instance_domain_mapping_applied_state") &&
    !tableHasColumn(storage, "instance_domain_mapping_applied_state", "profile")
  ) {
    migrateLegacyAppliedStateTable(storage);
  }

  if (
    tableExists(storage, "instance_domain_mapping_audit_events") &&
    !tableHasColumn(storage, "instance_domain_mapping_audit_events", "profile")
  ) {
    migrateLegacyAuditEventsTable(storage);
  }
}

function migrateLegacyDomainMappingsTable(storage: DurableObjectStorage) {
  storage.sql.exec("DROP TABLE IF EXISTS instance_domain_mappings_surface_legacy");
  storage.sql.exec(
    "ALTER TABLE instance_domain_mappings RENAME TO instance_domain_mappings_surface_legacy",
  );
  storage.sql.exec(domainMappingsTableSql);
  storage.sql.exec(`
    INSERT INTO instance_domain_mappings (
      host,
      profile,
      target_install_id,
      surface,
      enabled,
      created_at,
      updated_at
    )
    SELECT
      host,
      'publicSite',
      install_id,
      surface,
      enabled,
      created_at,
      updated_at
    FROM instance_domain_mappings_surface_legacy
  `);
  storage.sql.exec("DROP TABLE instance_domain_mappings_surface_legacy");
}

function migrateLegacyAppliedStateTable(storage: DurableObjectStorage) {
  storage.sql.exec("DROP TABLE IF EXISTS instance_domain_mapping_applied_state_surface_legacy");
  storage.sql.exec(`
    ALTER TABLE instance_domain_mapping_applied_state
    RENAME TO instance_domain_mapping_applied_state_surface_legacy
  `);
  storage.sql.exec(appliedStateTableSql);
  storage.sql.exec(`
    INSERT INTO instance_domain_mapping_applied_state (
      host,
      profile,
      target_install_id,
      surface,
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
    SELECT
      host,
      'publicSite',
      install_id,
      surface,
      provider,
      account_id,
      zone_id,
      zone_name,
      worker_name,
      worker_domain_id,
      action,
      applied_at,
      updated_at
    FROM instance_domain_mapping_applied_state_surface_legacy
  `);
  storage.sql.exec("DROP TABLE instance_domain_mapping_applied_state_surface_legacy");
}

function migrateLegacyAuditEventsTable(storage: DurableObjectStorage) {
  storage.sql.exec("DROP TABLE IF EXISTS instance_domain_mapping_audit_events_surface_legacy");
  storage.sql.exec(`
    ALTER TABLE instance_domain_mapping_audit_events
    RENAME TO instance_domain_mapping_audit_events_surface_legacy
  `);
  storage.sql.exec(auditEventsTableSql);
  storage.sql.exec(`
    INSERT INTO instance_domain_mapping_audit_events (
      event_id,
      host,
      profile,
      target_install_id,
      surface,
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
    SELECT
      event_id,
      host,
      'publicSite',
      install_id,
      surface,
      provider,
      account_id,
      zone_id,
      zone_name,
      worker_name,
      worker_domain_id,
      action,
      applied_at,
      updated_at
    FROM instance_domain_mapping_audit_events_surface_legacy
  `);
  storage.sql.exec("DROP TABLE instance_domain_mapping_audit_events_surface_legacy");
}

function tableExists(storage: DurableObjectStorage, table: DomainMappingTableName): boolean {
  for (const _row of storage.sql.exec<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    table,
  )) {
    return true;
  }

  return false;
}

function tableHasColumn(
  storage: DurableObjectStorage,
  table: DomainMappingTableName,
  columnName: string,
): boolean {
  for (const row of storage.sql.exec<{ name: string }>(`PRAGMA table_info(${table})`)) {
    if (row.name === columnName) {
      return true;
    }
  }

  return false;
}
