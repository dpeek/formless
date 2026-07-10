import type {
  FormlessUiDisplayField,
  FormlessUiFieldIntentHandler,
} from "../../formless-ui-contract.ts";
import { ColorInput } from "../color-input.tsx";
import { ColorValueDisplay } from "../field-primitives.tsx";
import {
  astryxDensity,
  editorFieldValue,
  emitFieldDraftChange,
  emitImmediateRecordFieldCommit,
  fieldChromeProps,
  fieldIsReadOnly,
  formatInputValue,
  type FormlessUiEditorField,
} from "./field-chrome.tsx";

export function ColorFieldEditor({
  field,
  inputId,
  onIntent,
}: {
  field: FormlessUiEditorField;
  inputId: string;
  onIntent: FormlessUiFieldIntentHandler | undefined;
}) {
  return (
    <ColorInput
      id={inputId}
      {...fieldChromeProps(field)}
      density={astryxDensity(field)}
      isReadOnly={fieldIsReadOnly(field)}
      value={formatInputValue(editorFieldValue(field))}
      onChange={(value) => {
        emitFieldDraftChange(field, value, onIntent);
        emitImmediateRecordFieldCommit(field, value, onIntent);
      }}
    />
  );
}

export function ColorFieldDisplay({ field }: { field: FormlessUiDisplayField }) {
  return (
    <ColorValueDisplay
      label={field.label}
      value={field.formatting.displayValue}
      density={astryxDensity(field)}
    />
  );
}
