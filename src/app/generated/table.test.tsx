import { beforeEach, describe, expect, it } from "vite-plus/test";

import { resetClientStore } from "../../client/store.ts";
import { rateSeedRecords, rateSourceSchema, siteSourceSchema } from "../../test/schema-apps.ts";
import { renderTableViewHtml } from "../../test/generated-table.tsx";
import { testSiteSeedRecords } from "../../test/site-records.ts";

describe("RecordTable", () => {
  beforeEach(() => {
    resetClientStore();
  });

  it("reserves wider cells for compact value/unit editors", () => {
    const html = renderTableViewHtml({
      records: rateSeedRecords,
      schema: rateSourceSchema,
      viewName: "rateHome",
    });

    expect(html).toContain('value="$825.00"');
    expect(html).toContain("min-w-full table-auto");
    expect(html).toContain("w-52 min-w-52 max-w-60");
  });

  it("uses icon-sized utility columns for placement reordering and row actions", () => {
    const html = renderTableViewHtml({
      records: testSiteSeedRecords,
      schema: siteSourceSchema,
      viewName: "pageCompositionHome",
    });

    expect(html).toContain('aria-label="Reorder"');
    expect(html).toContain('aria-label="Actions"');
    expect(html.match(/w-6 min-w-6 max-w-6/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
