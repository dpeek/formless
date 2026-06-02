import { describe, expect, it } from "vite-plus/test";
import {
  cloneTestValue,
  sourceLikeRateSchema,
  sourceLikeSiteSchema,
  sourceLikeTaskSchema,
} from "../test/schema-builders.ts";
import { parseAppSchema, type AppSchema } from "../shared/schema.ts";
import {
  applySchemaBuilderIntent,
  createSchemaBuilderDraft,
  projectSchemaBuilderDraft,
  serializeSchemaBuilderDraft,
  validateSchemaBuilderKey,
  validateSchemaBuilderDraft,
  type SchemaBuilderDraft,
  type SchemaBuilderIntent,
} from "./schema-builder.ts";

describe("schema builder draft intents", () => {
  it("creates an entity scaffold and roundtrips after a field is added", () => {
    const draft = applyIntents(
      createSchemaBuilderDraft(sourceLikeTaskSchema()),
      { type: "createEntity", key: "project", label: "Project" },
      {
        type: "addField",
        entityKey: "project",
        fieldKey: "name",
        fieldType: "text",
        metadata: { required: true },
      },
    );

    const schema = serializeSchemaBuilderDraft(draft);

    expect(schema.entities.project).toEqual({
      label: "Project",
      fields: {
        name: {
          type: "text",
          required: true,
          label: "Name",
        },
      },
      mutations: {
        create: { enabled: true },
        patch: { enabled: true },
        delete: { enabled: false },
      },
    });
    expect(schema.queries.projectAll).toBeUndefined();
    expect(schema.itemViews.projectItem).toBeUndefined();
    expect(schema.views.projectCreate).toBeUndefined();
    expect(schema.views.projectHome).toBeUndefined();
    expect(schema.screens?.projectScreen).toBeUndefined();
  });

  it("creates kebab-case entities with clean labels", () => {
    const draft = applyIntents(
      createSchemaBuilderDraft(sourceLikeTaskSchema()),
      { type: "createEntity", key: "project-note" },
      {
        type: "addField",
        entityKey: "project-note",
        fieldKey: "title",
        fieldType: "text",
      },
    );
    const schema = serializeSchemaBuilderDraft(draft);
    const projection = projectSchemaBuilderDraft(draft);

    expect(schema.entities["project-note"]).toMatchObject({
      label: "Project note",
      fields: {
        title: {
          type: "text",
          required: false,
          label: "Title",
        },
      },
    });
    expect(projection.entities.find((entity) => entity.key === "project-note")).toMatchObject({
      key: "project-note",
      keyLocked: false,
      label: "Project note",
      saved: false,
    });
  });

  it("validates Builder entity keys with parser kebab-case grammar only for entities", () => {
    expect(validateSchemaBuilderKey("entity", "project-note")).toEqual({ ok: true });
    expect(validateSchemaBuilderKey("entity", "appInstall")).toEqual({
      ok: false,
      message: "Entity key must be a singular kebab-case entity key.",
    });
    expect(validateSchemaBuilderKey("entity", "ProjectNote")).toEqual({
      ok: false,
      message: "Entity key must be a singular kebab-case entity key.",
    });
    expect(validateSchemaBuilderKey("entity", "project_note")).toEqual({
      ok: false,
      message: "Entity key must be a singular kebab-case entity key.",
    });
    expect(validateSchemaBuilderKey("entity", "site:block")).toEqual({
      ok: false,
      message: "Entity key must be a singular kebab-case entity key.",
    });
    expect(validateSchemaBuilderKey("field", "dueDate")).toEqual({ ok: true });
    expect(validateSchemaBuilderKey("field", "due-date")).toEqual({
      ok: false,
      message: "Field key must start with a letter and use only letters and numbers.",
    });
  });

  it("keeps saved kebab-case entity keys locked while preserving saved schema keys", () => {
    const base = sourceLikeTaskSchema();
    const original: AppSchema = parseAppSchema({
      ...base,
      entities: {
        ...base.entities,
        "project-note": {
          label: "Project note",
          fields: {
            createdAt: { type: "text", required: true, label: "Created at" },
          },
          mutations: {
            create: { enabled: true },
            patch: { enabled: true },
            delete: { enabled: false },
          },
        },
      },
      queries: {
        ...base.queries,
        projectNoteAll: {
          label: "Project notes",
          entity: "project-note",
          expression: { kind: "all" },
        },
      },
      views: {
        ...base.views,
        projectNoteHome: {
          type: "collection",
          label: "Project notes",
          entity: "project-note",
          queries: [{ query: "projectNoteAll" }],
          defaultQuery: "projectNoteAll",
          result: { type: "list", itemView: "projectNoteItem" },
        },
      },
      itemViews: {
        ...base.itemViews,
        projectNoteItem: {
          entity: "project-note",
          fields: {
            createdAt: { editor: "text", commit: "field-commit" },
          },
        },
      },
      screens: {
        ...base.screens,
        projectNoteScreen: {
          type: "workspace",
          label: "Project notes",
          navigation: { primary: false },
          layout: {
            type: "stack",
            sections: [{ id: "project-notes", type: "collection", view: "projectNoteHome" }],
          },
        },
      },
    });
    const draft = applyIntents(createSchemaBuilderDraft(original), {
      type: "addField",
      entityKey: "project-note",
      fieldKey: "body",
      fieldType: "text",
    });
    const schema = serializeSchemaBuilderDraft(draft);
    const projection = projectSchemaBuilderDraft(draft);
    const entityProjection = projection.entities.find((entity) => entity.key === "project-note");

    expect(entityProjection).toMatchObject({
      key: "project-note",
      keyLocked: true,
      saved: true,
      fields: [
        { key: "createdAt", keyLocked: true, saved: true },
        { key: "body", keyLocked: false, saved: false },
      ],
    });
    expect(schema.queries.projectNoteAll).toEqual(original.queries.projectNoteAll);
    expect(schema.views.projectNoteHome).toEqual(original.views.projectNoteHome);
    expect(schema.screens?.projectNoteScreen).toEqual(original.screens?.projectNoteScreen);
  });

  it("adds optional fields to source-owned entities without rewriting source-owned views", () => {
    const original = sourceLikeTaskSchema();
    const draft = applyIntents(createSchemaBuilderDraft(original), {
      type: "addField",
      entityKey: "task",
      fieldKey: "estimate",
      fieldType: "number",
      metadata: {
        label: "Estimate",
        required: true,
        min: 0,
        max: 10,
        integer: true,
        default: 3,
      },
    });
    const schema = serializeSchemaBuilderDraft(draft);

    expect(schema.entities.task?.fields.estimate).toEqual({
      type: "number",
      required: true,
      label: "Estimate",
      min: 0,
      max: 10,
      integer: true,
      default: 3,
    });
    expect(schema.itemViews.taskListItem?.fields.estimate).toBeUndefined();
    expect(schema.views.taskHome).toEqual(original.views.taskHome);
    expect(schema.entities.task?.actions).toEqual(original.entities.task?.actions);
  });

  it("preserves advanced schema sections when editing supported model metadata", () => {
    const original = {
      ...sourceLikeSiteSchema(),
      runtime: {
        owner: "runtime",
        builder: { editable: false },
        controlPlane: {
          entities: {
            site: { immutableFields: ["key"] },
          },
        },
      },
    } satisfies AppSchema;
    const originalRelationships = cloneTestValue(original.relationships);
    const originalUnions = cloneTestValue(original.unions);
    const originalTableViews = cloneTestValue(original.tableViews);
    const originalViews = cloneTestValue(original.views);
    const originalConstraints = cloneTestValue(original.entities.site?.constraints);
    const draft = applyIntents(createSchemaBuilderDraft(original), {
      type: "addField",
      entityKey: "site",
      fieldKey: "tagline",
      fieldType: "text",
      metadata: { format: "longText" },
    });
    const schema = serializeSchemaBuilderDraft(draft);
    const projection = projectSchemaBuilderDraft(draft);

    expect(schema.entities.site?.fields.tagline).toEqual({
      type: "text",
      required: false,
      label: "Tagline",
      format: "longText",
    });
    expect(schema.relationships).toEqual(originalRelationships);
    expect(schema.unions).toEqual(originalUnions);
    expect(schema.tableViews).toEqual(originalTableViews);
    expect(schema.views).toEqual(originalViews);
    expect(schema.entities.site?.constraints).toEqual(originalConstraints);
    expect(schema.runtime).toEqual(original.runtime);
    expect(projection).not.toHaveProperty("runtime");
  });

  it("updates a draft field type without creating generated surface editors", () => {
    const draft = applyIntents(
      createSchemaBuilderDraft(sourceLikeTaskSchema()),
      { type: "createEntity", key: "project", label: "Project" },
      {
        type: "addField",
        entityKey: "project",
        fieldKey: "estimate",
        fieldType: "text",
      },
      {
        type: "updateFieldMetadata",
        entityKey: "project",
        fieldKey: "estimate",
        metadata: { type: "number", default: 1 },
      },
    );
    const schema = serializeSchemaBuilderDraft(draft);

    expect(schema.entities.project?.fields.estimate).toMatchObject({
      type: "number",
      default: 1,
    });
    expect(schema.views.projectCreate).toBeUndefined();
    expect(schema.itemViews.projectItem).toBeUndefined();
  });

  it("preserves enum option presentation metadata when labels change", () => {
    const original = sourceLikeTaskSchema();
    const priority = original.entities.task?.fields.priority;

    if (priority?.type !== "enum") {
      throw new Error("Missing task priority field.");
    }

    priority.values.high.presentation = { color: "priority.high", icon: "flag" };
    priority.values.normal.presentation = { color: "priority.normal", icon: "flag" };

    const draft = applyIntents(createSchemaBuilderDraft(original), {
      type: "updateFieldMetadata",
      entityKey: "task",
      fieldKey: "priority",
      metadata: {
        values: {
          low: { label: "Low" },
          normal: { label: "Normal" },
          high: { label: "Urgent" },
        },
      },
    });
    const schema = serializeSchemaBuilderDraft(draft);
    const updatedPriority = schema.entities.task?.fields.priority;

    if (updatedPriority?.type !== "enum") {
      throw new Error("Missing updated task priority field.");
    }

    expect(updatedPriority.values.high).toEqual({
      label: "Urgent",
      presentation: { color: "priority.high", icon: "flag" },
    });
    expect(updatedPriority.values.normal).toEqual({
      label: "Normal",
      presentation: { color: "priority.normal", icon: "flag" },
    });
    expect(updatedPriority.values.low).toEqual({
      label: "Low",
      presentation: { color: "priority.low", icon: "flag" },
    });
  });

  it("reports field-scoped validation issues for invalid builder drafts", () => {
    const draft = applyIntents(createSchemaBuilderDraft(sourceLikeTaskSchema()), {
      type: "addField",
      entityKey: "task",
      fieldKey: "status",
      fieldType: "enum",
      metadata: {
        values: { draft: { label: "Draft" } },
        default: "missing",
      },
    });

    expect(validateSchemaBuilderDraft(draft)).toEqual([
      {
        scope: "field",
        entityKey: "task",
        fieldKey: "status",
        message: 'Field "task.status" enum default must match one of its values.',
      },
    ]);
  });

  it("locks saved field types and saved reference targets", () => {
    expect(() =>
      applyIntents(createSchemaBuilderDraft(sourceLikeTaskSchema()), {
        type: "updateFieldMetadata",
        entityKey: "task",
        fieldKey: "title",
        metadata: { type: "number" },
      }),
    ).toThrow('Saved field "task.title" type is locked.');

    expect(() =>
      applyIntents(createSchemaBuilderDraft(sourceLikeRateSchema()), {
        type: "updateFieldMetadata",
        entityKey: "rate",
        fieldKey: "resource",
        metadata: { to: "card" },
      }),
    ).toThrow('Saved reference field "rate.resource" target is locked.');
  });
});

function applyIntents(
  draft: SchemaBuilderDraft,
  ...intents: SchemaBuilderIntent[]
): SchemaBuilderDraft {
  return intents.reduce(applySchemaBuilderIntent, draft);
}
