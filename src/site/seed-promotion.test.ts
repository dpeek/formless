import { describe, expect, it } from "vite-plus/test";

import {
  STORE_SNAPSHOT_KIND,
  STORE_SNAPSHOT_VERSION,
  type StoreSnapshot,
  type StoredRecord,
} from "../shared/protocol.ts";
import type { AppSchema } from "../shared/schema.ts";
import { siteSourceSchema } from "../test/schema-apps.ts";
import { buildSiteSeedRecordsFromSnapshot, formatSiteSeedRecords } from "./seed-promotion.ts";

describe("Site seed promotion", () => {
  it("builds deterministic active seed records from a Site store snapshot", () => {
    const header = blockRecord("block-header", "2026-05-05T00:00:01.000Z", {
      label: "Header",
      type: "header",
      href: "/ignored-but-valid",
    });
    const page = blockRecord("block-page", "2026-05-05T00:00:02.000Z", {
      body: "Home body",
      label: "Home",
      type: "page",
    });
    const tombstone = {
      ...blockRecord("block-old", "2026-05-05T00:00:00.000Z", {
        label: "Old",
        type: "page",
      }),
      deletedAt: "2026-05-05T00:00:03.000Z",
    };
    const placement = placementRecord("placement-home", "2026-05-05T00:00:00.500Z", {
      block: page.id,
      label: "Hero slot",
      order: 10,
      parent: header.id,
    });

    const records = buildSiteSeedRecordsFromSnapshot(
      snapshot([placement, page, tombstone, header]),
      siteSourceSchema,
    );

    expect(records.map((record) => record.id)).toEqual([
      "block-header",
      "block-page",
      "placement-home",
    ]);
    expect(records[0]?.createdAt).toBe(header.createdAt);
    expect(records[1]?.id).toBe(page.id);
    expect(records[2]?.id).toBe(placement.id);
    expect(records.some((record) => record.id === tombstone.id)).toBe(false);
    expect(Object.keys(records[1]?.values ?? {})).toEqual(["type", "label", "body"]);
    expect(Object.keys(records[2]?.values ?? {})).toEqual(["parent", "block", "order", "label"]);
    expect(formatSiteSeedRecords(records)).toMatch(/\n$/);
  });

  it("rejects snapshots for non-Site schema keys", () => {
    expect(() =>
      buildSiteSeedRecordsFromSnapshot(
        snapshot([blockRecord("block-home", "2026-05-05T00:00:01.000Z")], {
          schemaKey: "tasks",
        }),
        siteSourceSchema,
      ),
    ).toThrow('Store snapshot schemaKey must be "site".');
  });

  it("rejects snapshots whose schema does not match the source Site schema", () => {
    expect(() =>
      buildSiteSeedRecordsFromSnapshot(
        snapshot([blockRecord("block-home", "2026-05-05T00:00:01.000Z")], {
          schema: {
            ...siteSourceSchema,
            entities: {
              ...siteSourceSchema.entities,
              block: {
                ...siteSourceSchema.entities.block,
                label: "Content block",
              },
            },
          },
        }),
        siteSourceSchema,
      ),
    ).toThrow("Site snapshot schema must match the source Site schema.");
  });

  it("rejects active records that are invalid against the source Site schema", () => {
    const parent = blockRecord("block-parent", "2026-05-05T00:00:01.000Z");
    const child = {
      ...blockRecord("block-deleted-child", "2026-05-05T00:00:02.000Z"),
      deletedAt: "2026-05-05T00:00:03.000Z",
    };
    const placement = placementRecord("placement-deleted-child", "2026-05-05T00:00:04.000Z", {
      parent: parent.id,
      block: child.id,
      order: 1,
    });

    expect(() =>
      buildSiteSeedRecordsFromSnapshot(snapshot([parent, child, placement]), siteSourceSchema),
    ).toThrow(
      'Site seed record "placement-deleted-child" field "block-placement.block" references missing block record "block-deleted-child".',
    );
  });
});

type SnapshotOverrides = {
  schema?: AppSchema;
  schemaKey?: string;
};

function snapshot(records: StoredRecord[], overrides: SnapshotOverrides = {}): StoreSnapshot {
  return {
    kind: STORE_SNAPSHOT_KIND,
    version: STORE_SNAPSHOT_VERSION,
    schemaKey: overrides.schemaKey ?? "site",
    exportedAt: "2026-05-12T00:00:00.000Z",
    schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
    sourceCursor: 1,
    schema: overrides.schema ?? siteSourceSchema,
    records,
  };
}

function blockRecord(
  id: string,
  createdAt: string,
  values: StoredRecord["values"] = { type: "page", label: "Page" },
): StoredRecord {
  return {
    id,
    entity: "block",
    values,
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
