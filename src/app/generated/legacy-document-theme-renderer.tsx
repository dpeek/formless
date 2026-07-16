import { Button } from "@dpeek/formless-ui/button";
import { memo, type ReactNode } from "react";
import type {
  FormlessUiDocumentThemeContract,
  FormlessUiDocumentThemeIntentHandler,
  FormlessUiDocumentThemeReference,
} from "@dpeek/formless-astryx/contract";
import {
  useFormlessUiDocumentTheme,
  useFormlessUiDocumentThemeIntentHandler,
} from "@dpeek/formless-astryx/contract-host/react";

export function LegacyDocumentThemeRenderer({
  children,
  onIntent,
  theme,
}: {
  children: ReactNode;
  onIntent: FormlessUiDocumentThemeIntentHandler;
  theme: FormlessUiDocumentThemeContract;
}) {
  return (
    <div
      className={`${theme.activeMode} min-h-dvh bg-bg text-fg`}
      data-formless-document-theme={theme.id}
      data-formless-document-theme-active-mode={theme.activeMode}
    >
      {theme.selectionControl ? (
        <div
          aria-label={theme.selectionControl.accessibilityLabel}
          className="fixed end-4 top-2 z-50 flex items-center gap-1 rounded-lg border border-border bg-bg p-1 shadow-sm"
          data-formless-document-theme-control={theme.selectionControl.id}
          role="group"
        >
          {theme.selectionControl.options.map((option) => (
            <Button
              aria-label={option.label}
              aria-pressed={theme.selectionControl.selectedMode === option.mode}
              intent="plain"
              key={option.mode}
              onPress={() => void onIntent(option.selectionIntent)}
              size="xs"
              type="button"
            >
              {option.label}
            </Button>
          ))}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export const LegacySubscribedDocumentThemeRenderer = memo(
  function LegacySubscribedDocumentThemeRenderer({
    children,
    themeReference,
  }: {
    children: ReactNode;
    themeReference: FormlessUiDocumentThemeReference;
  }) {
    const onIntent = useFormlessUiDocumentThemeIntentHandler();
    const theme = useFormlessUiDocumentTheme(themeReference);

    return theme ? (
      <LegacyDocumentThemeRenderer onIntent={onIntent} theme={theme}>
        {children}
      </LegacyDocumentThemeRenderer>
    ) : (
      children
    );
  },
  (previous, next) =>
    previous.themeReference.themeId === next.themeReference.themeId &&
    previous.children === next.children,
);
