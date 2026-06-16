import { describe, expect, it } from "vite-plus/test";

import type { AppInstall } from "@dpeek/formless-installed-apps";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { SchemaKey } from "../shared/schema-apps.ts";
import { bundledSourceSchemaHashFixtures } from "../shared/upgrade-migrations.ts";
import { resolveInstanceRuntimeRouteFromRecords } from "./instance-runtime-routes.ts";

describe("instance runtime route resolution", () => {
  it("orders exact host, exact path, redirect, mount, and hostless matches deterministically", () => {
    const route = resolveInstanceRuntimeRouteFromRecords({
      appInstalls: [],
      records: [
        routeRecord("hostless-exact-mount", {
          enabled: true,
          matchPath: "/dashboard",
          kind: "mount",
          targetProfile: "instance",
          createdAt: "2026-06-02T00:00:00.000Z",
          updatedAt: "2026-06-02T00:00:00.000Z",
        }),
        routeRecord("host-prefix-redirect", {
          enabled: true,
          matchHost: "example.com",
          matchPath: "/",
          matchPrefix: "/",
          kind: "redirect",
          toHost: "prefix.example.com",
          statusCode: "308",
          preservePath: true,
          preserveQueryString: true,
          createdAt: "2026-06-02T00:00:00.000Z",
          updatedAt: "2026-06-02T00:00:00.000Z",
        }),
        routeRecord("host-exact-mount", {
          enabled: true,
          matchHost: "example.com",
          matchPath: "/dashboard",
          kind: "mount",
          targetProfile: "instance",
          createdAt: "2026-06-02T00:00:00.000Z",
          updatedAt: "2026-06-02T00:00:00.000Z",
        }),
        routeRecord("host-exact-redirect", {
          enabled: true,
          matchHost: "example.com",
          matchPath: "/dashboard",
          kind: "redirect",
          toHost: "target.example.com",
          statusCode: "307",
          preservePath: true,
          preserveQueryString: false,
          createdAt: "2026-06-02T00:00:00.000Z",
          updatedAt: "2026-06-02T00:00:00.000Z",
        }),
      ],
      request: {
        host: "example.com",
        pathname: "/dashboard",
        search: "?ref=old",
      },
    });

    expect(route).toMatchObject({
      id: "host-exact-redirect",
      kind: "redirect",
      location: "https://target.example.com/dashboard",
      status: 307,
    });
  });

  it("can restrict resolution to exact-host route records", () => {
    const route = resolveInstanceRuntimeRouteFromRecords({
      appInstalls: [],
      records: [
        routeRecord("hostless-exact-mount", {
          enabled: true,
          matchPath: "/apps/personal",
          kind: "mount",
          targetProfile: "instance",
          createdAt: "2026-06-02T00:00:00.000Z",
          updatedAt: "2026-06-02T00:00:00.000Z",
        }),
      ],
      request: {
        host: "example.com",
        pathname: "/apps/personal",
      },
      options: { includeHostless: false },
    });

    expect(route).toBeUndefined();
  });

  it("resolves enabled app, schema, public Site, exact-host, and disabled mount routes", () => {
    const records = [
      routeRecord("route:tasks:admin", {
        access: "owner",
        enabled: true,
        matchPath: "/apps/tasks",
        kind: "mount",
        targetProfile: "app",
        appInstall: "tasks",
        surface: "admin",
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      }),
      routeRecord("route:tasks:schema", {
        enabled: true,
        matchPath: "/apps/tasks/schema",
        kind: "mount",
        targetProfile: "app",
        appInstall: "tasks",
        surface: "schema",
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      }),
      routeRecord("route:site:public-site", {
        access: "anonymous",
        enabled: true,
        matchPath: "/sites/site",
        matchPrefix: "/sites/site/",
        kind: "mount",
        targetProfile: "public-site",
        appInstall: "site",
        surface: "public-site",
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      }),
      routeRecord("route:host:publicSite:www.example.com", {
        enabled: true,
        matchHost: "www.example.com",
        matchPath: "/",
        matchPrefix: "/",
        kind: "mount",
        targetProfile: "public-site",
        appInstall: "site",
        surface: "public-site",
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      }),
      routeRecord("route:disabled", {
        enabled: false,
        matchPath: "/disabled",
        kind: "mount",
        targetProfile: "instance",
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      }),
    ];
    const appInstalls = [appInstall("site", "site"), appInstall("tasks", "tasks")];

    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls,
        records,
        request: { host: "formless.local", pathname: "/apps/tasks" },
      }),
    ).toMatchObject({
      access: "owner",
      id: "route:tasks:admin",
      kind: "mount",
      surface: "admin",
      target: { installId: "tasks", kind: "appInstall", packageAppKey: "tasks" },
      targetProfile: "app",
    });
    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls,
        records,
        request: { host: "formless.local", pathname: "/apps/tasks/schema" },
      }),
    ).toMatchObject({
      access: "owner",
      id: "route:tasks:schema",
      surface: "schema",
      target: { installId: "tasks", kind: "appInstall", packageAppKey: "tasks" },
    });
    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls,
        records,
        request: { host: "formless.local", pathname: "/sites/site/blog" },
      }),
    ).toMatchObject({
      access: "anonymous",
      id: "route:site:public-site",
      matchPrefix: "/sites/site/",
      surface: "public-site",
      target: { installId: "site", kind: "appInstall", packageAppKey: "site" },
      targetProfile: "public-site",
    });
    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls,
        records,
        request: { host: "www.example.com", pathname: "/blog" },
      }),
    ).toMatchObject({
      access: "anonymous",
      id: "route:host:publicSite:www.example.com",
      matchHost: "www.example.com",
      surface: "public-site",
      target: { installId: "site", kind: "appInstall", packageAppKey: "site" },
    });
    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls,
        records,
        request: { host: "formless.local", pathname: "/disabled" },
      }),
    ).toBeUndefined();
  });
});

function routeRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    createdAt: "2026-06-02T00:00:00.000Z",
    entity: "route",
    id,
    values,
  };
}

function appInstall(installId: string, packageAppKey: SchemaKey): AppInstall {
  return {
    adminRoute: `/apps/${installId}`,
    createdAt: "2026-06-02T00:00:00.000Z",
    installId,
    label: installId,
    packageAppKey,
    packageRevision: 1,
    ...(packageAppKey === "site"
      ? {
          publicRoute: `/sites/${installId}` as `/${string}`,
          publicRoutePrefix: `/sites/${installId}/` as `/${string}/`,
        }
      : {}),
    schemaRoute: `/apps/${installId}/schema`,
    sourceSchemaHash: bundledSourceSchemaHashFixtures[packageAppKey],
    status: "installed",
    updatedAt: "2026-06-02T00:00:00.000Z",
  };
}
