import { Theme } from "@astryxdesign/core";
import { neutralTheme } from "@astryxdesign/theme-neutral";
import type { ReactNode } from "react";
import type { FormlessUiDocumentThemeContract } from "@dpeek/formless-presentation/contract";

export type FormlessThemeProviderProps = {
  children: ReactNode;
  theme: FormlessUiDocumentThemeContract;
};

export function FormlessThemeProvider({ children, theme }: FormlessThemeProviderProps) {
  return (
    <Theme theme={neutralTheme} mode={theme.activeMode}>
      {children}
    </Theme>
  );
}
