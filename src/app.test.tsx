import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { App, GeneratedCreateForm, RecordList } from "./app.tsx";
import { appSchema } from "./client/schema.ts";
import { applyBootstrapResponse, resetClientStoreForTests } from "./client/store.ts";
import { selectHomeModel, type CreateFieldConfig, type RecordFieldConfig } from "./client/views.ts";
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
  resetClientStoreForTests();
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

  it("renders the task create form with type-aware controls", () => {
    const task = appSchema.entities.task;
    const html = renderToStaticMarkup(
      <GeneratedCreateForm
        createFields={createFields(task, ["title", "done", "dueDate"])}
        entity={task}
        entityName="task"
        onStatusChange={() => {}}
      />,
    );

    expect(html).toContain("Create Task");
    expect(html).toContain('name="title"');
    expect(html).toContain('type="text"');
    expect(html).toContain('name="done"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('name="dueDate"');
    expect(html).toContain('type="date"');
    expect(html).toContain("Due date");
  });

  it("renders only the fields declared by a create view", () => {
    const task = appSchema.entities.task;
    const html = renderToStaticMarkup(
      <GeneratedCreateForm
        createFields={[
          {
            fieldName: "title",
            field: task.fields.title,
            editor: "text",
          },
          {
            fieldName: "dueDate",
            field: task.fields.dueDate,
            editor: "date",
          },
        ]}
        entity={task}
        entityName="task"
        onStatusChange={() => {}}
      />,
    );

    expect(html).toContain("Create Task");
    expect(html).toContain('name="title"');
    expect(html).toContain('type="text"');
    expect(html).toContain('name="dueDate"');
    expect(html).toContain('type="date"');
    expect(html).not.toContain('name="done"');
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("Done");
  });

  it("renders a disabled create state when create policy is disabled", () => {
    const task = withMutationPolicy(appSchema.entities.task, { create: false });
    const html = renderToStaticMarkup(
      <GeneratedCreateForm
        createFields={createFields(task, ["title", "done", "dueDate"])}
        entity={task}
        entityName="task"
        onStatusChange={() => {}}
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
        onStatusChange={() => {}}
        recordFields={recordFields(task, ["title", "done", "dueDate"])}
      />,
    );

    expect(html).toContain("Tasks");
    expect(html).toContain('type="text"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
    expect(html).toContain('type="date"');
    expect(html).toContain("2026-05-01");
    expect(html).toContain("Due date");
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
      <RecordList
        entity={task}
        entityName="task"
        onStatusChange={() => {}}
        recordFields={[
          {
            fieldName: "title",
            field: task.fields.title,
            editor: "text",
            commit: "field-commit",
          },
          {
            fieldName: "done",
            field: task.fields.done,
            editor: "boolean",
            commit: "immediate",
          },
        ]}
      />,
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
        onStatusChange={() => {}}
        recordFields={recordFields(task, ["title", "done", "dueDate"])}
      />,
    );

    expect(html).toContain("Editing is disabled for Task.");
    expect(html).toContain("disabled");
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
      onStatusChange={() => {}}
    />,
  );

  expect(html).toContain("Due date");
  expect(html).not.toContain("DueDate");
});

it("resolves the home model from schema-owned views", () => {
  const model = selectHomeModel(appSchema);

  expect(model?.entityName).toBe("task");
  expect(model?.createFields.map((field) => field.fieldName)).toEqual(["title", "dueDate"]);
  expect(model?.recordFields.map((field) => field.fieldName)).toEqual(["title", "done", "dueDate"]);
});

function createFields(entity: EntitySchema, fieldNames: string[]): CreateFieldConfig[] {
  return fieldNames.map((fieldName) => ({
    fieldName,
    field: entity.fields[fieldName],
    editor: entity.fields[fieldName]?.type ?? "text",
  })) as CreateFieldConfig[];
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

function bootstrap(records: StoredRecord[]): BootstrapResponse {
  return {
    schema: appSchema,
    schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
    records,
    cursor: 1,
  };
}
