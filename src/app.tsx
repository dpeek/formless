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
import { ActiveAppSurface } from "./app/app-surface.tsx";
import { InstanceShellRoute } from "./app/routes/instance-shell.tsx";
import { NotFoundRoute } from "./app/routes/not-found.tsx";
import { OwnerLoginRoute, fetchOwnerSessionStatus } from "./app/routes/owner-login.tsx";
import { OwnerSetupRoute } from "./app/routes/owner-setup.tsx";
import { normalizeSitePageSlug } from "@dpeek/formless-site-app/react";
import {
  createPublicSiteReactAdapterRegistry,
  publicSiteReactAdapterForPackageAppKey,
  type PublicSiteReactAdapterRegistry,
  type PublicSiteRouteProps,
} from "./app/public-site-runtime.tsx";
import {
  findRuntimeWorldMountByRoute,
  hasGeneratedRoutes,
  installedAppWorldMountFromInstall,
  installedAppWorldMountFromInstallId,
  installedSitePublicSurfaceFromRoute,
  normalizeRuntimeBrowserPath,
  resolveRuntimeProfile,
  runtimeAppManagementHref,
  runtimeBrowserRoutePatterns,
  runtimeInstalledSitePublicHomeSlug,
  runtimeInstalledSitePublicPath,
  runtimeProfileNeedsInstalledAppRouteInstalls,
  runtimeScreenPathFromRoute,
  shouldRenderRuntimeRouteOutsideGeneratedAppFrame,
  type RuntimeProfile,
  type RuntimeWorldMount,
} from "./app/runtime-profile.ts";
import { fetchInstanceAppInstalls } from "./client/app-installs.ts";
import { useActiveClientStorageName, useActiveSchemaKey, useSchema } from "./client/store.ts";
import { workspaceGatewayBrowserConfig } from "@dpeek/formless-gateway/client";
import {
  appStorageIdentityForClientTarget,
  clientTargetSourceSchemaKey,
  type ClientAppTarget,
} from "./client/app-target.ts";
import type { AppInstall, PackageAppKey } from "@dpeek/formless-installed-apps";
import {
  ownerLoginRedirectLocationForRoute,
  type OwnerLoginRedirectTarget,
} from "./shared/instance-auth.ts";
import type { RuntimeRouteAccess } from "./shared/runtime-topology.ts";
import type { SchemaKey } from "./shared/schema-apps.ts";
import { selectPrimaryScreenModels } from "./client/views.ts";

type HomeRouteProps = {
  target?: ClientAppTarget;
  schemaKey: SchemaKey;
  screenPath: string;
};
type SchemaRouteProps = { target?: ClientAppTarget; schemaKey: SchemaKey };

export type AppRouteComponents = {
  HomeRoute: ElementType<HomeRouteProps>;
  SchemaRoute: ElementType<SchemaRouteProps>;
  SitePageRoute: ElementType<PublicSiteRouteProps>;
  publicSiteReactAdapters?: PublicSiteReactAdapterRegistry;
};

const defaultRouteComponents: AppRouteComponents = {
  HomeRoute: lazy(() =>
    import("./app/routes/home.tsx").then((module) => ({ default: module.HomeRoute })),
  ),
  SchemaRoute: lazy(() =>
    import("./app/routes/schema.tsx").then((module) => ({ default: module.SchemaRoute })),
  ),
  SitePageRoute: createPublicSiteReactAdapterRegistry().get("site")!.Route,
};

export function App({
  installedAppRouteInstalls: installedAppRouteInstallsProp,
  localWorkspaceGatewayAvailable: localWorkspaceGatewayAvailableProp,
  routeComponents = defaultRouteComponents,
  runtimeProfile: runtimeProfileProp,
}: {
  installedAppRouteInstalls?: readonly AppInstall[];
  localWorkspaceGatewayAvailable?: boolean;
  routeComponents?: AppRouteComponents;
  runtimeProfile?: RuntimeProfile;
} = {}) {
  const [location] = useLocation();
  const runtimeProfile = useMemo(
    () => runtimeProfileProp ?? resolveRuntimeProfile(),
    [runtimeProfileProp],
  );
  const installedAppRouteInstalls = useRuntimeInstalledAppRouteInstalls(
    runtimeProfile,
    installedAppRouteInstallsProp,
    location,
  );
  const localWorkspaceGatewayAvailable =
    localWorkspaceGatewayAvailableProp ?? workspaceGatewayBrowserConfig() !== undefined;
  const routeContext = useMemo(
    () => ({ appInstalls: installedAppRouteInstalls, localWorkspaceGatewayAvailable }),
    [installedAppRouteInstalls, localWorkspaceGatewayAvailable],
  );
  const routeWorld = findRuntimeWorldMountByRoute(runtimeProfile, location, routeContext);
  const browserRoutes = useMemo(
    () => runtimeBrowserRoutePatterns(runtimeProfile, routeContext),
    [routeContext, runtimeProfile],
  );
  const normalizedLocation = normalizeRuntimeBrowserPath(location);
  const routeApp = routeWorld?.app;
  const activeClientStorageName = useActiveClientStorageName();
  const activeSchemaKey = useActiveSchemaKey();
  const activeSchema = useSchema();
  const routeAppTargetIdentity = routeWorld
    ? appStorageIdentityForClientTarget(routeWorld.target ?? routeWorld.app.key)
    : undefined;
  const routeAppSchemaKey = routeWorld
    ? clientTargetSourceSchemaKey(routeWorld.target ?? routeWorld.app.key)
    : undefined;
  const routeStoreMatchesTarget =
    activeClientStorageName === null ||
    (routeAppTargetIdentity !== undefined &&
      activeClientStorageName === routeAppTargetIdentity.browserDatabaseName);
  const routeAppSchema =
    routeApp &&
    routeStoreMatchesTarget &&
    (activeSchemaKey === null || activeSchemaKey === routeAppSchemaKey)
      ? activeSchema
      : null;
  const routeAppScreenModels = useMemo(
    () => (routeAppSchema ? selectPrimaryScreenModels(routeAppSchema) : []),
    [routeAppSchema],
  );
  const activeScreenPath = routeWorld
    ? runtimeScreenPathFromRoute(routeWorld, location)
    : undefined;
  const isInstanceShellRoute =
    normalizedLocation === browserRoutes.instanceShellRoute ||
    normalizedLocation === browserRoutes.instanceDeploymentsRoute;

  if (
    shouldRenderRuntimeRouteOutsideGeneratedAppFrame(
      runtimeProfile,
      location,
      routeWorld,
      routeContext,
    )
  ) {
    return (
      <main className="min-h-dvh">
        <AppRoutes
          installedAppRouteInstalls={installedAppRouteInstalls}
          localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailable}
          routeComponents={routeComponents}
          runtimeProfile={runtimeProfile}
        />
      </main>
    );
  }

  const generatedAppFrame = (
    <ActiveAppSurface
      activeScreenPath={activeScreenPath}
      managementHref={runtimeAppManagementHref(runtimeProfile, routeWorld)}
      currentPath={location}
      screenModels={routeAppScreenModels}
      world={routeWorld}
    >
      <AppRoutes
        installedAppRouteInstalls={installedAppRouteInstalls}
        localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailable}
        routeComponents={routeComponents}
        runtimeProfile={runtimeProfile}
      />
    </ActiveAppSurface>
  );

  return runtimeProfile.shell === "dev" ? (
    <WorkbenchFrame
      currentPath={location}
      installedAppRouteInstalls={installedAppRouteInstalls}
      routeWorld={routeWorld}
      runtimeProfile={runtimeProfile}
    >
      {isInstanceShellRoute ? (
        <main className="bg-bg" data-frame="instance-shell">
          <AppRoutes
            installedAppRouteInstalls={installedAppRouteInstalls}
            localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailable}
            routeComponents={routeComponents}
            runtimeProfile={runtimeProfile}
          />
        </main>
      ) : routeWorld === undefined ? (
        <main className="bg-bg">
          <AppRoutes
            installedAppRouteInstalls={installedAppRouteInstalls}
            localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailable}
            routeComponents={routeComponents}
            runtimeProfile={runtimeProfile}
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

function useRuntimeInstalledAppRouteInstalls(
  runtimeProfile: RuntimeProfile,
  initialInstalls: readonly AppInstall[] | undefined,
  refreshKey: string,
): AppInstall[] | undefined {
  const shouldLoad = runtimeProfileNeedsInstalledAppRouteInstalls(runtimeProfile);
  const [installs, setInstalls] = useState<AppInstall[] | undefined>(() =>
    initialInstalls ? [...initialInstalls] : shouldLoad ? undefined : [],
  );

  useEffect(() => {
    if (initialInstalls) {
      setInstalls([...initialInstalls]);
      return;
    }

    if (!shouldLoad) {
      setInstalls([]);
      return;
    }

    const controller = new AbortController();
    let stopped = false;

    setInstalls(undefined);

    async function loadInstalls() {
      try {
        const response = await fetchInstanceAppInstalls({ signal: controller.signal });

        if (!stopped) {
          setInstalls(response.installs);
        }
      } catch {
        if (!stopped && !controller.signal.aborted) {
          setInstalls([]);
        }
      }
    }

    void loadInstalls();

    return () => {
      stopped = true;
      controller.abort();
    };
  }, [initialInstalls, refreshKey, shouldLoad]);

  return installs;
}

function WorkbenchFrame({
  children,
  currentPath,
  installedAppRouteInstalls,
  routeWorld,
  runtimeProfile,
}: {
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
  installs,
  routeWorld,
  runtimeProfile,
}: {
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
    const world = installedAppWorldMountFromInstall(runtimeProfile, install);

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
): RuntimeShellInstalledAppLink[] {
  return useMemo(
    () =>
      selectRuntimeShellInstalledAppLinks({
        installs: installs ?? [],
        routeWorld,
        runtimeProfile,
      }),
    [installs, routeWorld, runtimeProfile],
  );
}

function AppRoutes({
  installedAppRouteInstalls,
  localWorkspaceGatewayAvailable,
  routeComponents,
  runtimeProfile,
}: {
  installedAppRouteInstalls: readonly AppInstall[] | undefined;
  localWorkspaceGatewayAvailable: boolean;
  routeComponents: AppRouteComponents;
  runtimeProfile: RuntimeProfile;
}) {
  const { HomeRoute, SchemaRoute } = routeComponents;
  const publicSiteReactAdapters =
    routeComponents.publicSiteReactAdapters ??
    createPublicSiteReactAdapterRegistry(routeComponents.SitePageRoute);
  const generatedWorlds = runtimeProfile.worlds.filter(hasGeneratedRoutes);
  const browserRoutes = runtimeBrowserRoutePatterns(runtimeProfile, {
    localWorkspaceGatewayAvailable,
  });
  const publishedSite = runtimeProfile.publishedSite;
  const publicSitePreview = runtimeProfile.publicSitePreview;
  const hasLazyGeneratedRoutes =
    generatedWorlds.length > 0 || browserRoutes.installedAppHomeRoutePattern !== undefined;
  const routes = (
    <Switch>
      {runtimeProfile.defaultRedirect ? (
        <Route path="/">
          <Redirect replace to={runtimeProfile.defaultRedirect} />
        </Route>
      ) : null}
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
      {browserRoutes.instanceDeploymentsRoute ? (
        <Route path={browserRoutes.instanceDeploymentsRoute}>
          <OwnerRouteGuard access="owner">
            <InstanceShellRoute localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailable} />
          </OwnerRouteGuard>
        </Route>
      ) : null}
      {browserRoutes.instanceShellRoute ? (
        <Route path={browserRoutes.instanceShellRoute}>
          <OwnerRouteGuard access="owner">
            <InstanceShellRoute localWorkspaceGatewayAvailable={localWorkspaceGatewayAvailable} />
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
      {generatedWorlds.map((world) =>
        world.schemaRoute ? (
          <Route key={world.schemaRoute} path={world.schemaRoute}>
            <OwnerRouteGuard access={world.schemaRouteAccess ?? "anonymous"}>
              <SchemaRoute schemaKey={world.app.key} target={world.target} />
            </OwnerRouteGuard>
          </Route>
        ) : null,
      )}
      {generatedWorlds.map((world) => (
        <Route key={world.route} path={world.route}>
          <OwnerRouteGuard access={world.access ?? "anonymous"}>
            <HomeRoute schemaKey={world.app.key} screenPath="/" target={world.target} />
          </OwnerRouteGuard>
        </Route>
      ))}
      {generatedWorlds.map((world) => (
        <Route key={`${world.route}/*`} path={runtimeScreenWildcardRoute(world)}>
          {(params) => (
            <OwnerRouteGuard access={world.access ?? "anonymous"}>
              <HomeRoute
                schemaKey={world.app.key}
                screenPath={runtimeWildcardScreenPath(params)}
                target={world.target}
              />
            </OwnerRouteGuard>
          )}
        </Route>
      ))}
      {browserRoutes.installedAppSchemaRoutePattern ? (
        <Route path={browserRoutes.installedAppSchemaRoutePattern}>
          {(params) => (
            <InstalledAppSchemaRoute
              installedAppRouteInstalls={installedAppRouteInstalls}
              installId={runtimeRouteParam(params, "installId")}
              routeComponents={routeComponents}
              runtimeProfile={runtimeProfile}
            />
          )}
        </Route>
      ) : null}
      {browserRoutes.installedAppHomeRoutePattern ? (
        <Route path={browserRoutes.installedAppHomeRoutePattern}>
          {(params) => (
            <InstalledAppHomeRoute
              installedAppRouteInstalls={installedAppRouteInstalls}
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
              installedAppRouteInstalls={installedAppRouteInstalls}
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
              installedAppRouteInstalls={installedAppRouteInstalls}
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
              installedAppRouteInstalls={installedAppRouteInstalls}
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

  return hasLazyGeneratedRoutes ? (
    <Suspense fallback={<RouteLoading />}>{routes}</Suspense>
  ) : (
    routes
  );
}

function InstalledAppSchemaRoute({
  installedAppRouteInstalls,
  installId,
  routeComponents,
  runtimeProfile,
}: {
  installedAppRouteInstalls: readonly AppInstall[] | undefined;
  installId: string | undefined;
  routeComponents: AppRouteComponents;
  runtimeProfile: RuntimeProfile;
}) {
  const { SchemaRoute } = routeComponents;

  if (!installId) {
    return <NotFoundRoute />;
  }

  if (installedAppRouteInstalls === undefined) {
    return <RouteLoading />;
  }

  const world = installedAppWorldMountFromInstallId(runtimeProfile, installId, {
    appInstalls: installedAppRouteInstalls,
  });

  if (!world?.schemaRoute) {
    return <NotFoundRoute />;
  }

  return (
    <OwnerRouteGuard access={world.schemaRouteAccess ?? "owner"}>
      <SchemaRoute schemaKey={world.app.key} target={world.target} />
    </OwnerRouteGuard>
  );
}

function InstalledAppHomeRoute({
  installedAppRouteInstalls,
  installId,
  routeComponents,
  runtimeProfile,
  screenPath,
}: {
  installedAppRouteInstalls: readonly AppInstall[] | undefined;
  installId: string | undefined;
  routeComponents: AppRouteComponents;
  runtimeProfile: RuntimeProfile;
  screenPath: string;
}) {
  const { HomeRoute } = routeComponents;

  if (!installId) {
    return <NotFoundRoute />;
  }

  if (installedAppRouteInstalls === undefined) {
    return <RouteLoading />;
  }

  const world = installedAppWorldMountFromInstallId(runtimeProfile, installId, {
    appInstalls: installedAppRouteInstalls,
  });

  if (!world || (!world.schemaRoute && screenPath === "/schema")) {
    return <NotFoundRoute />;
  }

  return (
    <OwnerRouteGuard access={world.access ?? "owner"}>
      <HomeRoute schemaKey={world.app.key} screenPath={screenPath} target={world.target} />
    </OwnerRouteGuard>
  );
}

function InstalledSitePublicRoute({
  installedAppRouteInstalls,
  installId,
  publicSiteReactAdapters,
  runtimeProfile,
  slug,
}: {
  installedAppRouteInstalls: readonly AppInstall[] | undefined;
  installId: string | undefined;
  publicSiteReactAdapters: PublicSiteReactAdapterRegistry;
  runtimeProfile: RuntimeProfile;
  slug: string;
}) {
  if (!installId) {
    return <NotFoundRoute />;
  }

  if (installedAppRouteInstalls === undefined) {
    return <RouteLoading />;
  }

  const sitePath = runtimeInstalledSitePublicPath(runtimeProfile, installId, slug);

  if (!sitePath) {
    return <NotFoundRoute />;
  }

  const surface = installedSitePublicSurfaceFromRoute(runtimeProfile, sitePath, {
    appInstalls: installedAppRouteInstalls,
  });

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

  return <RouteComponent {...routeProps} />;
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
