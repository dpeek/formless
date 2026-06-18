import { describe, expect, it } from "vite-plus/test";
import {
  STORAGE_SNAPSHOT_KIND,
  STORAGE_SNAPSHOT_VERSION,
  parseStorageSnapshot,
} from "@dpeek/formless-storage";
import { siteSeedRecords, siteSourceSchema } from "../test/schema-apps.ts";

describe("Site editing and publish workflow baseline", () => {
  it("characterizes the source seed as active stored records, not a storage snapshot export", () => {
    const snapshot = parseStorageSnapshot(
      {
        kind: STORAGE_SNAPSHOT_KIND,
        version: STORAGE_SNAPSHOT_VERSION,
        storageIdentity: "site",
        schemaKey: "site",
        exportedAt: "2026-05-12T00:00:00.000Z",
        schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
        sourceCursor: 0,
        schema: siteSourceSchema,
        records: siteSeedRecords,
      },
      { schemaKey: "site", storageIdentity: "site" },
    );

    expect(snapshot.records).toEqual(siteSeedRecords);
    expect(new Set(siteSeedRecords.map((record) => record.entity))).toEqual(
      new Set(["site", "block", "block-placement"]),
    );

    for (const record of siteSeedRecords) {
      expect(record).not.toHaveProperty("deletedAt");
      expect(record).not.toHaveProperty("seq");
      expect(record).not.toHaveProperty("mutationId");
      expect(record).not.toHaveProperty("op");
      expect(record).not.toHaveProperty("payload");
    }
  });
});
