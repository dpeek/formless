import { Button } from "@dpeek/formless-ui/button";
import { Checkbox } from "@dpeek/formless-ui/checkbox";
import { DatePicker, DatePickerTrigger } from "@dpeek/formless-ui/date-picker";
import {
  ModalBody,
  ModalClose,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@dpeek/formless-ui/modal";
import { FieldError, Label, fieldErrorStyles } from "@dpeek/formless-ui/field";
import { Input } from "@dpeek/formless-ui/input";
import { NativeSelect, NativeSelectContent } from "@dpeek/formless-ui/native-select";
import { parseSvgIconSource, SvgIcon } from "@dpeek/formless-ui/svg-icon";
import { TextField } from "@dpeek/formless-ui/text-field";
import { Textarea } from "@dpeek/formless-ui/textarea";
import { AutosizeTextInput } from "@dpeek/formless-ui/text-input";
import { ValueUnitInput } from "@dpeek/formless-ui/value-unit-input";
import type { DateValue } from "@internationalized/date";
import type { FocusEvent, KeyboardEvent } from "react";
import { useRef } from "react";
import { SITE_IMAGE_UPLOAD_ACCEPT } from "../../client/media.ts";
import { useReferenceOptions } from "../../client/store.ts";
import { fieldLabel, type RecordFieldConfig } from "../../client/views.ts";
import type { FieldValue, RecordValues } from "../../shared/protocol.ts";
import type { FieldSchema, TableColumnFormat } from "../../shared/schema.ts";
import {
  GeneratedColorFieldControl,
  GeneratedIconSourceFieldControl,
  GeneratedMarkdownFieldControl,
  GeneratedNumberFieldControl,
} from "./field-control-primitives.tsx";
import { dateValueToStoredDateValue, storedDateValueToDateValue } from "./date-value.ts";
import { selectGeneratedFieldControl } from "./field-controls.ts";
import {
  decodeNumberEditorInputValue,
  encodeNumberEditorInputValue,
  inputValueToFieldValue,
} from "./format.ts";
import {
  completionCheckboxClassName,
  enumValuePresentation,
  fieldPresentationIconButtonClassName,
  GeneratedFieldPresentationIcon,
  quietValueOrInteractionClassName,
} from "./field-presentation.tsx";
import type { GeneratedFieldControl } from "./field-controls.ts";
import {
  selectGeneratedRecordFieldRendererKind,
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
  onPatchValues,
  onUnitDraftChange,
  onUnitDraftRevert,
  onValueCommit,
  presentation = "default",
  recordValue,
  showLabel = false,
  unitDraft,
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
  onPatchValues: (values: Partial<RecordValues>) => void;
  onUnitDraftChange: (value: string) => void;
  onUnitDraftRevert: () => void;
  onValueCommit: (value: FieldValue) => void;
  presentation?: GeneratedRecordFieldControlPresentation;
  recordValue: FieldValue | undefined;
  showLabel?: boolean;
  unitDraft: string;
  uploadEnabled: boolean;
}) {
  const { commit: commitPolicy, editor, field, fieldName } = fieldConfig;
  const label = fieldConfig.label ?? fieldLabel(fieldName, field);
  const fieldControl = selectGeneratedFieldControl({ editor, field, label });
  const controlDensity = density === "compact" && showLabel ? "default" : density;
  const labelClass =
    showLabel && presentation !== "heading" ? "text-xs font-medium text-slate-600" : "sr-only";
  const rendererKind = selectGeneratedRecordFieldRendererKind({
    density: controlDensity,
    fieldConfig,
    fieldControl,
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
        isPending={isPending}
        labelClass={labelClass}
        onDraftChange={onDraftChange}
        onDraftRevert={onDraftRevert}
        onImageFileSelect={onImageFileSelect}
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
  isPending,
  onDraftChange,
  onValueCommit,
}: {
  canPatch: boolean;
  density: GeneratedRecordFieldControlDensity;
  draft: string;
  error: string | null;
  fieldControl: Extract<GeneratedFieldControl, { kind: "enum" }>;
  isPending: boolean;
  onDraftChange: (value: string) => void;
  onValueCommit: (value: FieldValue) => void;
}) {
  const option = fieldControl.field.values[draft];
  const presentation = enumValuePresentation({ option, value: draft });
  const label = draft === "" ? "None" : presentation.label;
  const accessibleLabel = `${fieldControl.label}: ${label}`;
  const iconSizeClassName = density === "compact" ? "size-3.5" : "size-4.5";
  const nextValue = nextEnumIconOnlyValue(fieldControl.field, draft);

  return (
    <div
      className={
        density === "compact" ? "flex h-6 shrink-0 items-center" : "flex h-8 shrink-0 items-center"
      }
    >
      <Button
        aria-label={accessibleLabel}
        className={fieldPresentationIconButtonClassName(presentation.color.intent)}
        data-formless-field-presentation-color={presentation.color.intent}
        data-formless-field-presentation-color-token={presentation.color.token}
        data-formless-field-presentation-icon={option?.presentation?.icon}
        data-formless-field-presentation-mode="iconOnly"
        isDisabled={!canPatch || isPending}
        onPress={() => {
          onDraftChange(nextValue);
          onValueCommit(inputValueToFieldValue(fieldControl.field, nextValue));
        }}
        size={density === "compact" ? "sq-xs" : "sq-sm"}
        type="button"
        intent="plain"
      >
        {presentation.icon ? (
          <GeneratedFieldPresentationIcon className={iconSizeClassName} icon={presentation.icon} />
        ) : (
          <span className="px-1 text-xs">{label}</span>
        )}
      </Button>
      {error ? <StaticFieldError>{error}</StaticFieldError> : null}
    </div>
  );
}

function nextEnumIconOnlyValue(
  field: Extract<FieldSchema, { type: "enum" }>,
  currentValue: string,
) {
  const values = Object.keys(field.values);
  const candidates = field.required ? values : ["", ...values];
  const currentIndex = candidates.indexOf(currentValue);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % candidates.length;

  return candidates[nextIndex] ?? "";
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
          <IconFieldControl
            canPatch={canPatch}
            density={density}
            draft={iconDialogDraft}
            error={error}
            isPending={isPending}
            label={fieldControl.label}
            onCancel={onIconCancel}
            onDraftChange={onIconDraftChange}
            onOpenChange={onIconOpenChange}
            onSave={onIconSave}
            open={iconDialogOpen}
            previewSource={previewSource}
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
  isPending,
  labelClass,
  onDraftChange,
  onDraftRevert,
  onImageFileSelect,
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
  isPending: boolean;
  labelClass: string;
  onDraftChange: (value: string) => void;
  onDraftRevert: () => void;
  onImageFileSelect: (file: File | undefined) => void;
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
        isPending={isPending}
        label={fieldControl.label}
        onDraftChange={onDraftChange}
        onFileSelect={onImageFileSelect}
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

function IconFieldControl({
  canPatch,
  density,
  draft,
  error,
  isPending,
  label,
  onCancel,
  onDraftChange,
  onOpenChange,
  onSave,
  open,
  previewSource,
}: {
  canPatch: boolean;
  density: GeneratedRecordFieldControlDensity;
  draft: string;
  error: string | null;
  isPending: boolean;
  label: string;
  onCancel: () => void;
  onDraftChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => Promise<void>;
  open: boolean;
  previewSource: string;
}) {
  const hasRenderableIcon = parseSvgIconSource(previewSource) !== null;
  const triggerSize = density === "compact" ? "sq-xs" : "sq-sm";
  const iconSizeClassName = density === "compact" ? "size-4" : "size-5";
  const triggerClassName = hasRenderableIcon
    ? "border-transparent bg-transparent p-0 text-slate-700 hover:bg-slate-100"
    : "border-dashed border-slate-300 bg-slate-50 p-0 text-slate-500 hover:border-slate-400 hover:bg-slate-100";

  return (
    <>
      <div
        className={
          density === "compact"
            ? "flex h-6 w-full min-w-0 items-center"
            : "flex min-h-8 w-full min-w-0 items-center"
        }
        data-web-field-kind="icon"
      >
        <Button
          aria-label={`Edit ${label}`}
          className={triggerClassName}
          data-web-icon-field-edit="trigger"
          data-web-icon-field-empty={hasRenderableIcon ? undefined : "true"}
          data-web-icon-field-preview="compact"
          isDisabled={!canPatch || isPending}
          onPress={() => onOpenChange(true)}
          size={triggerSize}
          type="button"
          intent="plain"
        >
          <SvgIcon className={iconSizeClassName} source={previewSource} />
        </Button>
      </div>
      <ModalContent
        isOpen={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            onOpenChange(true);
          } else {
            onCancel();
          }
        }}
        size="2xl"
      >
        <ModalHeader>
          <ModalTitle>Edit {label}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <TextField isDisabled={!canPatch || isPending} isInvalid={error !== null}>
            <Label className="sr-only">{label} SVG source</Label>
            <div data-slot="control">
              <GeneratedIconSourceFieldControl
                ariaInvalid={error !== null ? true : undefined}
                label={label}
                onChange={onDraftChange}
                readOnly={!canPatch || isPending}
                sourceLabel={`${label} SVG source`}
                value={draft}
              />
            </div>
            {error ? <FieldError>{error}</FieldError> : null}
          </TextField>
          <ModalFooter>
            <ModalClose intent="outline" type="button">
              Cancel
            </ModalClose>
            <Button isDisabled={!canPatch || isPending} onPress={() => void onSave()} type="button">
              {isPending ? "Saving..." : "Save"}
            </Button>
          </ModalFooter>
        </ModalBody>
      </ModalContent>
    </>
  );
}

function MediaFieldControl({
  canPatch,
  density,
  draft,
  error,
  fieldKind,
  isPending,
  label,
  onDraftChange,
  onFileSelect,
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
  isPending: boolean;
  label: string;
  onDraftChange: (value: string) => void;
  onFileSelect: (file: File | undefined) => void;
  onUrlCommit: (value: string) => void;
  onUrlRevert: () => void;
  required: boolean;
  uploadEnabled: boolean;
}) {
  const uploadDisabled = !canPatch || isPending || !uploadEnabled;
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
    >
      <label
        className={previewClassName}
        data-web-image-field-preview={draft === "" ? "empty" : "image"}
        data-web-image-field-upload="trigger"
        data-web-media-field-preview={
          fieldKind === "media" ? (draft === "" ? "empty" : "image") : undefined
        }
        data-web-media-field-upload={fieldKind === "media" ? "trigger" : undefined}
        title={`Upload ${label}`}
      >
        {draft === "" ? (
          <span aria-hidden="true" className="text-2xl leading-none text-slate-500">
            +
          </span>
        ) : (
          <img
            alt={`${label} preview`}
            className="h-full w-full object-contain"
            loading="lazy"
            src={draft}
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
      <TextField
        isDisabled={!canPatch || isPending}
        isInvalid={error !== null}
        isRequired={required}
      >
        <Label className="sr-only">{label} URL</Label>
        <Input
          aria-invalid={error !== null ? true : undefined}
          aria-label={`${label} URL`}
          className={
            density === "compact"
              ? compactNativeInputClassName
              : "w-full rounded border border-slate-300 px-3 py-2"
          }
          disabled={!canPatch || isPending}
          onBlur={(event) => onUrlCommit(event.currentTarget.value)}
          onChange={(event) => onDraftChange(event.currentTarget.value)}
          onKeyDown={handleUrlKeyDown}
          placeholder={label}
          required={required}
          type="text"
          value={draft}
        />
        {error ? <FieldError>{error}</FieldError> : null}
      </TextField>
    </div>
  );
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
