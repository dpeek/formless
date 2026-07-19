import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { applyBootstrapResponse, resetClientStore } from "../../client/store.ts";
import {
  selectCollectionModels,
  type HomeQueryTabConfig,
  type HomeScreenModel,
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
import { GeneratedWorkspaceRuntime } from "./generated-workspace-runtime.tsx";

describe("generated table app paths", () => {
  beforeEach(() => {
    resetClientStore();
  });

  it("renders the rate table through the selected Astryx table path", () => {
    const html = renderGeneratedTableCollectionHtml({
      records: rateSeedRecords,
      schema: rateSourceSchema,
      schemaKey: "tasks",
      selectedContextRecordId: null,
      viewName: "rateHome",
    });

    expectHtmlToContain(html, 'aria-label="Rate records"');
    expectHtmlToContain(html, '<table aria-label="Rate records"');
    expectHtmlToContain(html, "Role");
    expectHtmlToContain(html, 'aria-label="Cost"');
    expectHtmlToContain(html, ">Unit");
    expectHtmlToContain(html, 'aria-label="Price"');
    expectHtmlToContain(html, "Margin");
    expectHtmlToContain(html, 'aria-label="Aggregate footer"');
    expectHtmlToContain(html, 'aria-label="Average cost:');
    expectHtmlToContain(html, 'aria-label="Average price:');
    expectHtmlToContain(html, 'aria-label="Average margin:');
    expectHtmlToContain(html, "Create Resource");
    expect(html).not.toContain("USD");
  });

  it("renders a Task table view using source task fields through Astryx", () => {
    const schema = taskSourceTableSchema();
    const html = renderGeneratedTableCollectionHtml({
      records: taskSeedRecords,
      schema,
      schemaKey: "tasks",
      viewName: "taskTableHome",
    });

    expectHtmlToContain(html, 'aria-label="Task records"');
    expectHtmlToContain(html, '<table aria-label="Task records"');
    expectHtmlToContain(html, "Review overdue proposal");
    expectHtmlToContain(html, 'aria-label="Title"');
    expectHtmlToContain(html, 'aria-label="Done"');
    expectHtmlToContain(html, 'type="checkbox"');
    expectHtmlToContain(html, 'aria-label="Open calendar"');
    expectHtmlToContain(html, 'role="combobox"');
    expectHtmlToContain(html, "High");
    expect(html).not.toContain('data-formless-delete-record="rec_task_overdue"');
  });

  it("renders Site settings as a record form without create or delete controls", () => {
    const html = renderGeneratedCollectionHtml({
      records: testSiteSeedRecords,
      schema: siteSourceSchema,
      schemaKey: "site",
      viewName: "siteSettingsHome",
    });

    expectHtmlToContain(html, 'aria-label="Site record"');
    expectHtmlToContain(html, "data-formless-record-result=");
    expect(html).not.toContain("data-formless-legacy-record-result=");
    expect(html).not.toContain('<table aria-label="Site record"');
    expectHtmlToContain(html, 'placeholder="Label"');
    expectHtmlToContain(html, ">Description");
    expectHtmlToContain(html, 'aria-label="Edit Icon"');
    expectHtmlToContain(html, 'data-astryx-icon-preview="valid"');
    expect(html).not.toContain('aria-label="Create Site"');
    expect(html).not.toContain('data-formless-delete-record="rec_site_settings_primary"');
  });

  it("keeps Site placement operations and ordering on the selected Astryx table path", () => {
    const html = renderGeneratedTableCollectionHtml({
      records: testSiteSeedRecords,
      schema: siteSourceSchema,
      schemaKey: "site",
      selectedContextRecordId: "rec_site_content_home",
      viewName: "pageCompositionHome",
    });

    expectHtmlToContain(html, 'aria-label="Placement records"');
    expectHtmlToContain(html, '<table aria-label="Placement records"');
    expectHtmlToContain(html, 'aria-label="Reorder"');
    expectHtmlToContain(html, 'aria-label="Actions"');
    expect(html).not.toContain("data-formless-legacy-table=");
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

  const screen = collectionScreen(model);

  return renderToStaticMarkup(
    <GeneratedWorkspaceRuntime
      getSectionSelection={() => ({
        selectedContextRecordId: selectedContextRecordId ?? null,
        selectedQueryName: (selectedQuery ?? model.collection.queries.defaultTab).queryName,
      })}
      onSelectContext={() => {}}
      onSelectQuery={() => {}}
      screen={screen}
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

  const screen = collectionScreen(model);

  return renderToStaticMarkup(
    <GeneratedWorkspaceRuntime
      getSectionSelection={() => ({
        selectedContextRecordId: selectedContextRecordId ?? null,
        selectedQueryName: (selectedQuery ?? model.collection.queries.defaultTab).queryName,
      })}
      onSelectContext={() => {}}
      onSelectQuery={() => {}}
      screen={screen}
      today="2026-05-22"
    />,
  );
}

function collectionScreen(model: HomeViewModel): HomeScreenModel {
  return {
    label: model.label,
    layout: {
      sections: [
        {
          collection: model.collection,
          id: model.viewName,
          label: model.label,
          type: "collection",
          viewName: model.viewName,
        },
      ],
      type: "stack",
    },
    navigation: { primary: true },
    screenName: model.viewName,
    type: "workspace",
  };
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

function expectHtmlToContain(html: string, expected: string) {
  expect(html.includes(expected), expected).toBe(true);
}
