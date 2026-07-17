import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import type {
  FormlessUiAccessIntentHandler,
  FormlessUiAccessInvitationAuthoringReference,
  FormlessUiAccessManifestReference,
  FormlessUiAuthIntentHandler,
  FormlessUiAuthSurfaceReference,
  FormlessUiContractReference,
  FormlessUiDocumentThemeIntentHandler,
  FormlessUiDocumentThemeReference,
  FormlessUiManagementInstallDialogReference,
  FormlessUiManagementIntentHandler,
  FormlessUiManagementManifestReference,
  FormlessUiResultReference,
  FormlessUiShellIntentHandler,
  FormlessUiShellManifestReference,
  FormlessUiShellNavigationSectionReference,
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

export function useFormlessUiAccessIntentHandler(): FormlessUiAccessIntentHandler {
  const host = useFormlessUiContractHost();
  return useCallback((intent) => host.dispatch(intent), [host]);
}

export function useFormlessUiAuthIntentHandler(): FormlessUiAuthIntentHandler {
  const host = useFormlessUiContractHost();
  return useCallback((intent) => host.dispatch(intent), [host]);
}

export function useFormlessUiShellIntentHandler(): FormlessUiShellIntentHandler {
  const host = useFormlessUiContractHost();
  return useCallback((intent) => host.dispatch(intent), [host]);
}

export function useFormlessUiDocumentThemeIntentHandler(): FormlessUiDocumentThemeIntentHandler {
  const host = useFormlessUiContractHost();
  return useCallback((intent) => host.dispatch(intent), [host]);
}

export function useFormlessUiManagementIntentHandler(): FormlessUiManagementIntentHandler {
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

export function useFormlessUiAccessManifest(reference: FormlessUiAccessManifestReference) {
  return useFormlessUiContract(reference);
}

export function useFormlessUiAccessInvitationAuthoring(
  reference: FormlessUiAccessInvitationAuthoringReference,
) {
  return useFormlessUiContract(reference);
}

export function useFormlessUiAuthSurface<Reference extends FormlessUiAuthSurfaceReference>(
  reference: Reference,
) {
  return useFormlessUiContract(reference);
}

export function useFormlessUiDocumentTheme(reference: FormlessUiDocumentThemeReference) {
  return useFormlessUiContract(reference);
}

export function useFormlessUiManagementManifest(reference: FormlessUiManagementManifestReference) {
  return useFormlessUiContract(reference);
}

export function useFormlessUiManagementInstallDialog(
  reference: FormlessUiManagementInstallDialogReference,
) {
  return useFormlessUiContract(reference);
}

export function useFormlessUiShellManifest(reference: FormlessUiShellManifestReference) {
  return useFormlessUiContract(reference);
}

export function useFormlessUiShellNavigationSection(
  reference: FormlessUiShellNavigationSectionReference,
) {
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
