import { describe, expect, it } from "vite-plus/test";

import type { StoredRecord } from "../shared/protocol.ts";
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
});

function routeRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    createdAt: "2026-06-02T00:00:00.000Z",
    entity: "route",
    id,
    values,
  };
}
