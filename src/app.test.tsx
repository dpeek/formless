import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { describe, expect, it } from "vite-plus/test";
import { App, GeneratedCreateForm, RecordList } from "./app.tsx";
import { appSchema } from "./client/schema.ts";
import type { StoredRecord } from "./shared/protocol.ts";
import type { EntitySchema } from "./shared/schema.ts";

function renderRoute(path: string) {
  return renderToStaticMarkup(
    <Router ssrPath={path}>
      <App />
    </Router>,
  );
}

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
      <GeneratedCreateForm entity={task} entityName="task" onStatusChange={() => {}} />,
    );

    expect(html).toContain("Create Task");
    expect(html).toContain('name="title"');
    expect(html).toContain('type="text"');
    expect(html).toContain('name="done"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('name="dueDate"');
    expect(html).toContain('type="date"');
  });

  it("renders a disabled create state when create policy is disabled", () => {
    const task = withMutationPolicy(appSchema.entities.task, { create: false });
    const html = renderToStaticMarkup(
      <GeneratedCreateForm entity={task} entityName="task" onStatusChange={() => {}} />,
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
    const html = renderToStaticMarkup(
      <RecordList entity={task} entityName="task" onStatusChange={() => {}} records={[record]} />,
    );

    expect(html).toContain("Tasks");
    expect(html).toContain('type="text"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
    expect(html).toContain('type="date"');
    expect(html).toContain("2026-05-01");
  });

  it("renders task rows as read-only when patch policy is disabled", () => {
    const task = withMutationPolicy(appSchema.entities.task, { patch: false });
    const record: StoredRecord = {
      id: "record-1",
      entity: "task",
      values: { title: "First", done: true, dueDate: "2026-05-01" },
      createdAt: "2026-04-29T00:00:00.000Z",
    };
    const html = renderToStaticMarkup(
      <RecordList entity={task} entityName="task" onStatusChange={() => {}} records={[record]} />,
    );

    expect(html).toContain("Editing is disabled for Task.");
    expect(html).toContain("disabled");
  });
});

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
