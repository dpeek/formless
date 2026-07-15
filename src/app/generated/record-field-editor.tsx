import { useEffect, useState } from "react";
import {
  listCoreImageMediaAssets,
  uploadCoreImageMediaFile,
  type ImageMediaAssetOption,
} from "@dpeek/formless-media/client";
import { useRecord, useSchema } from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import { submitOperation } from "../../client/sync.ts";
import type { EntityOperationPresentationConfig } from "../../client/operation-presentation-model.ts";
import {
  fieldLabel,
  recordFieldIsWritable,
  type RecordFieldConfig,
  type RecordUnionPresentationConfig,
} from "../../client/views.ts";
import type { FieldValue, RecordValues } from "@dpeek/formless-storage";
import { GeneratedRecordFieldControl } from "./record-field-control.tsx";
import { RecordFieldDisplay } from "./record-field-display.tsx";
import { LegacyRecordFieldAdapter } from "./legacy-record-field-adapter.tsx";
import { projectGeneratedRecordFormlessUiField } from "./formless-ui-projection.ts";
import {
  fieldValueToRecordFieldEditorInputValue,
  generatedRecordFieldEditorDraftFromUpdateDraftInput,
  generatedRecordFieldUsesUpdateDraftResolver,
  generatedUpdateDraftInputFromEditorDraft,
  generatedUpdateDraftInputFromFieldValue,
  imageMediaAssetOptionFromUpload,
  resolveGeneratedMediaUploadUpdateDraftPatchValues,
  resolveGeneratedUpdateDraftPatchValues,
  resolveGeneratedValueUnitUpdateDraftPatchValues,
  selectGeneratedIconDialogDraft,
  selectGeneratedRecordFieldDraftValues,
  selectGeneratedRecordFieldMediaAuthoring,
  selectGeneratedRecordFieldPatchValues,
  type GeneratedRecordValueUnitDraftCommit,
  type GeneratedUpdateDraftInput,
  type GeneratedUpdateDraftFieldInput,
  type GeneratedUpdateDraftResolution,
  upsertMediaAssetOption,
} from "./record-field-authoring.ts";
import { inputValueToFieldValue } from "./format.ts";
import { useSchemaAppTarget, useSchemaAppWriteOptions } from "./schema-app-context.tsx";
import { StateMachineStateBadge } from "./state-machine-ui.tsx";

type RecordFieldEditorProps = {
  density?: "default" | "compact";
  draftInput?: GeneratedUpdateDraftFieldInput;
  entityName: string;
  fieldConfig: RecordFieldConfig;
  onDraftInputChange?: (
    fieldName: string,
    draftInput: GeneratedUpdateDraftFieldInput | undefined,
  ) => void;
  presentation?: "default" | "heading";
  recordId: string;
  showLabel?: boolean;
  updateDraftContext?: RecordFieldUpdateDraftContext;
  updateOperation?: EntityOperationPresentationConfig;
};

type RecordFieldUpdateDraftContext = {
  baselineValues: RecordValues;
  draft: GeneratedUpdateDraftInput;
  fields: RecordFieldConfig[];
  union?: RecordUnionPresentationConfig;
};

type CommitPatchOptions = {
  allowWhilePending?: boolean;
  autoSaveSource?: "media-reference";
  managePending?: boolean;
};

export function RecordFieldEditor(props: RecordFieldEditorProps) {
  if (!recordFieldIsWritable(props.fieldConfig)) {
    return <ReadOnlyRecordFieldDisplay {...props} />;
  }

  if (props.fieldConfig.field.type === "enum" && props.fieldConfig.stateMachine) {
    return <StateMachineRecordField {...props} />;
  }

  return <EditableRecordFieldEditor {...props} />;
}

function ReadOnlyRecordFieldDisplay({
  density = "default",
  fieldConfig,
  recordId,
  showLabel = false,
}: RecordFieldEditorProps) {
  const label = fieldConfig.label ?? fieldLabel(fieldConfig.fieldName, fieldConfig.field);

  return (
    <div
      className={
        density === "compact"
          ? "min-w-0 text-xs text-slate-700"
          : "min-w-0 space-y-1 text-sm text-slate-700"
      }
      data-formless-readonly-field={fieldConfig.fieldName}
    >
      {showLabel ? <div className="text-xs font-medium text-slate-500">{label}</div> : null}
      <div className="flex min-h-6 items-center gap-1">
        <RecordFieldDisplay column={fieldConfig} recordId={recordId} />
      </div>
    </div>
  );
}

function EditableRecordFieldEditor({
  density = "default",
  draftInput,
  entityName,
  fieldConfig,
  onDraftInputChange,
  presentation = "default",
  recordId,
  showLabel = false,
  updateDraftContext,
  updateOperation,
}: RecordFieldEditorProps) {
  const appTarget = useSchemaAppTarget();
  const writeOptions = useSchemaAppWriteOptions();
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
  const initialDraft = generatedRecordFieldEditorDraftFromUpdateDraftInput({
    draftInput,
    fieldConfig,
    numberFormat,
    recordValue,
  });
  const [draft, setDraft] = useState(() => initialDraft);
  const [iconDialogOpen, setIconDialogOpen] = useState(false);
  const [iconDialogDraft, setIconDialogDraft] = useState(() => initialDraft);
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

  useEffect(() => {
    const nextDraft = generatedRecordFieldEditorDraftFromUpdateDraftInput({
      draftInput,
      fieldConfig,
      numberFormat,
      recordValue,
    });

    setDraft(nextDraft);

    if (!iconDialogOpen) {
      setIconDialogDraft(nextDraft);
    }
  }, [draftInput, fieldConfig, numberFormat, recordValue, iconDialogOpen]);

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

    if (fieldConfig.editor !== "media") {
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
  }, [fieldConfig.editor]);

  async function commitPatch(
    values: Partial<RecordValues>,
    options: CommitPatchOptions = {},
  ): Promise<boolean> {
    const managePending = options.managePending ?? true;

    if (updateOperation === undefined || (isPending && !options.allowWhilePending)) {
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
      await submitOperation(
        appTarget,
        entityName,
        updateOperation.operationName,
        {
          recordId,
          input: patchValues,
        },
        undefined,
        {
          ...writeOptions,
          ...(options.autoSaveSource ? { autoSaveSource: options.autoSaveSource } : {}),
        },
      );
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
      notifyDraftInputChange(undefined);
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
    if (generatedRecordFieldUsesUpdateDraftResolver(fieldConfig)) {
      return commitGeneratedUpdateDraft(generatedUpdateDraftInputFromFieldValue(value));
    }

    return commitPatch({ [fieldName]: value });
  }

  async function commitGeneratedUpdateDraft(
    nextDraftInput: GeneratedUpdateDraftFieldInput,
  ): Promise<boolean> {
    notifyDraftInputChange(nextDraftInput);

    const resolution = resolveGeneratedUpdateDraftPatchValues({
      baselineValues: updateDraftContext?.baselineValues ?? record?.values ?? {},
      draft: {
        values: {
          ...updateDraftContext?.draft.values,
          [fieldName]: nextDraftInput,
        },
      },
      fieldNames: [fieldName],
      fields: updateDraftContext?.fields ?? [fieldConfig],
      union: updateDraftContext?.union,
    });

    return commitGeneratedUpdateDraftResolution(resolution);
  }

  async function commitGeneratedValueUnitDraft({
    fieldDraftInput,
    unitDraftInput,
  }: GeneratedRecordValueUnitDraftCommit): Promise<boolean> {
    if (valueUnitConfig === undefined) {
      return false;
    }

    notifyDraftInputChange(fieldDraftInput);

    const resolution = resolveGeneratedValueUnitUpdateDraftPatchValues({
      baselineValues: updateDraftContext?.baselineValues ?? record?.values ?? {},
      draft: { values: { ...updateDraftContext?.draft.values } },
      fieldConfig: {
        ...fieldConfig,
        valueUnit: valueUnitConfig,
      },
      fieldDraftInput,
      fields: updateDraftContext?.fields ?? [fieldConfig],
      union: updateDraftContext?.union,
      unitDraftInput,
    });

    return commitGeneratedUpdateDraftResolution(resolution);
  }

  async function commitGeneratedUpdateDraftResolution(
    resolution: GeneratedUpdateDraftResolution,
    options?: CommitPatchOptions,
  ): Promise<boolean> {
    const fieldError =
      resolution.fieldErrors[fieldName] ?? Object.values(resolution.fieldErrors)[0];

    if (fieldError !== undefined) {
      setError(fieldError.message);
      return false;
    }

    return commitPatch(resolution.patchValues, options);
  }

  function notifyDraftInputChange(nextDraftInput: GeneratedUpdateDraftFieldInput | undefined) {
    if (!generatedRecordFieldUsesUpdateDraftResolver(fieldConfig)) {
      return;
    }

    onDraftInputChange?.(fieldName, nextDraftInput);
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    notifyDraftInputChange(
      generatedUpdateDraftInputFromEditorDraft({
        fieldConfig,
        numberFormat,
        value,
      }),
    );
  }

  function revertDraftToRecordValue() {
    setDraft(fieldValueToRecordFieldEditorInputValue(field, recordValue, numberFormat));
    notifyDraftInputChange(undefined);
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

  async function handleMediaUpload(file: File | undefined) {
    if (!file || updateOperation === undefined || isPending) {
      return;
    }

    setIsPending(true);
    setError(null);
    setSyncStatus({ state: "syncing", message: "Uploading image..." });

    try {
      const upload = await uploadCoreImageMediaFile(file);
      const uploadedOption = imageMediaAssetOptionFromUpload(upload);

      if (!uploadedOption) {
        throw new Error("Image upload did not return a media asset id.");
      }

      const resolution = resolveGeneratedMediaUploadUpdateDraftPatchValues({
        baselineValues: updateDraftContext?.baselineValues ?? record?.values ?? {},
        draft: { values: { ...updateDraftContext?.draft.values } },
        entityName,
        fieldConfig,
        fields: updateDraftContext?.fields ?? [fieldConfig],
        schema,
        union: updateDraftContext?.union,
        upload,
        uploadPatchFields: mediaAuthoring.uploadPatchFields,
      });
      const saved = await commitGeneratedUpdateDraftResolution(resolution, {
        allowWhilePending: true,
        autoSaveSource: "media-reference",
        managePending: false,
      });

      if (saved) {
        setDraft(uploadedOption.id);
        notifyDraftInputChange(generatedUpdateDraftInputFromFieldValue(uploadedOption.id));
        setMediaAssetOptions((current) => upsertMediaAssetOption(current, uploadedOption));
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
    setDraft(assetId);
    await commit(assetId);
  }

  if (fieldConfig.editor !== "media" && fieldConfig.editor !== "icon") {
    const projectedField = projectGeneratedRecordFormlessUiField({
      canPatch: updateOperation !== undefined,
      density,
      draftInput,
      editorDraft: draft,
      entityName,
      error,
      fieldConfig,
      isPending,
      presentation,
      recordId,
      recordValue,
      schema,
      showLabel,
      unitDraft,
      unitRecordValue,
    });

    if (projectedField.mode === "editor") {
      return (
        <LegacyRecordFieldAdapter
          field={projectedField}
          onIntent={(intent) => {
            switch (intent.type) {
              case "recordEditorDraftChange":
                handleDraftChange(intent.value);
                return;
              case "recordDraftRevert":
                if (intent.fieldName === valueUnitConfig?.unitFieldName) {
                  revertUnitDraftToRecordValue();
                } else {
                  revertDraftToRecordValue();
                }
                return;
              case "recordDraftChange":
                if (intent.fieldName === valueUnitConfig?.unitFieldName) {
                  setUnitDraft(String(intent.fieldValue?.value ?? ""));
                }
                return;
              case "recordValueCommit":
                void commit(intent.value);
                return;
              case "recordValueUnitCommit":
                void commitGeneratedValueUnitDraft(intent.commit);
                return;
              case "fieldErrorChange":
                setError(intent.message);
                return;
              default:
                return;
            }
          }}
        />
      );
    }
  }

  return (
    <GeneratedRecordFieldControl
      canPatch={updateOperation !== undefined}
      density={density}
      draft={draft}
      error={error}
      fieldConfig={fieldConfig}
      iconDialogDraft={iconDialogDraft}
      iconDialogOpen={iconDialogOpen}
      isPending={isPending}
      numberFormat={numberFormat}
      onDraftChange={handleDraftChange}
      onDraftRevert={revertDraftToRecordValue}
      onErrorChange={setError}
      onIconCancel={cancelIconEdit}
      onIconDraftChange={setIconDialogDraft}
      onIconOpenChange={handleIconOpenChange}
      onIconSave={handleIconSave}
      onMediaFileSelect={(file) => void handleMediaUpload(file)}
      onMediaAssetSelect={(assetId) => void handleMediaAssetSelect(assetId)}
      onUnitDraftChange={setUnitDraft}
      onUnitDraftRevert={revertUnitDraftToRecordValue}
      onValueCommit={(value) => {
        void commit(value);
      }}
      onValueUnitCommit={(commit) => {
        void commitGeneratedValueUnitDraft(commit);
      }}
      presentation={presentation}
      recordValue={recordValue}
      showLabel={showLabel}
      unitDraft={unitDraft}
      mediaAssetOptions={mediaAssetOptions}
      mediaPreviewHref={mediaAuthoring.mediaPreviewHref}
      uploadEnabled={mediaAuthoring.uploadEnabled}
    />
  );
}

function StateMachineRecordField({
  density = "default",
  fieldConfig,
  presentation = "default",
  recordId,
  showLabel = false,
}: RecordFieldEditorProps) {
  const record = useRecord(recordId);
  const { field, fieldName, stateMachine } = fieldConfig;

  if (field.type !== "enum" || !stateMachine) {
    return null;
  }

  const label = fieldConfig.label ?? fieldLabel(fieldName, field);
  const badge = (
    <StateMachineStateBadge
      field={field}
      label={label}
      stateMachine={stateMachine}
      value={record?.values[fieldName]}
    />
  );

  if (showLabel && presentation !== "heading") {
    return (
      <div
        className="min-w-28 flex-none space-y-1"
        data-formless-state-machine-readonly={fieldName}
      >
        <span className="block text-xs font-medium text-slate-600">{label}</span>
        {badge}
      </div>
    );
  }

  return (
    <div
      className={`${density === "compact" ? "min-h-6" : "min-h-7"} flex shrink-0 items-center`}
      data-formless-state-machine-readonly={fieldName}
    >
      {badge}
    </div>
  );
}
