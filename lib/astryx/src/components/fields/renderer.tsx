import type {
  FormlessUiDisplayField,
  FormlessUiField,
  FormlessUiFieldIntentHandler,
  FormlessUiRecordFieldRendererKind,
} from "../../formless-ui-contract.ts";
import { BooleanFieldDisplay, BooleanFieldEditor } from "./boolean-field.tsx";
import { ColorFieldDisplay, ColorFieldEditor } from "./color-field.tsx";
import { DateFieldEditor } from "./date-field.tsx";
import { EnumFieldDisplay, EnumFieldEditor } from "./enum-field.tsx";
import {
  FieldChrome,
  defaultFormlessUiFieldInputId,
  editorFieldValue,
  formatInputValue,
  isRecordEditorField,
  type FormlessUiEditorField,
} from "./field-chrome.tsx";
import { IconFieldDisplay, IconFieldEditor } from "./icon-field.tsx";
import { MediaFieldDisplay, MediaFieldEditor } from "./media-field.tsx";
import { NumberFieldEditor } from "./number-field.tsx";
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
    return <DisplayField field={field} inputId={inputId} />;
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

function DisplayField({ field, inputId }: { field: FormlessUiDisplayField; inputId: string }) {
  return (
    <FieldChrome field={field} inputId={inputId}>
      <FieldDisplay field={field} />
    </FieldChrome>
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
    return (
      <BooleanFieldEditor
        field={field}
        isCompletion={route === "completion-checkbox"}
        onIntent={onIntent}
      />
    );
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
    return <IconFieldEditor field={field} onIntent={onIntent} />;
  }

  return <TextFieldEditor field={field} onIntent={onIntent} />;
}

function FieldDisplay({ field }: { field: FormlessUiDisplayField }) {
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

  return field.control.controlKind;
}
