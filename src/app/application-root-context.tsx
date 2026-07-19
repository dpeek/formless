import { createContext, type ReactNode, useContext } from "react";
import type { FormlessUiDocumentThemeReference } from "@dpeek/formless-astryx/contract";
import type { ApplicationRuntimeContractPublication } from "./generated/application-runtime-contract-host.tsx";

export type ApplicationRootThemeRuntime = {
  publication: ApplicationRuntimeContractPublication;
  reference: FormlessUiDocumentThemeReference;
};

const ApplicationRootThemeRuntimeContext = createContext<ApplicationRootThemeRuntime | undefined>(
  undefined,
);

export function ApplicationRootThemeRuntimeProvider({
  children,
  runtime,
}: {
  children: ReactNode;
  runtime: ApplicationRootThemeRuntime;
}) {
  return (
    <ApplicationRootThemeRuntimeContext.Provider value={runtime}>
      {children}
    </ApplicationRootThemeRuntimeContext.Provider>
  );
}

export function useApplicationRootThemeRuntime() {
  return useContext(ApplicationRootThemeRuntimeContext);
}
