import { afterEach, describe, expect, it } from "vite-plus/test";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { AppInstallsResponse, BootstrapResponse } from "../shared/protocol.ts";
import {
  crmSeedRecords,
  crmSourceSchema,
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
  it("starts a product instance from the multi-Site fixture with install-scoped APIs", async () => {
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
    ).toEqual(["site", "docs", "projects"]);
    expect(controlPlane.records.filter((record) => record.entity === "route")).toHaveLength(9);
    expect(
      controlPlane.records
        .filter((record) => record.entity === "route")
        .map((record) => [record.values.appInstall, record.values.matchPath, record.values.surface])
        .sort((left, right) => String(left[1]).localeCompare(String(right[1]))),
    ).toEqual([
      ["docs", "/apps/docs", "admin"],
      ["docs", "/apps/docs/schema", "schema"],
      ["projects", "/apps/projects", "admin"],
      ["projects", "/apps/projects/schema", "schema"],
      ["site", "/apps/site", "admin"],
      ["site", "/apps/site/schema", "schema"],
      ["docs", "/sites/docs", "public-site"],
      ["projects", "/sites/projects", "public-site"],
      ["site", "/sites/site", "public-site"],
    ]);
    expect(legacySite.status).toBe(404);
    expect(docs.schema).toEqual(siteSourceSchema);
    expect(docs.cursor).toBe(siteSeedRecords.length);
    expect(recordIds(docs.records)).toEqual(recordIds(siteSeedRecords));
  });

  it("starts a product instance from the mixed app fixture with install-scoped APIs", async () => {
    harness = await createFixtureHarness("mixed-apps");

    const installs = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const legacyTasks = await harness.fetch("/api/tasks/bootstrap");
    const tasks = await getJson<BootstrapResponse>("/api/app-installs/tasks/tasks/bootstrap");

    expect(installs.installs.map((install) => install.installId)).toEqual(["site", "tasks"]);
    expect(installs.installs.map((install) => install.packageAppKey)).toEqual(["site", "tasks"]);
    expect(installs.installs.map((install) => install.publicRoute)).toEqual([
      "/sites/site",
      undefined,
    ]);
    expect(legacyTasks.status).toBe(404);
    expect(tasks.schema).toEqual(taskSourceSchema);
    expect(tasks.cursor).toBe(taskSeedRecords.length);
    expect(recordIds(tasks.records)).toEqual(recordIds(taskSeedRecords));
  });

  it("starts a product instance from the CRM fixture with install-scoped APIs", async () => {
    harness = await createFixtureHarness("crm");

    const installs = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const controlPlane = await getJson<BootstrapResponse>("/api/formless/control-plane/bootstrap");
    const legacyCrm = await harness.fetch("/api/crm/bootstrap");
    const crm = await getJson<BootstrapResponse>("/api/app-installs/crm/crm/bootstrap");

    expect(installs.installs.map((install) => install.installId)).toEqual(["crm"]);
    expect(installs.installs.map((install) => install.packageAppKey)).toEqual(["crm"]);
    expect(installs.installs.map((install) => install.adminRoute)).toEqual(["/apps/crm"]);
    expect(installs.installs.map((install) => install.schemaRoute)).toEqual(["/apps/crm/schema"]);
    expect(installs.installs.map((install) => install.publicRoute)).toEqual([undefined]);
    expect(
      controlPlane.records
        .filter((record) => record.entity === "app-install")
        .map((record) => record.id),
    ).toEqual(["crm"]);
    expect(
      controlPlane.records
        .filter((record) => record.entity === "route")
        .map((record) => [record.values.appInstall, record.values.matchPath, record.values.surface])
        .sort((left, right) => String(left[1]).localeCompare(String(right[1]))),
    ).toEqual([
      ["crm", "/apps/crm", "admin"],
      ["crm", "/apps/crm/schema", "schema"],
    ]);
    expect(legacyCrm.status).toBe(404);
    expect(crm.schema).toEqual(crmSourceSchema);
    expect(crm.cursor).toBe(crmSeedRecords.length);
    expect(recordIds(crm.records)).toEqual(recordIds(crmSeedRecords));
  });

  it("starts an empty product instance when the empty fixture is selected", async () => {
    harness = await createFixtureHarness("empty");

    const installs = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(installs.installs).toEqual([]);
  });

  it("rejects default-site startup fixture selection", async () => {
    harness = await createFixtureHarness("default-site");

    const response = await harness.fetch("/api/formless/app-installs");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error:
        'Launch fixture "default-site" has been removed. Use "empty" and install Site through /api/formless/app-installs.',
    });
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
