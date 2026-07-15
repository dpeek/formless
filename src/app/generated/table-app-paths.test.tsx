import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { applyBootstrapResponse, resetClientStore } from "../../client/store.ts";
import {
  selectCollectionModels,
  type HomeQueryTabConfig,
  type HomeViewModel,
} from "../../client/views.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { AppSchema } from "@dpeek/formless-schema";
import type { SchemaKey } from "../../shared/schema-apps.ts";
import {
  rateSeedRecords,
  rateSourceSchema,
  siteSourceSchema,
  taskSeedRecords,
  taskSourceSchema,
} from "../../test/schema-apps.ts";
import { testSiteSeedRecords } from "../../test/site-records.ts";
import { bootstrapResponse } from "../../test/protocol-builders.ts";
import { HomeCollection } from "./collection.tsx";

describe("generated table app paths", () => {
  beforeEach(() => {
    resetClientStore();
  });

  it("keeps the rate table on the React Aria table path", () => {
    const html = renderGeneratedTableCollectionHtml({
      records: rateSeedRecords,
      schema: rateSourceSchema,
      schemaKey: "tasks",
      selectedContextRecordId: null,
      viewName: "rateHome",
    });

    expect(html).toContain('aria-label="Rate records"');
    expect(html).toContain('role="grid"');
    expect(html).toContain('data-slot="table-column"');
    expect(html).toContain("Role");
    expect(html).toContain('aria-label="Cost"');
    expect(html).toContain('aria-label="Cost unit"');
    expect(html).toContain('data-web-value-unit-input="true"');
    expect(html).toContain('aria-label="Price"');
    expect(html).toContain("Margin");
    expect(html).toContain('data-slot="table-footer"');
    expect(html).toContain('aria-label="Average cost:');
    expect(html).toContain('aria-label="Average price:');
    expect(html).toContain('aria-label="Average margin:');
    expect(html).toContain("Create Resource");
    expect(html).not.toContain("USD");
  });

  it("keeps a Task table view using source task fields on the React Aria table path", () => {
    const schema = taskSourceTableSchema();
    const html = renderGeneratedTableCollectionHtml({
      records: taskSeedRecords,
      schema,
      schemaKey: "tasks",
      viewName: "taskTableHome",
    });

    expect(html).toContain('aria-label="Task records"');
    expect(html).toContain('role="grid"');
    expect(html).toContain("Review overdue proposal");
    expect(html).toContain('aria-label="Title"');
    expect(html).toContain('aria-label="Done"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('data-slot="date-picker-trigger"');
    expect(html).toContain('role="spinbutton"');
    expect(html).toContain("High");
    expect(html).not.toContain('data-formless-delete-record="rec_task_overdue"');
  });

  it("renders Site settings as a record form without create or delete controls", () => {
    const html = renderGeneratedCollectionHtml({
      records: testSiteSeedRecords,
      schema: siteSourceSchema,
      schemaKey: "site",
      viewName: "siteSettingsHome",
    });

    expect(html).toContain('aria-label="Site record"');
    expect(html).toContain('data-formless-record-result="true"');
    expect(html).not.toContain('role="grid"');
    expect(html).toContain('aria-label="Label"');
    expect(html).toContain('aria-label="Description"');
    expect(html).toContain('aria-label="Edit Icon"');
    expect(html).toContain('data-web-field-kind="icon"');
    expect(html).not.toContain('aria-label="Create Site"');
    expect(html).not.toContain('data-formless-delete-record="rec_site_settings_primary"');
  });

  it("keeps Site placement table operation controls and ordering controls on the React Aria table path", () => {
    const html = renderGeneratedTableCollectionHtml({
      records: testSiteSeedRecords,
      schema: siteSourceSchema,
      schemaKey: "site",
      selectedContextRecordId: "rec_site_content_home",
      viewName: "pageCompositionHome",
    });

    expect(html).toContain('aria-label="Placement records"');
    expect(html).toContain('role="grid"');
    expect(html).toContain('aria-label="Reorder"');
    expect(html).toContain('aria-label="Actions"');
    expect(html).toContain(
      'data-formless-legacy-table="block-placement:placementsForSelectedBlock"',
    );
    expect(html).not.toContain('data-formless-ordering-handle="true"');
    expect(html).not.toContain("data-formless-sortable-row=");
    expect(html).not.toContain('data-formless-delete-record="rec_site_place_home_hero"');
  });
});

function renderGeneratedCollectionHtml({
  records,
  schema,
  schemaKey,
  selectedContextRecordId,
  selectedQuery,
  viewName,
}: {
  records: StoredRecord[];
  schema: AppSchema;
  schemaKey: SchemaKey;
  selectedContextRecordId?: string | null;
  selectedQuery?: HomeQueryTabConfig;
  viewName: string;
}) {
  const model = requiredCollectionModel(schema, viewName);

  applyBootstrapResponse(
    bootstrapResponse(schema, records, {
      cursor: 1,
      schemaUpdatedAt: "2026-05-22T00:00:00.000Z",
    }),
    schemaKey,
  );

  return renderToStaticMarkup(
    <HomeCollection
      collection={model.collection}
      onSelectContext={() => {}}
      onSelectQuery={() => {}}
      selectedContextRecordId={selectedContextRecordId}
      selectedQuery={selectedQuery ?? model.collection.queries.defaultTab}
      today="2026-05-22"
    />,
  );
}

function renderGeneratedTableCollectionHtml({
  records,
  schema,
  schemaKey,
  selectedContextRecordId,
  selectedQuery,
  viewName,
}: {
  records: StoredRecord[];
  schema: AppSchema;
  schemaKey: SchemaKey;
  selectedContextRecordId?: string | null;
  selectedQuery?: HomeQueryTabConfig;
  viewName: string;
}) {
  const model = requiredTableCollectionModel(schema, viewName);

  applyBootstrapResponse(
    bootstrapResponse(schema, records, {
      cursor: 1,
      schemaUpdatedAt: "2026-05-22T00:00:00.000Z",
    }),
    schemaKey,
  );

  return renderToStaticMarkup(
    <HomeCollection
      collection={model.collection}
      onSelectContext={() => {}}
      onSelectQuery={() => {}}
      selectedContextRecordId={selectedContextRecordId}
      selectedQuery={selectedQuery ?? model.collection.queries.defaultTab}
      today="2026-05-22"
    />,
  );
}

function requiredCollectionModel(schema: AppSchema, viewName: string): HomeViewModel {
  const model = selectCollectionModels(schema).find((candidate) => candidate.viewName === viewName);

  if (!model) {
    throw new Error(`Missing collection model "${viewName}".`);
  }

  return model;
}

function requiredTableCollectionModel(schema: AppSchema, viewName: string): HomeViewModel {
  const model = requiredCollectionModel(schema, viewName);

  if (model.result.type !== "table") {
    throw new Error(`Collection model "${viewName}" must render a table.`);
  }

  return model;
}

function taskSourceTableSchema(): AppSchema {
  const taskHome = taskSourceSchema.views.taskHome;

  if (!taskHome || taskHome.type !== "collection") {
    throw new Error("Missing source task home collection.");
  }

  return {
    ...taskSourceSchema,
    tableViews: {
      ...taskSourceSchema.tableViews,
      taskTable: {
        entity: "task",
        columns: [
          { type: "field", field: "title", editor: "text", commit: "field-commit", width: "lg" },
          { type: "field", field: "done", editor: "boolean", commit: "immediate", width: "xs" },
          {
            type: "field",
            field: "dueDate",
            editor: "date",
            commit: "field-commit",
            width: "sm",
          },
          { type: "field", field: "priority", editor: "enum", commit: "immediate", width: "sm" },
        ],
      },
    },
    views: {
      ...taskSourceSchema.views,
      taskTableHome: {
        ...taskHome,
        label: "Task table",
        result: { type: "table", tableView: "taskTable" },
      },
    },
  };
}
