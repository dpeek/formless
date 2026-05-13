import type {
  AppSchema,
  CreateViewSchema,
  CreateViewVariantPresentationSchema,
  EditViewSchema,
  EditViewVariantPresentationSchema,
  EntitySchema,
  EntityUnionSchema,
  FieldSchema,
  ItemViewSchema,
  ItemViewVariantPresentationSchema,
} from "../shared/schema.ts";
import type {
  CreateFallbackPresentationConfig,
  CreateUnionPresentationConfig,
  CreateVariantPresentationConfig,
  RecordFallbackPresentationConfig,
  RecordUnionPresentationConfig,
  RecordVariantPresentationConfig,
} from "./views.ts";

type RecordUnionViewSchema = ItemViewSchema | EditViewSchema;

export function selectRecordUnionPresentation(
  schema: AppSchema,
  view: RecordUnionViewSchema,
  entity: EntitySchema,
): RecordUnionPresentationConfig | undefined {
  if (view.union === undefined) {
    return undefined;
  }

  const union = schema.unions?.[view.union];

  if (!union) {
    throw new Error(`Missing union "${view.union}".`);
  }

  return {
    ...selectUnionBaseConfig(view.union, union, entity),
    variants: Object.entries(view.variants).map(([variantValue, presentation]) =>
      selectRecordVariantPresentationConfig(entity, union, variantValue, presentation),
    ),
    ...(view.fallback === undefined
      ? {}
      : {
          fallback: selectRecordFallbackPresentationConfig(entity, union, view.fallback),
        }),
  };
}

export function selectCreateUnionPresentation(
  schema: AppSchema,
  view: CreateViewSchema,
  entity: EntitySchema,
): CreateUnionPresentationConfig | undefined {
  if (view.union === undefined) {
    return undefined;
  }

  const union = schema.unions?.[view.union];

  if (!union) {
    throw new Error(`Missing union "${view.union}".`);
  }

  return {
    ...selectUnionBaseConfig(view.union, union, entity),
    variants: Object.entries(view.variants).map(([variantValue, presentation]) =>
      selectCreateVariantPresentationConfig(entity, union, variantValue, presentation),
    ),
    ...(view.fallback === undefined
      ? {}
      : {
          fallback: selectCreateFallbackPresentationConfig(entity, union, view.fallback),
        }),
  };
}

function selectUnionBaseConfig(unionName: string, union: EntityUnionSchema, entity: EntitySchema) {
  const discriminatorField = entity.fields[union.discriminator];

  if (discriminatorField?.type !== "enum") {
    throw new Error(`Missing union discriminator field "${union.discriminator}".`);
  }

  return {
    unionName,
    union,
    discriminatorFieldName: union.discriminator,
    discriminatorField,
  };
}

function selectRecordVariantPresentationConfig(
  entity: EntitySchema,
  union: EntityUnionSchema,
  variantValue: string,
  presentation: ItemViewVariantPresentationSchema | EditViewVariantPresentationSchema,
): RecordVariantPresentationConfig {
  const unionVariant = union.variants[variantValue];

  if (!unionVariant) {
    throw new Error(`Missing union variant "${variantValue}".`);
  }

  return {
    variantValue,
    label: unionVariant.label,
    unionVariant,
    presentation: selectRecordVariantPresentation(entity, presentation),
  };
}

function selectRecordFallbackPresentationConfig(
  entity: EntitySchema,
  union: EntityUnionSchema,
  presentation: ItemViewVariantPresentationSchema | EditViewVariantPresentationSchema,
): RecordFallbackPresentationConfig {
  return {
    label: union.fallback?.label ?? "Fallback",
    ...(union.fallback === undefined ? {} : { unionVariant: union.fallback }),
    presentation: selectRecordVariantPresentation(entity, presentation),
  };
}

function selectRecordVariantPresentation(
  entity: EntitySchema,
  presentation: ItemViewVariantPresentationSchema | EditViewVariantPresentationSchema,
): RecordVariantPresentationConfig["presentation"] {
  if (presentation.presentation === "contextLink") {
    return {
      type: "contextLink",
      labelFieldName: presentation.labelField,
      labelField: entity.fields[presentation.labelField] as FieldSchema,
      target: {
        kind: presentation.target.kind,
        contextName: presentation.target.context,
        record: presentation.target.record,
      },
    };
  }

  return {
    type: "fields",
    fields: Object.entries(presentation.fields).map(([fieldName, viewField]) => ({
      fieldName,
      field: entity.fields[fieldName] as FieldSchema,
      editor: viewField.editor,
      commit: viewField.commit,
      ...(viewField.visibleWhen === undefined ? {} : { visibleWhen: viewField.visibleWhen }),
    })),
  };
}

function selectCreateVariantPresentationConfig(
  entity: EntitySchema,
  union: EntityUnionSchema,
  variantValue: string,
  presentation: CreateViewVariantPresentationSchema,
): CreateVariantPresentationConfig {
  const unionVariant = union.variants[variantValue];

  if (!unionVariant) {
    throw new Error(`Missing union variant "${variantValue}".`);
  }

  return {
    variantValue,
    label: unionVariant.label,
    unionVariant,
    presentation: selectCreateVariantPresentation(entity, presentation),
  };
}

function selectCreateFallbackPresentationConfig(
  entity: EntitySchema,
  union: EntityUnionSchema,
  presentation: CreateViewVariantPresentationSchema,
): CreateFallbackPresentationConfig {
  return {
    label: union.fallback?.label ?? "Fallback",
    ...(union.fallback === undefined ? {} : { unionVariant: union.fallback }),
    presentation: selectCreateVariantPresentation(entity, presentation),
  };
}

function selectCreateVariantPresentation(
  entity: EntitySchema,
  presentation: CreateViewVariantPresentationSchema,
): CreateVariantPresentationConfig["presentation"] {
  return {
    type: "fields",
    fields: Object.entries(presentation.fields).map(([fieldName, viewField]) => ({
      fieldName,
      field: entity.fields[fieldName] as FieldSchema,
      editor: viewField.editor,
      ...(viewField.visibleWhen === undefined ? {} : { visibleWhen: viewField.visibleWhen }),
    })),
  };
}
