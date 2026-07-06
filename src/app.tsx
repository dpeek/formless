import {
  lazy,
  Suspense,
  type CSSProperties,
  type ElementType,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, Redirect, Route, Switch, useLocation } from "wouter";
import { NotFoundRoute } from "./app/routes/not-found.tsx";
import { normalizeSitePageSlug } from "@dpeek/formless-site-app/react";
import {
  createPublicSiteReactAdapterRegistry,
  publicSiteReactAdapterForPackageAppKey,
  type PublicSiteReactAdapterRegistry,
  type PublicSiteRouteProps,
} from "./app/public-site-runtime.tsx";
import type { GeneratedAppFrameProps } from "./app/generated-app-frame.tsx";
import { sitePublicRenderer as workspaceSitePublicRenderer } from "virtual:formless/site-public-renderer/browser";
import {
  findRuntimeWorldMountByRoute,
  hasGeneratedRoutes,
  installedAppWorldMountFromInstall,
  installedAppWorldMountFromInstallId,
  installedSitePublicSurfaceFromRoute,
  normalizeRuntimeBrowserPath,
  resolveRuntimeProfile,
  runtimeBrowserRoutePatterns,
  runtimeInstalledSitePublicHomeSlug,
  runtimeInstalledSitePublicPath,
  runtimeProfileNeedsInstalledAppRouteInstalls,
  runtimeProfileWithActivePackageResolver,
  shouldRenderRuntimeRouteOutsideGeneratedAppFrame,
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
  PackageAppKey,
} from "@dpeek/formless-installed-apps";
import {
  COLLABORATOR_INVITATION_ACCEPT_PATH,
  ownerLoginRedirectLocationForRoute,
  type OwnerLoginRedirectTarget,
} from "./shared/instance-auth.ts";
import { runtimeTopologyRoutes, type RuntimeRouteAccess } from "./shared/runtime-topology.ts";
import type { AppInstallsResponse } from "./shared/protocol.ts";

type HomeRouteProps = {
  activePackageResolver?: AppPackageResolver | undefined;
  sectionOperationControls?: Record<string, ReactNode>;
  target?: ClientAppTarget;
  schemaKey: ClientAppSchemaKey;
  screenPath: string;
};

type InstanceShellRouteProps = {
  homeRouteComponent: ElementType<HomeRouteProps>;
  localWorkspaceGatewayAvailable?: boolean | undefined;
};

export type RuntimeInstalledAppRouteRegistry = {
  activePackageResolver?: AppPackageResolver | undefined;
  installs: readonly AppInstall[];
  packages: readonly InstallableAppPackage[];
};

export type AppRouteComponents = {
  AuthAccountRoute: ElementType;
  CollaboratorInvitationAcceptanceRoute: ElementType;
  GeneratedAppFrame: ElementType<GeneratedAppFrameProps>;
  HomeRoute: ElementType<HomeRouteProps>;
  InstanceShellRoute: ElementType<InstanceShellRouteProps>;
  LocalSessionRoute: ElementType;
  OwnerLoginRoute: ElementType;
  OwnerSetupRoute: ElementType;
  SitePageRoute: ElementType<PublicSiteRouteProps>;
  publicSiteReactAdapters?: PublicSiteReactAdapterRegistry;
};

const defaultPublicSiteReactAdapters = createPublicSiteReactAdapterRegistry(
  undefined,
  workspaceSitePublicRenderer,
);

const defaultRouteComponents: AppRouteComponents = {
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
  GeneratedAppFrame: lazy(() =>
    import("./app/generated-app-frame.tsx").then((module) => ({
      default: module.GeneratedAppFrame,
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
  const localWorkspaceGatewayAvailable = useLocalWorkspaceGatewayAvailable(
    localWorkspaceGatewayAvailableProp,
    routeMayNeedLocalWorkspaceGateway(browserRoutes, normalizedLocation),
  );
  const routeContext = useMemo(
    () => ({ ...installedAppRouteContext, localWorkspaceGatewayAvailable }),
    [installedAppRouteContext, localWorkspaceGatewayAvailable],
  );
  const routeWorld = findRuntimeWorldMountByRoute(activeRuntimeProfile, location, routeContext);
  const isInstanceShellRoute = normalizedLocation === browserRoutes.instanceShellRoute;
  const routeRegistryLoading =
    runtimeProfile.appProfileTarget !== undefined &&
    runtimeProfile.worlds.length === 0 &&
    installedAppRouteRegistry === undefined;

  if (routeRegistryLoading) {
    return (
      <main className="min-h-dvh">
        <RouteLoading />
      </main>
    );
  }

  if (
    shouldRenderRuntimeRouteOutsideGeneratedAppFrame(
      activeRuntimeProfile,
      location,
      routeWorld,
      routeContext,
    )
  ) {
    return (
      <main className="min-h-dvh">
        <AppRoutes
          installedAppRouteContext={installedAppRouteContext}
          localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailable}
          routeComponents={routeComponents}
          runtimeProfile={activeRuntimeProfile}
        />
      </main>
    );
  }

  const GeneratedAppFrame = routeComponents.GeneratedAppFrame;
  const generatedAppFrame = (
    <Suspense fallback={<RouteLoading />}>
      <GeneratedAppFrame
        activePackageResolver={installedAppRouteContext.activePackageResolver}
        currentPath={location}
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
      </GeneratedAppFrame>
    </Suspense>
  );

  return activeRuntimeProfile.shell === "dev" ? (
    <WorkbenchFrame
      activePackageResolver={installedAppRouteRegistry?.activePackageResolver}
      currentPath={location}
      installedAppRouteInstalls={installedAppRouteInstalls}
      routeWorld={routeWorld}
      runtimeProfile={activeRuntimeProfile}
    >
      {isInstanceShellRoute ? (
        <main className="bg-bg" data-frame="instance-shell">
          <AppRoutes
            installedAppRouteContext={installedAppRouteContext}
            localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailable}
            routeComponents={routeComponents}
            runtimeProfile={activeRuntimeProfile}
          />
        </main>
      ) : routeWorld === undefined ? (
        <main className="bg-bg">
          <AppRoutes
            installedAppRouteContext={installedAppRouteContext}
            localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailable}
            routeComponents={routeComponents}
            runtimeProfile={activeRuntimeProfile}
          />
        </main>
      ) : (
        generatedAppFrame
      )}
    </WorkbenchFrame>
  ) : (
    generatedAppFrame
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

function WorkbenchFrame({
  activePackageResolver,
  children,
  currentPath,
  installedAppRouteInstalls,
  routeWorld,
  runtimeProfile,
}: {
  activePackageResolver?: AppPackageResolver | undefined;
  children: ReactNode;
  currentPath: string;
  installedAppRouteInstalls: readonly AppInstall[] | undefined;
  routeWorld: RuntimeWorldMount | undefined;
  runtimeProfile: RuntimeProfile;
}) {
  const installedAppLinks = useRuntimeShellInstalledAppLinks(
    runtimeProfile,
    routeWorld,
    installedAppRouteInstalls,
    activePackageResolver,
  );
  const appManagementIsCurrent = normalizeRuntimeBrowserPath(currentPath) === "/";

  return (
    <div
      className="min-h-dvh bg-slate-950"
      data-frame="workbench"
      style={{ "--runtime-shell-height": "3.5rem" } as CSSProperties}
    >
      <header
        aria-label="Runtime shell"
        className="fixed inset-x-0 top-0 z-[60] overflow-x-auto border-b border-slate-800 bg-slate-950 text-slate-100 shadow-lg shadow-black/25"
        data-frame="runtime-shell"
      >
        <div className="flex h-14 min-w-max items-center justify-between gap-4 px-3 sm:px-4">
          <nav aria-label="Runtime apps" className="flex items-center gap-1">
            <Link
              aria-current={appManagementIsCurrent ? "page" : undefined}
              className={workbenchAppLinkClassName(appManagementIsCurrent)}
              href="/"
            >
              App management
            </Link>
            {runtimeProfile.worlds.map(({ app, route }) => (
              <Link
                aria-current={routeWorld?.route === route ? "page" : undefined}
                className={workbenchAppLinkClassName(routeWorld?.route === route)}
                href={route}
                key={app.key}
              >
                {app.label}
              </Link>
            ))}
            {installedAppLinks.length > 0 ? (
              <span aria-hidden="true" className="mx-1 h-4 w-px bg-slate-700" />
            ) : null}
            {installedAppLinks.map((link) => (
              <Link
                aria-current={link.isCurrent ? "page" : undefined}
                className={workbenchAppLinkClassName(link.isCurrent)}
                href={link.href}
                key={link.key}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <div
        className="min-h-dvh bg-bg pt-[var(--runtime-shell-height)] text-fg"
        data-frame="workbench-content"
      >
        {children}
      </div>
    </div>
  );
}

function workbenchAppLinkClassName(isActive: boolean) {
  const base = "flex h-7 items-center rounded px-2 text-xs font-medium transition-colors";

  return isActive
    ? `${base} bg-slate-100 text-slate-950`
    : `${base} text-slate-300 hover:bg-slate-800 hover:text-white`;
}

export type RuntimeShellInstalledAppLink = {
  href: `/apps/${string}`;
  installId: string;
  isCurrent: boolean;
  key: string;
  label: string;
  packageAppKey: PackageAppKey;
};

export function selectRuntimeShellInstalledAppLinks({
  activePackageResolver,
  installs,
  routeWorld,
  runtimeProfile,
}: {
  activePackageResolver?: AppPackageResolver | undefined;
  installs: readonly AppInstall[];
  routeWorld: RuntimeWorldMount | undefined;
  runtimeProfile: RuntimeProfile;
}): RuntimeShellInstalledAppLink[] {
  if (
    runtimeProfile.shell !== "dev" ||
    !runtimeBrowserRoutePatterns(runtimeProfile).installedAppHomeRoutePattern
  ) {
    return [];
  }

  const currentInstall =
    routeWorld?.target?.kind === "appInstall"
      ? {
          href: routeWorld.route as `/apps/${string}`,
          installId: routeWorld.target.installId,
          label: `${routeWorld.app.label} ${routeWorld.target.installId}`,
          packageAppKey: routeWorld.app.key,
        }
      : undefined;
  const links = installs.flatMap((install) => {
    const world = installedAppWorldMountFromInstall(runtimeProfile, install, {
      activePackageResolver,
    });

    return world
      ? [
          {
            href: world.route as `/apps/${string}`,
            installId: install.installId,
            label: install.label,
            packageAppKey: install.packageAppKey,
          },
        ]
      : [];
  });

  if (currentInstall && !links.some((link) => link.installId === currentInstall.installId)) {
    links.push(currentInstall);
  }

  return links.map((link) => ({
    ...link,
    isCurrent:
      routeWorld?.target?.kind === "appInstall" && routeWorld.target.installId === link.installId,
    key: `${link.packageAppKey}:${link.installId}`,
  }));
}

function useRuntimeShellInstalledAppLinks(
  runtimeProfile: RuntimeProfile,
  routeWorld: RuntimeWorldMount | undefined,
  installs: readonly AppInstall[] | undefined,
  activePackageResolver: AppPackageResolver | undefined,
): RuntimeShellInstalledAppLink[] {
  return useMemo(
    () =>
      selectRuntimeShellInstalledAppLinks({
        activePackageResolver,
        installs: installs ?? [],
        routeWorld,
        runtimeProfile,
      }),
    [activePackageResolver, installs, routeWorld, runtimeProfile],
  );
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
    createPublicSiteReactAdapterRegistry(routeComponents.SitePageRoute);
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
      <Route path={runtimeTopologyRoutes.authAccountGateRoutePattern}>
        <AuthAccountRoute />
      </Route>
      {browserRoutes.ownerSetupRoute ? (
        <Route path={browserRoutes.ownerSetupRoute}>
          <OwnerSetupRoute />
        </Route>
      ) : null}
      {browserRoutes.ownerLoginRoute ? (
        <Route path={browserRoutes.ownerLoginRoute}>
          <OwnerLoginRoute />
        </Route>
      ) : null}
      {browserRoutes.localSessionRoute && localWorkspaceGatewayAvailable ? (
        <Route path={browserRoutes.localSessionRoute}>
          <LocalSessionRoute />
        </Route>
      ) : null}
      {browserRoutes.instanceShellRoute ? (
        <Route path={browserRoutes.instanceShellRoute}>
          <OwnerRouteGuard access="owner">
            <InstanceShellRoute
              homeRouteComponent={HomeRoute}
              localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailable}
            />
          </OwnerRouteGuard>
        </Route>
      ) : null}
      {browserRoutes.instanceAccessRoute ? (
        <Route path={browserRoutes.instanceAccessRoute}>
          <OwnerRouteGuard access="authenticated">
            <InstanceShellRoute
              homeRouteComponent={HomeRoute}
              localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailable}
            />
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

  return (
    <OwnerRouteGuard access={world.access ?? "owner"}>
      <HomeRoute
        activePackageResolver={installedAppRouteContext.activePackageResolver}
        schemaKey={world.app.key}
        screenPath={screenPath}
        target={world.target}
      />
    </OwnerRouteGuard>
  );
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
  routeProps: PublicSiteRouteProps;
}) {
  const adapter = publicSiteReactAdapterForPackageAppKey(packageAppKey, adapters);

  if (!adapter) {
    return (
      <section className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Unsupported public Site package</h1>
        <p className="mt-2 text-sm text-slate-600">
          Package app <code>{packageAppKey}</code> has no registered public Site React adapter.
        </p>
      </section>
    );
  }

  const RouteComponent = adapter.Route;
  const renderer = routeProps.renderer ?? adapter.renderer;

  return <RouteComponent {...routeProps} renderer={renderer} />;
}

function RouteLoading() {
  return <p className="text-sm text-muted-fg">Loading...</p>;
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
  return <p className="text-sm text-muted-fg">Checking owner access...</p>;
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
