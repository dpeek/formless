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
          "match-path": "/dashboard",
          kind: "mount",
          "target-profile": "instance",
          "created-at": "2026-06-02T00:00:00.000Z",
          "updated-at": "2026-06-02T00:00:00.000Z",
        }),
        routeRecord("host-prefix-redirect", {
          enabled: true,
          "match-host": "example.com",
          "match-path": "/",
          "match-prefix": "/",
          kind: "redirect",
          "to-host": "prefix.example.com",
          "status-code": "308",
          "preserve-path": true,
          "preserve-query-string": true,
          "created-at": "2026-06-02T00:00:00.000Z",
          "updated-at": "2026-06-02T00:00:00.000Z",
        }),
        routeRecord("host-exact-mount", {
          enabled: true,
          "match-host": "example.com",
          "match-path": "/dashboard",
          kind: "mount",
          "target-profile": "instance",
          "created-at": "2026-06-02T00:00:00.000Z",
          "updated-at": "2026-06-02T00:00:00.000Z",
        }),
        routeRecord("host-exact-redirect", {
          enabled: true,
          "match-host": "example.com",
          "match-path": "/dashboard",
          kind: "redirect",
          "to-host": "target.example.com",
          "status-code": "307",
          "preserve-path": true,
          "preserve-query-string": false,
          "created-at": "2026-06-02T00:00:00.000Z",
          "updated-at": "2026-06-02T00:00:00.000Z",
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
          "match-path": "/apps/personal",
          kind: "mount",
          "target-profile": "instance",
          "created-at": "2026-06-02T00:00:00.000Z",
          "updated-at": "2026-06-02T00:00:00.000Z",
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
