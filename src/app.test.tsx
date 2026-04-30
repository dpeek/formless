import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { App, GeneratedCreateDialogForm, GeneratedCreateForm, RecordList } from "./app.tsx";
import { appSchema } from "./client/schema.ts";
import { applyBootstrapResponse, applyRecordMerge, resetClientStore } from "./client/store.ts";
import { selectHomeModel, type CreateFieldConfig, type HomeActionConfig } from "./client/views.ts";
import type { BootstrapResponse, StoredRecord } from "./shared/protocol.ts";
import type { EntitySchema } from "./shared/schema.ts";

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

    expect(html).toContain("Reset data");
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
