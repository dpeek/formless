import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Link, useLocation } from "wouter";
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
import { AddIcon, RemoveIcon } from "@dpeek/formless-ui/icons";
import {
  AppInstallApiError,
  createInstanceAppInstall,
  fetchInstanceAppInstalls,
} from "../../client/app-installs.ts";
import { instanceControlPlaneClientTarget } from "../../client/app-target.ts";
import { fetchInstanceDomainMappings } from "../../client/domain-mappings.ts";
import {
  deleteInstanceDomainProviderResource,
  DomainProviderApiError,
  fetchInstanceDomainProviderDeleteJob,
  fetchInstanceDomainProviderPlan,
  fetchInstanceDomainProviderRedirects,
  markInstanceDomainProviderResourceManuallyRemoved,
} from "../../client/domain-provider.ts";
import {
  DeploymentRuntimeApiError,
  fetchInstanceDeploymentDesiredState,
  fetchInstanceDeploymentStatus,
} from "../../client/deployment-runtime.ts";
import { useRecordsById } from "../../client/store.ts";
import {
  type AppInstall,
  type InstallableAppPackage,
  type PackageAppKey,
} from "../../shared/app-installs.ts";
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
  WORKSPACE_OPERATION_DEFINITIONS,
  workspaceOperationDefinitionForKind,
  type WorkspaceBrowserOperationDefinition,
  type WorkspaceOperationActor,
  type WorkspaceOperationInputFieldDefinition,
  type WorkspaceOperationRequiredCapability,
} from "@dpeek/formless-workspace";
import {
  deploymentStatusDisplaySummary,
  type InstanceDeploymentDesiredStateResponse,
  type InstanceDeploymentStatusResponse,
} from "../../shared/deployment-runtime.ts";
import {
  INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  type InstanceControlPlaneDeploymentConfigValues,
} from "../../shared/instance-control-plane.ts";
import type { AppInstallsResponse, StoredRecord } from "../../shared/protocol.ts";
import type {
  InstanceDomainProviderAppliedResourceState,
  InstanceDomainProviderDeleteJob,
  InstanceDomainProviderDeleteTarget,
  InstanceDomainProviderPlanResponse,
} from "../../shared/domain-provider-api.ts";
import type { InstanceDomainMappingAppliedState } from "../../shared/instance-domain-mappings.ts";
import { runtimeTopologyRoutes } from "../../shared/runtime-topology.ts";
import { HomeRoute } from "./home.tsx";

export type PackageInstallDraft = {
  installId: string;
  label: string;
};

export type PackageInstallDrafts = Partial<Record<PackageAppKey, PackageInstallDraft>>;

type DomainProviderDeleteActionInput = {
  host: string;
  kind?: InstanceDomainProviderAppliedResourceState["kind"];
  logicalId?: string;
};

type DomainProviderCleanupActionInput = {
  host: string;
  kind: InstanceDomainProviderAppliedResourceState["kind"];
  logicalId: string;
};

export type InstanceShellRouteState =
  | { status: "failed"; message: string }
  | { status: "loading" }
  | {
      domainAppliedStates: InstanceDomainMappingAppliedState[];
      domainProviderAppliedResources?: InstanceDomainProviderAppliedResourceState[];
      domainProviderCleanupError?: string;
      domainProviderCleanupKey?: string;
      domainProviderCleanupMessage?: string;
      domainProviderDeleteJob?: InstanceDomainProviderDeleteJob;
      domainProviderDeleteError?: string;
      domainProviderDeleteMessage?: string;
      domainProviderDeletingKey?: string;
      domainProviderPlan?: InstanceDomainProviderPlanResponse;
      domainProviderPlanError?: string;
      domainProviderPlanLoading?: boolean;
      deploymentDesiredState?: InstanceDeploymentDesiredStateResponse;
      deploymentStatus?: InstanceDeploymentStatusResponse;
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

export type WorkspaceGatewayOperationControlGroup = "all" | "deployment" | "workspace";

export type WorkspaceGatewayRuntimeCapabilityFacts = {
  actor: WorkspaceOperationActor;
  capabilities: readonly WorkspaceOperationRequiredCapability[];
};

export type WorkspaceGatewayOperationControl = {
  group: Exclude<WorkspaceGatewayOperationControlGroup, "all">;
  input: WorkspaceGatewayStartInput;
  inputFields: readonly string[];
  kind: WorkspaceGatewayOperationKind;
  label: string;
  requiredCapability: WorkspaceOperationRequiredCapability;
  style: "primary" | "secondary";
};

const localBrowserWorkspaceGatewayRuntimeFacts = {
  actor: "browser",
  capabilities: [
    "credential-setup",
    "deployment-apply",
    "deployment-observe",
    "deployment-plan",
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

  return WORKSPACE_OPERATION_DEFINITIONS.filter(hasWorkspaceBrowserGatewayBinding)
    .filter((definition) => definition.mode === "write")
    .filter((definition) => definition.actorPolicy.allowedActors.includes(runtime.actor))
    .filter((definition) => capabilities.has(definition.requiredCapability))
    .map(workspaceGatewayOperationControlFromDefinition)
    .filter((control) => operationGroup === "all" || control.group === operationGroup);
}

function workspaceGatewayOperationControlFromDefinition(
  definition: WorkspaceBrowserOperationDefinition,
): WorkspaceGatewayOperationControl {
  return {
    group: workspaceGatewayOperationControlGroup(definition),
    input: workspaceGatewayStartInputFromDefinition(definition),
    inputFields: definition.bindings.gateway.inputFields,
    kind: definition.kind,
    label: definition.label,
    requiredCapability: definition.requiredCapability,
    style: definition.requiredCapability === "deployment-apply" ? "primary" : "secondary",
  };
}

function workspaceGatewayOperationControlGroup(
  definition: WorkspaceBrowserOperationDefinition,
): WorkspaceGatewayOperationControl["group"] {
  return definition.requiredCapability === "credential-setup" ||
    definition.requiredCapability.startsWith("deployment-")
    ? "deployment"
    : "workspace";
}

export function workspaceGatewayStartInputFromDefinition(
  definition: WorkspaceBrowserOperationDefinition,
): WorkspaceGatewayStartInput {
  const fieldsByKey = new Map(definition.input.fields.map((field) => [field.key, field]));
  const input: Record<string, boolean | null | string | undefined> = { kind: definition.kind };

  for (const fieldKey of definition.bindings.gateway.inputFields) {
    const field = fieldsByKey.get(fieldKey);

    if (!field) {
      continue;
    }

    const value = workspaceGatewayControlDefaultValue(field);

    if (value !== undefined) {
      input[field.key] = value;
    }
  }

  return input as WorkspaceGatewayStartInput;
}

function workspaceGatewayControlDefaultValue(
  field: WorkspaceOperationInputFieldDefinition,
): boolean | null | string | undefined {
  if ("defaultValue" in field) {
    return field.defaultValue;
  }

  if (field.required && field.valueType === "enum" && field.allowedValues?.length === 1) {
    return field.allowedValues[0];
  }

  return undefined;
}

function hasWorkspaceBrowserGatewayBinding(
  definition: (typeof WORKSPACE_OPERATION_DEFINITIONS)[number],
): definition is WorkspaceBrowserOperationDefinition {
  return "gateway" in definition.bindings;
}

export function InstanceShellRoute() {
  const [location, setLocation] = useLocation();
  const [state, setState] = useState<InstanceShellRouteState>({ status: "loading" });
  const [installDrafts, setInstallDrafts] = useState<PackageInstallDrafts>({});
  const workspaceGatewayConfig = useMemo(() => workspaceGatewayBrowserConfig(), []);
  const [workspaceGatewayState, setWorkspaceGatewayState] = useState<WorkspaceGatewayRouteState>(
    () => (workspaceGatewayConfig ? { status: "loading" } : { status: "unavailable" }),
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
        }

        const [
          appResponse,
          domainResponse,
          redirectResponse,
          providerPlanResponse,
          deploymentDesiredState,
          deploymentStatus,
        ] = await Promise.all([
          fetchInstanceAppInstalls({ signal: controller.signal }),
          fetchInstanceDomainMappings({ signal: controller.signal }),
          fetchInstanceDomainProviderRedirects({ signal: controller.signal }),
          fetchInstanceDomainProviderPlan({ signal: controller.signal }),
          fetchOptionalInstanceDeploymentDesiredState(controller.signal),
          fetchOptionalInstanceDeploymentStatus(controller.signal),
        ]);

        if (stopped) {
          return;
        }

        setState({
          domainAppliedStates: domainResponse.appliedStates,
          domainProviderAppliedResources: redirectResponse.appliedResources,
          domainProviderDeletingKey: undefined,
          domainProviderPlan: providerPlanResponse,
          domainProviderPlanLoading: false,
          ...(deploymentDesiredState === undefined ? {} : { deploymentDesiredState }),
          ...(deploymentStatus === undefined ? {} : { deploymentStatus }),
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

    const operationId = workspaceGatewayState.activeOperationId;
    const operationKind = workspaceGatewayState.currentOperation.operation;
    const intervalId = window.setInterval(() => {
      void refreshWorkspaceGatewayOperation({
        config: workspaceGatewayConfig,
        operationId,
        operationKind,
        setInstanceShellState: setState,
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
        domainAppliedStates: state.domainAppliedStates,
        domainProviderAppliedResources: state.domainProviderAppliedResources,
        domainProviderCleanupError: state.domainProviderCleanupError,
        domainProviderCleanupKey: state.domainProviderCleanupKey,
        domainProviderCleanupMessage: state.domainProviderCleanupMessage,
        domainProviderDeleteJob: state.domainProviderDeleteJob,
        domainProviderDeleteError: state.domainProviderDeleteError,
        domainProviderDeleteMessage: state.domainProviderDeleteMessage,
        domainProviderDeletingKey: state.domainProviderDeletingKey,
        domainProviderPlan: state.domainProviderPlan,
        domainProviderPlanError: state.domainProviderPlanError,
        domainProviderPlanLoading: state.domainProviderPlanLoading,
        deploymentDesiredState: state.deploymentDesiredState,
        deploymentStatus: state.deploymentStatus,
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
      await refreshDeploymentRuntimeAfterWorkspaceOperation(response.operation, setState);
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
      setInstanceShellState: setState,
      setWorkspaceGatewayState,
    });
  }

  async function submitDeleteDomainProviderResource(input: DomainProviderDeleteActionInput) {
    if (state.status !== "ready" || state.domainProviderDeletingKey) {
      return;
    }

    const key = domainProviderDeleteKey(input);

    if (!window.confirm(`Delete recorded provider resources for ${input.host}?`)) {
      return;
    }

    setState({
      ...state,
      domainProviderDeleteError: undefined,
      domainProviderDeleteMessage: undefined,
      domainProviderDeletingKey: key,
    });

    try {
      const response = await deleteInstanceDomainProviderResource({
        host: input.host,
        ...(input.kind === undefined ? {} : { kind: input.kind }),
        ...(input.logicalId === undefined ? {} : { logicalId: input.logicalId }),
      });

      setState({
        ...state,
        domainProviderDeleteError: undefined,
        domainProviderDeleteJob:
          response.status === "ready" ? response.job : state.domainProviderDeleteJob,
        domainProviderDeleteMessage:
          response.status === "ready"
            ? `Provider delete job ready for ${input.host}.`
            : "Provider delete request did not create a job.",
        domainProviderDeletingKey: undefined,
      });
    } catch (error) {
      const message =
        error instanceof DomainProviderApiError || error instanceof Error
          ? error.message
          : "Provider delete failed.";

      setState({
        ...state,
        domainProviderDeleteError: message,
        domainProviderDeleteMessage: undefined,
        domainProviderDeletingKey: undefined,
      });
    }
  }

  async function submitMarkDomainProviderResourceManuallyRemoved(
    input: DomainProviderCleanupActionInput,
  ) {
    if (state.status !== "ready" || state.domainProviderCleanupKey) {
      return;
    }

    const key = domainProviderDeleteKey(input);

    if (
      !window.confirm(
        `Mark provider resource for ${input.host} as manually removed? This clears Formless provider evidence only.`,
      )
    ) {
      return;
    }

    setState({
      ...state,
      domainProviderCleanupError: undefined,
      domainProviderCleanupKey: key,
      domainProviderCleanupMessage: undefined,
    });

    try {
      const response = await markInstanceDomainProviderResourceManuallyRemoved(input);

      setState({
        ...state,
        domainAppliedStates: removeCleanedDomainAppliedState(
          state.domainAppliedStates,
          response.target,
        ),
        domainProviderAppliedResources: removeCleanedProviderAppliedResource(
          state.domainProviderAppliedResources ?? [],
          response.target,
        ),
        domainProviderCleanupError: undefined,
        domainProviderCleanupKey: undefined,
        domainProviderCleanupMessage: `Marked provider evidence for ${input.host} manually removed.`,
      });
    } catch (error) {
      const message =
        error instanceof DomainProviderApiError || error instanceof Error
          ? error.message
          : "Manual provider cleanup failed.";

      setState({
        ...state,
        domainProviderCleanupError: message,
        domainProviderCleanupKey: undefined,
        domainProviderCleanupMessage: undefined,
      });
    }
  }

  async function refreshDomainProviderPlan() {
    if (state.status !== "ready" || state.domainProviderPlanLoading) {
      return;
    }

    setState({
      ...state,
      domainProviderPlanError: undefined,
      domainProviderPlanLoading: true,
    });

    try {
      const response = await fetchInstanceDomainProviderPlan();

      setState({
        ...state,
        domainProviderPlan: response,
        domainProviderPlanError: undefined,
        domainProviderPlanLoading: false,
      });
    } catch (error) {
      const message =
        error instanceof DomainProviderApiError || error instanceof Error
          ? error.message
          : "Provider plan failed.";

      setState({
        ...state,
        domainProviderPlanError: message,
        domainProviderPlanLoading: false,
      });
    }
  }

  async function refreshDomainProviderDeleteJob() {
    if (state.status !== "ready" || !state.domainProviderDeleteJob) {
      return;
    }

    try {
      const response = await fetchInstanceDomainProviderDeleteJob({
        jobId: state.domainProviderDeleteJob.jobId,
      });

      setState({
        ...state,
        domainProviderDeleteError: undefined,
        domainProviderDeleteJob: response.job,
      });
    } catch (error) {
      const message =
        error instanceof DomainProviderApiError || error instanceof Error
          ? error.message
          : "Provider delete job refresh failed.";

      setState({
        ...state,
        domainProviderDeleteError: message,
      });
    }
  }

  return (
    <InstanceShellRouteView
      currentPath={location}
      installDrafts={installDrafts}
      onDeleteDomainProviderResource={submitDeleteDomainProviderResource}
      onMarkDomainProviderResourceManuallyRemoved={submitMarkDomainProviderResourceManuallyRemoved}
      onRefreshDomainProviderDeleteJob={refreshDomainProviderDeleteJob}
      onRefreshDomainProviderPlan={refreshDomainProviderPlan}
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
  setInstanceShellState,
  setWorkspaceGatewayState,
}: {
  config?: WorkspaceGatewayConfig;
  operationId: string;
  operationKind?: WorkspaceGatewayOperationKind;
  setInstanceShellState?: Dispatch<SetStateAction<InstanceShellRouteState>>;
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
    await refreshDeploymentRuntimeAfterWorkspaceOperation(
      response.operation,
      setInstanceShellState,
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

async function refreshDeploymentRuntimeAfterWorkspaceOperation(
  operation: WorkspaceGatewayOperation,
  setState?: Dispatch<SetStateAction<InstanceShellRouteState>>,
): Promise<void> {
  if (!setState || !workspaceOperationRefreshesDeploymentRuntime(operation)) {
    return;
  }

  let deploymentDesiredState: InstanceDeploymentDesiredStateResponse | undefined;
  let deploymentStatus: InstanceDeploymentStatusResponse | undefined;

  try {
    [deploymentDesiredState, deploymentStatus] = await Promise.all([
      fetchOptionalInstanceDeploymentDesiredState(),
      fetchOptionalInstanceDeploymentStatus(),
    ]);
  } catch {
    return;
  }

  setState((current) => {
    if (current.status !== "ready") {
      return current;
    }

    const {
      deploymentDesiredState: _previousDeploymentDesiredState,
      deploymentStatus: _previousDeploymentStatus,
      ...rest
    } = current;

    return {
      ...rest,
      ...(deploymentDesiredState === undefined ? {} : { deploymentDesiredState }),
      ...(deploymentStatus === undefined ? {} : { deploymentStatus }),
    };
  });
}

export function workspaceOperationRefreshesDeploymentRuntime(
  operation: WorkspaceGatewayOperation,
): boolean {
  return (
    operation.status === "succeeded" &&
    (operation.operation === "deployApply" || operation.operation === "deploymentRefresh")
  );
}

export function instanceShellUninitializedWorkspaceInstallState(appResponse: AppInstallsResponse): {
  state: Extract<InstanceShellRouteState, { status: "ready" }>;
} {
  return {
    state: {
      domainAppliedStates: [],
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

async function fetchOptionalInstanceDeploymentDesiredState(
  signal?: AbortSignal,
): Promise<InstanceDeploymentDesiredStateResponse | undefined> {
  try {
    return await fetchInstanceDeploymentDesiredState(signal ? { signal } : {});
  } catch (error) {
    if (error instanceof DeploymentRuntimeApiError && error.status === 404) {
      return undefined;
    }

    throw error;
  }
}

async function fetchOptionalInstanceDeploymentStatus(
  signal?: AbortSignal,
): Promise<InstanceDeploymentStatusResponse | undefined> {
  try {
    return await fetchInstanceDeploymentStatus(signal ? { signal } : {});
  } catch (error) {
    if (error instanceof DeploymentRuntimeApiError && error.status === 404) {
      return undefined;
    }

    throw error;
  }
}

export function InstanceShellRouteView({
  currentPath = runtimeTopologyRoutes.instanceRootRoute,
  installDrafts = {},
  onDeleteDomainProviderResource,
  onMarkDomainProviderResourceManuallyRemoved,
  onPollWorkspaceOperation,
  onRefreshDomainProviderDeleteJob,
  onRefreshDomainProviderPlan,
  onInstallDraftChange,
  onSubmitInstall,
  onStartWorkspaceOperation,
  state,
  workspaceGatewayState = { status: "unavailable" },
}: {
  currentPath?: string;
  installDrafts?: PackageInstallDrafts;
  onDeleteDomainProviderResource?: (input: DomainProviderDeleteActionInput) => void;
  onMarkDomainProviderResourceManuallyRemoved?: (input: DomainProviderCleanupActionInput) => void;
  onPollWorkspaceOperation?: (
    operationId: string,
    operationKind?: WorkspaceGatewayOperationKind,
  ) => void;
  onRefreshDomainProviderDeleteJob?: () => void;
  onRefreshDomainProviderPlan?: () => void;
  onInstallDraftChange?: (packageAppKey: PackageAppKey, draft: PackageInstallDraft) => void;
  onSubmitInstall?: (packageAppKey: PackageAppKey, event: React.FormEvent<HTMLFormElement>) => void;
  onStartWorkspaceOperation?: (input: WorkspaceGatewayStartInput) => void;
  state: InstanceShellRouteState;
  workspaceGatewayState?: WorkspaceGatewayRouteState;
}) {
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const pathname = currentPath.split("?")[0] ?? currentPath;
  const isDeploymentsRoute = pathname === runtimeTopologyRoutes.deploymentsRoute;

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

  if (isDeploymentsRoute) {
    return (
      <section className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
        <ShellHeader currentPath={currentPath} />
        <GeneratedDeploymentManagementSection
          deploymentDesiredState={state.deploymentDesiredState}
          deploymentStatus={state.deploymentStatus}
          onPollWorkspaceOperation={onPollWorkspaceOperation}
          onStartWorkspaceOperation={onStartWorkspaceOperation}
          workspaceGatewayState={workspaceGatewayState}
        />
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <ShellHeader currentPath={currentPath} />
      <WorkspaceGatewayManagementSection
        installCount={state.installs.length}
        onInstallFirstApp={() => setInstallDialogOpen(true)}
        onPollOperation={onPollWorkspaceOperation}
        onStartOperation={onStartWorkspaceOperation}
        state={workspaceGatewayState}
      />
      <GeneratedInstanceAppsSection
        installDisabled={state.installing || state.packages.length === 0}
        onInstall={() => setInstallDialogOpen(true)}
      />
      <GeneratedInstanceRoutesSection />
      <RouteProviderOperationsSection
        onDeleteProvider={onDeleteDomainProviderResource}
        onManualCleanup={onMarkDomainProviderResourceManuallyRemoved}
        onRefreshDeleteJob={onRefreshDomainProviderDeleteJob}
        onRefreshPlan={onRefreshDomainProviderPlan}
        state={state}
      />
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
  installCount,
  onInstallFirstApp,
  onPollOperation,
  onStartOperation,
  state,
}: {
  installCount: number;
  onInstallFirstApp: () => void;
  onPollOperation?: (operationId: string, operationKind?: WorkspaceGatewayOperationKind) => void;
  onStartOperation?: (input: WorkspaceGatewayStartInput) => void;
  state: WorkspaceGatewayRouteState;
}) {
  if (state.status === "unavailable") {
    return null;
  }

  const operation = state.status === "ready" ? state.currentOperation : undefined;
  const progressOperation =
    state.status === "ready" ? workspaceManagementOperation(state) : undefined;
  const progressError =
    state.status === "ready"
      ? deploymentWorkspaceOperation(state)
        ? undefined
        : state.error
      : undefined;
  const initialized =
    state.status === "ready"
      ? workspaceInitialized(state.statusOperation ?? state.currentOperation ?? operation)
      : undefined;

  return (
    <section
      aria-labelledby="workspace-gateway-heading"
      className="space-y-3"
      data-formless-workspace-gateway="local"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
        <div className="min-w-0 space-y-1">
          <h2 id="workspace-gateway-heading" className="text-sm font-semibold">
            Workspace
          </h2>
          <p className="text-xs text-muted-fg">
            {state.status === "loading"
              ? "Loading local workspace status"
              : initialized === false
                ? "Not initialized"
                : initialized === true
                  ? "Initialized"
                  : "Local gateway connected"}
          </p>
        </div>
      </div>
      <WorkspaceGatewayOperationControls
        onStartOperation={onStartOperation}
        operationGroup="workspace"
        state={state}
      />
      <WorkspaceAutoSaveStatusPanel
        autoSave={state.status === "ready" ? state.autoSave : undefined}
        canStartSave={workspaceGatewayCanStartPostBootstrapOperation(state, onStartOperation)}
        error={state.status === "ready" ? state.autoSaveError : undefined}
        onStartSave={() =>
          onStartOperation?.(
            workspaceGatewayStartInputFromDefinition(workspaceOperationDefinitionForKind("save")),
          )
        }
      />
      <WorkspaceOnboardingFlowSection
        installCount={installCount}
        onInstallFirstApp={onInstallFirstApp}
      />
      {state.status === "ready" ? (
        <WorkspaceOperationProgress
          error={progressError}
          onPollOperation={onPollOperation}
          operation={progressOperation ?? state.statusOperation}
        />
      ) : null}
    </section>
  );
}

function workspaceGatewayCanStartPostBootstrapOperation(
  state: WorkspaceGatewayRouteState,
  onStartOperation?: (input: WorkspaceGatewayStartInput) => void,
): boolean {
  if (state.status !== "ready" || !state.csrfToken || onStartOperation === undefined) {
    return false;
  }

  return !(
    state.currentOperation !== undefined && operationPollsAutomatically(state.currentOperation)
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
  const canRunPostBootstrapOperation = canStart && Boolean(state.csrfToken);
  const controls = selectWorkspaceGatewayOperationControls({ operationGroup });

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-formless-workspace-operation-controls="true"
    >
      {controls.map((control) => (
        <Button
          data-formless-workspace-operation-control={control.kind}
          data-formless-workspace-operation-input-fields={control.inputFields.join(" ")}
          data-formless-workspace-operation-required-capability={control.requiredCapability}
          intent={control.style === "secondary" ? "outline" : undefined}
          isDisabled={!canRunPostBootstrapOperation}
          key={control.kind}
          onPress={() => onStartOperation?.(control.input)}
          size="sm"
          type="button"
        >
          {control.label}
        </Button>
      ))}
    </div>
  );
}

function WorkspaceAutoSaveStatusPanel({
  autoSave,
  canStartSave,
  error,
  onStartSave,
}: {
  autoSave?: WorkspaceGatewayAutoSaveState;
  canStartSave: boolean;
  error?: string;
  onStartSave: () => void;
}) {
  if (!autoSave && !error) {
    return null;
  }

  const summary = autoSave ? workspaceAutoSaveDisplaySummary(autoSave) : undefined;
  const showManualSave = autoSave?.displayState === "dirty" || autoSave?.displayState === "queued";
  const showRetrySave = autoSave?.displayState === "failed";

  return (
    <div
      className="grid gap-3 rounded-md border border-border bg-overlay p-4"
      data-formless-workspace-auto-save-status="true"
      data-formless-workspace-auto-save-state={autoSave?.displayState ?? "unavailable"}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold">Auto-save</h3>
          <p className="text-xs text-muted-fg">{summary?.detail ?? "Status unavailable"}</p>
        </div>
        {summary ? (
          <span className={`rounded border px-2 py-1 text-xs ${summary.className}`}>
            {summary.label}
          </span>
        ) : null}
      </div>
      {autoSave && autoSave.writeSources.length > 0 ? (
        <p className="text-xs text-muted-fg">
          Sources: {autoSave.writeSources.map(workspaceAutoSaveWriteSourceLabel).join(", ")}
        </p>
      ) : null}
      {autoSave?.lastSavedAt ? (
        <p className="text-xs text-muted-fg">Last saved {displaySafeText(autoSave.lastSavedAt)}</p>
      ) : null}
      {autoSave?.error ? (
        <p className={fieldErrorStyles()} data-slot="field-error" role="alert">
          {displaySafeText(autoSave.error.message)}
        </p>
      ) : null}
      {error ? (
        <p className={fieldErrorStyles()} data-slot="field-error" role="alert">
          {displaySafeText(error)}
        </p>
      ) : null}
      {showManualSave || showRetrySave ? (
        <div className="flex flex-wrap gap-2">
          {showRetrySave ? (
            <Button
              data-formless-workspace-auto-save-control="retry"
              isDisabled={!canStartSave}
              onPress={onStartSave}
              size="sm"
              type="button"
            >
              Retry save
            </Button>
          ) : null}
          {showManualSave ? (
            <Button
              data-formless-workspace-auto-save-control="manual-save"
              intent="outline"
              isDisabled={!canStartSave}
              onPress={onStartSave}
              size="sm"
              type="button"
            >
              Save now
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function workspaceAutoSaveDisplaySummary(autoSave: WorkspaceGatewayAutoSaveState): {
  className: string;
  detail: string;
  label: string;
} {
  switch (autoSave.displayState) {
    case "clean":
      return {
        className: "border-border text-muted-fg",
        detail: "Workspace source has no pending local writes.",
        label: "Clean",
      };
    case "dirty":
      return {
        className: "border-amber-300 text-amber-700",
        detail: "Local writes are waiting for workspace save.",
        label: "Dirty",
      };
    case "queued":
      return {
        className: "border-amber-300 text-amber-700",
        detail: "Workspace save is queued.",
        label: "Queued",
      };
    case "saving":
      return {
        className: "border-blue-300 text-blue-700",
        detail: "Workspace save is running.",
        label: "Saving",
      };
    case "saved":
      return {
        className: "border-green-300 text-green-700",
        detail: "Workspace source is saved.",
        label: "Saved",
      };
    case "failed":
      return {
        className: "border-red-300 text-red-700",
        detail:
          autoSave.retryCount > 0
            ? `Workspace save failed after ${autoSave.retryCount} attempt${autoSave.retryCount === 1 ? "" : "s"}.`
            : "Workspace save failed.",
        label: "Failed",
      };
  }
}

function workspaceAutoSaveWriteSourceLabel(
  source: WorkspaceGatewayAutoSaveState["writeSources"][number],
): string {
  return fieldKeyLabel(source);
}

function WorkspaceOnboardingFlowSection({
  installCount,
  onInstallFirstApp,
}: {
  installCount: number;
  onInstallFirstApp: () => void;
}) {
  if (installCount > 0) {
    return null;
  }

  return (
    <div
      className="grid gap-3 rounded-md border border-border bg-overlay p-4 md:grid-cols-2"
      data-formless-workspace-onboarding="local"
    >
      <div className="min-w-0 space-y-2">
        <h3 className="text-sm font-semibold">Local onboarding</h3>
        <p className="text-xs text-muted-fg">No package apps are installed.</p>
        <div className="flex flex-wrap gap-2">
          <Button onPress={onInstallFirstApp} size="sm" type="button">
            <AddIcon />
            Install first app
          </Button>
        </div>
      </div>
      <div
        className="flex min-w-0 flex-wrap content-start gap-2 text-xs text-muted-fg"
        data-formless-onboarding-generated-record-controls="routes"
      >
        <span className="rounded border border-border px-2 py-1">Routes</span>
      </div>
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
            <DisplaySafeObject fields={operation.result.deployment} heading="Deployment" />
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

function GeneratedDeploymentManagementSection({
  deploymentDesiredState,
  deploymentStatus,
  onPollWorkspaceOperation,
  onStartWorkspaceOperation,
  workspaceGatewayState,
}: {
  deploymentDesiredState?: InstanceDeploymentDesiredStateResponse;
  deploymentStatus?: InstanceDeploymentStatusResponse;
  onPollWorkspaceOperation?: (
    operationId: string,
    operationKind?: WorkspaceGatewayOperationKind,
  ) => void;
  onStartWorkspaceOperation?: (input: WorkspaceGatewayStartInput) => void;
  workspaceGatewayState: WorkspaceGatewayRouteState;
}) {
  const controlPlaneTarget = useMemo(() => instanceControlPlaneClientTarget(), []);
  const deploymentConfigs = useDeploymentConfigRecords();
  const deploymentSummary =
    deploymentStatus === undefined
      ? undefined
      : deploymentStatusDisplaySummary(deploymentStatus.status);

  return (
    <section className="space-y-3" aria-labelledby="deployment-management-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
        <div className="min-w-0 space-y-1">
          <h2 id="deployment-management-heading" className="text-sm font-semibold">
            Deployments
          </h2>
          {deploymentSummary === undefined ? (
            <p className="text-xs text-muted-fg">Deployment setup and progress</p>
          ) : (
            <p className="text-xs text-muted-fg">
              {deploymentSummary.label} · {deploymentSummary.detail}
            </p>
          )}
        </div>
      </div>
      <DeploymentSetupProgressSurface
        deploymentConfigs={deploymentConfigs}
        deploymentDesiredState={deploymentDesiredState}
        deploymentStatus={deploymentStatus}
        workspaceGatewayState={workspaceGatewayState}
      />
      <DeploymentGatewayOperationSection
        onPollOperation={onPollWorkspaceOperation}
        onStartOperation={onStartWorkspaceOperation}
        state={workspaceGatewayState}
      />
      <details
        className="rounded-md border border-border bg-overlay p-4"
        data-formless-deployment-config-management="secondary"
      >
        <summary className="cursor-pointer text-sm font-semibold">
          Deployment config records
        </summary>
        <div className="mt-4" data-formless-control-plane-screen="deployments">
          <HomeRoute
            schemaKey={INSTANCE_CONTROL_PLANE_SCHEMA_KEY}
            screenPath="/deployments"
            target={controlPlaneTarget}
          />
        </div>
      </details>
    </section>
  );
}

type DeploymentConfigStoredRecord = StoredRecord & {
  entity: "deployment-config";
  values: InstanceControlPlaneDeploymentConfigValues;
};

function useDeploymentConfigRecords(): DeploymentConfigStoredRecord[] {
  const recordsById = useRecordsById();

  return useMemo(
    () =>
      Object.values(recordsById)
        .filter(isDeploymentConfigStoredRecord)
        .toSorted(compareDeploymentConfigRecords),
    [recordsById],
  );
}

function isDeploymentConfigStoredRecord(
  record: StoredRecord,
): record is DeploymentConfigStoredRecord {
  return record.entity === "deployment-config" && record.deletedAt === undefined;
}

function compareDeploymentConfigRecords(
  left: DeploymentConfigStoredRecord,
  right: DeploymentConfigStoredRecord,
): number {
  const enabledCompare = Number(right.values.enabled) - Number(left.values.enabled);

  if (enabledCompare !== 0) {
    return enabledCompare;
  }

  return left.values.label.localeCompare(right.values.label) || left.id.localeCompare(right.id);
}

function DeploymentSetupProgressSurface({
  deploymentConfigs,
  deploymentDesiredState,
  deploymentStatus,
  workspaceGatewayState,
}: {
  deploymentConfigs: DeploymentConfigStoredRecord[];
  deploymentDesiredState?: InstanceDeploymentDesiredStateResponse;
  deploymentStatus?: InstanceDeploymentStatusResponse;
  workspaceGatewayState: WorkspaceGatewayRouteState;
}) {
  const primaryConfig =
    deploymentConfigs.find((config) => config.values.enabled) ?? deploymentConfigs[0];
  const enabledCount = deploymentConfigs.filter((config) => config.values.enabled).length;
  const operation = deploymentWorkspaceOperation(workspaceGatewayState);
  const deploymentSummary =
    deploymentStatus === undefined
      ? undefined
      : deploymentStatusDisplaySummary(deploymentStatus.status);

  return (
    <div
      className="grid gap-3 rounded-md border border-border bg-overlay p-4 lg:grid-cols-3"
      data-formless-deployment-setup-progress="true"
    >
      <div className="min-w-0 space-y-3" data-formless-deployment-config-summary="true">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Deployment setup</h3>
          <p className="text-xs text-muted-fg">
            {deploymentConfigs.length === 0
              ? "No deployment configs"
              : `Enabled ${enabledCount}/${deploymentConfigs.length}`}
          </p>
        </div>
        {primaryConfig ? <DeploymentConfigFacts config={primaryConfig} /> : null}
      </div>
      <div className="min-w-0 space-y-3" data-formless-deployment-operation-status="true">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Deployment progress</h3>
          <p className="text-xs text-muted-fg">
            {deploymentSummary === undefined
              ? "Runtime status unavailable"
              : `${deploymentSummary.label} · ${deploymentSummary.detail}`}
          </p>
        </div>
        <dl className="grid gap-2 text-xs text-muted-fg">
          {deploymentStatus ? (
            <div className="min-w-0">
              <dt className="font-medium text-fg">Target</dt>
              <dd className="break-words">
                {deploymentStatus.target.label} · <code>{deploymentStatus.target.targetId}</code>
              </dd>
            </div>
          ) : null}
          <div className="min-w-0">
            <dt className="font-medium text-fg">Gateway</dt>
            <dd className="break-words">
              {workspaceGatewayOperationSummary(workspaceGatewayState, operation)}
            </dd>
          </div>
        </dl>
      </div>
      <div className="min-w-0 space-y-3" data-formless-deployment-desired-state="true">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Desired state</h3>
          <p className="text-xs text-muted-fg">
            {deploymentDesiredState
              ? (deploymentDesiredState.desiredState.display.title ??
                `${deploymentDesiredState.desiredState.display.resourceCount} resources`)
              : "Desired-state projection unavailable"}
          </p>
        </div>
        <DeploymentDesiredStateFacts desiredState={deploymentDesiredState} />
      </div>
    </div>
  );
}

function DeploymentConfigFacts({ config }: { config: DeploymentConfigStoredRecord }) {
  const observationEntries = deploymentObservationEntries(config.values);

  return (
    <dl className="grid gap-2 text-xs text-muted-fg">
      <div className="min-w-0">
        <dt className="font-medium text-fg">Config</dt>
        <dd className="break-words">
          {config.values.label} · <code>{config.values.targetId}</code>
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="font-medium text-fg">Target URL</dt>
        <dd className="break-words">{config.values.targetUrl || "Not set"}</dd>
      </div>
      <div className="min-w-0">
        <dt className="font-medium text-fg">Provider</dt>
        <dd className="break-words">
          {providerFamilyLabel(config.values.providerFamily)}
          {config.values.accountId ? ` · Account ${displaySafeText(config.values.accountId)}` : ""}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="font-medium text-fg">Worker</dt>
        <dd className="break-words">
          {config.values.workerName ? displaySafeText(config.values.workerName) : "Not set"}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="font-medium text-fg">Credential ref</dt>
        <dd className="break-words">
          {config.values.credentialRef ? displaySafeText(config.values.credentialRef) : "Not set"}
        </dd>
      </div>
      <div className="min-w-0" data-formless-deployment-observation-cache="true">
        <dt className="font-medium text-fg">Latest observation</dt>
        <dd className="break-words">
          {observationEntries.length === 0
            ? "No observation cache"
            : observationEntries.map((entry) => `${entry.label} ${entry.value}`).join(" · ")}
        </dd>
      </div>
    </dl>
  );
}

function DeploymentDesiredStateFacts({
  desiredState,
}: {
  desiredState?: InstanceDeploymentDesiredStateResponse;
}) {
  if (!desiredState) {
    return (
      <p className="text-xs text-muted-fg" data-formless-deployment-desired-state-empty="true">
        No desired-state projection loaded.
      </p>
    );
  }

  const version = desiredState.desiredState;
  const resourceKinds = Object.entries(version.display.resourcesByKind)
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => left.localeCompare(right));

  return (
    <dl className="grid gap-2 text-xs text-muted-fg">
      <div className="min-w-0">
        <dt className="font-medium text-fg">Target</dt>
        <dd className="break-words">
          {desiredState.target.label ?? "Deployment target"} ·{" "}
          <code>{desiredState.target.targetId}</code>
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="font-medium text-fg">Version</dt>
        <dd className="break-words">
          Revision {version.revision} · <code>{version.versionId}</code>
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="font-medium text-fg">Desired-state hash</dt>
        <dd className="break-words">
          <code>{version.hash}</code>
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="font-medium text-fg">Resources</dt>
        <dd className="break-words">
          {resourceKinds.length === 0
            ? `${version.display.resourceCount} resources`
            : resourceKinds.map(([kind, count]) => `${fieldKeyLabel(kind)} ${count}`).join(" · ")}
        </dd>
      </div>
    </dl>
  );
}

function DeploymentGatewayOperationSection({
  onPollOperation,
  onStartOperation,
  state,
}: {
  onPollOperation?: (operationId: string, operationKind?: WorkspaceGatewayOperationKind) => void;
  onStartOperation?: (input: WorkspaceGatewayStartInput) => void;
  state: WorkspaceGatewayRouteState;
}) {
  const operation = deploymentWorkspaceOperation(state);

  return (
    <div
      className="grid gap-3 rounded-md border border-border bg-overlay p-4"
      data-formless-deployment-gateway="local"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold">Local gateway</h3>
          <p className="text-xs text-muted-fg">
            {workspaceGatewayOperationSummary(state, operation)}
          </p>
        </div>
      </div>
      {state.status === "unavailable" ? (
        <p className="text-xs text-muted-fg">Workspace gateway operations are unavailable.</p>
      ) : (
        <div data-formless-deployment-operation-controls="true">
          <WorkspaceGatewayOperationControls
            onStartOperation={onStartOperation}
            operationGroup="deployment"
            state={state}
          />
        </div>
      )}
      {state.status === "ready" ? (
        <WorkspaceOperationProgress
          error={state.error}
          onPollOperation={onPollOperation}
          operation={operation}
        />
      ) : null}
    </div>
  );
}

function deploymentObservationEntries(
  values: InstanceControlPlaneDeploymentConfigValues,
): Array<{ label: string; value: string }> {
  return [
    observationEntry("Status", values.observedStatus),
    observationEntry("Observed at", values.observedAt),
    observationEntry("Desired-state hash", values.observedDesiredStateHash),
    observationEntry("Summary", values.observedSummary),
    observationEntry("Error", values.observedError),
    observationEntry("Runner", values.observedRunnerId),
  ].filter((entry): entry is { label: string; value: string } => entry !== undefined);
}

function observationEntry(
  label: string,
  value: string | undefined,
): { label: string; value: string } | undefined {
  return value === undefined || value === "" ? undefined : { label, value: displaySafeText(value) };
}

function workspaceManagementOperation(
  state: WorkspaceGatewayRouteState,
): WorkspaceGatewayOperation | undefined {
  if (state.status !== "ready") {
    return undefined;
  }

  const operation = state.currentOperation;

  if (!operation || isDeploymentWorkspaceOperationKind(operation.operation)) {
    return undefined;
  }

  return operation;
}

function deploymentWorkspaceOperation(
  state: WorkspaceGatewayRouteState,
): WorkspaceGatewayOperation | undefined {
  if (state.status !== "ready") {
    return undefined;
  }

  const operation = state.currentOperation;

  if (!operation || !isDeploymentWorkspaceOperationKind(operation.operation)) {
    return undefined;
  }

  return operation;
}

function isDeploymentWorkspaceOperationKind(kind: WorkspaceGatewayOperationKind): boolean {
  return (
    kind === "credentialSetup" ||
    kind === "deploymentRefresh" ||
    kind === "deployPlan" ||
    kind === "deployApply"
  );
}

function workspaceGatewayOperationSummary(
  state: WorkspaceGatewayRouteState,
  operation?: WorkspaceGatewayOperation,
): string {
  if (state.status === "loading") {
    return "Loading";
  }

  if (state.status === "unavailable") {
    return "Unavailable";
  }

  if (operation) {
    return `${workspaceOperationKindLabel(operation.operation)} · ${workspaceOperationStatusLabel(
      operation.status,
    )}`;
  }

  return state.csrfToken ? "Ready" : "Connected";
}

function providerFamilyLabel(
  providerFamily: InstanceControlPlaneDeploymentConfigValues["providerFamily"],
): string {
  return providerFamily === "cloudflare" ? "Cloudflare" : fieldKeyLabel(providerFamily);
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
          sectionActions={{
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

function RouteProviderOperationsSection({
  onDeleteProvider,
  onManualCleanup,
  onRefreshDeleteJob,
  onRefreshPlan,
  state,
}: {
  onDeleteProvider?: (input: DomainProviderDeleteActionInput) => void;
  onManualCleanup?: (input: DomainProviderCleanupActionInput) => void;
  onRefreshDeleteJob?: () => void;
  onRefreshPlan?: () => void;
  state: Extract<InstanceShellRouteState, { status: "ready" }>;
}) {
  const providerAppliedResources = state.domainProviderAppliedResources ?? [];
  const providerPlanLoading = state.domainProviderPlanLoading ?? false;
  const evidenceCount = state.domainAppliedStates.length + providerAppliedResources.length;

  return (
    <section className="space-y-3" aria-labelledby="route-provider-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <h2 id="route-provider-heading" className="text-sm font-semibold">
            Route provider state
          </h2>
          <span className="text-xs text-muted-fg">{evidenceCount}</span>
        </div>
      </div>
      <DomainProviderControlPanel
        deleteJob={state.domainProviderDeleteJob}
        onRefreshDeleteJob={onRefreshDeleteJob}
        onRefreshPlan={onRefreshPlan}
        plan={state.domainProviderPlan}
        planLoading={providerPlanLoading}
        refreshError={state.domainProviderPlanError}
      />
      <div className="grid gap-3 rounded-md border border-border bg-overlay p-4">
        {state.domainProviderDeleteError ? (
          <p className={fieldErrorStyles()} data-slot="field-error" role="alert">
            {state.domainProviderDeleteError}
          </p>
        ) : null}
        {state.domainProviderDeleteMessage ? (
          <p className="text-xs text-muted-fg" role="status">
            {state.domainProviderDeleteMessage}
          </p>
        ) : null}
        {state.domainProviderCleanupError ? (
          <p className={fieldErrorStyles()} data-slot="field-error" role="alert">
            {state.domainProviderCleanupError}
          </p>
        ) : null}
        {state.domainProviderCleanupMessage ? (
          <p className="text-xs text-muted-fg" role="status">
            {state.domainProviderCleanupMessage}
          </p>
        ) : null}
        {evidenceCount === 0 ? (
          <p className="text-sm text-muted-fg">No provider evidence.</p>
        ) : null}
        <div className="grid gap-3">
          {state.domainAppliedStates.map((appliedState) => (
            <AppliedDomainStateRow
              appliedState={appliedState}
              install={state.installs.find(
                (install) => install.installId === appliedState.targetInstallId,
              )}
              key={`applied:${appliedState.profile}:${appliedState.host}`}
              onDeleteProvider={onDeleteProvider}
              onManualCleanup={onManualCleanup}
              providerCleanupKey={state.domainProviderCleanupKey}
              providerDeletingKey={state.domainProviderDeletingKey}
            />
          ))}
          {providerAppliedResources.map((resource) => (
            <AppliedProviderResourceRow
              key={`resource:${resource.kind}:${resource.logicalId}`}
              onDeleteProvider={onDeleteProvider}
              onManualCleanup={onManualCleanup}
              providerCleanupKey={state.domainProviderCleanupKey}
              providerDeletingKey={state.domainProviderDeletingKey}
              resource={resource}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function DomainProviderControlPanel({
  deleteJob,
  onRefreshDeleteJob,
  onRefreshPlan,
  plan,
  planLoading,
  refreshError,
}: {
  deleteJob?: InstanceDomainProviderDeleteJob;
  onRefreshDeleteJob?: () => void;
  onRefreshPlan?: () => void;
  plan?: InstanceDomainProviderPlanResponse;
  planLoading: boolean;
  refreshError?: string;
}) {
  return (
    <div className="grid gap-3 rounded-md border border-border bg-overlay p-4 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Provider</h3>
          <span className="text-xs text-muted-fg">
            {plan ? domainProviderConfigLabel(plan) : "not loaded"}
          </span>
        </div>
        {plan ? (
          <div className="grid gap-2 text-xs text-muted-fg sm:grid-cols-2">
            <p>{domainProviderTargetLabel(plan)}</p>
            <p>{domainProviderResourceSummary(plan)}</p>
            <p>{domainProviderBlockerSummary(plan)}</p>
            <p>{domainProviderIssueSummary(plan)}</p>
            <p>{domainProviderRunnerSummary(plan)}</p>
          </div>
        ) : (
          <p className="text-xs text-muted-fg">Provider plan unavailable.</p>
        )}
        {deleteJob ? (
          <DomainProviderJobStatus
            jobId={deleteJob.jobId}
            kind="Delete"
            onRefresh={onRefreshDeleteJob}
            result={deleteJob.result}
            status={deleteJob.status}
          />
        ) : null}
        {refreshError ? (
          <p className={fieldErrorStyles()} data-slot="field-error" role="alert">
            {refreshError}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-start justify-end gap-2">
        <Button
          intent="outline"
          isDisabled={planLoading || !onRefreshPlan}
          onPress={onRefreshPlan}
          size="sm"
          type="button"
        >
          {planLoading ? "Planning..." : "Refresh plan"}
        </Button>
      </div>
    </div>
  );
}

function DomainProviderJobStatus({
  jobId,
  kind,
  onRefresh,
  result,
  status,
}: {
  jobId: string;
  kind: "Apply" | "Delete";
  onRefresh?: () => void;
  result?: { error?: string; evidenceCount: number };
  status: InstanceDomainProviderDeleteJob["status"];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-fg">
      <span>
        {kind} job: {status} · <code>{jobId}</code>
        {result ? ` · evidence ${result.evidenceCount}` : ""}
      </span>
      {result?.error ? <span className="text-danger-subtle-fg">{result.error}</span> : null}
      <Button intent="outline" isDisabled={!onRefresh} onPress={onRefresh} size="sm" type="button">
        Refresh job
      </Button>
    </div>
  );
}

function AppliedDomainStateRow({
  appliedState,
  install,
  onDeleteProvider,
  onManualCleanup,
  providerCleanupKey,
  providerDeletingKey,
}: {
  appliedState: InstanceDomainMappingAppliedState;
  install: AppInstall | undefined;
  onDeleteProvider?: (input: DomainProviderDeleteActionInput) => void;
  onManualCleanup?: (input: DomainProviderCleanupActionInput) => void;
  providerCleanupKey?: string;
  providerDeletingKey?: string;
}) {
  const providerDelete = providerDeleteInputForAppliedState(appliedState);
  const providerCleanup = providerCleanupInputForAppliedState(appliedState);
  const providerDeleting = providerDeletingKey === domainProviderDeleteKey(providerDelete);
  const providerCleaning =
    providerCleanup !== undefined &&
    providerCleanupKey === domainProviderDeleteKey(providerCleanup);

  return (
    <article className="rounded-md border border-dashed border-border bg-overlay p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="truncate text-sm font-semibold">{appliedState.host}</h3>
          <p className="text-xs text-muted-fg">
            <code>{appliedRouteTargetLabel(appliedState)}</code>
            {install ? ` · ${install.label}` : ""} · Applied: {appliedState.workerName}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button
            intent="outline"
            isDisabled={providerDeleting}
            onPress={() => onDeleteProvider?.(providerDelete)}
            size="sm"
            type="button"
          >
            <RemoveIcon />
            {providerDeleting ? "Deleting..." : "Delete provider"}
          </Button>
          {providerCleanup ? (
            <Button
              intent="outline"
              isDisabled={providerCleaning}
              onPress={() => onManualCleanup?.(providerCleanup)}
              size="sm"
              type="button"
            >
              <RemoveIcon />
              {providerCleaning ? "Marking..." : "Mark manually removed"}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function AppliedProviderResourceRow({
  onDeleteProvider,
  onManualCleanup,
  providerCleanupKey,
  providerDeletingKey,
  resource,
}: {
  onDeleteProvider?: (input: DomainProviderDeleteActionInput) => void;
  onManualCleanup?: (input: DomainProviderCleanupActionInput) => void;
  providerCleanupKey?: string;
  providerDeletingKey?: string;
  resource: InstanceDomainProviderAppliedResourceState;
}) {
  const providerDelete = providerDeleteInputForAppliedResource(resource);
  const providerCleanup = providerCleanupInputForAppliedResource(resource);
  const providerDeleting = providerDeletingKey === domainProviderDeleteKey(providerDelete);
  const providerCleaning = providerCleanupKey === domainProviderDeleteKey(providerCleanup);

  return (
    <article className="rounded-md border border-dashed border-border bg-overlay p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="truncate text-sm font-semibold">{resource.host}</h3>
          <p className="text-xs text-muted-fg">
            {domainProviderResourceKindLabel(resource.kind)} · Applied: {resource.action}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button
            intent="outline"
            isDisabled={providerDeleting}
            onPress={() => onDeleteProvider?.(providerDelete)}
            size="sm"
            type="button"
          >
            <RemoveIcon />
            {providerDeleting ? "Deleting..." : "Delete provider"}
          </Button>
          <Button
            intent="outline"
            isDisabled={providerCleaning}
            onPress={() => onManualCleanup?.(providerCleanup)}
            size="sm"
            type="button"
          >
            <RemoveIcon />
            {providerCleaning ? "Marking..." : "Mark manually removed"}
          </Button>
        </div>
      </div>
    </article>
  );
}

function ShellHeader({ currentPath }: { currentPath: string }) {
  const pathname = currentPath.split("?")[0] ?? currentPath;

  return (
    <header className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-fg">Formless</p>
        <h1 className="text-2xl font-semibold">Instance</h1>
      </div>
      <nav aria-label="Instance navigation" className="flex flex-wrap gap-2">
        <InstanceNavigationLink
          href={runtimeTopologyRoutes.instanceRootRoute}
          isCurrent={pathname === runtimeTopologyRoutes.instanceRootRoute}
        >
          Overview
        </InstanceNavigationLink>
        <InstanceNavigationLink
          href={runtimeTopologyRoutes.deploymentsRoute}
          isCurrent={pathname === runtimeTopologyRoutes.deploymentsRoute}
        >
          Deployments
        </InstanceNavigationLink>
      </nav>
    </header>
  );
}

function InstanceNavigationLink({
  children,
  href,
  isCurrent,
}: {
  children: ReactNode;
  href: `/${string}`;
  isCurrent: boolean;
}) {
  const base =
    "inline-flex h-8 items-center rounded border px-3 text-sm font-medium transition-colors";

  return (
    <Link
      aria-current={isCurrent ? "page" : undefined}
      className={
        isCurrent
          ? `${base} border-fg bg-fg text-bg`
          : `${base} border-border text-muted-fg hover:border-fg hover:text-fg`
      }
      href={href}
    >
      {children}
    </Link>
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

function appliedRouteTargetLabel(appliedState: InstanceDomainMappingAppliedState): string {
  return appliedState.targetInstallId === undefined
    ? appliedState.profile
    : `${appliedState.profile}:${appliedState.targetInstallId}`;
}

function domainProviderConfigLabel(plan: InstanceDomainProviderPlanResponse): string {
  if (plan.config.deleteReady) {
    return "cleanup ready";
  }

  return plan.config.planReady ? "plan ready" : "setup needed";
}

function domainProviderTargetLabel(plan: InstanceDomainProviderPlanResponse): string {
  const account = plan.config.accountId ?? "missing account";
  const worker = plan.config.workerName ?? plan.plan.workerName;

  return `Account ${account} · Worker ${worker}`;
}

function domainProviderResourceSummary(plan: InstanceDomainProviderPlanResponse): string {
  const customDomains = plan.plan.resources.filter(
    (resource) => resource.kind === "cloudflare-worker-custom-domain",
  ).length;
  const redirects = plan.plan.resources.filter(
    (resource) => resource.kind === "cloudflare-redirect-rule",
  ).length;
  const dns = plan.plan.resources.filter(
    (resource) => resource.kind === "cloudflare-dns-records",
  ).length;

  return `Resources ${plan.plan.resources.length} · domains ${customDomains} · redirects ${redirects} · DNS ${dns}`;
}

function domainProviderBlockerSummary(plan: InstanceDomainProviderPlanResponse): string {
  if (plan.plan.blockers.length === 0) {
    return "Blockers none";
  }

  return `Blockers ${plan.plan.blockers
    .map((blocker) => (blocker.host ? `${blocker.host}:${blocker.code}` : blocker.code))
    .join(", ")}`;
}

function domainProviderIssueSummary(plan: InstanceDomainProviderPlanResponse): string {
  const issues = plan.config.issues.filter((issue) => !isRunnerMutationConfigIssue(issue.code));

  if (issues.length === 0) {
    return `Zones ${plan.config.zones.map((zone) => zone.name).join(", ") || "none"}`;
  }

  return `Config blockers ${issues.map((issue) => issue.code).join(", ")}`;
}

function domainProviderRunnerSummary(plan: InstanceDomainProviderPlanResponse): string {
  return `Runner mutation checked by ${plan.config.runnerMutation.checkedBy}`;
}

function isRunnerMutationConfigIssue(code: string): boolean {
  return code === "missing-alchemy-password" || code === "missing-cloudflare-api-token";
}

function providerDeleteInputForAppliedState(appliedState: InstanceDomainMappingAppliedState): {
  host: string;
  kind: InstanceDomainProviderAppliedResourceState["kind"];
  logicalId?: string;
} {
  return {
    host: appliedState.host,
    kind: "cloudflare-worker-custom-domain",
    ...(appliedState.alchemyResourceId === undefined
      ? {}
      : { logicalId: appliedState.alchemyResourceId }),
  };
}

function providerCleanupInputForAppliedState(
  appliedState: InstanceDomainMappingAppliedState,
): DomainProviderCleanupActionInput | undefined {
  if (appliedState.alchemyResourceId === undefined) {
    return undefined;
  }

  return {
    host: appliedState.host,
    kind: "cloudflare-worker-custom-domain",
    logicalId: appliedState.alchemyResourceId,
  };
}

function providerDeleteInputForAppliedResource(
  resource: InstanceDomainProviderAppliedResourceState,
): DomainProviderDeleteActionInput {
  return {
    host: resource.host,
    kind: resource.kind,
    logicalId: resource.logicalId,
  };
}

function providerCleanupInputForAppliedResource(
  resource: InstanceDomainProviderAppliedResourceState,
): DomainProviderCleanupActionInput {
  return {
    host: resource.host,
    kind: resource.kind,
    logicalId: resource.logicalId,
  };
}

function domainProviderDeleteKey(input: {
  host: string;
  kind?: InstanceDomainProviderAppliedResourceState["kind"];
  logicalId?: string;
}): string {
  return input.logicalId ?? `${input.kind ?? "host"}:${input.host}`;
}

function domainProviderResourceKindLabel(
  kind: InstanceDomainProviderAppliedResourceState["kind"],
): string {
  switch (kind) {
    case "cloudflare-dns-records":
      return "DNS records";
    case "cloudflare-redirect-rule":
      return "Redirect rule";
    case "cloudflare-worker-custom-domain":
      return "Custom domain";
  }
}

function removeCleanedDomainAppliedState(
  appliedStates: readonly InstanceDomainMappingAppliedState[],
  target: InstanceDomainProviderDeleteTarget,
): InstanceDomainMappingAppliedState[] {
  if (target.kind !== "cloudflare-worker-custom-domain") {
    return [...appliedStates];
  }

  return appliedStates.filter(
    (state) =>
      state.host !== target.host ||
      state.alchemyResourceId !== (target.alchemyResourceId ?? target.logicalId),
  );
}

function removeCleanedProviderAppliedResource(
  resources: readonly InstanceDomainProviderAppliedResourceState[],
  target: InstanceDomainProviderDeleteTarget,
): InstanceDomainProviderAppliedResourceState[] {
  return resources.filter(
    (resource) =>
      resource.host !== target.host ||
      resource.kind !== target.kind ||
      resource.logicalId !== target.logicalId,
  );
}
