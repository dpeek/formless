import * as stylex from "@stylexjs/stylex";
import type { KeyboardEvent } from "react";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import type {
  FormlessUiDisplayField,
  FormlessUiFieldIntentHandler,
} from "../../formless-ui-contract.ts";
import {
  astryxDensity,
  displayTextWithSuffix,
  editorFieldValue,
  emitFieldDraftChange,
  emitRecordFieldCommit,
  emitRecordFieldRevert,
  fieldChromeProps,
  fieldChromeStyles,
  fieldIsReadOnly,
  formatInputValue,
  inputSize,
  type FormlessUiEditorField,
} from "./field-chrome.tsx";
import { MarkdownFieldDisplay, MarkdownInput } from "../field-primitives.tsx";

export function TextFieldEditor({
  field,
  onIntent,
}: {
  field: FormlessUiEditorField;
  onIntent: FormlessUiFieldIntentHandler | undefined;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      emitRecordFieldCommit(field, event.currentTarget.value, onIntent);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      emitRecordFieldRevert(field, onIntent);
    }
  }

  return (
    <TextInput
      {...fieldChromeProps(field)}
      hasClear={!field.required}
      isLoading={Boolean(field.pending?.isPending)}
      size={inputSize(field)}
      value={formatInputValue(editorFieldValue(field))}
      onBlur={(event) =>
        emitRecordFieldCommit(field, (event.currentTarget as HTMLInputElement).value, onIntent)
      }
      onChange={(value) => emitFieldDraftChange(field, value, onIntent)}
      onKeyDown={handleKeyDown}
    />
  );
}

export function TextareaFieldEditor({
  field,
  onIntent,
}: {
  field: FormlessUiEditorField;
  onIntent: FormlessUiFieldIntentHandler | undefined;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      emitRecordFieldRevert(field, onIntent);
    }
  }

  return (
    <TextArea
      {...fieldChromeProps(field)}
      isLoading={Boolean(field.pending?.isPending)}
      placeholder={undefined}
      size={inputSize(field)}
      rows={field.surface === "operation" ? 4 : undefined}
      value={formatInputValue(editorFieldValue(field))}
      onBlur={(event) => emitRecordFieldCommit(field, event.currentTarget.value, onIntent)}
      onChange={(value) => emitFieldDraftChange(field, value, onIntent)}
      onKeyDown={handleKeyDown}
    />
  );
}

export function MarkdownFieldEditor({
  field,
  onIntent,
}: {
  field: FormlessUiEditorField;
  onIntent: FormlessUiFieldIntentHandler | undefined;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      emitRecordFieldRevert(field, onIntent);
    }
  }

  return (
    <MarkdownInput
      {...fieldChromeProps(field)}
      isLoading={Boolean(field.pending?.isPending)}
      isReadOnly={fieldIsReadOnly(field)}
      rows={6}
      size={inputSize(field)}
      value={formatInputValue(editorFieldValue(field))}
      onBlur={() => emitRecordFieldCommit(field, editorFieldValue(field), onIntent)}
      onChange={(value) => emitFieldDraftChange(field, value, onIntent)}
      onKeyDown={handleKeyDown}
    />
  );
}

export function TextFieldDisplay({ field }: { field: FormlessUiDisplayField }) {
  return (
    <div {...stylex.props(fieldChromeStyles.displayValue)}>
      <Text
        type={astryxDensity(field) === "compact" ? "supporting" : "body"}
        maxLines={field.control.controlKind === "textarea" ? undefined : 2}
      >
        {displayTextWithSuffix(field)}
      </Text>
    </div>
  );
}

export function MarkdownFieldDisplayValue({ field }: { field: FormlessUiDisplayField }) {
  return (
    <MarkdownFieldDisplay value={field.formatting.displayValue} density={astryxDensity(field)} />
  );
}
