import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
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

describe("instance domain mapping state migrations", () => {
  it("migrates legacy applied-action CHECK constraints without locking SQLite metadata", async () => {
    harness = await createWorkerHarness(await writeDomainMappingStateHarness(), {
      DOMAIN_MAPPING_STATE: { className: "DomainMappingStateHarness", useSQLite: true },
    });

    const seeded = await harness.fetch("/seed-legacy-action-check");
    const migrated = await harness.fetch("/ensure");

    expect(seeded.status).toBe(200);
    expect(migrated.status).toBe(200);

    const body = (await migrated.json()) as {
      appliedMigrations: Array<{
        migrationId: string;
        storageFamily: string;
      }>;
      appliedStateSql: string;
      auditEventsSql: string;
      mappings: unknown[];
    };

    expect(body.appliedMigrations).toEqual([
      expect.objectContaining({
        migrationId: "2026-05-28-instance-domain-mappings-legacy-shape",
        storageFamily: "instance-domain-mappings",
      }),
    ]);
    expect(body.appliedStateSql).toContain("'manually-removed'");
    expect(body.auditEventsSql).toContain("'manually-removed'");
    expect(body.mappings).toEqual([]);
  });
});

async function writeDomainMappingStateHarness() {
  harnessDir = await mkdtemp(resolve(".domain-mapping-state-harness-"));
  const harnessPath = join(harnessDir, "domain-mapping-state-harness.ts");

  await writeFile(
    harnessPath,
    `
      import { DurableObject } from "cloudflare:workers";
      import {
        ensureInstanceDomainMappingTables,
        readInstanceDomainMappings,
      } from "${process.cwd()}/src/worker/instance-domain-mappings-state.ts";
      import {
        readAppliedSqlMigrations,
        storageSqlMigrationFamily,
      } from "${process.cwd()}/src/worker/sql-migrations.ts";

      const migrationFamily = storageSqlMigrationFamily("instance-domain-mappings");

      export default {
        fetch(request, env) {
          const id = env.DOMAIN_MAPPING_STATE.idFromName("state");
          return env.DOMAIN_MAPPING_STATE.get(id).fetch(request);
        },
      };

      export class DomainMappingStateHarness extends DurableObject {
        async fetch(request) {
          const url = new URL(request.url);

          if (url.pathname === "/seed-legacy-action-check") {
            this.ctx.storage.sql.exec(legacyAppliedActionCheckTablesSql);
            return Response.json({ seeded: true });
          }

          if (url.pathname === "/ensure") {
            ensureInstanceDomainMappingTables(this.ctx.storage);
            return Response.json({
              appliedMigrations: readAppliedSqlMigrations(this.ctx.storage, migrationFamily),
              appliedStateSql: tableSql(
                this.ctx.storage,
                "instance_domain_mapping_applied_state",
              ),
              auditEventsSql: tableSql(
                this.ctx.storage,
                "instance_domain_mapping_audit_events",
              ),
              mappings: readInstanceDomainMappings(this.ctx.storage),
            });
          }

          return Response.json({ error: "Not found." }, { status: 404 });
        }
      }

      function tableSql(storage, table) {
        return storage.sql
          .exec("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", table)
          .toArray()[0]?.sql;
      }

      const legacyAppliedActionCheckTablesSql = \`
        CREATE TABLE instance_domain_mapping_applied_state (
          host TEXT NOT NULL,
          profile TEXT NOT NULL CHECK (profile IN ('instance', 'app', 'publicSite')),
          target_install_id TEXT,
          surface TEXT CHECK (surface IS NULL OR surface = 'site'),
          provider TEXT NOT NULL CHECK (provider = 'cloudflare-worker-custom-domain'),
          account_id TEXT NOT NULL,
          alchemy_resource_id TEXT,
          runner_id TEXT,
          zone_id TEXT NOT NULL,
          zone_name TEXT NOT NULL,
          worker_name TEXT NOT NULL,
          worker_domain_id TEXT NOT NULL,
          action TEXT NOT NULL CHECK (action IN ('adopted', 'created', 'deleted', 'overridden')),
          applied_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (host, profile)
        );

        CREATE TABLE instance_domain_mapping_audit_events (
          event_id INTEGER PRIMARY KEY AUTOINCREMENT,
          host TEXT NOT NULL,
          profile TEXT NOT NULL CHECK (profile IN ('instance', 'app', 'publicSite')),
          target_install_id TEXT,
          surface TEXT CHECK (surface IS NULL OR surface = 'site'),
          provider TEXT NOT NULL CHECK (provider = 'cloudflare-worker-custom-domain'),
          account_id TEXT NOT NULL,
          alchemy_resource_id TEXT,
          runner_id TEXT,
          zone_id TEXT NOT NULL,
          zone_name TEXT NOT NULL,
          worker_name TEXT NOT NULL,
          worker_domain_id TEXT NOT NULL,
          action TEXT NOT NULL CHECK (action IN ('adopted', 'created', 'deleted', 'overridden')),
          applied_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      \`;
    `,
  );

  return harnessPath;
}
