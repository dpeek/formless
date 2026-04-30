import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  App,
  GeneratedCreateDialogForm,
  GeneratedCreateForm,
  HomeAggregateStrip,
  RecordList,
} from "./app.tsx";
import { appSchema } from "./client/schema.ts";
import { applyBootstrapResponse, applyRecordMerge, resetClientStore } from "./client/store.ts";
import {
  selectHomeModel,
  type CreateFieldConfig,
  type HomeActionConfig,
  type HomeListViewConfig,
  type RecordFieldConfig,
} from "./client/views.ts";
import type { BootstrapResponse, StoredRecord } from "./shared/protocol.ts";
import type { AppSchema, EntitySchema } from "./shared/schema.ts";

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
    expect(html).not.toContain("&quot;note&quot;");
    expect(html).toContain("Save schema");
  });

  it("renders a dev reset action", () => {
    const html = renderRoute("/");

    expect(html).toContain("Reset data");
  });

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

  it("renders task rows with editable type-aware controls", () => {
    const task = appSchema.entities.task;
    const record: StoredRecord = {
      id: "record-1",
      entity: "task",
      values: { title: "First", done: true, dueDate: "2026-05-01" },
      createdAt: "2026-04-29T00:00:00.000Z",
    };
    applyBootstrapResponse(bootstrap([record]));
    const html = renderToStaticMarkup(
      <RecordList
        entity={task}
        entityName="task"
        listView={listView(task, ["title", "done", "dueDate"])}
      />,
    );

    expect(html).toContain("Tasks");
    expect(html).toContain('type="text"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
    expect(html).toContain('type="date"');
    expect(html).toContain("2026-05-01");
    expect(html).toContain('aria-label="Due date"');
    expect(html).toContain('sr-only">Due date</label>');
    expect(html).not.toContain(">Done</label>");
  });

  it("renders schema-declared action buttons", () => {
    applyBootstrapResponse(bootstrap([]));
    const html = renderRoute("/");

    expect(html).toContain("Clear completed");
  });

  it("renders create and schema-declared actions in one home action row", () => {
    applyBootstrapResponse(bootstrap([]));
    const html = renderRoute("/");

    expect(html).toContain("Create Task");
    expect(html).toContain("Clear completed");
    expect(html).toContain("All");
    expect(html).toContain("Active");
    expect(html).toContain("Completed");
    expect(html).not.toContain('name="title"');
    expect(html).not.toContain("Due date");
  });

  it("renders aggregate labels on the generated home", () => {
    applyBootstrapResponse(bootstrap([]));
    const html = renderRoute("/");

    expect(html).toContain('aria-label="Collection summary"');
    expect(html).toContain("Total");
    expect(html).toContain("Active");
    expect(html).toContain("Completed");
    expect(html).toContain("Overdue");
  });

  it("renders aggregate counts from bootstrap records with a fixed today", () => {
    applyBootstrapResponse(
      bootstrap([
        aggregateRecord("record-1", "Open overdue", false, "2026-05-01"),
        aggregateRecord("record-2", "Open later", false, "2026-05-03"),
        aggregateRecord("record-3", "Completed", true, "2026-05-01"),
      ]),
    );
    const model = selectHomeModel(appSchema);
    const html = renderToStaticMarkup(
      <HomeAggregateStrip aggregates={model?.aggregates ?? []} today="2026-05-02" />,
    );

    expect(html).toContain('aria-label="Total: 3"');
    expect(html).toContain('aria-label="Active: 2"');
    expect(html).toContain('aria-label="Completed: 1"');
    expect(html).toContain('aria-label="Overdue: 1"');
  });

  it("renders list tab counts from each list query", () => {
    applyBootstrapResponse(
      bootstrap([
        aggregateRecord("record-1", "Open", false),
        aggregateRecord("record-2", "Finished", true),
        aggregateRecord("record-3", "Also open", false),
      ]),
    );
    const html = renderRoute("/");

    expect(html).toMatch(/aria-label="All count"[^>]*>3</);
    expect(html).toMatch(/aria-label="Active count"[^>]*>2</);
    expect(html).toMatch(/aria-label="Completed count"[^>]*>1</);
  });

  it("updates aggregate counts after local record merges", () => {
    applyBootstrapResponse(bootstrap([aggregateRecord("record-1", "Open", false)]));
    const model = selectHomeModel(appSchema);
    const before = renderToStaticMarkup(
      <HomeAggregateStrip aggregates={model?.aggregates ?? []} today="2026-05-02" />,
    );

    applyRecordMerge([aggregateRecord("record-2", "Finished", true)], 2);
    const after = renderToStaticMarkup(
      <HomeAggregateStrip aggregates={model?.aggregates ?? []} today="2026-05-02" />,
    );

    expect(before).toContain('aria-label="Total: 1"');
    expect(before).toContain('aria-label="Completed: 0"');
    expect(after).toContain('aria-label="Total: 2"');
    expect(after).toContain('aria-label="Completed: 1"');
  });

  it("does not render an aggregate strip for schemas without aggregates", () => {
    applyBootstrapResponse(bootstrap([], { ...appSchema, aggregates: {} }));
    const html = renderRoute("/");

    expect(html).not.toContain('aria-label="Collection summary"');
  });

  it("renders the shared home action row once", () => {
    applyBootstrapResponse(bootstrap([]));
    const html = renderRoute("/");

    expect(countOccurrences(html, "Clear completed")).toBe(1);
  });

  it("filters active records through the selected list query", () => {
    const task = appSchema.entities.task;
    const active: StoredRecord = {
      id: "record-1",
      entity: "task",
      values: { title: "Open", done: false },
      createdAt: "2026-04-29T00:00:00.000Z",
    };
    const completed: StoredRecord = {
      id: "record-2",
      entity: "task",
      values: { title: "Finished", done: true },
      createdAt: "2026-04-29T00:01:00.000Z",
    };

    applyBootstrapResponse(bootstrap([active, completed]));
    const html = renderToStaticMarkup(
      <RecordList
        entity={task}
        entityName="task"
        listView={listView(task, ["title", "done"], {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: false,
        })}
      />,
    );

    expect(html).toContain("Open");
    expect(html).not.toContain("Finished");
  });

  it("filters completed records through the selected list query", () => {
    const task = appSchema.entities.task;
    const active: StoredRecord = {
      id: "record-1",
      entity: "task",
      values: { title: "Open", done: false },
      createdAt: "2026-04-29T00:00:00.000Z",
    };
    const completed: StoredRecord = {
      id: "record-2",
      entity: "task",
      values: { title: "Finished", done: true },
      createdAt: "2026-04-29T00:01:00.000Z",
    };

    applyBootstrapResponse(bootstrap([active, completed]));
    const html = renderToStaticMarkup(
      <RecordList
        entity={task}
        entityName="task"
        listView={listView(task, ["title", "done"], {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: true,
        })}
      />,
    );

    expect(html).toContain("Finished");
    expect(html).not.toContain("Open");
  });

  it("hides tombstoned records from generated lists", () => {
    const task = appSchema.entities.task;
    const active: StoredRecord = {
      id: "record-1",
      entity: "task",
      values: { title: "Open", done: false },
      createdAt: "2026-04-29T00:00:00.000Z",
    };
    const deleted: StoredRecord = {
      id: "record-2",
      entity: "task",
      values: { title: "Finished", done: true },
      createdAt: "2026-04-29T00:01:00.000Z",
      deletedAt: "2026-04-29T00:02:00.000Z",
    };

    applyBootstrapResponse(bootstrap([active, deleted]));
    const html = renderToStaticMarkup(
      <RecordList entity={task} entityName="task" listView={listView(task, ["title", "done"])} />,
    );

    expect(html).toContain("Open");
    expect(html).not.toContain("Finished");
  });

  it("does not render tombstoned completed records in the completed list", () => {
    const task = appSchema.entities.task;
    const active: StoredRecord = {
      id: "record-1",
      entity: "task",
      values: { title: "Open", done: false },
      createdAt: "2026-04-29T00:00:00.000Z",
    };
    const deletedCompleted: StoredRecord = {
      id: "record-2",
      entity: "task",
      values: { title: "Finished", done: true },
      createdAt: "2026-04-29T00:01:00.000Z",
      deletedAt: "2026-04-29T00:02:00.000Z",
    };

    applyBootstrapResponse(bootstrap([active, deletedCompleted]));
    const html = renderToStaticMarkup(
      <RecordList
        entity={task}
        entityName="task"
        listView={listView(task, ["title", "done"], {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: true,
        })}
      />,
    );

    expect(html).toContain("No records yet.");
    expect(html).not.toContain("Finished");
  });

  it("renders only the fields declared by a list view", () => {
    const task = appSchema.entities.task;
    const record: StoredRecord = {
      id: "record-1",
      entity: "task",
      values: { title: "First", done: true, dueDate: "2026-05-01" },
      createdAt: "2026-04-29T00:00:00.000Z",
    };
    applyBootstrapResponse(bootstrap([record]));
    const html = renderToStaticMarkup(
      <RecordList entity={task} entityName="task" listView={listView(task, ["title", "done"])} />,
    );

    expect(html).toContain("First");
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('type="date"');
    expect(html).not.toContain("Due date");
  });

  it("renders task rows as read-only when patch policy is disabled", () => {
    const task = withMutationPolicy(appSchema.entities.task, { patch: false });
    const record: StoredRecord = {
      id: "record-1",
      entity: "task",
      values: { title: "First", done: true, dueDate: "2026-05-01" },
      createdAt: "2026-04-29T00:00:00.000Z",
    };
    applyBootstrapResponse(bootstrap([record]));
    const html = renderToStaticMarkup(
      <RecordList
        entity={task}
        entityName="task"
        listView={listView(task, ["title", "done", "dueDate"])}
      />,
    );

    expect(html).toContain("Editing is disabled for Task.");
    expect(html).toContain("disabled");
  });

  it("does not render list tabs for a single-list schema", () => {
    applyBootstrapResponse(bootstrap([], singleListSchema()));
    const html = renderRoute("/");

    expect(html).toContain('aria-label="Collection summary"');
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain("All");
  });

  it("excludes tombstoned records from aggregate counts", () => {
    applyBootstrapResponse(
      bootstrap([
        aggregateRecord("record-1", "Open", false),
        aggregateRecord(
          "record-2",
          "Deleted completed",
          true,
          "2026-05-01",
          "2026-05-02T00:00:00.000Z",
        ),
      ]),
    );
    const model = selectHomeModel(appSchema);
    const html = renderToStaticMarkup(
      <HomeAggregateStrip aggregates={model?.aggregates ?? []} today="2026-05-02" />,
    );

    expect(html).toContain('aria-label="Total: 1"');
    expect(html).toContain('aria-label="Completed: 0"');
  });
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

it("resolves the home model from schema-owned views", () => {
  const model = selectHomeModel(appSchema);

  expect(model?.entityName).toBe("task");
  expect(model?.actions.map((action) => action.actionName)).toEqual(["clearCompletedTasks"]);
  expect(model?.createFields.map((field) => field.fieldName)).toEqual(["title", "dueDate"]);
  expect(model?.listViews.map((view) => view.label)).toEqual(["All", "Active", "Completed"]);
  expect(model?.homeActions.map((action) => action.label)).toEqual([
    "Create Task",
    "Clear completed",
  ]);
  expect(model?.homeActions).toHaveLength(2);
});

it("carries query and field config for every home list view", () => {
  const model = selectHomeModel(appSchema);

  expect(model?.listViews.map((view) => view.viewName)).toEqual([
    "taskAll",
    "taskActive",
    "taskCompleted",
  ]);
  expect(model?.listViews.map((view) => view.query)).toEqual([
    { kind: "all" },
    {
      kind: "where",
      ref: { kind: "value", name: "done" },
      op: "eq",
      value: false,
    },
    {
      kind: "where",
      ref: { kind: "value", name: "done" },
      op: "eq",
      value: true,
    },
  ]);
  expect(model?.listViews.map((view) => view.recordFields.map((field) => field.fieldName))).toEqual(
    [
      ["title", "done", "dueDate"],
      ["title", "done", "dueDate"],
      ["title", "done", "dueDate"],
    ],
  );
});

it("keeps existing single-list schemas as one home list view", () => {
  const schema: AppSchema = {
    ...appSchema,
    views: {
      taskList: {
        type: "list",
        label: "All",
        entity: "task",
        query: { kind: "all" },
        fields: {
          title: { editor: "text", commit: "field-commit" },
          done: { editor: "boolean", commit: "immediate" },
        },
      },
      taskCreate: {
        type: "create",
        entity: "task",
        fields: {
          title: { editor: "text" },
          dueDate: { editor: "date" },
        },
      },
    },
  };
  const model = selectHomeModel(schema);

  expect(model?.listViews).toHaveLength(1);
  expect(model?.listViews[0]).toMatchObject({
    viewName: "taskList",
    label: "All",
    query: { kind: "all" },
  });
  expect(model?.listViews[0]?.recordFields.map((field) => field.fieldName)).toEqual([
    "title",
    "done",
  ]);
});

it("keeps disabled create policy visible in the home model", () => {
  const schema = {
    ...appSchema,
    entities: {
      ...appSchema.entities,
      task: withMutationPolicy(appSchema.entities.task, { create: false }),
    },
  };
  const model = selectHomeModel(schema);
  const create = model?.homeActions.find((action) => action.type === "create");

  expect(create).toMatchObject({
    type: "create",
    label: "Create Task",
    enabled: false,
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
): Extract<HomeActionConfig, { type: "create" }> {
  return {
    type: "create",
    label: `Create ${entity.label}`,
    entityName: "task",
    entity,
    fields: createFields(entity, fieldNames),
    enabled: entity.mutations.create.enabled,
  };
}

function listView(
  entity: EntitySchema,
  fieldNames: string[],
  query: HomeListViewConfig["query"] = { kind: "all" },
): HomeListViewConfig {
  return {
    viewName: "testList",
    label: "Test list",
    query,
    recordFields: recordFields(entity, fieldNames),
  };
}

function recordFields(entity: EntitySchema, fieldNames: string[]): RecordFieldConfig[] {
  return fieldNames.map((fieldName) => {
    const field = entity.fields[fieldName];

    return {
      fieldName,
      field,
      editor: field?.type ?? "text",
      commit: field?.type === "boolean" ? "immediate" : "field-commit",
    };
  }) as RecordFieldConfig[];
}

function aggregateRecord(
  id: string,
  title: string,
  done: boolean,
  dueDate = "2026-05-01",
  deletedAt?: string,
): StoredRecord {
  return {
    id,
    entity: "task",
    values: { title, done, dueDate },
    createdAt: `2026-04-29T00:00:0${id.at(-1)}.000Z`,
    ...(deletedAt ? { deletedAt } : {}),
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

function singleListSchema(): AppSchema {
  return {
    ...appSchema,
    views: {
      taskList: {
        type: "list",
        label: "All",
        entity: "task",
        query: { kind: "all" },
        fields: {
          title: { editor: "text", commit: "field-commit" },
          done: { editor: "boolean", commit: "immediate" },
          dueDate: { editor: "date", commit: "field-commit" },
        },
      },
      taskCreate: {
        type: "create",
        entity: "task",
        fields: {
          title: { editor: "text" },
          dueDate: { editor: "date" },
        },
      },
    },
  };
}

function bootstrap(records: StoredRecord[], schema: AppSchema = appSchema): BootstrapResponse {
  return {
    schema,
    schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
    records,
    cursor: 1,
  };
}

function countOccurrences(value: string, search: string) {
  return value.split(search).length - 1;
}
