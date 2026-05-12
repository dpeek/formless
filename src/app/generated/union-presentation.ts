import type {
  CreateDefaultConfig,
  CreateFieldConfig,
  CreateUnionPresentationConfig,
  RecordVariantContextLinkPresentationConfig,
  RecordFieldConfig,
  RecordUnionPresentationConfig,
} from "../../client/views.ts";
import {
  initialCreateDiscriminatorValue as initialCreateDiscriminatorValuePrimitive,
  selectCreateFieldsForDiscriminator as selectCreateFieldsForDiscriminatorPrimitive,
  selectCreateFieldsForFormData as selectCreateFieldsForFormDataPrimitive,
} from "../../shared/create-defaults.ts";
import type { FieldValue, StoredRecord } from "../../shared/protocol.ts";

type ActiveRecordUnionPresentation =
  | RecordUnionPresentationConfig["variants"][number]
  | NonNullable<RecordUnionPresentationConfig["fallback"]>;

export function selectRecordFieldsForActiveUnion(
  baseFields: RecordFieldConfig[],
  union: RecordUnionPresentationConfig | undefined,
  record: StoredRecord | undefined,
): RecordFieldConfig[] {
  const presentation = selectActiveRecordUnionPresentation(union, record);

  if (presentation?.presentation.type !== "fields") {
    return baseFields;
  }

  return appendNewFields(baseFields, presentation.presentation.fields);
}

export function selectRecordContextLinkForActiveUnion(
  union: RecordUnionPresentationConfig | undefined,
  record: StoredRecord | undefined,
): RecordVariantContextLinkPresentationConfig | undefined {
  const presentation = selectActiveRecordUnionPresentation(union, record);

  return presentation?.presentation.type === "contextLink" ? presentation.presentation : undefined;
}

export function selectCreateFieldsForDiscriminator(
  baseFields: CreateFieldConfig[],
  union: CreateUnionPresentationConfig | undefined,
  discriminatorValue: string | undefined,
): CreateFieldConfig[] {
  return selectCreateFieldsForDiscriminatorPrimitive(baseFields, union, discriminatorValue);
}

export function selectCreateFieldsForFormData(
  baseFields: CreateFieldConfig[],
  union: CreateUnionPresentationConfig | undefined,
  formData: FormData,
  defaults: CreateDefaultConfig[] = [],
): CreateFieldConfig[] {
  return selectCreateFieldsForFormDataPrimitive(baseFields, union, formData, defaults);
}

export function initialCreateDiscriminatorValue(
  union: CreateUnionPresentationConfig | undefined,
  defaults: CreateDefaultConfig[] = [],
): string | undefined {
  return initialCreateDiscriminatorValuePrimitive(union, defaults);
}

function selectActiveRecordUnionPresentation(
  union: RecordUnionPresentationConfig | undefined,
  record: StoredRecord | undefined,
): ActiveRecordUnionPresentation | undefined {
  if (union === undefined || record === undefined) {
    return undefined;
  }

  const discriminatorValue = stringValue(record.values[union.discriminatorFieldName]);

  return (
    union.variants.find((variant) => variant.variantValue === discriminatorValue) ?? union.fallback
  );
}

function appendNewFields<TField extends { fieldName: string }>(
  baseFields: TField[],
  variantFields: TField[],
): TField[] {
  const fieldNames = new Set(baseFields.map((field) => field.fieldName));
  const newFields = variantFields.filter((field) => !fieldNames.has(field.fieldName));

  return newFields.length === 0 ? baseFields : [...baseFields, ...newFields];
}

function stringValue(value: FieldValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
