import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import type {
  FormlessUiDisplayField,
  FormlessUiFieldIntentHandler,
} from "../../formless-ui-contract.ts";
import {
  astryxDensity,
  editorFieldValue,
  emitFieldDraftChange,
  emitImmediateRecordFieldCommit,
  fieldDescription,
  fieldInteractionIsDisabled,
  fieldIsReadOnly,
  fieldLabelIsHidden,
  fieldStatus,
  fieldChromeStyles,
  type FormlessUiEditorField,
} from "./field-chrome.tsx";

export function BooleanFieldEditor({
  field,
  onIntent,
}: {
  field: FormlessUiEditorField;
  onIntent: FormlessUiFieldIntentHandler | undefined;
}) {
  const value = editorFieldValue(field) === true;
  const handleChange = (nextValue: boolean) => {
    emitFieldDraftChange(field, nextValue, onIntent);
    emitImmediateRecordFieldCommit(field, nextValue, onIntent);
  };

  if (field.commit === "immediate") {
    return (
      <Switch
        label={field.label}
        isLabelHidden={fieldLabelIsHidden(field)}
        disabledMessage={fieldDescription(field)}
        isDisabled={fieldInteractionIsDisabled(field)}
        isLoading={Boolean(field.pending?.isPending)}
        isRequired={field.required}
        status={fieldStatus(field)}
        value={value}
        width="100%"
        onChange={handleChange}
      />
    );
  }

  return (
    <CheckboxInput
      label={field.label}
      isLabelHidden={fieldLabelIsHidden(field)}
      disabledMessage={fieldDescription(field)}
      isDisabled={fieldInteractionIsDisabled(field)}
      isLoading={Boolean(field.pending?.isPending)}
      isReadOnly={fieldIsReadOnly(field)}
      isRequired={field.required}
      size={astryxDensity(field) === "compact" ? "sm" : "md"}
      status={fieldStatus(field)}
      value={value}
      width="100%"
      onChange={handleChange}
    />
  );
}

export function BooleanFieldDisplay({ field }: { field: FormlessUiDisplayField }) {
  return (
    <Text display="block" type="body" xstyle={fieldChromeStyles.displayValue}>
      {field.formatting.displayValue}
    </Text>
  );
}
