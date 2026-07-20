import { Theme } from "@astryxdesign/core";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import type { ReactNode } from "react";
import type { DocumentThemeContract } from "@dpeek/formless-presentation/contract";

export type FormlessThemeProviderProps = {
  children: ReactNode;
  theme: DocumentThemeContract;
};

export function FormlessThemeProvider({ children, theme }: FormlessThemeProviderProps) {
  return (
    <Theme theme={neutralTheme} mode={theme.activeMode}>
      {children}
    </Theme>
  );
}
