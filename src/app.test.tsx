import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import rawRateCardSchema from "../schema/samples/rate-card.json";
import {
  App,
  GeneratedCreateDialogForm,
  GeneratedCreateForm,
  HomeCollection,
  RecordList,
  resolveCreateValues,
} from "./app.tsx";
import { appSchema } from "./client/schema.ts";
import { applyBootstrapResponse, applyRecordMerge, resetClientStore } from "./client/store.ts";
import {
  selectHomeModel,
  selectCollectionModels,
  type CreateFieldConfig,
  type HomeActionConfig,
  type RecordFieldConfig,
} from "./client/views.ts";
import type { BootstrapResponse, StoredRecord } from "./shared/protocol.ts";
import { parseAppSchema, type EntitySchema } from "./shared/schema.ts";

const rateCardSchema = parseAppSchema(rawRateCardSchema);

function renderRoute(path: string) {
  return renderToStaticMarkup(
    <Router ssrPath={path}>
      <App />
    </Router>,
  );
}

beforeEach(() => {
  resetClientStore();
});

describe("App smoke routes", () => {
  it('renders the "/" route', () => {
    const html = renderRoute("/");

    expect(html).toContain("Loading active schema...");
    expect(html).not.toContain("Create Task");
  });

  it('renders the "/schema" route', () => {
    const html = renderRoute("/schema");

    expect(html).toContain("Loading active schema.");
    expect(html).toContain("Save schema");
  });

  it("renders a dev reset action", () => {
    const html = renderRoute("/");

    expect(html).toContain("Reset task schema");
    expect(html).toContain("Reset rate-card schema");
  });
});

describe("generated collection home", () => {
  it("renders Tasks as the collection title with query tabs and actions", () => {
    applyBootstrapResponse(bootstrap([]));
    const html = renderRoute("/");

    expect(html).toContain("<h1");
    expect(html).toContain("Tasks");
    expect(html).toContain("All");
    expect(html).toContain("Active");
    expect(html).toContain("Completed");
    expect(html).toContain("Overdue");
    expect(html).toContain('aria-label="Task actions"');
    expect(html).toContain("Create Task");
    expect(html).toContain("Clear completed");
    expect(html).not.toContain('aria-label="Collection summary"');
  });

  it("renders query tab counts from each resolved query", () => {
    applyBootstrapResponse(
      bootstrap([
        taskRecord("record-1", "Open overdue", false, "2026-01-01"),
        taskRecord("record-2", "Open later", false, "2026-05-03"),
        taskRecord("record-3", "Finished", true, "2026-05-01"),
      ]),
    );
    const html = renderRoute("/");

    expect(html).toMatch(/aria-label="All count"[^>]*>3</);
    expect(html).toMatch(/aria-label="Active count"[^>]*>2</);
    expect(html).toMatch(/aria-label="Completed count"[^>]*>1</);
    expect(html).toMatch(/aria-label="Overdue count"[^>]*>1</);
  });

  it("renders the selected list through the shared task item view", () => {
    const task = appSchema.entities.task;
    const model = selectHomeModel(appSchema);
    const record: StoredRecord = taskRecord("record-1", "First", true, "2026-05-01");

    applyBootstrapResponse(bootstrap([record]));
    const html = renderToStaticMarkup(
      <RecordList
        entity={task}
        entityName="task"
        query={{ kind: "all" }}
        recordFields={model?.result.recordFields ?? []}
      />,
    );

    expect(html).toContain("First");
    expect(html).toContain('type="text"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
    expect(html).toContain('type="date"');
    expect(html).toContain("2026-05-01");
    expect(html).toContain('aria-label="Due date"');
    expect(html).toContain('type="number"');
    expect(html).toContain('aria-label="Estimate"');
    expect(html).not.toContain(record.createdAt);
  });

  it("renders clear-completed target count and keeps the button enabled at zero", () => {
    applyBootstrapResponse(bootstrap([]));
    const html = renderRoute("/");

    expect(html).toMatch(/aria-label="Clear completed target count"[^>]*>0</);
    expect(html).toContain("Clear completed");
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>[^<]*Clear completed/);
  });

  it("updates action target counts after local record merges", () => {
    applyBootstrapResponse(bootstrap([taskRecord("record-1", "Open", false)]));
    const before = renderRoute("/");

    applyRecordMerge([taskRecord("record-2", "Finished", true)], 2);
    const after = renderRoute("/");

    expect(before).toMatch(/aria-label="Clear completed target count"[^>]*>0</);
    expect(after).toMatch(/aria-label="Clear completed target count"[^>]*>1</);
  });

  it("renders collection switching for a multi-collection schema", () => {
    applyBootstrapResponse(bootstrap([], rateCardSchema));
    const html = renderRoute("/");

    expect(html).toContain('aria-label="Collections"');
    expect(html).toContain("Resources");
    expect(html).toContain("Rate cards");
    expect(html).toContain("Rates");
    expect(html).toContain("Create Resource");
  });

  it("renders the scoped rate-card collection with a card selector", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );

    applyBootstrapResponse(
      bootstrap(
        [
          cardRecord("card-1", "Default"),
          cardRecord("card-2", "Backup"),
          resourceRecord("resource-1", "Designer"),
          rateCardRateRecord("rate-1", "resource-1", "card-1", 475),
          rateCardRateRecord("rate-2", "resource-1", "card-2", 900),
        ],
        rateCardSchema,
      ),
    );
    const html = renderToStaticMarkup(
      <HomeCollection
        actions={rateModel?.actions ?? []}
        context={rateModel?.context}
        entity={rateModel?.entity ?? rateCardSchema.entities.rate}
        entityName="rate"
        onSelectQuery={() => {}}
        queryTabs={rateModel?.queryTabs ?? []}
        result={
          rateModel?.result ?? {
            type: "list",
            itemViewName: "rateListItem",
            recordFields: [],
          }
        }
        selectedContextRecordId={null}
        selectedQuery={
          rateModel?.queryTabs[0] ?? {
            queryName: "missing",
            label: "Missing",
            query: { kind: "all" },
          }
        }
        today="2026-05-01"
      />,
    );

    expect(html).toContain("Rate card");
    expect(html).toContain("Default");
    expect(html).toContain("Backup");
    expect(html).toContain("Create Rate card");
    expect(html).toMatch(/<button[^>]*>Create Rate<\/button>/);
    expect(html).toContain('value="475"');
    expect(html).not.toContain('value="900"');
  });

  it("disables scoped create actions until context is selected", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );

    applyBootstrapResponse(bootstrap([resourceRecord("resource-1", "Designer")], rateCardSchema));
    const html = renderToStaticMarkup(
      <HomeCollection
        actions={rateModel?.actions ?? []}
        context={rateModel?.context}
        entity={rateModel?.entity ?? rateCardSchema.entities.rate}
        entityName="rate"
        onSelectQuery={() => {}}
        queryTabs={rateModel?.queryTabs ?? []}
        result={
          rateModel?.result ?? {
            type: "list",
            itemViewName: "rateListItem",
            recordFields: [],
          }
        }
        selectedContextRecordId={null}
        selectedQuery={
          rateModel?.queryTabs[0] ?? {
            queryName: "missing",
            label: "Missing",
            query: { kind: "all" },
          }
        }
        today="2026-05-01"
      />,
    );

    expect(html).toContain("No rate card records yet.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Create Rate<\/button>/);
  });
});

describe("generated forms and records", () => {
  it("renders the task create dialog with type-aware controls", () => {
    const task = appSchema.entities.task;
    const action = createAction(task, ["title", "done", "dueDate"]);
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={action} renderDialogCancel={false} />,
    );

    expect(html).toContain("Create Task");
    expect(html).toContain('name="title"');
    expect(html).toContain('name="done"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('name="dueDate"');
    expect(html).toContain("Due date");
    expect(html).toContain("Cancel");
  });

  it("renders enum create controls with option labels", () => {
    const task = taskEntityWithKindEnum();
    const action = createAction(task, ["kind"]);
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={action} renderDialogCancel={false} />,
    );

    expect(html).toContain('name="kind"');
    expect(html).toContain("<select");
    expect(html).toContain("Role");
    expect(html).toContain("Stream");
  });

  it("renders enum inline editors with labels and raw unknown values", () => {
    const task = taskEntityWithKindEnum();
    const recordFields: RecordFieldConfig[] = [
      {
        fieldName: "kind",
        field: task.fields.kind,
        editor: "enum",
        commit: "immediate",
      },
    ];

    applyBootstrapResponse(bootstrap([enumRecord("legacy")]));
    const html = renderToStaticMarkup(
      <RecordList
        entity={task}
        entityName="task"
        query={{ kind: "all" }}
        recordFields={recordFields}
      />,
    );

    expect(html).toContain("legacy");
    expect(html).toContain("Role");
    expect(html).toContain("Stream");
  });

  it("renders number create controls and inline editors with numeric constraints", () => {
    const task = taskEntityWithEstimateNumber();
    const action = createAction(task, ["estimate"]);
    const createHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={action} renderDialogCancel={false} />,
    );
    const recordFields: RecordFieldConfig[] = [
      {
        fieldName: "estimate",
        field: task.fields.estimate,
        editor: "number",
        commit: "field-commit",
      },
    ];

    applyBootstrapResponse(bootstrap([numberRecord(3)]));
    const rowHtml = renderToStaticMarkup(
      <RecordList
        entity={task}
        entityName="task"
        query={{ kind: "all" }}
        recordFields={recordFields}
      />,
    );

    expect(createHtml).toContain('name="estimate"');
    expect(createHtml).toContain('type="number"');
    expect(createHtml).toContain('min="0"');
    expect(createHtml).toContain('max="10"');
    expect(createHtml).toContain('step="1"');
    expect(rowHtml).toContain('aria-label="Estimate"');
    expect(rowHtml).toContain('type="number"');
    expect(rowHtml).toContain('value="3"');
  });

  it("renders reference create controls with target display labels", () => {
    const rate = rateEntity();
    const action = createAction(rate, ["resource"], "rate");

    applyBootstrapResponse(
      bootstrap([resourceRecord("resource-1", "Designer"), resourceRecord("resource-2", "Lead")]),
    );
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={action} renderDialogCancel={false} />,
    );

    expect(html).toContain('name="resource"');
    expect(html).toContain("<select");
    expect(html).toContain('value="resource-1"');
    expect(html).toContain("Designer");
    expect(html).toContain("Lead");
  });

  it("renders scoped rate create dialogs without the defaulted card field", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );
    const action = rateModel?.actions.find((candidate) => candidate.type === "create");

    if (!action || action.type !== "create") {
      throw new Error("Missing scoped rate create action.");
    }

    applyBootstrapResponse(
      bootstrap(
        [cardRecord("card-1", "Default"), resourceRecord("resource-1", "Designer")],
        rateCardSchema,
      ),
    );
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm
        action={action}
        queryContext={{ today: "2026-05-01", values: { card: "card-1" } }}
        renderDialogCancel={false}
      />,
    );

    expect(html).toContain('name="resource"');
    expect(html).toContain('name="price"');
    expect(html).not.toContain('name="card"');
    expect(html).not.toContain("Rate card</label>");
  });

  it("resolves create values from visible fields and context defaults", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );
    const action = rateModel?.actions.find((candidate) => candidate.type === "create");

    if (!action || action.type !== "create") {
      throw new Error("Missing scoped rate create action.");
    }

    const formData = new FormData();
    formData.set("resource", "resource-1");
    formData.set("price", "475");

    expect(
      resolveCreateValues(formData, action, {
        today: "2026-05-01",
        values: { card: "card-1" },
      }),
    ).toEqual({
      resource: "resource-1",
      price: 475,
      card: "card-1",
    });
  });

  it("throws when create context defaults are unresolved", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );
    const action = rateModel?.actions.find((candidate) => candidate.type === "create");

    if (!action || action.type !== "create") {
      throw new Error("Missing scoped rate create action.");
    }

    const formData = new FormData();
    formData.set("resource", "resource-1");
    formData.set("price", "475");

    expect(() => resolveCreateValues(formData, action, { today: "2026-05-01" })).toThrow(
      'requires selected context "card"',
    );
  });

  it("renders reference inline editors with target labels and raw missing values", () => {
    const rate = rateEntity();
    const recordFields: RecordFieldConfig[] = [
      {
        fieldName: "resource",
        field: rate.fields.resource,
        editor: "reference",
        commit: "immediate",
      },
    ];

    applyBootstrapResponse(
      bootstrap([
        resourceRecord("resource-1", "Designer"),
        rateRecord("rate-1", "resource-1"),
        rateRecord("rate-2", "missing-resource"),
      ]),
    );
    const html = renderToStaticMarkup(
      <RecordList
        entity={rate}
        entityName="rate"
        query={{ kind: "all" }}
        recordFields={recordFields}
      />,
    );

    expect(html).toContain('aria-label="Resource"');
    expect(html).toContain("Designer");
    expect(html).toContain("missing-resource");
  });

  it("renders only the fields declared by a create view in the dialog", () => {
    const task = appSchema.entities.task;
    const action = createAction(task, ["title", "dueDate"]);
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={action} renderDialogCancel={false} />,
    );

    expect(html).toContain("Create Task");
    expect(html).toContain('name="title"');
    expect(html).toContain('name="dueDate"');
    expect(html).not.toContain('name="done"');
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("Done");
  });

  it("renders a disabled create state when create policy is disabled", () => {
    const task = withMutationPolicy(appSchema.entities.task, { create: false });
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm
        action={createAction(task, ["title", "done", "dueDate"])}
        renderDialogCancel={false}
      />,
    );

    expect(html).toContain("Create is disabled for Task.");
    expect(html).toContain("Create disabled");
    expect(html).toContain("disabled");
  });

  it("filters records through the selected query and hides tombstones", () => {
    const task = appSchema.entities.task;
    const model = selectHomeModel(appSchema);
    const active = taskRecord("record-1", "Open", false);
    const deletedCompleted = {
      ...taskRecord("record-2", "Finished", true),
      deletedAt: "2026-04-29T00:02:00.000Z",
    };

    applyBootstrapResponse(bootstrap([active, deletedCompleted]));
    const html = renderToStaticMarkup(
      <RecordList
        entity={task}
        entityName="task"
        query={appSchema.queries.taskCompleted?.expression ?? { kind: "all" }}
        recordFields={model?.result.recordFields ?? []}
      />,
    );

    expect(html).toContain("No records yet.");
    expect(html).not.toContain("Finished");
  });

  it("humanizes field names when labels are omitted", () => {
    const task: EntitySchema = {
      ...appSchema.entities.task,
      fields: {
        dueDate: { type: "date", required: false },
      },
    };
    const html = renderToStaticMarkup(
      <GeneratedCreateForm
        createFields={createFields(task, ["dueDate"])}
        entity={task}
        entityName="task"
      />,
    );

    expect(html).toContain("Due date");
    expect(html).not.toContain("DueDate");
  });
});

function createFields(entity: EntitySchema, fieldNames: string[]): CreateFieldConfig[] {
  return fieldNames.map((fieldName) => ({
    fieldName,
    field: entity.fields[fieldName],
    editor: entity.fields[fieldName]?.type ?? "text",
  })) as CreateFieldConfig[];
}

function createAction(
  entity: EntitySchema,
  fieldNames: string[],
  entityName = "task",
): Extract<HomeActionConfig, { type: "create" }> {
  return {
    type: "create",
    label: `Create ${entity.label}`,
    entityName,
    entity,
    fields: createFields(entity, fieldNames),
    defaults: [],
    enabled: entity.mutations.create.enabled,
  };
}

function taskRecord(
  id: string,
  title: string,
  done: boolean,
  dueDate = "2026-05-01",
): StoredRecord {
  return {
    id,
    entity: "task",
    values: { title, done, dueDate },
    createdAt: `2026-04-29T00:00:0${id.at(-1)}.000Z`,
  };
}

function enumRecord(kind: string): StoredRecord {
  return {
    id: "record-1",
    entity: "task",
    values: { kind },
    createdAt: "2026-04-29T00:00:01.000Z",
  };
}

function numberRecord(estimate: number): StoredRecord {
  return {
    id: "record-1",
    entity: "task",
    values: { estimate },
    createdAt: "2026-04-29T00:00:01.000Z",
  };
}

function resourceRecord(id: string, name: string): StoredRecord {
  return {
    id,
    entity: "resource",
    values: { name },
    createdAt: `2026-04-29T00:00:0${id.at(-1)}.000Z`,
  };
}

function cardRecord(id: string, name: string): StoredRecord {
  return {
    id,
    entity: "card",
    values: { name },
    createdAt: `2026-04-29T00:00:0${id.at(-1)}.000Z`,
  };
}

function rateRecord(id: string, resource: string): StoredRecord {
  return {
    id,
    entity: "rate",
    values: { resource },
    createdAt: `2026-04-29T00:00:0${id.at(-1)}.000Z`,
  };
}

function rateCardRateRecord(
  id: string,
  resource: string,
  card: string,
  price: number,
): StoredRecord {
  return {
    id,
    entity: "rate",
    values: { resource, card, price },
    createdAt: `2026-04-29T00:00:0${id.at(-1)}.000Z`,
  };
}

function taskEntityWithKindEnum(): EntitySchema {
  return {
    label: "Task",
    fields: {
      kind: {
        type: "enum",
        required: true,
        label: "Kind",
        default: "role",
        values: {
          role: { label: "Role" },
          stream: { label: "Stream" },
        },
      },
    },
    mutations: {
      create: { enabled: true },
      patch: { enabled: true },
      delete: { enabled: false },
    },
  };
}

function rateEntity(): EntitySchema {
  return {
    label: "Rate",
    fields: {
      resource: {
        type: "reference",
        required: true,
        label: "Resource",
        to: "resource",
        displayField: "name",
      },
    },
    mutations: {
      create: { enabled: true },
      patch: { enabled: true },
      delete: { enabled: false },
    },
  };
}

function taskEntityWithEstimateNumber(): EntitySchema {
  return {
    label: "Task",
    fields: {
      estimate: {
        type: "number",
        required: false,
        label: "Estimate",
        min: 0,
        max: 10,
        integer: true,
      },
    },
    mutations: {
      create: { enabled: true },
      patch: { enabled: true },
      delete: { enabled: false },
    },
  };
}

function withMutationPolicy(
  entity: EntitySchema,
  options: { create?: boolean; patch?: boolean },
): EntitySchema {
  return {
    ...entity,
    mutations: {
      create: { enabled: options.create ?? entity.mutations.create.enabled },
      patch: { enabled: options.patch ?? entity.mutations.patch.enabled },
      delete: { enabled: false },
    },
  };
}

function bootstrap(records: StoredRecord[], schema = appSchema): BootstrapResponse {
  return {
    schema,
    schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
    records,
    cursor: 1,
  };
}
