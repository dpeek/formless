import type {
  DisplayFieldContract,
  FieldIntentHandler,
} from "@dpeek/formless-presentation/contract";
import { ColorInput } from "../color-input.tsx";
import { ColorValueDisplay } from "../field-primitives.tsx";
import {
  astryxDensity,
  editorFieldValue,
  emitFieldDraftChange,
  emitImmediateRecordFieldCommit,
  emitRecordDraftValueCommit,
  fieldChromeProps,
  fieldIsReadOnly,
  formatInputValue,
  type EditorField,
} from "./field-chrome.tsx";

export function ColorFieldEditor({
  field,
  inputId,
  onIntent,
}: {
  field: EditorField;
  inputId: string;
  onIntent: FieldIntentHandler | undefined;
}) {
  const pickerValue = field.color?.picker;

  return (
    <ColorInput
      id={inputId}
      {...fieldChromeProps(field)}
      density={astryxDensity(field)}
      isReadOnly={fieldIsReadOnly(field)}
      pickerValue={pickerValue?.kind === "hex" ? pickerValue.value : undefined}
      value={formatInputValue(editorFieldValue(field))}
      onCommit={(value) => emitRecordDraftValueCommit(field, value, onIntent)}
      onChange={(value) => {
        emitFieldDraftChange(field, value, onIntent);
        emitImmediateRecordFieldCommit(field, value, onIntent);
      }}
    />
  );
}

export function ColorFieldDisplay({ field }: { field: DisplayFieldContract }) {
  const swatchValue = field.color?.swatch;

  return (
    <ColorValueDisplay
      label={field.label}
      swatchValue={swatchValue?.kind === "hex" ? swatchValue.value : undefined}
      density={astryxDensity(field)}
    />
  );
}
