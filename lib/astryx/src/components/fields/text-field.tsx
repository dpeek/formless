import * as stylex from "@stylexjs/stylex";
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
  return (
    <TextInput
      {...fieldChromeProps(field)}
      hasClear={!field.required}
      isLoading={Boolean(field.pending?.isPending)}
      size={inputSize(field)}
      value={formatInputValue(editorFieldValue(field))}
      onChange={(value) => emitFieldDraftChange(field, value, onIntent)}
      onEnter={() => emitRecordFieldCommit(field, editorFieldValue(field), onIntent)}
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
  return (
    <TextArea
      {...fieldChromeProps(field)}
      isLoading={Boolean(field.pending?.isPending)}
      size={inputSize(field)}
      rows={4}
      value={formatInputValue(editorFieldValue(field))}
      onBlur={() => emitRecordFieldCommit(field, editorFieldValue(field), onIntent)}
      onChange={(value) => emitFieldDraftChange(field, value, onIntent)}
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
    />
  );
}

export function TextFieldDisplay({ field }: { field: FormlessUiDisplayField }) {
  return (
    <div {...stylex.props(fieldChromeStyles.displayValue)}>
      <Text
        type={astryxDensity(field) === "compact" ? "supporting" : "body"}
        maxLines={field.control.controlKind === "textarea" ? 3 : 2}
      >
        {displayTextWithSuffix(field) || "Empty"}
      </Text>
    </div>
  );
}

export function MarkdownFieldDisplayValue({ field }: { field: FormlessUiDisplayField }) {
  return (
    <MarkdownFieldDisplay value={field.formatting.displayValue} density={astryxDensity(field)} />
  );
}
