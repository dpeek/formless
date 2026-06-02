import { afterEach, describe, expect, it } from "vite-plus/test";
import type { AppInstallsResponse, BootstrapResponse, StoredRecord } from "../shared/protocol.ts";
import {
  rateSeedRecords,
  rateSourceSchema,
  siteSeedRecords,
  siteSourceSchema,
  taskSeedRecords,
  taskSourceSchema,
} from "../test/schema-apps.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

let harness: Harness | undefined;

afterEach(async () => {
  await harness?.dispose();
  harness = undefined;
});

describe("worker launch fixture startup", () => {
  it("starts a product instance from the multi-Site fixture without schema-key APIs", async () => {
    harness = await createFixtureHarness("multi-site");

    const installs = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const controlPlane = await getJson<BootstrapResponse>("/api/formless/control-plane/bootstrap");
    const legacySite = await harness.fetch("/api/site/bootstrap");
    const docs = await getJson<BootstrapResponse>("/api/app-installs/site/docs/bootstrap");

    expect(installs.installs.map((install) => install.installId)).toEqual([
      "docs",
      "projects",
      "site",
    ]);
    expect(installs.installs.map((install) => install.adminRoute)).toEqual([
      "/apps/docs",
      "/apps/projects",
      "/apps/site",
    ]);
    expect(installs.installs.map((install) => install.publicRoute)).toEqual([
      "/sites/docs",
      "/sites/projects",
      "/sites/site",
    ]);
    expect(
      controlPlane.records
        .filter((record) => record.entity === "app-install")
        .map((record) => record.id),
    ).toEqual(["docs", "projects", "site"]);
    expect(controlPlane.records.filter((record) => record.entity === "app-route")).toHaveLength(9);
    expect(legacySite.status).toBe(404);
    expect(docs.schema).toEqual(siteSourceSchema);
    expect(docs.cursor).toBe(siteSeedRecords.length);
    expect(recordIds(docs.records)).toEqual(recordIds(siteSeedRecords));
  });

  it("starts a product instance from the mixed app fixture without schema-key APIs", async () => {
    harness = await createFixtureHarness("mixed-apps");

    const installs = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const legacyTasks = await harness.fetch("/api/tasks/bootstrap");
    const tasks = await getJson<BootstrapResponse>("/api/app-installs/tasks/tasks/bootstrap");
    const estii = await getJson<BootstrapResponse>("/api/app-installs/estii/estii/bootstrap");

    expect(installs.installs.map((install) => install.installId)).toEqual([
      "estii",
      "site",
      "tasks",
    ]);
    expect(installs.installs.map((install) => install.packageAppKey)).toEqual([
      "estii",
      "site",
      "tasks",
    ]);
    expect(installs.installs.map((install) => install.publicRoute)).toEqual([
      undefined,
      "/sites/site",
      undefined,
    ]);
    expect(legacyTasks.status).toBe(404);
    expect(tasks.schema).toEqual(taskSourceSchema);
    expect(tasks.cursor).toBe(taskSeedRecords.length);
    expect(recordIds(tasks.records)).toEqual(recordIds(taskSeedRecords));
    expect(estii.schema).toEqual(rateSourceSchema);
    expect(estii.cursor).toBe(rateSeedRecords.length);
    expect(recordIds(estii.records)).toEqual(recordIds(rateSeedRecords));
  });

  it("starts an empty product instance when the empty fixture is selected", async () => {
    harness = await createFixtureHarness("empty");

    const installs = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(installs.installs).toEqual([]);
  });

  it("keeps default Site fixture startup idempotent", async () => {
    harness = await createFixtureHarness("default-site");

    const first = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const second = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(first.installs.map((install) => install.installId)).toEqual(["site"]);
    expect(second.installs).toEqual(first.installs);
  });
});

async function createFixtureHarness(fixtureName: string) {
  return createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_LAUNCH_FIXTURE: fixtureName,
        FORMLESS_RUNTIME_PROFILE: "instance",
      },
    },
  );
}

async function getJson<T>(path: string) {
  if (!harness) {
    throw new Error("Missing worker harness.");
  }

  const response = await harness.fetch(path);

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

function recordIds(records: readonly StoredRecord[]) {
  return records.map((record) => record.id).sort();
}
