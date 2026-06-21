import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useLocation } from "wouter";
import { Button } from "@dpeek/formless-ui/button";
import { Description, FieldGroup, Label, fieldErrorStyles } from "@dpeek/formless-ui/field";
import { Input } from "@dpeek/formless-ui/input";
import {
  ModalBody,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@dpeek/formless-ui/modal";
import { TextField } from "@dpeek/formless-ui/text-field";
import { AddIcon } from "@dpeek/formless-ui/icons";
import {
  AppInstallApiError,
  createInstanceAppInstall,
  fetchInstanceAppInstalls,
} from "../../client/app-installs.ts";
import { instanceControlPlaneClientTarget } from "../../client/app-target.ts";
import {
  type AppInstall,
  type InstallableAppPackage,
  type PackageAppKey,
} from "@dpeek/formless-installed-apps";
import {
  WorkspaceGatewayApiError,
  fetchWorkspaceGatewayAutoSaveStatus,
  fetchWorkspaceGatewayOperation,
  fetchWorkspaceGatewayStatus,
  workspaceGatewayBrowserConfig,
  startWorkspaceGatewayOperation,
  type WorkspaceGatewayAutoSaveState,
  type WorkspaceGatewayConfig,
  type WorkspaceGatewayDisplayObject,
  type WorkspaceGatewayDisplayValue,
  type WorkspaceGatewayOperation,
  type WorkspaceGatewayOperationKind,
  type WorkspaceGatewayOperationLog,
  type WorkspaceGatewayOperationStep,
  type WorkspaceGatewayResponse,
  type WorkspaceGatewayStartInput,
} from "@dpeek/formless-gateway/client";
import {
  workspaceBrowserOperationControlMetadata,
  workspaceOperationActorAllowed,
  workspaceOperationDefinitionForKind,
  workspaceOperationInputFieldDefinition,
  type WorkspaceBrowserOperationControlMetadata,
  type WorkspaceOperationActor,
  type WorkspaceOperationMode,
  type WorkspaceOperationRequiredCapability,
} from "@dpeek/formless-workspace";
import { INSTANCE_CONTROL_PLANE_SCHEMA_KEY } from "@dpeek/formless-instance-control-plane";
import type { AppInstallsResponse } from "../../shared/protocol.ts";
import { runtimeTopologyRoutes } from "../../shared/runtime-topology.ts";
import { HomeRoute } from "./home.tsx";

export type PackageInstallDraft = {
  installId: string;
  label: string;
};

export type PackageInstallDrafts = Partial<Record<PackageAppKey, PackageInstallDraft>>;

export type InstanceShellRouteState =
  | { status: "failed"; message: string }
  | { status: "loading" }
  | {
      installError?: string;
      installErrorPackageAppKey?: PackageAppKey;
      installing: boolean;
      installingPackageAppKey?: PackageAppKey;
      installs: AppInstall[];
      packages: InstallableAppPackage[];
      status: "ready";
    };

export type WorkspaceGatewayRouteState =
  | { status: "unavailable" }
  | { status: "loading" }
  | {
      activeOperationId?: string;
      autoSave?: WorkspaceGatewayAutoSaveState;
      autoSaveError?: string;
      csrfToken?: string;
      currentOperation?: WorkspaceGatewayOperation;
      error?: string;
      status: "ready";
      statusOperation?: WorkspaceGatewayOperation;
    };

export type WorkspaceGatewayOperationControlGroup = "all" | "workspace";

export type WorkspaceGatewayRuntimeCapabilityFacts = {
  actor: WorkspaceOperationActor;
  capabilities: readonly WorkspaceOperationRequiredCapability[];
};

export type WorkspaceGatewayOperationControl = {
  bootstrapAllowed: boolean;
  group: Exclude<WorkspaceGatewayOperationControlGroup, "all">;
  input: WorkspaceGatewayStartInput;
  inputFields: readonly string[];
  kind: WorkspaceGatewayOperationKind;
  label: string;
  mode: WorkspaceOperationMode;
  requiredCapability: WorkspaceOperationRequiredCapability;
  style: "primary" | "secondary";
};

const localBrowserWorkspaceGatewayRuntimeFacts = {
  actor: "browser",
  capabilities: [
    "credential-setup",
    "workspace-read",
    "workspace-source-sync",
    "workspace-source-write",
  ],
} as const satisfies WorkspaceGatewayRuntimeCapabilityFacts;

export function selectWorkspaceGatewayOperationControls({
  operationGroup = "all",
  runtime = localBrowserWorkspaceGatewayRuntimeFacts,
}: {
  operationGroup?: WorkspaceGatewayOperationControlGroup;
  runtime?: WorkspaceGatewayRuntimeCapabilityFacts;
} = {}): WorkspaceGatewayOperationControl[] {
  const capabilities = new Set(runtime.capabilities);

  return workspaceBrowserOperationControlMetadata()
    .filter((metadata) => operationGroup !== "workspace" || metadata.kind === "push")
    .filter((metadata) => workspaceOperationActorAllowed(metadata.kind, runtime.actor))
    .filter((metadata) => capabilities.has(metadata.requiredCapability))
    .map(workspaceGatewayOperationControlFromMetadata)
    .filter((control) => operationGroup === "all" || control.group === operationGroup);
}

function workspaceGatewayOperationControlFromMetadata(
  metadata: WorkspaceBrowserOperationControlMetadata,
): WorkspaceGatewayOperationControl {
  return {
    bootstrapAllowed: metadata.bootstrapAllowed,
    group: workspaceGatewayOperationControlGroup(),
    input: workspaceGatewayStartInputFromControlMetadata(metadata),
    inputFields: metadata.inputFields,
    kind: metadata.kind,
    label: metadata.label,
    mode: metadata.mode,
    requiredCapability: metadata.requiredCapability,
    style: metadata.kind === "push" ? "primary" : "secondary",
  };
}

function workspaceGatewayOperationControlGroup(): WorkspaceGatewayOperationControl["group"] {
  return "workspace";
}

export function workspaceGatewayStartInputFromControlMetadata(
  metadata: WorkspaceBrowserOperationControlMetadata,
): WorkspaceGatewayStartInput {
  const input: Record<string, boolean | null | string | undefined> = { kind: metadata.kind };

  for (const fieldKey of metadata.inputFields) {
    const field = workspaceOperationInputFieldDefinition(metadata.kind, fieldKey);
    const value = workspaceGatewayControlDefaultValue(field);

    if (value !== undefined) {
      input[field.key] = value;
    }
  }

  return input as WorkspaceGatewayStartInput;
}

function workspaceGatewayControlDefaultValue(
  field: ReturnType<typeof workspaceOperationInputFieldDefinition>,
): boolean | null | string | undefined {
  if ("defaultValue" in field) {
    return field.defaultValue;
  }

  if (field.required && field.valueType === "enum" && field.allowedValues?.length === 1) {
    return field.allowedValues[0];
  }

  return undefined;
}

export function InstanceShellRoute({
  localWorkspaceGatewayAvailable: localWorkspaceGatewayAvailableProp,
}: { localWorkspaceGatewayAvailable?: boolean | undefined } = {}) {
  const [location, setLocation] = useLocation();
  const [state, setState] = useState<InstanceShellRouteState>({ status: "loading" });
  const [installDrafts, setInstallDrafts] = useState<PackageInstallDrafts>({});
  const workspaceGatewayConfig = useMemo(() => workspaceGatewayBrowserConfig(), []);
  const localWorkspaceGatewayAvailable =
    localWorkspaceGatewayAvailableProp ?? workspaceGatewayConfig !== undefined;
  const [workspaceGatewayState, setWorkspaceGatewayState] = useState<WorkspaceGatewayRouteState>(
    () => (localWorkspaceGatewayAvailable ? { status: "loading" } : { status: "unavailable" }),
  );

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;

    async function loadInstalls() {
      try {
        const workspaceGatewayResponse = await loadInitialWorkspaceGatewayStatus({
          config: workspaceGatewayConfig,
          signal: controller.signal,
        });

        if (stopped) {
          return;
        }

        if (workspaceGatewayResponse) {
          const autoSaveUpdate = await loadWorkspaceGatewayAutoSaveState({
            config: workspaceGatewayConfig,
            signal: controller.signal,
          });

          if (stopped) {
            return;
          }

          setWorkspaceGatewayState((current) =>
            workspaceGatewayReadyStateFromResponse(
              workspaceGatewayResponse,
              current,
              autoSaveUpdate,
            ),
          );

          if (workspaceInitialized(workspaceGatewayResponse.operation) === false) {
            const appResponse = await fetchInstanceAppInstalls({ signal: controller.signal });

            if (stopped) {
              return;
            }

            const uninitialized = instanceShellUninitializedWorkspaceInstallState(appResponse);

            setState(uninitialized.state);
            setInstallDrafts((current) =>
              initializePackageInstallDrafts({
                currentDrafts: current,
                installs: uninitialized.state.installs,
                packages: uninitialized.state.packages,
              }),
            );
            return;
          }
        } else {
          setWorkspaceGatewayState({ status: "unavailable" });
        }

        const appResponse = await fetchInstanceAppInstalls({ signal: controller.signal });

        if (stopped) {
          return;
        }

        setState({
          installing: false,
          installs: appResponse.installs,
          packages: appResponse.packages,
          status: "ready",
        });
        setInstallDrafts((current) =>
          initializePackageInstallDrafts({
            currentDrafts: current,
            installs: appResponse.installs,
            packages: appResponse.packages,
          }),
        );
      } catch (error) {
        if (!stopped && !controller.signal.aborted) {
          setState({
            status: "failed",
            message: error instanceof Error ? error.message : "Installed apps could not load.",
          });
        }
      }
    }

    void loadInstalls();

    return () => {
      stopped = true;
      controller.abort();
    };
  }, [workspaceGatewayConfig]);

  useEffect(() => {
    if (
      workspaceGatewayState.status !== "ready" ||
      !workspaceGatewayState.activeOperationId ||
      !workspaceGatewayState.currentOperation ||
      !operationPollsAutomatically(workspaceGatewayState.currentOperation)
    ) {
      return;
    }

    const operation = workspaceGatewayState.currentOperation;

    const operationId = workspaceGatewayState.activeOperationId;
    const operationKind = operation.operation;
    const intervalId = window.setInterval(() => {
      void refreshWorkspaceGatewayOperation({
        config: workspaceGatewayConfig,
        operationId,
        operationKind,
        setWorkspaceGatewayState,
      });
    }, 1500);

    return () => window.clearInterval(intervalId);
  }, [workspaceGatewayConfig, workspaceGatewayState]);

  const autoSaveDisplayState =
    workspaceGatewayState.status === "ready"
      ? workspaceGatewayState.autoSave?.displayState
      : undefined;

  useEffect(() => {
    if (autoSaveDisplayState !== "queued" && autoSaveDisplayState !== "saving") {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshWorkspaceGatewayAutoSave({
        config: workspaceGatewayConfig,
        setWorkspaceGatewayState,
      });
    }, 1500);

    return () => window.clearInterval(intervalId);
  }, [autoSaveDisplayState, workspaceGatewayConfig]);

  async function submitInstall(
    packageAppKey: PackageAppKey,
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (state.status !== "ready" || state.installing) {
      return;
    }

    const appPackage = state.packages.find(
      (candidate) => candidate.packageAppKey === packageAppKey,
    );
    const draft = installDrafts[packageAppKey];

    if (!appPackage || !draft) {
      return;
    }

    setState({
      ...state,
      installing: true,
      installingPackageAppKey: packageAppKey,
      installError: undefined,
      installErrorPackageAppKey: undefined,
    });

    try {
      const response = await createInstanceAppInstall({
        packageAppKey: appPackage.packageAppKey,
        installId: draft.installId,
        label: draft.label,
      });

      setState({
        installing: false,
        installs: response.installs,
        packages: state.packages,
        status: "ready",
      });
      setInstallDrafts((current) =>
        initializePackageInstallDrafts({
          currentDrafts: {
            ...current,
            [packageAppKey]: { installId: "", label: "" },
          },
          installs: response.installs,
          packages: state.packages,
        }),
      );
      setLocation(response.install.adminRoute);
    } catch (error) {
      const message =
        error instanceof AppInstallApiError || error instanceof Error
          ? error.message
          : `${appPackage.label} install failed.`;

      setState({
        ...state,
        installing: false,
        installingPackageAppKey: undefined,
        installError: message,
        installErrorPackageAppKey: packageAppKey,
      });
    }
  }

  async function startWorkspaceOperation(input: WorkspaceGatewayStartInput) {
    if (workspaceGatewayState.status !== "ready" || !workspaceGatewayConfig) {
      return;
    }

    setWorkspaceGatewayState({
      ...workspaceGatewayState,
      error: undefined,
    });

    try {
      const response = await startWorkspaceGatewayOperation(input, {
        config: workspaceGatewayConfig,
        csrfToken: workspaceGatewayState.csrfToken,
      });

      if (!response) {
        setWorkspaceGatewayState({ status: "unavailable" });
        return;
      }

      setWorkspaceGatewayState((current) =>
        workspaceGatewayReadyStateFromResponse(response, current, {
          activeOperationId: response.operation.id,
          currentOperation: response.operation,
        }),
      );
      if (!operationPollsAutomatically(response.operation)) {
        await refreshWorkspaceGatewayAutoSave({
          config: workspaceGatewayConfig,
          setWorkspaceGatewayState,
        });
      }
    } catch (error) {
      const message =
        error instanceof WorkspaceGatewayApiError || error instanceof Error
          ? error.message
          : "Workspace operation failed.";

      setWorkspaceGatewayState({
        ...workspaceGatewayState,
        error: displaySafeText(message),
      });
    }
  }

  async function pollWorkspaceOperation(
    operationId: string,
    operationKind?: WorkspaceGatewayOperationKind,
  ) {
    await refreshWorkspaceGatewayOperation({
      config: workspaceGatewayConfig,
      operationId,
      operationKind,
      setWorkspaceGatewayState,
    });
  }

  return (
    <InstanceShellRouteView
      currentPath={location}
      installDrafts={installDrafts}
      onPollWorkspaceOperation={pollWorkspaceOperation}
      onInstallDraftChange={(packageAppKey, draft) =>
        setInstallDrafts((current) => ({
          ...current,
          [packageAppKey]: draft,
        }))
      }
      onSubmitInstall={submitInstall}
      onStartWorkspaceOperation={startWorkspaceOperation}
      state={state}
      workspaceGatewayState={workspaceGatewayState}
    />
  );
}

async function loadInitialWorkspaceGatewayStatus({
  config,
  signal,
}: {
  config?: WorkspaceGatewayConfig;
  signal: AbortSignal;
}): Promise<WorkspaceGatewayResponse | undefined> {
  if (!config) {
    return undefined;
  }

  try {
    return await fetchWorkspaceGatewayStatus({ config, signal });
  } catch (error) {
    if (error instanceof WorkspaceGatewayApiError && error.status === 404) {
      return undefined;
    }

    throw error;
  }
}

async function loadWorkspaceGatewayAutoSaveState({
  config,
  signal,
}: {
  config?: WorkspaceGatewayConfig;
  signal?: AbortSignal;
}): Promise<Partial<Extract<WorkspaceGatewayRouteState, { status: "ready" }>>> {
  if (!config) {
    return {};
  }

  try {
    const response = await fetchWorkspaceGatewayAutoSaveStatus({ config, signal });

    if (!response) {
      return {};
    }

    return {
      autoSave: response.autoSave,
      autoSaveError: undefined,
      ...(response.csrfToken === undefined ? {} : { csrfToken: response.csrfToken }),
    };
  } catch (error) {
    if (error instanceof WorkspaceGatewayApiError && error.status === 404) {
      return {};
    }

    const message =
      error instanceof WorkspaceGatewayApiError || error instanceof Error
        ? error.message
        : "Workspace auto-save status could not load.";

    return {
      autoSaveError: displaySafeText(message),
    };
  }
}

async function refreshWorkspaceGatewayAutoSave({
  config,
  setWorkspaceGatewayState,
}: {
  config?: WorkspaceGatewayConfig;
  setWorkspaceGatewayState: Dispatch<SetStateAction<WorkspaceGatewayRouteState>>;
}): Promise<void> {
  const update = await loadWorkspaceGatewayAutoSaveState({ config });

  if (Object.keys(update).length === 0) {
    return;
  }

  setWorkspaceGatewayState((current) =>
    current.status === "ready"
      ? {
          ...current,
          ...update,
        }
      : current,
  );
}

async function refreshWorkspaceGatewayOperation({
  config,
  operationId,
  operationKind,
  setWorkspaceGatewayState,
}: {
  config?: WorkspaceGatewayConfig;
  operationId: string;
  operationKind?: WorkspaceGatewayOperationKind;
  setWorkspaceGatewayState: Dispatch<SetStateAction<WorkspaceGatewayRouteState>>;
}) {
  if (!config) {
    return;
  }

  try {
    const response = await fetchWorkspaceGatewayOperation(
      { operationId, operationKind },
      { config },
    );

    if (!response) {
      return;
    }

    setWorkspaceGatewayState((current) =>
      workspaceGatewayReadyStateFromResponse(response, current, {
        activeOperationId: response.operation.id,
        currentOperation: response.operation,
      }),
    );
    if (!operationPollsAutomatically(response.operation)) {
      await refreshWorkspaceGatewayAutoSave({ config, setWorkspaceGatewayState });
    }
  } catch (error) {
    const message =
      error instanceof WorkspaceGatewayApiError || error instanceof Error
        ? error.message
        : "Workspace operation refresh failed.";

    setWorkspaceGatewayState((current) =>
      current.status === "ready"
        ? {
            ...current,
            error: displaySafeText(message),
          }
        : current,
    );
  }
}

export function instanceShellUninitializedWorkspaceInstallState(appResponse: AppInstallsResponse): {
  state: Extract<InstanceShellRouteState, { status: "ready" }>;
} {
  return {
    state: {
      installing: false,
      installs: appResponse.installs,
      packages: appResponse.packages,
      status: "ready",
    },
  };
}

function workspaceGatewayReadyStateFromResponse(
  response: WorkspaceGatewayResponse,
  current: WorkspaceGatewayRouteState,
  overrides: Partial<Extract<WorkspaceGatewayRouteState, { status: "ready" }>> = {},
): Extract<WorkspaceGatewayRouteState, { status: "ready" }> {
  const currentReady = current.status === "ready" ? current : undefined;

  return {
    activeOperationId: currentReady?.activeOperationId,
    autoSave: currentReady?.autoSave,
    autoSaveError: currentReady?.autoSaveError,
    csrfToken: response.csrfToken ?? currentReady?.csrfToken,
    currentOperation: currentReady?.currentOperation ?? response.operation,
    status: "ready",
    statusOperation:
      response.operation.operation === "status"
        ? response.operation
        : currentReady?.statusOperation,
    ...overrides,
  };
}

function workspaceInitialized(operation?: WorkspaceGatewayOperation): boolean | undefined {
  const initialized =
    operation?.result?.summary.fields.initialized ?? operation?.summary.fields.initialized;

  return typeof initialized === "boolean" ? initialized : undefined;
}

export function operationPollsAutomatically(operation: WorkspaceGatewayOperation): boolean {
  return operation.status === "queued" || operation.status === "running";
}

export function InstanceShellRouteView({
  currentPath = runtimeTopologyRoutes.instanceRootRoute,
  installDrafts = {},
  onPollWorkspaceOperation,
  onInstallDraftChange,
  onSubmitInstall,
  onStartWorkspaceOperation,
  state,
  workspaceGatewayState = { status: "unavailable" },
}: {
  currentPath?: string;
  installDrafts?: PackageInstallDrafts;
  onPollWorkspaceOperation?: (
    operationId: string,
    operationKind?: WorkspaceGatewayOperationKind,
  ) => void;
  onInstallDraftChange?: (packageAppKey: PackageAppKey, draft: PackageInstallDraft) => void;
  onSubmitInstall?: (packageAppKey: PackageAppKey, event: React.FormEvent<HTMLFormElement>) => void;
  onStartWorkspaceOperation?: (input: WorkspaceGatewayStartInput) => void;
  state: InstanceShellRouteState;
  workspaceGatewayState?: WorkspaceGatewayRouteState;
}) {
  const [installDialogOpen, setInstallDialogOpen] = useState(false);

  if (state.status === "loading") {
    return (
      <section className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
        <ShellHeader currentPath={currentPath} />
        <p className="text-sm text-muted-fg">Loading installed apps...</p>
      </section>
    );
  }

  if (state.status === "failed") {
    return (
      <section className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
        <ShellHeader currentPath={currentPath} />
        <p className="text-sm text-red-700" role="alert">
          {state.message}
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <ShellHeader currentPath={currentPath} />
      <WorkspaceGatewayManagementSection
        onPollOperation={onPollWorkspaceOperation}
        onStartOperation={onStartWorkspaceOperation}
        state={workspaceGatewayState}
      />
      <GeneratedInstanceAppsSection
        installDisabled={state.installing || state.packages.length === 0}
        onInstall={() => setInstallDialogOpen(true)}
      />
      <GeneratedInstanceRoutesSection />
      <InstallAppDialog
        installDrafts={installDrafts}
        onDraftChange={onInstallDraftChange}
        onOpenChange={setInstallDialogOpen}
        onSubmitInstall={onSubmitInstall}
        open={installDialogOpen}
        state={state}
      />
    </section>
  );
}

function WorkspaceGatewayManagementSection({
  onPollOperation,
  onStartOperation,
  state,
}: {
  onPollOperation?: (operationId: string, operationKind?: WorkspaceGatewayOperationKind) => void;
  onStartOperation?: (input: WorkspaceGatewayStartInput) => void;
  state: WorkspaceGatewayRouteState;
}) {
  if (state.status === "unavailable") {
    return null;
  }

  const progressOperation =
    state.status === "ready" ? workspaceManagementOperation(state) : undefined;
  const progressError = state.status === "ready" ? state.error : undefined;

  return (
    <section
      aria-labelledby="workspace-gateway-heading"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2"
      data-formless-workspace-gateway="local"
    >
      <div className="min-w-0">
        <h2 id="workspace-gateway-heading" className="sr-only">
          Workspace
        </h2>
        {state.status === "ready" ? (
          <WorkspaceOperationCompactStatus error={progressError} operation={progressOperation} />
        ) : null}
      </div>
      <WorkspaceGatewayOperationControls
        onStartOperation={onStartOperation}
        operationGroup="workspace"
        state={state}
      />
      {state.status === "ready" ? (
        <WorkspaceOperationAuthorizationEvents
          onPollOperation={onPollOperation}
          operation={progressOperation}
        />
      ) : null}
    </section>
  );
}

function WorkspaceGatewayOperationControls({
  onStartOperation,
  operationGroup = "all",
  state,
}: {
  onStartOperation?: (input: WorkspaceGatewayStartInput) => void;
  operationGroup?: WorkspaceGatewayOperationControlGroup;
  state: WorkspaceGatewayRouteState;
}) {
  const busy =
    state.status === "loading" ||
    (state.status === "ready" &&
      state.currentOperation !== undefined &&
      operationPollsAutomatically(state.currentOperation));
  const canStart = state.status === "ready" && !busy && onStartOperation !== undefined;
  const controls = selectWorkspaceGatewayOperationControls({ operationGroup });

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-formless-workspace-operation-controls="true"
    >
      {controls.map((control) => {
        const canRunControl =
          canStart &&
          (control.mode === "read" || Boolean(state.status === "ready" && state.csrfToken));

        return (
          <Button
            data-formless-workspace-operation-bootstrap-allowed={String(control.bootstrapAllowed)}
            data-formless-workspace-operation-control={control.kind}
            data-formless-workspace-operation-input-fields={control.inputFields.join(" ")}
            data-formless-workspace-operation-mode={control.mode}
            data-formless-workspace-operation-required-capability={control.requiredCapability}
            intent={control.style === "secondary" ? "outline" : undefined}
            isDisabled={!canRunControl}
            key={control.kind}
            onPress={() => onStartOperation?.(control.input)}
            size="sm"
            type="button"
          >
            {control.label}
          </Button>
        );
      })}
    </div>
  );
}

function WorkspaceOperationCompactStatus({
  error,
  operation,
}: {
  operation?: WorkspaceGatewayOperation;
  error?: string;
}) {
  if (!operation && !error) {
    return null;
  }

  const succeeded = operation?.status === "succeeded";
  const failed = operation?.status === "failed" || Boolean(error);

  if (!succeeded && !failed) {
    return null;
  }

  const label = error
    ? "Push failed"
    : operation
      ? `${workspaceOperationKindLabel(operation.operation)} ${workspaceOperationStatusLabel(operation.status).toLowerCase()}`
      : "Push failed";

  return (
    <div data-formless-workspace-operation-feedback="true">
      {error ? (
        <p className={fieldErrorStyles()} data-slot="field-error" role="alert">
          {displaySafeText(error)}
        </p>
      ) : (
        <p
          className={failed ? "text-xs text-red-700" : "text-xs text-muted-fg"}
          role={failed ? "alert" : undefined}
        >
          {displaySafeText(label)}
        </p>
      )}
    </div>
  );
}

export function WorkspaceOperationProgress({
  error,
  onPollOperation,
  operation,
}: {
  error?: string;
  onPollOperation?: (operationId: string, operationKind?: WorkspaceGatewayOperationKind) => void;
  operation?: WorkspaceGatewayOperation;
}) {
  if (!operation && !error) {
    return null;
  }

  return (
    <div
      className="grid gap-3 rounded-md border border-border bg-overlay p-4"
      data-formless-workspace-operation-progress="true"
    >
      {operation ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">{operation.summary.title}</h3>
              <p className="text-xs text-muted-fg">
                {workspaceOperationKindLabel(operation.operation)} ·{" "}
                {workspaceOperationStatusLabel(operation.status)}
              </p>
            </div>
            <span className="text-xs text-muted-fg">
              <code>{displaySafeText(operation.id)}</code>
            </span>
          </div>
          <DisplaySafeObject fields={operation.summary.fields} />
          {operation.result?.deployment ? (
            <DisplaySafeObject fields={operation.result.deployment} heading="Provider details" />
          ) : null}
          {operation.result?.details ? (
            <DisplaySafeObject fields={operation.result.details} heading="Details" />
          ) : null}
          <WorkspaceOperationSteps steps={operation.steps ?? operation.result?.steps ?? []} />
          <WorkspaceOperationEvents
            events={operation.events}
            onPollOperation={(operationId) => onPollOperation?.(operationId, operation.operation)}
            operationId={operation.id}
          />
          <WorkspaceOperationLogs logs={operation.logs} />
          <WorkspaceOperationErrors errors={operation.errors} />
        </>
      ) : null}
      {error ? (
        <p className={fieldErrorStyles()} data-slot="field-error" role="alert">
          {displaySafeText(error)}
        </p>
      ) : null}
    </div>
  );
}

function WorkspaceOperationSteps({ steps }: { steps: readonly WorkspaceGatewayOperationStep[] }) {
  if (steps.length === 0) {
    return null;
  }

  return (
    <ol className="grid gap-2 text-xs" data-formless-workspace-operation-steps="true">
      {steps.map((step) => (
        <li
          className="min-w-0 rounded border border-border px-3 py-2"
          data-formless-workspace-operation-step={step.id}
          data-formless-workspace-operation-step-status={step.status}
          key={step.id}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-fg">{displaySafeText(step.label)}</span>
            <span className="text-muted-fg">{workspaceOperationStepStatusLabel(step.status)}</span>
          </div>
          {step.detail ? (
            <p className="mt-1 text-muted-fg">{displaySafeText(step.detail)}</p>
          ) : null}
          {step.fields ? (
            <div className="mt-2">
              <DisplaySafeObject fields={step.fields} />
            </div>
          ) : null}
          {step.error ? (
            <p className={fieldErrorStyles()} data-slot="field-error" role="alert">
              {displaySafeText(step.error)}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function DisplaySafeObject({
  fields,
  heading,
}: {
  fields: WorkspaceGatewayDisplayObject;
  heading?: string;
}) {
  const entries = displaySafeEntries(fields);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="min-w-0 space-y-2">
      {heading ? <h4 className="text-xs font-semibold">{heading}</h4> : null}
      <dl className="grid gap-2 text-xs text-muted-fg sm:grid-cols-2">
        {entries.map((entry) => (
          <div className="min-w-0" key={entry.key}>
            <dt className="font-medium text-fg">{entry.label}</dt>
            <dd className="break-words">{entry.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function WorkspaceOperationEvents({
  events,
  onPollOperation,
  operationId,
}: {
  events: WorkspaceGatewayOperation["events"];
  onPollOperation: (operationId: string) => void;
  operationId: string;
}) {
  const authorizationEvents = events
    .map((event) =>
      event.type === "externalAuthorizationUrl"
        ? {
            ...event,
            url: displaySafeAuthorizationUrl(event.url, event.provider),
          }
        : undefined,
    )
    .filter((event): event is NonNullable<typeof event> => event !== undefined && event.url !== "");

  if (authorizationEvents.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2" data-formless-workspace-auth-url-events="true">
      {authorizationEvents.map((event) => (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded border border-dashed border-border px-3 py-2 text-xs"
          key={event.id}
        >
          <span>
            {workspaceProviderLabel(event.provider)} authorization ·{" "}
            {displaySafeText(event.profileLabel)}
          </span>
          <Button
            intent="outline"
            onPress={() => {
              window.open(event.url, "_blank", "noopener,noreferrer");
              onPollOperation(operationId);
            }}
            size="sm"
            type="button"
          >
            Open authorization
          </Button>
        </div>
      ))}
    </div>
  );
}

function WorkspaceOperationAuthorizationEvents({
  onPollOperation,
  operation,
}: {
  onPollOperation?: (operationId: string, operationKind?: WorkspaceGatewayOperationKind) => void;
  operation?: WorkspaceGatewayOperation;
}) {
  if (!operation) {
    return null;
  }

  return (
    <WorkspaceOperationEvents
      events={operation.events}
      onPollOperation={(operationId) => onPollOperation?.(operationId, operation.operation)}
      operationId={operation.id}
    />
  );
}

function WorkspaceOperationLogs({ logs }: { logs: WorkspaceGatewayOperation["logs"] }) {
  if (logs.length === 0) {
    return null;
  }

  return (
    <ol className="space-y-1 text-xs text-muted-fg">
      {logs.map((log) => (
        <li key={log.id}>
          {workspaceOperationLogLevelLabel(log.level)} · {displaySafeText(log.message)}
        </li>
      ))}
    </ol>
  );
}

function WorkspaceOperationErrors({ errors }: { errors: WorkspaceGatewayOperation["errors"] }) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1">
      {errors.map((operationError) => (
        <p
          className={fieldErrorStyles()}
          data-slot="field-error"
          key={`${operationError.at}:${operationError.message}`}
          role="alert"
        >
          {displaySafeText(operationError.message)}
        </p>
      ))}
    </div>
  );
}

export function displaySafeEntries(fields: WorkspaceGatewayDisplayObject): Array<{
  key: string;
  label: string;
  value: string;
}> {
  return Object.entries(fields).map(([key, value]) => ({
    key,
    label: fieldKeyLabel(key),
    value: displaySafeValue(key, value),
  }));
}

function displaySafeValue(key: string, value: WorkspaceGatewayDisplayValue): string {
  if (isForbiddenDisplayKey(key)) {
    return "[redacted]";
  }

  if (typeof value === "string") {
    return displaySafeText(value);
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => displaySafeValue(key, item)).join(", ");
  }

  const entries = Object.entries(value).map(([childKey, childValue]) => [
    childKey,
    displaySafeValue(childKey, childValue),
  ]);

  return entries
    .map(([childKey, childValue]) => `${fieldKeyLabel(childKey)} ${childValue}`)
    .join(", ");
}

export function displaySafeText(value: string): string {
  return value
    .replace(
      /([A-Z0-9_]*(?:TOKEN|PASSWORD|SECRET|API_KEY|APIKEY)[A-Z0-9_]*=)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1[redacted]",
    )
    .replace(/(owner[-_\s]?setup[-_\s]?token[:=]?\s*)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .replace(/lease:[A-Za-z0-9._:-]+/gi, "[redacted]")
    .replace(/CF_API_TOKEN[_A-Za-z0-9-]*/g, "[redacted]")
    .replace(/\/Users\/[^\s,;'"<>)]+/g, "<path>")
    .replace(/\/(?:tmp|var|etc|home)\/[^\s,;'"<>)]+/g, "<path>")
    .replace(/[A-Za-z]:\\[^\s,;'"<>)]+/g, "<path>");
}

function displaySafeAuthorizationUrl(value: string, provider: "alchemy" | "cloudflare"): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return "";
  }

  if (url.protocol !== "https:") {
    return "";
  }

  for (const key of url.searchParams.keys()) {
    if (isForbiddenDisplayKey(key)) {
      return "";
    }
  }

  const host = url.hostname.toLowerCase();

  if (provider === "cloudflare" && host === "dash.cloudflare.com") {
    return url.toString();
  }

  if (
    provider === "alchemy" &&
    (host === "alchemy.com" ||
      host.endsWith(".alchemy.com") ||
      host === "alchemy.run" ||
      host.endsWith(".alchemy.run"))
  ) {
    return url.toString();
  }

  return "";
}

function isForbiddenDisplayKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll(/[-_]/g, "");

  return (
    normalized === "secret" ||
    normalized === "secrets" ||
    normalized.endsWith("token") ||
    normalized.endsWith("password") ||
    normalized.includes("apikey") ||
    normalized.includes("credential") ||
    normalized === "leasetoken" ||
    normalized.includes("providerstate") ||
    normalized.startsWith("raw")
  );
}

function fieldKeyLabel(key: string): string {
  return key
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll(/[-_]/g, " ")
    .replace(/^\w/, (match) => match.toUpperCase());
}

function workspaceOperationKindLabel(kind: WorkspaceGatewayOperationKind): string {
  return workspaceOperationDefinitionForKind(kind).label;
}

function workspaceOperationStatusLabel(status: WorkspaceGatewayOperation["status"]): string {
  return fieldKeyLabel(status);
}

function workspaceOperationLogLevelLabel(level: WorkspaceGatewayOperationLog["level"]): string {
  return fieldKeyLabel(level);
}

function workspaceOperationStepStatusLabel(
  status: WorkspaceGatewayOperationStep["status"],
): string {
  return fieldKeyLabel(status);
}

function workspaceProviderLabel(provider: "alchemy" | "cloudflare"): string {
  return provider === "cloudflare" ? "Cloudflare" : "Alchemy";
}

function workspaceManagementOperation(
  state: WorkspaceGatewayRouteState,
): WorkspaceGatewayOperation | undefined {
  if (state.status !== "ready") {
    return undefined;
  }

  const operation = state.currentOperation;

  if (!operation || operation.operation !== "push") {
    return undefined;
  }

  return operation;
}

function GeneratedInstanceAppsSection({
  installDisabled,
  onInstall,
}: {
  installDisabled: boolean;
  onInstall: () => void;
}) {
  const controlPlaneTarget = useMemo(() => instanceControlPlaneClientTarget(), []);

  return (
    <section aria-label="Apps" className="space-y-3">
      <div data-formless-control-plane-screen="apps">
        <HomeRoute
          schemaKey={INSTANCE_CONTROL_PLANE_SCHEMA_KEY}
          sectionOperationControls={{
            "app-installs": (
              <Button
                aria-haspopup="dialog"
                isDisabled={installDisabled}
                onPress={onInstall}
                size="sm"
                type="button"
              >
                <AddIcon />
                Install
              </Button>
            ),
          }}
          screenPath="/"
          target={controlPlaneTarget}
        />
      </div>
    </section>
  );
}

function GeneratedInstanceRoutesSection() {
  const controlPlaneTarget = useMemo(() => instanceControlPlaneClientTarget(), []);

  return (
    <section aria-label="Routes" className="space-y-3">
      <div data-formless-control-plane-screen="routes">
        <HomeRoute
          schemaKey={INSTANCE_CONTROL_PLANE_SCHEMA_KEY}
          screenPath="/routes"
          target={controlPlaneTarget}
        />
      </div>
    </section>
  );
}

function ShellHeader({ currentPath }: { currentPath: string }) {
  void currentPath;

  return (
    <header>
      <h1 className="text-2xl font-semibold">Instance Settings</h1>
    </header>
  );
}

export function InstallAppDialog({
  installDrafts = {},
  onDraftChange,
  onOpenChange,
  onSubmitInstall,
  open,
  state,
}: {
  installDrafts?: PackageInstallDrafts;
  onDraftChange?: (packageAppKey: PackageAppKey, draft: PackageInstallDraft) => void;
  onOpenChange: (open: boolean) => void;
  onSubmitInstall?: (packageAppKey: PackageAppKey, event: React.FormEvent<HTMLFormElement>) => void;
  open: boolean;
  state: Extract<InstanceShellRouteState, { status: "ready" }>;
}) {
  return (
    <ModalContent isOpen={open} onOpenChange={onOpenChange} size="lg">
      <InstallAppDialogForm
        installDrafts={installDrafts}
        onDraftChange={onDraftChange}
        onSubmitInstall={onSubmitInstall}
        state={state}
      />
    </ModalContent>
  );
}

export function InstallAppDialogForm({
  installDrafts = {},
  onDraftChange,
  onSubmitInstall,
  state,
}: {
  installDrafts?: PackageInstallDrafts;
  onDraftChange?: (packageAppKey: PackageAppKey, draft: PackageInstallDraft) => void;
  onSubmitInstall?: (packageAppKey: PackageAppKey, event: React.FormEvent<HTMLFormElement>) => void;
  state: Extract<InstanceShellRouteState, { status: "ready" }>;
}) {
  const [selectedPackageAppKey, setSelectedPackageAppKey] = useState<PackageAppKey | null>(
    state.packages[0]?.packageAppKey ?? null,
  );

  useEffect(() => {
    if (
      state.installErrorPackageAppKey &&
      state.packages.some(
        (appPackage) => appPackage.packageAppKey === state.installErrorPackageAppKey,
      )
    ) {
      if (selectedPackageAppKey !== state.installErrorPackageAppKey) {
        setSelectedPackageAppKey(state.installErrorPackageAppKey);
      }
      return;
    }

    if (
      selectedPackageAppKey &&
      state.packages.some((appPackage) => appPackage.packageAppKey === selectedPackageAppKey)
    ) {
      return;
    }

    setSelectedPackageAppKey(state.packages[0]?.packageAppKey ?? null);
  }, [selectedPackageAppKey, state.installErrorPackageAppKey, state.packages]);

  const selectedPackage =
    state.packages.find((appPackage) => appPackage.packageAppKey === selectedPackageAppKey) ??
    state.packages[0];

  if (!selectedPackage) {
    return null;
  }

  const selectedDraft = installDrafts[selectedPackage.packageAppKey] ?? {
    installId: selectedPackage.defaultInstallId,
    label: selectedPackage.label,
  };
  const selectedInstallError =
    state.installErrorPackageAppKey === selectedPackage.packageAppKey
      ? state.installError
      : undefined;
  const selectedInstalling =
    state.installing && state.installingPackageAppKey === selectedPackage.packageAppKey;

  return (
    <form
      onSubmit={(event) => onSubmitInstall?.(selectedPackage.packageAppKey, event)}
      className="contents"
    >
      <ModalHeader>
        <ModalTitle>Install app</ModalTitle>
        <ModalDescription>
          Choose an app type, then set its instance label and install id.
        </ModalDescription>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-5">
          <PackageTypeSwitcher
            isDisabled={state.installing}
            onSelect={setSelectedPackageAppKey}
            packages={state.packages}
            selectedPackageAppKey={selectedPackage.packageAppKey}
          />
          <PackageInstallFields
            appPackage={selectedPackage}
            draft={selectedDraft}
            installError={selectedInstallError}
            isDisabled={state.installing}
            onDraftChange={(draft) => onDraftChange?.(selectedPackage.packageAppKey, draft)}
          />
        </div>
      </ModalBody>
      <ModalFooter>
        <ModalClose intent="outline" isDisabled={state.installing} type="button">
          Cancel
        </ModalClose>
        <Button isDisabled={state.installing} type="submit">
          <AddIcon />
          {selectedInstalling ? "Installing..." : `Install ${selectedPackage.label}`}
        </Button>
      </ModalFooter>
    </form>
  );
}

function PackageTypeSwitcher({
  isDisabled,
  onSelect,
  packages,
  selectedPackageAppKey,
}: {
  isDisabled: boolean;
  onSelect: (packageAppKey: PackageAppKey) => void;
  packages: readonly InstallableAppPackage[];
  selectedPackageAppKey: PackageAppKey;
}) {
  return (
    <div
      aria-label="Install app type"
      className="grid grid-cols-2 gap-1 rounded-md border border-border bg-muted p-1 sm:grid-cols-4"
      role="tablist"
    >
      {packages.map((appPackage) => {
        const isSelected = appPackage.packageAppKey === selectedPackageAppKey;

        return (
          <button
            aria-controls="install-app-type-panel"
            aria-selected={isSelected}
            className={packageTypeButtonClassName(isSelected)}
            disabled={isDisabled}
            key={appPackage.packageAppKey}
            onClick={() => onSelect(appPackage.packageAppKey)}
            role="tab"
            type="button"
          >
            {appPackage.label}
          </button>
        );
      })}
    </div>
  );
}

function PackageInstallFields({
  appPackage,
  draft,
  installError,
  isDisabled,
  onDraftChange,
}: {
  appPackage: InstallableAppPackage;
  draft: PackageInstallDraft;
  installError: string | undefined;
  isDisabled: boolean;
  onDraftChange?: (draft: PackageInstallDraft) => void;
}) {
  const labelInputId = useMemo(
    () => `${appPackage.packageAppKey}-install-dialog-label`,
    [appPackage.packageAppKey],
  );
  const installIdInputId = useMemo(
    () => `${appPackage.packageAppKey}-install-dialog-id`,
    [appPackage.packageAppKey],
  );

  return (
    <div className="space-y-4" id="install-app-type-panel" role="tabpanel">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold">{appPackage.label}</h3>
        <p className="text-xs text-muted-fg">{appPackage.description}</p>
      </header>
      <FieldGroup>
        <TextField
          isDisabled={isDisabled}
          isRequired
          onChange={(value) => onDraftChange?.({ ...draft, label: value })}
          value={draft.label}
        >
          <Label htmlFor={labelInputId}>Label</Label>
          <Input id={labelInputId} />
        </TextField>
        <TextField
          isDisabled={isDisabled}
          isRequired
          onChange={(value) => onDraftChange?.({ ...draft, installId: value })}
          value={draft.installId}
        >
          <Label htmlFor={installIdInputId}>Install id</Label>
          <Input id={installIdInputId} />
          <Description>Lowercase letters, numbers, and hyphens</Description>
        </TextField>
      </FieldGroup>
      {installError ? (
        <p className={fieldErrorStyles()} data-slot="field-error" role="alert">
          {installError}
        </p>
      ) : null}
    </div>
  );
}

function packageTypeButtonClassName(isSelected: boolean) {
  const base =
    "min-h-8 rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

  return isSelected
    ? `${base} bg-overlay text-fg shadow-xs`
    : `${base} text-muted-fg hover:bg-overlay/70 hover:text-fg`;
}

function initializePackageInstallDrafts({
  currentDrafts,
  installs,
  packages,
}: {
  currentDrafts: PackageInstallDrafts;
  installs: readonly AppInstall[];
  packages: readonly InstallableAppPackage[];
}): PackageInstallDrafts {
  const nextDrafts: PackageInstallDrafts = {};

  for (const appPackage of packages) {
    const current = currentDrafts[appPackage.packageAppKey];

    nextDrafts[appPackage.packageAppKey] = {
      label: current?.label.trim() ? current.label : appPackage.label,
      installId: current?.installId.trim()
        ? current.installId
        : availableDefaultInstallId(appPackage, installs),
    };
  }

  return nextDrafts;
}

function availableDefaultInstallId(
  appPackage: InstallableAppPackage,
  installs: readonly AppInstall[],
) {
  const installedIds = new Set(installs.map((install) => install.installId));

  if (!installedIds.has(appPackage.defaultInstallId)) {
    return appPackage.defaultInstallId;
  }

  for (let index = 2; index < 100; index += 1) {
    const candidate = `${appPackage.defaultInstallId}-${index}`;

    if (!installedIds.has(candidate)) {
      return candidate;
    }
  }

  return appPackage.defaultInstallId;
}
