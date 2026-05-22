import { describe, expect, it } from "vite-plus/test";
import {
  cloneTestValue,
  sourceLikeRateSchema,
  sourceLikeSiteSchema,
  sourceLikeTaskSchema,
} from "../test/schema-builders.ts";
import {
  applySchemaBuilderIntent,
  createSchemaBuilderDraft,
  findSchemaBuilderGeneratedSurface,
  projectSchemaBuilderDraft,
  serializeSchemaBuilderDraft,
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
    const surface = findSchemaBuilderGeneratedSurface(schema, "project");

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
    expect(surface).toEqual({
      queryKey: "projectAll",
      itemViewKey: "projectItem",
      createViewKey: "projectCreate",
      collectionViewKey: "projectHome",
      screenKey: "projectScreen",
    });
    expect(schema.queries.projectAll).toEqual({
      label: "All",
      entity: "project",
      expression: { kind: "all" },
    });
    expect(schema.itemViews.projectItem?.fields.name).toEqual({
      editor: "text",
      commit: "field-commit",
    });
    expect(schema.views.projectCreate).toMatchObject({
      type: "create",
      entity: "project",
      fields: { name: { editor: "text" } },
    });
    expect(schema.views.projectHome).toMatchObject({
      type: "collection",
      label: "Projects",
      entity: "project",
      defaultQuery: "projectAll",
      result: { type: "list", itemView: "projectItem" },
      actions: [{ type: "create", createView: "projectCreate" }],
    });
    expect(schema.screens?.projectScreen).toMatchObject({
      type: "workspace",
      label: "Projects",
      path: "/project",
      navigation: { primary: true },
    });
  });

  it("creates a collision-safe generated surface for an existing source-owned entity", () => {
    const draft = applyIntents(createSchemaBuilderDraft(sourceLikeTaskSchema()), {
      type: "createGeneratedSurface",
      entityKey: "task",
    });
    const schema = serializeSchemaBuilderDraft(draft);
    const surface = findSchemaBuilderGeneratedSurface(schema, "task");

    expect(surface).toEqual({
      queryKey: "taskAll2",
      itemViewKey: "taskItem",
      createViewKey: "taskCreate2",
      collectionViewKey: "taskHome2",
      screenKey: "taskScreen",
    });
    expect(schema.screens?.taskScreen?.path).toBe("/task");
    expect(schema.views.taskHome).toEqual(sourceLikeTaskSchema().views.taskHome);
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
    const original = sourceLikeSiteSchema();
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
  });

  it("updates builder-owned field presentation with valid editors and derived commit policy", () => {
    const draft = applyIntents(
      createSchemaBuilderDraft(sourceLikeTaskSchema()),
      { type: "createEntity", key: "article", label: "Article" },
      {
        type: "addField",
        entityKey: "article",
        fieldKey: "body",
        fieldType: "text",
        metadata: { format: "markdown" },
      },
      {
        type: "updateFieldPresentation",
        entityKey: "article",
        fieldKey: "body",
        createEditor: "textarea",
        inlineEditor: "markdown",
      },
    );
    const schema = serializeSchemaBuilderDraft(draft);
    const surface = findSchemaBuilderGeneratedSurface(schema, "article");
    const projection = projectSchemaBuilderDraft(draft);
    const bodyProjection = projection.entities
      .find((entity) => entity.key === "article")
      ?.fields.find((field) => field.key === "body");

    expect(surface).toBeDefined();
    expect(schema.views[surface?.createViewKey ?? ""]).toMatchObject({
      type: "create",
      fields: { body: { editor: "textarea" } },
    });
    expect(schema.itemViews[surface?.itemViewKey ?? ""]?.fields.body).toEqual({
      editor: "markdown",
      commit: "field-commit",
    });
    expect(bodyProjection?.presentation).toMatchObject({
      createEditor: "textarea",
      inlineEditor: "markdown",
      defaultCommit: "field-commit",
      rendererKind: "markdown",
    });
    expect(bodyProjection?.presentation.validEditors).toContain("media");
  });

  it("resets builder-owned surface editors when a draft field type changes", () => {
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
    const surface = findSchemaBuilderGeneratedSurface(schema, "project");
    const projection = projectSchemaBuilderDraft(draft);
    const estimateProjection = projection.entities
      .find((entity) => entity.key === "project")
      ?.fields.find((field) => field.key === "estimate");

    expect(schema.entities.project?.fields.estimate).toMatchObject({
      type: "number",
      default: 1,
    });
    expect(schema.views[surface?.createViewKey ?? ""]).toMatchObject({
      type: "create",
      fields: { estimate: { editor: "number" } },
    });
    expect(schema.itemViews[surface?.itemViewKey ?? ""]?.fields.estimate).toEqual({
      editor: "number",
      commit: "field-commit",
    });
    expect(estimateProjection?.presentation).toMatchObject({
      createEditor: "number",
      inlineEditor: "number",
      rendererKind: "number",
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
