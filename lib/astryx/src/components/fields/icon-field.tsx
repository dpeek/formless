import * as stylex from "@stylexjs/stylex";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import type {
  FormlessUiDisplayField,
  FormlessUiFieldIntentHandler,
} from "../../formless-ui-contract.ts";
import { SourceIcon } from "../field-primitives.tsx";
import {
  astryxDensity,
  editorFieldValue,
  emitFieldDraftChange,
  emitRecordFieldCommit,
  fieldChromeProps,
  fieldChromeStyles,
  formatInputValue,
  inputSize,
  type FormlessUiEditorField,
} from "./field-chrome.tsx";

export function IconFieldEditor({
  field,
  onIntent,
}: {
  field: FormlessUiEditorField;
  onIntent: FormlessUiFieldIntentHandler | undefined;
}) {
  const value = formatInputValue(editorFieldValue(field));

  return (
    <div {...stylex.props(styles.iconEditor)}>
      <TextInput
        {...fieldChromeProps(field)}
        hasClear={!field.required}
        isLoading={Boolean(field.pending?.isPending)}
        size={inputSize(field)}
        value={value}
        onChange={(nextValue) => emitFieldDraftChange(field, nextValue, onIntent)}
        onEnter={() => emitRecordFieldCommit(field, editorFieldValue(field), onIntent)}
      />
      <SourceIcon
        source={value}
        color="secondary"
        size={astryxDensity(field) === "compact" ? "sm" : "md"}
        aria-label={`${field.label} preview`}
      />
    </div>
  );
}

export function IconFieldDisplay({ field }: { field: FormlessUiDisplayField }) {
  return (
    <div {...stylex.props(fieldChromeStyles.displayValue, styles.sourceIconDisplay)}>
      <SourceIcon
        source={formatInputValue(field.value)}
        color="secondary"
        size={astryxDensity(field) === "compact" ? "sm" : "md"}
        aria-label={field.label}
      />
      <Text type={astryxDensity(field) === "compact" ? "supporting" : "body"} maxLines={1}>
        {field.formatting.displayValue || "Icon"}
      </Text>
    </div>
  );
}

const styles = stylex.create({
  sourceIconDisplay: {
    gap: spacingVars["--spacing-2"],
  },
  iconEditor: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "end",
    gap: spacingVars["--spacing-2"],
    minWidth: 0,
  },
});
