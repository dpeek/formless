import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { applyBootstrapResponse, resetClientStore } from "../../client/store.ts";
import { selectCollectionModels } from "../../client/views.ts";
import type { BootstrapResponse } from "../../shared/protocol.ts";
import { rateSeedRecords, rateSourceSchema } from "../../test/schema-apps.ts";
import { RecordTable } from "./table.tsx";

describe("RecordTable", () => {
  beforeEach(() => {
    resetClientStore();
  });

  it("reserves wider cells for compact value/unit editors", () => {
    const model = selectCollectionModels(rateSourceSchema).find(
      (model) => model.viewName === "rateHome",
    );

    if (!model || model.result.type !== "table") {
      throw new Error("Missing rate table model.");
    }

    const rateEntity = rateSourceSchema.entities.rate;

    if (!rateEntity) {
      throw new Error("Missing rate entity.");
    }

    applyBootstrapResponse(bootstrap());

    const html = renderToStaticMarkup(
      <RecordTable
        columns={model.result.columns}
        entity={rateEntity}
        entityName="rate"
        query={{ kind: "all" }}
      />,
    );

    expect(html).toContain('value="$825.00"');
    expect(html).toContain("w-52 min-w-52 max-w-60");
  });
});

function bootstrap(): BootstrapResponse {
  return {
    schema: rateSourceSchema,
    schemaUpdatedAt: "2026-05-06T00:00:00.000Z",
    records: rateSeedRecords,
    cursor: 1,
  };
}
