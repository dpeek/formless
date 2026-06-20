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

  it("builds redirect responses from schema-owned route target fields", () => {
    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls: [],
        records: [
          routeRecord("to-host", {
            enabled: true,
            matchHost: "old.example.com",
            matchPath: "/",
            matchPrefix: "/",
            kind: "redirect",
            toHost: "new.example.com",
            statusCode: "308",
            preservePath: true,
            preserveQueryString: true,
            createdAt: "2026-06-02T00:00:00.000Z",
            updatedAt: "2026-06-02T00:00:00.000Z",
          }),
        ],
        request: {
          host: "old.example.com",
          pathname: "/docs/start",
          search: "?ref=old",
        },
      }),
    ).toMatchObject({
      id: "to-host",
      kind: "redirect",
      location: "https://new.example.com/docs/start?ref=old",
      status: 308,
    });

    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls: [],
        records: [
          routeRecord("to-url-drop-request-parts", {
            enabled: true,
            matchHost: "old.example.com",
            matchPath: "/",
            matchPrefix: "/",
            kind: "redirect",
            toUrl: "https://new.example.com/archive?keep=target",
            statusCode: "301",
            preservePath: false,
            preserveQueryString: false,
            createdAt: "2026-06-02T00:00:00.000Z",
            updatedAt: "2026-06-02T00:00:00.000Z",
          }),
        ],
        request: {
          host: "old.example.com",
          pathname: "/docs/start",
          search: "?ref=old",
        },
      }),
    ).toMatchObject({
      id: "to-url-drop-request-parts",
      kind: "redirect",
      location: "https://new.example.com/archive?keep=target",
      status: 301,
    });

    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls: [],
        records: [
          routeRecord("to-url-preserve-request-parts", {
            enabled: true,
            matchHost: "old.example.com",
            matchPath: "/",
            matchPrefix: "/",
            kind: "redirect",
            toUrl: "https://new.example.com/archive?keep=target",
            statusCode: "302",
            preservePath: true,
            preserveQueryString: true,
            createdAt: "2026-06-02T00:00:00.000Z",
            updatedAt: "2026-06-02T00:00:00.000Z",
          }),
        ],
        request: {
          host: "old.example.com",
          pathname: "/docs/start",
          search: "?ref=old",
        },
      }),
    ).toMatchObject({
      id: "to-url-preserve-request-parts",
      kind: "redirect",
      location: "https://new.example.com/archive/docs/start?ref=old",
      status: 302,
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

  it("keeps redirect-captured hosts from falling through to hostless routes", () => {
    const records = [
      routeRecord("redirect-capture", {
        enabled: true,
        matchHost: "old.example.com",
        matchPath: "/old",
        kind: "redirect",
        toHost: "new.example.com",
        statusCode: "308",
        preservePath: true,
        preserveQueryString: true,
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      }),
      routeRecord("host-exact-mount", {
        enabled: true,
        matchHost: "old.example.com",
        matchPath: "/allowed",
        kind: "mount",
        targetProfile: "instance",
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      }),
      routeRecord("hostless-mount", {
        enabled: true,
        matchPath: "/apps/site",
        kind: "mount",
        targetProfile: "instance",
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      }),
    ];

    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls: [],
        records,
        request: { host: "old.example.com", pathname: "/apps/site" },
      }),
    ).toEqual({
      kind: "not-found",
      matchHost: "old.example.com",
      reason: "captured-redirect-host",
    });

    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls: [],
        records,
        request: { host: "old.example.com", pathname: "/allowed" },
      }),
    ).toMatchObject({
      id: "host-exact-mount",
      kind: "mount",
      matchHost: "old.example.com",
    });

    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls: [],
        records,
        request: { host: "other.example.com", pathname: "/apps/site" },
      }),
    ).toMatchObject({
      id: "hostless-mount",
      kind: "mount",
    });
  });

  it("resolves enabled app, public Site, exact-host, and disabled mount routes", () => {
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
    updatedAt: "2026-06-02T00:00:00.000Z",
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
    sourceSchemaHash: bundledSourceSchemaHashFixtures[packageAppKey],
    status: "installed",
    updatedAt: "2026-06-02T00:00:00.000Z",
  };
}
