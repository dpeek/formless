import { applyBootstrapResponse } from "../client/store.ts";
import type { StoredRecord } from "../shared/protocol.ts";
import { siteSeedRecords, siteSourceSchema } from "./schema-apps.ts";
import { requiredCollectionModel, requiredTableModel } from "./generated-table.tsx";
import { bootstrapResponse } from "./protocol-builders.ts";

export function bootstrapSiteEditor(records: StoredRecord[] = siteSeedRecords) {
  applyBootstrapResponse(bootstrapResponse(siteSourceSchema, records), "site");
}

export function requiredSiteCollectionModel(viewName: string) {
  return requiredCollectionModel(siteSourceSchema, viewName);
}

export function requiredSiteTableModel(viewName = "pageCompositionHome") {
  return requiredTableModel(siteSourceSchema, viewName);
}

export function siteBlockRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity: "block",
    values,
    createdAt: "2026-05-05T00:00:40.000Z",
  };
}

export function sitePlacementRecord(id: string, label: string, order: number): StoredRecord {
  return {
    id,
    entity: "blockPlacement",
    values: {
      parent: "page-1",
      block: "block-1",
      slot: "main",
      label,
      order,
      visible: true,
    },
    createdAt: "2026-05-05T00:00:40.000Z",
  };
}
