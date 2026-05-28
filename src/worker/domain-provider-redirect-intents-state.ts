import type {
  InstanceDomainProviderRedirectIntent,
  InstanceDomainProviderRedirectIntentCleanupEvent,
} from "../shared/domain-provider-api.ts";
import type { DomainProviderRedirectStatusCode } from "../shared/domain-provider-protocol.ts";

export const domainProviderRedirectIntentsTableSql = `
  CREATE TABLE IF NOT EXISTS instance_domain_provider_redirect_intents (
    from_host TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    to_host TEXT,
    to_url TEXT,
    preserve_path INTEGER NOT NULL CHECK (preserve_path IN (0, 1)),
    preserve_query_string INTEGER NOT NULL CHECK (preserve_query_string IN (0, 1)),
    status_code INTEGER NOT NULL CHECK (status_code IN (301, 302, 303, 307, 308)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK ((to_host IS NOT NULL AND to_url IS NULL) OR (to_host IS NULL AND to_url IS NOT NULL))
  )
`;

export type DomainProviderRedirectIntentRow = {
  created_at: string;
  enabled: number;
  from_host: string;
  preserve_path: number;
  preserve_query_string: number;
  status_code: DomainProviderRedirectStatusCode;
  to_host: string | null;
  to_url: string | null;
  updated_at: string;
};

export type DomainProviderRedirectIntentCleanupEventRow = DomainProviderRedirectIntentRow & {
  action: InstanceDomainProviderRedirectIntentCleanupEvent["action"];
  event_id: number;
  reason: InstanceDomainProviderRedirectIntentCleanupEvent["reason"];
  recorded_at: string;
};

export function ensureDomainProviderRedirectIntentsTable(storage: DurableObjectStorage) {
  storage.sql.exec(domainProviderRedirectIntentsTableSql);
}

export function readDomainProviderRedirectIntents(
  storage: DurableObjectStorage,
): InstanceDomainProviderRedirectIntent[] {
  ensureDomainProviderRedirectIntentsTable(storage);
  const redirects: InstanceDomainProviderRedirectIntent[] = [];

  for (const row of storage.sql.exec<DomainProviderRedirectIntentRow>(
    `
      SELECT
        from_host,
        enabled,
        to_host,
        to_url,
        preserve_path,
        preserve_query_string,
        status_code,
        created_at,
        updated_at
      FROM instance_domain_provider_redirect_intents
      ORDER BY from_host ASC
    `,
  )) {
    redirects.push(domainProviderRedirectIntentFromRow(row));
  }

  return redirects;
}

export function domainProviderRedirectIntentFromRow(
  row: DomainProviderRedirectIntentRow,
): InstanceDomainProviderRedirectIntent {
  return {
    createdAt: row.created_at,
    enabled: row.enabled === 1,
    fromHost: row.from_host,
    preservePath: row.preserve_path === 1,
    preserveQueryString: row.preserve_query_string === 1,
    statusCode: row.status_code,
    ...(row.to_host === null ? {} : { toHost: row.to_host }),
    ...(row.to_url === null ? {} : { toUrl: row.to_url }),
    updatedAt: row.updated_at,
  };
}
