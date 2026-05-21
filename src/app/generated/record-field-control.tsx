import { Button } from "@dpeek/formless-ui/button";
import { Checkbox } from "@dpeek/formless-ui/checkbox";
import { DateInput } from "@dpeek/formless-ui/date";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dpeek/formless-ui/dialog";
import { Field, FieldError } from "@dpeek/formless-ui/field";
import { Input } from "@dpeek/formless-ui/input";
import { Label } from "@dpeek/formless-ui/label";
import { NativeSelect, NativeSelectOption } from "@dpeek/formless-ui/native-select";
import { parseSvgIconSource, SvgIcon } from "@dpeek/formless-ui/svg-icon";
import { Textarea } from "@dpeek/formless-ui/textarea";
import { AutosizeTextInput } from "@dpeek/formless-ui/text-input";
import { ValueUnitInput } from "@dpeek/formless-ui/value-unit-input";
import type { FocusEvent, KeyboardEvent } from "react";
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
import { selectGeneratedFieldControl } from "./field-controls.ts";
import {
  decodeNumberEditorInputValue,
  encodeNumberEditorInputValue,
  inputValueToFieldValue,
} from "./format.ts";

export type GeneratedRecordFieldControlDensity = "default" | "compact";
export type GeneratedRecordFieldControlPresentation = "default" | "heading";

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
  const { commit: commitPolicy, editor, field, fieldName, valueUnit } = fieldConfig;
  const label = fieldConfig.label ?? fieldLabel(fieldName, field);
  const fieldControl = selectGeneratedFieldControl({ editor, field, label });
  const labelClass =
    showLabel && presentation !== "heading" ? "text-xs font-medium text-slate-600" : "sr-only";

  if (fieldControl.controlKind === "checkbox") {
    if (showLabel) {
      return (
        <div className="min-w-28 flex-none space-y-1">
          <Label className={labelClass}>{fieldControl.label}</Label>
          <Field orientation="horizontal">
            <Checkbox
              aria-label={fieldControl.label}
              isDisabled={!canPatch || isPending}
              isSelected={recordValue === true}
              onChange={(checked) => {
                if (commitPolicy === "immediate") {
                  onValueCommit(checked);
                }
              }}
            />
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
        </div>
      );
    }

    return (
      <div className={`${density === "compact" ? "h-6" : "h-7"} flex shrink-0 items-center`}>
        <Field orientation="horizontal">
          <Checkbox
            aria-label={fieldControl.label}
            isDisabled={!canPatch || isPending}
            isSelected={recordValue === true}
            onChange={(checked) => {
              if (commitPolicy === "immediate") {
                onValueCommit(checked);
              }
            }}
          />
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>
      </div>
    );
  }

  if (fieldControl.kind === "enum") {
    const unknownValue =
      draft !== "" && !Object.hasOwn(fieldControl.field.values, draft) ? draft : null;

    return (
      <div
        className={
          density === "compact" ? "w-full min-w-0 space-y-1" : "min-w-40 flex-none space-y-1"
        }
      >
        <Field>
          <Label className={labelClass}>{fieldControl.label}</Label>
          <NativeSelect
            aria-label={fieldControl.label}
            className="w-full"
            disabled={!canPatch || isPending}
            size={density === "compact" ? "sm" : "default"}
            onChange={(event) => {
              const value = event.currentTarget.value;

              onDraftChange(value);
              onValueCommit(inputValueToFieldValue(field, value));
            }}
            required={fieldControl.required}
            value={draft}
          >
            {!fieldControl.required || draft === "" ? <NativeSelectOption value="" /> : null}
            {unknownValue ? (
              <NativeSelectOption value={unknownValue}>{unknownValue}</NativeSelectOption>
            ) : null}
            {Object.entries(fieldControl.field.values).map(([value, option]) => (
              <NativeSelectOption key={value} value={value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
      </div>
    );
  }

  if (fieldControl.kind === "reference") {
    return (
      <RecordReferenceFieldControl
        canPatch={canPatch}
        density={density}
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

  const control = fieldControl.control;
  const isIconEditor = fieldControl.controlKind === "icon";
  const isMarkdownEditor = fieldControl.controlKind === "markdown";
  const isRichMarkdownEditor = isMarkdownEditor && density !== "compact";
  const isMultilineTextEditor = control.kind === "textarea" && !isRichMarkdownEditor;
  const isColorEditor = fieldControl.controlKind === "color";
  const isImageEditor = fieldControl.controlKind === "image";
  const isDateEditor = fieldControl.controlKind === "date";
  const isNumberEditor = fieldControl.controlKind === "number";
  const isValueUnitEditor = isNumberEditor && valueUnit !== undefined;
  const isHeadingTextEditor =
    presentation === "heading" &&
    fieldControl.kind === "text" &&
    fieldControl.editor === "text" &&
    fieldControl.controlKind === "text";
  const isAutosizeTextEditor =
    isHeadingTextEditor ||
    (fieldControl.kind === "text" &&
      fieldControl.editor === "text" &&
      fieldControl.controlKind === "text" &&
      (density === "compact" || (!showLabel && isTitleLikeTextField(fieldName, field))));

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      onValueCommit(inputValueToFieldValue(field, event.currentTarget.value));
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onDraftRevert();
    }
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onDraftRevert();
    }
  }

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
    <div
      className={
        density === "compact"
          ? "w-full min-w-0 space-y-1"
          : isDateEditor || isNumberEditor
            ? "min-w-36 flex-none space-y-1"
            : "min-w-52 flex-1 space-y-1"
      }
    >
      <Field>
        <Label className={labelClass}>{fieldControl.label}</Label>
        {isIconEditor ? (
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
            previewSource={draft}
          />
        ) : isImageEditor ? (
          <ImageFieldControl
            canPatch={canPatch}
            density={density}
            draft={draft}
            error={error}
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
        ) : isRichMarkdownEditor ? (
          <GeneratedMarkdownFieldControl
            ariaInvalid={error !== null}
            label={fieldControl.label}
            onBlur={handleMarkdownBlur}
            onChange={onDraftChange}
            onKeyDown={handleMarkdownKeyDown}
            readOnly={!canPatch || isPending}
            value={draft}
          />
        ) : isMultilineTextEditor ? (
          <Textarea
            aria-label={fieldControl.label}
            className={
              density === "compact"
                ? "min-h-20 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                : "min-h-28 w-full rounded border border-slate-300 px-3 py-2"
            }
            disabled={!canPatch || isPending}
            onBlur={(event) => {
              if (commitPolicy === "field-commit") {
                onValueCommit(inputValueToFieldValue(field, event.currentTarget.value));
              }
            }}
            onChange={(event) => onDraftChange(event.currentTarget.value)}
            onKeyDown={handleTextareaKeyDown}
            required={fieldControl.required}
            value={draft}
          />
        ) : isColorEditor ? (
          <GeneratedColorFieldControl
            className={
              density === "compact"
                ? "w-full [&_[data-slot=input-group]]:h-6 [&_input]:h-6 [&_input]:text-xs"
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
        ) : isAutosizeTextEditor ? (
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
        ) : isDateEditor ? (
          <DateInput
            aria-label={fieldControl.label}
            className={
              density === "compact"
                ? "h-6 w-full rounded border border-slate-300 text-xs"
                : "w-full rounded border border-slate-300"
            }
            disabled={!canPatch || isPending}
            onBlur={(event) => {
              if (commitPolicy === "field-commit") {
                onValueCommit(inputValueToFieldValue(field, event.currentTarget.value));
              }
            }}
            onKeyDown={handleInputKeyDown}
            onValueCommit={(value) => {
              if (commitPolicy === "field-commit") {
                onValueCommit(inputValueToFieldValue(field, value));
              }
            }}
            onValueChange={onDraftChange}
            required={fieldControl.required}
            value={draft}
          />
        ) : isValueUnitEditor ? (
          <ValueUnitInput
            className="w-full"
            commitOnBlur={commitPolicy === "field-commit"}
            decode={(value) => decodeNumberEditorInputValue(value, numberFormat)}
            disabled={!canPatch || isPending}
            encode={(value) => encodeNumberEditorInputValue(value, numberFormat)}
            inputClassName={
              density === "compact"
                ? "h-6 rounded border border-slate-300 px-2 py-0.5 text-xs"
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
        ) : isNumberEditor ? (
          <GeneratedNumberFieldControl
            aria-invalid={error !== null ? true : undefined}
            aria-label={fieldControl.label}
            className={
              density === "compact"
                ? "h-6 w-full rounded border border-slate-300 px-2 py-0.5 text-xs"
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
        ) : (
          <Input
            aria-label={fieldControl.label}
            className={
              density === "compact"
                ? "h-6 w-full rounded border border-slate-300 px-2 py-0.5 text-xs"
                : "w-full rounded border border-slate-300 px-3 py-2"
            }
            disabled={!canPatch || isPending}
            onBlur={(event) => {
              if (commitPolicy === "field-commit") {
                onValueCommit(inputValueToFieldValue(field, event.currentTarget.value));
              }
            }}
            onChange={(event) => onDraftChange(event.currentTarget.value)}
            onKeyDown={handleInputKeyDown}
            required={fieldControl.required}
            {...fieldControl.inputAttributes}
            type={control.kind === "input" ? control.inputType : "text"}
            value={draft}
          />
        )}
      </Field>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
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
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            onOpenChange(true);
          } else {
            onCancel();
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit {label}</DialogTitle>
          </DialogHeader>
          <GeneratedIconSourceFieldControl
            ariaInvalid={error !== null ? true : undefined}
            label={label}
            onChange={onDraftChange}
            readOnly={!canPatch || isPending}
            sourceLabel={`${label} SVG source`}
            value={draft}
          />
          {error ? <FieldError>{error}</FieldError> : null}
          <DialogFooter>
            <DialogClose render={<Button intent="outline" type="button" />}>Cancel</DialogClose>
            <Button isDisabled={!canPatch || isPending} onPress={() => void onSave()} type="button">
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ImageFieldControl({
  canPatch,
  density,
  draft,
  error,
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
      data-web-field-kind="image"
    >
      <label
        className={previewClassName}
        data-web-image-field-preview={draft === "" ? "empty" : "image"}
        data-web-image-field-upload="trigger"
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
      <div className="space-y-1">
        <Input
          aria-invalid={error !== null ? true : undefined}
          aria-label={`${label} URL`}
          className={
            density === "compact"
              ? "h-6 w-full rounded border border-slate-300 px-2 py-0.5 text-xs"
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
      </div>
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

function isTitleLikeTextField(fieldName: string, field: FieldSchema) {
  const normalizedFieldName = fieldName.toLowerCase();
  const normalizedLabel = (field.label ?? "").toLowerCase();

  return (
    normalizedFieldName === "title" ||
    normalizedFieldName === "name" ||
    normalizedLabel === "title" ||
    normalizedLabel === "name"
  );
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
      <Field>
        <Label className={labelClass}>{label}</Label>
        <NativeSelect
          aria-label={label}
          className="w-full"
          disabled={!canPatch || isPending}
          size={density === "compact" ? "sm" : "default"}
          onChange={(event) => {
            const value = event.currentTarget.value;

            onDraftChange(value);
            onCommit(inputValueToFieldValue(field, value));
          }}
          required={field.required}
          value={draft}
        >
          {!field.required || draft === "" ? <NativeSelectOption value="" /> : null}
          {unknownValue ? (
            <NativeSelectOption value={unknownValue}>{unknownValue}</NativeSelectOption>
          ) : null}
          {options.map((option) => (
            <NativeSelectOption key={option.id} value={option.id}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
