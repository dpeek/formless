import { useEffect, useState } from "react";
import {
  coreImageMediaAssetOptionForId,
  listCoreImageMediaAssets,
  uploadCoreImageMediaFile,
  type ImageMediaAssetOption,
} from "@dpeek/formless-media/client";
import { MediaFieldControl } from "@dpeek/formless-media/react";
import { Checkbox } from "@dpeek/formless-ui/checkbox";
import { DatePicker, DatePickerTrigger } from "@dpeek/formless-ui/date-picker";
import { FieldError, Label, fieldErrorStyles } from "@dpeek/formless-ui/field";
import { Input } from "@dpeek/formless-ui/input";
import { NativeSelect, NativeSelectContent } from "@dpeek/formless-ui/native-select";
import { TextField } from "@dpeek/formless-ui/text-field";
import { Textarea } from "@dpeek/formless-ui/textarea";
import type {
  FormlessUiCreateField,
  FormlessUiFieldControl,
  FormlessUiFieldIntentHandler,
  FormlessUiReferenceOption,
  FormlessUiStateMachineField,
} from "@dpeek/formless-astryx/contract";
import type {
  FieldSchema,
  FieldVisibilityValue,
  GeneratedFieldDraftInput,
} from "@dpeek/formless-schema";
import { generatedFieldDraftInput } from "@dpeek/formless-schema";
import { setSyncStatus } from "../../client/sync-status.ts";
import {
  GeneratedColorFieldControl,
  GeneratedIconPickerFieldControl,
  GeneratedMarkdownFieldControl,
  GeneratedNumberFieldControl,
} from "./field-control-primitives.tsx";
import { dateValueToStoredDateValue, storedDateValueToDateValue } from "./date-value.ts";
import { completionCheckboxClassName } from "./field-presentation.tsx";
import { encodeNumberEditorInputValue, numberInputValueToFieldValue } from "./format.ts";
import { EMPTY_GENERATED_REFERENCE_OPTIONS } from "./reference-field-options.ts";
import { StateMachineStateBadge } from "./legacy-state-machine-ui.tsx";
import {
  imageMediaAssetOptionFromUpload,
  upsertMediaAssetOption,
} from "./record-field-authoring.ts";

export function GeneratedCreateFieldControl({
  field: projectedField,
  onIntent,
}: {
  field: FormlessUiCreateField;
  onIntent: FormlessUiFieldIntentHandler;
}) {
  const { control: fieldControl, draftInput: draftValue, field, fieldName, label } = projectedField;
  const error = projectedField.errors?.[0]?.message;
  const onValueChange = (value: FieldVisibilityValue) =>
    onIntent({
      fieldName,
      fieldValue: generatedFieldDraftInput(value),
      type: "createDraftChange",
    });

  if (field.type === "enum" && projectedField.stateMachine) {
    return (
      <CreateStateMachineField
        field={field}
        fieldName={fieldName}
        label={label}
        onValueChange={onValueChange}
        stateMachine={projectedField.stateMachine}
        value={draftValueToString(draftValue, projectedField.stateMachine.initialState)}
      />
    );
  }

  if (fieldControl.controlKind === "checkbox") {
    const completionMode = projectedField.presentation?.mode === "completion";

    return (
      <div className="space-y-1">
        <Checkbox
          className={completionMode ? completionCheckboxClassName() : undefined}
          data-formless-field-presentation-mode={completionMode ? "completion" : undefined}
          isInvalid={error !== undefined}
          isRequired={fieldControl.required}
          isSelected={draftValueToBoolean(draftValue, fieldControl.createDefaultChecked)}
          name={fieldName}
          onChange={(selected) => onValueChange(selected)}
        >
          {fieldControl.label}
        </Checkbox>
        {error ? <StaticFieldError>{error}</StaticFieldError> : null}
      </div>
    );
  }

  if (fieldControl.controlKind === "date") {
    return (
      <CreateDateField
        error={error}
        fieldName={fieldName}
        label={fieldControl.label}
        onValueChange={onValueChange}
        required={fieldControl.required}
        value={draftValueToString(draftValue, fieldControl.createDefaultValue ?? "")}
      />
    );
  }

  if (fieldControl.controlKind === "color") {
    return (
      <CreateColorField
        error={error}
        fieldName={fieldName}
        label={fieldControl.label}
        onValueChange={onValueChange}
        required={fieldControl.required}
        value={draftValueToString(draftValue, fieldControl.createDefaultValue ?? "")}
      />
    );
  }

  if (fieldControl.controlKind === "markdown") {
    return (
      <CreateMarkdownField
        error={error}
        fieldName={fieldName}
        label={fieldControl.label}
        onValueChange={onValueChange}
        required={fieldControl.required}
        value={draftValueToString(draftValue, fieldControl.createDefaultValue ?? "")}
      />
    );
  }

  if (fieldControl.controlKind === "icon") {
    return (
      <CreateIconField
        error={error}
        fieldName={fieldName}
        label={fieldControl.label}
        onValueChange={onValueChange}
        required={fieldControl.required}
        value={draftValueToString(draftValue, fieldControl.createDefaultValue ?? "")}
      />
    );
  }

  if (fieldControl.controlKind === "media") {
    return (
      <CreateMediaField
        error={error}
        label={fieldControl.label}
        onValueChange={onValueChange}
        required={fieldControl.required}
        value={draftValueToString(draftValue, fieldControl.createDefaultValue ?? "")}
      />
    );
  }

  if (fieldControl.controlKind === "number") {
    return (
      <CreateNumberField
        error={error}
        fieldName={fieldName}
        inputAttributes={fieldControl.inputAttributes}
        label={fieldControl.label}
        onValueChange={onValueChange}
        required={fieldControl.required}
        value={draftValueToString(
          draftValue,
          encodeNumberCreateDefaultValue(fieldControl.createDefaultValue),
        )}
      />
    );
  }

  if (fieldControl.kind === "enum") {
    const value = draftValueToString(draftValue, fieldControl.createDefaultValue ?? "");

    return (
      <NativeSelect>
        <Label>{fieldControl.label}</Label>
        <NativeSelectContent
          aria-label={fieldControl.label}
          isInvalid={error !== undefined}
          name={fieldName}
          onChange={(event) => onValueChange(event.currentTarget.value)}
          required={fieldControl.required}
          value={value}
        >
          {fieldControl.required ? null : <option value="" />}
          {Object.entries(fieldControl.field.values).map(([value, option]) => (
            <option key={value} value={value}>
              {option.label}
            </option>
          ))}
        </NativeSelectContent>
        {error ? <StaticFieldError>{error}</StaticFieldError> : null}
      </NativeSelect>
    );
  }

  if (fieldControl.kind === "reference") {
    return (
      <ReferenceCreateFieldSelect
        defaultValue={fieldControl.createDefaultValue}
        error={error}
        fieldName={fieldName}
        hasDraftValue={draftValue !== undefined}
        label={fieldControl.label}
        onValueChange={onValueChange}
        options={projectedField.options?.referenceOptions ?? EMPTY_GENERATED_REFERENCE_OPTIONS}
        required={fieldControl.required}
        value={draftValueToString(draftValue, fieldControl.createDefaultValue ?? "")}
      />
    );
  }

  if (fieldControl.controlKind === "textarea") {
    return (
      <TextField
        isInvalid={error !== undefined}
        isRequired={fieldControl.required}
        name={fieldName}
        onChange={(value) => onValueChange(value)}
        value={draftValueToString(draftValue, fieldControl.createDefaultValue ?? "")}
      >
        <Label>{fieldControl.label}</Label>
        <Textarea />
        {error ? <FieldError>{error}</FieldError> : null}
      </TextField>
    );
  }

  return (
    <TextField
      isInvalid={error !== undefined}
      isRequired={fieldControl.required}
      name={fieldName}
      onChange={(value) => onValueChange(value)}
      type={fieldControl.control.kind === "input" ? fieldControl.control.inputType : "text"}
      value={draftValueToString(draftValue, fieldControl.createDefaultValue ?? "")}
    >
      <Label>{fieldControl.label}</Label>
      <Input />
      {error ? <FieldError>{error}</FieldError> : null}
    </TextField>
  );
}

function CreateMediaField({
  error,
  label,
  onValueChange,
  required,
  value,
}: {
  error?: string;
  label: string;
  onValueChange: (value: FieldVisibilityValue) => void;
  required: boolean;
  value: string;
}) {
  const [mediaAssetOptions, setMediaAssetOptions] = useState<ImageMediaAssetOption[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const selectedOption =
    mediaAssetOptions.find((asset) => asset.id === value) ??
    (value === "" ? undefined : coreImageMediaAssetOptionForId(value));

  useEffect(() => {
    let cancelled = false;

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
  }, []);

  function selectAsset(assetId: string) {
    setUploadError(undefined);
    onValueChange(assetId);
  }

  async function uploadMedia(file: File | undefined) {
    if (!file || isPending) {
      return;
    }

    setIsPending(true);
    setUploadError(undefined);
    setSyncStatus({ state: "syncing", message: "Uploading image..." });

    try {
      const upload = await uploadCoreImageMediaFile(file);
      const uploadedOption = imageMediaAssetOptionFromUpload(upload);

      if (!uploadedOption) {
        throw new Error("Image upload did not return a media asset id.");
      }

      setMediaAssetOptions((current) => upsertMediaAssetOption(current, uploadedOption));
      onValueChange(uploadedOption.id);
      setSyncStatus({ state: "idle", message: "Image uploaded." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image upload failed.";

      setUploadError(message);
      setSyncStatus({ state: "error", message });
    } finally {
      setIsPending(false);
    }
  }

  const displayedError = uploadError ?? error;

  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <MediaFieldControl
        controlDisabled={isPending}
        density="default"
        draft={value}
        invalid={displayedError !== undefined}
        label={label}
        mediaAssetOptions={mediaAssetOptions}
        mediaPreviewHref={selectedOption?.href}
        onFileSelect={(file) => void uploadMedia(file)}
        onMediaAssetSelect={selectAsset}
        required={required}
        uploadDisabled={isPending}
      />
      {displayedError ? <StaticFieldError>{displayedError}</StaticFieldError> : null}
    </div>
  );
}

function CreateStateMachineField({
  field,
  fieldName,
  label,
  onValueChange,
  stateMachine,
  value,
}: {
  field: Extract<FieldSchema, { type: "enum" }>;
  fieldName: string;
  label: string;
  onValueChange?: (value: FieldVisibilityValue) => void;
  stateMachine: FormlessUiStateMachineField;
  value: string;
}) {
  return (
    <div className="space-y-1" data-formless-state-machine-create={fieldName}>
      <Label>{label}</Label>
      <StateMachineStateBadge
        field={field}
        label={label}
        stateMachine={stateMachine}
        value={value}
      />
      <input
        name={fieldName}
        onChange={(event) => onValueChange?.(event.currentTarget.value)}
        readOnly
        type="hidden"
        value={value}
      />
    </div>
  );
}

function CreateDateField({
  error,
  fieldName,
  label,
  onValueChange,
  required,
  value,
}: {
  error?: string;
  fieldName: string;
  label: string;
  onValueChange?: (value: FieldVisibilityValue) => void;
  required: boolean;
  value: string;
}) {
  const dateValue = storedDateValueToDateValue(value).value;

  return (
    <DatePicker
      isInvalid={error !== undefined}
      isRequired={required}
      onChange={(nextValue) => {
        onValueChange?.(dateValueToStoredDateValue(nextValue));
      }}
      value={dateValue}
    >
      <Label>{label}</Label>
      <DatePickerTrigger />
      <input name={fieldName} readOnly type="hidden" value={value} />
      {error ? <FieldError>{error}</FieldError> : null}
    </DatePicker>
  );
}

function CreateIconField({
  error,
  fieldName,
  label,
  onValueChange,
  required,
  value,
}: {
  error?: string;
  fieldName: string;
  label: string;
  onValueChange?: (value: FieldVisibilityValue) => void;
  required: boolean;
  value: string;
}) {
  const [dialogDraft, setDialogDraft] = useState(value);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!dialogOpen) {
      setDialogDraft(value);
    }
  }, [dialogOpen, value]);

  function handleOpenChange(open: boolean) {
    setDialogDraft(value);
    setDialogOpen(open);
  }

  function handleCancel() {
    setDialogDraft(value);
    setDialogOpen(false);
  }

  function handleSave() {
    onValueChange?.(dialogDraft);
    setDialogOpen(false);
  }

  return (
    <TextField isInvalid={error !== undefined} isRequired={required}>
      <Label>{label}</Label>
      <input name={fieldName} readOnly type="hidden" value={value} />
      <div data-slot="control">
        <GeneratedIconPickerFieldControl
          label={label}
          onCancel={handleCancel}
          onChange={setDialogDraft}
          onOpenChange={handleOpenChange}
          onSave={handleSave}
          open={dialogOpen}
          previewSource={value}
          value={dialogDraft}
        />
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
    </TextField>
  );
}

function CreateMarkdownField({
  error,
  fieldName,
  label,
  onValueChange,
  required,
  value,
}: {
  error?: string;
  fieldName: string;
  label: string;
  onValueChange?: (value: FieldVisibilityValue) => void;
  required: boolean;
  value: string;
}) {
  return (
    <TextField isInvalid={error !== undefined} isRequired={required}>
      <Label>{label}</Label>
      <input name={fieldName} readOnly type="hidden" value={value} />
      <GeneratedMarkdownFieldControl
        label={label}
        onChange={(nextValue) => {
          onValueChange?.(nextValue);
        }}
        value={value}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </TextField>
  );
}

function CreateColorField({
  error,
  fieldName,
  label,
  onValueChange,
  required,
  value,
}: {
  error?: string;
  fieldName: string;
  label: string;
  onValueChange?: (value: FieldVisibilityValue) => void;
  required: boolean;
  value: string;
}) {
  return (
    <TextField isInvalid={error !== undefined} isRequired={required}>
      <Label>{label}</Label>
      <input name={fieldName} readOnly type="hidden" value={value} />
      <GeneratedColorFieldControl
        label={label}
        onChange={(nextValue) => {
          onValueChange?.(nextValue);
        }}
        required={required}
        value={value}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </TextField>
  );
}

function CreateNumberField({
  error,
  fieldName,
  inputAttributes,
  label,
  onValueChange,
  required,
  value,
}: {
  error?: string;
  fieldName: string;
  inputAttributes: FormlessUiFieldControl["inputAttributes"];
  label: string;
  onValueChange?: (value: FieldVisibilityValue) => void;
  required: boolean;
  value: string;
}) {
  return (
    <TextField isInvalid={error !== undefined} isRequired={required}>
      <Label>{label}</Label>
      <span className="block" data-slot="control">
        <GeneratedNumberFieldControl
          aria-label={label}
          name={fieldName}
          onValueChange={(nextValue) => onValueChange?.(nextValue)}
          required={required}
          value={value}
          {...inputAttributes}
        />
      </span>
      {error ? <FieldError>{error}</FieldError> : null}
    </TextField>
  );
}

function encodeNumberCreateDefaultValue(value: string | undefined) {
  const fieldValue = numberInputValueToFieldValue(value ?? "");

  return typeof fieldValue === "number" && Number.isFinite(fieldValue)
    ? encodeNumberEditorInputValue(fieldValue, "plain")
    : "";
}

function ReferenceCreateFieldSelect({
  defaultValue,
  error,
  fieldName,
  hasDraftValue,
  label,
  onValueChange,
  options,
  required,
  value,
}: {
  defaultValue: string | undefined;
  error?: string;
  fieldName: string;
  hasDraftValue: boolean;
  label: string;
  onValueChange?: (value: FieldVisibilityValue) => void;
  options: readonly FormlessUiReferenceOption[];
  required: boolean;
  value: string;
}) {
  const selectedValue = hasDraftValue
    ? value
    : (defaultValue ?? (required ? (options[0]?.id ?? "") : ""));

  useEffect(() => {
    if (!hasDraftValue && selectedValue !== "") {
      onValueChange?.(selectedValue);
    }
  }, [hasDraftValue, onValueChange, selectedValue]);

  return (
    <NativeSelect>
      <Label>{label}</Label>
      <NativeSelectContent
        aria-label={label}
        isInvalid={error !== undefined}
        name={fieldName}
        onChange={(event) => onValueChange?.(event.currentTarget.value)}
        required={required}
        value={selectedValue}
      >
        {required ? null : <option value="" />}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </NativeSelectContent>
      {error ? <StaticFieldError>{error}</StaticFieldError> : null}
    </NativeSelect>
  );
}

function draftValueToString(draftValue: GeneratedFieldDraftInput | undefined, fallback: string) {
  if (draftValue === undefined) {
    return fallback;
  }

  return String(draftValue.value);
}

function draftValueToBoolean(draftValue: GeneratedFieldDraftInput | undefined, fallback: boolean) {
  if (draftValue === undefined) {
    return fallback;
  }

  return draftValue.value === true || draftValue.value === "true" || draftValue.value === "on";
}

function StaticFieldError({ children }: { children: string }) {
  return (
    <div className={fieldErrorStyles()} data-slot="field-error" role="alert" slot="errorMessage">
      {children}
    </div>
  );
}
