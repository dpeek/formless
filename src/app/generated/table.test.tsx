import { beforeEach, describe, expect, it } from "vite-plus/test";

import { resetClientStore } from "../../client/store.ts";
import { rateSeedRecords, rateSourceSchema } from "../../test/schema-apps.ts";
import { renderTableViewHtml } from "../../test/generated-table.tsx";

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
    expect(html).toContain("w-52 min-w-52 max-w-60");
  });
});
