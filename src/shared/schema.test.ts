import { describe, expect, it } from "vite-plus/test";
import rawRateCardSchema from "../../schema/apps/estii/schema.json";
import rawSiteSchema from "../../schema/apps/site/schema.json";
import { sourceLikeSchemas, sourceLikeSiteSchema } from "../test/schema-builders.ts";
import { testSiteSeedRecords } from "../test/site-records.ts";
import { parseAppSchema, stringifySchema } from "./schema.ts";

describe("schema mutation policies", () => {
  it("preserves delete policy through stringify", () => {
    const schema = parseAppSchema(baseSchema());
    const enabledSchema = parseAppSchema(
      baseSchema({
        entities: {
          task: {
            ...defaultEntities().task,
            mutations: {
              create: { enabled: true },
              patch: { enabled: true },
              delete: { enabled: true },
            },
          },
        },
      }),
    );
    const serialized = JSON.parse(stringifySchema(schema));
    const serializedEnabled = JSON.parse(stringifySchema(enabledSchema));

    expect(schema.entities.task?.mutations.delete).toEqual({ enabled: false });
    expect(serialized.entities.task.mutations.delete).toEqual({ enabled: false });
    expect(parseAppSchema(serialized)).toEqual(schema);
    expect(enabledSchema.entities.task?.mutations.delete).toEqual({ enabled: true });
    expect(serializedEnabled.entities.task.mutations.delete).toEqual({ enabled: true });
    expect(parseAppSchema(serializedEnabled)).toEqual(enabledSchema);
  });
});

describe("schema text fields", () => {
  it("parses text formats and text-compatible generated editors", () => {
    const schema = parseAppSchema(
      baseSchema({
        entities: {
          task: taskEntityWithMarkdownBody(),
        },
        itemViews: {
          taskListItem: {
            entity: "task",
            fields: {
              title: { editor: "text", commit: "field-commit" },
              body: { editor: "markdown", commit: "field-commit" },
              imageUrl: { editor: "image", commit: "field-commit" },
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
              body: { editor: "markdown" },
              imageUrl: { editor: "image" },
            },
          },
        },
      }),
    );

    expect(schema.entities.task?.fields.body).toEqual({
      type: "text",
      required: false,
      label: "Body",
      format: "markdown",
    });
    expect(schema.itemViews.taskListItem?.fields.body).toEqual({
      editor: "markdown",
      commit: "field-commit",
    });
    expect(schema.itemViews.taskListItem?.fields.imageUrl).toEqual({
      editor: "image",
      commit: "field-commit",
    });
    expect(schema.views.taskCreate).toMatchObject({
      type: "create",
      fields: {
        body: { editor: "markdown" },
        imageUrl: { editor: "image" },
      },
    });
  });

  it("rejects unknown text formats and text editors on non-text fields", () => {
    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: taskEntityWithMarkdownBody({
              body: { type: "text", required: false, format: "html" },
            }),
          },
        }),
      ),
    ).toThrow("text format must be");

    expect(() =>
      parseAppSchema(
        baseSchema({
          itemViews: {
            taskListItem: {
              entity: "task",
              fields: {
                dueDate: { editor: "markdown", commit: "field-commit" },
              },
            },
          },
        }),
      ),
    ).toThrow('editor must match field type "date"');
  });
});

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

describe("schema entity unions", () => {
  it("parses top-level unions and preserves them through stringify", () => {
    const schema = parseAppSchema(
      baseSchema({
        entities: {
          task: taskEntityWithKindEnum(),
        },
        unions: {
          taskByKind: {
            entity: "task",
            discriminator: "kind",
            variants: {
              role: {
                label: "Role",
                fields: ["title", "kind"],
                requiredFields: ["title"],
              },
              stream: {
                label: "Stream",
                fields: ["title", "done"],
              },
            },
          },
        },
      }),
    );

    expect(schema.unions?.taskByKind).toEqual({
      entity: "task",
      discriminator: "kind",
      variants: {
        role: {
          label: "Role",
          fields: ["title", "kind"],
          requiredFields: ["title"],
        },
        stream: {
          label: "Stream",
          fields: ["title", "done"],
        },
      },
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("accepts a fallback for uncovered discriminator values", () => {
    const schema = parseAppSchema(
      baseSchema({
        entities: {
          task: taskEntityWithKindEnum(),
        },
        unions: {
          taskByKind: {
            entity: "task",
            discriminator: "kind",
            variants: {
              role: {
                label: "Role",
                fields: ["title"],
              },
            },
            fallback: {
              label: "Task",
              fields: ["title", "kind"],
            },
          },
        },
      }),
    );

    expect(schema.unions?.taskByKind?.fallback).toEqual({
      label: "Task",
      fields: ["title", "kind"],
    });
  });

  it("parses variant-aware item, edit, and create view presentations", () => {
    const schema = parseAppSchema(
      baseSchema({
        entities: {
          task: taskEntityWithKindEnum(),
        },
        unions: {
          taskByKind: unionForTaskKind(),
        },
        itemViews: {
          taskListItem: {
            entity: "task",
            fields: {
              kind: { editor: "enum", commit: "immediate" },
            },
            union: "taskByKind",
            variants: {
              role: {
                presentation: "fields",
                fields: {
                  title: { editor: "text", commit: "field-commit" },
                },
              },
              stream: {
                presentation: "contextLink",
                labelField: "title",
                target: { kind: "selectContext", context: "task", record: "self" },
              },
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
            union: "taskByKind",
            variants: {
              role: {
                presentation: "fields",
                fields: {
                  title: { editor: "text" },
                },
              },
              stream: {
                presentation: "fields",
                fields: {
                  done: { editor: "boolean" },
                },
              },
            },
          },
          taskEdit: {
            type: "edit",
            entity: "task",
            fields: {
              kind: { editor: "enum", commit: "immediate" },
            },
            union: "taskByKind",
            variants: {
              role: {
                presentation: "fields",
                fields: {
                  title: { editor: "text", commit: "field-commit" },
                },
              },
              stream: {
                presentation: "fields",
                fields: {
                  done: { editor: "boolean", commit: "immediate" },
                },
              },
            },
          },
        },
      }),
    );

    expect(schema.itemViews.taskListItem).toMatchObject({
      entity: "task",
      union: "taskByKind",
      variants: {
        role: {
          presentation: "fields",
          fields: { title: { editor: "text", commit: "field-commit" } },
        },
        stream: {
          presentation: "contextLink",
          labelField: "title",
          target: { kind: "selectContext", context: "task", record: "self" },
        },
      },
    });
    expect(schema.views.taskCreate).toMatchObject({
      type: "create",
      union: "taskByKind",
      variants: {
        stream: {
          presentation: "fields",
          fields: { done: { editor: "boolean" } },
        },
      },
    });
    expect(schema.views.taskEdit).toMatchObject({
      type: "edit",
      union: "taskByKind",
      variants: {
        stream: {
          presentation: "fields",
          fields: { done: { editor: "boolean", commit: "immediate" } },
        },
      },
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("rejects malformed variant-aware view presentations", () => {
    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: taskEntityWithKindEnum(),
            note: noteEntity(),
          },
          unions: {
            taskByKind: unionForTaskKind(),
          },
          itemViews: {
            taskListItem: {
              entity: "note",
              fields: {
                title: { editor: "text", commit: "field-commit" },
              },
              union: "taskByKind",
              variants: {
                role: {
                  presentation: "fields",
                  fields: {
                    title: { editor: "text", commit: "field-commit" },
                  },
                },
                stream: {
                  presentation: "fields",
                  fields: {
                    title: { editor: "text", commit: "field-commit" },
                  },
                },
              },
            },
          },
        }),
      ),
    ).toThrow('Item view "taskListItem" union "taskByKind" must use entity "note"');

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: taskEntityWithKindEnum(),
          },
          unions: {
            taskByKind: unionForTaskKind(),
          },
          itemViews: {
            taskListItem: {
              entity: "task",
              fields: {
                kind: { editor: "enum", commit: "immediate" },
              },
              union: "taskByKind",
              variants: {
                role: {
                  presentation: "fields",
                  fields: {
                    title: { editor: "text", commit: "field-commit" },
                  },
                },
              },
            },
          },
        }),
      ),
    ).toThrow('union "taskByKind" must define variant presentations for "stream" or a fallback');

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: taskEntityWithKindEnum(),
          },
          unions: {
            taskByKind: {
              ...unionForTaskKind(),
              variants: {
                role: {
                  label: "Role",
                  fields: ["title"],
                },
              },
              fallback: {
                label: "Task",
                fields: ["title", "kind"],
              },
            },
          },
          views: {
            ...defaultViews(),
            taskCreate: {
              type: "create",
              entity: "task",
              fields: {
                title: { editor: "text" },
                kind: { editor: "enum" },
              },
              union: "taskByKind",
              variants: {
                role: {
                  presentation: "contextLink",
                  labelField: "title",
                  target: { kind: "selectContext", context: "task", record: "self" },
                },
              },
              fallback: {
                presentation: "fields",
                fields: {
                  title: { editor: "text" },
                },
              },
            },
          },
        }),
      ),
    ).toThrow('View "taskCreate" variant "role" presentation must be "fields"');
  });

  it("rejects malformed union registries and discriminator references", () => {
    expect(() => parseAppSchema(baseSchema({ unions: [] }))).toThrow(
      "Schema unions must be an object",
    );

    expect(() =>
      parseAppSchema(
        baseSchema({
          unions: {
            "": unionForTaskKind(),
          },
        }),
      ),
    ).toThrow("Union names must be non-empty");

    expect(() =>
      parseAppSchema(
        baseSchema({
          unions: {
            taskByKind: {
              ...unionForTaskKind(),
              entity: "missing",
            },
          },
        }),
      ),
    ).toThrow('Union "taskByKind" references unknown entity "missing"');

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: taskEntityWithKindEnum(),
          },
          unions: {
            taskByKind: {
              ...unionForTaskKind(),
              discriminator: "missing",
            },
          },
        }),
      ),
    ).toThrow('discriminator references unknown field "task.missing"');

    expect(() =>
      parseAppSchema(
        baseSchema({
          unions: {
            taskByKind: {
              ...unionForTaskKind(),
              discriminator: "title",
            },
          },
        }),
      ),
    ).toThrow('discriminator field "task.title" must be an enum field');

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: taskEntityWithKindEnum({
              required: false,
            }),
          },
          unions: {
            taskByKind: unionForTaskKind(),
          },
        }),
      ),
    ).toThrow('discriminator field "task.kind" must be required');
  });

  it("rejects bad union variants, fields, and missing fallback coverage", () => {
    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: taskEntityWithKindEnum(),
          },
          unions: {
            taskByKind: {
              ...unionForTaskKind(),
              variants: {
                role: { label: "Role", fields: ["title"] },
                missing: { label: "Missing", fields: ["title"] },
              },
            },
          },
        }),
      ),
    ).toThrow('variant "missing" must match a discriminator enum value');

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: taskEntityWithKindEnum(),
          },
          unions: {
            taskByKind: {
              ...unionForTaskKind(),
              variants: {
                role: { label: "Role", fields: ["missing"] },
                stream: { label: "Stream", fields: ["title"] },
              },
            },
          },
        }),
      ),
    ).toThrow('references unknown field "task.missing"');

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: taskEntityWithKindEnum(),
          },
          unions: {
            taskByKind: {
              ...unionForTaskKind(),
              variants: {
                role: {
                  label: "Role",
                  fields: ["title"],
                  requiredFields: ["missing"],
                },
                stream: { label: "Stream", fields: ["title"] },
              },
            },
          },
        }),
      ),
    ).toThrow('references unknown field "task.missing"');

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: taskEntityWithKindEnum(),
          },
          unions: {
            taskByKind: {
              ...unionForTaskKind(),
              variants: {
                role: { label: "Role", fields: ["title"] },
              },
            },
          },
        }),
      ),
    ).toThrow('must define variants for discriminator values "stream" or a fallback');
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

  it("accepts literal defaults for omitted scalar fields and preserves them through stringify", () => {
    const schema = parseAppSchema(
      baseSchema({
        entities: {
          task: {
            ...taskEntityWithEstimateNumber(),
            fields: {
              ...taskEntityWithEstimateNumber().fields,
              kind: {
                type: "enum",
                required: true,
                values: {
                  role: { label: "Role" },
                  stream: { label: "Stream" },
                },
              },
            },
          },
        },
        views: {
          ...defaultViews(),
          taskCreate: {
            type: "create",
            entity: "task",
            fields: {
              dueDate: { editor: "date" },
            },
            defaults: {
              title: { kind: "literal", value: "Untitled" },
              done: { kind: "literal", value: true },
              estimate: { kind: "literal", value: 3 },
              kind: { kind: "literal", value: "stream" },
            },
          },
        },
      }),
    );

    expect(schema.views.taskCreate).toMatchObject({
      type: "create",
      fields: {
        dueDate: { editor: "date" },
      },
      defaults: {
        title: { kind: "literal", value: "Untitled" },
        done: { kind: "literal", value: true },
        estimate: { kind: "literal", value: 3 },
        kind: { kind: "literal", value: "stream" },
      },
    });
    expect(JSON.parse(stringifySchema(schema)).views.taskCreate.defaults).toEqual({
      title: { kind: "literal", value: "Untitled" },
      done: { kind: "literal", value: true },
      estimate: { kind: "literal", value: 3 },
      kind: { kind: "literal", value: "stream" },
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
      parseAppSchema(schemaWithRateCreateDefault({ kind: "literal", value: "card" })),
    ).toThrow('default "card" requires a scalar field');
  });

  it("rejects malformed literal create defaults", () => {
    expect(() =>
      parseAppSchema(
        baseSchema({
          views: {
            ...defaultViews(),
            taskCreate: {
              ...defaultViews().taskCreate,
              defaults: {
                done: { kind: "literal" },
              },
            },
          },
        }),
      ),
    ).toThrow('default "done" must include "value"');

    expect(() =>
      parseAppSchema(
        baseSchema({
          views: {
            ...defaultViews(),
            taskCreate: {
              ...defaultViews().taskCreate,
              fields: {
                title: { editor: "text" },
              },
              defaults: {
                dueDate: { kind: "literal", value: "May 12, 2026" },
              },
            },
          },
        }),
      ),
    ).toThrow('default "dueDate" literal value must be a YYYY-MM-DD date');

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: taskEntityWithEstimateNumber({ integer: true }),
          },
          views: {
            ...defaultViews(),
            taskCreate: {
              type: "create",
              entity: "task",
              fields: {
                title: { editor: "text" },
              },
              defaults: {
                estimate: { kind: "literal", value: 1.5 },
              },
            },
          },
        }),
      ),
    ).toThrow('default "estimate" literal value must be an integer');

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: taskEntityWithKindEnum(),
          },
          views: {
            ...defaultViews(),
            taskCreate: {
              type: "create",
              entity: "task",
              fields: {
                title: { editor: "text" },
              },
              defaults: {
                kind: { kind: "literal", value: "missing" },
              },
            },
          },
        }),
      ),
    ).toThrow('default "kind" literal value must be a known enum value');
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
          width: "lg",
          display: "readOnly",
          referenceItemView: "resourceListItem",
        },
        {
          type: "field",
          field: "cost",
          editor: "number",
          commit: "field-commit",
          align: "end",
          width: "sm",
          suffix: "/ day",
          format: "number",
          valueUnit: { unitField: "costUnit" },
        },
        {
          type: "field",
          field: "costUnit",
          editor: "enum",
          commit: "immediate",
          width: "xs",
          display: "hidden",
        },
        {
          type: "field",
          field: "price",
          editor: "number",
          commit: "field-commit",
          align: "end",
          width: "sm",
          suffix: "/ day",
          format: "number",
          valueUnit: { unitField: "currency" },
        },
        {
          type: "field",
          field: "currency",
          editor: "enum",
          commit: "immediate",
          width: "xs",
          display: "hidden",
        },
      ],
    });
    expect(schema.views.rateHome).toMatchObject({
      type: "collection",
      result: { type: "table", tableView: "rateTable" },
    });
  });

  it("parses table-local actions and invokeAction columns", () => {
    const schema = parseAppSchema(
      scopedRateSchema({
        tableViews: {
          rateTable: {
            ...scopedRateTableViews().rateTable,
            actions: {
              inspectRate: { label: "Inspect rate" },
              disableRate: {
                label: "Disable rate",
                variant: "destructive",
                availability: { state: "disabled", reason: "Unavailable in this slice" },
              },
            },
            columns: [
              ...scopedRateTableViews().rateTable.columns,
              {
                type: "invokeAction",
                action: "inspectRate",
                width: "xs",
                align: "end",
              },
              {
                type: "invokeAction",
                actions: ["inspectRate", "disableRate"],
                presentation: "dropdown",
              },
            ],
          },
        },
      }),
    );

    expect(schema.tableViews.rateTable?.actions).toEqual({
      inspectRate: { label: "Inspect rate" },
      disableRate: {
        label: "Disable rate",
        variant: "destructive",
        availability: { state: "disabled", reason: "Unavailable in this slice" },
      },
    });
    expect(schema.tableViews.rateTable?.columns.at(-2)).toEqual({
      type: "invokeAction",
      action: "inspectRate",
      width: "xs",
      align: "end",
    });
    expect(schema.tableViews.rateTable?.columns.at(-1)).toEqual({
      type: "invokeAction",
      actions: ["inspectRate", "disableRate"],
      presentation: "dropdown",
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("validates table invokeAction references", () => {
    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              columns: [{ type: "invokeAction", action: "inspectRate" }],
            },
          },
        }),
      ),
    ).toThrow('references unknown table action "inspectRate"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              actions: { inspectRate: { label: "Inspect rate" } },
              columns: [{ type: "invokeAction", actions: [] }],
            },
          },
        }),
      ),
    ).toThrow("must reference at least one table action");

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              actions: { inspectRate: { label: "Inspect rate" } },
              columns: [
                {
                  type: "invokeAction",
                  action: "inspectRate",
                  actions: ["inspectRate"],
                },
              ],
            },
          },
        }),
      ),
    ).toThrow("must use either action or actions, not both");
  });

  it("parses edit views and editRecord table actions", () => {
    const schema = parseAppSchema(
      scopedRateSchema({
        tableViews: {
          rateTable: {
            ...scopedRateTableViews().rateTable,
            actions: {
              editRate: {
                type: "editRecord",
                label: "Edit rate",
                target: { kind: "row" },
                editView: "rateEdit",
              },
              editResource: {
                type: "editRecord",
                label: "Edit resource",
                target: { kind: "reference", field: "resource" },
                editView: "resourceEdit",
              },
            },
            columns: [
              ...scopedRateTableViews().rateTable.columns,
              { type: "invokeAction", actions: ["editRate", "editResource"] },
            ],
          },
        },
        views: {
          ...scopedRateViews({ result: { type: "table", tableView: "rateTable" } }),
          rateEdit: {
            type: "edit",
            entity: "rate",
            fields: {
              cost: { editor: "number", commit: "field-commit" },
              resource: { editor: "reference", commit: "immediate" },
            },
          },
          resourceEdit: {
            type: "edit",
            entity: "resource",
            fields: {
              name: { editor: "text", commit: "field-commit" },
              kind: { editor: "enum", commit: "immediate" },
            },
          },
        },
      }),
    );

    expect(schema.views.rateEdit).toEqual({
      type: "edit",
      entity: "rate",
      fields: {
        cost: { editor: "number", commit: "field-commit" },
        resource: { editor: "reference", commit: "immediate" },
      },
    });
    expect(schema.tableViews.rateTable?.actions?.editResource).toEqual({
      type: "editRecord",
      label: "Edit resource",
      target: { kind: "reference", field: "resource" },
      editView: "resourceEdit",
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("parses table ordering and ordering action columns", () => {
    const schema = parseAppSchema(
      scopedRateSchema({
        entities: scopedRateEntitiesWithSortOrder(),
        tableViews: {
          rateTable: {
            ...scopedRateTableViews().rateTable,
            ordering: {
              field: "sortOrder",
              scope: [{ kind: "field", field: "card" }],
              presentations: ["dragHandle", "moveMenu"],
            },
            columns: [
              { type: "orderingHandle", width: "xs" },
              ...scopedRateTableViews().rateTable.columns,
              { type: "invokeAction", includeOrdering: true },
            ],
          },
        },
        views: scopedRateViews({
          result: { type: "table", tableView: "rateTable" },
        }),
      }),
    );

    expect(schema.tableViews.rateTable?.ordering).toEqual({
      field: "sortOrder",
      scope: [{ kind: "field", field: "card" }],
      presentations: ["dragHandle", "moveMenu"],
    });
    expect(schema.tableViews.rateTable?.columns[0]).toEqual({
      type: "orderingHandle",
      width: "xs",
    });
    expect(schema.tableViews.rateTable?.columns.at(-1)).toEqual({
      type: "invokeAction",
      actions: [],
      includeOrdering: true,
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("parses collection result ordering for list, table, and tree results", () => {
    const ordering = {
      field: "sortOrder",
      scope: [{ kind: "field", field: "card" }],
      presentations: ["dragHandle"],
    };
    const listSchema = parseAppSchema(
      scopedRateSchema({
        entities: scopedRateEntitiesWithSortOrder(),
        views: scopedRateViews({
          result: { type: "list", itemView: "rateListItem", ordering },
        }),
      }),
    );
    const tableSchema = parseAppSchema(
      scopedRateSchema({
        entities: scopedRateEntitiesWithSortOrder(),
        views: scopedRateViews({
          result: { type: "table", tableView: "rateTable", ordering },
        }),
      }),
    );
    const siteSchema = sourceLikeSiteSchema();
    const siteHome = siteSchema.views.siteCompositionHome;

    if (siteHome?.type !== "collection" || siteHome.result.type !== "tree") {
      throw new Error("Missing site tree fixture.");
    }

    siteHome.result = {
      ...siteHome.result,
      ordering: {
        field: "order",
        scope: [{ kind: "field", field: "parent" }],
        presentations: ["moveMenu"],
      },
    };

    const treeSchema = parseAppSchema(siteSchema);

    expect(listSchema.views.rateHome).toMatchObject({
      type: "collection",
      result: { type: "list", ordering },
    });
    expect(tableSchema.views.rateHome).toMatchObject({
      type: "collection",
      result: { type: "table", ordering },
    });
    expect(treeSchema.views.siteCompositionHome).toMatchObject({
      type: "collection",
      result: {
        type: "tree",
        ordering: {
          field: "order",
          scope: [{ kind: "field", field: "parent" }],
          presentations: ["moveMenu"],
        },
      },
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(tableSchema)))).toEqual(tableSchema);
  });

  it("parses tree branch policy and preserves it through stringify", () => {
    const siteSchema = siteSchemaWithTreeBranches({
      variants: {
        page: {
          children: [
            "group",
            "markdown",
            {
              variant: "image",
              label: "Primary image",
              placementValues: { slot: "primaryImage" },
            },
          ],
        },
        header: {
          action: "leaf",
          children: ["link"],
        },
        footer: "leaf",
      },
    });
    const schema = parseAppSchema(siteSchema);
    const siteHome = schema.views.siteCompositionHome;
    const unchangedSchema = parseAppSchema(siteSchemaWithoutTreeBranches());
    const unchangedSiteHome = unchangedSchema.views.siteCompositionHome;

    if (siteHome?.type !== "collection" || siteHome.result.type !== "tree") {
      throw new Error("Missing site tree fixture.");
    }

    if (unchangedSiteHome?.type !== "collection" || unchangedSiteHome.result.type !== "tree") {
      throw new Error("Missing unchanged site tree fixture.");
    }

    expect(siteHome.result.branches).toEqual({
      variants: {
        page: {
          children: [
            "group",
            "markdown",
            {
              variant: "image",
              label: "Primary image",
              placementValues: { slot: "primaryImage" },
            },
          ],
        },
        header: {
          action: "leaf",
          children: ["link"],
        },
        footer: "leaf",
      },
    });
    expect(unchangedSiteHome.result).not.toHaveProperty("branches");
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("rejects malformed tree branch policies", () => {
    const schemaWithoutUnion = siteSchemaWithTreeBranches({
      variants: {
        header: "leaf",
      },
    });

    schemaWithoutUnion.itemViews.blockTreeNode = {
      entity: "block",
      fields: {
        label: { editor: "text", commit: "field-commit" },
      },
    };

    expect(() => parseAppSchema(schemaWithoutUnion)).toThrow(
      'Collection view "siteCompositionHome" result branches requires child item view "blockTreeNode" to define a union.',
    );
    expect(() =>
      parseAppSchema(
        siteSchemaWithTreeBranches({
          variants: {
            missing: "leaf",
          },
        }),
      ),
    ).toThrow(
      'Collection view "siteCompositionHome" result branches variants variant "missing" must match a variant in union "block.type".',
    );
    expect(() =>
      parseAppSchema(
        siteSchemaWithTreeBranches({
          variants: {
            header: "collapse",
          },
        }),
      ),
    ).toThrow(
      'Collection view "siteCompositionHome" result branches variants variant "header" action must be "leaf" or an object.',
    );
    expect(() =>
      parseAppSchema(
        siteSchemaWithTreeBranches({
          variants: {
            header: {
              action: "collapse",
            },
          },
        }),
      ),
    ).toThrow(
      'Collection view "siteCompositionHome" result branches variants variant "header" action must be "leaf".',
    );
    expect(() =>
      parseAppSchema(
        siteSchemaWithTreeBranches({
          variants: {
            header: {
              children: ["missing"],
            },
          },
        }),
      ),
    ).toThrow(
      'Collection view "siteCompositionHome" result branches variants variant "header" children variant "missing" must match a variant in union "block.type".',
    );
    expect(() =>
      parseAppSchema(
        siteSchemaWithTreeBranches({
          variants: {
            header: {
              children: [
                {
                  variant: "link",
                  placementValues: { parent: "block-1" },
                },
              ],
            },
          },
        }),
      ),
    ).toThrow(
      'Collection view "siteCompositionHome" result branches variants variant "header" children item 1 placementValues field "parent" is controlled by tree creation.',
    );
  });

  it("validates editRecord targets and edit view references", () => {
    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              actions: {
                editResource: {
                  type: "editRecord",
                  label: "Edit resource",
                  target: { kind: "reference", field: "missing" },
                  editView: "resourceEdit",
                },
              },
              columns: [{ type: "invokeAction", action: "editResource" }],
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
              actions: {
                editResource: {
                  type: "editRecord",
                  label: "Edit resource",
                  target: { kind: "reference", field: "cost" },
                  editView: "resourceEdit",
                },
              },
              columns: [{ type: "invokeAction", action: "editResource" }],
            },
          },
        }),
      ),
    ).toThrow('field "rate.cost" must be a reference field');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              actions: {
                editRate: {
                  type: "editRecord",
                  label: "Edit rate",
                  target: { kind: "row" },
                  editView: "missingEdit",
                },
              },
              columns: [{ type: "invokeAction", action: "editRate" }],
            },
          },
        }),
      ),
    ).toThrow('references unknown edit view "missingEdit"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              actions: {
                editResource: {
                  type: "editRecord",
                  label: "Edit resource",
                  target: { kind: "reference", field: "resource" },
                  editView: "rateEdit",
                },
              },
              columns: [{ type: "invokeAction", action: "editResource" }],
            },
          },
          views: {
            ...scopedRateViews({ result: { type: "table", tableView: "rateTable" } }),
            rateEdit: {
              type: "edit",
              entity: "rate",
              fields: {
                cost: { editor: "number", commit: "field-commit" },
              },
            },
          },
        }),
      ),
    ).toThrow('edit view "rateEdit" must use entity "resource"');
  });

  it("validates edit view fields", () => {
    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          views: {
            ...scopedRateViews(),
            resourceEdit: {
              type: "edit",
              entity: "resource",
              fields: {
                name: { editor: "text" },
              },
            },
          },
        }),
      ),
    ).toThrow('has unsupported commit policy "undefined"');
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

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              columns: [{ type: "field", field: "cost", width: "massive" }],
            },
          },
        }),
      ),
    ).toThrow('width must be "xs", "sm", "md", or "lg"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              columns: [{ type: "field", field: "cost", display: "readonly" }],
            },
          },
        }),
      ),
    ).toThrow('display must be "editor", "readOnly", or "hidden"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              columns: [{ type: "field", field: "cost", suffix: "" }],
            },
          },
        }),
      ),
    ).toThrow("suffix must be a non-empty string");

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              columns: [{ type: "field", field: "cost", format: "money" }],
            },
          },
        }),
      ),
    ).toThrow('format must be "plain", "number", "currency", or "percent"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              columns: [{ type: "field", field: "cost", referenceItemView: "resourceListItem" }],
            },
          },
        }),
      ),
    ).toThrow("referenceItemView requires a reference field");

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              columns: [{ type: "field", field: "resource", referenceItemView: "missing" }],
            },
          },
        }),
      ),
    ).toThrow('referenceItemView references unknown item view "missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              columns: [{ type: "field", field: "resource", referenceItemView: "rateListItem" }],
            },
          },
        }),
      ),
    ).toThrow('referenceItemView "rateListItem" must use entity "resource"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              columns: [{ type: "field", field: "resource", valueUnit: { unitField: "costUnit" } }],
            },
          },
        }),
      ),
    ).toThrow("valueUnit requires a number field");

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              columns: [{ type: "field", field: "cost", valueUnit: { unitField: "missing" } }],
            },
          },
        }),
      ),
    ).toThrow('valueUnit references unknown unitField "rate.missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              columns: [{ type: "field", field: "cost", valueUnit: { unitField: "resource" } }],
            },
          },
        }),
      ),
    ).toThrow('valueUnit unitField "rate.resource" must be an enum field');
  });

  it("validates table ordering fields and action inclusion", () => {
    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              ordering: { field: "missing" },
            },
          },
        }),
      ),
    ).toThrow('ordering references unknown field "rate.missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              ordering: { field: "resource" },
            },
          },
        }),
      ),
    ).toThrow('ordering field "rate.resource" must be a number field');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          entities: scopedRateEntitiesWithSortOrder({ integer: true }),
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              ordering: { field: "sortOrder" },
            },
          },
        }),
      ),
    ).toThrow('ordering field "rate.sortOrder" must not be integer');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          entities: scopedRateEntitiesWithSortOrder(),
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              ordering: {
                field: "sortOrder",
                scope: [{ kind: "field", field: "missing" }],
              },
            },
          },
        }),
      ),
    ).toThrow('ordering scope 0 references unknown field "rate.missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              columns: [{ type: "invokeAction", includeOrdering: true }],
            },
          },
        }),
      ),
    ).toThrow("includeOrdering requires table ordering");

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              columns: [{ type: "orderingHandle" }],
            },
          },
        }),
      ),
    ).toThrow("orderingHandle requires table ordering");

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          entities: scopedRateEntitiesWithSortOrder(),
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              ordering: { field: "sortOrder", presentations: ["moveMenu"] },
              columns: [{ type: "orderingHandle" }],
            },
          },
        }),
      ),
    ).toThrow("orderingHandle requires dragHandle ordering presentation");
  });

  it("validates collection result ordering fields and table ordering conflicts", () => {
    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          views: scopedRateViews({
            result: { type: "list", itemView: "rateListItem", ordering: { field: "missing" } },
          }),
        }),
      ),
    ).toThrow('result ordering references unknown field "rate.missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          entities: scopedRateEntitiesWithSortOrder(),
          tableViews: {
            rateTable: {
              ...scopedRateTableViews().rateTable,
              ordering: {
                field: "sortOrder",
                scope: [{ kind: "field", field: "card" }],
              },
            },
          },
          views: scopedRateViews({
            result: {
              type: "table",
              tableView: "rateTable",
              ordering: {
                field: "sortOrder",
                scope: [{ kind: "field", field: "resource" }],
              },
            },
          }),
        }),
      ),
    ).toThrow('result ordering conflicts with table view "rateTable" ordering');
  });

  it("parses and validates computed table columns", () => {
    const schema = parseAppSchema(
      scopedRateSchema({
        readModels: scopedRateReadModels(),
        tableViews: {
          rateTable: {
            entity: "rate",
            columns: [
              {
                type: "computed",
                computedValue: "rateMargin",
                label: "Margin",
                align: "end",
                width: "sm",
                display: "readOnly",
                suffix: "margin",
                format: "percent",
              },
            ],
          },
        },
        views: scopedRateViews({
          result: { type: "table", tableView: "rateTable" },
        }),
      }),
    );

    expect(schema.tableViews.rateTable?.columns[0]).toEqual({
      type: "computed",
      computedValue: "rateMargin",
      label: "Margin",
      align: "end",
      width: "sm",
      display: "readOnly",
      suffix: "margin",
      format: "percent",
    });

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              entity: "rate",
              columns: [{ type: "computed", computedValue: "missing" }],
            },
          },
        }),
      ),
    ).toThrow('references unknown computed value "missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          readModels: scopedRateReadModels(),
          tableViews: {
            rateTable: {
              entity: "rate",
              columns: [{ type: "computed", computedValue: "rateMargin", display: "editor" }],
            },
          },
        }),
      ),
    ).toThrow("computed columns must be read-only or hidden");

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          readModels: {
            computedValues: {
              cardMargin: {
                entity: "card",
                type: "number",
                expression: { kind: "field", field: "marginMin" },
              },
            },
          },
          tableViews: {
            rateTable: {
              entity: "rate",
              columns: [{ type: "computed", computedValue: "cardMargin" }],
            },
          },
        }),
      ),
    ).toThrow('computed value "cardMargin" must use entity "rate"');
  });

  it("parses and validates collection aggregate summary slots", () => {
    const schema = parseAppSchema(
      scopedRateSchema({
        readModels: scopedRateReadModels(),
        views: scopedRateViews({
          summary: [
            {
              type: "aggregate",
              aggregate: "selectedCardCostTotal",
              label: "Cost total",
              suffix: "/ day",
              format: "currency",
            },
            {
              type: "aggregate",
              aggregate: "selectedCardAverageMargin",
              label: "Average margin",
              format: "percent",
            },
          ],
        }),
      }),
    );

    expect(schema.views.rateHome).toMatchObject({
      type: "collection",
      summary: [
        {
          type: "aggregate",
          aggregate: "selectedCardCostTotal",
          label: "Cost total",
          suffix: "/ day",
          format: "currency",
        },
        {
          type: "aggregate",
          aggregate: "selectedCardAverageMargin",
          label: "Average margin",
          format: "percent",
        },
      ],
    });

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          views: scopedRateViews({
            summary: [{ type: "aggregate", aggregate: "missing" }],
          }),
        }),
      ),
    ).toThrow('references unknown aggregate "missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          readModels: {
            aggregates: {
              cardCount: {
                query: "cardAll",
                function: "count",
              },
            },
          },
          views: scopedRateViews({
            summary: [{ type: "aggregate", aggregate: "cardCount" }],
          }),
        }),
      ),
    ).toThrow('aggregate "cardCount" query "cardAll" must be one of its query slots');
  });

  it("parses and validates collection table footer aggregate slots", () => {
    const schema = parseAppSchema(
      scopedRateSchema({
        readModels: scopedRateReadModels(),
        views: scopedRateViews({
          result: {
            type: "table",
            tableView: "rateTable",
            footer: [
              {
                type: "aggregate",
                column: "cost",
                aggregate: "selectedCardCostTotal",
                label: "Average cost",
                suffix: "/ day",
                format: "currency",
              },
              {
                type: "aggregate",
                column: "rateMargin",
                aggregate: "selectedCardAverageMargin",
                label: "Average margin",
                format: "percent",
              },
            ],
          },
        }),
        tableViews: {
          rateTable: {
            ...scopedRateTableViews().rateTable,
            columns: [
              ...scopedRateTableViews().rateTable.columns,
              {
                type: "computed",
                computedValue: "rateMargin",
                label: "Margin",
                align: "end",
                width: "sm",
                format: "percent",
              },
            ],
          },
        },
      }),
    );

    expect(schema.views.rateHome).toMatchObject({
      type: "collection",
      result: {
        type: "table",
        tableView: "rateTable",
        footer: [
          {
            type: "aggregate",
            column: "cost",
            aggregate: "selectedCardCostTotal",
            label: "Average cost",
            suffix: "/ day",
            format: "currency",
          },
          {
            type: "aggregate",
            column: "rateMargin",
            aggregate: "selectedCardAverageMargin",
            label: "Average margin",
            format: "percent",
          },
        ],
      },
    });

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          readModels: scopedRateReadModels(),
          views: scopedRateViews({
            result: {
              type: "table",
              tableView: "rateTable",
              footer: [
                { type: "aggregate", column: "missing", aggregate: "selectedCardCostTotal" },
              ],
            },
          }),
        }),
      ),
    ).toThrow('references unknown visible table column "missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          readModels: scopedRateReadModels(),
          views: scopedRateViews({
            result: {
              type: "table",
              tableView: "rateTable",
              footer: [
                { type: "aggregate", column: "currency", aggregate: "selectedCardCostTotal" },
              ],
            },
          }),
        }),
      ),
    ).toThrow('references unknown visible table column "currency"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          readModels: scopedRateReadModels(),
          views: scopedRateViews({
            result: {
              type: "table",
              tableView: "rateTable",
              footer: [
                { type: "aggregate", column: "cost", aggregate: "selectedCardCostTotal" },
                { type: "aggregate", column: "cost", aggregate: "selectedCardAverageMargin" },
              ],
            },
          }),
        }),
      ),
    ).toThrow('result footer column "cost" must be unique');
  });

  it("parses and validates referenced-record field columns", () => {
    const schema = parseAppSchema(
      scopedRateSchema({
        tableViews: {
          rateTable: {
            entity: "rate",
            columns: [
              {
                type: "referenceField",
                referenceField: "resource",
                field: "name",
                label: "Role",
                editor: "text",
                commit: "field-commit",
                width: "lg",
              },
            ],
          },
        },
        views: scopedRateViews({
          result: { type: "table", tableView: "rateTable" },
        }),
      }),
    );

    expect(schema.tableViews.rateTable?.columns[0]).toEqual({
      type: "referenceField",
      referenceField: "resource",
      field: "name",
      label: "Role",
      editor: "text",
      commit: "field-commit",
      width: "lg",
    });

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              entity: "rate",
              columns: [{ type: "referenceField", referenceField: "missing", field: "name" }],
            },
          },
        }),
      ),
    ).toThrow('references unknown referenceField "rate.missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              entity: "rate",
              columns: [{ type: "referenceField", referenceField: "cost", field: "name" }],
            },
          },
        }),
      ),
    ).toThrow('referenceField "rate.cost" must be a reference field');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              entity: "rate",
              columns: [{ type: "referenceField", referenceField: "resource", field: "missing" }],
            },
          },
        }),
      ),
    ).toThrow('references unknown field "resource.missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              entity: "rate",
              columns: [
                {
                  type: "referenceField",
                  referenceField: "resource",
                  field: "name",
                  editor: "number",
                },
              ],
            },
          },
        }),
      ),
    ).toThrow('editor must match field type "text"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              entity: "rate",
              columns: [
                {
                  type: "referenceField",
                  referenceField: "resource",
                  field: "name",
                  commit: "immediate",
                },
              ],
            },
          },
        }),
      ),
    ).toThrow("text fields must use field-commit");

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          tableViews: {
            rateTable: {
              entity: "rate",
              columns: [
                {
                  type: "referenceField",
                  referenceField: "resource",
                  field: "name",
                  referenceItemView: "resourceListItem",
                },
              ],
            },
          },
        }),
      ),
    ).toThrow('has unsupported key "referenceItemView"');
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

  it("parses collection primary navigation hints", () => {
    const schema = parseAppSchema(
      baseSchema({
        views: {
          ...defaultViews(),
          taskHome: {
            ...defaultCollectionView(),
            navigation: { primary: true },
          },
        },
      }),
    );

    expect(schema.views.taskHome).toMatchObject({
      type: "collection",
      navigation: { primary: true },
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

  it("allows collection create actions for other entities and validates entity action slots", () => {
    const schema = parseAppSchema(
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
    );

    expect(schema.views.taskHome).toMatchObject({
      type: "collection",
      actions: [{ type: "create", createView: "noteCreate" }],
    });

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

  it("validates collection primary navigation hints", () => {
    expect(() =>
      parseAppSchema(
        baseSchema({
          views: {
            ...defaultViews(),
            taskHome: {
              ...defaultCollectionView(),
              navigation: "hidden",
            },
          },
        }),
      ),
    ).toThrow('Collection view "taskHome" navigation must be an object.');

    expect(() =>
      parseAppSchema(
        baseSchema({
          views: {
            ...defaultViews(),
            taskHome: {
              ...defaultCollectionView(),
              navigation: { primary: "no" },
            },
          },
        }),
      ),
    ).toThrow('Collection view "taskHome" navigation primary must be a boolean.');

    expect(() =>
      parseAppSchema(
        baseSchema({
          views: {
            ...defaultViews(),
            taskHome: {
              ...defaultCollectionView(),
              navigation: { primary: false },
            },
          },
        }),
      ),
    ).not.toThrow();
  });

  it("requires screens and parses screen definitions", () => {
    const schemaWithoutScreens: Record<string, unknown> = { ...baseSchema() };
    delete schemaWithoutScreens.screens;

    expect(() => parseAppSchema(schemaWithoutScreens)).toThrow('Schema must include "screens".');

    const schema = parseAppSchema(
      baseSchema({
        views: {
          ...defaultViews(),
          taskHome: {
            ...defaultCollectionView(),
            navigation: { primary: false },
          },
        },
        screens: defaultScreens({
          layout: {
            type: "stack",
            sections: [{ id: "tasks", type: "collection", view: "taskHome", label: "Task list" }],
          },
        }),
      }),
    );

    expect(schema.screens?.taskHome).toEqual({
      type: "workspace",
      label: "Tasks",
      navigation: { primary: true },
      layout: {
        type: "stack",
        sections: [
          {
            id: "tasks",
            type: "collection",
            view: "taskHome",
            label: "Task list",
          },
        ],
      },
    });
    expect(JSON.parse(stringifySchema(schema)).screens).toEqual(schema.screens);
  });

  it("parses static app-relative screen paths", () => {
    const rootSchema = parseAppSchema(
      baseSchema({
        screens: defaultScreens({ path: "/" }),
      }),
    );
    const setupSchema = parseAppSchema(
      baseSchema({
        screens: defaultScreens({ path: "/setup" }),
      }),
    );

    expect(rootSchema.screens?.taskHome?.path).toBe("/");
    expect(setupSchema.screens?.taskHome?.path).toBe("/setup");
  });

  it("rejects duplicate screen paths", () => {
    expect(() =>
      parseAppSchema(
        baseSchema({
          screens: {
            taskHome: defaultScreen({ path: "/" }),
            taskSetup: defaultScreen({ label: "Setup", path: "/" }),
          },
        }),
      ),
    ).toThrow('Screen path "/" must be unique. Used by "taskHome" and "taskSetup".');
  });

  it("rejects non-static screen paths and schema editor path collisions", () => {
    for (const path of ["", "setup", "/tasks/:taskId", "/*", "/tasks/*"]) {
      expect(() =>
        parseAppSchema(
          baseSchema({
            screens: defaultScreens({ path }),
          }),
        ),
      ).toThrow('Screen "taskHome" path must be a static app-relative path.');
    }

    expect(() =>
      parseAppSchema(
        baseSchema({
          screens: defaultScreens({ path: "/schema" }),
        }),
      ),
    ).toThrow('Screen "taskHome" path must not collide with schema editor path "/schema".');
  });

  it("rejects malformed screen layouts and duplicate section ids", () => {
    expect(() =>
      parseAppSchema(
        baseSchema({
          screens: defaultScreens({
            layout: {
              type: "grid",
              sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
            },
          }),
        }),
      ),
    ).toThrow('Screen "taskHome" layout type must be "stack".');

    expect(() =>
      parseAppSchema(
        baseSchema({
          screens: defaultScreens({
            layout: {
              type: "stack",
              sections: [
                { id: "tasks", type: "collection", view: "taskHome" },
                { id: "tasks", type: "collection", view: "taskHome", label: "More tasks" },
              ],
            },
          }),
        }),
      ),
    ).toThrow('Screen "taskHome" layout section id "tasks" must be unique.');
  });

  it("validates screen collection view references", () => {
    expect(() =>
      parseAppSchema(
        baseSchema({
          screens: defaultScreens({
            layout: {
              type: "stack",
              sections: [{ id: "tasks", type: "collection", view: "missing" }],
            },
          }),
        }),
      ),
    ).toThrow('Screen "taskHome" layout section 0 references unknown view "missing".');

    expect(() =>
      parseAppSchema(
        baseSchema({
          screens: defaultScreens({
            layout: {
              type: "stack",
              sections: [{ id: "tasks", type: "collection", view: "taskCreate" }],
            },
          }),
        }),
      ),
    ).toThrow('Screen "taskHome" layout section 0 must reference a collection view.');
  });

  it("requires a primary screen when screens exist", () => {
    expect(() =>
      parseAppSchema(
        baseSchema({
          screens: defaultScreens({
            navigation: { primary: false },
          }),
        }),
      ),
    ).toThrow("Schema must define at least one primary screen.");
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
        presentation: "tabs",
        createView: "cardCreate",
        itemView: "cardListItem",
      },
      queries: [{ query: "ratesForSelectedCard", count: { type: "count" } }],
      defaultQuery: "ratesForSelectedCard",
    });
  });

  it("parses and stringifies collection context presentation hints", () => {
    const schema = parseAppSchema(
      scopedRateSchema({
        views: scopedRateViews({
          context: {
            ...scopedRateViews().rateHome.context,
            presentation: "listDetail",
          },
        }),
      }),
    );

    expect(schema.views.rateHome).toMatchObject({
      type: "collection",
      context: {
        presentation: "listDetail",
      },
    });
    expect(JSON.parse(stringifySchema(schema)).views.rateHome.context.presentation).toBe(
      "listDetail",
    );
  });

  it("rejects invalid collection context presentation hints", () => {
    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          views: scopedRateViews({
            context: {
              ...scopedRateViews().rateHome.context,
              presentation: "cards",
            },
          }),
        }),
      ),
    ).toThrow('context presentation must be "tabs" or "listDetail"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          views: scopedRateViews({
            context: undefined,
            presentation: "listDetail",
          }),
        }),
      ),
    ).toThrow('Collection view "rateHome" has unsupported key "presentation"');
  });

  it("accepts relationship-backed collection contexts", () => {
    const schema = parseAppSchema(
      rateRelationshipSchema({
        views: scopedRateViews({
          context: {
            name: "card",
            entity: "card",
            query: "cardAll",
            labelField: "name",
            presentation: "listDetail",
            relationship: "cardRates",
            createView: "cardCreate",
            itemView: "cardListItem",
          },
        }),
      }),
    );

    expect(schema.views.rateHome).toMatchObject({
      type: "collection",
      entity: "rate",
      context: {
        name: "card",
        entity: "card",
        presentation: "listDetail",
        relationship: "cardRates",
      },
      queries: [{ query: "ratesForSelectedCard", count: { type: "count" } }],
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

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          views: scopedRateViews({
            context: {
              name: "card",
              entity: "card",
              query: "cardAll",
              labelField: "name",
              itemView: "missing",
            },
          }),
        }),
      ),
    ).toThrow('context itemView references unknown item view "missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          views: scopedRateViews({
            context: {
              name: "card",
              entity: "card",
              query: "cardAll",
              labelField: "name",
              itemView: "rateListItem",
            },
          }),
        }),
      ),
    ).toThrow('context itemView "rateListItem" must use entity "card"');
  });

  it("rejects invalid relationship-backed collection contexts", () => {
    expect(() =>
      parseAppSchema(
        rateRelationshipSchema({
          views: scopedRateViews({
            context: {
              name: "card",
              entity: "card",
              query: "cardAll",
              labelField: "name",
              relationship: "missing",
            },
          }),
        }),
      ),
    ).toThrow('context relationship references unknown relationship "missing"');

    expect(() =>
      parseAppSchema(
        rateRelationshipSchema({
          views: scopedRateViews({
            context: {
              name: "card",
              entity: "card",
              query: "cardAll",
              labelField: "name",
              relationship: "cardResources",
            },
          }),
        }),
      ),
    ).toThrow('context relationship "cardResources" must be a toMany relationship');

    expect(() =>
      parseAppSchema(
        rateRelationshipSchema({
          views: scopedRateViews({
            context: {
              name: "card",
              entity: "resource",
              query: "resourceAll",
              labelField: "name",
              relationship: "cardRates",
            },
          }),
        }),
      ),
    ).toThrow('context relationship "cardRates" must start from context entity "resource"');

    expect(() =>
      parseAppSchema(
        rateRelationshipSchema({
          views: scopedRateViews({
            entity: "resource",
            context: {
              name: "card",
              entity: "card",
              query: "cardAll",
              labelField: "name",
              relationship: "cardRates",
            },
          }),
        }),
      ),
    ).toThrow('context relationship "cardRates" must target collection entity "resource"');
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
          views: scopedRateViews({
            context: {
              name: "card",
              entity: "card",
              query: "cardAll",
              labelField: "name",
              createView: "cardCreate",
              navigation: {
                placement: "sidebar",
                groups: [{ label: "Cards", query: "cardAll", createView: "rateCreate" }],
              },
            },
          }),
        }),
      ),
    ).toThrow('context navigation group "Cards" createView "rateCreate" must use entity "card"');

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

  it("rejects relationship-backed collection queries that use the wrong reference field", () => {
    const entities = scopedRateEntitiesWithUniqueRatePair();

    expect(() =>
      parseAppSchema(
        rateRelationshipSchema({
          entities: {
            ...entities,
            rate: {
              ...entities.rate,
              fields: {
                ...entities.rate.fields,
                alternateCard: {
                  type: "reference",
                  required: false,
                  label: "Alternate card",
                  to: "card",
                },
              },
            },
          },
          queries: {
            ...scopedRateQueries(),
            ratesForSelectedCard: {
              label: "For selected card",
              entity: "rate",
              expression: {
                kind: "where",
                ref: { kind: "value", name: "alternateCard" },
                op: "eq",
                value: { kind: "context", name: "card" },
              },
            },
          },
          views: scopedRateViews({
            context: {
              name: "card",
              entity: "card",
              query: "cardAll",
              labelField: "name",
              relationship: "cardRates",
            },
          }),
        }),
      ),
    ).toThrow('query "ratesForSelectedCard" must filter relationship field "rate.card"');
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

  it("rejects relationship-backed create defaults that use the wrong reference field", () => {
    const entities = scopedRateEntitiesWithUniqueRatePair();

    expect(() =>
      parseAppSchema(
        rateRelationshipSchema({
          entities: {
            ...entities,
            rate: {
              ...entities.rate,
              fields: {
                ...entities.rate.fields,
                alternateCard: {
                  type: "reference",
                  required: false,
                  label: "Alternate card",
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
                relationship: "cardRates",
              },
            }),
            rateCreateForCard: {
              type: "create",
              entity: "rate",
              fields: {
                resource: { editor: "reference" },
                card: { editor: "reference" },
                cost: { editor: "number" },
                costUnit: { editor: "enum" },
                price: { editor: "number" },
              },
              defaults: {
                alternateCard: { kind: "context", name: "card" },
              },
            },
          },
        }),
      ),
    ).toThrow('default field "alternateCard" must use relationship field "rate.card"');
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
    expect(schema.entities.rate?.constraints?.uniqueRatePair).toEqual({
      kind: "unique",
      fields: ["resource", "card"],
    });
    expect(schema.entities.rate?.actions?.regenerateMissingRates).toEqual({
      label: "Regenerate missing rates",
      kind: "create-missing-join-records",
      join: {
        left: { field: "resource", query: "resourceAll" },
        right: { field: "card", query: "cardAll" },
      },
    });
    expect(schema.relationships).toMatchObject({
      rateCard: {
        kind: "toOne",
        from: { entity: "rate", field: "card" },
        to: { entity: "card" },
        inverse: "cardRates",
      },
      cardRates: {
        kind: "toMany",
        from: { entity: "card" },
        to: { entity: "rate", field: "card" },
        inverse: "rateCard",
      },
      rateResource: {
        kind: "toOne",
        from: { entity: "rate", field: "resource" },
        to: { entity: "resource" },
        inverse: "resourceRates",
      },
      resourceRates: {
        kind: "toMany",
        from: { entity: "resource" },
        to: { entity: "rate", field: "resource" },
        inverse: "rateResource",
      },
      cardResources: {
        kind: "manyToMany",
        from: { entity: "card" },
        to: { entity: "resource" },
        through: {
          entity: "rate",
          fromField: "card",
          toField: "resource",
          uniqueConstraint: "uniqueRatePair",
        },
        inverse: "resourceCards",
      },
      resourceCards: {
        kind: "manyToMany",
        from: { entity: "resource" },
        to: { entity: "card" },
        through: {
          entity: "rate",
          fromField: "resource",
          toField: "card",
          uniqueConstraint: "uniqueRatePair",
        },
        inverse: "cardResources",
      },
    });
    expect(schema.itemViews.rateListItem?.fields).toEqual({
      resource: { editor: "reference", commit: "immediate" },
      cost: { editor: "number", commit: "field-commit" },
      costUnit: { editor: "enum", commit: "immediate" },
      price: { editor: "number", commit: "field-commit" },
      currency: { editor: "enum", commit: "immediate" },
    });
    expect(schema.tableViews.rateTable?.columns).toMatchObject([
      {
        type: "referenceField",
        referenceField: "resource",
        field: "name",
        label: "Role",
        editor: "text",
        commit: "field-commit",
        width: "lg",
      },
      { type: "field", field: "cost", valueUnit: { unitField: "costUnit" } },
      { type: "field", field: "costUnit" },
      {
        type: "field",
        field: "price",
        format: "currency",
      },
      {
        type: "computed",
        computedValue: "rateMargin",
        label: "Margin",
        align: "end",
        width: "sm",
        display: "readOnly",
        format: "percent",
      },
    ]);
    expect(schema.tableViews.rateTable?.columns[0]).toMatchObject({
      type: "referenceField",
      referenceField: "resource",
      field: "name",
    });
    expect(schema.readModels).toEqual({
      computedValues: {
        rateMargin: {
          entity: "rate",
          type: "number",
          expression: rateMarginExpression(),
        },
      },
      aggregates: {
        selectedCardAverageCost: {
          query: "ratesForSelectedCard",
          function: "average",
          value: { kind: "field", field: "cost" },
        },
        selectedCardAveragePrice: {
          query: "ratesForSelectedCard",
          function: "average",
          value: { kind: "field", field: "price" },
        },
        selectedCardAverageMargin: {
          query: "ratesForSelectedCard",
          function: "average",
          value: { kind: "computed", computedValue: "rateMargin" },
        },
      },
    });
    expect(schema.views.resourceHome).toMatchObject({
      type: "collection",
    });
    expect(schema.views.cardHome).toMatchObject({
      type: "collection",
    });
    expect(schema.views.rateHome).toMatchObject({
      type: "collection",
      context: {
        itemView: "rateCardContextItem",
      },
      result: {
        type: "table",
        tableView: "rateTable",
        footer: [
          {
            type: "aggregate",
            column: "cost",
            aggregate: "selectedCardAverageCost",
            label: "Average cost",
            suffix: "/ day",
            format: "currency",
          },
          {
            type: "aggregate",
            column: "price",
            aggregate: "selectedCardAveragePrice",
            label: "Average price",
            suffix: "/ day",
            format: "currency",
          },
          {
            type: "aggregate",
            column: "rateMargin",
            aggregate: "selectedCardAverageMargin",
            label: "Average margin",
            format: "percent",
          },
        ],
      },
      actions: [{ type: "create", createView: "resourceCreate" }],
    });
    expect(
      ["resourceHome", "cardHome", "rateHome"].map((viewName) => {
        const view = schema.views[viewName];

        return view?.type === "collection" ? view.navigation : "missing";
      }),
    ).toEqual([undefined, undefined, undefined]);
  });

  it("keeps read-model declarations optional", () => {
    const rawSchemaWithoutReadModels = baseSchema();
    const schema = parseAppSchema(rawSchemaWithoutReadModels);

    expect("readModels" in rawSchemaWithoutReadModels).toBe(false);
    expect("readModels" in schema).toBe(false);
    expect(
      parseAppSchema({
        ...rawSchemaWithoutReadModels,
        readModels: { computedValues: {}, aggregates: {} },
      }).readModels,
    ).toEqual({ computedValues: {}, aggregates: {} });
  });
});

describe("source schemas", () => {
  it("parses and re-parses the current source schemas unchanged", () => {
    const parsedSchemas = sourceLikeSchemas().map((schema) => parseAppSchema(schema));

    expect(parsedSchemas.map((schema) => Object.keys(schema.tableViews))).toEqual([
      [],
      ["rateTable"],
      ["siteSettingsTable", "blockTable", "blockPlacementTable"],
    ]);
    expect(
      parsedSchemas.map((schema) =>
        Object.values(schema.tableViews).flatMap((tableView) =>
          tableView.columns.map((column) => column.type),
        ),
      ),
    ).toEqual([
      [],
      ["referenceField", "field", "field", "field", "computed"],
      [
        "field",
        "field",
        "field",
        "field",
        "field",
        "field",
        "field",
        "field",
        "field",
        "field",
        "field",
        "field",
        "field",
        "orderingHandle",
        "field",
        "field",
        "field",
        "invokeAction",
      ],
    ]);

    for (const schema of parsedSchemas) {
      expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
    }
  });
});

describe("schema read models", () => {
  it("parses numeric computed values, aggregates, and stringify output", () => {
    const schema = parseAppSchema(
      scopedRateSchema({
        readModels: scopedRateReadModels(),
      }),
    );

    expect(schema.readModels?.computedValues?.rateMargin).toEqual({
      entity: "rate",
      type: "number",
      expression: rateMarginExpression(),
    });
    expect(schema.readModels?.aggregates).toEqual({
      selectedCardCostTotal: {
        query: "ratesForSelectedCard",
        function: "sum",
        value: { kind: "field", field: "cost" },
      },
      selectedCardAverageMargin: {
        query: "ratesForSelectedCard",
        function: "average",
        value: { kind: "computed", computedValue: "rateMargin" },
      },
      selectedCardMinCost: {
        query: "ratesForSelectedCard",
        function: "min",
        value: { kind: "field", field: "cost" },
      },
      selectedCardMaxPrice: {
        query: "ratesForSelectedCard",
        function: "max",
        value: { kind: "field", field: "price" },
      },
      selectedCardRateCount: {
        query: "ratesForSelectedCard",
        function: "count",
      },
    });
    expect(JSON.parse(stringifySchema(schema)).readModels).toEqual(schema.readModels);
  });

  it("rejects computed values with bad field references", () => {
    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          readModels: {
            computedValues: {
              rateMargin: {
                entity: "rate",
                type: "number",
                expression: { kind: "field", field: "missing" },
              },
            },
          },
        }),
      ),
    ).toThrow('references unknown field "rate.missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          readModels: {
            computedValues: {
              rateMargin: {
                entity: "rate",
                type: "number",
                expression: { kind: "field", field: "currency" },
              },
            },
          },
        }),
      ),
    ).toThrow('field "rate.currency" must be a number field');
  });

  it("rejects malformed numeric computed expressions", () => {
    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          readModels: {
            computedValues: {
              rateMargin: {
                entity: "rate",
                type: "text",
                expression: rateMarginExpression(),
              },
            },
          },
        }),
      ),
    ).toThrow('Computed value "rateMargin" type must be "number"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          readModels: {
            computedValues: {
              rateMargin: {
                entity: "rate",
                type: "number",
                expression: {
                  kind: "binary",
                  op: "modulo",
                  left: { kind: "field", field: "price" },
                  right: { kind: "field", field: "cost" },
                },
              },
            },
          },
        }),
      ),
    ).toThrow('op must be "add", "subtract", "multiply", or "divide"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          readModels: {
            computedValues: {
              rateMargin: {
                entity: "rate",
                type: "number",
                expression: { kind: "literal", value: Infinity },
              },
            },
          },
        }),
      ),
    ).toThrow("literal value must be finite");
  });

  it("validates aggregate query and value references", () => {
    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          readModels: {
            aggregates: {
              selectedCardCostTotal: {
                query: "missing",
                function: "sum",
                value: { kind: "field", field: "cost" },
              },
            },
          },
        }),
      ),
    ).toThrow('references unknown query "missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          readModels: {
            aggregates: {
              selectedCardCostTotal: {
                query: "ratesForSelectedCard",
                function: "sum",
                value: { kind: "field", field: "missing" },
              },
            },
          },
        }),
      ),
    ).toThrow('references unknown field "rate.missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          readModels: {
            aggregates: {
              selectedCardAverageMargin: {
                query: "ratesForSelectedCard",
                function: "average",
                value: { kind: "computed", computedValue: "missing" },
              },
            },
          },
        }),
      ),
    ).toThrow('references unknown computed value "missing"');
  });
});

describe("personal site sample schema", () => {
  it("parses the block model, relationships, and source app view", () => {
    const schema = parseAppSchema(rawSiteSchema);

    expect(Object.keys(schema.entities)).toEqual(["site", "block", "blockPlacement"]);
    expect(schema.entities.site?.fields).toEqual({
      key: {
        type: "text",
        required: true,
        label: "Key",
      },
      label: {
        type: "text",
        required: true,
        label: "Label",
      },
      description: {
        type: "text",
        required: false,
        label: "Description",
        format: "longText",
      },
      icon: {
        type: "text",
        required: false,
        label: "Icon",
        format: "icon",
      },
    });
    expect(schema.entities.site?.mutations).toEqual({
      create: { enabled: false },
      patch: { enabled: true },
      delete: { enabled: false },
    });
    expect(schema.entities.site?.constraints?.uniqueSiteKey).toEqual({
      kind: "unique",
      fields: ["key"],
    });
    expect(schema.entities.block?.fields.type).toEqual({
      type: "enum",
      required: true,
      label: "Type",
      values: {
        page: { label: "Page" },
        post: { label: "Post" },
        project: { label: "Project" },
        postList: { label: "Post list" },
        projectList: { label: "Project list" },
        group: { label: "Group" },
        header: { label: "Header" },
        headerPrimary: { label: "Header primary" },
        headerSecondary: { label: "Header secondary" },
        footer: { label: "Footer" },
        footerSection: { label: "Footer section" },
        footerSocial: { label: "Footer social" },
        link: { label: "Link" },
        markdown: { label: "Markdown" },
        hero: { label: "Hero" },
        feature: { label: "Feature" },
        image: { label: "Image" },
      },
    });
    expect(schema.entities.block?.fields.label).toEqual({
      type: "text",
      required: true,
      label: "Label",
    });
    expect(schema.entities.block?.fields.body).toEqual({
      type: "text",
      required: false,
      label: "Body",
      format: "markdown",
    });
    expect(schema.entities.block?.fields.href).toMatchObject({
      type: "text",
      format: "href",
    });
    expect(schema.entities.block?.fields.date).toEqual({
      type: "date",
      required: false,
      label: "Date",
    });
    expect(schema.entities.block?.fields.alignment).toEqual({
      type: "enum",
      required: false,
      label: "Media side",
      values: {
        left: { label: "Left" },
        right: { label: "Right" },
      },
    });
    expect(Object.keys(schema.entities.block?.fields ?? {})).toEqual([
      "type",
      "label",
      "body",
      "href",
      "date",
      "linkTargetMode",
      "linkTargetBlock",
      "icon",
      "color",
      "alignment",
      "width",
      "height",
    ]);
    expect(schema.entities.block?.fields).not.toHaveProperty("templateKey");
    expect(schema.entities.block?.fields).not.toHaveProperty("featured");
    expect(schema.entities.block?.fields).not.toHaveProperty("order");
    expect(schema.entities.blockPlacement?.label).toBe("Placement");
    expect(schema.entities.blockPlacement?.fields.parent).toMatchObject({
      type: "reference",
      required: true,
      to: "block",
      displayField: "label",
    });
    expect(schema.entities.blockPlacement?.fields.block).toMatchObject({
      type: "reference",
      required: true,
      to: "block",
      displayField: "label",
    });
    expect(schema.entities.blockPlacement?.fields.slot).toEqual({
      type: "text",
      required: false,
      label: "Slot",
    });
    expect(Object.keys(schema.entities.blockPlacement?.fields ?? {})).toEqual([
      "parent",
      "block",
      "order",
      "label",
      "slot",
    ]);
    expect(schema.entities.blockPlacement?.actions).toMatchObject({
      addTreeChild: {
        label: "Add child",
        kind: "create-tree-child",
        relationship: "blockPlacements",
        childField: "block",
        orderField: "order",
      },
      removeTreePlacement: {
        label: "Remove child",
        kind: "remove-tree-placement",
        relationship: "blockPlacements",
      },
    });
    expect(schema.unions?.blockByType).toMatchObject({
      entity: "block",
      discriminator: "type",
      variants: {
        page: { label: "Page", fields: ["label", "href", "icon"] },
        post: { label: "Post", fields: ["label", "date", "body", "href"] },
        project: { label: "Project", fields: ["label", "date", "body", "href"] },
        postList: { label: "Post list", fields: ["label"] },
        projectList: { label: "Project list", fields: ["label"] },
        header: { label: "Header", fields: ["label"] },
        headerPrimary: { label: "Header primary", fields: ["label"] },
        headerSecondary: { label: "Header secondary", fields: ["label"] },
        footer: { label: "Footer", fields: ["label"] },
        footerSection: { label: "Footer section", fields: ["label"] },
        footerSocial: { label: "Footer social", fields: ["label"] },
        link: {
          label: "Link",
          fields: ["label", "linkTargetMode", "linkTargetBlock", "href", "icon"],
          requiredFields: ["label", "linkTargetMode"],
        },
        markdown: { label: "Markdown", fields: ["label", "body"] },
        feature: { label: "Feature", fields: ["label", "body", "alignment"] },
        image: {
          label: "Image",
          fields: ["label", "href"],
          requiredFields: ["label"],
        },
      },
      fallback: { label: "Block", fields: ["label", "type"] },
    });
    for (const removedType of ["contentList", "contentGrid", "video", "file", "cta", "subscribe"]) {
      expect(schema.unions?.blockByType?.variants ?? {}).not.toHaveProperty(removedType);
    }
    expect(schema.relationships).toMatchObject({
      placementParent: {
        kind: "toOne",
        from: { entity: "blockPlacement", field: "parent" },
        to: { entity: "block" },
        inverse: "blockPlacements",
      },
      blockPlacements: {
        kind: "toMany",
        from: { entity: "block" },
        to: { entity: "blockPlacement", field: "parent" },
        inverse: "placementParent",
      },
      placementBlock: {
        kind: "toOne",
        from: { entity: "blockPlacement", field: "block" },
        to: { entity: "block" },
        inverse: "blockUsedInPlacements",
      },
      blockUsedInPlacements: {
        kind: "toMany",
        from: { entity: "block" },
        to: { entity: "blockPlacement", field: "block" },
        inverse: "placementBlock",
      },
    });
    expect(Object.keys(schema.queries)).toEqual([
      "sitePrimary",
      "blockAll",
      "blockPages",
      "blockNavigationRoots",
      "blockSiteRoots",
      "blockPosts",
      "blockProjects",
      "blockLinks",
      "blockGroups",
      "blockImages",
      "placementsForSelectedBlock",
    ]);
    expect(schema.queries.sitePrimary?.expression).toMatchObject({
      ref: { kind: "value", name: "key" },
      op: "eq",
      value: "primary",
    });
    expect(schema.queries.blockPosts?.expression).toMatchObject({
      ref: { kind: "value", name: "type" },
      op: "eq",
      value: "post",
    });
    expect(schema.queries.blockProjects?.expression).toMatchObject({
      ref: { kind: "value", name: "type" },
      op: "eq",
      value: "project",
    });
    expect(schema.queries.placementsForSelectedBlock?.expression).toMatchObject({
      ref: { kind: "value", name: "parent" },
      value: { kind: "context", name: "block" },
    });
    expect(schema.queries.blockNavigationRoots?.expression).toMatchObject({
      kind: "or",
      expressions: [
        { ref: { kind: "value", name: "type" }, op: "eq", value: "header" },
        { ref: { kind: "value", name: "type" }, op: "eq", value: "footer" },
      ],
    });
    expect(schema.queries.blockSiteRoots?.expression).toMatchObject({
      kind: "or",
      expressions: [
        { ref: { kind: "value", name: "type" }, op: "eq", value: "page" },
        { ref: { kind: "value", name: "type" }, op: "eq", value: "post" },
        { ref: { kind: "value", name: "type" }, op: "eq", value: "project" },
        { ref: { kind: "value", name: "type" }, op: "eq", value: "header" },
        { ref: { kind: "value", name: "type" }, op: "eq", value: "footer" },
      ],
    });
    expect(Object.keys(schema.tableViews)).toEqual([
      "siteSettingsTable",
      "blockTable",
      "blockPlacementTable",
    ]);
    expect(schema.tableViews.siteSettingsTable).toMatchObject({
      entity: "site",
      columns: [
        { type: "field", field: "label", editor: "text", commit: "field-commit" },
        { type: "field", field: "description", editor: "textarea", commit: "field-commit" },
        { type: "field", field: "icon", editor: "icon", commit: "field-commit" },
      ],
    });
    expect(schema.itemViews.blockTreeNode).toMatchObject({
      entity: "block",
      fields: {
        label: { editor: "text", commit: "field-commit" },
      },
      union: "blockByType",
      variants: {
        header: {
          presentation: "contextLink",
          labelField: "label",
          target: { kind: "selectContext", context: "block", record: "self" },
        },
        footer: {
          presentation: "contextLink",
          labelField: "label",
          target: { kind: "selectContext", context: "block", record: "self" },
        },
        link: {
          presentation: "fields",
          fields: {
            linkTargetMode: { editor: "enum", commit: "immediate" },
            linkTargetBlock: { editor: "reference", commit: "immediate" },
            href: { editor: "href", commit: "field-commit" },
            icon: { editor: "icon", commit: "field-commit" },
          },
        },
        markdown: {
          presentation: "fields",
          fields: {
            body: { editor: "markdown", commit: "field-commit" },
          },
        },
      },
      fallback: {
        presentation: "fields",
        fields: {
          label: { editor: "text", commit: "field-commit" },
        },
      },
    });
    expect(schema.views.blockHome).toMatchObject({
      type: "collection",
      label: "Blocks",
      entity: "block",
      navigation: { primary: false },
      result: { type: "table", tableView: "blockTable" },
      actions: [{ type: "create", createView: "blockCreate" }],
    });
    expect(schema.views.blockCreate).toMatchObject({
      type: "create",
      entity: "block",
      fields: {
        type: { editor: "enum" },
        label: { editor: "text" },
      },
      union: "blockByType",
      variants: {
        page: {
          presentation: "fields",
          fields: {
            href: { editor: "href" },
          },
        },
        post: {
          presentation: "fields",
          fields: {
            date: { editor: "date" },
            body: { editor: "markdown" },
            href: { editor: "href" },
          },
        },
        link: {
          presentation: "fields",
          fields: {
            linkTargetMode: { editor: "enum" },
            linkTargetBlock: { editor: "reference" },
            href: { editor: "href" },
            icon: { editor: "icon" },
          },
        },
        markdown: {
          presentation: "fields",
          fields: {
            body: { editor: "markdown" },
          },
        },
        image: {
          presentation: "fields",
          fields: {
            href: { editor: "image" },
          },
        },
      },
    });
    expect(schema.views.blockEdit).toMatchObject({
      type: "edit",
      entity: "block",
      fields: {
        label: { editor: "text", commit: "field-commit" },
      },
      union: "blockByType",
      variants: {
        page: {
          presentation: "fields",
          fields: {
            href: { editor: "href", commit: "field-commit" },
            icon: { editor: "icon", commit: "field-commit" },
          },
        },
        post: {
          presentation: "fields",
          fields: {
            date: { editor: "date", commit: "field-commit" },
            body: { editor: "markdown", commit: "field-commit" },
            href: { editor: "href", commit: "field-commit" },
          },
        },
        link: {
          presentation: "fields",
          fields: {
            linkTargetMode: { editor: "enum", commit: "immediate" },
            linkTargetBlock: { editor: "reference", commit: "immediate" },
            href: { editor: "href", commit: "field-commit" },
            icon: { editor: "icon", commit: "field-commit" },
          },
        },
        markdown: {
          presentation: "fields",
          fields: {
            body: { editor: "markdown", commit: "field-commit" },
          },
        },
        image: {
          presentation: "fields",
          fields: {
            href: { editor: "image", commit: "field-commit" },
          },
        },
      },
    });
    expect(schema.tableViews.blockPlacementTable?.actions?.editChildBlock).toMatchObject({
      type: "editRecord",
      label: "Edit block",
      target: { kind: "reference", field: "block" },
      editView: "blockEdit",
    });
    expect(schema.views.blockCompositionHome).toMatchObject({
      type: "collection",
      label: "Placements",
      entity: "blockPlacement",
      navigation: { primary: false },
      context: {
        name: "block",
        entity: "block",
        query: "blockAll",
        labelField: "label",
        relationship: "blockPlacements",
        itemView: "blockContextItem",
      },
      result: { type: "table", tableView: "blockPlacementTable" },
      actions: [{ type: "create", createView: "blockPlacementCreate", label: "Add placement" }],
    });
    expect(schema.views.siteSettingsHome).toMatchObject({
      type: "collection",
      label: "Settings",
      entity: "site",
      navigation: { primary: false },
      queries: [{ query: "sitePrimary" }],
      defaultQuery: "sitePrimary",
      result: { type: "table", tableView: "siteSettingsTable" },
    });
    expect(schema.views.siteSettingsHome).not.toHaveProperty("actions");
    expect(schema.views.siteCompositionHome).toMatchObject({
      type: "collection",
      label: "Site",
      entity: "blockPlacement",
      navigation: { primary: true },
      context: {
        name: "block",
        entity: "block",
        query: "blockSiteRoots",
        labelField: "label",
        relationship: "blockPlacements",
        itemView: "blockRootDetail",
        presentation: "listDetail",
        navigation: {
          placement: "sidebar",
          groups: [
            { label: "Pages", query: "blockPages", createView: "blockPageCreate" },
            { label: "Posts", query: "blockPosts", createView: "blockPostCreate" },
            { label: "Projects", query: "blockProjects", createView: "blockProjectCreate" },
            { label: "Navigation", query: "blockNavigationRoots" },
          ],
        },
      },
      result: {
        type: "tree",
        relationship: "blockPlacements",
        childField: "block",
        childItemView: "blockTreeNode",
        ordering: {
          field: "order",
          scope: [
            { kind: "field", field: "parent" },
            { kind: "field", field: "slot" },
          ],
          presentations: ["dragHandle"],
        },
        composition: {
          createAction: "addTreeChild",
          removeAction: "removeTreePlacement",
        },
        maxDepth: 8,
      },
    });
    expect(schema.views.siteCompositionHome).not.toHaveProperty("actions");
    expect(schema.views.blockPageCreate).toMatchObject({
      type: "create",
      entity: "block",
      fields: {
        label: { editor: "text" },
        href: { editor: "href" },
        icon: { editor: "icon" },
      },
      defaults: {
        type: { kind: "literal", value: "page" },
      },
    });
    expect(schema.views.blockPostCreate).toMatchObject({
      type: "create",
      entity: "block",
      fields: {
        label: { editor: "text" },
        href: { editor: "href" },
        date: { editor: "date" },
        body: { editor: "markdown" },
      },
      defaults: {
        type: { kind: "literal", value: "post" },
      },
    });
    expect(schema.views.blockProjectCreate).toMatchObject({
      type: "create",
      entity: "block",
      fields: {
        label: { editor: "text" },
        href: { editor: "href" },
        date: { editor: "date" },
        body: { editor: "markdown" },
      },
      defaults: {
        type: { kind: "literal", value: "project" },
      },
    });
    expect(schema.views.pageCompositionHome).toMatchObject({
      type: "collection",
      label: "Pages",
      entity: "blockPlacement",
      navigation: { primary: false },
      context: {
        query: "blockPages",
        presentation: "listDetail",
      },
      result: { type: "table", tableView: "blockPlacementTable" },
    });
    expect(schema.views.navigationCompositionHome).toMatchObject({
      type: "collection",
      label: "Navigation",
      entity: "blockPlacement",
      navigation: { primary: false },
      context: {
        query: "blockNavigationRoots",
        presentation: "listDetail",
      },
      actions: [{ type: "create", createView: "blockPlacementCreate", label: "Add placement" }],
    });
    expect(schema.views.blockPlacementCreate).toMatchObject({
      type: "create",
      entity: "blockPlacement",
      defaults: {
        parent: { kind: "context", name: "block" },
      },
    });
    expect(schema.screens).toMatchObject({
      siteSettings: {
        type: "workspace",
        label: "Settings",
        path: "/settings",
        navigation: { primary: true },
        layout: {
          sections: [{ id: "settings", type: "collection", view: "siteSettingsHome" }],
        },
      },
      siteEditor: {
        type: "workspace",
        label: "Blocks",
        navigation: { primary: true },
        layout: {
          sections: [{ id: "site", type: "collection", view: "siteCompositionHome" }],
        },
      },
    });
  });

  it("parses site post and project root authoring", () => {
    const schema = parseAppSchema(rawSiteSchema);
    const siteCompositionHome = schema.views.siteCompositionHome;

    if (siteCompositionHome?.type !== "collection" || siteCompositionHome.result.type !== "tree") {
      throw new Error("Missing Site composition tree view.");
    }

    const navigationGroups = siteCompositionHome.context?.navigation?.groups ?? [];
    const navigationQueries = navigationGroups.map((group) => group.query);
    const branchVariants = siteCompositionHome.result.branches?.variants ?? {};
    const pagePolicy = branchVariants.page;
    const groupPolicy = branchVariants.group;
    const pageChildren = pagePolicy !== "leaf" ? (pagePolicy?.children ?? []) : [];
    const groupChildren = groupPolicy !== "leaf" ? (groupPolicy?.children ?? []) : [];

    expect(schema.queries.blockPosts?.label).toBe("Posts");
    expect(schema.queries.blockProjects?.label).toBe("Projects");
    expect(navigationGroups.map((group) => [group.label, group.query])).toEqual([
      ["Pages", "blockPages"],
      ["Posts", "blockPosts"],
      ["Projects", "blockProjects"],
      ["Navigation", "blockNavigationRoots"],
    ]);
    expect(navigationQueries).toContain("blockPosts");
    expect(navigationQueries).toContain("blockProjects");
    expect(navigationGroups.map((group) => [group.label, group.createView ?? null])).toEqual([
      ["Pages", "blockPageCreate"],
      ["Posts", "blockPostCreate"],
      ["Projects", "blockProjectCreate"],
      ["Navigation", null],
    ]);
    expect(schema.views.blockPageCreate).toMatchObject({
      type: "create",
      entity: "block",
      fields: {
        label: { editor: "text" },
        href: { editor: "href" },
        icon: { editor: "icon" },
      },
      defaults: {
        type: { kind: "literal", value: "page" },
      },
    });
    expect(schema.views.blockPostCreate).toMatchObject({
      type: "create",
      entity: "block",
      fields: {
        label: { editor: "text" },
        href: { editor: "href" },
        date: { editor: "date" },
        body: { editor: "markdown" },
      },
      defaults: {
        type: { kind: "literal", value: "post" },
      },
    });
    expect(schema.views.blockProjectCreate).toMatchObject({
      type: "create",
      entity: "block",
      fields: {
        label: { editor: "text" },
        href: { editor: "href" },
        date: { editor: "date" },
        body: { editor: "markdown" },
      },
      defaults: {
        type: { kind: "literal", value: "project" },
      },
    });
    expect(Object.keys(branchVariants)).toEqual([
      "page",
      "group",
      "post",
      "project",
      "feature",
      "postList",
      "projectList",
      "header",
      "headerPrimary",
      "headerSecondary",
      "footer",
      "footerSection",
      "footerSocial",
    ]);
    expect(pageChildren).toEqual([
      "group",
      "hero",
      "feature",
      "markdown",
      "image",
      "link",
      "project",
      "postList",
      "projectList",
    ]);
    expect(groupChildren).toEqual([
      "group",
      "hero",
      "feature",
      "markdown",
      "image",
      "link",
      "project",
      "postList",
      "projectList",
    ]);
    expect(branchVariants.post).toEqual({
      children: [
        "markdown",
        {
          variant: "image",
          label: "Primary image",
          placementValues: { slot: "primaryImage" },
        },
      ],
    });
    expect(branchVariants.project).toEqual({
      children: [
        {
          variant: "image",
          label: "Primary image",
          placementValues: { slot: "primaryImage" },
        },
      ],
    });
    expect(branchVariants.feature).toEqual({
      children: [
        {
          variant: "image",
          label: "Feature image",
          placementValues: { slot: "media" },
        },
        {
          variant: "link",
          label: "Action link",
          placementValues: { slot: "actions" },
        },
      ],
    });
    expect(branchVariants.postList).toBe("leaf");
    expect(branchVariants.projectList).toBe("leaf");
    expect(branchVariants.header).toEqual({
      action: "leaf",
      children: ["headerPrimary", "headerSecondary"],
    });
    expect(branchVariants.headerPrimary).toEqual({ children: ["link"] });
    expect(branchVariants.headerSecondary).toEqual({ children: ["link"] });
    expect(branchVariants.footer).toEqual({
      action: "leaf",
      children: ["footerSection", "footerSocial", "link"],
    });
    expect(branchVariants.footerSection).toEqual({ children: ["link"] });
    expect(branchVariants.footerSocial).toEqual({ children: ["link"] });
  });

  it("parses simplified site block authoring views", () => {
    const schema = parseAppSchema(rawSiteSchema);
    const plannedRemovedBlockTypes = [
      "contentList",
      "contentGrid",
      "video",
      "file",
      "cta",
      "subscribe",
      "profile",
      "custom",
    ];

    const blockTypeField = schema.entities.block?.fields.type;
    if (blockTypeField?.type !== "enum") {
      throw new Error("Missing Site block type enum.");
    }

    for (const blockType of plannedRemovedBlockTypes) {
      expect(blockTypeField.values).not.toHaveProperty(blockType);
      expect(schema.unions?.blockByType?.variants ?? {}).not.toHaveProperty(blockType);
    }
    expect(blockTypeField.values).toMatchObject({
      postList: { label: "Post list" },
      projectList: { label: "Project list" },
    });
    expect(schema.unions?.blockByType?.variants).toMatchObject({
      postList: { label: "Post list", fields: ["label"] },
      projectList: { label: "Project list", fields: ["label"] },
    });

    const blockCreate = schema.views.blockCreate;
    const blockEdit = schema.views.blockEdit;
    const blockPlacementCreate = schema.views.blockPlacementCreate;
    const siteCompositionHome = schema.views.siteCompositionHome;

    if (blockCreate?.type !== "create") {
      throw new Error("Missing Site block create view.");
    }
    if (blockEdit?.type !== "edit") {
      throw new Error("Missing Site block edit view.");
    }
    if (blockPlacementCreate?.type !== "create") {
      throw new Error("Missing Site placement create view.");
    }
    if (siteCompositionHome?.type !== "collection") {
      throw new Error("Missing Site composition collection view.");
    }

    expect(blockCreate.fields).toMatchObject({
      type: { editor: "enum" },
      label: { editor: "text" },
    });
    expect(blockEdit.fields).toMatchObject({
      label: { editor: "text", commit: "field-commit" },
    });
    expect(blockEdit.fields).not.toHaveProperty("type");
    expect(schema.itemViews.blockRootDetail).toMatchObject({
      fields: {
        label: { editor: "text", commit: "field-commit" },
      },
      variants: {
        page: {
          presentation: "fields",
          fields: {
            href: { editor: "href", commit: "field-commit" },
          },
        },
        post: {
          presentation: "fields",
          fields: {
            date: { editor: "date", commit: "field-commit" },
            body: { editor: "markdown", commit: "field-commit" },
            href: { editor: "href", commit: "field-commit" },
          },
        },
        image: {
          presentation: "fields",
          fields: {
            href: { editor: "image", commit: "field-commit" },
          },
        },
      },
    });
    const blockRootPage = schema.itemViews.blockRootDetail.variants?.page;
    if (blockRootPage?.presentation !== "fields") {
      throw new Error("Missing Site page root-detail fields presentation.");
    }
    expect(schema.itemViews.blockRootDetail.fields).not.toHaveProperty("type");
    expect(blockRootPage.fields).not.toHaveProperty("body");
    expect(blockRootPage.fields).not.toHaveProperty("templateKey");
    expect(schema.itemViews.blockRootDetail.variants).not.toHaveProperty("group");
    expect(schema.itemViews.blockRootDetail.variants).not.toHaveProperty("header");
    expect(schema.itemViews.blockRootDetail.variants).not.toHaveProperty("footer");
    expect(schema.itemViews.blockTreeNode).toMatchObject({
      variants: {
        hero: {
          presentation: "fields",
          fields: {
            body: { editor: "markdown", commit: "field-commit" },
          },
        },
        image: {
          presentation: "fields",
          fields: {
            href: { editor: "image", commit: "field-commit" },
          },
        },
      },
      fallback: {
        presentation: "fields",
        fields: {
          label: { editor: "text", commit: "field-commit" },
        },
      },
    });
    const blockTreeHero = schema.itemViews.blockTreeNode.variants?.hero;
    if (blockTreeHero?.presentation !== "fields") {
      throw new Error("Missing Site hero tree-node fields presentation.");
    }
    expect(blockTreeHero.fields).not.toHaveProperty("templateKey");
    expect(blockCreate.variants?.page).toMatchObject({
      presentation: "fields",
      fields: {
        href: { editor: "href" },
        icon: { editor: "icon" },
      },
    });
    expect(blockCreate.variants?.page?.fields).not.toHaveProperty("body");
    expect(blockCreate.variants?.page?.fields).not.toHaveProperty("templateKey");
    expect(blockCreate.variants?.image).toMatchObject({
      presentation: "fields",
      fields: {
        href: { editor: "image" },
      },
    });
    expect(blockCreate.variants?.feature).toMatchObject({
      presentation: "fields",
      fields: {
        body: { editor: "markdown" },
        alignment: { editor: "enum" },
      },
    });
    expect(blockEdit.variants?.page).toMatchObject({
      presentation: "fields",
      fields: {
        href: { editor: "href", commit: "field-commit" },
        icon: { editor: "icon", commit: "field-commit" },
      },
    });
    expect(blockEdit.variants?.page?.fields).not.toHaveProperty("body");
    expect(blockEdit.variants?.page?.fields).not.toHaveProperty("templateKey");
    expect(blockEdit.variants?.post).toMatchObject({
      presentation: "fields",
      fields: {
        date: { editor: "date", commit: "field-commit" },
        body: { editor: "markdown", commit: "field-commit" },
        href: { editor: "href", commit: "field-commit" },
      },
    });
    expect(blockEdit.variants?.post?.fields).not.toHaveProperty("templateKey");
    expect(blockEdit.variants?.image).toMatchObject({
      presentation: "fields",
      fields: {
        href: { editor: "image", commit: "field-commit" },
      },
    });
    expect(blockEdit.variants?.feature).toMatchObject({
      presentation: "fields",
      fields: {
        body: { editor: "markdown", commit: "field-commit" },
        alignment: { editor: "enum", commit: "immediate" },
      },
    });

    for (const blockType of plannedRemovedBlockTypes) {
      expect(blockCreate.variants).not.toHaveProperty(blockType);
      expect(blockEdit.variants).not.toHaveProperty(blockType);
      expect(schema.itemViews.blockRootDetail.variants).not.toHaveProperty(blockType);
      expect(schema.itemViews.blockTreeNode.variants).not.toHaveProperty(blockType);
    }

    expect(siteCompositionHome.result).toMatchObject({
      type: "tree",
      relationship: "blockPlacements",
      childField: "block",
      childItemView: "blockTreeNode",
      branches: {
        variants: {
          page: {
            children: [
              "group",
              "hero",
              "feature",
              "markdown",
              "image",
              "link",
              "project",
              "postList",
              "projectList",
            ],
          },
          group: {
            children: [
              "group",
              "hero",
              "feature",
              "markdown",
              "image",
              "link",
              "project",
              "postList",
              "projectList",
            ],
          },
          post: {
            children: [
              "markdown",
              {
                variant: "image",
                label: "Primary image",
                placementValues: { slot: "primaryImage" },
              },
            ],
          },
          project: {
            children: [
              {
                variant: "image",
                label: "Primary image",
                placementValues: { slot: "primaryImage" },
              },
            ],
          },
          feature: {
            children: [
              {
                variant: "image",
                label: "Feature image",
                placementValues: { slot: "media" },
              },
              {
                variant: "link",
                label: "Action link",
                placementValues: { slot: "actions" },
              },
            ],
          },
          postList: "leaf",
          projectList: "leaf",
          header: {
            action: "leaf",
            children: ["headerPrimary", "headerSecondary"],
          },
          headerPrimary: {
            children: ["link"],
          },
          headerSecondary: {
            children: ["link"],
          },
          footer: {
            action: "leaf",
            children: ["footerSection", "footerSocial", "link"],
          },
          footerSection: {
            children: ["link"],
          },
          footerSocial: {
            children: ["link"],
          },
        },
      },
      composition: {
        createAction: "addTreeChild",
        removeAction: "removeTreePlacement",
      },
    });
    expect(schema.itemViews.blockTreeNode.variants?.project).toMatchObject({
      presentation: "fields",
      fields: {
        date: { editor: "date", commit: "field-commit" },
        body: { editor: "markdown", commit: "field-commit" },
        href: { editor: "href", commit: "field-commit" },
      },
    });
    expect(siteCompositionHome.actions).toBeUndefined();
    expect(blockPlacementCreate).toMatchObject({
      type: "create",
      entity: "blockPlacement",
      fields: {
        block: { editor: "reference" },
        label: { editor: "text" },
      },
      defaults: {
        parent: { kind: "context", name: "block" },
      },
    });
    expect(schema.views.blockPageCreate).toMatchObject({
      type: "create",
      entity: "block",
      fields: {
        label: { editor: "text" },
        href: { editor: "href" },
        icon: { editor: "icon" },
      },
      defaults: {
        type: { kind: "literal", value: "page" },
      },
    });
    expect(schema.views.blockPostCreate).toMatchObject({
      type: "create",
      entity: "block",
      fields: {
        label: { editor: "text" },
        href: { editor: "href" },
        date: { editor: "date" },
        body: { editor: "markdown" },
      },
      defaults: {
        type: { kind: "literal", value: "post" },
      },
    });
    expect(schema.views.blockProjectCreate).toMatchObject({
      type: "create",
      entity: "block",
      fields: {
        label: { editor: "text" },
        href: { editor: "href" },
        date: { editor: "date" },
        body: { editor: "markdown" },
      },
      defaults: {
        type: { kind: "literal", value: "project" },
      },
    });
    expect(blockPlacementCreate.fields).not.toHaveProperty("parent");
    expect(blockPlacementCreate.fields).not.toHaveProperty("type");
  });

  it("parses site link target authoring fields and fixture link target modes", () => {
    const schema = parseAppSchema(rawSiteSchema);
    const seedRecords = new Map(
      testSiteSeedRecords.map((record) => {
        const internalTargets: Record<string, string> = {
          rec_site_content_link_home: "rec_site_content_home",
          rec_site_content_link_blog: "rec_site_content_blog",
          rec_site_content_link_projects: "rec_site_content_projects",
          rec_site_content_link_resume: "rec_site_content_resume",
        };

        const targetBlock = internalTargets[record.id];

        if (targetBlock) {
          return [
            record.id,
            {
              ...record,
              values: {
                ...record.values,
                linkTargetMode: "internal",
                linkTargetBlock: targetBlock,
              },
            },
          ] as const;
        }

        if (
          record.id === "rec_site_content_link_github" ||
          record.id === "rec_site_content_link_linkedin"
        ) {
          return [
            record.id,
            {
              ...record,
              values: {
                ...record.values,
                linkTargetMode: "external",
              },
            },
          ] as const;
        }

        return [record.id, record] as const;
      }),
    );
    const valuesFor = (id: string) => {
      const record = seedRecords.get(id);

      if (!record) {
        throw new Error(`Missing Site seed record "${id}".`);
      }

      return record.values;
    };

    expect(schema.entities.block?.fields.linkTargetMode).toEqual({
      type: "enum",
      required: false,
      label: "Link target",
      values: {
        internal: { label: "Internal" },
        external: { label: "External" },
      },
    });
    expect(schema.entities.block?.fields.linkTargetBlock).toEqual({
      type: "reference",
      required: false,
      label: "Target block",
      to: "block",
      displayField: "label",
    });
    expect(schema.unions?.blockByType?.variants.link).toEqual({
      label: "Link",
      fields: ["label", "linkTargetMode", "linkTargetBlock", "href", "icon"],
      requiredFields: ["label", "linkTargetMode"],
    });
    expect(schema.itemViews.blockRootDetail.variants?.link).toMatchObject({
      presentation: "fields",
      fields: {
        linkTargetMode: { editor: "enum", commit: "immediate" },
        linkTargetBlock: {
          editor: "reference",
          commit: "immediate",
          visibleWhen: { field: "linkTargetMode", values: ["internal"] },
        },
        href: {
          editor: "href",
          commit: "field-commit",
          visibleWhen: { field: "linkTargetMode", values: ["", "external"] },
        },
        icon: { editor: "icon", commit: "field-commit" },
      },
    });
    expect(schema.itemViews.blockTreeNode.variants?.link).toMatchObject({
      presentation: "fields",
      fields: {
        linkTargetMode: { editor: "enum", commit: "immediate" },
        linkTargetBlock: {
          editor: "reference",
          commit: "immediate",
          visibleWhen: { field: "linkTargetMode", values: ["internal"] },
        },
        href: {
          editor: "href",
          commit: "field-commit",
          visibleWhen: { field: "linkTargetMode", values: ["", "external"] },
        },
        icon: { editor: "icon", commit: "field-commit" },
      },
    });
    expect(schema.views.blockCreate).toMatchObject({
      variants: {
        link: {
          presentation: "fields",
          fields: {
            linkTargetMode: { editor: "enum" },
            linkTargetBlock: {
              editor: "reference",
              visibleWhen: { field: "linkTargetMode", values: ["internal"] },
            },
            href: {
              editor: "href",
              visibleWhen: { field: "linkTargetMode", values: ["", "external"] },
            },
            icon: { editor: "icon" },
          },
        },
      },
    });
    expect(schema.views.blockEdit).toMatchObject({
      variants: {
        link: {
          presentation: "fields",
          fields: {
            linkTargetMode: { editor: "enum", commit: "immediate" },
            linkTargetBlock: {
              editor: "reference",
              commit: "immediate",
              visibleWhen: { field: "linkTargetMode", values: ["internal"] },
            },
            href: {
              editor: "href",
              commit: "field-commit",
              visibleWhen: { field: "linkTargetMode", values: ["", "external"] },
            },
            icon: { editor: "icon", commit: "field-commit" },
          },
        },
      },
    });

    for (const [id, targetBlock, href] of [
      ["rec_site_content_link_home", "rec_site_content_home", "/"],
      ["rec_site_content_link_blog", "rec_site_content_blog", "/blog"],
      ["rec_site_content_link_projects", "rec_site_content_projects", "/projects"],
      ["rec_site_content_link_resume", "rec_site_content_resume", "/resume"],
    ]) {
      expect(valuesFor(id)).toMatchObject({
        type: "link",
        linkTargetMode: "internal",
        linkTargetBlock: targetBlock,
        href,
      });
    }

    for (const [id, href] of [
      ["rec_site_content_link_github", "https://github.com/dpeek"],
      ["rec_site_content_link_linkedin", "https://linkedin.com/in/dpeekdotcom"],
    ]) {
      const values = valuesFor(id);

      expect(values).toMatchObject({
        type: "link",
        linkTargetMode: "external",
        href,
      });
      expect(values).not.toHaveProperty("linkTargetBlock");
    }
  });
});

describe("schema entity constraints", () => {
  it("parses unique constraints over entity fields", () => {
    const entities = scopedRateEntities();
    const schema = parseAppSchema(
      scopedRateSchema({
        entities: {
          ...entities,
          rate: {
            ...entities.rate,
            constraints: {
              uniqueRatePair: {
                kind: "unique",
                fields: ["resource", "card"],
              },
            },
          },
        },
      }),
    );

    expect(schema.entities.rate?.constraints?.uniqueRatePair).toEqual({
      kind: "unique",
      fields: ["resource", "card"],
    });
  });

  it("rejects malformed unique constraints", () => {
    const entities = scopedRateEntities();

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          entities: {
            ...entities,
            rate: {
              ...entities.rate,
              constraints: {},
            },
          },
        }),
      ),
    ).toThrow('Entity "rate" constraints must not be empty');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          entities: {
            ...entities,
            rate: {
              ...entities.rate,
              constraints: {
                uniqueRatePair: {
                  kind: "unique",
                  fields: ["resource", "card"],
                  label: "Unique rate pair",
                },
              },
            },
          },
        }),
      ),
    ).toThrow('constraint "uniqueRatePair" has unsupported key "label"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          entities: {
            ...entities,
            rate: {
              ...entities.rate,
              constraints: {
                uniqueRatePair: {
                  kind: "unique",
                  fields: [],
                },
              },
            },
          },
        }),
      ),
    ).toThrow("fields must be a non-empty array");

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          entities: {
            ...entities,
            rate: {
              ...entities.rate,
              constraints: {
                uniqueRatePair: {
                  kind: "unique",
                  fields: ["resource", "missing"],
                },
              },
            },
          },
        }),
      ),
    ).toThrow('references unknown field "missing"');

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          entities: {
            ...entities,
            rate: {
              ...entities.rate,
              constraints: {
                duplicateField: {
                  kind: "unique",
                  fields: ["resource", "resource"],
                },
              },
            },
          },
        }),
      ),
    ).toThrow("fields must be unique");

    expect(() =>
      parseAppSchema(
        scopedRateSchema({
          entities: {
            ...entities,
            rate: {
              ...entities.rate,
              constraints: {
                oneDefaultCard: {
                  kind: "uniqueWhere",
                  fields: ["card"],
                },
              },
            },
          },
        }),
      ),
    ).toThrow('constraint "oneDefaultCard" has unsupported kind "uniqueWhere"');
  });
});

describe("schema relationships", () => {
  it("keeps relationship metadata optional and parses rates-shaped relationships", () => {
    expect(parseAppSchema(scopedRateSchema()).relationships).toBeUndefined();

    const schema = parseAppSchema(rateRelationshipSchema());

    expect(schema.relationships?.rateCard).toEqual({
      kind: "toOne",
      label: "Rate card",
      from: { entity: "rate", field: "card" },
      to: { entity: "card" },
      inverse: "cardRates",
    });
    expect(schema.relationships?.cardRates).toEqual({
      kind: "toMany",
      label: "Rates",
      from: { entity: "card" },
      to: { entity: "rate", field: "card" },
      inverse: "rateCard",
    });
    expect(schema.relationships?.cardResources).toEqual({
      kind: "manyToMany",
      label: "Resources",
      from: { entity: "card" },
      to: { entity: "resource" },
      through: {
        entity: "rate",
        fromField: "card",
        toField: "resource",
        uniqueConstraint: "uniqueRatePair",
      },
      inverse: "resourceCards",
    });
  });

  it("rejects malformed relationship registries and names", () => {
    expect(() => parseAppSchema(scopedRateSchema({ relationships: [] }))).toThrow(
      "Schema relationships must be an object",
    );

    expect(() =>
      parseAppSchema(
        rateRelationshipSchema({
          relationships: {
            "": {
              kind: "toOne",
              from: { entity: "rate", field: "card" },
              to: { entity: "card" },
            },
          },
        }),
      ),
    ).toThrow("Relationship names must be non-empty");
  });

  it("rejects invalid to-one and to-many relationship fields", () => {
    expect(() =>
      parseAppSchema(
        rateRelationshipSchema({
          relationships: {
            ...rateRelationships(),
            rateCard: {
              ...rateRelationships().rateCard,
              to: { entity: "resource" },
            },
          },
        }),
      ),
    ).toThrow('from field "rate.card" must reference entity "resource"');

    expect(() =>
      parseAppSchema(
        rateRelationshipSchema({
          relationships: {
            ...rateRelationships(),
            rateCard: {
              ...rateRelationships().rateCard,
              from: { entity: "rate", field: "cost" },
            },
          },
        }),
      ),
    ).toThrow('from field "rate.cost" must be a reference field');

    expect(() =>
      parseAppSchema(
        rateRelationshipSchema({
          relationships: {
            ...rateRelationships(),
            cardRates: {
              ...rateRelationships().cardRates,
              to: { entity: "rate", field: "resource" },
            },
          },
        }),
      ),
    ).toThrow('to field "rate.resource" must reference entity "card"');
  });

  it("rejects invalid many-to-many through fields and constraints", () => {
    expect(() =>
      parseAppSchema(
        rateRelationshipSchema({
          relationships: {
            ...rateRelationships(),
            cardResources: {
              ...rateRelationships().cardResources,
              through: {
                entity: "rate",
                fromField: "cost",
                toField: "resource",
                uniqueConstraint: "uniqueRatePair",
              },
            },
          },
        }),
      ),
    ).toThrow('through fromField field "rate.cost" must be a reference field');

    expect(() =>
      parseAppSchema(
        rateRelationshipSchema({
          relationships: {
            ...rateRelationships(),
            cardResources: {
              ...rateRelationships().cardResources,
              through: {
                entity: "rate",
                fromField: "card",
                toField: "card",
                uniqueConstraint: "uniqueRatePair",
              },
            },
          },
        }),
      ),
    ).toThrow('through toField "rate.card" must reference entity "resource"');

    expect(() =>
      parseAppSchema(
        rateRelationshipSchema({
          relationships: {
            ...rateRelationships(),
            cardResources: {
              ...rateRelationships().cardResources,
              through: {
                entity: "rate",
                fromField: "card",
                toField: "resource",
                uniqueConstraint: "missing",
              },
            },
          },
        }),
      ),
    ).toThrow('uniqueConstraint references unknown constraint "rate.missing"');

    expect(() =>
      parseAppSchema(
        rateRelationshipSchema({
          entities: scopedRateEntitiesWithUniqueRatePair(["card"]),
        }),
      ),
    ).toThrow(
      'uniqueConstraint "rate.uniqueRatePair" must cover through fields "card" and "resource"',
    );
  });

  it("rejects invalid reciprocal inverse links", () => {
    expect(() =>
      parseAppSchema(
        rateRelationshipSchema({
          relationships: {
            ...rateRelationships(),
            rateCard: {
              ...rateRelationships().rateCard,
              inverse: "missing",
            },
          },
        }),
      ),
    ).toThrow('inverse references unknown relationship "missing"');

    expect(() =>
      parseAppSchema(
        rateRelationshipSchema({
          relationships: {
            ...rateRelationships(),
            cardRates: {
              ...rateRelationships().cardRates,
              inverse: "cardResources",
            },
          },
        }),
      ),
    ).toThrow('inverse "cardRates" must point back to "rateCard"');
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

  it("rejects invalid action names, labels, kinds, and unsupported keys", () => {
    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: {
              ...defaultEntities().task,
              actions: {
                "": {
                  label: "Clear completed",
                  kind: "clear-completed",
                  target: { query: "taskCompleted" },
                },
              },
            },
          },
        }),
      ),
    ).toThrow("action names must be non-empty");

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: {
              ...defaultEntities().task,
              actions: {
                clearCompletedTasks: {
                  label: "",
                  kind: "clear-completed",
                  target: { query: "taskCompleted" },
                },
              },
            },
          },
        }),
      ),
    ).toThrow("label must be a non-empty string");

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: {
              ...defaultEntities().task,
              actions: {
                clearCompletedTasks: {
                  label: "Clear completed",
                  kind: "archive",
                  target: { query: "taskCompleted" },
                },
              },
            },
          },
        }),
      ),
    ).toThrow('has unsupported kind "archive"');

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
                  target: { query: "taskCompleted" },
                  debug: true,
                },
              },
            },
          },
        }),
      ),
    ).toThrow('has unsupported key "debug"');
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

  it("accepts selected join actions over many-to-many relationships", () => {
    const entities = scopedRateEntitiesWithUniqueRatePair();
    const schema = parseAppSchema(
      rateRelationshipSchema({
        entities: {
          ...entities,
          rate: {
            ...entities.rate,
            actions: selectedJoinActions(),
          },
        },
      }),
    );

    expect(schema.entities.rate?.actions?.addSelectedRate).toEqual({
      label: "Add selected rate",
      kind: "create-selected-join-record",
      relationship: "cardResources",
    });
    expect(schema.entities.rate?.actions?.removeSelectedRates).toEqual({
      label: "Remove selected rates",
      kind: "remove-selected-join-records",
      relationship: "cardResources",
    });
  });

  it("rejects selected join actions that do not match a many-to-many through entity", () => {
    const entities = scopedRateEntitiesWithUniqueRatePair();

    expect(() =>
      parseAppSchema(
        rateRelationshipSchema({
          entities: {
            ...entities,
            rate: {
              ...entities.rate,
              actions: {
                addSelectedRate: {
                  label: "Add selected rate",
                  kind: "create-selected-join-record",
                  relationship: "missing",
                },
              },
            },
          },
        }),
      ),
    ).toThrow('references unknown relationship "missing"');

    expect(() =>
      parseAppSchema(
        rateRelationshipSchema({
          entities: {
            ...entities,
            rate: {
              ...entities.rate,
              actions: {
                addSelectedRate: {
                  label: "Add selected rate",
                  kind: "create-selected-join-record",
                  relationship: "cardRates",
                },
              },
            },
          },
        }),
      ),
    ).toThrow('relationship "cardRates" must be manyToMany');

    expect(() =>
      parseAppSchema(
        rateRelationshipSchema({
          entities: {
            ...entities,
            card: {
              ...entities.card,
              actions: {
                addSelectedRate: {
                  label: "Add selected rate",
                  kind: "create-selected-join-record",
                  relationship: "cardResources",
                },
              },
            },
          },
        }),
      ),
    ).toThrow('relationship "cardResources" uses through entity "rate", not "card"');
  });

  it("rejects selected join creation without required defaults", () => {
    const entities = scopedRateEntitiesWithUniqueRatePair();

    expect(() =>
      parseAppSchema(
        rateRelationshipSchema({
          entities: {
            ...entities,
            rate: {
              ...entities.rate,
              fields: {
                ...entities.rate.fields,
                cost: { type: "number", required: true, label: "Cost", min: 0 },
              },
              actions: {
                addSelectedRate: {
                  label: "Add selected rate",
                  kind: "create-selected-join-record",
                  relationship: "cardResources",
                },
              },
            },
          },
        }),
      ),
    ).toThrow('requires field "cost" to have a default');
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

    expect(() =>
      parseAppSchema(
        baseSchema({
          entities: {
            task: {
              ...defaultEntities().task,
              mutations: {
                ...defaultEntities().task.mutations,
                create: {
                  enabled: true,
                  afterCreate: [{ entity: "task", action: "clearCompletedTasks" }],
                },
              },
            },
          },
        }),
      ),
    ).toThrow("create.afterCreate hook 0 action must create missing join records");
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
    screens: defaultScreens(),
    ...overrides,
  };
}

function siteSchemaWithTreeBranches(branches: unknown) {
  const schema = sourceLikeSiteSchema() as unknown as {
    itemViews: Record<string, unknown>;
    views: {
      siteCompositionHome: {
        result: Record<string, unknown>;
      };
    };
  };

  schema.views.siteCompositionHome.result.branches = branches;
  return schema;
}

function siteSchemaWithoutTreeBranches() {
  const schema = sourceLikeSiteSchema() as unknown as {
    views: {
      siteCompositionHome: {
        result: Record<string, unknown>;
      };
    };
  };

  delete schema.views.siteCompositionHome.result.branches;
  return schema;
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

function taskEntityWithKindEnum(overrides: Record<string, unknown> = {}) {
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
        ...overrides,
      },
    },
  };
}

function unionForTaskKind() {
  return {
    entity: "task",
    discriminator: "kind",
    variants: {
      role: {
        label: "Role",
        fields: ["title"],
      },
      stream: {
        label: "Stream",
        fields: ["title"],
      },
    },
  };
}

function taskEntityWithMarkdownBody(overrides: Record<string, Record<string, unknown>> = {}) {
  return {
    ...defaultEntities().task,
    fields: {
      ...defaultEntities().task.fields,
      body: {
        type: "text",
        required: false,
        label: "Body",
        format: "markdown",
        ...overrides.body,
      },
      imageUrl: {
        type: "text",
        required: false,
        label: "Image URL",
        format: "href",
        ...overrides.imageUrl,
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
    screens: {
      rateHome: {
        type: "workspace",
        label: "Rates",
        navigation: { primary: true },
        layout: {
          type: "stack",
          sections: [{ id: "rates", type: "collection", view: "rateHome" }],
        },
      },
    },
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
    screens: {
      rateHome: {
        type: "workspace",
        label: "Rates",
        navigation: { primary: true },
        layout: {
          type: "stack",
          sections: [{ id: "rates", type: "collection", view: "rateHome" }],
        },
      },
    },
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

function scopedRateEntitiesWithUniqueRatePair(fields = ["resource", "card"]) {
  const entities = scopedRateEntities();

  return {
    ...entities,
    rate: {
      ...entities.rate,
      constraints: {
        uniqueRatePair: {
          kind: "unique",
          fields,
        },
      },
    },
  };
}

function scopedRateEntitiesWithSortOrder(overrides: Record<string, unknown> = {}) {
  const entities = scopedRateEntities();

  return {
    ...entities,
    rate: {
      ...entities.rate,
      fields: {
        ...entities.rate.fields,
        sortOrder: {
          type: "number",
          required: true,
          label: "Sort order",
          default: 1000,
          min: 0,
          ...overrides,
        },
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
    resourceListItem: {
      entity: "resource",
      fields: {
        name: { editor: "text", commit: "field-commit" },
        kind: { editor: "enum", commit: "immediate" },
        unit: { editor: "enum", commit: "immediate" },
      },
    },
    cardListItem: {
      entity: "card",
      fields: {
        name: { editor: "text", commit: "field-commit" },
        isDefault: { editor: "boolean", commit: "immediate" },
        marginMin: { editor: "number", commit: "field-commit" },
        marginMed: { editor: "number", commit: "field-commit" },
        marginMax: { editor: "number", commit: "field-commit" },
      },
    },
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
          width: "lg",
          display: "readOnly",
          referenceItemView: "resourceListItem",
        },
        {
          type: "field",
          field: "cost",
          editor: "number",
          commit: "field-commit",
          align: "end",
          width: "sm",
          suffix: "/ day",
          format: "number",
          valueUnit: { unitField: "costUnit" },
        },
        {
          type: "field",
          field: "costUnit",
          editor: "enum",
          commit: "immediate",
          width: "xs",
          display: "hidden",
        },
        {
          type: "field",
          field: "price",
          editor: "number",
          commit: "field-commit",
          align: "end",
          width: "sm",
          suffix: "/ day",
          format: "number",
          valueUnit: { unitField: "currency" },
        },
        {
          type: "field",
          field: "currency",
          editor: "enum",
          commit: "immediate",
          width: "xs",
          display: "hidden",
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
        itemView: "cardListItem",
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

function scopedRateReadModels() {
  return {
    computedValues: {
      rateMargin: {
        entity: "rate",
        type: "number",
        expression: rateMarginExpression(),
      },
    },
    aggregates: {
      selectedCardCostTotal: {
        query: "ratesForSelectedCard",
        function: "sum",
        value: { kind: "field", field: "cost" },
      },
      selectedCardAverageMargin: {
        query: "ratesForSelectedCard",
        function: "average",
        value: { kind: "computed", computedValue: "rateMargin" },
      },
      selectedCardMinCost: {
        query: "ratesForSelectedCard",
        function: "min",
        value: { kind: "field", field: "cost" },
      },
      selectedCardMaxPrice: {
        query: "ratesForSelectedCard",
        function: "max",
        value: { kind: "field", field: "price" },
      },
      selectedCardRateCount: {
        query: "ratesForSelectedCard",
        function: "count",
      },
    },
  };
}

function rateMarginExpression() {
  return {
    kind: "binary",
    op: "divide",
    left: {
      kind: "binary",
      op: "subtract",
      left: { kind: "field", field: "price" },
      right: { kind: "field", field: "cost" },
    },
    right: { kind: "field", field: "price" },
  };
}

function rateRelationshipSchema(overrides: Record<string, unknown> = {}) {
  return scopedRateSchema({
    entities: scopedRateEntitiesWithUniqueRatePair(),
    relationships: rateRelationships(),
    ...overrides,
  });
}

function rateRelationships() {
  return {
    rateCard: {
      kind: "toOne",
      label: "Rate card",
      from: { entity: "rate", field: "card" },
      to: { entity: "card" },
      inverse: "cardRates",
    },
    cardRates: {
      kind: "toMany",
      label: "Rates",
      from: { entity: "card" },
      to: { entity: "rate", field: "card" },
      inverse: "rateCard",
    },
    cardResources: {
      kind: "manyToMany",
      label: "Resources",
      from: { entity: "card" },
      to: { entity: "resource" },
      through: {
        entity: "rate",
        fromField: "card",
        toField: "resource",
        uniqueConstraint: "uniqueRatePair",
      },
      inverse: "resourceCards",
    },
    resourceCards: {
      kind: "manyToMany",
      label: "Rate cards",
      from: { entity: "resource" },
      to: { entity: "card" },
      through: {
        entity: "rate",
        fromField: "resource",
        toField: "card",
        uniqueConstraint: "uniqueRatePair",
      },
      inverse: "cardResources",
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

function selectedJoinActions() {
  return {
    addSelectedRate: {
      label: "Add selected rate",
      kind: "create-selected-join-record",
      relationship: "cardResources",
    },
    removeSelectedRates: {
      label: "Remove selected rates",
      kind: "remove-selected-join-records",
      relationship: "cardResources",
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

function defaultScreens(screenOverrides: Record<string, unknown> = {}) {
  return {
    taskHome: defaultScreen(screenOverrides),
  };
}

function defaultScreen(screenOverrides: Record<string, unknown> = {}) {
  return {
    type: "workspace",
    label: "Tasks",
    navigation: { primary: true },
    layout: {
      type: "stack",
      sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
    },
    ...screenOverrides,
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
