import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@dpeek/formless-ui/button";
import { Description, FieldGroup, Label, fieldErrorStyles } from "@dpeek/formless-ui/field";
import { Input } from "@dpeek/formless-ui/input";
import { TextField } from "@dpeek/formless-ui/text-field";
import { ControlAddIcon } from "@dpeek/formless-ui/icons";
import {
  AppInstallApiError,
  createInstanceAppInstall,
  fetchInstanceAppInstalls,
} from "../../client/app-installs.ts";
import type { AppInstall, BundledAppPackage } from "../../shared/app-installs.ts";

export type InstanceShellRouteState =
  | { status: "failed"; message: string }
  | { status: "loading" }
  | {
      installError?: string;
      installing: boolean;
      installs: AppInstall[];
      packages: BundledAppPackage[];
      status: "ready";
    };

export function InstanceShellRoute() {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<InstanceShellRouteState>({ status: "loading" });
  const [label, setLabel] = useState("");
  const [installId, setInstallId] = useState("");
  const sitePackage =
    state.status === "ready"
      ? state.packages.find((appPackage) => appPackage.packageAppKey === "site")
      : undefined;

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;

    async function loadInstalls() {
      try {
        const response = await fetchInstanceAppInstalls({ signal: controller.signal });

        if (stopped) {
          return;
        }

        setState({
          installing: false,
          installs: response.installs,
          packages: response.packages,
          status: "ready",
        });

        const nextSitePackage = response.packages.find(
          (appPackage) => appPackage.packageAppKey === "site",
        );

        if (nextSitePackage) {
          setLabel((current) => (current.trim() === "" ? "Personal Site" : current));
          setInstallId((current) =>
            current.trim() === ""
              ? availableDefaultInstallId(nextSitePackage, response.installs)
              : current,
          );
        }
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

  async function submitInstall(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.status !== "ready" || !sitePackage || state.installing) {
      return;
    }

    setState({ ...state, installing: true, installError: undefined });

    try {
      const response = await createInstanceAppInstall({
        packageAppKey: sitePackage.packageAppKey,
        installId,
        label,
      });

      setState({
        installing: false,
        installs: response.installs,
        packages: state.packages,
        status: "ready",
      });
      setLocation(response.install.adminRoute);
    } catch (error) {
      const message =
        error instanceof AppInstallApiError || error instanceof Error
          ? error.message
          : "Site install failed.";

      setState({ ...state, installing: false, installError: message });
    }
  }

  return (
    <InstanceShellRouteView
      installId={installId}
      label={label}
      onInstallIdChange={setInstallId}
      onLabelChange={setLabel}
      onSubmitInstall={submitInstall}
      state={state}
    />
  );
}

export function InstanceShellRouteView({
  installId = "",
  label = "",
  onInstallIdChange,
  onLabelChange,
  onSubmitInstall,
  state,
}: {
  installId?: string;
  label?: string;
  onInstallIdChange?: (value: string) => void;
  onLabelChange?: (value: string) => void;
  onSubmitInstall?: (event: React.FormEvent<HTMLFormElement>) => void;
  state: InstanceShellRouteState;
}) {
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

  const sitePackage = state.packages.find((appPackage) => appPackage.packageAppKey === "site");

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <ShellHeader />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="space-y-3" aria-labelledby="installed-apps-heading">
          <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
            <h2 id="installed-apps-heading" className="text-sm font-semibold">
              Installed apps
            </h2>
            <span className="text-xs text-muted-fg">{state.installs.length}</span>
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
        <section className="space-y-3" aria-labelledby="bundled-apps-heading">
          <div className="border-b border-border pb-2">
            <h2 id="bundled-apps-heading" className="text-sm font-semibold">
              Bundled apps
            </h2>
          </div>
          {sitePackage ? (
            <SiteInstallForm
              installError={state.installError}
              installId={installId}
              installing={state.installing}
              label={label}
              onInstallIdChange={onInstallIdChange}
              onLabelChange={onLabelChange}
              onSubmit={onSubmitInstall}
              sitePackage={sitePackage}
            />
          ) : (
            <p className="text-sm text-muted-fg">No bundled apps are available.</p>
          )}
        </section>
      </div>
    </section>
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

function SiteInstallForm({
  installError,
  installId,
  installing,
  label,
  onInstallIdChange,
  onLabelChange,
  onSubmit,
  sitePackage,
}: {
  installError: string | undefined;
  installId: string;
  installing: boolean;
  label: string;
  onInstallIdChange?: (value: string) => void;
  onLabelChange?: (value: string) => void;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  sitePackage: BundledAppPackage;
}) {
  const labelInputId = useMemo(() => "site-install-label", []);
  const installIdInputId = useMemo(() => "site-install-id", []);

  return (
    <form className="rounded-md border border-border bg-overlay p-4" onSubmit={onSubmit}>
      <div className="space-y-4">
        <header className="space-y-1">
          <h3 className="text-sm font-semibold">{sitePackage.label}</h3>
          <p className="text-xs text-muted-fg">{sitePackage.description}</p>
        </header>
        <FieldGroup>
          <TextField
            isDisabled={installing}
            isRequired
            onChange={(value) => onLabelChange?.(value)}
            value={label}
          >
            <Label htmlFor={labelInputId}>Label</Label>
            <Input id={labelInputId} />
          </TextField>
          <TextField
            isDisabled={installing}
            isRequired
            onChange={(value) => onInstallIdChange?.(value)}
            value={installId}
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
        <Button className="w-full" isDisabled={installing} type="submit">
          <ControlAddIcon />
          {installing ? "Installing..." : "Install Site"}
        </Button>
      </div>
    </form>
  );
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

function shellLinkButtonClassName(intent: "solid" | "outline" = "solid") {
  const base =
    "inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors hover:no-underline";

  return intent === "solid"
    ? `${base} bg-primary text-primary-fg hover:bg-primary/80`
    : `${base} border border-border text-fg hover:bg-muted`;
}
