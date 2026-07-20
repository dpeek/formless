import { createContext, type ReactNode, useContext } from "react";
import type { DocumentThemeReference } from "@dpeek/formless-presentation/contract";
import type { ApplicationRuntimeContractPublication } from "./generated/application-runtime-contract-host.tsx";

export type ApplicationRootThemeRuntime = {
  publication: ApplicationRuntimeContractPublication;
  reference: DocumentThemeReference;
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
