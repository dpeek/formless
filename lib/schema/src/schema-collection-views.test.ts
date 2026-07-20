import { describe, expect, it } from "vite-plus/test";

import { parseAppSchema, stringifySchema } from "./index.ts";
import { taskCollectionView, taskEntity, taskSchema, taskScreen } from "./schema-test-fixtures.ts";

describe("schema collection views", () => {
  it("parses query slots, list results, navigation, and operation bindings", () => {
    const schema = parseAppSchema({
      ...taskSchema(),
      views: {
        ...taskSchema().views,
        taskHome: taskCollectionView({ navigation: { primary: true } }),
      },
    });

    expect(schema.views.taskHome).toEqual({
      type: "collection",
      label: "Tasks",
      entity: "task",
      queries: [{ query: "taskAll", count: { type: "count" } }],
      defaultQuery: "taskAll",
      result: { type: "list", itemView: "taskItem" },
      navigation: { primary: true },
      operations: [{ operation: "task.create", createView: "taskCreate" }],
    });
  });

  it("rejects query, result, and operation references owned by another entity", () => {
    const source = schemaWithNotes();

    expect(() =>
      parseAppSchema({
        ...source,
        views: {
          ...source.views,
          taskHome: taskCollectionView({ queries: [{ query: "noteAll" }] }),
        },
      }),
    ).toThrow('query "noteAll" must use entity "task"');

    expect(() =>
      parseAppSchema({
        ...source,
        views: {
          ...source.views,
          taskHome: taskCollectionView({ result: { type: "list", itemView: "noteItem" } }),
        },
      }),
    ).toThrow('item view "noteItem" must use entity "task"');

    expect(() =>
      parseAppSchema({
        ...source,
        views: {
          ...source.views,
          taskHome: taskCollectionView({ operations: [{ operation: "task.missing" }] }),
        },
      }),
    ).toThrow('references unknown operation "task.missing"');
  });

  it("parses relationship-backed context and context-bound create defaults", () => {
    const source = projectTaskSchema();
    const schema = parseAppSchema(source);

    expect(schema.views.taskHome).toMatchObject({
      type: "collection",
      entity: "task",
      context: {
        name: "project",
        entity: "project",
        query: "projectAll",
        labelField: "name",
        presentation: "listDetail",
        relationship: "projectTasks",
        itemView: "projectItem",
        createView: "projectCreate",
      },
      queries: [{ query: "tasksForProject" }],
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("requires context-bound queries and defaults to match collection context", () => {
    const source = projectTaskSchema();

    expect(() =>
      parseAppSchema({
        ...source,
        views: {
          ...source.views,
          taskHome: {
            ...source.views.taskHome,
            context: {
              name: "selection",
              entity: "project",
              query: "projectAll",
              labelField: "name",
              presentation: "listDetail",
              relationship: "projectTasks",
              itemView: "projectItem",
              createView: "projectCreate",
            },
          },
        },
      }),
    ).toThrow('query "tasksForProject" requires context "project"');

    expect(() =>
      parseAppSchema({
        ...source,
        views: {
          ...source.views,
          taskCreate: {
            ...source.views.taskCreate,
            defaults: { project: { kind: "context", name: "selection" } },
          },
        },
      }),
    ).toThrow('requires context "selection" but the collection context is "project"');
  });
});

function schemaWithNotes() {
  const source = taskSchema();

  return {
    ...source,
    entities: {
      ...source.entities,
      note: {
        label: "Note",
        fields: { title: { type: "text", required: true } },
      },
    },
    queries: {
      ...source.queries,
      noteAll: { label: "Notes", entity: "note", expression: { kind: "all" } },
    },
    itemViews: {
      ...source.itemViews,
      noteItem: {
        entity: "note",
        fields: { title: { editor: "text", commit: "field-commit" } },
      },
    },
  };
}

function projectTaskSchema() {
  const source = taskSchema();
  const task = taskEntity({
    fields: {
      ...taskEntity().fields,
      project: {
        type: "reference",
        required: true,
        to: "project",
        displayField: "name",
      },
    },
  });

  return {
    ...source,
    entities: {
      task,
      project: {
        label: "Project",
        fields: { name: { type: "text", required: true, label: "Name" } },
        operations: {
          create: {
            label: "Create project",
            kind: "create",
            scope: "collection",
            effect: { type: "createRecord" },
            output: { type: "create" },
            idempotency: { required: true },
            audit: { input: "summary" },
          },
        },
      },
    },
    relationships: {
      projectTasks: {
        kind: "toMany",
        from: { entity: "project" },
        to: { entity: "task", field: "project" },
      },
    },
    queries: {
      projectAll: { label: "Projects", entity: "project", expression: { kind: "all" } },
      tasksForProject: {
        label: "Tasks",
        entity: "task",
        expression: {
          kind: "where",
          ref: { kind: "value", name: "project" },
          op: "eq",
          value: { kind: "context", name: "project" },
        },
      },
    },
    itemViews: {
      ...source.itemViews,
      projectItem: {
        entity: "project",
        fields: { name: { editor: "text", commit: "field-commit" } },
      },
    },
    views: {
      taskHome: taskCollectionView({
        context: {
          name: "project",
          entity: "project",
          query: "projectAll",
          labelField: "name",
          presentation: "listDetail",
          relationship: "projectTasks",
          itemView: "projectItem",
          createView: "projectCreate",
        },
        queries: [{ query: "tasksForProject" }],
        defaultQuery: "tasksForProject",
      }),
      taskCreate: {
        type: "create",
        entity: "task",
        fields: { title: { editor: "text" } },
        defaults: { project: { kind: "context", name: "project" } },
      },
      projectCreate: {
        type: "create",
        entity: "project",
        fields: { name: { editor: "text" } },
      },
    },
    screens: { home: taskScreen() },
  };
}
