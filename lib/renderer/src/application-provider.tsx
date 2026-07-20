import type { ReactNode } from "react";
import { ToastViewport } from "@astryxdesign/core/Toast";
import type { FormlessUiDocumentThemeContract } from "@dpeek/formless-presentation/contract";
import { FormlessThemeProvider } from "./theme.tsx";

export type FormlessApplicationRendererProviderProps = {
  children: ReactNode;
  theme: FormlessUiDocumentThemeContract;
};

export function FormlessApplicationRendererProvider({
  children,
  theme,
}: FormlessApplicationRendererProviderProps) {
  return (
    <FormlessThemeProvider theme={theme}>
      <ToastViewport maxVisible={5} position="bottomEnd">
        {children}
      </ToastViewport>
    </FormlessThemeProvider>
  );
}
