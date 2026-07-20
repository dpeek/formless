import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import type { PresentationIntent } from "@dpeek/formless-presentation/contract";
import { isManagementIntent, type PresentationNodeSet } from "@dpeek/formless-presentation/host";
import { INSTANCE_CONTROL_PLANE_SCHEMA_KEY } from "@dpeek/formless-instance-control-plane";
import type { PackageAppKey } from "@dpeek/formless-installed-apps";
import { instanceControlPlaneClientTarget } from "../../client/app-target.ts";
import type { GeneratedWorkspaceRuntimeController } from "../generated/generated-workspace-runtime.tsx";
import {
  type ApplicationRuntimeContractPublication,
  type ApplicationRuntimePublicationCoordinator,
  useApplicationRuntimePublicationCoordinatorContext,
} from "../generated/application-runtime-contract-host.tsx";
import type {
  InstanceShellRouteState,
  PackageInstallDraft,
  PackageInstallDrafts,
  WorkspaceGatewayRouteState,
} from "./instance-shell.tsx";
import { ApplicationPresentation } from "../application-presentation.tsx";
import { HomeRoute, type HomeRouteClientLoadState } from "./home.tsx";
import {
  dispatchInstanceManagementIntent,
  instanceManagementInstallDialogReference,
  instanceManagementReference,
  projectInstanceManagement,
  type InstanceManagementIntentActions,
  type InstanceManagementProjection,
  type ProjectInstanceManagementOptions,
} from "./instance-management-projection.ts";
import { INSTANCE_MANAGEMENT_CONTRIBUTOR_ID } from "./instance-management-contract.ts";

export type InstanceManagementRuntimePublicationController = {
  activate(): void;
  dispose(): void;
  updateRuntime(
    input: Omit<ProjectInstanceManagementOptions, "workspaces">,
    actions: InstanceManagementIntentActions,
  ): void;
  updateWorkspace(
    role: "apps" | "routes",
    controller: GeneratedWorkspaceRuntimeController | undefined,
  ): void;
};

export function createInstanceManagementRuntimePublicationController(
  application: ApplicationRuntimePublicationCoordinator,
): InstanceManagementRuntimePublicationController {
  let actions: InstanceManagementIntentActions | undefined;
  let disposed = false;
  let input: Omit<ProjectInstanceManagementOptions, "workspaces"> | undefined;
  let projection: InstanceManagementProjection | undefined;
  const workspaces: Partial<
    Record<"apps" | "routes", GeneratedWorkspaceRuntimeController | undefined>
  > = {};

  return { activate, dispose, updateRuntime, updateWorkspace };

  function activate() {
    disposed = false;
    publish();
  }

  function dispose() {
    disposed = true;
    application.remove(INSTANCE_MANAGEMENT_CONTRIBUTOR_ID);
  }

  function updateRuntime(
    nextInput: Omit<ProjectInstanceManagementOptions, "workspaces">,
    nextActions: InstanceManagementIntentActions,
  ) {
    input = nextInput;
    actions = nextActions;
    publish();
  }

  function updateWorkspace(
    role: "apps" | "routes",
    controller: GeneratedWorkspaceRuntimeController | undefined,
  ) {
    workspaces[role] = controller;
    publish();
  }

  function publish() {
    if (disposed || !input || !actions) {
      return;
    }

    const apps = workspaces.apps?.publication;
    const routes = workspaces.routes?.publication;
    projection = projectInstanceManagement({
      ...input,
      ...(apps && routes
        ? {
            workspaces: {
              apps: apps.workspaceReference,
              routes: routes.workspaceReference,
            },
          }
        : {}),
    });
    application.publish(
      INSTANCE_MANAGEMENT_CONTRIBUTOR_ID,
      prepareInstanceManagementRuntimePublication({
        apps,
        dispatch: dispatchManagementIntent,
        projection,
        routes,
      }),
    );
  }

  async function dispatchManagementIntent(intent: PresentationIntent) {
    if (!isManagementIntent(intent) || !projection || !actions) {
      return;
    }
    await dispatchInstanceManagementIntent(projection, intent, actions);
  }
}

export function prepareInstanceManagementRuntimePublication({
  apps,
  dispatch,
  projection,
  routes,
}: {
  apps: GeneratedWorkspaceRuntimeController["publication"];
  dispatch: (intent: PresentationIntent) => Promise<void> | void;
  projection: InstanceManagementProjection;
  routes: GeneratedWorkspaceRuntimeController["publication"];
}): ApplicationRuntimeContractPublication {
  const managementNodes: PresentationNodeSet = [
    { reference: instanceManagementReference, snapshot: projection.manifest },
    ...(projection.dialog === undefined
      ? []
      : [
          {
            reference: instanceManagementInstallDialogReference,
            snapshot: projection.dialog,
          },
        ]),
  ];

  return {
    intentHandlers: [
      {
        dispatch,
        matches: (intent) =>
          isManagementIntent(intent) &&
          intent.managementId === instanceManagementReference.managementId,
      },
      ...(apps?.intentHandlers ?? []),
      ...(routes?.intentHandlers ?? []),
    ],
    nodes: [...managementNodes, ...(apps?.nodes ?? []), ...(routes?.nodes ?? [])],
  };
}

export function InstanceManagementRuntime({
  installDialogOpen,
  installDrafts,
  onInstallDialogOpenChange,
  onInstallDraftChange,
  onInstallPackageSelection,
  onInstallSubmit,
  onOpenWorkspaceAuthorization,
  onPollWorkspaceOperation,
  onStartWorkspacePush,
  selectedPackageAppKey,
  state,
  workspaceGatewayState,
}: {
  installDialogOpen: boolean;
  installDrafts: PackageInstallDrafts;
  onInstallDialogOpenChange: (open: boolean) => void;
  onInstallDraftChange: (packageAppKey: PackageAppKey, draft: PackageInstallDraft) => void;
  onInstallPackageSelection: (packageAppKey: PackageAppKey) => void;
  onInstallSubmit: (packageAppKey: PackageAppKey) => Promise<void> | void;
  onOpenWorkspaceAuthorization: (url: string) => void;
  onPollWorkspaceOperation: (operationId: string, operationKind: "push") => Promise<void> | void;
  onStartWorkspacePush: () => Promise<void> | void;
  selectedPackageAppKey?: PackageAppKey | undefined;
  state: InstanceShellRouteState;
  workspaceGatewayState: WorkspaceGatewayRouteState;
}) {
  const application = useApplicationRuntimePublicationCoordinatorContext();
  const [publicationController] = useState(() =>
    createInstanceManagementRuntimePublicationController(application),
  );
  const [controlPlaneLoadError, setControlPlaneLoadError] = useState<string>();
  const controlPlaneTarget = useMemo(() => instanceControlPlaneClientTarget(), []);
  const actions = useMemo<InstanceManagementIntentActions>(
    () => ({
      changeInstallDialogOpen: onInstallDialogOpenChange,
      changeInstallDraft: onInstallDraftChange,
      openAuthorization: onOpenWorkspaceAuthorization,
      pollWorkspaceOperation: onPollWorkspaceOperation,
      selectInstallPackage: onInstallPackageSelection,
      startWorkspacePush: onStartWorkspacePush,
      submitInstall: onInstallSubmit,
    }),
    [
      onInstallDialogOpenChange,
      onInstallDraftChange,
      onInstallPackageSelection,
      onInstallSubmit,
      onOpenWorkspaceAuthorization,
      onPollWorkspaceOperation,
      onStartWorkspacePush,
    ],
  );
  const registerApps = useCallback(
    (controller: GeneratedWorkspaceRuntimeController | undefined) =>
      publicationController.updateWorkspace("apps", controller),
    [publicationController],
  );
  const registerRoutes = useCallback(
    (controller: GeneratedWorkspaceRuntimeController | undefined) =>
      publicationController.updateWorkspace("routes", controller),
    [publicationController],
  );
  const updateControlPlaneLoadState = useCallback((loadState: HomeRouteClientLoadState) => {
    setControlPlaneLoadError(loadState.state === "failed" ? loadState.message : undefined);
  }, []);

  useLayoutEffect(() => {
    publicationController.updateRuntime(
      {
        ...(controlPlaneLoadError === undefined ? {} : { controlPlaneLoadError }),
        installDialogOpen,
        installDrafts,
        selectedPackageAppKey,
        state,
        workspaceGatewayState,
      },
      actions,
    );
  }, [
    actions,
    controlPlaneLoadError,
    installDialogOpen,
    installDrafts,
    publicationController,
    selectedPackageAppKey,
    state,
    workspaceGatewayState,
  ]);

  useLayoutEffect(() => {
    publicationController.activate();
    return () => publicationController.dispose();
  }, [publicationController]);

  return (
    <>
      <HomeRoute
        clientSync
        onClientLoadStateChange={updateControlPlaneLoadState}
        onGeneratedWorkspaceController={registerApps}
        schemaKey={INSTANCE_CONTROL_PLANE_SCHEMA_KEY}
        screenPath="/"
        sectionExternalActions={{
          "app-installs": [
            {
              action: {
                disabled: state.status !== "ready" || state.installing,
                id: "install",
                icon: "add",
                invocationSource: "button",
                invoke: { controlId: "install", invocationSource: "button" },
                kind: "actionTrigger",
                label: "Install",
              },
              onIntent: () => onInstallDialogOpenChange(true),
            },
          ],
        }}
        target={controlPlaneTarget}
      />
      <HomeRoute
        clientSync={false}
        onGeneratedWorkspaceController={registerRoutes}
        schemaKey={INSTANCE_CONTROL_PLANE_SCHEMA_KEY}
        screenPath="/routes"
        target={controlPlaneTarget}
      />
      <ApplicationPresentation
        presentation={{
          kind: "management",
          managementReference: instanceManagementReference,
        }}
      />
    </>
  );
}
