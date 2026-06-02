import {
  createAppInstall,
  type AppInstall,
  type AppInstallInitializationPlan,
  type PackageAppKey,
} from "./app-installs.ts";
import type { SchemaKey } from "./schema-apps.ts";

export type LaunchFixtureName = "empty" | "default-site" | "multi-site" | "mixed-apps" | "crm";

export type LaunchFixtureSeedChoice = {
  kind: "source";
  seedRecordsKey: SchemaKey;
};

export type LaunchFixtureAppDefinition = {
  installId: string;
  label: string;
  packageAppKey: PackageAppKey;
  seed: LaunchFixtureSeedChoice;
};

export type LaunchFixtureDefinition = {
  appInstalls: readonly LaunchFixtureAppDefinition[];
  description: string;
  label: string;
  name: LaunchFixtureName;
};

export type LaunchFixtureAppInitializationPlan = {
  fixtureName: LaunchFixtureName;
  initialization: AppInstallInitializationPlan;
  install: AppInstall;
  seed: LaunchFixtureSeedChoice;
};

export type LaunchFixtureInitializationPlan = {
  appInstalls: LaunchFixtureAppInitializationPlan[];
  fixtureName: LaunchFixtureName;
  label: string;
};

export type CreateLaunchFixtureInitializationPlanInput = {
  now: string;
};

const launchFixtureDefinitions = {
  empty: {
    appInstalls: [],
    description: "Product instance with no installed apps.",
    label: "Empty instance",
    name: "empty",
  },
  "default-site": {
    appInstalls: [
      {
        installId: "site",
        label: "Site",
        packageAppKey: "site",
        seed: { kind: "source", seedRecordsKey: "site" },
      },
    ],
    description: "Product instance with the default installed Site.",
    label: "Default Site",
    name: "default-site",
  },
  "multi-site": {
    appInstalls: [
      {
        installId: "site",
        label: "Site",
        packageAppKey: "site",
        seed: { kind: "source", seedRecordsKey: "site" },
      },
      {
        installId: "docs",
        label: "Docs",
        packageAppKey: "site",
        seed: { kind: "source", seedRecordsKey: "site" },
      },
      {
        installId: "projects",
        label: "Projects",
        packageAppKey: "site",
        seed: { kind: "source", seedRecordsKey: "site" },
      },
    ],
    description: "Product instance with three installed Sites.",
    label: "Multi Site",
    name: "multi-site",
  },
  "mixed-apps": {
    appInstalls: [
      {
        installId: "site",
        label: "Site",
        packageAppKey: "site",
        seed: { kind: "source", seedRecordsKey: "site" },
      },
      {
        installId: "tasks",
        label: "Tasks",
        packageAppKey: "tasks",
        seed: { kind: "source", seedRecordsKey: "tasks" },
      },
      {
        installId: "estii",
        label: "Estii",
        packageAppKey: "estii",
        seed: { kind: "source", seedRecordsKey: "estii" },
      },
    ],
    description: "Product instance with Site, Tasks, and Estii installed.",
    label: "Mixed Apps",
    name: "mixed-apps",
  },
  crm: {
    appInstalls: [
      {
        installId: "crm",
        label: "CRM",
        packageAppKey: "crm",
        seed: { kind: "source", seedRecordsKey: "crm" },
      },
    ],
    description: "Product instance with the bundled CRM app installed.",
    label: "CRM",
    name: "crm",
  },
} as const satisfies Record<LaunchFixtureName, LaunchFixtureDefinition>;

export function listLaunchFixtureNames(): LaunchFixtureName[] {
  return Object.keys(launchFixtureDefinitions) as LaunchFixtureName[];
}

export function resolveLaunchFixture(name: string): LaunchFixtureDefinition | undefined {
  const fixture = launchFixtureDefinitions[name as LaunchFixtureName];

  return fixture ? cloneLaunchFixture(fixture) : undefined;
}

export function createLaunchFixtureInitializationPlan(
  name: string,
  input: CreateLaunchFixtureInitializationPlanInput,
): LaunchFixtureInitializationPlan | undefined {
  const fixture = resolveLaunchFixture(name);

  if (!fixture) {
    return undefined;
  }

  const appInstalls: LaunchFixtureAppInitializationPlan[] = [];
  let installs: AppInstall[] = [];

  for (const app of fixture.appInstalls) {
    const result = createAppInstall({
      existingInstalls: installs,
      installId: app.installId,
      label: app.label,
      now: input.now,
      packageAppKey: app.packageAppKey,
    });

    if (!result.ok) {
      throw new Error(
        `Launch fixture "${fixture.name}" has invalid install "${app.installId}": ${result.error.message}`,
      );
    }

    const initialization = {
      ...result.initialization,
      seedRecordsKey: app.seed.seedRecordsKey,
    } satisfies AppInstallInitializationPlan;

    appInstalls.push({
      fixtureName: fixture.name,
      initialization,
      install: result.install,
      seed: { ...app.seed },
    });
    installs = result.installs;
  }

  return {
    appInstalls,
    fixtureName: fixture.name,
    label: fixture.label,
  };
}

function cloneLaunchFixture(fixture: LaunchFixtureDefinition): LaunchFixtureDefinition {
  return {
    appInstalls: fixture.appInstalls.map((app) => ({
      ...app,
      seed: { ...app.seed },
    })),
    description: fixture.description,
    label: fixture.label,
    name: fixture.name,
  };
}
