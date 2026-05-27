import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@dpeek/formless-ui/button";
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
  createInstanceDomainMapping,
  deleteInstanceDomainMapping,
  DomainMappingApiError,
  fetchInstanceDomainMappings,
} from "../../client/domain-mappings.ts";
import {
  applyInstanceDomainProviderPlan,
  createInstanceDomainProviderRedirect,
  deleteInstanceDomainProviderResource,
  deleteInstanceDomainProviderRedirect,
  DomainProviderApiError,
  fetchInstanceDomainProviderApplyJob,
  fetchInstanceDomainProviderDeleteJob,
  fetchInstanceDomainProviderPlan,
  fetchInstanceDomainProviderRedirects,
} from "../../client/domain-provider.ts";
import type { AppInstall, BundledAppPackage, PackageAppKey } from "../../shared/app-installs.ts";
import type {
  InstanceDomainProviderAppliedResourceState,
  InstanceDomainProviderApplyJob,
  InstanceDomainProviderDeleteJob,
  InstanceDomainProviderPlanResponse,
  InstanceDomainProviderRedirectIntent,
} from "../../shared/domain-provider-api.ts";
import type {
  InstanceDomainMapping,
  InstanceDomainMappingAppliedState,
  InstanceDomainMappingProfile,
} from "../../shared/instance-domain-mappings.ts";

export type PackageInstallDraft = {
  installId: string;
  label: string;
};

export type PackageInstallDrafts = Partial<Record<PackageAppKey, PackageInstallDraft>>;

export type DomainMappingDraft = {
  host: string;
  profile: InstanceDomainMappingProfile;
  targetInstallId: string;
};

export type DomainRedirectDraft = {
  fromHost: string;
  targetMode: "host" | "url";
  toHost: string;
  toUrl: string;
};

export type InstanceShellRouteState =
  | { status: "failed"; message: string }
  | { status: "loading" }
  | {
      domainAppliedStates: InstanceDomainMappingAppliedState[];
      domainMappingDeletingKey?: string;
      domainMappingError?: string;
      domainMappingSubmitting: boolean;
      domainMappings: InstanceDomainMapping[];
      domainProviderAppliedResources?: InstanceDomainProviderAppliedResourceState[];
      domainProviderApplying?: boolean;
      domainProviderApplyError?: string;
      domainProviderApplyJob?: InstanceDomainProviderApplyJob;
      domainProviderDeleteJob?: InstanceDomainProviderDeleteJob;
      domainProviderDeleteError?: string;
      domainProviderDeleteMessage?: string;
      domainProviderDeletingKey?: string;
      domainProviderPlan?: InstanceDomainProviderPlanResponse;
      domainProviderPlanError?: string;
      domainProviderPlanLoading?: boolean;
      domainRedirectDeletingKey?: string;
      domainRedirectDraftError?: string;
      domainRedirectIntents: InstanceDomainProviderRedirectIntent[];
      domainRedirectSubmitting: boolean;
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
  const [domainDraft, setDomainDraft] = useState<DomainMappingDraft>({
    host: "",
    profile: "publicSite",
    targetInstallId: "",
  });
  const [domainRedirectDraft, setDomainRedirectDraft] = useState<DomainRedirectDraft>({
    fromHost: "",
    targetMode: "host",
    toHost: "",
    toUrl: "",
  });

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;

    async function loadInstalls() {
      try {
        const [appResponse, domainResponse, redirectResponse, providerPlanResponse] =
          await Promise.all([
            fetchInstanceAppInstalls({ signal: controller.signal }),
            fetchInstanceDomainMappings({ signal: controller.signal }),
            fetchInstanceDomainProviderRedirects({ signal: controller.signal }),
            fetchInstanceDomainProviderPlan({ signal: controller.signal }),
          ]);

        if (stopped) {
          return;
        }

        setState({
          domainAppliedStates: domainResponse.appliedStates,
          domainMappingDeletingKey: undefined,
          domainMappingSubmitting: false,
          domainMappings: domainResponse.mappings,
          domainProviderAppliedResources: redirectResponse.appliedResources,
          domainProviderApplying: false,
          domainProviderDeletingKey: undefined,
          domainProviderPlan: providerPlanResponse,
          domainProviderPlanLoading: false,
          domainRedirectDeletingKey: undefined,
          domainRedirectIntents: redirectResponse.redirectIntents,
          domainRedirectSubmitting: false,
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
        setDomainDraft((current) =>
          initializeDomainMappingDraft({
            currentDraft: current,
            installs: appResponse.installs,
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
        domainMappingDeletingKey: state.domainMappingDeletingKey,
        domainMappingError: state.domainMappingError,
        domainMappingSubmitting: false,
        domainMappings: state.domainMappings,
        domainProviderAppliedResources: state.domainProviderAppliedResources,
        domainProviderApplying: state.domainProviderApplying,
        domainProviderApplyError: state.domainProviderApplyError,
        domainProviderApplyJob: state.domainProviderApplyJob,
        domainProviderDeleteJob: state.domainProviderDeleteJob,
        domainProviderDeleteError: state.domainProviderDeleteError,
        domainProviderDeleteMessage: state.domainProviderDeleteMessage,
        domainProviderDeletingKey: state.domainProviderDeletingKey,
        domainProviderPlan: state.domainProviderPlan,
        domainProviderPlanError: state.domainProviderPlanError,
        domainProviderPlanLoading: state.domainProviderPlanLoading,
        domainRedirectDeletingKey: state.domainRedirectDeletingKey,
        domainRedirectDraftError: state.domainRedirectDraftError,
        domainRedirectIntents: state.domainRedirectIntents,
        domainRedirectSubmitting: state.domainRedirectSubmitting,
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
      setDomainDraft((current) =>
        initializeDomainMappingDraft({
          currentDraft: current,
          installs: response.installs,
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

  async function submitDomainMapping(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.status !== "ready" || state.domainMappingSubmitting) {
      return;
    }

    setState({
      ...state,
      domainMappingError: undefined,
      domainMappingSubmitting: true,
    });

    try {
      const normalizedDraft = initializeDomainMappingDraft({
        currentDraft: domainDraft,
        installs: state.installs,
      });
      const response = await createInstanceDomainMapping({
        enabled: true,
        host: normalizedDraft.host,
        profile: normalizedDraft.profile,
        ...(normalizedDraft.profile === "instance"
          ? {}
          : { targetInstallId: normalizedDraft.targetInstallId }),
      });

      setState({
        ...state,
        domainMappingDeletingKey: undefined,
        domainMappingError: undefined,
        domainMappingSubmitting: false,
        domainMappings: response.mappings,
      });
      setDomainDraft((current) => ({
        host: "",
        profile: current.profile,
        targetInstallId: current.targetInstallId,
      }));
    } catch (error) {
      const message =
        error instanceof DomainMappingApiError || error instanceof Error
          ? error.message
          : "Domain mapping failed.";

      setState({
        ...state,
        domainMappingError: message,
        domainMappingSubmitting: false,
      });
    }
  }

  async function submitDeleteDomainMapping(mapping: InstanceDomainMapping) {
    if (
      state.status !== "ready" ||
      state.domainMappingSubmitting ||
      state.domainMappingDeletingKey
    ) {
      return;
    }

    if (!window.confirm(`Remove desired mapping for ${mapping.host}?`)) {
      return;
    }

    const key = domainMappingKey(mapping);

    setState({
      ...state,
      domainMappingDeletingKey: key,
      domainMappingError: undefined,
    });

    try {
      const response = await deleteInstanceDomainMapping({
        host: mapping.host,
        profile: mapping.profile,
      });

      setState({
        ...state,
        domainMappingDeletingKey: undefined,
        domainMappingError: undefined,
        domainMappingSubmitting: false,
        domainMappings: response.mappings,
      });
    } catch (error) {
      const message =
        error instanceof DomainMappingApiError || error instanceof Error
          ? error.message
          : "Domain mapping delete failed.";

      setState({
        ...state,
        domainMappingDeletingKey: undefined,
        domainMappingError: message,
      });
    }
  }

  async function submitDomainRedirect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.status !== "ready" || state.domainRedirectSubmitting) {
      return;
    }

    setState({
      ...state,
      domainRedirectDraftError: undefined,
      domainRedirectSubmitting: true,
    });

    try {
      const response = await createInstanceDomainProviderRedirect({
        enabled: true,
        fromHost: domainRedirectDraft.fromHost,
        preservePath: true,
        preserveQueryString: true,
        statusCode: 301,
        ...(domainRedirectDraft.targetMode === "host"
          ? { toHost: domainRedirectDraft.toHost }
          : { toUrl: domainRedirectDraft.toUrl }),
      });

      setState({
        ...state,
        domainRedirectDeletingKey: undefined,
        domainRedirectDraftError: undefined,
        domainRedirectIntents: response.redirectIntents,
        domainRedirectSubmitting: false,
      });
      setDomainRedirectDraft((current) => ({
        fromHost: "",
        targetMode: current.targetMode,
        toHost: "",
        toUrl: "",
      }));
    } catch (error) {
      const message =
        error instanceof DomainProviderApiError || error instanceof Error
          ? error.message
          : "Domain redirect failed.";

      setState({
        ...state,
        domainRedirectDraftError: message,
        domainRedirectSubmitting: false,
      });
    }
  }

  async function submitDeleteDomainRedirect(redirect: InstanceDomainProviderRedirectIntent) {
    if (
      state.status !== "ready" ||
      state.domainRedirectSubmitting ||
      state.domainRedirectDeletingKey
    ) {
      return;
    }

    if (!window.confirm(`Remove desired redirect for ${redirect.fromHost}?`)) {
      return;
    }

    setState({
      ...state,
      domainRedirectDeletingKey: redirect.fromHost,
      domainRedirectDraftError: undefined,
    });

    try {
      const response = await deleteInstanceDomainProviderRedirect({
        fromHost: redirect.fromHost,
      });

      setState({
        ...state,
        domainRedirectDeletingKey: undefined,
        domainRedirectDraftError: undefined,
        domainRedirectIntents: response.redirectIntents,
        domainRedirectSubmitting: false,
      });
    } catch (error) {
      const message =
        error instanceof DomainProviderApiError || error instanceof Error
          ? error.message
          : "Domain redirect delete failed.";

      setState({
        ...state,
        domainRedirectDeletingKey: undefined,
        domainRedirectDraftError: message,
      });
    }
  }

  async function submitDeleteDomainProviderResource(input: {
    host: string;
    kind?: InstanceDomainProviderAppliedResourceState["kind"];
    logicalId?: string;
  }) {
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
          redirectIntents: state.domainProviderPlan?.redirectIntents ?? state.domainRedirectIntents,
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
      domainDraft={domainDraft}
      domainRedirectDraft={domainRedirectDraft}
      installDrafts={installDrafts}
      onDomainDraftChange={setDomainDraft}
      onDomainRedirectDraftChange={setDomainRedirectDraft}
      onDeleteDomainRedirect={submitDeleteDomainRedirect}
      onDeleteDomainMapping={submitDeleteDomainMapping}
      onDeleteDomainProviderResource={submitDeleteDomainProviderResource}
      onRefreshDomainProviderApplyJob={refreshDomainProviderApplyJob}
      onRefreshDomainProviderDeleteJob={refreshDomainProviderDeleteJob}
      onRefreshDomainProviderPlan={refreshDomainProviderPlan}
      onSubmitDomainProviderApply={submitApplyDomainProviderPlan}
      onSubmitDomainRedirect={submitDomainRedirect}
      onSubmitDomainMapping={submitDomainMapping}
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

export function InstanceShellRouteView({
  domainDraft,
  domainRedirectDraft,
  installDrafts = {},
  onDomainDraftChange,
  onDomainRedirectDraftChange,
  onDeleteDomainRedirect,
  onDeleteDomainMapping,
  onDeleteDomainProviderResource,
  onRefreshDomainProviderApplyJob,
  onRefreshDomainProviderDeleteJob,
  onRefreshDomainProviderPlan,
  onSubmitDomainProviderApply,
  onSubmitDomainRedirect,
  onSubmitDomainMapping,
  onInstallDraftChange,
  onSubmitInstall,
  state,
}: {
  domainDraft?: DomainMappingDraft;
  domainRedirectDraft?: DomainRedirectDraft;
  installDrafts?: PackageInstallDrafts;
  onDomainDraftChange?: (draft: DomainMappingDraft) => void;
  onDomainRedirectDraftChange?: (draft: DomainRedirectDraft) => void;
  onDeleteDomainRedirect?: (redirect: InstanceDomainProviderRedirectIntent) => void;
  onDeleteDomainMapping?: (mapping: InstanceDomainMapping) => void;
  onDeleteDomainProviderResource?: (input: {
    host: string;
    kind?: InstanceDomainProviderAppliedResourceState["kind"];
    logicalId?: string;
  }) => void;
  onRefreshDomainProviderApplyJob?: () => void;
  onRefreshDomainProviderDeleteJob?: () => void;
  onRefreshDomainProviderPlan?: () => void;
  onSubmitDomainProviderApply?: () => void;
  onSubmitDomainRedirect?: (event: React.FormEvent<HTMLFormElement>) => void;
  onSubmitDomainMapping?: (event: React.FormEvent<HTMLFormElement>) => void;
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
      <section className="space-y-3" aria-labelledby="installed-apps-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
          <div className="flex items-center gap-2">
            <h2 id="installed-apps-heading" className="text-sm font-semibold">
              Installed apps
            </h2>
            <span className="text-xs text-muted-fg">{state.installs.length}</span>
          </div>
          <Button
            aria-haspopup="dialog"
            isDisabled={state.installing || state.packages.length === 0}
            onPress={() => setInstallDialogOpen(true)}
            size="sm"
            type="button"
          >
            <AddIcon />
            Install
          </Button>
        </div>
        {state.installs.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-overlay p-4 text-sm text-muted-fg">
            No installed apps.
          </div>
        ) : (
          <div className="grid gap-3">
            {state.installs.map((install) => (
              <InstalledAppRow install={install} key={install.installId} />
            ))}
          </div>
        )}
      </section>
      <CustomDomainsSection
        draft={
          domainDraft ??
          initializeDomainMappingDraft({
            currentDraft: { host: "", profile: "publicSite", targetInstallId: "" },
            installs: state.installs,
          })
        }
        onDraftChange={onDomainDraftChange}
        onDelete={onDeleteDomainMapping}
        onDeleteProvider={onDeleteDomainProviderResource}
        onDeleteRedirect={onDeleteDomainRedirect}
        onRefreshApplyJob={onRefreshDomainProviderApplyJob}
        onRefreshDeleteJob={onRefreshDomainProviderDeleteJob}
        onRefreshPlan={onRefreshDomainProviderPlan}
        onRedirectDraftChange={onDomainRedirectDraftChange}
        onRedirectSubmit={onSubmitDomainRedirect}
        onSubmitProviderApply={onSubmitDomainProviderApply}
        redirectDraft={
          domainRedirectDraft ?? { fromHost: "", targetMode: "host", toHost: "", toUrl: "" }
        }
        onSubmit={onSubmitDomainMapping}
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

function CustomDomainsSection({
  draft,
  onDraftChange,
  onDelete,
  onDeleteProvider,
  onDeleteRedirect,
  onRefreshApplyJob,
  onRefreshDeleteJob,
  onRefreshPlan,
  onRedirectDraftChange,
  onRedirectSubmit,
  onSubmitProviderApply,
  redirectDraft,
  onSubmit,
  state,
}: {
  draft: DomainMappingDraft;
  onDraftChange?: (draft: DomainMappingDraft) => void;
  onDelete?: (mapping: InstanceDomainMapping) => void;
  onDeleteProvider?: (input: {
    host: string;
    kind?: InstanceDomainProviderAppliedResourceState["kind"];
    logicalId?: string;
  }) => void;
  onDeleteRedirect?: (redirect: InstanceDomainProviderRedirectIntent) => void;
  onRefreshApplyJob?: () => void;
  onRefreshDeleteJob?: () => void;
  onRefreshPlan?: () => void;
  onRedirectDraftChange?: (draft: DomainRedirectDraft) => void;
  onRedirectSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  onSubmitProviderApply?: () => void;
  redirectDraft: DomainRedirectDraft;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  state: Extract<InstanceShellRouteState, { status: "ready" }>;
}) {
  const hostInputId = useMemo(() => "domain-mapping-host", []);
  const profileSelectId = useMemo(() => "domain-mapping-profile", []);
  const targetSelectId = useMemo(() => "domain-mapping-target", []);
  const redirectFromInputId = useMemo(() => "domain-redirect-from-host", []);
  const redirectModeSelectId = useMemo(() => "domain-redirect-target-mode", []);
  const redirectTargetInputId = useMemo(() => "domain-redirect-target", []);
  const normalizedDraft = initializeDomainMappingDraft({
    currentDraft: draft,
    installs: state.installs,
  });
  const targetInstalls = domainTargetInstalls(normalizedDraft.profile, state.installs);
  const isDisabled =
    state.domainMappingSubmitting ||
    state.domainMappingDeletingKey !== undefined ||
    (normalizedDraft.profile !== "instance" && targetInstalls.length === 0);
  const orphanAppliedStates = state.domainAppliedStates.filter(
    (appliedState) =>
      !state.domainMappings.some(
        (mapping) => mapping.host === appliedState.host && mapping.profile === appliedState.profile,
      ),
  );
  const providerAppliedResources = state.domainProviderAppliedResources ?? [];
  const redirectDisabled =
    state.domainRedirectSubmitting || state.domainRedirectDeletingKey !== undefined;
  const providerPlanLoading = state.domainProviderPlanLoading ?? false;
  const providerApplying = state.domainProviderApplying ?? false;
  const providerApplyDisabled =
    providerPlanLoading ||
    providerApplying ||
    state.domainProviderPlan === undefined ||
    !state.domainProviderPlan.config.applyReady ||
    state.domainProviderPlan.plan.blockers.length > 0;

  return (
    <section className="space-y-3" aria-labelledby="custom-domains-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <h2 id="custom-domains-heading" className="text-sm font-semibold">
            Custom domains
          </h2>
          <span className="text-xs text-muted-fg">{state.domainMappings.length}</span>
        </div>
      </div>
      <DomainProviderControlPanel
        applyDisabled={providerApplyDisabled}
        applying={providerApplying}
        deleteJob={state.domainProviderDeleteJob}
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
      <form
        className="grid gap-3 rounded-md border border-border bg-overlay p-4 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,12rem)_minmax(12rem,16rem)_auto]"
        onSubmit={onSubmit}
      >
        <TextField
          isDisabled={state.domainMappingSubmitting}
          isRequired
          onChange={(host) => onDraftChange?.({ ...normalizedDraft, host })}
          value={normalizedDraft.host}
        >
          <Label htmlFor={hostInputId}>Hostname</Label>
          <Input id={hostInputId} placeholder="www.example.com" />
        </TextField>
        <div className="space-y-1">
          <Label htmlFor={profileSelectId}>Profile</Label>
          <NativeSelect>
            <NativeSelectContent
              disabled={state.domainMappingSubmitting}
              id={profileSelectId}
              onChange={(event) =>
                onDraftChange?.(
                  initializeDomainMappingDraft({
                    currentDraft: {
                      ...normalizedDraft,
                      profile: event.target.value as InstanceDomainMappingProfile,
                    },
                    installs: state.installs,
                  }),
                )
              }
              required
              value={normalizedDraft.profile}
            >
              {DOMAIN_PROFILE_OPTIONS.map((option) => (
                <option key={option.profile} value={option.profile}>
                  {option.label}
                </option>
              ))}
            </NativeSelectContent>
          </NativeSelect>
        </div>
        {normalizedDraft.profile === "instance" ? (
          <div className="space-y-1">
            <Label>Target</Label>
            <div className="flex min-h-9 items-center rounded-md border border-border bg-muted px-3 text-sm text-muted-fg">
              Instance
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <Label htmlFor={targetSelectId}>{domainTargetLabel(normalizedDraft.profile)}</Label>
            <NativeSelect>
              <NativeSelectContent
                disabled={isDisabled}
                id={targetSelectId}
                onChange={(event) =>
                  onDraftChange?.({ ...normalizedDraft, targetInstallId: event.target.value })
                }
                required
                value={normalizedDraft.targetInstallId}
              >
                {targetInstalls.map((install) => (
                  <option key={install.installId} value={install.installId}>
                    {install.label}
                  </option>
                ))}
              </NativeSelectContent>
            </NativeSelect>
          </div>
        )}
        <div className="flex items-end">
          <Button isDisabled={isDisabled} type="submit">
            <AddIcon />
            {state.domainMappingSubmitting ? "Adding..." : "Add"}
          </Button>
        </div>
        {state.domainMappingError ? (
          <p className={`${fieldErrorStyles()} sm:col-span-4`} data-slot="field-error" role="alert">
            {state.domainMappingError}
          </p>
        ) : null}
        {state.domainProviderDeleteError ? (
          <p className={`${fieldErrorStyles()} sm:col-span-4`} data-slot="field-error" role="alert">
            {state.domainProviderDeleteError}
          </p>
        ) : null}
        {state.domainProviderDeleteMessage ? (
          <p className="text-xs text-muted-fg sm:col-span-4" role="status">
            {state.domainProviderDeleteMessage}
          </p>
        ) : null}
      </form>
      <form
        className="grid gap-3 rounded-md border border-border bg-overlay p-4 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,10rem)_minmax(0,1fr)_auto]"
        onSubmit={onRedirectSubmit}
      >
        <TextField
          isDisabled={state.domainRedirectSubmitting}
          isRequired
          onChange={(fromHost) => onRedirectDraftChange?.({ ...redirectDraft, fromHost })}
          value={redirectDraft.fromHost}
        >
          <Label htmlFor={redirectFromInputId}>Redirect from</Label>
          <Input id={redirectFromInputId} placeholder="www.example.com" />
        </TextField>
        <div className="space-y-1">
          <Label htmlFor={redirectModeSelectId}>Target type</Label>
          <NativeSelect>
            <NativeSelectContent
              disabled={state.domainRedirectSubmitting}
              id={redirectModeSelectId}
              onChange={(event) =>
                onRedirectDraftChange?.({
                  ...redirectDraft,
                  targetMode: event.target.value === "url" ? "url" : "host",
                })
              }
              value={redirectDraft.targetMode}
            >
              <option value="host">Host</option>
              <option value="url">URL</option>
            </NativeSelectContent>
          </NativeSelect>
        </div>
        <TextField
          isDisabled={state.domainRedirectSubmitting}
          isRequired
          onChange={(target) =>
            onRedirectDraftChange?.(
              redirectDraft.targetMode === "host"
                ? { ...redirectDraft, toHost: target }
                : { ...redirectDraft, toUrl: target },
            )
          }
          value={redirectDraft.targetMode === "host" ? redirectDraft.toHost : redirectDraft.toUrl}
        >
          <Label htmlFor={redirectTargetInputId}>Redirect to</Label>
          <Input
            id={redirectTargetInputId}
            placeholder={
              redirectDraft.targetMode === "host" ? "example.com" : "https://example.com"
            }
          />
        </TextField>
        <div className="flex items-end">
          <Button isDisabled={redirectDisabled} type="submit">
            <AddIcon />
            {state.domainRedirectSubmitting ? "Adding..." : "Add redirect"}
          </Button>
        </div>
        {state.domainRedirectDraftError ? (
          <p className={`${fieldErrorStyles()} sm:col-span-4`} data-slot="field-error" role="alert">
            {state.domainRedirectDraftError}
          </p>
        ) : null}
      </form>
      {state.domainMappings.length === 0 && orphanAppliedStates.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-overlay p-4 text-sm text-muted-fg">
          No custom domains.
        </div>
      ) : (
        <div className="grid gap-3">
          {state.domainMappings.map((mapping) => (
            <DomainMappingRow
              appliedState={appliedStateForMapping(mapping, state.domainAppliedStates)}
              deleting={state.domainMappingDeletingKey === domainMappingKey(mapping)}
              install={state.installs.find(
                (install) => install.installId === mapping.targetInstallId,
              )}
              key={domainMappingKey(mapping)}
              mapping={mapping}
              onDelete={onDelete}
              onDeleteProvider={onDeleteProvider}
              providerDeletingKey={state.domainProviderDeletingKey}
            />
          ))}
          {orphanAppliedStates.map((appliedState) => (
            <AppliedDomainStateRow
              appliedState={appliedState}
              install={state.installs.find(
                (install) => install.installId === appliedState.targetInstallId,
              )}
              key={`applied:${appliedState.profile}:${appliedState.host}`}
              onDeleteProvider={onDeleteProvider}
              providerDeletingKey={state.domainProviderDeletingKey}
            />
          ))}
        </div>
      )}
      {state.domainRedirectIntents.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-overlay p-4 text-sm text-muted-fg">
          No redirects.
        </div>
      ) : (
        <div className="grid gap-3">
          {state.domainRedirectIntents.map((redirect) => (
            <DomainRedirectRow
              deleting={state.domainRedirectDeletingKey === redirect.fromHost}
              key={redirect.fromHost}
              onDelete={onDeleteRedirect}
              onDeleteProvider={onDeleteProvider}
              providerAppliedResources={providerAppliedResources.filter(
                (resource) => resource.host === redirect.fromHost,
              )}
              providerDeletingKey={state.domainProviderDeletingKey}
              redirect={redirect}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function DomainProviderControlPanel({
  applyDisabled,
  applying,
  applyError,
  applyJob,
  deleteJob,
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
  onApply?: () => void;
  onRefreshApplyJob?: () => void;
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

function DomainMappingRow({
  appliedState,
  deleting,
  install,
  mapping,
  onDelete,
  onDeleteProvider,
  providerDeletingKey,
}: {
  appliedState: InstanceDomainMappingAppliedState | undefined;
  deleting: boolean;
  install: AppInstall | undefined;
  mapping: InstanceDomainMapping;
  onDelete?: (mapping: InstanceDomainMapping) => void;
  onDeleteProvider?: (input: {
    host: string;
    kind?: InstanceDomainProviderAppliedResourceState["kind"];
    logicalId?: string;
  }) => void;
  providerDeletingKey?: string;
}) {
  const providerDelete = appliedState
    ? providerDeleteInputForAppliedState(appliedState)
    : undefined;
  const providerDeleting =
    providerDelete !== undefined && providerDeletingKey === domainProviderDeleteKey(providerDelete);

  return (
    <article className="rounded-md border border-border bg-overlay p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="truncate text-sm font-semibold">{mapping.host}</h3>
          <p className="text-xs text-muted-fg">
            <code>{domainProfileTargetLabel(mapping.profile, mapping.targetInstallId)}</code>
            {install ? ` · ${install.label}` : ""} · {mapping.enabled ? "enabled" : "disabled"}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <p className="text-xs text-muted-fg">
            {appliedState ? `Applied: ${appliedState.workerName}` : "Applied: none"}
          </p>
          {mapping.enabled ? (
            <Button
              intent="outline"
              isDisabled={deleting}
              onPress={() => onDelete?.(mapping)}
              size="sm"
              type="button"
            >
              <RemoveIcon />
              {deleting ? "Removing..." : "Remove"}
            </Button>
          ) : null}
          {providerDelete ? (
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
          ) : null}
        </div>
      </div>
    </article>
  );
}

function DomainRedirectRow({
  deleting,
  onDelete,
  onDeleteProvider,
  providerAppliedResources,
  providerDeletingKey,
  redirect,
}: {
  deleting: boolean;
  onDelete?: (redirect: InstanceDomainProviderRedirectIntent) => void;
  onDeleteProvider?: (input: {
    host: string;
    kind?: InstanceDomainProviderAppliedResourceState["kind"];
    logicalId?: string;
  }) => void;
  providerAppliedResources: InstanceDomainProviderAppliedResourceState[];
  providerDeletingKey?: string;
  redirect: InstanceDomainProviderRedirectIntent;
}) {
  const providerDelete =
    providerAppliedResources.length === 0 ? undefined : { host: redirect.fromHost };
  const providerDeleting =
    providerDelete !== undefined && providerDeletingKey === domainProviderDeleteKey(providerDelete);

  return (
    <article className="rounded-md border border-border bg-overlay p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="truncate text-sm font-semibold">{redirect.fromHost}</h3>
          <p className="text-xs text-muted-fg">
            <code>{redirectTargetLabel(redirect)}</code> ·{" "}
            {redirect.enabled ? "enabled" : "disabled"}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <p className="text-xs text-muted-fg">
            {redirect.statusCode} · {redirect.preservePath ? "path" : "no path"} ·{" "}
            {redirect.preserveQueryString ? "query" : "no query"}
          </p>
          {redirect.enabled ? (
            <Button
              intent="outline"
              isDisabled={deleting}
              onPress={() => onDelete?.(redirect)}
              size="sm"
              type="button"
            >
              <RemoveIcon />
              {deleting ? "Removing..." : "Remove"}
            </Button>
          ) : null}
          {providerDelete ? (
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
          ) : null}
        </div>
      </div>
    </article>
  );
}

function AppliedDomainStateRow({
  appliedState,
  install,
  onDeleteProvider,
  providerDeletingKey,
}: {
  appliedState: InstanceDomainMappingAppliedState;
  install: AppInstall | undefined;
  onDeleteProvider?: (input: {
    host: string;
    kind?: InstanceDomainProviderAppliedResourceState["kind"];
    logicalId?: string;
  }) => void;
  providerDeletingKey?: string;
}) {
  const providerDelete = providerDeleteInputForAppliedState(appliedState);
  const providerDeleting = providerDeletingKey === domainProviderDeleteKey(providerDelete);

  return (
    <article className="rounded-md border border-dashed border-border bg-overlay p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="truncate text-sm font-semibold">{appliedState.host}</h3>
          <p className="text-xs text-muted-fg">
            <code>
              {domainProfileTargetLabel(appliedState.profile, appliedState.targetInstallId)}
            </code>
            {install ? ` · ${install.label}` : ""} · applied without desired mapping
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <p className="text-xs text-muted-fg">Applied: {appliedState.workerName}</p>
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

function InstalledAppRow({ install }: { install: AppInstall }) {
  return (
    <article className="rounded-md border border-border bg-overlay p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="truncate text-sm font-semibold">{install.label}</h3>
          <p className="text-xs text-muted-fg">
            <code>{install.installId}</code> · {install.packageAppKey}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a className={shellLinkButtonClassName()} href={install.adminRoute}>
            Open admin
          </a>
          {install.publicRoute ? (
            <a className={shellLinkButtonClassName("outline")} href={install.publicRoute}>
              Open public
            </a>
          ) : null}
        </div>
      </div>
    </article>
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
      className="grid grid-cols-3 gap-1 rounded-md border border-border bg-muted p-1"
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

function initializeDomainMappingDraft({
  currentDraft,
  installs,
}: {
  currentDraft: DomainMappingDraft;
  installs: readonly AppInstall[];
}): DomainMappingDraft {
  const profile = DOMAIN_PROFILE_OPTIONS.some((option) => option.profile === currentDraft.profile)
    ? currentDraft.profile
    : defaultDomainProfile(installs);
  const targetInstalls = domainTargetInstalls(profile, installs);
  const targetInstallId =
    profile === "instance"
      ? ""
      : targetInstalls.some((install) => install.installId === currentDraft.targetInstallId)
        ? currentDraft.targetInstallId
        : (targetInstalls[0]?.installId ?? "");

  return {
    host: currentDraft.host,
    profile,
    targetInstallId,
  };
}

function appliedStateForMapping(
  mapping: InstanceDomainMapping,
  appliedStates: readonly InstanceDomainMappingAppliedState[],
): InstanceDomainMappingAppliedState | undefined {
  return appliedStates.find(
    (state) => state.host === mapping.host && state.profile === mapping.profile,
  );
}

const DOMAIN_PROFILE_OPTIONS: Array<{ label: string; profile: InstanceDomainMappingProfile }> = [
  { label: "Instance", profile: "instance" },
  { label: "App", profile: "app" },
  { label: "Public Site", profile: "publicSite" },
];

function defaultDomainProfile(installs: readonly AppInstall[]): InstanceDomainMappingProfile {
  if (installs.some((install) => install.packageAppKey === "site")) {
    return "publicSite";
  }

  return installs.length > 0 ? "app" : "instance";
}

function domainTargetInstalls(
  profile: InstanceDomainMappingProfile,
  installs: readonly AppInstall[],
): AppInstall[] {
  if (profile === "instance") {
    return [];
  }

  if (profile === "publicSite") {
    return installs.filter((install) => install.packageAppKey === "site");
  }

  return [...installs];
}

function domainTargetLabel(profile: InstanceDomainMappingProfile): string {
  return profile === "publicSite" ? "Site" : "App";
}

function domainProfileTargetLabel(
  profile: InstanceDomainMappingProfile,
  targetInstallId: string | undefined,
): string {
  return targetInstallId === undefined ? profile : `${profile}:${targetInstallId}`;
}

function redirectTargetLabel(redirect: InstanceDomainProviderRedirectIntent): string {
  return redirect.toHost ?? redirect.toUrl ?? "missing target";
}

function domainProviderConfigLabel(plan: InstanceDomainProviderPlanResponse): string {
  if (plan.config.applyReady) {
    return "apply ready";
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
  if (plan.config.issues.length === 0) {
    return `Zones ${plan.config.zones.map((zone) => zone.name).join(", ") || "none"}`;
  }

  return `Config ${plan.config.issues.map((issue) => issue.code).join(", ")}`;
}

function domainMappingKey(mapping: Pick<InstanceDomainMapping, "host" | "profile">): string {
  return `${mapping.profile}:${mapping.host}`;
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

function domainProviderDeleteKey(input: {
  host: string;
  kind?: InstanceDomainProviderAppliedResourceState["kind"];
  logicalId?: string;
}): string {
  return input.logicalId ?? `${input.kind ?? "host"}:${input.host}`;
}

function shellLinkButtonClassName(intent: "solid" | "outline" = "solid") {
  const base =
    "inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors hover:no-underline";

  return intent === "solid"
    ? `${base} bg-primary text-primary-fg hover:bg-primary/80`
    : `${base} border border-border text-fg hover:bg-muted`;
}
