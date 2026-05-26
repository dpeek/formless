import {
  buildInstanceDomainMapping,
  listInstanceDomainMappings,
  normalizeInstanceDomainHost,
  type CreateInstanceDomainMappingInput,
  type CreateInstanceDomainMappingResult,
  type InstanceDomainMapping,
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
  `);
}

export function readInstanceDomainMappings(storage: DurableObjectStorage): InstanceDomainMapping[] {
  ensureInstanceDomainMappingTables(storage);

  return listInstanceDomainMappings(readDomainMappings(storage));
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
