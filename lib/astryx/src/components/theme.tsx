import { IconButton } from "@astryxdesign/core/IconButton";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { memo, type ReactNode } from "react";
import type {
  FormlessUiDocumentThemeActiveMode,
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

export function FormlessThemeIconToggle({
  activeMode,
  control,
  onIntent,
}: {
  activeMode: FormlessUiDocumentThemeActiveMode;
  control: FormlessUiDocumentThemeSelectionControlContract;
  onIntent: FormlessUiDocumentThemeIntentHandler;
}) {
  const targetMode = activeMode === "light" ? "dark" : "light";
  const option = control.options.find((candidate) => candidate.mode === targetMode);

  if (!option) {
    return null;
  }

  const label = `Switch to ${targetMode} mode`;

  return (
    <IconButton
      icon={targetMode === "light" ? <SunIcon /> : <MoonIcon />}
      label={label}
      onClick={() => void onIntent(option.selectionIntent)}
      size="sm"
      tooltip={label}
      variant="ghost"
    />
  );
}

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
