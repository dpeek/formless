import type {
  CreateDefaultConfig,
  CreateFieldConfig,
  CreateUnionPresentationConfig,
  RecordVariantContextLinkPresentationConfig,
  RecordFieldConfig,
  RecordUnionPresentationConfig,
} from "../../client/views.ts";
import type { FieldValue, StoredRecord } from "../../shared/protocol.ts";

type ActiveRecordUnionPresentation =
  | RecordUnionPresentationConfig["variants"][number]
  | NonNullable<RecordUnionPresentationConfig["fallback"]>;

type ActiveCreateUnionPresentation =
  | CreateUnionPresentationConfig["variants"][number]
  | NonNullable<CreateUnionPresentationConfig["fallback"]>;

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
  const presentation = selectActiveCreateUnionPresentation(union, discriminatorValue);

  if (presentation === undefined) {
    return baseFields;
  }

  return appendNewFields(baseFields, presentation.presentation.fields);
}

export function selectCreateFieldsForFormData(
  baseFields: CreateFieldConfig[],
  union: CreateUnionPresentationConfig | undefined,
  formData: FormData,
  defaults: CreateDefaultConfig[] = [],
): CreateFieldConfig[] {
  if (union === undefined) {
    return baseFields;
  }

  const formValue = formData.get(union.discriminatorFieldName);
  const discriminatorValue =
    typeof formValue === "string" ? formValue : initialCreateDiscriminatorValue(union, defaults);

  return selectCreateFieldsForDiscriminator(baseFields, union, discriminatorValue);
}

export function initialCreateDiscriminatorValue(
  union: CreateUnionPresentationConfig | undefined,
  defaults: CreateDefaultConfig[] = [],
): string | undefined {
  if (union === undefined) {
    return undefined;
  }

  const defaultConfig = defaults.find(
    (candidate) => candidate.fieldName === union.discriminatorFieldName,
  );

  if (defaultConfig?.value.kind === "literal" && typeof defaultConfig.value.value === "string") {
    return defaultConfig.value.value;
  }

  return (
    union.discriminatorField.default ??
    (union.discriminatorField.required ? Object.keys(union.discriminatorField.values)[0] : "")
  );
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

function selectActiveCreateUnionPresentation(
  union: CreateUnionPresentationConfig | undefined,
  discriminatorValue: string | undefined,
): ActiveCreateUnionPresentation | undefined {
  if (union === undefined) {
    return undefined;
  }

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
