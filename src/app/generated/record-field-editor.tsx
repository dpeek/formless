import { useEffect, useState } from "react";
import {
  listCoreImageMediaAssets,
  uploadCoreImageMediaFile,
  type ImageMediaAssetOption,
} from "@dpeek/formless-media/client";
import { useRecord, useSchema } from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import { submitPatchMutation } from "../../client/sync.ts";
import type { RecordFieldConfig } from "../../client/views.ts";
import type { FieldValue, RecordValues } from "../../shared/protocol.ts";
import { GeneratedRecordFieldControl } from "./record-field-control.tsx";
import {
  fieldValueToRecordFieldEditorInputValue,
  imageMediaAssetOptionFromUpload,
  selectGeneratedIconDialogDraft,
  selectGeneratedRecordFieldDraftValues,
  selectGeneratedRecordFieldMediaAuthoring,
  selectGeneratedRecordFieldPatchValues,
  siteImageUploadPatchValues,
  upsertMediaAssetOption,
} from "./record-field-authoring.ts";
import { inputValueToFieldValue } from "./format.ts";
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
  const initialDraftValues = selectGeneratedRecordFieldDraftValues({
    fieldConfig,
    numberFormat,
    recordValue,
    unitRecordValue,
  });
  const [draft, setDraft] = useState(() => initialDraftValues.draft);
  const [iconDialogOpen, setIconDialogOpen] = useState(false);
  const [iconDialogDraft, setIconDialogDraft] = useState(() => initialDraftValues.draft);
  const [unitDraft, setUnitDraft] = useState(() => initialDraftValues.unitDraft);
  const [mediaAssetOptions, setMediaAssetOptions] = useState<ImageMediaAssetOption[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaAuthoring = selectGeneratedRecordFieldMediaAuthoring({
    draft,
    entityName,
    fieldConfig,
    mediaAssetOptions,
    schema,
  });
  const { mediaEditorMode } = mediaAuthoring;

  useEffect(() => {
    const nextDraft = fieldValueToRecordFieldEditorInputValue(field, recordValue, numberFormat);

    setDraft(nextDraft);

    if (!iconDialogOpen) {
      setIconDialogDraft(nextDraft);
    }
  }, [field, numberFormat, recordValue]);

  useEffect(() => {
    setUnitDraft(
      selectGeneratedRecordFieldDraftValues({
        fieldConfig,
        numberFormat,
        recordValue,
        unitRecordValue,
      }).unitDraft,
    );
  }, [fieldConfig, numberFormat, recordValue, unitRecordValue]);

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

    const patchValues = selectGeneratedRecordFieldPatchValues({
      currentValues: record?.values,
      values,
    });

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
      const resetDraftValues = selectGeneratedRecordFieldDraftValues({
        fieldConfig,
        numberFormat,
        recordValue,
        unitRecordValue,
      });

      setDraft(resetDraftValues.draft);
      setUnitDraft(resetDraftValues.unitDraft);
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

  async function commit(value: FieldValue): Promise<boolean> {
    return commitPatch({ [fieldName]: value });
  }

  function revertDraftToRecordValue() {
    setDraft(fieldValueToRecordFieldEditorInputValue(field, recordValue, numberFormat));
  }

  function revertUnitDraftToRecordValue() {
    setUnitDraft(
      selectGeneratedRecordFieldDraftValues({
        fieldConfig,
        numberFormat,
        recordValue,
        unitRecordValue,
      }).unitDraft,
    );
  }

  function cancelIconEdit() {
    setIconDialogDraft(fieldValueToRecordFieldEditorInputValue(field, recordValue, numberFormat));
    setIconDialogOpen(false);
  }

  function handleIconOpenChange(open: boolean) {
    setIconDialogDraft(
      selectGeneratedIconDialogDraft({
        draft,
        open,
        recordDraft: fieldValueToRecordFieldEditorInputValue(field, recordValue, numberFormat),
      }),
    );
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
      const saved = await commitPatch(
        siteImageUploadPatchValues({
          ...mediaAuthoring.uploadPatchFields,
          upload,
        }),
        { allowWhilePending: true, managePending: false },
      );

      if (saved) {
        const uploadedOption = imageMediaAssetOptionFromUpload(upload);

        if (mediaEditorMode === "asset" && uploadedOption) {
          setDraft(uploadedOption.id);
          setMediaAssetOptions((current) => upsertMediaAssetOption(current, uploadedOption));
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
      mediaPreviewHref={mediaAuthoring.mediaPreviewHref}
      uploadEnabled={mediaAuthoring.uploadEnabled}
    />
  );
}
