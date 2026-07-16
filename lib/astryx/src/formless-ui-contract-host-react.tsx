import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import type {
  FormlessUiContractReference,
  FormlessUiResultReference,
  FormlessUiWorkspaceIntentHandler,
  FormlessUiWorkspaceManifestReference,
  FormlessUiWorkspaceSectionShellReference,
} from "./formless-ui-contract.ts";
import type {
  FormlessUiContractHost,
  FormlessUiContractSnapshot,
} from "./formless-ui-contract-host.ts";

const FormlessUiContractHostContext = createContext<FormlessUiContractHost | null>(null);

export function FormlessUiContractHostProvider({
  children,
  host,
}: {
  children: ReactNode;
  host: FormlessUiContractHost;
}) {
  return (
    <FormlessUiContractHostContext.Provider value={host}>
      {children}
    </FormlessUiContractHostContext.Provider>
  );
}

export function useFormlessUiContractHost() {
  const host = useContext(FormlessUiContractHostContext);

  if (!host) {
    throw new Error("Formless UI contract hooks require FormlessUiContractHostProvider.");
  }

  return host;
}

export function useFormlessUiWorkspaceIntentHandler(): FormlessUiWorkspaceIntentHandler {
  const host = useFormlessUiContractHost();
  return useCallback((intent) => host.dispatch(intent), [host]);
}

export function useFormlessUiContract<Reference extends FormlessUiContractReference>(
  reference: Reference,
): FormlessUiContractSnapshot<Reference> | undefined {
  const host = useFormlessUiContractHost();
  const callbacks = useMemo(
    () => ({
      getServerSnapshot: () => host.getServerSnapshot(reference),
      getSnapshot: () => host.read(reference),
      subscribe: (listener: () => void) => host.subscribe(reference, listener),
    }),
    [host, reference],
  );

  return useSyncExternalStore(
    callbacks.subscribe,
    callbacks.getSnapshot,
    callbacks.getServerSnapshot,
  );
}

export function useFormlessUiWorkspaceManifest(reference: FormlessUiWorkspaceManifestReference) {
  return useFormlessUiContract(reference);
}

export function useFormlessUiWorkspaceSectionShell(
  reference: FormlessUiWorkspaceSectionShellReference,
) {
  return useFormlessUiContract(reference);
}

export function useFormlessUiResult<Reference extends FormlessUiResultReference>(
  reference: Reference,
) {
  return useFormlessUiContract(reference);
}
