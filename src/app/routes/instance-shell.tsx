import { useEffect, useMemo, useState } from "react";
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
import { AddIcon, RemoveIcon } from "@dpeek/formless-ui/icons";
import {
  AppInstallApiError,
  createInstanceAppInstall,
  fetchInstanceAppInstalls,
} from "../../client/app-installs.ts";
import { instanceControlPlaneClientTarget } from "../../client/app-target.ts";
import { fetchInstanceDomainMappings } from "../../client/domain-mappings.ts";
import {
  applyInstanceDomainProviderPlan,
  deleteInstanceDomainProviderResource,
  DomainProviderApiError,
  fetchInstanceDomainProviderApplyJob,
  fetchInstanceDomainProviderDeleteJob,
  fetchInstanceDomainProviderPlan,
  fetchInstanceDomainProviderRedirects,
  markInstanceDomainProviderResourceManuallyRemoved,
} from "../../client/domain-provider.ts";
import {
  DeploymentRuntimeApiError,
  fetchInstanceDeploymentStatus,
} from "../../client/deployment-runtime.ts";
import type { AppInstall, BundledAppPackage, PackageAppKey } from "../../shared/app-installs.ts";
import {
  deploymentStatusDisplaySummary,
  type InstanceDeploymentStatusResponse,
} from "../../shared/deployment-runtime.ts";
import { INSTANCE_CONTROL_PLANE_SCHEMA_KEY } from "../../shared/instance-control-plane.ts";
import type {
  InstanceDomainProviderAppliedResourceState,
  InstanceDomainProviderApplyJob,
  InstanceDomainProviderDeleteJob,
  InstanceDomainProviderDeleteTarget,
  InstanceDomainProviderPlanResponse,
} from "../../shared/domain-provider-api.ts";
import type { InstanceDomainMappingAppliedState } from "../../shared/instance-domain-mappings.ts";
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
      domainProviderApplying?: boolean;
      domainProviderApplyError?: string;
      domainProviderCleanupError?: string;
      domainProviderCleanupKey?: string;
      domainProviderCleanupMessage?: string;
      domainProviderApplyJob?: InstanceDomainProviderApplyJob;
      domainProviderDeleteJob?: InstanceDomainProviderDeleteJob;
      domainProviderDeleteError?: string;
      domainProviderDeleteMessage?: string;
      domainProviderDeletingKey?: string;
      domainProviderPlan?: InstanceDomainProviderPlanResponse;
      domainProviderPlanError?: string;
      domainProviderPlanLoading?: boolean;
      deploymentStatus?: InstanceDeploymentStatusResponse;
      installError?: string;
      installErrorPackageAppKey?: PackageAppKey;
      installing: boolean;
      installingPackageAppKey?: PackageAppKey;
      installs: AppInstall[];
      packages: BundledAppPackage[];
      status: "ready";
    };

export function InstanceShellRoute() {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<InstanceShellRouteState>({ status: "loading" });
  const [installDrafts, setInstallDrafts] = useState<PackageInstallDrafts>({});

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;

    async function loadInstalls() {
      try {
        const [
          appResponse,
          domainResponse,
          redirectResponse,
          providerPlanResponse,
          deploymentStatus,
        ] = await Promise.all([
          fetchInstanceAppInstalls({ signal: controller.signal }),
          fetchInstanceDomainMappings({ signal: controller.signal }),
          fetchInstanceDomainProviderRedirects({ signal: controller.signal }),
          fetchInstanceDomainProviderPlan({ signal: controller.signal }),
          fetchOptionalInstanceDeploymentStatus(controller.signal),
        ]);

        if (stopped) {
          return;
        }

        setState({
          domainAppliedStates: domainResponse.appliedStates,
          domainProviderAppliedResources: redirectResponse.appliedResources,
          domainProviderApplying: false,
          domainProviderDeletingKey: undefined,
          domainProviderPlan: providerPlanResponse,
          domainProviderPlanLoading: false,
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
  }, []);

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
        domainProviderApplying: state.domainProviderApplying,
        domainProviderApplyError: state.domainProviderApplyError,
        domainProviderApplyJob: state.domainProviderApplyJob,
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

  async function submitApplyDomainProviderPlan() {
    if (state.status !== "ready" || state.domainProviderApplying) {
      return;
    }

    if (!window.confirm("Apply domain provider plan?")) {
      return;
    }

    setState({
      ...state,
      domainProviderApplyError: undefined,
      domainProviderApplying: true,
    });

    try {
      const response = await applyInstanceDomainProviderPlan();

      setState({
        ...state,
        domainProviderApplying: false,
        domainProviderApplyError: response.status === "ready" ? undefined : response.error,
        domainProviderApplyJob:
          response.status === "ready" ? response.job : state.domainProviderApplyJob,
        domainProviderPlan: {
          config: response.config,
          plan: response.plan,
          redirectIntents: state.domainProviderPlan?.redirectIntents ?? [],
        },
      });
    } catch (error) {
      const message =
        error instanceof DomainProviderApiError || error instanceof Error
          ? error.message
          : "Provider apply failed.";

      setState({
        ...state,
        domainProviderApplying: false,
        domainProviderApplyError: message,
      });
    }
  }

  async function refreshDomainProviderApplyJob() {
    if (state.status !== "ready" || !state.domainProviderApplyJob) {
      return;
    }

    try {
      const response = await fetchInstanceDomainProviderApplyJob({
        jobId: state.domainProviderApplyJob.jobId,
      });

      setState({
        ...state,
        domainProviderApplyError: undefined,
        domainProviderApplyJob: response.job,
      });
    } catch (error) {
      const message =
        error instanceof DomainProviderApiError || error instanceof Error
          ? error.message
          : "Provider apply job refresh failed.";

      setState({
        ...state,
        domainProviderApplyError: message,
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
      installDrafts={installDrafts}
      onDeleteDomainProviderResource={submitDeleteDomainProviderResource}
      onMarkDomainProviderResourceManuallyRemoved={submitMarkDomainProviderResourceManuallyRemoved}
      onRefreshDomainProviderApplyJob={refreshDomainProviderApplyJob}
      onRefreshDomainProviderDeleteJob={refreshDomainProviderDeleteJob}
      onRefreshDomainProviderPlan={refreshDomainProviderPlan}
      onSubmitDomainProviderApply={submitApplyDomainProviderPlan}
      onInstallDraftChange={(packageAppKey, draft) =>
        setInstallDrafts((current) => ({
          ...current,
          [packageAppKey]: draft,
        }))
      }
      onSubmitInstall={submitInstall}
      state={state}
    />
  );
}

async function fetchOptionalInstanceDeploymentStatus(
  signal: AbortSignal,
): Promise<InstanceDeploymentStatusResponse | undefined> {
  try {
    return await fetchInstanceDeploymentStatus({ signal });
  } catch (error) {
    if (error instanceof DeploymentRuntimeApiError && error.status === 404) {
      return undefined;
    }

    throw error;
  }
}

export function InstanceShellRouteView({
  installDrafts = {},
  onDeleteDomainProviderResource,
  onMarkDomainProviderResourceManuallyRemoved,
  onRefreshDomainProviderApplyJob,
  onRefreshDomainProviderDeleteJob,
  onRefreshDomainProviderPlan,
  onSubmitDomainProviderApply,
  onInstallDraftChange,
  onSubmitInstall,
  state,
}: {
  installDrafts?: PackageInstallDrafts;
  onDeleteDomainProviderResource?: (input: DomainProviderDeleteActionInput) => void;
  onMarkDomainProviderResourceManuallyRemoved?: (input: DomainProviderCleanupActionInput) => void;
  onRefreshDomainProviderApplyJob?: () => void;
  onRefreshDomainProviderDeleteJob?: () => void;
  onRefreshDomainProviderPlan?: () => void;
  onSubmitDomainProviderApply?: () => void;
  onInstallDraftChange?: (packageAppKey: PackageAppKey, draft: PackageInstallDraft) => void;
  onSubmitInstall?: (packageAppKey: PackageAppKey, event: React.FormEvent<HTMLFormElement>) => void;
  state: InstanceShellRouteState;
}) {
  const [installDialogOpen, setInstallDialogOpen] = useState(false);

  if (state.status === "loading") {
    return (
      <section className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
        <ShellHeader />
        <p className="text-sm text-muted-fg">Loading installed apps...</p>
      </section>
    );
  }

  if (state.status === "failed") {
    return (
      <section className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
        <ShellHeader />
        <p className="text-sm text-red-700" role="alert">
          {state.message}
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <ShellHeader />
      <GeneratedInstanceAppsSection
        installDisabled={state.installing || state.packages.length === 0}
        onInstall={() => setInstallDialogOpen(true)}
      />
      <GeneratedInstanceRoutesSection />
      <RouteProviderOperationsSection
        onDeleteProvider={onDeleteDomainProviderResource}
        onManualCleanup={onMarkDomainProviderResourceManuallyRemoved}
        onRefreshApplyJob={onRefreshDomainProviderApplyJob}
        onRefreshDeleteJob={onRefreshDomainProviderDeleteJob}
        onRefreshPlan={onRefreshDomainProviderPlan}
        onSubmitProviderApply={onSubmitDomainProviderApply}
        state={state}
      />
      <GeneratedDeploymentManagementSection deploymentStatus={state.deploymentStatus} />
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

function GeneratedDeploymentManagementSection({
  deploymentStatus,
}: {
  deploymentStatus?: InstanceDeploymentStatusResponse;
}) {
  const controlPlaneTarget = useMemo(() => instanceControlPlaneClientTarget(), []);
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
            <p className="text-xs text-muted-fg">Control-plane deployment records</p>
          ) : (
            <p className="text-xs text-muted-fg">
              {deploymentSummary.label} · {deploymentSummary.detail}
            </p>
          )}
        </div>
      </div>
      <div data-formless-control-plane-screen="deployments">
        <HomeRoute
          schemaKey={INSTANCE_CONTROL_PLANE_SCHEMA_KEY}
          screenPath="/deployments"
          target={controlPlaneTarget}
        />
      </div>
    </section>
  );
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
  onRefreshApplyJob,
  onRefreshDeleteJob,
  onRefreshPlan,
  onSubmitProviderApply,
  state,
}: {
  onDeleteProvider?: (input: DomainProviderDeleteActionInput) => void;
  onManualCleanup?: (input: DomainProviderCleanupActionInput) => void;
  onRefreshApplyJob?: () => void;
  onRefreshDeleteJob?: () => void;
  onRefreshPlan?: () => void;
  onSubmitProviderApply?: () => void;
  state: Extract<InstanceShellRouteState, { status: "ready" }>;
}) {
  const providerAppliedResources = state.domainProviderAppliedResources ?? [];
  const providerPlanLoading = state.domainProviderPlanLoading ?? false;
  const providerApplying = state.domainProviderApplying ?? false;
  const providerApplyDisabled =
    providerPlanLoading ||
    providerApplying ||
    state.domainProviderPlan === undefined ||
    !state.domainProviderPlan.config.jobReady ||
    state.domainProviderPlan.plan.blockers.length > 0;
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
        applyDisabled={providerApplyDisabled}
        applying={providerApplying}
        deleteJob={state.domainProviderDeleteJob}
        deploymentStatus={state.deploymentStatus}
        onApply={onSubmitProviderApply}
        onRefreshApplyJob={onRefreshApplyJob}
        onRefreshDeleteJob={onRefreshDeleteJob}
        onRefreshPlan={onRefreshPlan}
        plan={state.domainProviderPlan}
        planLoading={providerPlanLoading}
        refreshError={state.domainProviderPlanError}
        applyError={state.domainProviderApplyError}
        applyJob={state.domainProviderApplyJob}
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
  applyDisabled,
  applying,
  applyError,
  applyJob,
  deleteJob,
  deploymentStatus,
  onApply,
  onRefreshApplyJob,
  onRefreshDeleteJob,
  onRefreshPlan,
  plan,
  planLoading,
  refreshError,
}: {
  applyDisabled: boolean;
  applying: boolean;
  applyError?: string;
  applyJob?: InstanceDomainProviderApplyJob;
  deleteJob?: InstanceDomainProviderDeleteJob;
  deploymentStatus?: InstanceDeploymentStatusResponse;
  onApply?: () => void;
  onRefreshApplyJob?: () => void;
  onRefreshDeleteJob?: () => void;
  onRefreshPlan?: () => void;
  plan?: InstanceDomainProviderPlanResponse;
  planLoading: boolean;
  refreshError?: string;
}) {
  const deploymentSummary =
    deploymentStatus === undefined
      ? undefined
      : deploymentStatusDisplaySummary(deploymentStatus.status);

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
            {deploymentSummary === undefined ? null : (
              <p>
                Deployment {deploymentSummary.label} · {deploymentSummary.detail}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-fg">Provider plan unavailable.</p>
        )}
        {applyJob ? (
          <DomainProviderJobStatus
            jobId={applyJob.jobId}
            kind="Apply"
            onRefresh={onRefreshApplyJob}
            result={applyJob.result}
            status={applyJob.status}
          />
        ) : null}
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
        {applyError ? (
          <p className={fieldErrorStyles()} data-slot="field-error" role="alert">
            {applyError}
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
        <Button isDisabled={applyDisabled || !onApply} onPress={onApply} size="sm" type="button">
          {applying ? "Applying..." : "Apply provider"}
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
  status: InstanceDomainProviderApplyJob["status"];
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

function ShellHeader() {
  return (
    <header className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-fg">Formless</p>
      <h1 className="text-2xl font-semibold">Instance</h1>
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
          Choose a bundled app type, then set its instance label and install id.
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
  packages: readonly BundledAppPackage[];
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
  appPackage: BundledAppPackage;
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
  packages: readonly BundledAppPackage[];
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

function availableDefaultInstallId(appPackage: BundledAppPackage, installs: readonly AppInstall[]) {
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
  if (plan.config.jobReady) {
    return "jobs ready";
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
