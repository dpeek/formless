import { describe, expect, it } from "vite-plus/test";
import { parseAppSchema } from "./schema.ts";

describe("schema enum fields", () => {
  it("parses enum fields, query values, and generated editors", () => {
    const schema = parseAppSchema(
      baseSchema({
        entities: {
          task: taskEntityWithKindEnum(),
        },
        queries: {
          ...defaultQueries(),
          taskRoles: {
            label: "Roles",
            entity: "task",
            expression: {
              kind: "where",
              ref: { kind: "value", name: "kind" },
              op: "eq",
              value: "role",
            },
          },
        },
        itemViews: {
          taskListItem: {
            entity: "task",
            fields: {
              title: { editor: "text", commit: "field-commit" },
              done: { editor: "boolean", commit: "immediate" },
              kind: { editor: "enum", commit: "immediate" },
            },
          },
        },
        views: {
          taskHome: defaultCollectionView(),
          taskCreate: {
            type: "create",
            entity: "task",
            fields: {
              title: { editor: "text" },
              kind: { editor: "enum" },
            },
          },
        },
      }),
    );

    expect(schema.entities.task?.fields.kind).toEqual({
      type: "enum",
      required: true,
      label: "Kind",
      default: "role",
      values: {
        role: { label: "Role" },
        stream: { label: "Stream" },
      },
    });
    expect(schema.queries.taskRoles?.expression).toMatchObject({
      ref: { kind: "value", name: "kind" },
      op: "eq",
      value: "role",
    });
    expect(schema.itemViews.taskListItem?.fields.kind).toEqual({
      editor: "enum",
      commit: "immediate",
    });
  });

  it("allows required enum fields with defaults to be omitted from create views", () => {
    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: taskEntityWithKindEnum(),
          },
        }),
      ),
    ).not.toThrow();
  });

  it("rejects malformed enum definitions and editors", () => {
    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: {
              ...defaultEntities().task,
              fields: {
                ...defaultEntities().task.fields,
                kind: { type: "enum", required: true, values: {} },
              },
            },
          },
        }),
      ),
    ).toThrow("enum values must not be empty");

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: {
              ...defaultEntities().task,
              fields: {
                ...defaultEntities().task.fields,
                kind: {
                  type: "enum",
                  required: true,
                  values: { role: { label: "Role", color: "green" } },
                },
              },
            },
          },
        }),
      ),
    ).toThrow('enum value "role" has unsupported key "color"');

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: {
              ...defaultEntities().task,
              fields: {
                ...defaultEntities().task.fields,
                kind: {
                  type: "enum",
                  required: true,
                  default: "missing",
                  values: { role: { label: "Role" } },
                },
              },
            },
          },
        }),
      ),
    ).toThrow("enum default must match one of its values");

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: taskEntityWithKindEnum(),
          },
          itemViews: {
            taskListItem: {
              entity: "task",
              fields: {
                kind: { editor: "enum", commit: "field-commit" },
              },
            },
          },
        }),
      ),
    ).toThrow("enum fields must commit immediately");
  });
});

describe("schema number fields", () => {
  it("parses number fields, query values, and generated editors", () => {
    const schema = parseAppSchema(
      baseSchema({
        entities: {
          task: taskEntityWithEstimateNumber(),
        },
        queries: {
          ...defaultQueries(),
          taskEstimateTwo: {
            label: "Estimate 2",
            entity: "task",
            expression: {
              kind: "where",
              ref: { kind: "value", name: "estimate" },
              op: "eq",
              value: 2,
            },
          },
        },
        itemViews: {
          taskListItem: {
            entity: "task",
            fields: {
              title: { editor: "text", commit: "field-commit" },
              estimate: { editor: "number", commit: "field-commit" },
            },
          },
        },
        views: {
          taskHome: defaultCollectionView(),
          taskCreate: {
            type: "create",
            entity: "task",
            fields: {
              title: { editor: "text" },
              estimate: { editor: "number" },
            },
          },
        },
      }),
    );

    expect(schema.entities.task?.fields.estimate).toEqual({
      type: "number",
      required: false,
      label: "Estimate",
      default: 1,
      min: 0,
      max: 10,
      integer: true,
    });
    expect(schema.queries.taskEstimateTwo?.expression).toMatchObject({
      ref: { kind: "value", name: "estimate" },
      op: "eq",
      value: 2,
    });
    expect(schema.itemViews.taskListItem?.fields.estimate).toEqual({
      editor: "number",
      commit: "field-commit",
    });
  });

  it("allows required number fields with defaults to be omitted from create views", () => {
    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: taskEntityWithEstimateNumber({ required: true }),
          },
        }),
      ),
    ).not.toThrow();
  });

  it("rejects malformed number definitions and editors", () => {
    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: taskEntityWithEstimateNumber({ scale: 2 }),
          },
        }),
      ),
    ).toThrow('Field "task.estimate" has unsupported key "scale"');

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: taskEntityWithEstimateNumber({ default: Infinity }),
          },
        }),
      ),
    ).toThrow("number default must be finite");

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: taskEntityWithEstimateNumber({ min: 10, max: 1 }),
          },
        }),
      ),
    ).toThrow("number min must be less than or equal to max");

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: taskEntityWithEstimateNumber({ integer: "yes" }),
          },
        }),
      ),
    ).toThrow("number integer must be a boolean");

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: taskEntityWithEstimateNumber({ default: 1.5 }),
          },
        }),
      ),
    ).toThrow("number default must be an integer");

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: taskEntityWithEstimateNumber(),
          },
          itemViews: {
            taskListItem: {
              entity: "task",
              fields: {
                estimate: { editor: "number", commit: "immediate" },
              },
            },
          },
        }),
      ),
    ).toThrow("number fields must use field-commit");
  });
});

describe("schema query catalog", () => {
  it("parses top-level queries in declaration order", () => {
    const schema = parseAppSchema(baseSchema());

    expect(Object.keys(schema.queries)).toEqual(["taskAll", "taskActive", "taskCompleted"]);
    expect(schema.queries.taskActive).toEqual({
      label: "Active",
      entity: "task",
      expression: {
        kind: "where",
        ref: { kind: "value", name: "done" },
        op: "eq",
        value: false,
      },
    });
  });

  it("rejects unknown query entities", () => {
    expect(() =>
      parseAppSchema(
        baseSchema({
          queries: {
            taskAll: { label: "All", entity: "missing", expression: { kind: "all" } },
          },
        }),
      ),
    ).toThrow('references unknown entity "missing"');
  });

  it("rejects unknown query fields and malformed expressions", () => {
    expect(() =>
      parseAppSchema(
        baseSchema({
          queries: {
            taskAll: {
              label: "All",
              entity: "task",
              expression: {
                kind: "where",
                ref: { kind: "value", name: "missing" },
                op: "eq",
                value: "yes",
              },
            },
          },
        }),
      ),
    ).toThrow('references unknown field "value.missing"');

    expect(() =>
      parseAppSchema(
        baseSchema({
          queries: {
            taskAll: {
              label: "All",
              entity: "task",
              expression: { kind: "and", expressions: [] },
            },
          },
        }),
      ),
    ).toThrow("expressions must be a non-empty array");
  });
});

describe("schema item views", () => {
  it("parses item view field config", () => {
    const schema = parseAppSchema(baseSchema());

    expect(schema.itemViews.taskListItem).toEqual({
      entity: "task",
      fields: {
        title: { editor: "text", commit: "field-commit" },
        done: { editor: "boolean", commit: "immediate" },
        dueDate: { editor: "date", commit: "field-commit" },
      },
    });
  });

  it("validates item view field names, editors, and commit policies", () => {
    expect(() =>
      parseAppSchema(
        baseSchema({
          itemViews: {
            taskListItem: {
              entity: "task",
              fields: {
                missing: { editor: "text", commit: "field-commit" },
              },
            },
          },
        }),
      ),
    ).toThrow('references unknown field "task.missing"');

    expect(() =>
      parseAppSchema(
        baseSchema({
          itemViews: {
            taskListItem: {
              entity: "task",
              fields: {
                done: { editor: "boolean", commit: "field-commit" },
              },
            },
          },
        }),
      ),
    ).toThrow("boolean fields must commit immediately");
  });
});

describe("schema collection views", () => {
  it("parses query slots, defaults, results, and action slots", () => {
    const schema = parseAppSchema(baseSchema());

    expect(schema.views.taskHome).toEqual({
      type: "collection",
      label: "Tasks",
      entity: "task",
      queries: [
        { query: "taskAll", count: { type: "count" } },
        { query: "taskActive", count: { type: "count" } },
        { query: "taskCompleted", label: "Done", count: { type: "count" } },
      ],
      defaultQuery: "taskAll",
      result: { type: "list", itemView: "taskListItem" },
      actions: [
        { type: "create", createView: "taskCreate" },
        { type: "entityAction", action: "clearCompletedTasks", count: { type: "count" } },
      ],
    });
  });

  it("rejects collection query and result entity mismatches", () => {
    expect(() =>
      parseAppSchema(
        baseSchema({
          queries: {
            ...defaultQueries(),
            noteAll: { label: "Notes", entity: "note", expression: { kind: "all" } },
          },
          entities: {
            ...defaultEntities(),
            note: noteEntity(),
          },
          views: {
            ...defaultViews(),
            taskHome: {
              ...defaultCollectionView(),
              queries: [{ query: "noteAll" }],
            },
          },
        }),
      ),
    ).toThrow('query "noteAll" must use entity "task"');

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            ...defaultEntities(),
            note: noteEntity(),
          },
          itemViews: {
            ...defaultItemViews(),
            noteListItem: {
              entity: "note",
              fields: {
                title: { editor: "text", commit: "field-commit" },
              },
            },
          },
          views: {
            ...defaultViews(),
            taskHome: {
              ...defaultCollectionView(),
              result: { type: "list", itemView: "noteListItem" },
            },
          },
        }),
      ),
    ).toThrow('item view "noteListItem" must use entity "task"');
  });

  it("validates collection action slots", () => {
    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            ...defaultEntities(),
            note: noteEntity(),
          },
          views: {
            ...defaultViews(),
            noteCreate: {
              type: "create",
              entity: "note",
              fields: {
                title: { editor: "text" },
              },
            },
            taskHome: {
              ...defaultCollectionView(),
              actions: [{ type: "create", createView: "noteCreate" }],
            },
          },
        }),
      ),
    ).toThrow('create action view "noteCreate" must use entity "task"');

    expect(() =>
      parseAppSchema(
        baseSchema({
          views: {
            ...defaultViews(),
            taskHome: {
              ...defaultCollectionView(),
              actions: [{ type: "entityAction", action: "missing" }],
            },
          },
        }),
      ),
    ).toThrow('references unknown action "missing"');
  });
});

describe("schema entity actions", () => {
  it("accepts valid clear-completed actions that target named queries", () => {
    const schema = parseAppSchema(baseSchema());

    expect(schema.entities.task?.actions?.clearCompletedTasks).toEqual({
      label: "Clear completed",
      kind: "clear-completed",
      target: { query: "taskCompleted" },
    });
  });

  it("rejects missing, unknown, and cross-entity target queries", () => {
    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: {
              ...defaultEntities().task,
              actions: {
                clearCompletedTasks: {
                  label: "Clear completed",
                  kind: "clear-completed",
                },
              },
            },
          },
        }),
      ),
    ).toThrow("target must be an object");

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: {
              ...defaultEntities().task,
              actions: {
                clearCompletedTasks: {
                  label: "Clear completed",
                  kind: "clear-completed",
                  target: { query: "missing" },
                },
              },
            },
          },
        }),
      ),
    ).toThrow('target references unknown query "missing"');

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            ...defaultEntities(),
            note: {
              ...noteEntity(),
              actions: {
                clearCompletedTasks: {
                  label: "Clear completed",
                  kind: "clear-completed",
                  target: { query: "taskCompleted" },
                },
              },
            },
          },
        }),
      ),
    ).toThrow('target query "taskCompleted" must use entity "note"');
  });

  it("rejects clear-completed targets that do not resolve to done eq true", () => {
    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: {
              ...defaultEntities().task,
              actions: {
                clearCompletedTasks: {
                  label: "Clear completed",
                  kind: "clear-completed",
                  target: { query: "taskActive" },
                },
              },
            },
          },
        }),
      ),
    ).toThrow("target must be value.done eq true");
  });
});

function baseSchema(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    entities: defaultEntities(),
    queries: defaultQueries(),
    itemViews: defaultItemViews(),
    views: defaultViews(),
    ...overrides,
  };
}

function defaultEntities() {
  return {
    task: {
      label: "Task",
      fields: {
        title: { type: "text", required: true },
        done: { type: "boolean", required: true, default: false },
        dueDate: { type: "date", required: false },
      },
      mutations: {
        create: { enabled: true },
        patch: { enabled: true },
        delete: { enabled: false },
      },
      actions: {
        clearCompletedTasks: {
          label: "Clear completed",
          kind: "clear-completed",
          target: { query: "taskCompleted" },
        },
      },
    },
  };
}

function taskEntityWithKindEnum() {
  return {
    ...defaultEntities().task,
    fields: {
      ...defaultEntities().task.fields,
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
  };
}

function taskEntityWithEstimateNumber(overrides: Record<string, unknown> = {}) {
  return {
    ...defaultEntities().task,
    fields: {
      ...defaultEntities().task.fields,
      estimate: {
        type: "number",
        required: false,
        label: "Estimate",
        default: 1,
        min: 0,
        max: 10,
        integer: true,
        ...overrides,
      },
    },
  };
}

function noteEntity() {
  return {
    label: "Note",
    fields: {
      title: { type: "text", required: true },
      done: { type: "boolean", required: true, default: false },
    },
    mutations: {
      create: { enabled: true },
      patch: { enabled: true },
      delete: { enabled: false },
    },
  };
}

function defaultQueries() {
  return {
    taskAll: {
      label: "All",
      entity: "task",
      expression: { kind: "all" },
    },
    taskActive: {
      label: "Active",
      entity: "task",
      expression: {
        kind: "where",
        ref: { kind: "value", name: "done" },
        op: "eq",
        value: false,
      },
    },
    taskCompleted: {
      label: "Completed",
      entity: "task",
      expression: {
        kind: "where",
        ref: { kind: "value", name: "done" },
        op: "eq",
        value: true,
      },
    },
  };
}

function defaultItemViews() {
  return {
    taskListItem: {
      entity: "task",
      fields: {
        title: { editor: "text", commit: "field-commit" },
        done: { editor: "boolean", commit: "immediate" },
        dueDate: { editor: "date", commit: "field-commit" },
      },
    },
  };
}

function defaultViews() {
  return {
    taskHome: defaultCollectionView(),
    taskCreate: {
      type: "create",
      entity: "task",
      fields: {
        title: { editor: "text" },
        dueDate: { editor: "date" },
      },
    },
  };
}

function defaultCollectionView() {
  return {
    type: "collection",
    label: "Tasks",
    entity: "task",
    queries: [
      { query: "taskAll", count: { type: "count" } },
      { query: "taskActive", count: { type: "count" } },
      { query: "taskCompleted", label: "Done", count: { type: "count" } },
    ],
    defaultQuery: "taskAll",
    result: { type: "list", itemView: "taskListItem" },
    actions: [
      { type: "create", createView: "taskCreate" },
      { type: "entityAction", action: "clearCompletedTasks", count: { type: "count" } },
    ],
  };
}
