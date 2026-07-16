import {
  useEffect,
  useId,
  useMemo,
  useState,
  type Dispatch,
  type ElementType,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useLocation } from "wouter";
import { Button } from "@dpeek/formless-ui/button";
import { Checkbox } from "@dpeek/formless-ui/checkbox";
import { Description, FieldGroup, Label, fieldErrorStyles } from "@dpeek/formless-ui/field";
import { Input } from "@dpeek/formless-ui/input";
import { NativeSelect, NativeSelectContent } from "@dpeek/formless-ui/native-select";
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
import {
  createIdentityAccessManagementInvitation,
  fetchIdentityAccessManagementSummary,
  IdentityAccessManagementApiError,
  revokeIdentityAccessManagementInvitation,
  type CreateIdentityAccessManagementInvitationInput,
  type RevokeIdentityAccessManagementInvitationInput,
} from "../../client/identity-access-management.ts";
import {
  instanceControlPlaneClientTarget,
  type ClientAppSchemaKey,
  type ClientAppTarget,
} from "../../client/app-target.ts";
import {
  normalizeGeneratedOperationRuntimeAdapterResponse,
  workspaceGatewayOperationGeneratedProgress,
  workspaceGatewayOperationGeneratedRuntimeAdapterResponse,
  type GeneratedOperationExecutionState,
} from "../../client/views.ts";
import {
  type AppPackageResolver,
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
  type WorkspaceOperationExecutionRequirement,
  type WorkspaceOperationMode,
  type WorkspaceOperationRequiredCapability,
} from "@dpeek/formless-workspace";
import { INSTANCE_CONTROL_PLANE_SCHEMA_KEY } from "@dpeek/formless-instance-control-plane";
import type {
  IdentityAccessInvitationGrantOptions,
  IdentityAccessInvitationMembershipGrantOption,
  IdentityAccessInvitationRoleGrantOption,
  IdentityAccessInvitationSummary,
  IdentityAccessManagementSummary,
  IdentityAccessPersonSummary,
  IdentityAccessRoleSummary,
  IdentityInvitationTargetSurface,
} from "@dpeek/formless-identity-control-plane";
import type { AppInstallsResponse } from "../../shared/protocol.ts";
import { runtimeTopologyRoutes } from "../../shared/runtime-topology.ts";
import { GeneratedOperationCompactStatus } from "../generated/operation-status.tsx";
import type { GeneratedWorkspaceSectionExternalAction } from "../generated/generated-workspace-runtime.tsx";
import { InstanceRail } from "../instance-rail.tsx";

export type InstanceShellHomeRouteProps = {
  activePackageResolver?: AppPackageResolver | undefined;
  sectionExternalActions?: Readonly<
    Record<string, readonly GeneratedWorkspaceSectionExternalAction[] | undefined>
  >;
  target?: ClientAppTarget;
  schemaKey: ClientAppSchemaKey;
  screenPath: string;
};

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

export type AccessManagementRouteState =
  | { status: "failed"; message: string }
  | { status: "loading" }
  | { status: "ready"; summary: IdentityAccessManagementSummary }
  | { status: "unauthorized"; message: string };

export type AccessInvitationCreateSubmission =
  | { status: "failed"; message: string }
  | { status: "idle" }
  | { status: "succeeded"; message: string }
  | { status: "submitting" };

export type AccessInvitationRevokeSubmission =
  | { status: "failed"; invitationId: string; message: string }
  | { status: "idle" }
  | { status: "submitting"; invitationId: string };

type AccessInvitationDraft = {
  displayName: string;
  expiresAtLocal: string;
  membershipOptionKeys: string[];
  roleOptionKeys: string[];
  targetAppInstallId: string;
  targetEmail: string;
  targetOrganizationId: string;
  targetSurface: IdentityInvitationTargetSurface;
};

export type WorkspaceGatewayOperationControlGroup = "all" | "workspace";

export type WorkspaceGatewayRuntimeCapabilityFacts = {
  actor: WorkspaceOperationActor;
  capabilities: readonly WorkspaceOperationRequiredCapability[];
};

export type WorkspaceGatewayOperationControl = {
  bootstrapAllowed: boolean;
  executionRequirements: readonly WorkspaceOperationExecutionRequirement[];
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
    executionRequirements: metadata.executionRequirements,
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
  homeRouteComponent,
  localWorkspaceGatewayAvailable: localWorkspaceGatewayAvailableProp,
}: {
  homeRouteComponent: ElementType<InstanceShellHomeRouteProps>;
  localWorkspaceGatewayAvailable?: boolean | undefined;
}) {
  const [location, setLocation] = useLocation();
  const [state, setState] = useState<InstanceShellRouteState>({ status: "loading" });
  const [installDrafts, setInstallDrafts] = useState<PackageInstallDrafts>({});
  const workspaceGatewayConfig = useMemo(() => workspaceGatewayBrowserConfig(), []);
  const localWorkspaceGatewayAvailable =
    localWorkspaceGatewayAvailableProp ?? workspaceGatewayConfig !== undefined;
  const [accessState, setAccessState] = useState<AccessManagementRouteState>({
    status: "loading",
  });
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
    if (!isInstanceAccessRoutePath(location)) {
      return;
    }

    const controller = new AbortController();
    let stopped = false;

    setAccessState({ status: "loading" });

    async function loadAccessSummary() {
      try {
        const summary = await fetchIdentityAccessManagementSummary({ signal: controller.signal });

        if (!stopped) {
          setAccessState({ status: "ready", summary });
        }
      } catch (error) {
        if (stopped || controller.signal.aborted) {
          return;
        }

        if (
          error instanceof IdentityAccessManagementApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          setAccessState({
            status: "unauthorized",
            message: error.message,
          });
          return;
        }

        setAccessState({
          status: "failed",
          message: error instanceof Error ? error.message : "Access management could not load.",
        });
      }
    }

    void loadAccessSummary();

    return () => {
      stopped = true;
      controller.abort();
    };
  }, [location]);

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

  async function submitAccessInvitation(input: CreateIdentityAccessManagementInvitationInput) {
    await createIdentityAccessManagementInvitation(input);
    const summary = await fetchIdentityAccessManagementSummary();

    setAccessState({ status: "ready", summary });
  }

  async function submitAccessInvitationRevoke(
    input: RevokeIdentityAccessManagementInvitationInput,
  ) {
    await revokeIdentityAccessManagementInvitation(input);
    const summary = await fetchIdentityAccessManagementSummary();

    setAccessState({ status: "ready", summary });
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
      accessState={accessState}
      currentPath={location}
      installs={state.status === "ready" ? state.installs : []}
      installDrafts={installDrafts}
      onPollWorkspaceOperation={pollWorkspaceOperation}
      onCreateAccessInvitation={submitAccessInvitation}
      onRevokeAccessInvitation={submitAccessInvitationRevoke}
      onInstallDraftChange={(packageAppKey, draft) =>
        setInstallDrafts((current) => ({
          ...current,
          [packageAppKey]: draft,
        }))
      }
      onSubmitInstall={submitInstall}
      onStartWorkspaceOperation={startWorkspaceOperation}
      homeRouteComponent={homeRouteComponent}
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
  accessState = { status: "loading" },
  currentPath = runtimeTopologyRoutes.instanceRootRoute,
  homeRouteComponent,
  installs = [],
  installDrafts = {},
  onCreateAccessInvitation,
  onRevokeAccessInvitation,
  onPollWorkspaceOperation,
  onInstallDraftChange,
  onSubmitInstall,
  onStartWorkspaceOperation,
  state,
  workspaceGatewayState = { status: "unavailable" },
}: {
  accessState?: AccessManagementRouteState;
  currentPath?: string;
  homeRouteComponent: ElementType<InstanceShellHomeRouteProps>;
  installs?: readonly AppInstall[];
  installDrafts?: PackageInstallDrafts;
  onCreateAccessInvitation?: (
    input: CreateIdentityAccessManagementInvitationInput,
  ) => Promise<void>;
  onRevokeAccessInvitation?: (
    input: RevokeIdentityAccessManagementInvitationInput,
  ) => Promise<void>;
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
  const frame = (children: ReactNode, installs: readonly AppInstall[] = []) => (
    <InstanceShellFrame currentPath={currentPath} installs={installs}>
      {children}
    </InstanceShellFrame>
  );

  if (state.status === "loading") {
    return frame(
      <section className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
        <ShellHeader currentPath={currentPath} />
        <p className="text-sm text-muted-fg">Loading installed apps...</p>
      </section>,
    );
  }

  if (state.status === "failed") {
    return frame(
      <section className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
        <ShellHeader currentPath={currentPath} />
        <p className="text-sm text-red-700" role="alert">
          {state.message}
        </p>
      </section>,
    );
  }

  if (isInstanceAccessRoutePath(currentPath)) {
    return frame(
      <AccessManagementRouteView
        installs={installs.length > 0 ? installs : state.installs}
        onCreateInvitation={onCreateAccessInvitation}
        onRevokeInvitation={onRevokeAccessInvitation}
        state={accessState}
      />,
      state.installs,
    );
  }

  return frame(
    <section className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <ShellHeader currentPath={currentPath} />
      <WorkspaceGatewayManagementSection
        onPollOperation={onPollWorkspaceOperation}
        onStartOperation={onStartWorkspaceOperation}
        state={workspaceGatewayState}
      />
      <GeneratedInstanceAppsSection
        homeRouteComponent={homeRouteComponent}
        installDisabled={state.installing || state.packages.length === 0}
        onInstall={() => setInstallDialogOpen(true)}
      />
      <GeneratedInstanceRoutesSection homeRouteComponent={homeRouteComponent} />
      <InstallAppDialog
        installDrafts={installDrafts}
        onDraftChange={onInstallDraftChange}
        onOpenChange={setInstallDialogOpen}
        onSubmitInstall={onSubmitInstall}
        open={installDialogOpen}
        state={state}
      />
    </section>,
    state.installs,
  );
}

function InstanceShellFrame({
  children,
  currentPath,
  installs,
}: {
  children: ReactNode;
  currentPath: string;
  installs: readonly AppInstall[];
}) {
  return (
    <div className="flex min-h-dvh bg-bg text-fg" data-frame="instance-owner-shell">
      <InstanceRail currentPath={currentPath} installs={installs} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
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
  const operationState =
    state.status === "ready"
      ? workspacePushOperationExecutionState({
          error: progressError,
          operation: progressOperation,
        })
      : undefined;

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
        {operationState ? (
          <GeneratedOperationCompactStatus
            controlId="workspace-push"
            displayText={displaySafeText}
            operationLabel="Push"
            state={operationState}
          />
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

function workspacePushOperationExecutionState({
  error,
  operation,
}: {
  error?: string;
  operation?: WorkspaceGatewayOperation;
}): GeneratedOperationExecutionState | undefined {
  if (!operation && !error) {
    return undefined;
  }

  const progress = operation ? workspaceGatewayOperationGeneratedProgress(operation) : undefined;
  const startedAt = workspaceOperationTimestamp(operation?.createdAt);
  const completedAt = workspaceOperationTimestamp(operation?.updatedAt);
  const base = {
    executionKey: "workspace:push",
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(progress === undefined ? {} : { progress }),
  };

  if (error) {
    return {
      ...base,
      status: "failed",
      result: {
        type: "failed",
        displayError: error,
      },
      ...(completedAt === undefined ? {} : { completedAt }),
    };
  }

  if (!operation) {
    return undefined;
  }

  if (operationPollsAutomatically(operation)) {
    return {
      ...base,
      status: "pending",
    };
  }

  const result = normalizeGeneratedOperationRuntimeAdapterResponse(
    workspaceGatewayOperationGeneratedRuntimeAdapterResponse(operation),
  );

  return {
    ...base,
    status: result.type,
    result,
    ...(completedAt === undefined ? {} : { completedAt }),
  };
}

function workspaceOperationTimestamp(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function AccessManagementRouteView({
  installs,
  onCreateInvitation,
  onRevokeInvitation,
  state,
}: {
  installs: readonly AppInstall[];
  onCreateInvitation?: (input: CreateIdentityAccessManagementInvitationInput) => Promise<void>;
  onRevokeInvitation?: (input: RevokeIdentityAccessManagementInvitationInput) => Promise<void>;
  state: AccessManagementRouteState;
}) {
  return (
    <section
      aria-labelledby="access-management-heading"
      className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6"
      data-formless-access-management="true"
      data-formless-access-state={accessManagementDisplayState(state)}
    >
      <ShellHeader currentPath={runtimeTopologyRoutes.accessRoute} />
      {state.status === "loading" ? (
        <p className="text-sm text-muted-fg">Loading access management...</p>
      ) : null}
      {state.status === "unauthorized" ? (
        <p className="text-sm text-red-700" role="alert">
          {displaySafeText(state.message)}
        </p>
      ) : null}
      {state.status === "failed" ? (
        <p className="text-sm text-red-700" role="alert">
          {displaySafeText(state.message)}
        </p>
      ) : null}
      {state.status === "ready" ? (
        <AccessManagementSummaryView
          installs={installs}
          onCreateInvitation={onCreateInvitation}
          onRevokeInvitation={onRevokeInvitation}
          summary={state.summary}
        />
      ) : null}
    </section>
  );
}

function AccessManagementSummaryView({
  installs,
  onCreateInvitation,
  onRevokeInvitation,
  summary,
}: {
  installs: readonly AppInstall[];
  onCreateInvitation?: (input: CreateIdentityAccessManagementInvitationInput) => Promise<void>;
  onRevokeInvitation?: (input: RevokeIdentityAccessManagementInvitationInput) => Promise<void>;
  summary: IdentityAccessManagementSummary;
}) {
  const empty = identityAccessSummaryIsEmpty(summary);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.75fr)]">
      <div className="space-y-6">
        {empty ? (
          <div
            className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-fg"
            data-formless-access-empty="true"
          >
            No people or invitations.
          </div>
        ) : (
          <AccessPeopleSummary people={summary.people} roles={summary.roles} />
        )}
      </div>
      <div className="space-y-6">
        <AccessInvitationCreateForm
          grantOptions={summary.invitationGrantOptions}
          installs={installs}
          onCreateInvitation={onCreateInvitation}
          organizations={summary.organizations}
        />
        {empty ? null : (
          <AccessInvitationSummary
            canRevokeInvitations={identityAccessCanManageInvitations(
              summary.invitationGrantOptions,
            )}
            invitations={summary.invitations}
            onRevokeInvitation={onRevokeInvitation}
          />
        )}
      </div>
    </div>
  );
}

function AccessPeopleSummary({
  people,
  roles,
}: {
  people: readonly IdentityAccessPersonSummary[];
  roles: readonly IdentityAccessRoleSummary[];
}) {
  const rolesByPrincipalId = identityAccessRolesByPrincipalId(roles);

  return (
    <section aria-labelledby="access-people-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="access-people-heading" className="text-sm font-semibold">
          People
        </h2>
        <span className="text-xs text-muted-fg">{people.length}</span>
      </div>
      {people.length === 0 ? (
        <p className="text-sm text-muted-fg" data-formless-access-people-empty="true">
          No people.
        </p>
      ) : (
        <ol className="grid gap-3" data-formless-access-people-summary="true">
          {people.map((person) => (
            <li
              className="rounded-md border border-border bg-overlay p-4"
              data-formless-access-person={person.principalId}
              key={person.principalId}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium">{displaySafeText(person.displayName)}</h3>
                  <p className="break-words text-xs text-muted-fg">
                    {person.primaryEmail
                      ? displaySafeText(person.primaryEmail.displayEmail)
                      : identityAccessPrincipalKindLabel(person.kind)}
                  </p>
                </div>
                <IdentityAccessStatusBadge value={person.status} />
              </div>
              <IdentityAccessRoleList roles={rolesByPrincipalId.get(person.principalId) ?? []} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function AccessInvitationSummary({
  canRevokeInvitations,
  invitations,
  onRevokeInvitation,
}: {
  canRevokeInvitations: boolean;
  invitations: readonly IdentityAccessInvitationSummary[];
  onRevokeInvitation?: (input: RevokeIdentityAccessManagementInvitationInput) => Promise<void>;
}) {
  const [revokeSubmission, setRevokeSubmission] = useState<AccessInvitationRevokeSubmission>({
    status: "idle",
  });

  async function revokeInvitation(invitation: IdentityAccessInvitationSummary) {
    if (!onRevokeInvitation) {
      return;
    }

    setRevokeSubmission({ status: "submitting", invitationId: invitation.invitationId });

    try {
      await onRevokeInvitation({ invitationId: invitation.invitationId });
      setRevokeSubmission({ status: "idle" });
    } catch (error) {
      setRevokeSubmission({
        status: "failed",
        invitationId: invitation.invitationId,
        message:
          error instanceof IdentityAccessManagementApiError || error instanceof Error
            ? error.message
            : "Invitation could not be revoked.",
      });
    }
  }

  return (
    <section aria-labelledby="access-invitations-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="access-invitations-heading" className="text-sm font-semibold">
          Invitations
        </h2>
        <span className="text-xs text-muted-fg">{invitations.length}</span>
      </div>
      {invitations.length === 0 ? (
        <p className="text-sm text-muted-fg" data-formless-access-invitations-empty="true">
          No invitations.
        </p>
      ) : (
        <ol className="grid gap-3" data-formless-access-invitation-summary="true">
          {invitations.map((invitation) => {
            const revoking =
              revokeSubmission.status === "submitting" &&
              revokeSubmission.invitationId === invitation.invitationId;
            const showRevoke =
              canRevokeInvitations &&
              onRevokeInvitation !== undefined &&
              invitation.status === "pending";

            return (
              <li
                className="rounded-md border border-border bg-overlay p-4"
                data-formless-access-invitation={invitation.invitationId}
                key={invitation.invitationId}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-medium">
                      {displaySafeText(invitation.targetEmail)}
                    </h3>
                    <p className="text-xs text-muted-fg">
                      {identityAccessInvitationTargetLabel(invitation)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <IdentityAccessStatusBadge value={invitation.status} />
                    {showRevoke ? (
                      <Button
                        aria-label={`Revoke invitation for ${displaySafeText(invitation.targetEmail)}`}
                        data-formless-access-invitation-revoke={invitation.invitationId}
                        intent="danger"
                        isDisabled={revoking}
                        onPress={() => void revokeInvitation(invitation)}
                        size="sm"
                        type="button"
                      >
                        <RemoveIcon aria-hidden="true" />
                        {revoking ? "Revoking" : "Revoke"}
                      </Button>
                    ) : null}
                  </div>
                </div>
                <dl className="mt-3 grid gap-2 text-xs text-muted-fg sm:grid-cols-2">
                  <div>
                    <dt className="font-medium text-fg">Expires</dt>
                    <dd>{formatIdentityAccessDate(invitation.expiresAt)}</dd>
                  </div>
                  {invitation.acceptedAt ? (
                    <div>
                      <dt className="font-medium text-fg">Accepted</dt>
                      <dd>{formatIdentityAccessDate(invitation.acceptedAt)}</dd>
                    </div>
                  ) : null}
                </dl>
                <AccessInvitationRevokeFeedback
                  invitationId={invitation.invitationId}
                  submission={revokeSubmission}
                />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function AccessInvitationRevokeFeedback({
  invitationId,
  submission,
}: {
  invitationId: string;
  submission: AccessInvitationRevokeSubmission;
}) {
  if (submission.status !== "failed" || submission.invitationId !== invitationId) {
    return null;
  }

  return (
    <p
      className={fieldErrorStyles()}
      data-formless-access-invitation-revoke-error={invitationId}
      data-slot="field-error"
      role="alert"
    >
      {displaySafeText(submission.message)}
    </p>
  );
}

function AccessInvitationCreateForm({
  grantOptions,
  installs,
  onCreateInvitation,
  organizations,
}: {
  grantOptions: IdentityAccessInvitationGrantOptions;
  installs: readonly AppInstall[];
  onCreateInvitation?: (input: CreateIdentityAccessManagementInvitationInput) => Promise<void>;
  organizations: readonly IdentityAccessManagementSummary["organizations"][number][];
}) {
  const formId = useId();
  const [draft, setDraft] = useState<AccessInvitationDraft>(() =>
    initialAccessInvitationDraft({ installs, organizations }),
  );
  const [submission, setSubmission] = useState<AccessInvitationCreateSubmission>({
    status: "idle",
  });

  async function submitInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!onCreateInvitation || !event.currentTarget.reportValidity()) {
      return;
    }

    setSubmission({ status: "submitting" });

    try {
      await onCreateInvitation(identityAccessInvitationCreateInputFromDraft(draft, grantOptions));
      setDraft(initialAccessInvitationDraft({ installs, organizations }));
      setSubmission({
        status: "succeeded",
        message: "Invitation created.",
      });
    } catch (error) {
      setSubmission({
        status: "failed",
        message:
          error instanceof IdentityAccessManagementApiError || error instanceof Error
            ? error.message
            : "Invitation could not be created.",
      });
    }
  }

  function updateDraft(update: Partial<AccessInvitationDraft>) {
    setDraft((current) => ({ ...current, ...update }));
  }

  return (
    <form
      className="space-y-4 rounded-md border border-border bg-overlay p-4"
      data-formless-access-invitation-form="true"
      onSubmit={submitInvitation}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Invite collaborator</h2>
        <span className="text-xs text-muted-fg">
          {grantOptions.authority.instanceOwner ? "Owner grants" : "Admin grants"}
        </span>
      </div>
      <FieldGroup className="space-y-4">
        <TextField
          isRequired
          onChange={(value) => updateDraft({ targetEmail: value })}
          type="email"
          value={draft.targetEmail}
        >
          <Label>Email</Label>
          <Input name="targetEmail" />
        </TextField>
        <TextField
          isRequired
          onChange={(value) => updateDraft({ displayName: value })}
          value={draft.displayName}
        >
          <Label>Display name</Label>
          <Input name="displayName" />
        </TextField>
        <TextField
          isRequired
          onChange={(value) => updateDraft({ expiresAtLocal: value })}
          value={draft.expiresAtLocal}
        >
          <Label>Expires</Label>
          <Input name="expiresAt" type="datetime-local" />
        </TextField>
        <NativeSelect>
          <Label htmlFor={`${formId}-target-surface`}>Target surface</Label>
          <NativeSelectContent
            id={`${formId}-target-surface`}
            name="targetSurface"
            onChange={(event) =>
              updateDraft({ targetSurface: accessInvitationTargetSurface(event.target.value) })
            }
            value={draft.targetSurface}
          >
            <option value="instance">Instance</option>
            <option value="app-install">App install</option>
            <option value="organization">Organization</option>
          </NativeSelectContent>
        </NativeSelect>
        <NativeSelect>
          <Label htmlFor={`${formId}-app-install`}>App install scope</Label>
          <NativeSelectContent
            id={`${formId}-app-install`}
            disabled={installs.length === 0}
            name="targetAppInstallId"
            onChange={(event) => updateDraft({ targetAppInstallId: event.target.value })}
            value={draft.targetAppInstallId}
          >
            {installs.length === 0 ? <option value="">No app installs</option> : null}
            {installs.map((install) => (
              <option key={install.installId} value={install.installId}>
                {install.label}
              </option>
            ))}
          </NativeSelectContent>
        </NativeSelect>
        <NativeSelect>
          <Label htmlFor={`${formId}-organization`}>Organization scope</Label>
          <NativeSelectContent
            id={`${formId}-organization`}
            disabled={organizations.length === 0}
            name="targetOrganization"
            onChange={(event) => updateDraft({ targetOrganizationId: event.target.value })}
            value={draft.targetOrganizationId}
          >
            {organizations.length === 0 ? <option value="">No organizations</option> : null}
            {organizations.map((organization) => (
              <option key={organization.organizationId} value={organization.organizationId}>
                {organization.displayName}
              </option>
            ))}
          </NativeSelectContent>
        </NativeSelect>
      </FieldGroup>
      <AccessInvitationRoleOptions
        draft={draft}
        grantOptions={grantOptions}
        onRoleOptionChange={(roleOptionKeys) => updateDraft({ roleOptionKeys })}
      />
      <AccessInvitationMembershipOptions
        grantOptions={grantOptions}
        membershipOptionKeys={draft.membershipOptionKeys}
        onMembershipOptionChange={(membershipOptionKeys) => updateDraft({ membershipOptionKeys })}
      />
      {submission.status === "failed" ? (
        <p className={fieldErrorStyles()} data-slot="field-error" role="alert">
          {displaySafeText(submission.message)}
        </p>
      ) : null}
      {submission.status === "succeeded" ? (
        <p className="text-sm text-muted-fg" data-formless-access-invitation-created="true">
          {submission.message}
        </p>
      ) : null}
      <Button
        data-formless-access-invitation-submit="true"
        isDisabled={submission.status === "submitting" || onCreateInvitation === undefined}
        type="submit"
      >
        <AddIcon />
        {submission.status === "submitting" ? "Sending" : "Send invite"}
      </Button>
    </form>
  );
}

function AccessInvitationRoleOptions({
  draft,
  grantOptions,
  onRoleOptionChange,
}: {
  draft: AccessInvitationDraft;
  grantOptions: IdentityAccessInvitationGrantOptions;
  onRoleOptionChange: (roleOptionKeys: string[]) => void;
}) {
  return (
    <fieldset className="space-y-3" data-formless-access-invitation-role-options="true">
      <legend className="text-sm font-medium">Roles</legend>
      {grantOptions.roles.length === 0 ? (
        <p className="text-sm text-muted-fg">No grantable roles.</p>
      ) : (
        <div className="grid gap-2">
          {grantOptions.roles.map((option) => {
            const key = accessInvitationRoleOptionKey(option);
            const disabledReason = accessInvitationRoleOptionDisabledReason(option, draft);
            const selected = draft.roleOptionKeys.includes(key);

            return (
              <Checkbox
                data-formless-access-invitation-role-option={key}
                data-formless-access-invitation-role-key={option.roleKey}
                data-formless-access-invitation-role-scope={option.scopeKind}
                isDisabled={disabledReason !== undefined}
                isSelected={selected}
                key={key}
                onChange={(isSelected) =>
                  onRoleOptionChange(
                    accessInvitationToggleOption(draft.roleOptionKeys, key, isSelected),
                  )
                }
              >
                {displaySafeText(option.displayLabel)}
              </Checkbox>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

function AccessInvitationMembershipOptions({
  grantOptions,
  membershipOptionKeys,
  onMembershipOptionChange,
}: {
  grantOptions: IdentityAccessInvitationGrantOptions;
  membershipOptionKeys: string[];
  onMembershipOptionChange: (membershipOptionKeys: string[]) => void;
}) {
  return (
    <fieldset className="space-y-3" data-formless-access-invitation-membership-options="true">
      <legend className="text-sm font-medium">Memberships</legend>
      {grantOptions.memberships.length === 0 ? (
        <p className="text-sm text-muted-fg">No grantable memberships.</p>
      ) : (
        <div className="grid gap-2">
          {grantOptions.memberships.map((option) => {
            const key = accessInvitationMembershipOptionKey(option);

            return (
              <Checkbox
                data-formless-access-invitation-membership-option={key}
                data-formless-access-invitation-membership-target-kind={option.targetKind}
                isSelected={membershipOptionKeys.includes(key)}
                key={key}
                onChange={(isSelected) =>
                  onMembershipOptionChange(
                    accessInvitationToggleOption(membershipOptionKeys, key, isSelected),
                  )
                }
              >
                {displaySafeText(option.displayLabel)}
              </Checkbox>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

function IdentityAccessRoleList({ roles }: { roles: readonly IdentityAccessRoleSummary[] }) {
  if (roles.length === 0) {
    return null;
  }

  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {roles.map((role) => (
        <li
          className="rounded border border-border px-2 py-1 text-xs text-muted-fg"
          key={role.roleAssignmentId}
        >
          {displaySafeText(role.displayLabel || role.roleKey)}
        </li>
      ))}
    </ul>
  );
}

function IdentityAccessStatusBadge({ value }: { value: string }) {
  return (
    <span className="rounded border border-border px-2 py-1 text-xs text-muted-fg">
      {fieldKeyLabel(value)}
    </span>
  );
}

function identityAccessSummaryIsEmpty(summary: IdentityAccessManagementSummary): boolean {
  return (
    summary.people.length === 0 &&
    summary.invitations.length === 0 &&
    summary.roles.length === 0 &&
    summary.appRegistrations.length === 0 &&
    summary.memberships.length === 0 &&
    summary.organizations.length === 0 &&
    summary.groups.length === 0
  );
}

function identityAccessCanManageInvitations(
  grantOptions: IdentityAccessInvitationGrantOptions,
): boolean {
  return grantOptions.authority.instanceAdmin || grantOptions.authority.instanceOwner;
}

function identityAccessRolesByPrincipalId(
  roles: readonly IdentityAccessRoleSummary[],
): Map<string, IdentityAccessRoleSummary[]> {
  const rolesByPrincipalId = new Map<string, IdentityAccessRoleSummary[]>();

  for (const role of roles) {
    if (role.targetKind !== "principal" || role.targetPrincipalId === undefined) {
      continue;
    }

    rolesByPrincipalId.set(role.targetPrincipalId, [
      ...(rolesByPrincipalId.get(role.targetPrincipalId) ?? []),
      role,
    ]);
  }

  return rolesByPrincipalId;
}

function identityAccessInvitationTargetLabel(invitation: IdentityAccessInvitationSummary): string {
  const target = fieldKeyLabel(invitation.targetSurface);

  if (invitation.targetAppInstallId) {
    return `${target} ${displaySafeText(invitation.targetAppInstallId)}`;
  }

  if (invitation.targetOrganizationId) {
    return `${target} ${displaySafeText(invitation.targetOrganizationId)}`;
  }

  return target;
}

function identityAccessPrincipalKindLabel(kind: IdentityAccessPersonSummary["kind"]): string {
  return fieldKeyLabel(kind);
}

function accessManagementDisplayState(state: AccessManagementRouteState): string {
  return state.status === "ready" && identityAccessSummaryIsEmpty(state.summary)
    ? "empty"
    : state.status;
}

function formatIdentityAccessDate(value: string): string {
  return value.slice(0, 10);
}

function initialAccessInvitationDraft({
  installs,
  organizations,
}: {
  installs: readonly AppInstall[];
  organizations: readonly IdentityAccessManagementSummary["organizations"][number][];
}): AccessInvitationDraft {
  return {
    displayName: "",
    expiresAtLocal: defaultAccessInvitationExpiresAtLocal(),
    membershipOptionKeys: [],
    roleOptionKeys: [],
    targetAppInstallId: installs[0]?.installId ?? "",
    targetEmail: "",
    targetOrganizationId: organizations[0]?.organizationId ?? "",
    targetSurface: "instance",
  };
}

function identityAccessInvitationCreateInputFromDraft(
  draft: AccessInvitationDraft,
  grantOptions: IdentityAccessInvitationGrantOptions,
): CreateIdentityAccessManagementInvitationInput {
  const targetEmail = requiredAccessInvitationText("Email", draft.targetEmail);
  const displayName = requiredAccessInvitationText("Display name", draft.displayName);
  const targetFacts = accessInvitationTargetFacts(draft);
  const roleAssignments = identityAccessInvitationRoleAssignmentsFromDraft(draft, grantOptions);
  const memberships = identityAccessInvitationMembershipsFromDraft(draft, grantOptions);
  const appRegistrations: NonNullable<
    CreateIdentityAccessManagementInvitationInput["appRegistrations"]
  > =
    draft.targetSurface === "app-install"
      ? [
          {
            appInstallId: requiredAccessInvitationText(
              "App install scope",
              draft.targetAppInstallId,
            ),
          },
        ]
      : [];

  return {
    ...targetFacts,
    appRegistrations,
    expiresAt: accessInvitationExpiresAtIso(draft.expiresAtLocal),
    idempotencyKey: accessInvitationIdempotencyKey(),
    invitedPrincipal: { displayName },
    memberships,
    principalEmail: {
      primary: true,
      recovery: false,
    },
    roleAssignments,
    targetEmail,
  };
}

function accessInvitationTargetFacts(
  draft: AccessInvitationDraft,
): Pick<
  CreateIdentityAccessManagementInvitationInput,
  "targetAppInstallId" | "targetOrganization" | "targetSurface"
> {
  if (draft.targetSurface === "app-install") {
    return {
      targetAppInstallId: requiredAccessInvitationText(
        "App install scope",
        draft.targetAppInstallId,
      ),
      targetSurface: draft.targetSurface,
    };
  }

  if (draft.targetSurface === "organization") {
    return {
      targetOrganization: requiredAccessInvitationText(
        "Organization scope",
        draft.targetOrganizationId,
      ),
      targetSurface: draft.targetSurface,
    };
  }

  return { targetSurface: draft.targetSurface };
}

function identityAccessInvitationRoleAssignmentsFromDraft(
  draft: AccessInvitationDraft,
  grantOptions: IdentityAccessInvitationGrantOptions,
): NonNullable<CreateIdentityAccessManagementInvitationInput["roleAssignments"]> {
  const selectedKeys = new Set(draft.roleOptionKeys);
  const roleAssignments: NonNullable<
    CreateIdentityAccessManagementInvitationInput["roleAssignments"]
  > = [];

  for (const option of grantOptions.roles) {
    const key = accessInvitationRoleOptionKey(option);

    if (!selectedKeys.has(key)) {
      continue;
    }

    if (option.scopeKind === "app-install") {
      roleAssignments.push({
        appInstallId: requiredAccessInvitationText("App install scope", draft.targetAppInstallId),
        roleKey: option.roleKey,
        scopeKind: option.scopeKind,
      });
      continue;
    }

    if (option.scopeKind === "organization") {
      roleAssignments.push({
        roleKey: option.roleKey,
        scopeKind: option.scopeKind,
        scopeOrganization: requiredAccessInvitationText(
          "Organization scope",
          draft.targetOrganizationId,
        ),
      });
      continue;
    }

    roleAssignments.push({
      roleKey: option.roleKey,
      scopeKind: option.scopeKind,
    });
  }

  return roleAssignments;
}

function identityAccessInvitationMembershipsFromDraft(
  draft: AccessInvitationDraft,
  grantOptions: IdentityAccessInvitationGrantOptions,
): NonNullable<CreateIdentityAccessManagementInvitationInput["memberships"]> {
  const selectedKeys = new Set(draft.membershipOptionKeys);
  const memberships: NonNullable<CreateIdentityAccessManagementInvitationInput["memberships"]> = [];

  for (const option of grantOptions.memberships) {
    if (!selectedKeys.has(accessInvitationMembershipOptionKey(option))) {
      continue;
    }

    if (option.targetKind === "group" && option.targetGroupId !== undefined) {
      memberships.push({
        targetGroup: option.targetGroupId,
        targetKind: option.targetKind,
      });
      continue;
    }

    if (option.targetKind === "organization" && option.targetOrganizationId !== undefined) {
      memberships.push({
        targetKind: option.targetKind,
        targetOrganization: option.targetOrganizationId,
      });
    }
  }

  return memberships;
}

function accessInvitationRoleOptionKey(option: IdentityAccessInvitationRoleGrantOption): string {
  return `${option.scopeKind}:${option.roleKey}`;
}

function accessInvitationMembershipOptionKey(
  option: IdentityAccessInvitationMembershipGrantOption,
): string {
  if (option.targetKind === "group") {
    return `group:${option.targetGroupId ?? ""}`;
  }

  return `organization:${option.targetOrganizationId ?? ""}`;
}

function accessInvitationRoleOptionDisabledReason(
  option: IdentityAccessInvitationRoleGrantOption,
  draft: AccessInvitationDraft,
): string | undefined {
  if (option.scopeKind === "app-install" && draft.targetAppInstallId.trim() === "") {
    return "App install scope is required.";
  }

  if (option.scopeKind === "organization" && draft.targetOrganizationId.trim() === "") {
    return "Organization scope is required.";
  }

  return undefined;
}

function accessInvitationToggleOption(
  current: readonly string[],
  key: string,
  selected: boolean,
): string[] {
  if (selected) {
    return current.includes(key) ? [...current] : [...current, key];
  }

  return current.filter((candidate) => candidate !== key);
}

function accessInvitationTargetSurface(value: string): IdentityInvitationTargetSurface {
  if (value === "app-install" || value === "instance" || value === "organization") {
    return value;
  }

  return "instance";
}

function accessInvitationExpiresAtIso(value: string): string {
  const date = new Date(requiredAccessInvitationText("Expires", value));

  if (Number.isNaN(date.getTime())) {
    throw new Error("Expires must be a valid date.");
  }

  return date.toISOString();
}

function requiredAccessInvitationText(label: string, value: string): string {
  const text = value.trim();

  if (text === "") {
    throw new Error(`${label} is required.`);
  }

  return text;
}

function accessInvitationIdempotencyKey(): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  return `access-invitation:${Date.now()}:${randomId}`;
}

function defaultAccessInvitationExpiresAtLocal(): string {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  expiresAt.setSeconds(0, 0);

  return `${expiresAt.getFullYear()}-${padDatePart(expiresAt.getMonth() + 1)}-${padDatePart(
    expiresAt.getDate(),
  )}T${padDatePart(expiresAt.getHours())}:${padDatePart(expiresAt.getMinutes())}`;
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

function GeneratedInstanceAppsSection({
  homeRouteComponent: HomeRouteComponent,
  installDisabled,
  onInstall,
}: {
  homeRouteComponent: ElementType<InstanceShellHomeRouteProps>;
  installDisabled: boolean;
  onInstall: () => void;
}) {
  const controlPlaneTarget = useMemo(() => instanceControlPlaneClientTarget(), []);

  return (
    <section aria-label="Apps" className="space-y-3">
      <div data-formless-control-plane-screen="apps">
        <HomeRouteComponent
          schemaKey={INSTANCE_CONTROL_PLANE_SCHEMA_KEY}
          sectionExternalActions={{
            "app-installs": [
              {
                action: {
                  disabled: installDisabled,
                  id: "install",
                  icon: "add",
                  invocationSource: "button",
                  invoke: { controlId: "install", invocationSource: "button" },
                  kind: "actionTrigger",
                  label: "Install",
                },
                onIntent: onInstall,
              },
            ],
          }}
          screenPath="/"
          target={controlPlaneTarget}
        />
      </div>
    </section>
  );
}

function GeneratedInstanceRoutesSection({
  homeRouteComponent: HomeRouteComponent,
}: {
  homeRouteComponent: ElementType<InstanceShellHomeRouteProps>;
}) {
  const controlPlaneTarget = useMemo(() => instanceControlPlaneClientTarget(), []);

  return (
    <section aria-label="Routes" className="space-y-3">
      <div data-formless-control-plane-screen="routes">
        <HomeRouteComponent
          schemaKey={INSTANCE_CONTROL_PLANE_SCHEMA_KEY}
          screenPath="/routes"
          target={controlPlaneTarget}
        />
      </div>
    </section>
  );
}

function ShellHeader({ currentPath }: { currentPath: string }) {
  const accessRoute = isInstanceAccessRoutePath(currentPath);

  return (
    <header>
      <h1
        className="text-2xl font-semibold"
        id={accessRoute ? "access-management-heading" : "instance-settings-heading"}
      >
        {accessRoute ? "Access" : "Instance Settings"}
      </h1>
    </header>
  );
}

function isInstanceAccessRoutePath(path: string): boolean {
  return normalizeInstanceShellPath(path) === runtimeTopologyRoutes.accessRoute;
}

function normalizeInstanceShellPath(path: string): string {
  const normalized = path.split(/[?#]/)[0] || "/";

  return normalized.endsWith("/") && normalized !== "/" ? normalized.slice(0, -1) : normalized;
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
