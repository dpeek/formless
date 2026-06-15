import { describe, expect, it } from "vite-plus/test";
import {
  appPackageManifestKind,
  appPackageManifestVersion,
  bundledAppPackageManifests,
  createAppPackageResolver,
  findResolvedAppPackage,
  listResolvedAppPackages,
  parseAppPackageManifest,
} from "./app-packages.ts";
import { bundledSourceSchemaHashFixtures } from "./upgrade-migrations.ts";

const privateSourceSchemaHash =
  "sha256:1111111111111111111111111111111111111111111111111111111111111111";

describe("app package manifests", () => {
  it("parses runtime-neutral package source facts", () => {
    expect(parseAppPackageManifest(privatePackageManifest())).toEqual({
      kind: appPackageManifestKind,
      version: appPackageManifestVersion,
      packageAppKey: "private-labs",
      label: "Private Labs",
      description: "Private lab package fixture.",
      defaultInstallId: "labs",
      supportsMultipleInstalls: false,
      packageRevision: 7,
      sourceSchema: {
        kind: "workspace",
        key: "private-labs",
        path: "packages/private-labs/schema.json",
      },
      seedRecords: {
        kind: "workspace",
        key: "private-labs",
        path: "packages/private-labs/seed-records.json",
      },
      sourceSchemaHash: privateSourceSchemaHash,
      capabilities: [
        {
          kind: "generatedAdmin",
          routeBase: "/apps",
        },
        {
          kind: "publicSite",
          routeBase: "/sites",
        },
      ],
    });
  });

  it("validates package keys, install ids, revisions, locations, and capabilities", () => {
    const invalidCases: [string, unknown, RegExp][] = [
      ["package key", privatePackageManifest({ packageAppKey: "PrivateLabs" }), /packageAppKey/],
      [
        "default install id",
        privatePackageManifest({ defaultInstallId: "api" }),
        /defaultInstallId/,
      ],
      ["package revision", privatePackageManifest({ packageRevision: 0 }), /packageRevision/],
      [
        "source schema location",
        privatePackageManifest({
          sourceSchema: {
            kind: "workspace",
            key: "private-labs",
            path: "../schema.json",
          },
        }),
        /sourceSchema path/,
      ],
      [
        "seed records location",
        privatePackageManifest({
          seedRecords: {
            kind: "workspace",
            key: "private-labs",
            path: "packages/private-labs/schema.json",
          },
        }),
        /seedRecords path/,
      ],
      [
        "capability",
        privatePackageManifest({
          capabilities: [
            {
              kind: "generatedAdmin",
              routeBase: "/admin",
            },
          ],
        }),
        /capabilities/,
      ],
      [
        "source-only boundary",
        {
          ...privatePackageManifest(),
          appInstalls: [],
        },
        /unsupported field "appInstalls"/,
      ],
    ];

    for (const [label, manifest, message] of invalidCases) {
      expect(() => parseAppPackageManifest(manifest), label).toThrow(message);
    }
  });

  it("resolves bundled packages from manifest facts without changing existing metadata", () => {
    expect(bundledAppPackageManifests.map((manifest) => manifest.packageAppKey)).toEqual([
      "site",
      "tasks",
      "crm",
    ]);

    expect(listResolvedAppPackages()).toEqual([
      expect.objectContaining({
        adminRouteBase: "/apps",
        defaultInstallId: "site",
        label: "Site",
        packageAppKey: "site",
        packageRevision: 1,
        publicRouteBase: "/sites",
        seedRecordsKey: "site",
        sourceOrigin: "bundled",
        sourceSchemaKey: "site",
        sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
      }),
      expect.objectContaining({
        adminRouteBase: "/apps",
        defaultInstallId: "tasks",
        label: "Tasks",
        packageAppKey: "tasks",
        packageRevision: 1,
        seedRecordsKey: "tasks",
        sourceOrigin: "bundled",
        sourceSchemaKey: "tasks",
        sourceSchemaHash: bundledSourceSchemaHashFixtures.tasks,
      }),
      expect.objectContaining({
        adminRouteBase: "/apps",
        defaultInstallId: "crm",
        label: "CRM",
        packageAppKey: "crm",
        packageRevision: 1,
        seedRecordsKey: "crm",
        sourceOrigin: "bundled",
        sourceSchemaKey: "crm",
        sourceSchemaHash: bundledSourceSchemaHashFixtures.crm,
      }),
    ]);
    expect(findResolvedAppPackage("site")?.sourceSchemaLocation).toEqual({
      kind: "bundled",
      key: "site",
      path: "schema/apps/site/schema.json",
    });
    expect(findResolvedAppPackage("site")?.seedRecordsLocation).toEqual({
      kind: "bundled",
      key: "site",
      path: "schema/apps/site/seed-records.json",
    });
  });

  it("keeps private package fixtures scoped to the active resolver", () => {
    const resolver = createAppPackageResolver([
      ...bundledAppPackageManifests,
      privatePackageManifest(),
    ]);

    expect(findResolvedAppPackage("private-labs")).toBeUndefined();
    expect(resolver.findPackage("private-labs")).toEqual(
      expect.objectContaining({
        defaultInstallId: "labs",
        label: "Private Labs",
        packageAppKey: "private-labs",
        packageRevision: 7,
        publicRouteBase: "/sites",
        seedRecordsKey: "private-labs",
        sourceOrigin: "workspace",
        sourceSchemaHash: privateSourceSchemaHash,
        sourceSchemaKey: "private-labs",
      }),
    );
    expect(resolver.listPackages().map((appPackage) => appPackage.packageAppKey)).toEqual([
      "site",
      "tasks",
      "crm",
      "private-labs",
    ]);
  });
});

function privatePackageManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey: "private-labs",
    label: "Private Labs",
    description: "Private lab package fixture.",
    defaultInstallId: "labs",
    supportsMultipleInstalls: false,
    packageRevision: 7,
    sourceSchema: {
      kind: "workspace",
      key: "private-labs",
      path: "packages/private-labs/schema.json",
    },
    seedRecords: {
      kind: "workspace",
      key: "private-labs",
      path: "packages/private-labs/seed-records.json",
    },
    sourceSchemaHash: privateSourceSchemaHash,
    capabilities: [
      {
        kind: "generatedAdmin",
        routeBase: "/apps",
      },
      {
        kind: "publicSite",
        routeBase: "/sites",
      },
    ],
    ...overrides,
  };
}
