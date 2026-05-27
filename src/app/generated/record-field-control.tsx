import { Checkbox } from "@dpeek/formless-ui/checkbox";
import { DatePicker, DatePickerTrigger } from "@dpeek/formless-ui/date-picker";
import { FieldError, Label, fieldErrorStyles } from "@dpeek/formless-ui/field";
import { SelectIcon } from "@dpeek/formless-ui/icons";
import { Input } from "@dpeek/formless-ui/input";
import { NativeSelect, NativeSelectContent } from "@dpeek/formless-ui/native-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@dpeek/formless-ui/select";
import { TextField } from "@dpeek/formless-ui/text-field";
import { Textarea } from "@dpeek/formless-ui/textarea";
import { AutosizeTextInput } from "@dpeek/formless-ui/text-input";
import { ValueUnitInput } from "@dpeek/formless-ui/value-unit-input";
import type { DateValue } from "@internationalized/date";
import type { FocusEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { SITE_IMAGE_UPLOAD_ACCEPT } from "../../client/media.ts";
import type { ImageMediaAssetOption } from "../../client/media.ts";
import { useReferenceOptions } from "../../client/store.ts";
import { fieldLabel, type RecordFieldConfig } from "../../client/views.ts";
import type { FieldValue, RecordValues } from "../../shared/protocol.ts";
import type {
  FieldPresentationEnumContent,
  FieldPresentationSchema,
  FieldSchema,
  TableColumnFormat,
} from "../../shared/schema.ts";
import {
  GeneratedColorFieldControl,
  GeneratedIconPickerFieldControl,
  GeneratedMarkdownFieldControl,
  GeneratedNumberFieldControl,
} from "./field-control-primitives.tsx";
import { dateValueToStoredDateValue, storedDateValueToDateValue } from "./date-value.ts";
import {
  decodeNumberEditorInputValue,
  encodeNumberEditorInputValue,
  inputValueToFieldValue,
} from "./format.ts";
import {
  completionCheckboxClassName,
  enumValuePresentation,
  fieldPresentationIconButtonClassName,
  fieldPresentationTextColorClassName,
  GeneratedFieldPresentationIcon,
  quietValueOrInteractionClassName,
} from "./field-presentation.tsx";
import type { GeneratedFieldControl } from "./field-controls.ts";
import { selectGeneratedRecordFieldAuthoringAdapter } from "./field-ui-adapters.ts";
import {
  type GeneratedRecordFieldControlDensity,
  type GeneratedRecordFieldControlPresentation,
  type GeneratedRecordFieldRendererKind,
} from "./record-field-renderer-model.ts";

export type {
  GeneratedRecordFieldControlDensity,
  GeneratedRecordFieldControlPresentation,
} from "./record-field-renderer-model.ts";

const compactNativeInputClassName =
  "h-6 w-full rounded border border-slate-300 px-2 py-0.5 text-xs/4 sm:px-2 sm:py-0.5 sm:text-xs/4 md:text-xs/4";
const compactNativeTextareaClassName =
  "min-h-20 w-full rounded border border-slate-300 px-2 py-1 text-xs/4 sm:px-2 sm:py-1 sm:text-xs/4 md:text-xs/4";
const compactNativeSelectClassName =
  "h-6 py-0.5 pe-6 ps-2 text-xs/4 sm:py-0.5 sm:pe-6 sm:ps-2 sm:pr-6 sm:pl-2 sm:text-xs/4 md:text-xs/4";

export function GeneratedRecordFieldControl({
  canPatch,
  density = "default",
  draft,
  error,
  fieldConfig,
  iconDialogDraft,
  iconDialogOpen,
  isPending,
  numberFormat,
  onDraftChange,
  onDraftRevert,
  onErrorChange,
  onIconCancel,
  onIconDraftChange,
  onIconOpenChange,
  onIconSave,
  onImageFileSelect,
  onMediaAssetSelect,
  onPatchValues,
  onUnitDraftChange,
  onUnitDraftRevert,
  onValueCommit,
  presentation = "default",
  recordValue,
  showLabel = false,
  unitDraft,
  mediaAssetOptions,
  mediaEditorMode,
  mediaPreviewHref,
  uploadEnabled,
}: {
  canPatch: boolean;
  density?: GeneratedRecordFieldControlDensity;
  draft: string;
  error: string | null;
  fieldConfig: RecordFieldConfig;
  iconDialogDraft: string;
  iconDialogOpen: boolean;
  isPending: boolean;
  numberFormat: TableColumnFormat;
  onDraftChange: (value: string) => void;
  onDraftRevert: () => void;
  onErrorChange: (message: string | null) => void;
  onIconCancel: () => void;
  onIconDraftChange: (value: string) => void;
  onIconOpenChange: (open: boolean) => void;
  onIconSave: () => Promise<void>;
  onImageFileSelect: (file: File | undefined) => void;
  onMediaAssetSelect: (assetId: string) => void;
  onPatchValues: (values: Partial<RecordValues>) => void;
  onUnitDraftChange: (value: string) => void;
  onUnitDraftRevert: () => void;
  onValueCommit: (value: FieldValue) => void;
  presentation?: GeneratedRecordFieldControlPresentation;
  recordValue: FieldValue | undefined;
  showLabel?: boolean;
  unitDraft: string;
  mediaAssetOptions: ImageMediaAssetOption[];
  mediaEditorMode: "asset" | "url";
  mediaPreviewHref?: string;
  uploadEnabled: boolean;
}) {
  const { commit: commitPolicy, field, fieldName } = fieldConfig;
  const label = fieldConfig.label ?? fieldLabel(fieldName, field);
  const controlDensity = density === "compact" && showLabel ? "default" : density;
  const labelClass =
    showLabel && presentation !== "heading" ? "text-xs font-medium text-slate-600" : "sr-only";
  const { fieldControl, rendererKind } = selectGeneratedRecordFieldAuthoringAdapter({
    density: controlDensity,
    fieldConfig,
    label,
    presentation,
    showLabel,
  });

  if (rendererKind === "checkbox" || rendererKind === "completion-checkbox") {
    return (
      <RecordCheckboxFieldRenderer
        canPatch={canPatch}
        commitPolicy={commitPolicy}
        density={controlDensity}
        error={error}
        fieldControl={fieldControl}
        isPending={isPending}
        presentationMode={rendererKind === "completion-checkbox" ? "completion" : undefined}
        onValueCommit={onValueCommit}
        recordValue={recordValue}
        showLabel={showLabel}
      />
    );
  }

  if ((rendererKind === "enum" || rendererKind === "enum-icon") && fieldControl.kind === "enum") {
    return (
      <RecordEnumFieldRenderer
        canPatch={canPatch}
        density={controlDensity}
        draft={draft}
        error={error}
        fieldControl={fieldControl}
        fieldPresentation={fieldConfig.presentation}
        iconOnly={rendererKind === "enum-icon"}
        isPending={isPending}
        labelClass={labelClass}
        onDraftChange={onDraftChange}
        onValueCommit={onValueCommit}
      />
    );
  }

  if (rendererKind === "reference" && fieldControl.kind === "reference") {
    return (
      <RecordReferenceFieldControl
        canPatch={canPatch}
        density={controlDensity}
        draft={draft}
        error={error}
        field={fieldControl.field}
        isPending={isPending}
        label={fieldControl.label}
        labelClass={labelClass}
        onCommit={onValueCommit}
        onDraftChange={onDraftChange}
      />
    );
  }

  if (rendererKind === "text") {
    return (
      <RecordTextFieldRenderer
        canPatch={canPatch}
        commitPolicy={commitPolicy}
        density={controlDensity}
        draft={draft}
        error={error}
        fieldControl={fieldControl}
        isPending={isPending}
        labelClass={labelClass}
        onDraftChange={onDraftChange}
        onDraftRevert={onDraftRevert}
        onValueCommit={onValueCommit}
      />
    );
  }

  if (rendererKind === "textarea") {
    return (
      <RecordTextareaFieldRenderer
        canPatch={canPatch}
        commitPolicy={commitPolicy}
        density={controlDensity}
        draft={draft}
        error={error}
        field={field}
        fieldControl={fieldControl}
        isPending={isPending}
        labelClass={labelClass}
        onDraftChange={onDraftChange}
        onDraftRevert={onDraftRevert}
        onValueCommit={onValueCommit}
      />
    );
  }

  if (rendererKind === "number") {
    return (
      <RecordNumberFieldRenderer
        canPatch={canPatch}
        commitPolicy={commitPolicy}
        density={controlDensity}
        draft={draft}
        error={error}
        fieldControl={fieldControl}
        isPending={isPending}
        labelClass={labelClass}
        numberFormat={numberFormat}
        onDraftChange={onDraftChange}
        onDraftRevert={onDraftRevert}
        onErrorChange={onErrorChange}
        onValueCommit={onValueCommit}
      />
    );
  }

  if (rendererKind === "value-unit" && fieldConfig.valueUnit !== undefined) {
    return (
      <RecordValueUnitFieldRenderer
        canPatch={canPatch}
        commitPolicy={commitPolicy}
        density={controlDensity}
        draft={draft}
        error={error}
        fieldName={fieldName}
        fieldControl={fieldControl}
        isPending={isPending}
        labelClass={labelClass}
        numberFormat={numberFormat}
        onDraftChange={onDraftChange}
        onDraftRevert={onDraftRevert}
        onErrorChange={onErrorChange}
        onPatchValues={onPatchValues}
        onUnitDraftChange={onUnitDraftChange}
        onUnitDraftRevert={onUnitDraftRevert}
        unitDraft={unitDraft}
        valueUnit={fieldConfig.valueUnit}
      />
    );
  }

  if (rendererKind === "markdown") {
    return (
      <RecordMarkdownFieldRenderer
        canPatch={canPatch}
        commitPolicy={commitPolicy}
        density={controlDensity}
        draft={draft}
        error={error}
        field={field}
        fieldControl={fieldControl}
        isPending={isPending}
        labelClass={labelClass}
        onDraftChange={onDraftChange}
        onDraftRevert={onDraftRevert}
        onValueCommit={onValueCommit}
      />
    );
  }

  if (rendererKind === "color") {
    return (
      <RecordColorFieldRenderer
        canPatch={canPatch}
        commitPolicy={commitPolicy}
        density={controlDensity}
        draft={draft}
        error={error}
        field={field}
        fieldControl={fieldControl}
        isPending={isPending}
        labelClass={labelClass}
        onDraftChange={onDraftChange}
        onValueCommit={onValueCommit}
      />
    );
  }

  if (rendererKind === "date" || rendererKind === "quiet-date") {
    return (
      <RecordDateFieldRenderer
        canPatch={canPatch}
        commitPolicy={commitPolicy}
        density={controlDensity}
        draft={draft}
        error={error}
        field={field}
        fieldControl={fieldControl}
        isPending={isPending}
        labelClass={labelClass}
        onDraftChange={onDraftChange}
        onDraftRevert={onDraftRevert}
        onValueCommit={onValueCommit}
        quietVisibility={rendererKind === "quiet-date"}
      />
    );
  }

  if (rendererKind === "icon") {
    return (
      <RecordIconFieldRenderer
        canPatch={canPatch}
        density={controlDensity}
        error={error}
        fieldControl={fieldControl}
        iconDialogDraft={iconDialogDraft}
        iconDialogOpen={iconDialogOpen}
        isPending={isPending}
        labelClass={labelClass}
        onIconCancel={onIconCancel}
        onIconDraftChange={onIconDraftChange}
        onIconOpenChange={onIconOpenChange}
        onIconSave={onIconSave}
        previewSource={draft}
      />
    );
  }

  if (rendererKind === "image" || rendererKind === "media") {
    return (
      <RecordMediaFieldRenderer
        canPatch={canPatch}
        density={controlDensity}
        draft={draft}
        error={error}
        field={field}
        fieldControl={fieldControl}
        fieldKind={rendererKind}
        mediaAssetOptions={mediaAssetOptions}
        mediaEditorMode={mediaEditorMode}
        mediaPreviewHref={mediaPreviewHref}
        isPending={isPending}
        labelClass={labelClass}
        onDraftChange={onDraftChange}
        onDraftRevert={onDraftRevert}
        onImageFileSelect={onImageFileSelect}
        onMediaAssetSelect={onMediaAssetSelect}
        onValueCommit={onValueCommit}
        uploadEnabled={uploadEnabled}
      />
    );
  }

  if (rendererKind === "autosize-text") {
    return (
      <RecordAutosizeTextFieldRenderer
        canPatch={canPatch}
        commitPolicy={commitPolicy}
        density={controlDensity}
        draft={draft}
        error={error}
        field={field}
        fieldControl={fieldControl}
        isPending={isPending}
        labelClass={labelClass}
        onDraftChange={onDraftChange}
        onDraftRevert={onDraftRevert}
        onValueCommit={onValueCommit}
        presentation={presentation}
      />
    );
  }

  return null;
}

function RecordCheckboxFieldRenderer({
  canPatch,
  commitPolicy,
  density,
  error,
  fieldControl,
  isPending,
  presentationMode,
  onValueCommit,
  recordValue,
  showLabel,
}: {
  canPatch: boolean;
  commitPolicy: RecordFieldConfig["commit"];
  density: GeneratedRecordFieldControlDensity;
  error: string | null;
  fieldControl: GeneratedFieldControl;
  isPending: boolean;
  presentationMode?: "completion";
  onValueCommit: (value: FieldValue) => void;
  recordValue: FieldValue | undefined;
  showLabel: boolean;
}) {
  const completionMode = presentationMode === "completion";
  const checkbox = (
    <Checkbox
      aria-label={fieldControl.label}
      className={completionMode ? completionCheckboxClassName() : undefined}
      data-formless-field-presentation-mode={completionMode ? "completion" : undefined}
      isDisabled={!canPatch || isPending}
      isInvalid={error !== null}
      isSelected={recordValue === true}
      onChange={(checked) => {
        if (commitPolicy === "immediate") {
          onValueCommit(checked);
        }
      }}
    >
      {showLabel ? fieldControl.label : undefined}
    </Checkbox>
  );

  if (showLabel) {
    return (
      <div className="min-w-28 flex-none space-y-1">
        {checkbox}
        {error ? <StaticFieldError>{error}</StaticFieldError> : null}
      </div>
    );
  }

  return (
    <div
      className={`${completionMode ? "h-8" : density === "compact" ? "h-6" : "h-7"} flex shrink-0 items-center`}
    >
      {checkbox}
      {error ? <StaticFieldError>{error}</StaticFieldError> : null}
    </div>
  );
}

function RecordEnumFieldRenderer({
  canPatch,
  density,
  draft,
  error,
  fieldControl,
  fieldPresentation,
  iconOnly,
  isPending,
  labelClass,
  onDraftChange,
  onValueCommit,
}: {
  canPatch: boolean;
  density: GeneratedRecordFieldControlDensity;
  draft: string;
  error: string | null;
  fieldControl: Extract<GeneratedFieldControl, { kind: "enum" }>;
  fieldPresentation: FieldPresentationSchema | undefined;
  iconOnly: boolean;
  isPending: boolean;
  labelClass: string;
  onDraftChange: (value: string) => void;
  onValueCommit: (value: FieldValue) => void;
}) {
  const unknownValue =
    draft !== "" && !Object.hasOwn(fieldControl.field.values, draft) ? draft : null;

  if (iconOnly) {
    return (
      <RecordEnumIconOnlyFieldRenderer
        canPatch={canPatch}
        density={density}
        draft={draft}
        error={error}
        fieldControl={fieldControl}
        fieldPresentation={fieldPresentation}
        isPending={isPending}
        onDraftChange={onDraftChange}
        onValueCommit={onValueCommit}
      />
    );
  }

  return (
    <div
      className={
        density === "compact" ? "w-full min-w-0 space-y-1" : "min-w-40 flex-none space-y-1"
      }
    >
      <NativeSelect>
        <Label className={labelClass}>{fieldControl.label}</Label>
        <NativeSelectContent
          aria-label={fieldControl.label}
          className={density === "compact" ? compactNativeSelectClassName : undefined}
          disabled={!canPatch || isPending}
          isInvalid={error !== null}
          onChange={(event) => {
            const value = event.currentTarget.value;

            onDraftChange(value);
            onValueCommit(inputValueToFieldValue(fieldControl.field, value));
          }}
          required={fieldControl.required}
          value={draft}
        >
          {!fieldControl.required || draft === "" ? <option value="" /> : null}
          {unknownValue ? <option value={unknownValue}>{unknownValue}</option> : null}
          {Object.entries(fieldControl.field.values).map(([value, option]) => (
            <option key={value} value={value}>
              {option.label}
            </option>
          ))}
        </NativeSelectContent>
        {error ? <StaticFieldError>{error}</StaticFieldError> : null}
      </NativeSelect>
    </div>
  );
}

function RecordEnumIconOnlyFieldRenderer({
  canPatch,
  density,
  draft,
  error,
  fieldControl,
  fieldPresentation,
  isPending,
  onDraftChange,
  onValueCommit,
}: {
  canPatch: boolean;
  density: GeneratedRecordFieldControlDensity;
  draft: string;
  error: string | null;
  fieldControl: Extract<GeneratedFieldControl, { kind: "enum" }>;
  fieldPresentation: FieldPresentationSchema | undefined;
  isPending: boolean;
  onDraftChange: (value: string) => void;
  onValueCommit: (value: FieldValue) => void;
}) {
  const triggerContent = fieldPresentation?.trigger ?? "icon";
  const listContent = fieldPresentation?.list ?? "both";
  const options = enumPresentationSelectOptions(fieldControl, draft);
  const selectedOption = options.find((option) => option.value === draft);
  const selectedPresentation = enumValuePresentation({
    option: fieldControl.field.values[draft],
    value: draft,
  });
  const selectedLabel = draft === "" ? "None" : selectedPresentation.label;
  const accessibleLabel = `${fieldControl.label}: ${selectedLabel}`;

  return (
    <div
      className={
        density === "compact" ? "flex h-6 shrink-0 items-center" : "flex h-9 shrink-0 items-center"
      }
    >
      <Select
        aria-label={accessibleLabel}
        data-formless-field-presentation-color={selectedPresentation.color.intent}
        data-formless-field-presentation-color-token={selectedPresentation.color.token}
        data-formless-field-presentation-icon={fieldControl.field.values[draft]?.presentation?.icon}
        data-formless-field-presentation-list={listContent}
        data-formless-field-presentation-mode="iconOnly"
        data-formless-field-presentation-trigger={triggerContent}
        isDisabled={!canPatch || isPending}
        isInvalid={error !== null}
        onSelectionChange={(key) => {
          if (key === null) {
            return;
          }

          const value = String(key);
          onDraftChange(value);
          onValueCommit(inputValueToFieldValue(fieldControl.field, value));
        }}
        selectedKey={draft}
      >
        <SelectTrigger
          aria-label={accessibleLabel}
          className={enumPresentationSelectTriggerClassName(
            selectedPresentation.color.intent,
            density,
            triggerContent,
          )}
        >
          <EnumPresentationSelectValue
            content={triggerContent}
            density={density}
            label={selectedOption?.label ?? selectedLabel}
            presentation={selectedPresentation}
            scope="trigger"
          />
          <SelectIcon
            aria-hidden="true"
            className={enumPresentationSelectChevronClassName(density)}
          />
        </SelectTrigger>
        <SelectContent popover={{ placement: "bottom start", className: "min-w-32" }}>
          {options.map((option) => (
            <SelectItem id={option.value} key={option.value} textValue={option.label}>
              <EnumPresentationSelectValue
                content={listContent}
                density="default"
                label={option.label}
                presentation={option.presentation}
                scope="list"
              />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <StaticFieldError>{error}</StaticFieldError> : null}
    </div>
  );
}

function enumPresentationSelectOptions(
  fieldControl: Extract<GeneratedFieldControl, { kind: "enum" }>,
  draft: string,
) {
  const unknownValue =
    draft !== "" && !Object.hasOwn(fieldControl.field.values, draft) ? draft : null;
  const emptyOptions =
    !fieldControl.required || draft === "" ? [{ label: "None", option: undefined, value: "" }] : [];
  const unknownOptions = unknownValue
    ? [{ label: unknownValue, option: undefined, value: unknownValue }]
    : [];
  const enumOptions = Object.entries(fieldControl.field.values).map(([value, option]) => ({
    label: option.label,
    option,
    value,
  }));

  return [...emptyOptions, ...unknownOptions, ...enumOptions].map((option) => ({
    ...option,
    presentation: enumValuePresentation({ option: option.option, value: option.value }),
  }));
}

function EnumPresentationSelectValue({
  content,
  density,
  label,
  presentation,
  scope,
}: {
  content: FieldPresentationEnumContent;
  density: GeneratedRecordFieldControlDensity;
  label: string;
  presentation: ReturnType<typeof enumValuePresentation>;
  scope: "list" | "trigger";
}) {
  const iconSizeClassName = density === "compact" ? "size-3.5" : "size-4";
  const icon = presentation.icon;
  const showIcon = content !== "label" && icon !== undefined;
  const showLabel = content !== "icon" || icon === undefined;
  const labelClassName =
    scope === "trigger"
      ? "min-w-0 truncate text-xs font-medium"
      : `min-w-0 truncate ${fieldPresentationTextColorClassName(presentation.color.intent)}`;

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {showIcon ? (
        <GeneratedFieldPresentationIcon
          className={`${iconSizeClassName} shrink-0 ${fieldPresentationTextColorClassName(
            presentation.color.intent,
          )}`}
          icon={icon}
        />
      ) : null}
      {showLabel ? (
        scope === "trigger" ? (
          <span className={labelClassName}>{label}</span>
        ) : (
          <SelectLabel className={labelClassName}>{label}</SelectLabel>
        )
      ) : null}
    </span>
  );
}

function enumPresentationSelectTriggerClassName(
  intent: ReturnType<typeof enumValuePresentation>["color"]["intent"],
  density: GeneratedRecordFieldControlDensity,
  content: FieldPresentationEnumContent,
) {
  const contentSizing =
    content === "icon"
      ? density === "compact"
        ? "h-6 w-10 px-1.5 py-0 text-xs/4 sm:px-1.5 sm:py-0 sm:text-xs/4"
        : "h-9 w-12 px-1.5 py-0 text-xs/4 sm:px-1.5 sm:py-0 sm:text-xs/4"
      : density === "compact"
        ? "h-6 min-w-28 px-2 py-0 text-xs/4 sm:px-2 sm:py-0 sm:text-xs/4"
        : "h-9 min-w-32 px-2 py-0 text-sm/5 sm:px-2 sm:py-0 sm:text-sm/5";

  return [
    fieldPresentationIconButtonClassName(intent),
    "border-(--btn-border) bg-(--btn-bg) text-(--btn-fg) hover:bg-(--btn-overlay)",
    "focus:border-(--btn-border) focus:ring-(--btn-ring)",
    contentSizing,
  ].join(" ");
}

function enumPresentationSelectChevronClassName(density: GeneratedRecordFieldControlDensity) {
  return ["ms-auto shrink-0 text-current/60", density === "compact" ? "size-3.5" : "size-4"].join(
    " ",
  );
}

function RecordTextFieldRenderer({
  canPatch,
  commitPolicy,
  density,
  draft,
  error,
  fieldControl,
  isPending,
  labelClass,
  onDraftChange,
  onDraftRevert,
  onValueCommit,
}: {
  canPatch: boolean;
  commitPolicy: RecordFieldConfig["commit"];
  density: GeneratedRecordFieldControlDensity;
  draft: string;
  error: string | null;
  fieldControl: GeneratedFieldControl;
  isPending: boolean;
  labelClass: string;
  onDraftChange: (value: string) => void;
  onDraftRevert: () => void;
  onValueCommit: (value: FieldValue) => void;
}) {
  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      onValueCommit(inputValueToFieldValue(fieldControl.field, event.currentTarget.value));
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onDraftRevert();
    }
  }

  return (
    <div
      className={density === "compact" ? "w-full min-w-0 space-y-1" : "min-w-52 flex-1 space-y-1"}
    >
      <TextField
        isDisabled={!canPatch || isPending}
        isInvalid={error !== null}
        isRequired={fieldControl.required}
        onChange={onDraftChange}
        type={fieldControl.control.kind === "input" ? fieldControl.control.inputType : "text"}
        value={draft}
      >
        <Label className={labelClass}>{fieldControl.label}</Label>
        <Input
          aria-label={fieldControl.label}
          className={
            density === "compact"
              ? compactNativeInputClassName
              : "w-full rounded border border-slate-300 px-3 py-2"
          }
          onBlur={(event) => {
            if (commitPolicy === "field-commit") {
              onValueCommit(inputValueToFieldValue(fieldControl.field, event.currentTarget.value));
            }
          }}
          onKeyDown={handleInputKeyDown}
          {...fieldControl.inputAttributes}
        />
        {error ? <FieldError>{error}</FieldError> : null}
      </TextField>
    </div>
  );
}

function RecordTextareaFieldRenderer({
  canPatch,
  commitPolicy,
  density,
  draft,
  error,
  field,
  fieldControl,
  isPending,
  labelClass,
  onDraftChange,
  onDraftRevert,
  onValueCommit,
}: {
  canPatch: boolean;
  commitPolicy: RecordFieldConfig["commit"];
  density: GeneratedRecordFieldControlDensity;
  draft: string;
  error: string | null;
  field: FieldSchema;
  fieldControl: GeneratedFieldControl;
  isPending: boolean;
  labelClass: string;
  onDraftChange: (value: string) => void;
  onDraftRevert: () => void;
  onValueCommit: (value: FieldValue) => void;
}) {
  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onDraftRevert();
    }
  }

  return (
    <div
      className={density === "compact" ? "w-full min-w-0 space-y-1" : "min-w-52 flex-1 space-y-1"}
    >
      <TextField
        isDisabled={!canPatch || isPending}
        isInvalid={error !== null}
        isRequired={fieldControl.required}
        onChange={onDraftChange}
        value={draft}
      >
        <Label className={labelClass}>{fieldControl.label}</Label>
        <Textarea
          aria-label={fieldControl.label}
          className={
            density === "compact"
              ? compactNativeTextareaClassName
              : "min-h-28 w-full rounded border border-slate-300 px-3 py-2"
          }
          onBlur={(event) => {
            if (commitPolicy === "field-commit") {
              onValueCommit(inputValueToFieldValue(field, event.currentTarget.value));
            }
          }}
          onKeyDown={handleTextareaKeyDown}
        />
        {error ? <FieldError>{error}</FieldError> : null}
      </TextField>
    </div>
  );
}

function RecordNumberFieldRenderer({
  canPatch,
  commitPolicy,
  density,
  draft,
  error,
  fieldControl,
  isPending,
  labelClass,
  numberFormat,
  onDraftChange,
  onDraftRevert,
  onErrorChange,
  onValueCommit,
}: {
  canPatch: boolean;
  commitPolicy: RecordFieldConfig["commit"];
  density: GeneratedRecordFieldControlDensity;
  draft: string;
  error: string | null;
  fieldControl: GeneratedFieldControl;
  isPending: boolean;
  labelClass: string;
  numberFormat: TableColumnFormat;
  onDraftChange: (value: string) => void;
  onDraftRevert: () => void;
  onErrorChange: (message: string | null) => void;
  onValueCommit: (value: FieldValue) => void;
}) {
  return (
    <div className={recordNumberFieldContainerClassName(density)}>
      <TextField
        isDisabled={!canPatch || isPending}
        isInvalid={error !== null}
        isRequired={fieldControl.required}
      >
        <Label className={labelClass}>{fieldControl.label}</Label>
        <span className="block w-full" data-slot="control">
          <GeneratedNumberFieldControl
            aria-label={fieldControl.label}
            className={
              density === "compact"
                ? compactNativeInputClassName
                : "w-full rounded border border-slate-300 px-3 py-2"
            }
            commitOnBlur={commitPolicy === "field-commit"}
            disabled={!canPatch || isPending}
            format={numberFormat}
            onInvalidCommit={(message) => {
              onErrorChange(message);
            }}
            onValueChange={onDraftChange}
            onValueCommit={(value) => {
              onErrorChange(null);
              onValueCommit(value);
            }}
            onValueRevert={onDraftRevert}
            required={fieldControl.required}
            value={draft}
            {...fieldControl.inputAttributes}
          />
        </span>
        {error ? <FieldError>{error}</FieldError> : null}
      </TextField>
    </div>
  );
}

function RecordValueUnitFieldRenderer({
  canPatch,
  commitPolicy,
  density,
  draft,
  error,
  fieldName,
  fieldControl,
  isPending,
  labelClass,
  numberFormat,
  onDraftChange,
  onDraftRevert,
  onErrorChange,
  onPatchValues,
  onUnitDraftChange,
  onUnitDraftRevert,
  unitDraft,
  valueUnit,
}: {
  canPatch: boolean;
  commitPolicy: RecordFieldConfig["commit"];
  density: GeneratedRecordFieldControlDensity;
  draft: string;
  error: string | null;
  fieldName: string;
  fieldControl: GeneratedFieldControl;
  isPending: boolean;
  labelClass: string;
  numberFormat: TableColumnFormat;
  onDraftChange: (value: string) => void;
  onDraftRevert: () => void;
  onErrorChange: (message: string | null) => void;
  onPatchValues: (values: Partial<RecordValues>) => void;
  onUnitDraftChange: (value: string) => void;
  onUnitDraftRevert: () => void;
  unitDraft: string;
  valueUnit: NonNullable<RecordFieldConfig["valueUnit"]>;
}) {
  return (
    <div className={recordNumberFieldContainerClassName(density)}>
      <TextField
        isDisabled={!canPatch || isPending}
        isInvalid={error !== null}
        isRequired={fieldControl.required}
      >
        <Label className={labelClass}>{fieldControl.label}</Label>
        <div data-slot="control">
          <ValueUnitInput
            className="w-full"
            commitOnBlur={commitPolicy === "field-commit"}
            decode={(value) => decodeNumberEditorInputValue(value, numberFormat)}
            disabled={!canPatch || isPending}
            encode={(value) => encodeNumberEditorInputValue(value, numberFormat)}
            inputClassName={
              density === "compact"
                ? compactNativeInputClassName
                : "rounded border border-slate-300 px-3 py-2"
            }
            inputRequired={fieldControl.required}
            inputValue={draft}
            label={fieldControl.label}
            onInputValueChange={onDraftChange}
            onInputValueCommit={(value) => {
              onErrorChange(null);
              onPatchValues({
                [fieldName]: value,
                [valueUnit.unitFieldName]: inputValueToFieldValue(valueUnit.unitField, unitDraft),
              });
            }}
            onInputValueRevert={() => {
              onDraftRevert();
              onUnitDraftRevert();
            }}
            onInvalidCommit={(message) => {
              onErrorChange(message);
            }}
            onUnitChange={onUnitDraftChange}
            onUnitCommit={(unit) => {
              onErrorChange(null);
              onPatchValues(valueUnitPatch(fieldName, draft, numberFormat, valueUnit, unit));
            }}
            options={enumValueUnitOptions(valueUnit.unitField)}
            unit={unitDraft}
            unitClassName={density === "compact" ? "w-16" : "w-24"}
            unitLabel={`${fieldControl.label} unit`}
            unitRequired={valueUnit.unitField.required}
          />
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
      </TextField>
    </div>
  );
}

function RecordMarkdownFieldRenderer({
  canPatch,
  commitPolicy,
  density,
  draft,
  error,
  field,
  fieldControl,
  isPending,
  labelClass,
  onDraftChange,
  onDraftRevert,
  onValueCommit,
}: {
  canPatch: boolean;
  commitPolicy: RecordFieldConfig["commit"];
  density: GeneratedRecordFieldControlDensity;
  draft: string;
  error: string | null;
  field: FieldSchema;
  fieldControl: GeneratedFieldControl;
  isPending: boolean;
  labelClass: string;
  onDraftChange: (value: string) => void;
  onDraftRevert: () => void;
  onValueCommit: (value: FieldValue) => void;
}) {
  function handleMarkdownBlur(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;

    if (nextTarget && event.currentTarget.contains(nextTarget as Node)) {
      return;
    }

    if (commitPolicy === "field-commit") {
      onValueCommit(inputValueToFieldValue(field, draft));
    }
  }

  function handleMarkdownKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onDraftRevert();
    }
  }

  return (
    <div className={recordSpecializedFieldContainerClassName(density, "markdown")}>
      <TextField
        isDisabled={!canPatch || isPending}
        isInvalid={error !== null}
        isRequired={fieldControl.required}
      >
        <Label className={labelClass}>{fieldControl.label}</Label>
        <div data-slot="control">
          <GeneratedMarkdownFieldControl
            ariaInvalid={error !== null}
            label={fieldControl.label}
            onBlur={handleMarkdownBlur}
            onChange={onDraftChange}
            onKeyDown={handleMarkdownKeyDown}
            readOnly={!canPatch || isPending}
            value={draft}
          />
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
      </TextField>
    </div>
  );
}

function RecordColorFieldRenderer({
  canPatch,
  commitPolicy,
  density,
  draft,
  error,
  field,
  fieldControl,
  isPending,
  labelClass,
  onDraftChange,
  onValueCommit,
}: {
  canPatch: boolean;
  commitPolicy: RecordFieldConfig["commit"];
  density: GeneratedRecordFieldControlDensity;
  draft: string;
  error: string | null;
  field: FieldSchema;
  fieldControl: GeneratedFieldControl;
  isPending: boolean;
  labelClass: string;
  onDraftChange: (value: string) => void;
  onValueCommit: (value: FieldValue) => void;
}) {
  return (
    <div className={recordSpecializedFieldContainerClassName(density, "color")}>
      <TextField
        isDisabled={!canPatch || isPending}
        isInvalid={error !== null}
        isRequired={fieldControl.required}
      >
        <Label className={labelClass}>{fieldControl.label}</Label>
        <GeneratedColorFieldControl
          className={
            density === "compact"
              ? "w-full [&_button]:h-6 [&_input]:h-6 [&_input]:py-0.5 [&_input]:text-xs/4 sm:[&_input]:py-0.5 sm:[&_input]:text-xs/4 md:[&_input]:text-xs/4"
              : "w-full"
          }
          disabled={!canPatch || isPending}
          error={error ?? undefined}
          label={fieldControl.label}
          onBlur={() => {
            if (commitPolicy === "field-commit") {
              onValueCommit(inputValueToFieldValue(field, draft));
            }
          }}
          onChange={onDraftChange}
          required={fieldControl.required}
          value={draft}
        />
      </TextField>
    </div>
  );
}

function RecordDateFieldRenderer({
  canPatch,
  commitPolicy,
  density,
  draft,
  error,
  field,
  fieldControl,
  isPending,
  labelClass,
  onDraftChange,
  onDraftRevert,
  onValueCommit,
  quietVisibility,
}: {
  canPatch: boolean;
  commitPolicy: RecordFieldConfig["commit"];
  density: GeneratedRecordFieldControlDensity;
  draft: string;
  error: string | null;
  field: FieldSchema;
  fieldControl: GeneratedFieldControl;
  isPending: boolean;
  labelClass: string;
  onDraftChange: (value: string) => void;
  onDraftRevert: () => void;
  onValueCommit: (value: FieldValue) => void;
  quietVisibility: boolean;
}) {
  const dateResult = storedDateValueToDateValue(draft);
  const errorMessage = error ?? (dateResult.kind === "invalid" ? dateResult.message : null);
  const latestStoredValueRef = useRef(draft);
  const pickerOpenRef = useRef(false);
  const pickerCommittedStoredValueRef = useRef<string | null>(null);
  const quiet = quietVisibility && draft === "" && errorMessage === null;

  latestStoredValueRef.current = draft;

  function commitStoredValue(value: string) {
    onValueCommit(inputValueToFieldValue(field, value));
  }

  function handleDateChange(value: DateValue | null) {
    const nextStoredValue = dateValueToStoredDateValue(value);

    latestStoredValueRef.current = nextStoredValue;
    onDraftChange(nextStoredValue);

    if (commitPolicy === "field-commit" && pickerOpenRef.current) {
      pickerCommittedStoredValueRef.current = nextStoredValue;
      commitStoredValue(nextStoredValue);
    }
  }

  function handleDatePickerBlur(event: FocusEvent<Element>) {
    const relatedTarget = event.relatedTarget;

    if (
      typeof Node !== "undefined" &&
      relatedTarget instanceof Node &&
      event.currentTarget.contains(relatedTarget)
    ) {
      return;
    }

    if (pickerCommittedStoredValueRef.current === latestStoredValueRef.current) {
      pickerCommittedStoredValueRef.current = null;
      return;
    }

    if (commitPolicy === "field-commit") {
      commitStoredValue(latestStoredValueRef.current);
    }
  }

  function handleDatePickerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target;
    const targetRole =
      typeof HTMLElement !== "undefined" && target instanceof HTMLElement
        ? target.getAttribute("role")
        : null;

    if (event.key === "Enter") {
      if (targetRole !== "spinbutton") {
        return;
      }

      event.preventDefault();
      commitStoredValue(latestStoredValueRef.current);
      return;
    }

    if (event.key === "Escape") {
      if (pickerOpenRef.current || targetRole !== "spinbutton") {
        return;
      }

      event.preventDefault();
      onDraftRevert();
    }
  }

  return (
    <div
      className={[
        recordSpecializedFieldContainerClassName(density, "date"),
        quietValueOrInteractionClassName(quiet),
      ]
        .filter(Boolean)
        .join(" ")}
      data-formless-field-presentation-visibility={
        quietVisibility ? "valueOrInteraction" : undefined
      }
    >
      <DatePicker
        className="w-full"
        isDisabled={!canPatch || isPending}
        isInvalid={errorMessage !== null}
        isRequired={fieldControl.required}
        onBlur={handleDatePickerBlur}
        onChange={handleDateChange}
        onKeyDown={handleDatePickerKeyDown}
        onOpenChange={(open) => {
          pickerOpenRef.current = open;
        }}
        value={dateResult.value}
      >
        <Label className={labelClass}>{fieldControl.label}</Label>
        <DatePickerTrigger className={recordDatePickerTriggerClassName(density)} />
        {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
      </DatePicker>
    </div>
  );
}

function recordDatePickerTriggerClassName(density: GeneratedRecordFieldControlDensity) {
  if (density !== "compact") {
    return undefined;
  }

  return [
    "h-6",
    "[&_[data-slot=control]]:h-6",
    "[&_[data-slot=control]]:rounded",
    "[&_[data-slot=control]]:px-2",
    "[&_[data-slot=control]]:py-0.5",
    "sm:[&_[data-slot=control]]:px-2",
    "sm:[&_[data-slot=control]]:py-0.5",
    "[&_[data-slot=date-picker-trigger]]:px-2",
    "[&_[data-slot=date-picker-trigger]]:py-0",
    "sm:[&_[data-slot=date-picker-trigger]]:px-2",
    "sm:[&_[data-slot=date-picker-trigger]]:py-0",
    "[&_[data-slot=date-picker-trigger]>svg]:size-3.5",
    "[&_[role=spinbutton]]:text-xs/4",
    "sm:[&_[role=spinbutton]]:text-xs/4",
    "md:[&_[role=spinbutton]]:text-xs/4",
  ].join(" ");
}

function RecordIconFieldRenderer({
  canPatch,
  density,
  error,
  fieldControl,
  iconDialogDraft,
  iconDialogOpen,
  isPending,
  labelClass,
  onIconCancel,
  onIconDraftChange,
  onIconOpenChange,
  onIconSave,
  previewSource,
}: {
  canPatch: boolean;
  density: GeneratedRecordFieldControlDensity;
  error: string | null;
  fieldControl: GeneratedFieldControl;
  iconDialogDraft: string;
  iconDialogOpen: boolean;
  isPending: boolean;
  labelClass: string;
  onIconCancel: () => void;
  onIconDraftChange: (value: string) => void;
  onIconOpenChange: (open: boolean) => void;
  onIconSave: () => Promise<void>;
  previewSource: string;
}) {
  return (
    <div className={recordSpecializedFieldContainerClassName(density, "icon")}>
      <TextField isDisabled={!canPatch || isPending} isInvalid={error !== null}>
        <Label className={labelClass}>{fieldControl.label}</Label>
        <div data-slot="control">
          <GeneratedIconPickerFieldControl
            ariaInvalid={error !== null ? true : undefined}
            canEdit={canPatch}
            density={density}
            error={error}
            isPending={isPending}
            label={fieldControl.label}
            onCancel={onIconCancel}
            onChange={onIconDraftChange}
            onOpenChange={onIconOpenChange}
            onSave={onIconSave}
            open={iconDialogOpen}
            previewSource={previewSource}
            readOnly={!canPatch || isPending}
            value={iconDialogDraft}
          />
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
      </TextField>
    </div>
  );
}

function RecordMediaFieldRenderer({
  canPatch,
  density,
  draft,
  error,
  field,
  fieldControl,
  fieldKind,
  mediaAssetOptions,
  mediaEditorMode,
  mediaPreviewHref,
  isPending,
  labelClass,
  onDraftChange,
  onDraftRevert,
  onImageFileSelect,
  onMediaAssetSelect,
  onValueCommit,
  uploadEnabled,
}: {
  canPatch: boolean;
  density: GeneratedRecordFieldControlDensity;
  draft: string;
  error: string | null;
  field: FieldSchema;
  fieldControl: GeneratedFieldControl;
  fieldKind: "image" | "media";
  mediaAssetOptions: ImageMediaAssetOption[];
  mediaEditorMode: "asset" | "url";
  mediaPreviewHref?: string;
  isPending: boolean;
  labelClass: string;
  onDraftChange: (value: string) => void;
  onDraftRevert: () => void;
  onImageFileSelect: (file: File | undefined) => void;
  onMediaAssetSelect: (assetId: string) => void;
  onValueCommit: (value: FieldValue) => void;
  uploadEnabled: boolean;
}) {
  return (
    <div className={recordSpecializedFieldContainerClassName(density, fieldKind)}>
      <Label className={labelClass}>{fieldControl.label}</Label>
      <MediaFieldControl
        canPatch={canPatch}
        density={density}
        draft={draft}
        error={error}
        fieldKind={fieldKind}
        mediaAssetOptions={mediaAssetOptions}
        mediaEditorMode={mediaEditorMode}
        mediaPreviewHref={mediaPreviewHref}
        isPending={isPending}
        label={fieldControl.label}
        onDraftChange={onDraftChange}
        onFileSelect={onImageFileSelect}
        onMediaAssetSelect={onMediaAssetSelect}
        onUrlCommit={(value) => {
          onValueCommit(inputValueToFieldValue(field, value));
        }}
        onUrlRevert={onDraftRevert}
        required={fieldControl.required}
        uploadEnabled={uploadEnabled}
      />
    </div>
  );
}

function RecordAutosizeTextFieldRenderer({
  canPatch,
  commitPolicy,
  density,
  draft,
  error,
  field,
  fieldControl,
  isPending,
  labelClass,
  onDraftChange,
  onDraftRevert,
  onValueCommit,
  presentation,
}: {
  canPatch: boolean;
  commitPolicy: RecordFieldConfig["commit"];
  density: GeneratedRecordFieldControlDensity;
  draft: string;
  error: string | null;
  field: FieldSchema;
  fieldControl: GeneratedFieldControl;
  isPending: boolean;
  labelClass: string;
  onDraftChange: (value: string) => void;
  onDraftRevert: () => void;
  onValueCommit: (value: FieldValue) => void;
  presentation: GeneratedRecordFieldControlPresentation;
}) {
  const isHeadingTextEditor = presentation === "heading";

  return (
    <div className={recordSpecializedFieldContainerClassName(density, "autosize-text")}>
      <TextField
        isDisabled={!canPatch || isPending}
        isInvalid={error !== null}
        isRequired={fieldControl.required}
      >
        <Label className={labelClass}>{fieldControl.label}</Label>
        <AutosizeTextInput
          aria-invalid={error !== null ? true : undefined}
          aria-label={fieldControl.label}
          autoSelect
          className={
            isHeadingTextEditor
              ? "w-full min-w-0"
              : density === "compact"
                ? "w-full min-w-0"
                : "min-w-[8ch] max-w-full"
          }
          commitOnBlur={commitPolicy === "field-commit"}
          controlClassName={
            isHeadingTextEditor
              ? "h-9 w-full text-2xl font-semibold"
              : density === "compact"
                ? "h-6 w-full text-xs"
                : "h-7 w-full text-sm font-medium"
          }
          disabled={!canPatch || isPending}
          onValueChange={onDraftChange}
          onValueCommit={(value) => {
            onValueCommit(inputValueToFieldValue(field, value));
          }}
          onValueRevert={onDraftRevert}
          placeholder={fieldControl.label}
          required={fieldControl.required}
          type="text"
          value={draft}
          {...fieldControl.inputAttributes}
        />
        {error ? <FieldError>{error}</FieldError> : null}
      </TextField>
    </div>
  );
}

function recordSpecializedFieldContainerClassName(
  density: GeneratedRecordFieldControlDensity,
  rendererKind: GeneratedRecordFieldRendererKind,
) {
  if (density === "compact") {
    return "w-full min-w-0 space-y-1";
  }

  if (rendererKind === "date") {
    return "w-fit max-w-full min-w-36 flex-none space-y-1";
  }

  return "min-w-52 flex-1 space-y-1";
}

function recordNumberFieldContainerClassName(density: GeneratedRecordFieldControlDensity) {
  return density === "compact" ? "w-full min-w-0 space-y-1" : "min-w-36 flex-none space-y-1";
}

function MediaFieldControl({
  canPatch,
  density,
  draft,
  error,
  fieldKind,
  mediaAssetOptions,
  mediaEditorMode,
  mediaPreviewHref,
  isPending,
  label,
  onDraftChange,
  onFileSelect,
  onMediaAssetSelect,
  onUrlCommit,
  onUrlRevert,
  required,
  uploadEnabled,
}: {
  canPatch: boolean;
  density: GeneratedRecordFieldControlDensity;
  draft: string;
  error: string | null;
  fieldKind: "image" | "media";
  mediaAssetOptions: ImageMediaAssetOption[];
  mediaEditorMode: "asset" | "url";
  mediaPreviewHref?: string;
  isPending: boolean;
  label: string;
  onDraftChange: (value: string) => void;
  onFileSelect: (file: File | undefined) => void;
  onMediaAssetSelect: (assetId: string) => void;
  onUrlCommit: (value: string) => void;
  onUrlRevert: () => void;
  required: boolean;
  uploadEnabled: boolean;
}) {
  const uploadDisabled = !canPatch || isPending || !uploadEnabled;
  const [previewFailed, setPreviewFailed] = useState(false);
  const previewHref = mediaEditorMode === "asset" ? mediaPreviewHref : draft;
  const previewState =
    draft === "" ? "empty" : previewHref === undefined || previewFailed ? "broken" : "image";
  const assetLabel = mediaEditorMode === "asset" ? mediaAssetLabel(label) : label;
  const inputLabel = mediaEditorMode === "asset" ? `${assetLabel} id` : `${label} URL`;
  const unknownAssetSelected =
    mediaEditorMode === "asset" &&
    draft !== "" &&
    !mediaAssetOptions.some((asset) => asset.id === draft);
  const previewClassName =
    density === "compact"
      ? `relative flex h-16 w-full items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50 ${
          uploadDisabled
            ? "cursor-not-allowed opacity-70"
            : "cursor-pointer hover:border-slate-300 hover:bg-slate-100"
        }`
      : `relative flex aspect-[4/3] max-h-72 w-full items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50 ${
          uploadDisabled
            ? "cursor-not-allowed opacity-70"
            : "cursor-pointer hover:border-slate-300 hover:bg-slate-100"
        }`;

  useEffect(() => {
    setPreviewFailed(false);
  }, [previewHref]);

  function handleUrlKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      onUrlCommit(event.currentTarget.value);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onUrlRevert();
    }
  }

  return (
    <div
      className={density === "compact" ? "w-full min-w-0 space-y-2" : "w-full min-w-0 space-y-3"}
      data-web-field-kind={fieldKind}
      data-web-media-field-mode={fieldKind === "media" ? mediaEditorMode : undefined}
    >
      <label
        className={previewClassName}
        data-web-image-field-preview={previewState}
        data-web-image-field-upload="trigger"
        data-web-media-field-preview={fieldKind === "media" ? previewState : undefined}
        data-web-media-field-upload={fieldKind === "media" ? "trigger" : undefined}
        title={`Upload ${label}`}
      >
        {previewState === "empty" ? (
          <span aria-hidden="true" className="text-2xl leading-none text-slate-500">
            +
          </span>
        ) : previewState === "broken" ? (
          <span className="px-3 text-center text-xs font-medium text-slate-500">Missing image</span>
        ) : (
          <img
            alt={`${label} preview`}
            className="h-full w-full object-contain"
            loading="lazy"
            onError={() => setPreviewFailed(true)}
            src={previewHref ?? ""}
          />
        )}
        <input
          accept={SITE_IMAGE_UPLOAD_ACCEPT}
          aria-label={`Upload ${label}`}
          className="sr-only"
          disabled={uploadDisabled}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];

            event.currentTarget.value = "";
            onFileSelect(file);
          }}
          type="file"
        />
      </label>
      {mediaEditorMode === "asset" ? (
        <NativeSelect>
          <Label className="sr-only">{assetLabel}</Label>
          <NativeSelectContent
            aria-label={assetLabel}
            className={density === "compact" ? compactNativeSelectClassName : undefined}
            disabled={!canPatch || isPending}
            onChange={(event) => {
              const value = event.currentTarget.value;

              onDraftChange(value);
              onMediaAssetSelect(value);
            }}
            value={draft}
          >
            {!required || draft === "" ? <option value="" /> : null}
            {unknownAssetSelected ? <option value={draft}>Current asset: {draft}</option> : null}
            {mediaAssetOptions.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.label}
              </option>
            ))}
          </NativeSelectContent>
        </NativeSelect>
      ) : null}
      <TextField
        isDisabled={!canPatch || isPending}
        isInvalid={error !== null}
        isRequired={required}
      >
        <Label className="sr-only">{inputLabel}</Label>
        <Input
          aria-invalid={error !== null ? true : undefined}
          aria-label={inputLabel}
          className={
            density === "compact"
              ? compactNativeInputClassName
              : "w-full rounded border border-slate-300 px-3 py-2"
          }
          disabled={!canPatch || isPending}
          onBlur={(event) => onUrlCommit(event.currentTarget.value)}
          onChange={(event) => onDraftChange(event.currentTarget.value)}
          onKeyDown={handleUrlKeyDown}
          placeholder={inputLabel}
          required={required}
          type="text"
          value={draft}
        />
        {error ? <FieldError>{error}</FieldError> : null}
      </TextField>
    </div>
  );
}

function mediaAssetLabel(label: string) {
  return label.toLowerCase().includes("asset") ? label : `${label} asset`;
}

function valueUnitPatch(
  fieldName: string,
  draft: string,
  numberFormat: TableColumnFormat,
  valueUnitConfig: NonNullable<RecordFieldConfig["valueUnit"]>,
  unit: string,
): Partial<RecordValues> {
  const patch: Partial<RecordValues> = {
    [valueUnitConfig.unitFieldName]: inputValueToFieldValue(valueUnitConfig.unitField, unit),
  };
  const amount = decodeNumberEditorInputValue(draft, numberFormat);

  if (amount.kind === "valid") {
    patch[fieldName] = amount.value;
  }

  return patch;
}

function enumValueUnitOptions(field: NonNullable<RecordFieldConfig["valueUnit"]>["unitField"]) {
  return Object.entries(field.values).map(([value, option]) => ({
    value,
    label: option.label,
  }));
}

function RecordReferenceFieldControl({
  canPatch,
  density = "default",
  draft,
  error,
  field,
  isPending,
  label,
  labelClass,
  onCommit,
  onDraftChange,
}: {
  canPatch: boolean;
  density?: GeneratedRecordFieldControlDensity;
  draft: string;
  error: string | null;
  field: Extract<FieldSchema, { type: "reference" }>;
  isPending: boolean;
  label: string;
  labelClass: string;
  onCommit: (value: FieldValue) => void;
  onDraftChange: (value: string) => void;
}) {
  const options = useReferenceOptions(field.to, field.displayField);
  const unknownValue =
    draft !== "" && !options.some((option) => option.id === draft) ? draft : null;

  return (
    <div
      className={
        density === "compact" ? "w-full min-w-0 space-y-1" : "min-w-48 flex-none space-y-1"
      }
    >
      <NativeSelect>
        <Label className={labelClass}>{label}</Label>
        <NativeSelectContent
          aria-label={label}
          className={density === "compact" ? compactNativeSelectClassName : undefined}
          disabled={!canPatch || isPending}
          onChange={(event) => {
            const value = event.currentTarget.value;

            onDraftChange(value);
            onCommit(inputValueToFieldValue(field, value));
          }}
          required={field.required}
          value={draft}
        >
          {!field.required || draft === "" ? <option value="" /> : null}
          {unknownValue ? <option value={unknownValue}>{unknownValue}</option> : null}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </NativeSelectContent>
      </NativeSelect>
      {error ? <StaticFieldError>{error}</StaticFieldError> : null}
    </div>
  );
}

function StaticFieldError({ children }: { children: string }) {
  return (
    <div className={fieldErrorStyles()} data-slot="field-error" role="alert" slot="errorMessage">
      {children}
    </div>
  );
}
