import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { App, GeneratedCreateDialogForm, GeneratedCreateForm, RecordList } from "./app.tsx";
import { appSchema } from "./client/schema.ts";
import { applyBootstrapResponse, resetClientStore } from "./client/store.ts";
import {
  selectHomeModel,
  type CreateFieldConfig,
  type HomeActionConfig,
  type RecordFieldConfig,
} from "./client/views.ts";
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
        recordFields={recordFields(task, ["title", "done", "dueDate"])}
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
    const task = appSchema.entities.task;
    const html = renderToStaticMarkup(
      <RecordList
        entity={task}
        entityName="task"
        homeActions={[
          {
            type: "entity-action",
            label: "Clear completed",
            entityName: "task",
            actionName: "clearCompletedTasks",
            action: task.actions!.clearCompletedTasks,
          },
        ]}
        recordFields={recordFields(task, ["title", "done"])}
      />,
    );

    expect(html).toContain("Clear completed");
  });

  it("renders create and schema-declared actions in one home action row", () => {
    applyBootstrapResponse(bootstrap([]));
    const html = renderRoute("/");

    expect(html).toContain("Create Task");
    expect(html).toContain("Clear completed");
    expect(html).not.toContain('name="title"');
    expect(html).not.toContain("Due date");
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
      <RecordList
        entity={task}
        entityName="task"
        recordFields={recordFields(task, ["title", "done"])}
      />,
    );

    expect(html).toContain("Open");
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
      <RecordList
        entity={task}
        entityName="task"
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
  expect(model?.homeActions.map((action) => action.label)).toEqual([
    "Create Task",
    "Clear completed",
  ]);
  expect(model?.recordFields.map((field) => field.fieldName)).toEqual(["title", "done", "dueDate"]);
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
