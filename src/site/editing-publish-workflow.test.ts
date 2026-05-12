import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import {
  STORE_SNAPSHOT_KIND,
  STORE_SNAPSHOT_VERSION,
  parseStoreSnapshot,
} from "../shared/protocol.ts";
import { siteSeedRecords, siteSourceSchema } from "../test/schema-apps.ts";

type PackageJson = {
  scripts?: Record<string, string>;
};

describe("Site editing and publish workflow baseline", () => {
  it("characterizes the source seed as active stored records, not a snapshot export", () => {
    const snapshot = parseStoreSnapshot(
      {
        kind: STORE_SNAPSHOT_KIND,
        version: STORE_SNAPSHOT_VERSION,
        schemaKey: "site",
        exportedAt: "2026-05-12T00:00:00.000Z",
        schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
        sourceCursor: 0,
        schema: siteSourceSchema,
        records: siteSeedRecords,
      },
      "site",
    );

    expect(snapshot.records).toEqual(siteSeedRecords);
    expect(new Set(siteSeedRecords.map((record) => record.entity))).toEqual(
      new Set(["block", "blockPlacement"]),
    );

    for (const record of siteSeedRecords) {
      expect(record).not.toHaveProperty("deletedAt");
      expect(record).not.toHaveProperty("seq");
      expect(record).not.toHaveProperty("mutationId");
      expect(record).not.toHaveProperty("op");
      expect(record).not.toHaveProperty("payload");
    }
  });

  it("characterizes deploy as code and asset deploy only", () => {
    const packageJson = readPackageJson();
    const deployScript = packageJson.scripts?.deploy;

    expect(deployScript).toBe("vp build && wrangler deploy");
    expect(deployScript).toContain("vp build");
    expect(deployScript).toContain("wrangler deploy");
    expect(deployScript).not.toContain("snapshot");
    expect(deployScript).not.toContain("reset");
    expect(deployScript).not.toContain("site:publish");
    expect(readWranglerConfigText()).toContain('"run_worker_first": ["/api/*"]');
  });
});

function readPackageJson(): PackageJson {
  return JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as PackageJson;
}

function readWranglerConfigText(): string {
  return readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
}
