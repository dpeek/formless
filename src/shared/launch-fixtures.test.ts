import { describe, expect, it } from "vite-plus/test";
import {
  createLaunchFixtureInitializationPlan,
  listLaunchFixtureNames,
  resolveLaunchFixture,
} from "./launch-fixtures.ts";
import { bundledSourceSchemaHashFixtures } from "./upgrade-migrations.ts";

const now = "2026-05-23T00:00:00.000Z";

describe("launch fixture registry", () => {
  it("lists and resolves named product instance fixtures", () => {
    expect(listLaunchFixtureNames()).toEqual(["empty", "multi-site", "mixed-apps", "crm"]);
    expect(resolveLaunchFixture("empty")).toEqual({
      appInstalls: [],
      description: "Product instance with no installed apps.",
      label: "Empty instance",
      name: "empty",
    });
    expect(resolveLaunchFixture("missing")).toBeUndefined();
  });

  it("creates an empty instance initialization plan", () => {
    expect(createLaunchFixtureInitializationPlan("empty", { now })).toEqual({
      appInstalls: [],
      fixtureName: "empty",
      label: "Empty instance",
    });
  });

  it("rejects default-site fixture selection", () => {
    expect(resolveLaunchFixture("default-site")).toBeUndefined();
    expect(createLaunchFixtureInitializationPlan("default-site", { now })).toBeUndefined();
  });

  it("creates deterministic multi-Site initialization plans without changing routes", () => {
    const plan = createLaunchFixtureInitializationPlan("multi-site", { now });

    expect(plan?.appInstalls.map((app) => app.install.installId)).toEqual([
      "site",
      "docs",
      "projects",
    ]);
    expect(plan?.appInstalls.map((app) => app.install.adminRoute)).toEqual([
      "/apps/site",
      "/apps/docs",
      "/apps/projects",
    ]);
    expect(plan?.appInstalls.map((app) => app.install.publicRoute)).toEqual([
      "/sites/site",
      "/sites/docs",
      "/sites/projects",
    ]);
    expect(plan?.appInstalls.map((app) => app.seed)).toEqual([
      { kind: "source", seedRecordsKey: "site" },
      { kind: "source", seedRecordsKey: "site" },
      { kind: "source", seedRecordsKey: "site" },
    ]);
  });

  it("creates mixed app initialization plans with Site-only public routes", () => {
    const plan = createLaunchFixtureInitializationPlan("mixed-apps", { now });

    expect(plan?.appInstalls.map((app) => app.install.installId)).toEqual(["site", "tasks"]);
    expect(plan?.appInstalls.map((app) => app.install.packageAppKey)).toEqual(["site", "tasks"]);
    expect(plan?.appInstalls.map((app) => app.install.adminRoute)).toEqual([
      "/apps/site",
      "/apps/tasks",
    ]);
    expect(plan?.appInstalls.map((app) => app.install.publicRoute)).toEqual([
      "/sites/site",
      undefined,
    ]);
    expect(plan?.appInstalls.map((app) => app.seed)).toEqual([
      { kind: "source", seedRecordsKey: "site" },
      { kind: "source", seedRecordsKey: "tasks" },
    ]);
  });

  it("creates a CRM initialization plan without Site public routes", () => {
    expect(createLaunchFixtureInitializationPlan("crm", { now })).toEqual({
      appInstalls: [
        {
          fixtureName: "crm",
          initialization: {
            installId: "crm",
            packageAppKey: "crm",
            seedRecordsKey: "crm",
            sourceSchemaKey: "crm",
          },
          install: {
            adminRoute: "/apps/crm",
            createdAt: now,
            installId: "crm",
            label: "CRM",
            packageAppKey: "crm",
            packageRevision: 1,
            schemaRoute: "/apps/crm/schema",
            sourceSchemaHash: bundledSourceSchemaHashFixtures.crm,
            status: "installed",
            updatedAt: now,
          },
          seed: { kind: "source", seedRecordsKey: "crm" },
        },
      ],
      fixtureName: "crm",
      label: "CRM",
    });
  });
});
