import { beforeEach, describe, expect, it } from "vite-plus/test";

import { resetClientStore } from "../../client/store.ts";
import type { TableColumnConfig, TableOrderingConfig } from "../../client/views.ts";
import type { StoredRecord } from "../../shared/protocol.ts";
import { rateSeedRecords, rateSourceSchema, siteSourceSchema } from "../../test/schema-apps.ts";
import { renderRecordTableHtml, renderTableViewHtml } from "../../test/generated-table.tsx";
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
    expect(html).toContain('role="grid"');
    expect(html).toContain('data-slot="table-column"');
    expect(html).not.toContain('data-slot="table-head"');
    expect(html).toContain("w-52 min-w-52 max-w-60");
  });

  it("renders aggregate footer slots as generated React Aria table rows", () => {
    const html = renderTableViewHtml({
      records: rateSeedRecords,
      schema: rateSourceSchema,
      viewName: "rateHome",
    });

    expect(html).toContain('data-formless-table-footer="true"');
    expect(html).toContain('aria-label="Average cost"');
    expect(html).toContain('aria-label="Average price"');
    expect(html).toContain('aria-label="Average margin"');
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

  it("renders action menu labels, disabled reasons, destructive intent, and ordering moves", () => {
    const rateEntity = rateSourceSchema.entities.rate;
    const ordering: TableOrderingConfig = {
      fieldName: "cost",
      field: { type: "number", required: true },
      scope: [],
      presentations: ["moveMenu"],
    };
    const columns: TableColumnConfig[] = [
      {
        type: "invokeAction",
        key: "invokeAction:inspectRate,blockedRate,deleteRate,ordering",
        label: "Rate actions",
        headerLabel: "Rate actions",
        actions: [
          {
            type: "static",
            actionName: "inspectRate",
            label: "Inspect rate",
            variant: "default",
            disabled: false,
          },
          {
            type: "static",
            actionName: "blockedRate",
            label: "Blocked rate",
            variant: "default",
            disabled: true,
            disabledReason: "No selected card",
          },
          {
            type: "static",
            actionName: "deleteRate",
            label: "Delete rate",
            variant: "destructive",
            disabled: false,
          },
        ],
        presentation: "dropdown",
        includeOrdering: true,
        ordering,
        align: "end",
        width: "xs",
        display: "readOnly",
        format: "plain",
      },
    ];
    const html = renderRecordTableHtml({
      columns,
      entity: rateEntity,
      entityName: "rate",
      ordering,
      records: [rateRecord("rate-1", 100), rateRecord("rate-2", 200)],
      schema: rateSourceSchema,
    });

    expect(html).toContain('aria-label="Rate actions"');
    expect(html).toContain(
      'data-formless-table-action-labels="Inspect rate|Blocked rate|Delete rate"',
    );
    expect(html).toContain(
      'data-formless-table-disabled-action-labels="Blocked rate: No selected card"',
    );
    expect(html).toContain('data-formless-table-danger-action-labels="Delete rate"');
    expect(html).toContain("Move up");
    expect(html).toContain("Move to bottom");
  });
});

function rateRecord(id: string, cost: number): StoredRecord {
  return {
    id,
    entity: "rate",
    values: {
      card: "card-1",
      resource: "resource-1",
      cost,
      costUnit: "day",
      price: cost + 100,
    },
    createdAt: "2026-05-22T00:00:00.000Z",
  };
}
