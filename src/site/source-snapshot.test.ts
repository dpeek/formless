import { describe, expect, it } from "vite-plus/test";

import {
  STORE_SNAPSHOT_KIND,
  STORE_SNAPSHOT_VERSION,
  parseStoreSnapshot,
} from "../shared/protocol.ts";
import type { StoredRecord } from "../shared/protocol.ts";
import { taskSourceSchema, siteSeedRecords, siteSourceSchema } from "../test/schema-apps.ts";
import { buildSiteSourceSnapshot } from "./source-snapshot.ts";

describe("Site source snapshot", () => {
  it("builds a restore-ready Site snapshot envelope from source schema and seed records", () => {
    const snapshot = buildSiteSourceSnapshot(siteSourceSchema, siteSeedRecords, {
      exportedAt: "2026-05-12T01:00:00.000Z",
    });

    expect(snapshot).toEqual({
      kind: STORE_SNAPSHOT_KIND,
      version: STORE_SNAPSHOT_VERSION,
      schemaKey: "site",
      exportedAt: "2026-05-12T01:00:00.000Z",
      schemaUpdatedAt: "2026-05-12T01:00:00.000Z",
      sourceCursor: 0,
      schema: siteSourceSchema,
      records: siteSeedRecords,
    });
    expect(parseStoreSnapshot(snapshot, "site")).toEqual(snapshot);
  });

  it("allows an explicit source schema timestamp", () => {
    const snapshot = buildSiteSourceSnapshot(siteSourceSchema, siteSeedRecords, {
      exportedAt: "2026-05-12T01:00:00.000Z",
      schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
    });

    expect(snapshot.schemaUpdatedAt).toBe("2026-05-12T00:00:00.000Z");
  });

  it("rejects non-Site source schemas", () => {
    expect(() => buildSiteSourceSnapshot(taskSourceSchema, [])).toThrow(
      'Site source snapshot schema must define "block" and "block-placement" composition fields.',
    );
  });

  it("rejects source seed records that are not restore-valid", () => {
    const parent = blockRecord("block-parent", "2026-05-12T00:00:00.000Z");
    const invalidPlacement = placementRecord("placement-missing", "2026-05-12T00:00:01.000Z", {
      parent: parent.id,
      block: "block-missing",
      order: 1,
    });

    expect(() =>
      buildSiteSourceSnapshot(siteSourceSchema, [parent, invalidPlacement], {
        exportedAt: "2026-05-12T01:00:00.000Z",
      }),
    ).toThrow(
      'Site seed record "placement-missing" field "block-placement.block" references missing block record "block-missing".',
    );
  });

  it("rejects snapshot metadata timestamps that restore would reject", () => {
    expect(() =>
      buildSiteSourceSnapshot(siteSourceSchema, siteSeedRecords, {
        exportedAt: "not-a-date",
      }),
    ).toThrow("Site source snapshot exportedAt must be an ISO timestamp.");
  });
});

function blockRecord(id: string, createdAt: string): StoredRecord {
  return {
    id,
    entity: "block",
    values: { type: "page", label: "Page" },
    createdAt,
  };
}

function placementRecord(
  id: string,
  createdAt: string,
  values: StoredRecord["values"],
): StoredRecord {
  return {
    id,
    entity: "block-placement",
    values,
    createdAt,
  };
}
