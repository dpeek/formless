import type { ReactNode } from "react";
import { ToastViewport } from "@astryxdesign/core/Toast";
import type { FormlessUiDocumentThemeContract } from "./formless-ui-contract.ts";
import { FormlessThemeProvider } from "./theme.tsx";

export type AstryxApplicationProviderProps = {
  children: ReactNode;
  theme: FormlessUiDocumentThemeContract;
};

export function AstryxApplicationProvider({ children, theme }: AstryxApplicationProviderProps) {
  return (
    <FormlessThemeProvider theme={theme}>
      <ToastViewport maxVisible={5} position="bottomEnd">
        {children}
      </ToastViewport>
    </FormlessThemeProvider>
  );
}
