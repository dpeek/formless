import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  FormlessUiDisplayField,
  FormlessUiField,
  FormlessUiFieldIntentHandler,
  FormlessUiRecordFieldRendererKind,
} from "../../formless-ui-contract.ts";
import { BooleanFieldDisplay, BooleanFieldEditor } from "./boolean-field.tsx";
import { AutosizeTextFieldEditor } from "./autosize-text-field.tsx";
import { ColorFieldDisplay, ColorFieldEditor } from "./color-field.tsx";
import { DateFieldDisplay, DateFieldEditor } from "./date-field.tsx";
import { EnumFieldDisplay, EnumFieldEditor } from "./enum-field.tsx";
import {
  defaultFormlessUiFieldInputId,
  editorFieldValue,
  fieldLabelIsHidden,
  formatInputValue,
  isRecordEditorField,
  type FormlessUiEditorField,
} from "./field-chrome.tsx";
import { IconFieldDisplay, IconFieldEditor } from "./icon-field.tsx";
import { MediaFieldDisplay, MediaFieldEditor } from "./media-field.tsx";
import { NumberFieldDisplay, NumberFieldEditor } from "./number-field.tsx";
import { ReferenceFieldDisplay, ReferenceFieldEditor } from "./reference-field.tsx";
import { StateMachineField } from "./state-machine-field.tsx";
import {
  MarkdownFieldDisplayValue,
  MarkdownFieldEditor,
  TextareaFieldEditor,
  TextFieldDisplay,
  TextFieldEditor,
} from "./text-field.tsx";

type FormlessUiFieldRendererProps = {
  field: FormlessUiField;
  inputId?: string;
  onIntent?: FormlessUiFieldIntentHandler;
};

export function FormlessUiFieldRenderer({
  field,
  inputId = defaultFormlessUiFieldInputId(field),
  onIntent,
}: FormlessUiFieldRendererProps) {
  if (field.stateMachineFacts !== undefined) {
    return <StateMachineField field={field} inputId={inputId} onIntent={onIntent} />;
  }

  if (field.mode === "display") {
    return <DisplayField field={field} />;
  }

  return <FieldEditor field={field} inputId={inputId} onIntent={onIntent} />;
}

export function FormlessUiFieldSubmitFormAdapter({ field }: { field: FormlessUiField }) {
  if (field.mode !== "editor" || field.commit !== "submit") {
    return null;
  }

  return (
    <input
      name={field.inputName ?? field.fieldName}
      readOnly
      type="hidden"
      value={formatInputValue(editorFieldValue(field))}
    />
  );
}

function DisplayField({ field }: { field: FormlessUiDisplayField }) {
  return (
    <VStack gap={fieldLabelIsHidden(field) ? 0 : 1} width="100%">
      {fieldLabelIsHidden(field) ? null : (
        <Text display="block" type="label">
          {field.label}
        </Text>
      )}
      <FieldDisplay field={field} />
    </VStack>
  );
}

function FieldEditor({
  field,
  inputId,
  onIntent,
}: {
  field: FormlessUiEditorField;
  inputId: string;
  onIntent: FormlessUiFieldIntentHandler | undefined;
}) {
  const route = editorRoute(field);

  if (route === "markdown") {
    return <MarkdownFieldEditor field={field} onIntent={onIntent} />;
  }

  if (route === "autosize-text") {
    return <AutosizeTextFieldEditor field={field} inputId={inputId} onIntent={onIntent} />;
  }

  if (route === "textarea") {
    return <TextareaFieldEditor field={field} onIntent={onIntent} />;
  }

  if (route === "color") {
    return <ColorFieldEditor field={field} inputId={inputId} onIntent={onIntent} />;
  }

  if (route === "image" || route === "media") {
    return <MediaFieldEditor field={field} inputId={inputId} onIntent={onIntent} />;
  }

  if (route === "checkbox" || route === "completion-checkbox") {
    return <BooleanFieldEditor field={field} onIntent={onIntent} />;
  }

  if (route === "enum" || route === "enum-icon") {
    return <EnumFieldEditor field={field} onIntent={onIntent} />;
  }

  if (route === "reference") {
    return <ReferenceFieldEditor field={field} onIntent={onIntent} />;
  }

  if (route === "date" || route === "quiet-date") {
    return <DateFieldEditor field={field} isQuiet={route === "quiet-date"} onIntent={onIntent} />;
  }

  if (route === "number" || route === "value-unit") {
    return (
      <NumberFieldEditor field={field} showUnit={route === "value-unit"} onIntent={onIntent} />
    );
  }

  if (route === "icon") {
    return <IconFieldEditor field={field} inputId={inputId} onIntent={onIntent} />;
  }

  return <TextFieldEditor field={field} onIntent={onIntent} />;
}

function FieldDisplay({ field }: { field: FormlessUiDisplayField }) {
  if (field.control.kind === "date" || field.formatting.temporal !== undefined) {
    return <DateFieldDisplay field={field} />;
  }

  if (field.control.kind === "number") {
    return <NumberFieldDisplay field={field} />;
  }

  if (field.control.controlKind === "checkbox") {
    return <BooleanFieldDisplay field={field} />;
  }

  if (field.control.kind === "enum") {
    return <EnumFieldDisplay field={field} />;
  }

  if (field.control.kind === "reference") {
    return <ReferenceFieldDisplay field={field} />;
  }

  if (field.control.controlKind === "color") {
    return <ColorFieldDisplay field={field} />;
  }

  if (field.control.controlKind === "image" || field.control.controlKind === "media") {
    return <MediaFieldDisplay field={field} />;
  }

  if (field.control.controlKind === "markdown") {
    return <MarkdownFieldDisplayValue field={field} />;
  }

  if (field.control.controlKind === "icon") {
    return <IconFieldDisplay field={field} />;
  }

  return <TextFieldDisplay field={field} />;
}

function editorRoute(
  field: FormlessUiEditorField,
): FormlessUiRecordFieldRendererKind | FormlessUiEditorField["control"]["controlKind"] {
  if (isRecordEditorField(field)) {
    return field.rendererKind;
  }

  if (field.editor === "enum") {
    return "enum";
  }

  return field.control.controlKind;
}
