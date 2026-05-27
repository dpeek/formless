import type { ImageMediaAssetOption, UploadedImageMedia } from "../../client/media.ts";
import { coreImageMediaAssetOptionForId } from "../../client/media.ts";
import type { RecordFieldConfig } from "../../client/views.ts";
import type { FieldValue, RecordValues } from "../../shared/protocol.ts";
import type { AppSchema, FieldSchema, TableColumnFormat } from "../../shared/schema.ts";
import {
  decodeNumberEditorInputValue,
  encodeNumberEditorInputValue,
  fieldValueToInputValue,
  inputValueToFieldValue,
} from "./format.ts";

export type GeneratedRecordFieldMediaEditorMode = "asset" | "url";

export type GeneratedRecordFieldEditability = {
  canEdit: boolean;
  controlDisabled: boolean;
  uploadDisabled: boolean;
};

export type GeneratedRecordFieldDraftValues = {
  draft: string;
  unitDraft: string;
};

export type GeneratedRecordFieldMediaAuthoring = {
  mediaEditorMode: GeneratedRecordFieldMediaEditorMode;
  mediaPreviewHref?: string;
  uploadEnabled: boolean;
  uploadPatchFields: GeneratedRecordFieldMediaUploadPatchFields;
};

export type GeneratedRecordFieldMediaUploadPatchFields = {
  heightFieldName?: string;
  mediaAssetFieldName?: string;
  widthFieldName?: string;
};

export function selectGeneratedRecordFieldDraftValues({
  fieldConfig,
  numberFormat,
  recordValue,
  unitRecordValue,
}: {
  fieldConfig: RecordFieldConfig;
  numberFormat: TableColumnFormat;
  recordValue: FieldValue | undefined;
  unitRecordValue: FieldValue | undefined;
}): GeneratedRecordFieldDraftValues {
  return {
    draft: fieldValueToRecordFieldEditorInputValue(fieldConfig.field, recordValue, numberFormat),
    unitDraft:
      fieldConfig.valueUnit === undefined
        ? ""
        : fieldValueToInputValue(fieldConfig.valueUnit.unitField, unitRecordValue),
  };
}

export function fieldValueToRecordFieldEditorInputValue(
  field: FieldSchema,
  value: FieldValue | undefined,
  format: TableColumnFormat,
) {
  if (field.type === "number" && typeof value === "number") {
    return encodeNumberEditorInputValue(value, format);
  }

  return fieldValueToInputValue(field, value);
}

export function selectGeneratedRecordFieldPatchValues({
  currentValues,
  values,
}: {
  currentValues: RecordValues | undefined;
  values: Partial<RecordValues>;
}): Partial<RecordValues> {
  const patchValues: Partial<RecordValues> = {};

  for (const [fieldName, value] of Object.entries(values)) {
    const currentValue = currentValues?.[fieldName];

    if (currentValue === value || (currentValue === undefined && value === "")) {
      continue;
    }

    patchValues[fieldName] = value;
  }

  return patchValues;
}

export function selectGeneratedIconDialogDraft({
  draft,
  open,
  recordDraft,
}: {
  draft: string;
  open: boolean;
  recordDraft: string;
}) {
  return open ? draft : recordDraft;
}

export function selectGeneratedRecordFieldEditability({
  canPatch,
  isPending,
  uploadEnabled = true,
}: {
  canPatch: boolean;
  isPending: boolean;
  uploadEnabled?: boolean;
}): GeneratedRecordFieldEditability {
  const controlDisabled = !canPatch || isPending;

  return {
    canEdit: !controlDisabled,
    controlDisabled,
    uploadDisabled: controlDisabled || !uploadEnabled,
  };
}

export function selectGeneratedRecordFieldMediaAuthoring({
  draft,
  entityName,
  fieldConfig,
  mediaAssetOptions,
  schema,
}: {
  draft: string;
  entityName: string;
  fieldConfig: RecordFieldConfig;
  mediaAssetOptions: ImageMediaAssetOption[];
  schema: AppSchema | null;
}): GeneratedRecordFieldMediaAuthoring {
  const mediaEditorMode = mediaEditorModeForRecordField(fieldConfig);
  const mediaPreview =
    mediaEditorMode === "asset" && draft !== ""
      ? (mediaAssetOptions.find((asset) => asset.id === draft) ??
        coreImageMediaAssetOptionForId(draft))
      : undefined;

  return {
    mediaEditorMode,
    mediaPreviewHref: mediaPreview?.href,
    uploadEnabled: mediaEditorMode === "asset",
    uploadPatchFields:
      mediaEditorMode === "asset"
        ? selectMediaAssetUploadPatchFields(schema, entityName, fieldConfig.fieldName)
        : {},
  };
}

export function mediaEditorModeForRecordField(
  fieldConfig: RecordFieldConfig,
): GeneratedRecordFieldMediaEditorMode {
  return fieldConfig.editor === "media" && fieldConfig.fieldName !== "href" ? "asset" : "url";
}

export function selectMediaAssetUploadPatchFields(
  schema: AppSchema | null,
  entityName: string,
  fieldName: string,
): GeneratedRecordFieldMediaUploadPatchFields {
  const fields = schema?.entities[entityName]?.fields;

  if (fields?.width?.type === "number" && fields.height?.type === "number") {
    return {
      heightFieldName: "height",
      mediaAssetFieldName: fieldName,
      widthFieldName: "width",
    };
  }

  return { mediaAssetFieldName: fieldName };
}

export function imageMediaAssetOptionFromUpload(
  upload: UploadedImageMedia,
): ImageMediaAssetOption | undefined {
  const mediaAssetId = upload.assetId ?? upload.asset?.id;

  if (!mediaAssetId) {
    return undefined;
  }

  const uploadedHeight = upload.asset?.height ?? upload.dimensions?.height;
  const uploadedWidth = upload.asset?.width ?? upload.dimensions?.width;

  return {
    ...(uploadedHeight === undefined ? {} : { height: uploadedHeight }),
    href: upload.asset?.deliveryHref ?? upload.href,
    id: mediaAssetId,
    label: upload.asset?.label ?? mediaAssetId,
    ...(uploadedWidth === undefined ? {} : { width: uploadedWidth }),
  };
}

export function upsertMediaAssetOption(
  options: ImageMediaAssetOption[],
  option: ImageMediaAssetOption,
): ImageMediaAssetOption[] {
  return [option, ...options.filter((candidate) => candidate.id !== option.id)].sort(
    (left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id),
  );
}

export function selectValueUnitRecordPatchValues({
  draft,
  fieldName,
  numberFormat,
  unit,
  valueUnitConfig,
}: {
  draft: string;
  fieldName: string;
  numberFormat: TableColumnFormat;
  unit: string;
  valueUnitConfig: NonNullable<RecordFieldConfig["valueUnit"]>;
}): Partial<RecordValues> {
  const patch: Partial<RecordValues> = {
    [valueUnitConfig.unitFieldName]: inputValueToFieldValue(valueUnitConfig.unitField, unit),
  };
  const amount = decodeNumberEditorInputValue(draft, numberFormat);

  if (amount.kind === "valid") {
    patch[fieldName] = amount.value;
  }

  return patch;
}
