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
    expect(listLaunchFixtureNames()).toEqual(["empty", "default-site", "multi-site", "mixed-apps"]);
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

  it("creates a default Site initialization plan with explicit source seed choice", () => {
    expect(createLaunchFixtureInitializationPlan("default-site", { now })).toEqual({
      appInstalls: [
        {
          fixtureName: "default-site",
          initialization: {
            installId: "site",
            packageAppKey: "site",
            seedRecordsKey: "site",
            sourceSchemaKey: "site",
          },
          install: {
            adminRoute: "/apps/site",
            createdAt: now,
            installId: "site",
            label: "Site",
            packageAppKey: "site",
            packageRevision: 1,
            publicRoute: "/sites/site",
            publicRoutePrefix: "/sites/site/",
            schemaRoute: "/apps/site/schema",
            sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
            status: "installed",
            updatedAt: now,
          },
          seed: { kind: "source", seedRecordsKey: "site" },
        },
      ],
      fixtureName: "default-site",
      label: "Default Site",
    });
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

    expect(plan?.appInstalls.map((app) => app.install.installId)).toEqual([
      "site",
      "tasks",
      "estii",
    ]);
    expect(plan?.appInstalls.map((app) => app.install.packageAppKey)).toEqual([
      "site",
      "tasks",
      "estii",
    ]);
    expect(plan?.appInstalls.map((app) => app.install.adminRoute)).toEqual([
      "/apps/site",
      "/apps/tasks",
      "/apps/estii",
    ]);
    expect(plan?.appInstalls.map((app) => app.install.publicRoute)).toEqual([
      "/sites/site",
      undefined,
      undefined,
    ]);
    expect(plan?.appInstalls.map((app) => app.seed)).toEqual([
      { kind: "source", seedRecordsKey: "site" },
      { kind: "source", seedRecordsKey: "tasks" },
      { kind: "source", seedRecordsKey: "estii" },
    ]);
  });
});
