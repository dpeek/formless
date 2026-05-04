import { describe, expect, it } from "vite-plus/test";
import rawRateCardSchema from "../../schema/samples/rate-card.json";
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

describe("schema reference fields", () => {
  it("parses required and optional reference fields with forward entity references", () => {
    const schema = parseAppSchema(
      referenceSchema({
        queries: {
          rateAll: {
            label: "All rates",
            entity: "rate",
            expression: { kind: "all" },
          },
          defaultRates: {
            label: "Default",
            entity: "rate",
            expression: {
              kind: "where",
              ref: { kind: "value", name: "resource" },
              op: "eq",
              value: "rec_resource_designer",
            },
          },
        },
      }),
    );

    expect(schema.entities.rate?.fields.resource).toEqual({
      type: "reference",
      required: true,
      label: "Resource",
      to: "resource",
      displayField: "name",
    });
    expect(schema.entities.rate?.fields.optionalResource).toEqual({
      type: "reference",
      required: false,
      label: "Backup resource",
      to: "resource",
      displayField: "name",
    });
    expect(schema.queries.defaultRates?.expression).toMatchObject({
      ref: { kind: "value", name: "resource" },
      op: "eq",
      value: "rec_resource_designer",
    });
  });

  it("rejects unknown targets, invalid display fields, and unsupported keys", () => {
    expect(() =>
      parseAppSchema(
        referenceSchema({
          entities: rateCardEntities({
            ...resourceReferenceField(),
            to: "missing",
          }),
        }),
      ),
    ).toThrow('references unknown entity "missing"');

    expect(() =>
      parseAppSchema(
        referenceSchema({
          entities: rateCardEntities({
            ...resourceReferenceField(),
            displayField: "missing",
          }),
        }),
      ),
    ).toThrow('displayField references unknown field "resource.missing"');

    expect(() =>
      parseAppSchema(
        referenceSchema({
          entities: {
            ...rateCardEntities({
              ...resourceReferenceField(),
              displayField: "active",
            }),
            resource: {
              ...rateCardEntities().resource,
              fields: {
                name: { type: "text", required: true, label: "Name" },
                active: { type: "boolean", required: true, default: true },
              },
            },
          },
        }),
      ),
    ).toThrow("displayField must reference a text field");

    expect(() =>
      parseAppSchema(
        referenceSchema({
          entities: rateCardEntities({
            ...resourceReferenceField(),
            default: "rec_resource_designer",
          }),
        }),
      ),
    ).toThrow('Field "rate.resource" has unsupported key "default"');
  });

  it("requires reference editors and immediate item-view commits", () => {
    expect(() =>
      parseAppSchema(
        referenceSchema({
          views: {
            ...referenceViews(),
            rateCreate: {
              type: "create",
              entity: "rate",
              fields: {
                resource: { editor: "text" },
              },
            },
          },
        }),
      ),
    ).toThrow('editor must match field type "reference"');

    expect(() =>
      parseAppSchema(
        referenceSchema({
          itemViews: {
            rateListItem: {
              entity: "rate",
              fields: {
                resource: { editor: "reference", commit: "field-commit" },
              },
            },
          },
        }),
      ),
    ).toThrow("reference fields must commit immediately");
  });
});

describe("schema create view defaults", () => {
  it("accepts context defaults for omitted required reference fields", () => {
    const schema = parseAppSchema(scopedRateSchema());

    expect(schema.views.rateCreateForCard).toEqual({
      type: "create",
      entity: "rate",
      fields: {
        resource: { editor: "reference" },
        cost: { editor: "number" },
        costUnit: { editor: "enum" },
        price: { editor: "number" },
      },
      defaults: {
        card: { kind: "context", name: "card" },
      },
    });
  });

  it("rejects unknown, duplicated, and empty create defaults", () => {
    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          views: {
            ...scopedRateViews(),
            rateCreateForCard: {
              ...scopedRateViews().rateCreateForCard,
              defaults: {
                missing: { kind: "context", name: "card" },
              },
            },
          },
        }),
      ),
    ).toThrow('default "missing" references unknown field "rate.missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          views: {
            ...scopedRateViews(),
            rateCreateForCard: {
              ...scopedRateViews().rateCreateForCard,
              defaults: {
                resource: { kind: "context", name: "card" },
              },
            },
          },
        }),
      ),
    ).toThrow('default "resource" must not also appear in fields');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          views: {
            ...scopedRateViews(),
            rateCreateForCard: {
              ...scopedRateViews().rateCreateForCard,
              defaults: {},
            },
          },
        }),
      ),
    ).toThrow("defaults must not be empty");
  });

  it("rejects malformed context create defaults", () => {
    expect(() => parseAppSchema(schemaWithRateCreateDefault("not-context"))).toThrow(
      'default "card" must be an object',
    );

    expect(() => parseAppSchema(schemaWithRateCreateDefault({ kind: "context" }))).toThrow(
      'default "card" must include "name"',
    );

    expect(() =>
      parseAppSchema(schemaWithRateCreateDefault({ kind: "context", name: "" })),
    ).toThrow('default "card" name must be a non-empty string');

    expect(() =>
      parseAppSchema(schemaWithRateCreateDefault({ kind: "context", name: "card", extra: true })),
    ).toThrow('default "card" has unsupported key "extra"');

    expect(() =>
      parseAppSchema(schemaWithRateCreateDefault({ kind: "literal", name: "card" })),
    ).toThrow('default "card" has unsupported kind "literal"');
  });

  it("rejects context defaults on non-reference fields", () => {
    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          views: {
            ...scopedRateViews(),
            rateCreateForCard: {
              type: "create",
              entity: "rate",
              fields: {
                resource: { editor: "reference" },
                card: { editor: "reference" },
              },
              defaults: {
                price: { kind: "context", name: "card" },
              },
            },
          },
        }),
      ),
    ).toThrow('default "price" requires a reference field');
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

describe("schema table views", () => {
  it("parses table field columns and table collection results", () => {
    const schema = parseAppSchema(
      scopedRateSchema({
        views: scopedRateViews({
          result: { type: "table", tableView: "rateTable" },
        }),
      }),
    );

    expect(schema.tableViews.rateTable).toEqual({
      entity: "rate",
      columns: [
        {
          type: "field",
          field: "resource",
          label: "Role",
          editor: "reference",
          commit: "immediate",
        },
        {
          type: "field",
          field: "cost",
          editor: "number",
          commit: "field-commit",
          align: "end",
        },
        {
          type: "field",
          field: "costUnit",
          editor: "enum",
          commit: "immediate",
        },
        {
          type: "field",
          field: "price",
          editor: "number",
          commit: "field-commit",
          align: "end",
        },
        {
          type: "field",
          field: "currency",
          editor: "enum",
          commit: "immediate",
        },
      ],
    });
    expect(schema.views.rateHome).toMatchObject({
      type: "collection",
      result: { type: "table", tableView: "rateTable" },
    });
  });

  it("validates table view field columns", () => {
    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              columns: [],
            },
          },
        }),
      ),
    ).toThrow("columns must be a non-empty array");

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              columns: [{ type: "field", field: "missing" }],
            },
          },
        }),
      ),
    ).toThrow('references unknown field "rate.missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              columns: [{ type: "field", field: "cost", editor: "text" }],
            },
          },
        }),
      ),
    ).toThrow('editor must match field type "number"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              columns: [{ type: "field", field: "resource", commit: "field-commit" }],
            },
          },
        }),
      ),
    ).toThrow("reference fields must commit immediately");

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              columns: [{ type: "field", field: "cost", align: "right" }],
            },
          },
        }),
      ),
    ).toThrow('align must be "start", "center", or "end"');
  });

  it("validates collection table result references", () => {
    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {},
          views: scopedRateViews({
            result: { type: "table", tableView: "missing" },
          }),
        }),
      ),
    ).toThrow('references unknown table view "missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            resourceTable: {
              entity: "resource",
              columns: [{ type: "field", field: "name" }],
            },
          },
          views: scopedRateViews({
            result: { type: "table", tableView: "resourceTable" },
          }),
        }),
      ),
    ).toThrow('table view "resourceTable" must use entity "rate"');
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

  it("accepts collection contexts and context-bound child queries", () => {
    const schema = parseAppSchema(scopedRateSchema());

    expect(schema.views.rateHome).toMatchObject({
      type: "collection",
      entity: "rate",
      context: {
        name: "card",
        entity: "card",
        query: "cardAll",
        labelField: "name",
        createView: "cardCreate",
      },
      queries: [{ query: "ratesForSelectedCard", count: { type: "count" } }],
      defaultQuery: "ratesForSelectedCard",
    });
  });

  it("validates collection context shape", () => {
    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          views: scopedRateViews({
            context: {
              name: "card",
              entity: "missing",
              query: "cardAll",
              labelField: "name",
            },
          }),
        }),
      ),
    ).toThrow('context references unknown entity "missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          views: scopedRateViews({
            context: {
              name: "card",
              entity: "card",
              query: "missing",
              labelField: "name",
            },
          }),
        }),
      ),
    ).toThrow('context references unknown query "missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          views: scopedRateViews({
            context: {
              name: "card",
              entity: "card",
              query: "resourceAll",
              labelField: "name",
            },
          }),
        }),
      ),
    ).toThrow('context query "resourceAll" must use entity "card"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          views: scopedRateViews({
            context: {
              name: "card",
              entity: "card",
              query: "cardAll",
              labelField: "missing",
            },
          }),
        }),
      ),
    ).toThrow('labelField references unknown field "card.missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          views: scopedRateViews({
            context: {
              name: "card",
              entity: "card",
              query: "cardAll",
              labelField: "marginMed",
            },
          }),
        }),
      ),
    ).toThrow("labelField must reference a text field");
  });

  it("validates context create views separately from collection create actions", () => {
    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          views: scopedRateViews({
            context: {
              name: "card",
              entity: "card",
              query: "cardAll",
              labelField: "name",
              createView: "missing",
            },
          }),
        }),
      ),
    ).toThrow('context createView references unknown view "missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          views: scopedRateViews({
            context: {
              name: "card",
              entity: "card",
              query: "cardAll",
              labelField: "name",
              createView: "rateCreate",
            },
          }),
        }),
      ),
    ).toThrow('context createView "rateCreate" must use entity "card"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          entities: {
            ...scopedRateEntities(),
            card: {
              ...scopedRateEntities().card,
              fields: {
                ...scopedRateEntities().card.fields,
                parentCard: {
                  type: "reference",
                  required: false,
                  label: "Parent card",
                  to: "card",
                },
              },
            },
          },
          views: {
            ...scopedRateViews({
              context: {
                name: "card",
                entity: "card",
                query: "cardAll",
                labelField: "name",
                createView: "cardCreateWithContextDefault",
              },
            }),
            cardCreateWithContextDefault: {
              type: "create",
              entity: "card",
              fields: {
                name: { editor: "text" },
              },
              defaults: {
                parentCard: { kind: "context", name: "card" },
              },
            },
          },
        }),
      ),
    ).toThrow(
      'context createView "cardCreateWithContextDefault" must not require context defaults',
    );
  });

  it("rejects collection queries with invalid context requirements", () => {
    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          views: scopedRateViews({ context: undefined }),
        }),
      ),
    ).toThrow('query "ratesForSelectedCard" requires context but the collection has no context');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          queries: {
            ...scopedRateQueries(),
            ratesForSelectedCard: {
              label: "For selected card",
              entity: "rate",
              expression: {
                kind: "where",
                ref: { kind: "value", name: "card" },
                op: "eq",
                value: { kind: "context", name: "otherCard" },
              },
            },
          },
        }),
      ),
    ).toThrow('requires context "otherCard" but the collection context is "card"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          queries: {
            ...scopedRateQueries(),
            ratesForSelectedCard: {
              label: "For selected card",
              entity: "rate",
              expression: {
                kind: "where",
                ref: { kind: "value", name: "resource" },
                op: "eq",
                value: { kind: "context", name: "card" },
              },
            },
          },
        }),
      ),
    ).toThrow('context query field must reference entity "card"');
  });

  it("rejects context values in context selector and entity action target queries", () => {
    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          queries: {
            ...scopedRateQueries(),
            cardAll: {
              label: "Cards",
              entity: "card",
              expression: {
                kind: "where",
                ref: { kind: "value", name: "defaultRate" },
                op: "eq",
                value: { kind: "context", name: "rate" },
              },
            },
          },
          entities: {
            ...scopedRateEntities(),
            card: {
              ...scopedRateEntities().card,
              fields: {
                ...scopedRateEntities().card.fields,
                defaultRate: {
                  type: "reference",
                  required: false,
                  label: "Default rate",
                  to: "rate",
                },
              },
            },
          },
        }),
      ),
    ).toThrow('context query "cardAll" must not require context');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          entities: {
            ...scopedRateEntities(),
            rate: {
              ...scopedRateEntities().rate,
              fields: {
                ...scopedRateEntities().rate.fields,
                done: { type: "boolean", required: true, default: false },
              },
              actions: {
                clearCompletedRates: {
                  label: "Clear completed",
                  kind: "clear-completed",
                  target: { query: "ratesForSelectedCard" },
                },
              },
            },
          },
        }),
      ),
    ).toThrow('target query "ratesForSelectedCard" must not require context');
  });

  it("rejects context-default create actions without a matching collection context", () => {
    const rateAllQuery = {
      label: "All rates",
      entity: "rate",
      expression: { kind: "all" },
    };

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          queries: {
            ...scopedRateQueries(),
            rateAll: rateAllQuery,
          },
          views: scopedRateViews({
            context: undefined,
            queries: [{ query: "rateAll" }],
            defaultQuery: "rateAll",
          }),
        }),
      ),
    ).toThrow('create action view "rateCreateForCard" requires context defaults');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          queries: {
            ...scopedRateQueries(),
            rateAll: rateAllQuery,
          },
          views: scopedRateViews({
            context: {
              name: "selectedCard",
              entity: "card",
              query: "cardAll",
              labelField: "name",
              createView: "cardCreate",
            },
            queries: [{ query: "rateAll" }],
            defaultQuery: "rateAll",
          }),
        }),
      ),
    ).toThrow('requires context "card" but the collection context is "selectedCard"');
  });

  it("rejects context-default fields that do not reference the collection context entity", () => {
    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          views: {
            ...scopedRateViews(),
            rateCreateForCard: {
              type: "create",
              entity: "rate",
              fields: {
                card: { editor: "reference" },
                price: { editor: "number" },
              },
              defaults: {
                resource: { kind: "context", name: "card" },
              },
            },
          },
        }),
      ),
    ).toThrow('default field "resource" must reference entity "card"');
  });
});

describe("rate-card sample schema", () => {
  it("parses the expanded flat rate-card sample fields and views", () => {
    const schema = parseAppSchema(rawRateCardSchema);

    expect(Object.keys(schema.entities.resource?.fields ?? {})).toEqual(["name", "kind", "unit"]);
    expect(schema.entities.resource?.fields.kind).toEqual({
      type: "enum",
      required: true,
      label: "Kind",
      default: "role",
      values: {
        generic: { label: "Generic" },
        role: { label: "Role" },
        stream: { label: "Stream" },
        product: { label: "Product" },
      },
    });
    expect(schema.entities.card?.fields).toMatchObject({
      isDefault: { type: "boolean", required: true, default: false },
      marginMin: { type: "number", required: true, default: 0.4, min: 0 },
      marginMed: { type: "number", required: true, default: 0.5, min: 0 },
      marginMax: { type: "number", required: true, default: 0.6, min: 0 },
    });
    expect(Object.keys(schema.entities.rate?.fields ?? {})).toEqual([
      "resource",
      "card",
      "cost",
      "costUnit",
      "price",
      "priceSet",
      "currency",
    ]);
    expect(schema.entities.rate?.actions?.regenerateMissingRates).toEqual({
      label: "Regenerate missing rates",
      kind: "create-missing-join-records",
      join: {
        left: { field: "resource", query: "resourceAll" },
        right: { field: "card", query: "cardAll" },
      },
    });
    expect(schema.itemViews.rateListItem?.fields).toEqual({
      resource: { editor: "reference", commit: "immediate" },
      cost: { editor: "number", commit: "field-commit" },
      costUnit: { editor: "enum", commit: "immediate" },
      price: { editor: "number", commit: "field-commit" },
      currency: { editor: "enum", commit: "immediate" },
    });
    expect(schema.tableViews.rateTable?.columns.map((column) => column.field)).toEqual([
      "resource",
      "cost",
      "costUnit",
      "price",
      "currency",
    ]);
    expect(schema.views.rateHome).toMatchObject({
      type: "collection",
      result: { type: "table", tableView: "rateTable" },
      actions: [
        { type: "create", createView: "rateCreateForCard" },
        { type: "entityAction", action: "regenerateMissingRates" },
      ],
    });
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

  it("accepts create-missing-join-records actions over reference fields", () => {
    const entities = scopedRateEntities();
    const schema = parseAppSchema(
      scopedRateSchema({
        entities: {
          ...entities,
          rate: {
            ...entities.rate,
            actions: {
              regenerateMissingRates: rateJoinAction(),
            },
          },
        },
      }),
    );

    expect(schema.entities.rate?.actions?.regenerateMissingRates).toEqual(rateJoinAction());
  });

  it("accepts create afterCreate hooks that reference create-missing-join-records actions", () => {
    const entities = scopedRateEntities();
    const schema = parseAppSchema(
      scopedRateSchema({
        entities: {
          ...entities,
          resource: {
            ...entities.resource,
            mutations: {
              ...entities.resource.mutations,
              create: {
                enabled: true,
                afterCreate: [{ entity: "rate", action: "regenerateMissingRates" }],
              },
            },
          },
          card: {
            ...entities.card,
            mutations: {
              ...entities.card.mutations,
              create: {
                enabled: true,
                afterCreate: [{ entity: "rate", action: "regenerateMissingRates" }],
              },
            },
          },
          rate: {
            ...entities.rate,
            actions: {
              regenerateMissingRates: rateJoinAction(),
            },
          },
        },
      }),
    );

    expect(schema.entities.resource?.mutations.create.afterCreate).toEqual([
      { entity: "rate", action: "regenerateMissingRates" },
    ]);
    expect(schema.entities.card?.mutations.create.afterCreate).toEqual([
      { entity: "rate", action: "regenerateMissingRates" },
    ]);
  });

  it("rejects invalid create afterCreate hooks", () => {
    const entities = scopedRateEntities();

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          entities: {
            ...entities,
            resource: {
              ...entities.resource,
              mutations: {
                ...entities.resource.mutations,
                create: {
                  enabled: true,
                  afterCreate: [{ entity: "missing", action: "regenerateMissingRates" }],
                },
              },
            },
          },
        }),
      ),
    ).toThrow('create.afterCreate hook 0 references unknown entity "missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          entities: {
            ...entities,
            resource: {
              ...entities.resource,
              mutations: {
                ...entities.resource.mutations,
                create: {
                  enabled: true,
                  afterCreate: [{ entity: "rate", action: "missing" }],
                },
              },
            },
          },
        }),
      ),
    ).toThrow('create.afterCreate hook 0 references unknown action "missing" for entity "rate"');
  });

  it("rejects create-missing-join-records actions without required defaults", () => {
    const entities = scopedRateEntities();

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          entities: {
            ...entities,
            rate: {
              ...entities.rate,
              fields: {
                ...entities.rate.fields,
                cost: { type: "number", required: true, label: "Cost", min: 0 },
              },
              actions: {
                regenerateMissingRates: rateJoinAction(),
              },
            },
          },
        }),
      ),
    ).toThrow('requires field "cost" to have a default');
  });
});

function baseSchema(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    entities: defaultEntities(),
    queries: defaultQueries(),
    itemViews: defaultItemViews(),
    tableViews: {},
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

function referenceSchema(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    entities: rateCardEntities(),
    queries: {
      rateAll: {
        label: "All rates",
        entity: "rate",
        expression: { kind: "all" },
      },
    },
    itemViews: {
      rateListItem: {
        entity: "rate",
        fields: {
          resource: { editor: "reference", commit: "immediate" },
          price: { editor: "number", commit: "field-commit" },
        },
      },
    },
    tableViews: {},
    views: referenceViews(),
    ...overrides,
  };
}

function rateCardEntities(resourceField: Record<string, unknown> = resourceReferenceField()) {
  return {
    rate: {
      label: "Rate",
      fields: {
        resource: resourceField,
        optionalResource: {
          type: "reference",
          required: false,
          label: "Backup resource",
          to: "resource",
          displayField: "name",
        },
        price: { type: "number", required: false, label: "Price", min: 0 },
      },
      mutations: {
        create: { enabled: true },
        patch: { enabled: true },
        delete: { enabled: false },
      },
    },
    resource: {
      label: "Resource",
      fields: {
        name: { type: "text", required: true, label: "Name" },
      },
      mutations: {
        create: { enabled: true },
        patch: { enabled: true },
        delete: { enabled: false },
      },
    },
  };
}

function resourceReferenceField() {
  return {
    type: "reference",
    required: true,
    label: "Resource",
    to: "resource",
    displayField: "name",
  };
}

function referenceViews() {
  return {
    rateHome: {
      type: "collection",
      label: "Rates",
      entity: "rate",
      queries: [{ query: "rateAll" }],
      defaultQuery: "rateAll",
      result: { type: "list", itemView: "rateListItem" },
      actions: [{ type: "create", createView: "rateCreate" }],
    },
    rateCreate: {
      type: "create",
      entity: "rate",
      fields: {
        resource: { editor: "reference" },
        price: { editor: "number" },
      },
    },
  };
}

function scopedRateSchema(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    entities: scopedRateEntities(),
    queries: scopedRateQueries(),
    itemViews: scopedRateItemViews(),
    tableViews: scopedRateTableViews(),
    views: scopedRateViews(),
    ...overrides,
  };
}

function scopedRateEntities() {
  return {
    resource: {
      label: "Resource",
      fields: {
        name: { type: "text", required: true, label: "Name" },
        kind: {
          type: "enum",
          required: true,
          label: "Kind",
          default: "role",
          values: {
            generic: { label: "Generic" },
            role: { label: "Role" },
            stream: { label: "Stream" },
            product: { label: "Product" },
          },
        },
        unit: unitField(),
      },
      mutations: {
        create: { enabled: true },
        patch: { enabled: true },
        delete: { enabled: false },
      },
    },
    card: {
      label: "Rate card",
      fields: {
        name: { type: "text", required: true, label: "Name" },
        isDefault: {
          type: "boolean",
          required: true,
          label: "Default",
          default: false,
        },
        marginMin: {
          type: "number",
          required: true,
          label: "Minimum margin",
          default: 0.4,
          min: 0,
        },
        marginMed: {
          type: "number",
          required: true,
          label: "Medium margin",
          default: 0.5,
          min: 0,
        },
        marginMax: {
          type: "number",
          required: true,
          label: "Maximum margin",
          default: 0.6,
          min: 0,
        },
      },
      mutations: {
        create: { enabled: true },
        patch: { enabled: true },
        delete: { enabled: false },
      },
    },
    rate: {
      label: "Rate",
      fields: {
        resource: {
          type: "reference",
          required: true,
          label: "Resource",
          to: "resource",
          displayField: "name",
        },
        card: {
          type: "reference",
          required: true,
          label: "Rate card",
          to: "card",
          displayField: "name",
        },
        cost: { type: "number", required: true, label: "Cost", default: 0, min: 0 },
        costUnit: costUnitField(),
        price: { type: "number", required: true, label: "Price", default: 0, min: 0 },
        priceSet: {
          type: "boolean",
          required: true,
          label: "Price set",
          default: true,
        },
        currency: {
          type: "enum",
          required: true,
          label: "Currency",
          default: "usd",
          values: {
            usd: { label: "USD" },
            aud: { label: "AUD" },
            eur: { label: "EUR" },
            gbp: { label: "GBP" },
          },
        },
      },
      mutations: {
        create: { enabled: true },
        patch: { enabled: true },
        delete: { enabled: false },
      },
    },
  };
}

function costUnitField() {
  return {
    type: "enum",
    required: true,
    label: "Cost unit",
    default: "day",
    values: {
      hour: { label: "Hour" },
      day: { label: "Day" },
      week: { label: "Week" },
      month: { label: "Month" },
      year: { label: "Year" },
    },
  };
}

function unitField() {
  return {
    type: "enum",
    required: true,
    label: "Unit",
    default: "day",
    values: {
      hour: { label: "Hour" },
      day: { label: "Day" },
      week: { label: "Week" },
      month: { label: "Month" },
    },
  };
}

function scopedRateQueries() {
  return {
    resourceAll: {
      label: "Resources",
      entity: "resource",
      expression: { kind: "all" },
    },
    cardAll: {
      label: "Cards",
      entity: "card",
      expression: { kind: "all" },
    },
    ratesForSelectedCard: {
      label: "For selected card",
      entity: "rate",
      expression: {
        kind: "where",
        ref: { kind: "value", name: "card" },
        op: "eq",
        value: { kind: "context", name: "card" },
      },
    },
  };
}

function scopedRateItemViews() {
  return {
    rateListItem: {
      entity: "rate",
      fields: {
        resource: { editor: "reference", commit: "immediate" },
        cost: { editor: "number", commit: "field-commit" },
        costUnit: { editor: "enum", commit: "immediate" },
        price: { editor: "number", commit: "field-commit" },
        currency: { editor: "enum", commit: "immediate" },
      },
    },
  };
}

function scopedRateTableViews() {
  return {
    rateTable: {
      entity: "rate",
      columns: [
        {
          type: "field",
          field: "resource",
          label: "Role",
          editor: "reference",
          commit: "immediate",
        },
        {
          type: "field",
          field: "cost",
          editor: "number",
          commit: "field-commit",
          align: "end",
        },
        {
          type: "field",
          field: "costUnit",
          editor: "enum",
          commit: "immediate",
        },
        {
          type: "field",
          field: "price",
          editor: "number",
          commit: "field-commit",
          align: "end",
        },
        {
          type: "field",
          field: "currency",
          editor: "enum",
          commit: "immediate",
        },
      ],
    },
  };
}

function scopedRateViews(rateHomeOverrides: Record<string, unknown> = {}) {
  return {
    rateHome: {
      type: "collection",
      label: "Rates",
      entity: "rate",
      context: {
        name: "card",
        entity: "card",
        query: "cardAll",
        labelField: "name",
        createView: "cardCreate",
      },
      queries: [{ query: "ratesForSelectedCard", count: { type: "count" } }],
      defaultQuery: "ratesForSelectedCard",
      result: { type: "list", itemView: "rateListItem" },
      actions: [{ type: "create", createView: "rateCreateForCard" }],
      ...rateHomeOverrides,
    },
    rateCreate: {
      type: "create",
      entity: "rate",
      fields: {
        resource: { editor: "reference" },
        card: { editor: "reference" },
        cost: { editor: "number" },
        costUnit: { editor: "enum" },
        price: { editor: "number" },
      },
    },
    rateCreateForCard: {
      type: "create",
      entity: "rate",
      fields: {
        resource: { editor: "reference" },
        cost: { editor: "number" },
        costUnit: { editor: "enum" },
        price: { editor: "number" },
      },
      defaults: {
        card: { kind: "context", name: "card" },
      },
    },
    cardCreate: {
      type: "create",
      entity: "card",
      fields: {
        name: { editor: "text" },
      },
    },
  };
}

function rateJoinAction() {
  return {
    label: "Regenerate missing rates",
    kind: "create-missing-join-records",
    join: {
      left: { field: "resource", query: "resourceAll" },
      right: { field: "card", query: "cardAll" },
    },
  };
}

function schemaWithRateCreateDefault(defaultValue: unknown) {
  return scopedRateSchema({
    views: {
      ...scopedRateViews(),
      rateCreateForCard: {
        ...scopedRateViews().rateCreateForCard,
        defaults: {
          card: defaultValue,
        },
      },
    },
  });
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
