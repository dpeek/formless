import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { bundledSourceSchemaHashFixtures } from "../shared/upgrade-migrations.ts";
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

describe("instance app install state", () => {
  it("reads legacy install rows without stored package fact columns", async () => {
    harness = await createWorkerHarness(await writeAppInstallStateHarness(), {
      APP_INSTALLS_STATE: { className: "AppInstallStateHarness", useSQLite: true },
    });

    const seeded = await harness.fetch("/seed-legacy");
    const read = await harness.fetch("/read");

    expect(seeded.status).toBe(200);
    expect(read.status).toBe(200);

    const body = (await read.json()) as {
      columns: string[];
      installs: Array<{
        installId: string;
        packageAppKey: string;
        packageRevision: number;
        sourceSchemaHash: string;
      }>;
      rows: Array<{
        package_revision: number;
        source_schema_hash: string;
      }>;
    };

    expect(body.columns).toEqual(
      expect.arrayContaining(["package_revision", "source_schema_hash"]),
    );
    expect(body.installs).toEqual([
      expect.objectContaining({
        installId: "site",
        packageAppKey: "site",
        packageRevision: 1,
        sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
      }),
    ]);
    expect(body.rows).toEqual([
      {
        package_revision: 1,
        source_schema_hash: bundledSourceSchemaHashFixtures.site,
      },
    ]);
  });
});

async function writeAppInstallStateHarness() {
  harnessDir = await mkdtemp(resolve(".instance-app-installs-state-harness-"));
  const harnessPath = join(harnessDir, "instance-app-installs-state-harness.ts");

  await writeFile(
    harnessPath,
    `
      import { DurableObject } from "cloudflare:workers";
      import { readInstanceAppInstalls } from "${process.cwd()}/src/worker/instance-app-installs-state.ts";

      export default {
        fetch(request, env) {
          const id = env.APP_INSTALLS_STATE.idFromName("state");
          return env.APP_INSTALLS_STATE.get(id).fetch(request);
        },
      };

      export class AppInstallStateHarness extends DurableObject {
        async fetch(request) {
          const url = new URL(request.url);

          if (url.pathname === "/seed-legacy") {
            this.ctx.storage.sql.exec(\`
              CREATE TABLE app_installs (
                install_id TEXT PRIMARY KEY,
                package_app_key TEXT NOT NULL,
                label TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status = 'installed'),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
              );

              INSERT INTO app_installs (
                install_id,
                package_app_key,
                label,
                status,
                created_at,
                updated_at
              )
              VALUES (
                'site',
                'site',
                'Site',
                'installed',
                '2026-05-28T00:00:00.000Z',
                '2026-05-28T00:00:00.000Z'
              );
            \`);
            return Response.json({ seeded: true });
          }

          if (url.pathname === "/read") {
            const installs = readInstanceAppInstalls(this.ctx.storage);
            return Response.json({
              columns: this.ctx.storage.sql
                .exec("PRAGMA table_info(app_installs)")
                .toArray()
                .map((row) => row.name),
              installs,
              rows: this.ctx.storage.sql
                .exec("SELECT package_revision, source_schema_hash FROM app_installs")
                .toArray(),
            });
          }

          return Response.json({ error: "Not found." }, { status: 404 });
        }
      }
    `,
  );

  return harnessPath;
}
