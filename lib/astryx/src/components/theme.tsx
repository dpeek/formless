import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { memo, type ReactNode } from "react";
import type {
  FormlessUiDocumentThemeContract,
  FormlessUiDocumentThemeIntentHandler,
  FormlessUiDocumentThemeReference,
  FormlessUiDocumentThemeSelectionControlContract,
} from "../formless-ui-contract.ts";
import {
  useFormlessUiDocumentTheme,
  useFormlessUiDocumentThemeIntentHandler,
} from "../formless-ui-contract-host-react.tsx";
import { FormlessThemeProvider } from "../theme.tsx";

export function FormlessThemeToggle({
  control,
  onIntent,
}: {
  control: FormlessUiDocumentThemeSelectionControlContract;
  onIntent: FormlessUiDocumentThemeIntentHandler;
}) {
  return (
    <SegmentedControl
      label={control.accessibilityLabel}
      layout="hug"
      onChange={(mode) => {
        const option = control.options.find((candidate) => candidate.mode === mode);
        if (option) {
          void onIntent(option.selectionIntent);
        }
      }}
      value={control.selectedMode}
    >
      {control.options.map((option) => (
        <SegmentedControlItem key={option.mode} label={option.label} value={option.mode} />
      ))}
    </SegmentedControl>
  );
}

export function AstryxDocumentThemeRenderer({
  children,
  onIntent,
  theme,
}: {
  children: ReactNode;
  onIntent: FormlessUiDocumentThemeIntentHandler;
  theme: FormlessUiDocumentThemeContract;
}) {
  return (
    <FormlessThemeProvider theme={theme}>
      {theme.selectionControl ? (
        <FormlessThemeToggle control={theme.selectionControl} onIntent={onIntent} />
      ) : null}
      {children}
    </FormlessThemeProvider>
  );
}

export const AstryxSubscribedDocumentThemeRenderer = memo(
  function AstryxSubscribedDocumentThemeRenderer({
    children,
    themeReference,
  }: {
    children: ReactNode;
    themeReference: FormlessUiDocumentThemeReference;
  }) {
    const onIntent = useFormlessUiDocumentThemeIntentHandler();
    const theme = useFormlessUiDocumentTheme(themeReference);

    return theme ? (
      <AstryxDocumentThemeRenderer onIntent={onIntent} theme={theme}>
        {children}
      </AstryxDocumentThemeRenderer>
    ) : (
      children
    );
  },
  (previous, next) =>
    previous.themeReference.themeId === next.themeReference.themeId &&
    previous.children === next.children,
);
