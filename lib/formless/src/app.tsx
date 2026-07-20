import {
  lazy,
  Suspense,
  type ElementType,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { NotFoundRoute } from "./app/routes/not-found.tsx";
import { normalizeSitePageSlug } from "@dpeek/formless-site-app/public/react";
import {
  FormlessSitePageRenderer,
  FormlessSiteSystemStateRenderer,
} from "@dpeek/formless-renderer/site/renderer";
import "@dpeek/formless-renderer/site/global.css";
import {
  createPublicSiteReactAdapterRegistry,
  publicSiteReactAdapterForPackageAppKey,
  type PublicSiteReactAdapterRegistry,
  type PublicSiteRouteInputProps,
  type PublicSiteRouteProps,
} from "./app/public-site-runtime.tsx";
import type { ApplicationShellRuntimeBoundaryProps } from "./app/application-shell-runtime.tsx";
import { selectGeneratedShellScope } from "./app/generated/application-shell-projection.ts";
import type {
  GeneratedWorkspaceRuntimeController,
  GeneratedWorkspaceSectionExternalAction,
} from "./app/generated/generated-workspace-runtime.tsx";
import type { HomeRouteClientLoadState } from "./app/routes/home.tsx";
import { sitePublicRenderer as workspaceSitePublicRenderer } from "virtual:formless/site-public-renderer/browser";
import {
  findRuntimeWorldMountByRoute,
  hasGeneratedRoutes,
  installedAppWorldMountFromInstallId,
  installedSitePublicSurfaceFromRoute,
  normalizeRuntimeBrowserPath,
  resolveRuntimeProfile,
  runtimeBrowserRoutePatterns,
  runtimeInstalledSitePublicHomeSlug,
  runtimeInstalledSitePublicPath,
  runtimeProfileNeedsInstalledAppRouteInstalls,
  runtimeProfileWithActivePackageResolver,
  type RuntimeProfile,
  type RuntimeInstalledAppRouteContext,
  type RuntimeWorldMount,
} from "./app/runtime-profile.ts";
import {
  activeAppPackageResolverFromAppInstallsResponse,
  activeAppPackageResolverFromPackages,
  fetchInstanceAppInstalls,
} from "./client/app-installs.ts";
import type { ClientAppSchemaKey, ClientAppTarget } from "./client/app-target.ts";
import type {
  AppInstall,
  AppPackageResolver,
  InstallableAppPackage,
} from "@dpeek/formless-installed-apps";
import {
  COLLABORATOR_INVITATION_ACCEPT_PATH,
  ownerLoginRedirectLocationForRoute,
  type OwnerLoginRedirectTarget,
} from "./shared/instance-auth.ts";
import { runtimeTopologyRoutes, type RuntimeRouteAccess } from "./shared/runtime-topology.ts";
import type { AppInstallsResponse } from "./shared/protocol.ts";
import type { WorkspaceLinkActionContract } from "@dpeek/formless-presentation/contract";
import { initialInstanceManagementRuntimeContribution } from "./app/routes/instance-management-contract.ts";
import { initialInstanceAccessRuntimeContribution } from "./app/routes/access-contract.ts";
import { projectApplicationSystemState } from "./app/routes/application-system-state-projection.ts";
import { ApplicationSystemStateRuntime } from "./app/routes/application-system-state-runtime.tsx";
import { useApplicationRootThemeRuntime } from "./app/application-root-context.tsx";

type HomeRouteProps = {
  activePackageResolver?: AppPackageResolver | undefined;
  clientSync?: boolean | undefined;
  onClientLoadStateChange?: ((state: HomeRouteClientLoadState) => void) | undefined;
  onGeneratedWorkspaceController?: (
    controller: GeneratedWorkspaceRuntimeController | undefined,
  ) => void;
  sectionExternalActions?: Readonly<
    Record<string, readonly GeneratedWorkspaceSectionExternalAction[] | undefined>
  >;
  target?: ClientAppTarget;
  schemaKey: ClientAppSchemaKey;
  screenPath: string;
  workspaceActions?: readonly WorkspaceLinkActionContract[];
};

type InstanceShellRouteProps = {
  localWorkspaceGatewayAvailable?: boolean | undefined;
};

export type RuntimeInstalledAppRouteRegistry = {
  activePackageResolver?: AppPackageResolver | undefined;
  installs: readonly AppInstall[];
  packages: readonly InstallableAppPackage[];
};

export type AppRouteComponents = {
  AccessRoute: ElementType;
  ApplicationShellRuntimeBoundary: ElementType<ApplicationShellRuntimeBoundaryProps>;
  AuthAccountRoute: ElementType;
  CollaboratorInvitationAcceptanceRoute: ElementType;
  HomeRoute: ElementType<HomeRouteProps>;
  InstanceShellRoute: ElementType<InstanceShellRouteProps>;
  LocalSessionRoute: ElementType;
  OwnerLoginRoute: ElementType;
  OwnerSetupRoute: ElementType;
  SitePageRoute: ElementType<PublicSiteRouteProps>;
  publicSiteReactAdapters?: PublicSiteReactAdapterRegistry;
};

const defaultPublicSiteReactAdapters = createPublicSiteReactAdapterRegistry({
  builtInRenderer: FormlessSitePageRenderer,
  builtInSystemStateRenderer: FormlessSiteSystemStateRenderer,
  workspaceRenderer: workspaceSitePublicRenderer,
});

const defaultRouteComponents: AppRouteComponents = {
  AccessRoute: lazy(() =>
    import("./app/routes/access.tsx").then((module) => ({ default: module.AccessRoute })),
  ),
  ApplicationShellRuntimeBoundary: lazy(() =>
    import("./app/application-shell-runtime.tsx").then((module) => ({
      default: module.ApplicationShellRuntimeBoundary,
    })),
  ),
  AuthAccountRoute: lazy(() =>
    import("./app/routes/auth-account.tsx").then((module) => ({
      default: module.AuthAccountRoute,
    })),
  ),
  CollaboratorInvitationAcceptanceRoute: lazy(() =>
    import("./app/routes/collaborator-invitation-acceptance.tsx").then((module) => ({
      default: module.CollaboratorInvitationAcceptanceRoute,
    })),
  ),
  HomeRoute: lazy(() =>
    import("./app/routes/home.tsx").then((module) => ({ default: module.HomeRoute })),
  ),
  InstanceShellRoute: lazy(() =>
    import("./app/routes/instance-shell.tsx").then((module) => ({
      default: module.InstanceShellRoute,
    })),
  ),
  LocalSessionRoute: lazy(() =>
    import("./app/routes/local-session.tsx").then((module) => ({
      default: module.LocalSessionRoute,
    })),
  ),
  OwnerLoginRoute: lazy(() =>
    import("./app/routes/owner-login.tsx").then((module) => ({
      default: module.OwnerLoginRoute,
    })),
  ),
  OwnerSetupRoute: lazy(() =>
    import("./app/routes/owner-setup.tsx").then((module) => ({
      default: module.OwnerSetupRoute,
    })),
  ),
  SitePageRoute: defaultPublicSiteReactAdapters.get("site")!.Route,
  publicSiteReactAdapters: defaultPublicSiteReactAdapters,
};

export function App({
  installedAppRouteInstalls: installedAppRouteInstallsProp,
  installedAppRoutePackages: installedAppRoutePackagesProp,
  localWorkspaceGatewayAvailable: localWorkspaceGatewayAvailableProp,
  routeComponents: routeComponentOverrides,
  runtimeProfile: runtimeProfileProp,
}: {
  installedAppRouteInstalls?: readonly AppInstall[];
  installedAppRoutePackages?: readonly InstallableAppPackage[];
  localWorkspaceGatewayAvailable?: boolean;
  routeComponents?: Partial<AppRouteComponents>;
  runtimeProfile?: RuntimeProfile;
} = {}) {
  const [location] = useLocation();
  const rootThemeRuntime = useApplicationRootThemeRuntime();
  const routeComponents = resolveAppRouteComponents(routeComponentOverrides);
  const runtimeProfile = useMemo(
    () => runtimeProfileProp ?? resolveRuntimeProfile(),
    [runtimeProfileProp],
  );
  const installedAppRouteRegistryRefreshKey = runtimeInstalledAppRouteRegistryRefreshKey(
    runtimeProfile,
    location,
  );
  const installedAppRouteRegistry = useRuntimeInstalledAppRouteRegistry(
    runtimeProfile,
    installedAppRouteInstallsProp,
    installedAppRoutePackagesProp,
    installedAppRouteRegistryRefreshKey,
  );
  const activeRuntimeProfile = useMemo(
    () =>
      runtimeProfileWithActivePackageResolver(
        runtimeProfile,
        installedAppRouteRegistry?.activePackageResolver,
      ),
    [runtimeProfile, installedAppRouteRegistry?.activePackageResolver],
  );
  const installedAppRouteInstalls = installedAppRouteRegistry?.installs;
  const installedAppRouteContext = useMemo<RuntimeInstalledAppRouteContext>(
    () => ({
      activePackageResolver: installedAppRouteRegistry?.activePackageResolver,
      appInstalls: installedAppRouteInstalls,
    }),
    [installedAppRouteInstalls, installedAppRouteRegistry?.activePackageResolver],
  );
  const browserRoutes = useMemo(
    () => runtimeBrowserRoutePatterns(activeRuntimeProfile),
    [activeRuntimeProfile],
  );
  const normalizedLocation = normalizeRuntimeBrowserPath(location);
  const initialRouteContractContributions = useMemo(() => {
    if (browserRoutes.instanceAccessRoute === normalizedLocation) {
      return [initialInstanceAccessRuntimeContribution];
    }
    if (browserRoutes.instanceShellRoute === normalizedLocation) {
      return [initialInstanceManagementRuntimeContribution];
    }
    return [];
  }, [browserRoutes.instanceAccessRoute, browserRoutes.instanceShellRoute, normalizedLocation]);
  const localWorkspaceGatewayAvailable = useLocalWorkspaceGatewayAvailable(
    localWorkspaceGatewayAvailableProp,
    routeMayNeedLocalWorkspaceGateway(browserRoutes, normalizedLocation),
  );
  const routeContext = useMemo(
    () => ({ ...installedAppRouteContext, localWorkspaceGatewayAvailable }),
    [installedAppRouteContext, localWorkspaceGatewayAvailable],
  );
  const routeWorld = findRuntimeWorldMountByRoute(activeRuntimeProfile, location, routeContext);
  const routeRegistryLoading =
    runtimeProfile.appProfileTarget !== undefined &&
    runtimeProfile.worlds.length === 0 &&
    installedAppRouteRegistry === undefined;

  if (routeRegistryLoading) {
    return (
      <ApplicationSystemStateRuntime
        snapshot={projectApplicationSystemState({
          heading: "Loading application",
          id: "application-system-state:route-registry",
          message: "Loading installed app routes...",
          state: "loading",
        })}
      />
    );
  }

  const shellScope = selectGeneratedShellScope({
    currentPath: location,
    routeContext,
    routeWorld,
    runtimeProfile: activeRuntimeProfile,
  });

  if (!shellScope) {
    return (
      <AppRoutes
        installedAppRouteContext={installedAppRouteContext}
        localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailable}
        routeComponents={routeComponents}
        runtimeProfile={activeRuntimeProfile}
      />
    );
  }

  const ApplicationShellRuntimeBoundary = routeComponents.ApplicationShellRuntimeBoundary;

  return (
    <Suspense fallback={<RouteLoading />}>
      <ApplicationShellRuntimeBoundary
        activePackageResolver={installedAppRouteContext.activePackageResolver}
        applicationTheme={rootThemeRuntime}
        currentPath={location}
        initialRouteContractContributions={initialRouteContractContributions}
        installedAppRouteInstalls={installedAppRouteInstalls}
        routeWorld={routeWorld}
        runtimeProfile={activeRuntimeProfile}
      >
        <AppRoutes
          installedAppRouteContext={installedAppRouteContext}
          localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailable}
          routeComponents={routeComponents}
          runtimeProfile={activeRuntimeProfile}
        />
      </ApplicationShellRuntimeBoundary>
    </Suspense>
  );
}

export function runtimeInstalledAppRouteRegistryFromResponse(
  response: AppInstallsResponse,
): RuntimeInstalledAppRouteRegistry {
  return {
    activePackageResolver: activeAppPackageResolverFromAppInstallsResponse(response),
    installs: [...response.installs],
    packages: [...response.packages],
  };
}

function resolveAppRouteComponents(
  overrides: Partial<AppRouteComponents> | undefined,
): AppRouteComponents {
  const merged = {
    ...defaultRouteComponents,
    ...overrides,
  };

  return {
    ...merged,
    publicSiteReactAdapters:
      overrides && "publicSiteReactAdapters" in overrides
        ? overrides.publicSiteReactAdapters
        : overrides?.SitePageRoute
          ? undefined
          : defaultRouteComponents.publicSiteReactAdapters,
  };
}

function runtimeInstalledAppRouteRegistryFromInstalls(
  installs: readonly AppInstall[],
  packages: readonly InstallableAppPackage[] = [],
): RuntimeInstalledAppRouteRegistry {
  return {
    activePackageResolver:
      packages.length > 0 ? activeAppPackageResolverFromPackages(packages) : undefined,
    installs: [...installs],
    packages: [...packages],
  };
}

function emptyRuntimeInstalledAppRouteRegistry(): RuntimeInstalledAppRouteRegistry {
  return {
    installs: [],
    packages: [],
  };
}

function useRuntimeInstalledAppRouteRegistry(
  runtimeProfile: RuntimeProfile,
  initialInstalls: readonly AppInstall[] | undefined,
  initialPackages: readonly InstallableAppPackage[] | undefined,
  refreshKey: string,
): RuntimeInstalledAppRouteRegistry | undefined {
  const shouldLoad = runtimeProfileNeedsInstalledAppRouteInstalls(runtimeProfile);
  const [registry, setRegistry] = useState<RuntimeInstalledAppRouteRegistry | undefined>(() =>
    initialInstalls
      ? runtimeInstalledAppRouteRegistryFromInstalls(initialInstalls, initialPackages)
      : shouldLoad
        ? undefined
        : emptyRuntimeInstalledAppRouteRegistry(),
  );

  useEffect(() => {
    if (initialInstalls) {
      setRegistry(runtimeInstalledAppRouteRegistryFromInstalls(initialInstalls, initialPackages));
      return;
    }

    if (!shouldLoad) {
      setRegistry(emptyRuntimeInstalledAppRouteRegistry());
      return;
    }

    const controller = new AbortController();
    let stopped = false;

    setRegistry(undefined);

    async function loadInstalls() {
      try {
        const response = await fetchInstanceAppInstalls({ signal: controller.signal });

        if (!stopped) {
          setRegistry(runtimeInstalledAppRouteRegistryFromResponse(response));
        }
      } catch {
        if (!stopped && !controller.signal.aborted) {
          setRegistry(emptyRuntimeInstalledAppRouteRegistry());
        }
      }
    }

    void loadInstalls();

    return () => {
      stopped = true;
      controller.abort();
    };
  }, [initialInstalls, initialPackages, refreshKey, shouldLoad]);

  return registry;
}

function useLocalWorkspaceGatewayAvailable(
  explicitAvailable: boolean | undefined,
  shouldResolve: boolean,
): boolean {
  const [available, setAvailable] = useState(() => explicitAvailable ?? false);

  useEffect(() => {
    if (explicitAvailable !== undefined) {
      setAvailable(explicitAvailable);
      return;
    }

    if (!shouldResolve) {
      setAvailable(false);
      return;
    }

    let stopped = false;

    async function resolveGatewayAvailability() {
      const { workspaceGatewayBrowserConfig } = await import("@dpeek/formless-gateway/client");

      if (!stopped) {
        setAvailable(workspaceGatewayBrowserConfig() !== undefined);
      }
    }

    void resolveGatewayAvailability().catch(() => {
      if (!stopped) {
        setAvailable(false);
      }
    });

    return () => {
      stopped = true;
    };
  }, [explicitAvailable, shouldResolve]);

  return available;
}

function routeMayNeedLocalWorkspaceGateway(
  routes: ReturnType<typeof runtimeBrowserRoutePatterns>,
  path: string,
): boolean {
  return path === routes.localSessionRoute || path === routes.instanceShellRoute;
}

export function runtimeInstalledAppRouteRegistryRefreshKey(
  runtimeProfile: RuntimeProfile,
  location: string,
): string {
  const path = normalizeRuntimeBrowserPath(location);
  const routes = runtimeBrowserRoutePatterns(runtimeProfile);

  return (
    installedRouteRootPath(path, routes.installedAppHomeRoutePattern) ??
    installedRouteRootPath(path, routes.installedSitePublicHomeRoutePattern) ??
    path
  );
}

function installedRouteRootPath(
  path: string,
  routePattern: `/${string}` | undefined,
): string | undefined {
  const routeBase = routePattern?.split("/:installId")[0];

  if (!routeBase) {
    return undefined;
  }

  const routePrefix = `${routeBase}/`;

  if (!path.startsWith(routePrefix)) {
    return undefined;
  }

  const installId = path.slice(routePrefix.length).split("/")[0];

  return installId ? `${routePrefix}${installId}` : undefined;
}

function AppRoutes({
  installedAppRouteContext,
  localWorkspaceGatewayAvailable,
  routeComponents,
  runtimeProfile,
}: {
  installedAppRouteContext: RuntimeInstalledAppRouteContext;
  localWorkspaceGatewayAvailable: boolean;
  routeComponents: AppRouteComponents;
  runtimeProfile: RuntimeProfile;
}) {
  const {
    AccessRoute,
    AuthAccountRoute,
    CollaboratorInvitationAcceptanceRoute,
    HomeRoute,
    InstanceShellRoute,
    LocalSessionRoute,
    OwnerLoginRoute,
    OwnerSetupRoute,
  } = routeComponents;
  const publicSiteReactAdapters =
    routeComponents.publicSiteReactAdapters ??
    createPublicSiteReactAdapterRegistry({
      builtInRenderer: FormlessSitePageRenderer,
      builtInSystemStateRenderer: FormlessSiteSystemStateRenderer,
      siteRoute: routeComponents.SitePageRoute,
      workspaceRenderer: workspaceSitePublicRenderer,
    });
  const generatedWorlds = runtimeProfile.worlds.filter(hasGeneratedRoutes);
  const browserRoutes = runtimeBrowserRoutePatterns(runtimeProfile);
  const publishedSite = runtimeProfile.publishedSite;
  const publicSitePreview = runtimeProfile.publicSitePreview;
  const routes = (
    <Switch>
      {runtimeProfile.defaultRedirect ? (
        <Route path="/">
          <Redirect replace to={runtimeProfile.defaultRedirect} />
        </Route>
      ) : null}
      <Route path={COLLABORATOR_INVITATION_ACCEPT_PATH}>
        <CollaboratorInvitationAcceptanceRoute />
      </Route>
      <Route path={runtimeTopologyRoutes.authAccountRoute}>
        <AuthAccountRoute />
      </Route>
      {browserRoutes.authAccountSetupRoute ? (
        <Route path={browserRoutes.authAccountSetupRoute}>
          <OwnerSetupRoute />
        </Route>
      ) : null}
      {browserRoutes.authAccountSignInRoute ? (
        <Route path={browserRoutes.authAccountSignInRoute}>
          <OwnerLoginRoute />
        </Route>
      ) : null}
      <Route path={runtimeTopologyRoutes.authAccountGateRoutePattern}>
        <AuthAccountRoute />
      </Route>
      {browserRoutes.localSessionRoute && localWorkspaceGatewayAvailable ? (
        <Route path={browserRoutes.localSessionRoute}>
          <LocalSessionRoute />
        </Route>
      ) : null}
      {browserRoutes.instanceShellRoute ? (
        <Route path={browserRoutes.instanceShellRoute}>
          <OwnerRouteGuard access="owner">
            <InstanceShellRoute localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailable} />
          </OwnerRouteGuard>
        </Route>
      ) : null}
      {browserRoutes.instanceAccessRoute ? (
        <Route path={browserRoutes.instanceAccessRoute}>
          <OwnerRouteGuard access="authenticated">
            <AccessRoute />
          </OwnerRouteGuard>
        </Route>
      ) : null}
      {publishedSite ? (
        <Route path={publishedSite.rootRoute}>
          <PublicSiteRoute
            adapters={publicSiteReactAdapters}
            packageAppKey={publishedSite.packageAppKey}
            routeProps={{
              linkMode: "published",
              slug: publishedSite.homeSlug,
              target: publishedSite.target,
            }}
          />
        </Route>
      ) : null}
      {publishedSite ? (
        <Route path={publishedSite.routePattern}>
          {(params) => (
            <PublicSiteRoute
              adapters={publicSiteReactAdapters}
              packageAppKey={publishedSite.packageAppKey}
              routeProps={{
                linkMode: "published",
                slug: runtimeWildcardSiteSlug(params),
                target: publishedSite.target,
              }}
            />
          )}
        </Route>
      ) : null}
      {generatedWorlds.map((world) => (
        <Route key={world.route} path={world.route}>
          <OwnerRouteGuard access={world.access ?? "anonymous"}>
            <HomeRoute
              activePackageResolver={installedAppRouteContext.activePackageResolver}
              schemaKey={world.app.key}
              screenPath="/"
              target={world.target}
              workspaceActions={siteWorkspaceLinkActionsForWorld(
                world,
                publicSitePreview,
                installedAppRouteContext.appInstalls,
              )}
            />
          </OwnerRouteGuard>
        </Route>
      ))}
      {generatedWorlds.map((world) => (
        <Route key={`${world.route}/*`} path={runtimeScreenWildcardRoute(world)}>
          {(params) => (
            <OwnerRouteGuard access={world.access ?? "anonymous"}>
              <HomeRoute
                activePackageResolver={installedAppRouteContext.activePackageResolver}
                schemaKey={world.app.key}
                screenPath={runtimeWildcardScreenPath(params)}
                target={world.target}
                workspaceActions={siteWorkspaceLinkActionsForWorld(
                  world,
                  publicSitePreview,
                  installedAppRouteContext.appInstalls,
                )}
              />
            </OwnerRouteGuard>
          )}
        </Route>
      ))}
      {browserRoutes.installedAppHomeRoutePattern ? (
        <Route path={browserRoutes.installedAppHomeRoutePattern}>
          {(params) => (
            <InstalledAppHomeRoute
              installedAppRouteContext={installedAppRouteContext}
              installId={runtimeRouteParam(params, "installId")}
              routeComponents={routeComponents}
              runtimeProfile={runtimeProfile}
              screenPath="/"
            />
          )}
        </Route>
      ) : null}
      {browserRoutes.installedAppScreenRoutePattern ? (
        <Route path={browserRoutes.installedAppScreenRoutePattern}>
          {(params) => (
            <InstalledAppHomeRoute
              installedAppRouteContext={installedAppRouteContext}
              installId={runtimeRouteParam(params, "installId")}
              routeComponents={routeComponents}
              runtimeProfile={runtimeProfile}
              screenPath={runtimeWildcardScreenPath(params)}
            />
          )}
        </Route>
      ) : null}
      {browserRoutes.installedSitePublicHomeRoutePattern ? (
        <Route path={browserRoutes.installedSitePublicHomeRoutePattern}>
          {(params) => (
            <InstalledSitePublicRoute
              installedAppRouteContext={installedAppRouteContext}
              installId={runtimeRouteParam(params, "installId")}
              publicSiteReactAdapters={publicSiteReactAdapters}
              runtimeProfile={runtimeProfile}
              slug={runtimeInstalledSitePublicHomeSlug(runtimeProfile) ?? "home"}
            />
          )}
        </Route>
      ) : null}
      {browserRoutes.installedSitePublicSlugRoutePattern ? (
        <Route path={browserRoutes.installedSitePublicSlugRoutePattern}>
          {(params) => (
            <InstalledSitePublicRoute
              installedAppRouteContext={installedAppRouteContext}
              installId={runtimeRouteParam(params, "installId")}
              publicSiteReactAdapters={publicSiteReactAdapters}
              runtimeProfile={runtimeProfile}
              slug={runtimeWildcardSiteSlug(params)}
            />
          )}
        </Route>
      ) : null}
      {publicSitePreview ? (
        <Route path={publicSitePreview.rootRoute}>
          {publicSitePreview.homeRoute ? (
            <Redirect replace to={publicSitePreview.homeRoute} />
          ) : (
            <PublicSiteRoute
              adapters={publicSiteReactAdapters}
              packageAppKey={publicSitePreview.packageAppKey}
              routeProps={{
                linkMode: publicSitePreview.linkMode,
                slug: publicSitePreview.homeSlug,
              }}
            />
          )}
        </Route>
      ) : null}
      {publicSitePreview ? (
        <Route path={publicSitePreview.routePattern}>
          {(params) => (
            <PublicSiteRoute
              adapters={publicSiteReactAdapters}
              packageAppKey={publicSitePreview.packageAppKey}
              routeProps={{
                linkMode: publicSitePreview.linkMode,
                slug: runtimeWildcardSiteSlug(params),
              }}
            />
          )}
        </Route>
      ) : null}
      <Route>
        <NotFoundRoute />
      </Route>
    </Switch>
  );

  return <Suspense fallback={<RouteLoading />}>{routes}</Suspense>;
}

function InstalledAppHomeRoute({
  installedAppRouteContext,
  installId,
  routeComponents,
  runtimeProfile,
  screenPath,
}: {
  installedAppRouteContext: RuntimeInstalledAppRouteContext;
  installId: string | undefined;
  routeComponents: AppRouteComponents;
  runtimeProfile: RuntimeProfile;
  screenPath: string;
}) {
  const { HomeRoute } = routeComponents;

  if (!installId) {
    return <NotFoundRoute />;
  }

  if (installedAppRouteContext.appInstalls === undefined) {
    return <RouteLoading />;
  }

  const world = installedAppWorldMountFromInstallId(
    runtimeProfile,
    installId,
    installedAppRouteContext,
  );

  if (!world) {
    return <NotFoundRoute />;
  }

  const install = installedAppRouteContext.appInstalls.find(
    (candidate) => candidate.installId === installId,
  );

  return (
    <OwnerRouteGuard access={world.access ?? "owner"}>
      <HomeRoute
        activePackageResolver={installedAppRouteContext.activePackageResolver}
        schemaKey={world.app.key}
        screenPath={screenPath}
        target={world.target}
        workspaceActions={siteWorkspaceLinkActionsForInstall(install)}
      />
    </OwnerRouteGuard>
  );
}

function siteWorkspaceLinkActionsForWorld(
  world: RuntimeWorldMount,
  publicSitePreview: RuntimeProfile["publicSitePreview"],
  installs: readonly AppInstall[] | undefined,
): readonly WorkspaceLinkActionContract[] {
  const installId = world.target?.kind === "appInstall" ? world.target.installId : undefined;
  const install = installId
    ? installs?.find((candidate) => candidate.installId === installId)
    : undefined;

  if (install) {
    return siteWorkspaceLinkActionsForInstall(install);
  }

  if (!publicSitePreview || world.app.key !== publicSitePreview.packageAppKey) {
    return [];
  }

  return siteWorkspaceLinkActions(publicSitePreview.homeRoute ?? publicSitePreview.rootRoute);
}

function siteWorkspaceLinkActionsForInstall(
  install: AppInstall | undefined,
): readonly WorkspaceLinkActionContract[] {
  if (!install) {
    return [];
  }

  const href =
    install.launchLinks?.find((link) => link.routeKind === "publicSite")?.href ??
    install.routes?.find((route) => route.enabled && route.routeKind === "publicSite")?.path ??
    install.publicRoute;

  return href ? siteWorkspaceLinkActions(href) : [];
}

function siteWorkspaceLinkActions(href: string): readonly WorkspaceLinkActionContract[] {
  return [
    {
      accessibilityLabel: "View site (opens in a new tab)",
      href,
      id: "view-site",
      kind: "workspaceLinkAction",
      label: "View site",
      prominence: "primary",
      target: "newTab",
    },
  ];
}

function InstalledSitePublicRoute({
  installedAppRouteContext,
  installId,
  publicSiteReactAdapters,
  runtimeProfile,
  slug,
}: {
  installedAppRouteContext: RuntimeInstalledAppRouteContext;
  installId: string | undefined;
  publicSiteReactAdapters: PublicSiteReactAdapterRegistry;
  runtimeProfile: RuntimeProfile;
  slug: string;
}) {
  if (!installId) {
    return <NotFoundRoute />;
  }

  if (installedAppRouteContext.appInstalls === undefined) {
    return <RouteLoading />;
  }

  const sitePath = runtimeInstalledSitePublicPath(runtimeProfile, installId, slug);

  if (!sitePath) {
    return <NotFoundRoute />;
  }

  const surface = installedSitePublicSurfaceFromRoute(
    runtimeProfile,
    sitePath,
    installedAppRouteContext,
  );

  if (!surface) {
    return <NotFoundRoute />;
  }

  return (
    <PublicSiteRoute
      adapters={publicSiteReactAdapters}
      packageAppKey={surface.target.packageAppKey}
      routeProps={{
        linkMode: "installed",
        routeBase: surface.routeBase,
        slug: surface.slug,
        target: surface.target,
      }}
    />
  );
}

function PublicSiteRoute({
  adapters,
  packageAppKey,
  routeProps,
}: {
  adapters: PublicSiteReactAdapterRegistry;
  packageAppKey: string;
  routeProps: PublicSiteRouteInputProps;
}) {
  const adapter = publicSiteReactAdapterForPackageAppKey(packageAppKey, adapters);

  if (!adapter) {
    return (
      <ApplicationSystemStateRuntime
        snapshot={projectApplicationSystemState({
          facts: [{ id: "package-app-key", label: "Package app", value: packageAppKey }],
          heading: "Unsupported public Site package",
          id: "application-system-state:unsupported-public-site-package",
          message: `Package app ${packageAppKey} has no registered public Site React adapter.`,
          state: "unavailable",
        })}
      />
    );
  }

  const RouteComponent = adapter.Route;
  const workspaceRenderer = routeProps.workspaceRenderer ?? adapter.workspaceRenderer;

  return (
    <RouteComponent
      {...routeProps}
      builtInRenderer={adapter.builtInRenderer}
      builtInSystemStateRenderer={adapter.builtInSystemStateRenderer}
      workspaceRenderer={workspaceRenderer}
    />
  );
}

function RouteLoading() {
  return (
    <ApplicationSystemStateRuntime
      snapshot={projectApplicationSystemState({
        heading: "Loading Formless",
        id: "application-system-state:route-loading",
        message: "Loading...",
        state: "loading",
      })}
    />
  );
}

function OwnerRouteGuard({
  access,
  children,
}: {
  access: RuntimeRouteAccess;
  children: ReactNode;
}) {
  const [location] = useLocation();
  const [state, setState] = useState<"authorized" | "checking" | "redirect">(() =>
    access === "owner" && typeof window !== "undefined" ? "checking" : "authorized",
  );

  useEffect(() => {
    if (access !== "owner") {
      setState("authorized");
      return;
    }

    const controller = new AbortController();
    let stopped = false;

    setState("checking");

    async function checkOwnerSession() {
      try {
        const { fetchOwnerSessionStatus } = await import("./app/routes/owner-login.tsx");
        const status = await fetchOwnerSessionStatus({ signal: controller.signal });

        if (!stopped) {
          setState(status.authenticated ? "authorized" : "redirect");
        }
      } catch {
        if (!stopped && !controller.signal.aborted) {
          setState("redirect");
        }
      }
    }

    void checkOwnerSession();

    return () => {
      stopped = true;
      controller.abort();
    };
  }, [access, location]);

  if (access !== "owner" || state === "authorized") {
    return <>{children}</>;
  }

  if (state === "redirect") {
    return <Redirect replace to={ownerLoginRedirectLocationForRoute(ownerRouteTarget(location))} />;
  }

  return <OwnerRouteLoading />;
}

function OwnerRouteLoading() {
  return (
    <ApplicationSystemStateRuntime
      snapshot={projectApplicationSystemState({
        heading: "Checking owner access",
        id: "application-system-state:owner-access",
        message: "Checking owner access...",
        state: "loading",
      })}
    />
  );
}

function ownerRouteTarget(location: string): OwnerLoginRedirectTarget {
  if (typeof window === "undefined") {
    return ownerRouteTargetFromLocation(location);
  }

  return ownerRouteTargetFromLocation(`${window.location.pathname}${window.location.search}`);
}

function ownerRouteTargetFromLocation(location: string): OwnerLoginRedirectTarget {
  return location.startsWith("/") ? (location as OwnerLoginRedirectTarget) : "/";
}

function runtimeScreenWildcardRoute(world: RuntimeWorldMount): `/${string}` {
  return world.route === "/" ? "/*" : `${world.route}/*`;
}

function runtimeWildcardScreenPath(params: unknown): string {
  const wildcard = (params as { "*": string | undefined })["*"];

  return `/${wildcard ?? ""}`;
}

function runtimeWildcardSiteSlug(params: unknown): string {
  const wildcard = (params as { "*": string | undefined })["*"];

  return normalizeSitePageSlug(wildcard);
}

function runtimeRouteParam(params: unknown, name: string): string | undefined {
  const value = (params as Record<string, string | undefined>)[name];

  return value;
}
