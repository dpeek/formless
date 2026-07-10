import type {
  FormlessUiDisplayField,
  FormlessUiFieldIntentHandler,
} from "../../formless-ui-contract.ts";
import { TextFieldDisplay } from "./text-field.tsx";
import { SelectorFieldEditor } from "./enum-field.tsx";
import type { FormlessUiEditorField } from "./field-chrome.tsx";

export function ReferenceFieldEditor({
  field,
  onIntent,
}: {
  field: FormlessUiEditorField;
  onIntent: FormlessUiFieldIntentHandler | undefined;
}) {
  return <SelectorFieldEditor field={field} onIntent={onIntent} />;
}

export function ReferenceFieldDisplay({ field }: { field: FormlessUiDisplayField }) {
  return <TextFieldDisplay field={field} />;
}
