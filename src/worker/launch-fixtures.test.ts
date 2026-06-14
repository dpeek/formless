import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import type { AppInstall } from "../shared/app-installs.ts";
import type { StoredRecord } from "../shared/protocol.ts";
import type { AppSchema } from "@dpeek/formless-schema";
import {
  rateSeedRecords,
  rateSourceSchema,
  crmSeedRecords,
  crmSourceSchema,
  siteSeedRecords,
  siteSourceSchema,
  taskSeedRecords,
  taskSourceSchema,
} from "../test/schema-apps.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

type InstanceInitializationResponse = {
  createdInstalls: AppInstall[];
  fixtureName: string;
  installs: AppInstall[];
};

type AppStorageInitializationResponse = {
  cursor: number;
  records: StoredRecord[];
  schema: AppSchema;
  schemaUpdatedAt: string;
};

let harness: Harness;
let launchFixtureHarnessDir: string | undefined;

beforeAll(async () => {
  harness = await createWorkerHarness(await writeLaunchFixtureHarness(), {
    LAUNCH_FIXTURE_HARNESS: { className: "LaunchFixtureHarness", useSQLite: true },
  });
});

afterAll(async () => {
  await harness.dispose();

  if (launchFixtureHarnessDir) {
    await rm(launchFixtureHarnessDir, { recursive: true, force: true });
    launchFixtureHarnessDir = undefined;
  }
});

describe("worker launch fixture initialization", () => {
  it("initializes instance app metadata from a multi-Site fixture idempotently", async () => {
    const first = await getJson<InstanceInitializationResponse>(
      "/instance?fixture=multi-site",
      "instance-multi-site",
    );
    const second = await getJson<InstanceInitializationResponse>(
      "/instance?fixture=multi-site",
      "instance-multi-site",
    );

    expect(first.fixtureName).toBe("multi-site");
    expect(first.createdInstalls.map((install) => install.installId)).toEqual([
      "site",
      "docs",
      "projects",
    ]);
    expect(first.installs.map((install) => install.installId)).toEqual([
      "docs",
      "projects",
      "site",
    ]);
    expect(first.installs.map((install) => install.adminRoute)).toEqual([
      "/apps/docs",
      "/apps/projects",
      "/apps/site",
    ]);
    expect(first.installs.map((install) => install.publicRoute)).toEqual([
      "/sites/docs",
      "/sites/projects",
      "/sites/site",
    ]);
    expect(second.createdInstalls).toEqual([]);
    expect(second.installs).toEqual(first.installs);
  });

  it("initializes instance app metadata from a mixed app fixture idempotently", async () => {
    const first = await getJson<InstanceInitializationResponse>(
      "/instance?fixture=mixed-apps",
      "instance-mixed-apps",
    );
    const second = await getJson<InstanceInitializationResponse>(
      "/instance?fixture=mixed-apps",
      "instance-mixed-apps",
    );

    expect(first.fixtureName).toBe("mixed-apps");
    expect(first.createdInstalls.map((install) => install.installId)).toEqual([
      "site",
      "tasks",
      "estii",
    ]);
    expect(first.installs.map((install) => install.installId)).toEqual(["estii", "site", "tasks"]);
    expect(first.installs.map((install) => install.packageAppKey)).toEqual([
      "estii",
      "site",
      "tasks",
    ]);
    expect(first.installs.map((install) => install.publicRoute)).toEqual([
      undefined,
      "/sites/site",
      undefined,
    ]);
    expect(second.createdInstalls).toEqual([]);
    expect(second.installs).toEqual(first.installs);
  });

  it("initializes CRM fixture app metadata without Site public routes", async () => {
    const first = await getJson<InstanceInitializationResponse>(
      "/instance?fixture=crm",
      "instance-crm",
    );
    const second = await getJson<InstanceInitializationResponse>(
      "/instance?fixture=crm",
      "instance-crm",
    );

    expect(first.fixtureName).toBe("crm");
    expect(first.createdInstalls.map((install) => install.installId)).toEqual(["crm"]);
    expect(first.installs.map((install) => install.installId)).toEqual(["crm"]);
    expect(first.installs.map((install) => install.packageAppKey)).toEqual(["crm"]);
    expect(first.installs.map((install) => install.adminRoute)).toEqual(["/apps/crm"]);
    expect(first.installs.map((install) => install.schemaRoute)).toEqual(["/apps/crm/schema"]);
    expect(first.installs.map((install) => install.publicRoute)).toEqual([undefined]);
    expect(second.createdInstalls).toEqual([]);
    expect(second.installs).toEqual(first.installs);
  });

  it("initializes fixture-installed CRM storage from the CRM source seed", async () => {
    const body = await getJson<AppStorageInitializationResponse>("/app/crm?fixture=crm", "app-crm");

    expect(body.schema).toEqual(crmSourceSchema);
    expect(body.schemaUpdatedAt).toEqual(expect.any(String));
    expect(body.cursor).toBe(crmSeedRecords.length);
    expect(recordIds(body.records)).toEqual(recordIds(crmSeedRecords));
  });

  it("initializes fixture-installed Site storage from the selected source seed", async () => {
    const body = await getJson<AppStorageInitializationResponse>(
      "/app/docs?fixture=multi-site",
      "app-docs",
    );

    expect(body.schema).toEqual(siteSourceSchema);
    expect(body.schemaUpdatedAt).toEqual(expect.any(String));
    expect(body.cursor).toBe(siteSeedRecords.length);
    expect(recordIds(body.records)).toEqual(recordIds(siteSeedRecords));
  });

  it("initializes fixture-installed non-Site storage from selected source seeds", async () => {
    const tasks = await getJson<AppStorageInitializationResponse>(
      "/app/tasks?fixture=mixed-apps",
      "app-mixed-tasks",
    );
    const estii = await getJson<AppStorageInitializationResponse>(
      "/app/estii?fixture=mixed-apps",
      "app-mixed-estii",
    );

    expect(tasks.schema).toEqual(taskSourceSchema);
    expect(tasks.schemaUpdatedAt).toEqual(expect.any(String));
    expect(tasks.cursor).toBe(taskSeedRecords.length);
    expect(recordIds(tasks.records)).toEqual(recordIds(taskSeedRecords));

    expect(estii.schema).toEqual(rateSourceSchema);
    expect(estii.schemaUpdatedAt).toEqual(expect.any(String));
    expect(estii.cursor).toBe(rateSeedRecords.length);
    expect(recordIds(estii.records)).toEqual(recordIds(rateSeedRecords));
  });

  it("keeps the empty fixture empty", async () => {
    const body = await getJson<InstanceInitializationResponse>(
      "/instance?fixture=empty",
      "instance-empty",
    );

    expect(body).toEqual({
      createdInstalls: [],
      fixtureName: "empty",
      installs: [],
    });
  });

  it("rejects the removed default Site fixture", async () => {
    const response = await harness.fetch("/instance?fixture=default-site", {
      headers: { "x-launch-fixture-harness-name": "instance-default-site" },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Unknown fixture." });
  });
});

async function getJson<T>(path: string, storageName: string) {
  const response = await harness.fetch(path, {
    headers: { "x-launch-fixture-harness-name": storageName },
  });

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

function recordIds(records: readonly StoredRecord[]) {
  return records.map((record) => record.id).sort();
}

async function writeLaunchFixtureHarness() {
  launchFixtureHarnessDir = await mkdtemp(join(tmpdir(), "formless-launch-fixture-harness-"));
  const tempDir = launchFixtureHarnessDir;
  const harnessPath = join(tempDir, "launch-fixture-harness.ts");

  await writeFile(
    harnessPath,
    `
      import { DurableObject } from "cloudflare:workers";
      import { createLaunchFixtureInitializationPlan } from "${process.cwd()}/src/shared/launch-fixtures.ts";
      import {
        initializeControlPlaneFromLaunchFixture,
        initializeLaunchFixtureAppStorage,
      } from "${process.cwd()}/src/worker/launch-fixtures.ts";
      import {
        getBootstrapRecords,
        getCurrentCursor,
      } from "${process.cwd()}/src/worker/storage.ts";

      const now = "2026-05-23T00:00:00.000Z";

      export class LaunchFixtureHarness extends DurableObject {
        async fetch(request) {
          const url = new URL(request.url);
          const fixtureName = url.searchParams.get("fixture") ?? "empty";
          const plan = createLaunchFixtureInitializationPlan(fixtureName, { now });

          if (!plan) {
            return Response.json({ error: "Unknown fixture." }, { status: 404 });
          }

          if (url.pathname === "/instance") {
            return Response.json(
              initializeControlPlaneFromLaunchFixture(this.ctx.storage, plan),
            );
          }

          const appMatch = /^\\/app\\/([^/]+)$/.exec(url.pathname);

          if (appMatch) {
            const installId = decodeURIComponent(appMatch[1]);
            const appPlan = plan.appInstalls.find(
              (candidate) => candidate.install.installId === installId,
            );

            if (!appPlan) {
              return Response.json({ error: "Fixture app install not found." }, { status: 404 });
            }

            const stored = initializeLaunchFixtureAppStorage(this.ctx.storage, appPlan);

            return Response.json({
              cursor: getCurrentCursor(this.ctx.storage),
              records: getBootstrapRecords(this.ctx.storage),
              schema: stored.schema,
              schemaUpdatedAt: stored.updatedAt,
            });
          }

          return Response.json({ error: "Not found." }, { status: 404 });
        }
      }

      export default {
        fetch(request, env) {
          const id = env.LAUNCH_FIXTURE_HARNESS.idFromName(
            request.headers.get("x-launch-fixture-harness-name") ?? "default",
          );

          return env.LAUNCH_FIXTURE_HARNESS.get(id).fetch(request);
        },
      };
    `,
  );

  return harnessPath;
}
