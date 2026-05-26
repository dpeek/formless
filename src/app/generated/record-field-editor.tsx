import { useEffect, useState } from "react";
import {
  coreImageMediaAssetOptionForId,
  listCoreImageMediaAssets,
  siteImageUploadPatchValues,
  uploadCoreImageMediaFile,
  type ImageMediaAssetOption,
} from "../../client/media.ts";
import { useRecord, useSchema } from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import { submitPatchMutation } from "../../client/sync.ts";
import type { RecordFieldConfig } from "../../client/views.ts";
import type { FieldValue, RecordValues } from "../../shared/protocol.ts";
import type { AppSchema, FieldSchema } from "../../shared/schema.ts";
import { GeneratedRecordFieldControl } from "./record-field-control.tsx";
import {
  encodeNumberEditorInputValue,
  fieldValueToInputValue,
  inputValueToFieldValue,
} from "./format.ts";
import { useSchemaAppTarget } from "./schema-app-context.tsx";

export function RecordFieldEditor({
  canPatch,
  density = "default",
  entityName,
  fieldConfig,
  presentation = "default",
  recordId,
  showLabel = false,
}: {
  canPatch: boolean;
  density?: "default" | "compact";
  entityName: string;
  fieldConfig: RecordFieldConfig;
  presentation?: "default" | "heading";
  recordId: string;
  showLabel?: boolean;
}) {
  const appTarget = useSchemaAppTarget();
  const { field, fieldName } = fieldConfig;
  const schema = useSchema();
  const numberFormat = fieldConfig.format ?? "plain";
  const record = useRecord(recordId);
  const recordValue = record?.values[fieldName];
  const valueUnitConfig = fieldConfig.valueUnit;
  const unitRecordValue =
    valueUnitConfig === undefined ? undefined : record?.values[valueUnitConfig.unitFieldName];
  const [draft, setDraft] = useState(() =>
    fieldValueToEditorInputValue(field, recordValue, numberFormat),
  );
  const [iconDialogOpen, setIconDialogOpen] = useState(false);
  const [iconDialogDraft, setIconDialogDraft] = useState(() =>
    fieldValueToEditorInputValue(field, recordValue, numberFormat),
  );
  const [unitDraft, setUnitDraft] = useState(() =>
    valueUnitConfig ? fieldValueToInputValue(valueUnitConfig.unitField, unitRecordValue) : "",
  );
  const [mediaAssetOptions, setMediaAssetOptions] = useState<ImageMediaAssetOption[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaEditorMode = mediaEditorModeForField(fieldConfig);
  const mediaPreview =
    mediaEditorMode === "asset" && draft !== ""
      ? (mediaAssetOptions.find((asset) => asset.id === draft) ??
        coreImageMediaAssetOptionForId(draft))
      : undefined;

  useEffect(() => {
    const nextDraft = fieldValueToEditorInputValue(field, recordValue, numberFormat);

    setDraft(nextDraft);

    if (!iconDialogOpen) {
      setIconDialogDraft(nextDraft);
    }
  }, [field, numberFormat, recordValue]);

  useEffect(() => {
    setUnitDraft(
      valueUnitConfig ? fieldValueToInputValue(valueUnitConfig.unitField, unitRecordValue) : "",
    );
  }, [unitRecordValue, valueUnitConfig]);

  useEffect(() => {
    let cancelled = false;

    if (mediaEditorMode !== "asset") {
      setMediaAssetOptions([]);
      return;
    }

    void listCoreImageMediaAssets()
      .then((assets) => {
        if (!cancelled) {
          setMediaAssetOptions(assets);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMediaAssetOptions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mediaEditorMode]);

  async function commitPatch(
    values: Partial<RecordValues>,
    options: { allowWhilePending?: boolean; managePending?: boolean } = {},
  ): Promise<boolean> {
    const managePending = options.managePending ?? true;

    if (!canPatch || (isPending && !options.allowWhilePending)) {
      return false;
    }

    const patchValues: Partial<RecordValues> = {};

    for (const [patchFieldName, value] of Object.entries(values)) {
      const currentValue = currentValueForPatchField(patchFieldName);

      if (currentValue === value || (currentValue === undefined && value === "")) {
        continue;
      }

      patchValues[patchFieldName] = value;
    }

    const patchFieldNames = Object.keys(patchValues);

    if (patchFieldNames.length === 0) {
      return true;
    }

    if (managePending) {
      setIsPending(true);
    }

    setSyncStatus({ state: "syncing", message: `Updating ${patchFieldNames.join(", ")}...` });

    try {
      await submitPatchMutation(appTarget, entityName, recordId, patchValues);
      setError(null);
      setSyncStatus({ state: "idle", message: "Updated and synced." });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed.";

      setDraft(fieldValueToEditorInputValue(field, recordValue, numberFormat));
      setUnitDraft(
        valueUnitConfig ? fieldValueToInputValue(valueUnitConfig.unitField, unitRecordValue) : "",
      );
      setError(message);
      setSyncStatus({
        state: "error",
        message,
      });
      return false;
    } finally {
      if (managePending) {
        setIsPending(false);
      }
    }
  }

  function currentValueForPatchField(patchFieldName: string) {
    return record?.values[patchFieldName];
  }

  async function commit(value: FieldValue): Promise<boolean> {
    return commitPatch({ [fieldName]: value });
  }

  function revertDraftToRecordValue() {
    setDraft(fieldValueToEditorInputValue(field, recordValue, numberFormat));
  }

  function revertUnitDraftToRecordValue() {
    setUnitDraft(
      valueUnitConfig ? fieldValueToInputValue(valueUnitConfig.unitField, unitRecordValue) : "",
    );
  }

  function cancelIconEdit() {
    setIconDialogDraft(fieldValueToEditorInputValue(field, recordValue, numberFormat));
    setIconDialogOpen(false);
  }

  function handleIconOpenChange(open: boolean) {
    if (open) {
      setIconDialogDraft(draft);
    } else {
      setIconDialogDraft(fieldValueToEditorInputValue(field, recordValue, numberFormat));
    }

    setIconDialogOpen(open);
  }

  async function handleIconSave() {
    const saved = await commit(inputValueToFieldValue(field, iconDialogDraft));

    if (saved) {
      setDraft(iconDialogDraft);
      setIconDialogOpen(false);
    }
  }

  async function handleImageUpload(file: File | undefined) {
    if (!file || !canPatch || isPending) {
      return;
    }

    if (mediaEditorMode !== "asset") {
      const message = "Image upload is only available for media asset fields.";

      setError(message);
      setSyncStatus({ state: "error", message });
      return;
    }

    setIsPending(true);
    setError(null);
    setSyncStatus({ state: "syncing", message: "Uploading image..." });

    try {
      const upload = await uploadCoreImageMediaFile(file);
      const uploadFields = selectMediaAssetUploadPatchFields(schema, entityName, fieldName);
      const saved = await commitPatch(
        siteImageUploadPatchValues({
          ...uploadFields,
          upload,
        }),
        { allowWhilePending: true, managePending: false },
      );

      if (saved) {
        const mediaAssetId = upload.assetId ?? upload.asset?.id;

        if (mediaEditorMode === "asset" && mediaAssetId) {
          const uploadedHeight = upload.asset?.height ?? upload.dimensions?.height;
          const uploadedWidth = upload.asset?.width ?? upload.dimensions?.width;

          setDraft(mediaAssetId);
          setMediaAssetOptions((current) =>
            upsertMediaAssetOption(current, {
              ...(uploadedHeight === undefined ? {} : { height: uploadedHeight }),
              href: upload.asset?.deliveryHref ?? upload.href,
              id: mediaAssetId,
              label: upload.asset?.label ?? mediaAssetId,
              ...(uploadedWidth === undefined ? {} : { width: uploadedWidth }),
            }),
          );
        } else {
          setDraft(upload.href);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image upload failed.";

      setError(message);
      setSyncStatus({ state: "error", message });
    } finally {
      setIsPending(false);
    }
  }

  async function handleMediaAssetSelect(assetId: string) {
    if (mediaEditorMode !== "asset") {
      return;
    }

    setDraft(assetId);
    await commit(assetId);
  }

  return (
    <GeneratedRecordFieldControl
      canPatch={canPatch}
      density={density}
      draft={draft}
      error={error}
      fieldConfig={fieldConfig}
      iconDialogDraft={iconDialogDraft}
      iconDialogOpen={iconDialogOpen}
      isPending={isPending}
      numberFormat={numberFormat}
      onDraftChange={setDraft}
      onDraftRevert={revertDraftToRecordValue}
      onErrorChange={setError}
      onIconCancel={cancelIconEdit}
      onIconDraftChange={setIconDialogDraft}
      onIconOpenChange={handleIconOpenChange}
      onIconSave={handleIconSave}
      onImageFileSelect={(file) => void handleImageUpload(file)}
      onMediaAssetSelect={(assetId) => void handleMediaAssetSelect(assetId)}
      onPatchValues={(values) => {
        void commitPatch(values);
      }}
      onUnitDraftChange={setUnitDraft}
      onUnitDraftRevert={revertUnitDraftToRecordValue}
      onValueCommit={(value) => {
        void commit(value);
      }}
      presentation={presentation}
      recordValue={recordValue}
      showLabel={showLabel}
      unitDraft={unitDraft}
      mediaAssetOptions={mediaAssetOptions}
      mediaEditorMode={mediaEditorMode}
      mediaPreviewHref={mediaPreview?.href}
      uploadEnabled={mediaEditorMode === "asset"}
    />
  );
}

function mediaEditorModeForField(fieldConfig: RecordFieldConfig): "asset" | "url" {
  return fieldConfig.editor === "media" && fieldConfig.fieldName !== "href" ? "asset" : "url";
}

function selectMediaAssetUploadPatchFields(
  schema: AppSchema | null,
  entityName: string,
  fieldName: string,
): {
  heightFieldName?: string;
  mediaAssetFieldName?: string;
  widthFieldName?: string;
} {
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

function upsertMediaAssetOption(
  options: ImageMediaAssetOption[],
  option: ImageMediaAssetOption,
): ImageMediaAssetOption[] {
  return [option, ...options.filter((candidate) => candidate.id !== option.id)].sort(
    (left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id),
  );
}

function fieldValueToEditorInputValue(
  field: FieldSchema,
  value: FieldValue | undefined,
  format: "plain" | "number" | "currency" | "percent",
) {
  if (field.type === "number" && typeof value === "number") {
    return encodeNumberEditorInputValue(value, format);
  }

  return fieldValueToInputValue(field, value);
}
