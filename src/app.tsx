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
import { OwnerSetupRoute } from "./app/routes/owner-setup.tsx";
import {
  SitePageRoute as DefaultSitePageRoute,
  normalizeSitePageSlug,
} from "./app/routes/site-page.tsx";
import type { SitePageLinkMode } from "./app/site-renderer/links.ts";
import {
  findRuntimeWorldMountByRoute,
  hasGeneratedRoutes,
  installedAppWorldMountFromInstall,
  installedAppWorldMountFromInstallId,
  installedSitePublicSurfaceFromRoute,
  isInstalledSitePublicRoutePath,
  isRuntimePublicSiteRoute,
  resolveRuntimeProfile,
  runtimeScreenPathFromRoute,
  type RuntimeProfile,
  type RuntimeWorldMount,
} from "./app/runtime-profile.ts";
import { fetchInstanceAppInstalls } from "./client/app-installs.ts";
import { useActiveClientStorageName, useActiveSchemaKey, useSchema } from "./client/store.ts";
import { appStorageIdentityForClientTarget, type ClientAppTarget } from "./client/app-target.ts";
import type { AppInstall } from "./shared/app-installs.ts";
import type { SchemaKey } from "./shared/schema-apps.ts";
import { selectPrimaryScreenModels } from "./client/views.ts";

type HomeRouteProps = { target?: ClientAppTarget; schemaKey: SchemaKey; screenPath: string };
type SchemaRouteProps = { target?: ClientAppTarget; schemaKey: SchemaKey };
type SitePageRouteProps = {
  linkMode?: SitePageLinkMode;
  routeBase?: `/${string}`;
  slug: string;
  target?: ClientAppTarget;
};

export type AppRouteComponents = {
  HomeRoute: ElementType<HomeRouteProps>;
  SchemaRoute: ElementType<SchemaRouteProps>;
  SitePageRoute: ElementType<SitePageRouteProps>;
};

const defaultRouteComponents: AppRouteComponents = {
  HomeRoute: lazy(() =>
    import("./app/routes/home.tsx").then((module) => ({ default: module.HomeRoute })),
  ),
  SchemaRoute: lazy(() =>
    import("./app/routes/schema.tsx").then((module) => ({ default: module.SchemaRoute })),
  ),
  SitePageRoute: DefaultSitePageRoute,
};

export function App({
  installedAppRouteInstalls: installedAppRouteInstallsProp,
  routeComponents = defaultRouteComponents,
  runtimeProfile: runtimeProfileProp,
}: {
  installedAppRouteInstalls?: readonly AppInstall[];
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
  const routeContext = useMemo(
    () => ({ appInstalls: installedAppRouteInstalls }),
    [installedAppRouteInstalls],
  );
  const isPublicSiteRoute = isRuntimePublicSiteRoute(runtimeProfile, location, routeContext);
  const isPotentialInstalledSitePublicRoute = isInstalledSitePublicRoutePath(
    runtimeProfile,
    location,
  );
  const routeWorld = findRuntimeWorldMountByRoute(runtimeProfile, location, routeContext);
  const routeApp = routeWorld?.app;
  const activeClientStorageName = useActiveClientStorageName();
  const activeSchemaKey = useActiveSchemaKey();
  const activeSchema = useSchema();
  const routeAppTargetIdentity = routeWorld
    ? appStorageIdentityForClientTarget(routeWorld.target ?? routeWorld.app.key)
    : undefined;
  const routeStoreMatchesTarget =
    activeClientStorageName === null ||
    (routeAppTargetIdentity !== undefined &&
      activeClientStorageName === routeAppTargetIdentity.browserDatabaseName);
  const routeAppSchema =
    routeApp &&
    routeStoreMatchesTarget &&
    (activeSchemaKey === null || activeSchemaKey === routeAppTargetIdentity?.sourceSchemaKey)
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
    runtimeProfile.instanceShell === true && normalizeRoutePath(location) === "/";
  const isOwnerSetupRoute =
    isOwnerSetupRouteEnabled(runtimeProfile) && normalizeRoutePath(location) === "/setup";

  if (
    isOwnerSetupRoute ||
    isPublicSiteRoute ||
    isPotentialInstalledSitePublicRoute ||
    runtimeProfile.shell === "publishedSite" ||
    (runtimeProfile.shell === "instance" && (isInstanceShellRoute || !routeWorld))
  ) {
    return (
      <main className="min-h-dvh">
        <AppRoutes
          installedAppRouteInstalls={installedAppRouteInstalls}
          routeComponents={routeComponents}
          runtimeProfile={runtimeProfile}
        />
      </main>
    );
  }

  const generatedAppFrame = (
    <ActiveAppSurface
      activeScreenPath={activeScreenPath}
      localPublish={localPublishForWorld(runtimeProfile, routeWorld)}
      managementHref={appManagementHref(runtimeProfile, routeWorld)}
      currentPath={location}
      screenModels={routeAppScreenModels}
      world={routeWorld}
    >
      <AppRoutes
        installedAppRouteInstalls={installedAppRouteInstalls}
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
            routeComponents={routeComponents}
            runtimeProfile={runtimeProfile}
          />
        </main>
      ) : routeWorld === undefined ? (
        <main className="bg-bg">
          <AppRoutes
            installedAppRouteInstalls={installedAppRouteInstalls}
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
  const shouldLoad =
    runtimeProfile.installedAppRoutes !== undefined ||
    runtimeProfile.installedSitePublicRoutes !== undefined;
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
  const appManagementIsCurrent = normalizeRoutePath(currentPath) === "/";

  return (
    <div
      className="min-h-dvh bg-slate-950"
      data-frame="workbench"
      style={{ "--runtime-shell-height": "3.5rem" } as CSSProperties}
    >
      <div
        className="min-h-[calc(100dvh-var(--runtime-shell-height))] bg-bg pb-[var(--runtime-shell-height)] text-fg"
        data-frame="workbench-content"
      >
        {children}
      </div>
      <footer
        aria-label="Runtime shell"
        className="fixed inset-x-0 bottom-0 z-[60] overflow-x-auto border-t border-slate-800 bg-slate-950 text-slate-100 shadow-lg shadow-black/25"
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
      </footer>
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
  packageAppKey: SchemaKey;
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
  const installedAppRoutes = runtimeProfile.installedAppRoutes;

  if (runtimeProfile.shell !== "dev" || !installedAppRoutes) {
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
  const links = installs
    .filter((install) => installedAppWorldMountFromInstall(runtimeProfile, install) !== undefined)
    .map((install) => ({
      href: install.adminRoute,
      installId: install.installId,
      label: install.label,
      packageAppKey: install.packageAppKey,
    }));

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
  routeComponents,
  runtimeProfile,
}: {
  installedAppRouteInstalls: readonly AppInstall[] | undefined;
  routeComponents: AppRouteComponents;
  runtimeProfile: RuntimeProfile;
}) {
  const { HomeRoute, SchemaRoute, SitePageRoute } = routeComponents;
  const generatedWorlds = runtimeProfile.worlds.filter(hasGeneratedRoutes);
  const hasLazyGeneratedRoutes =
    generatedWorlds.length > 0 || runtimeProfile.installedAppRoutes !== undefined;
  const routes = (
    <Switch>
      {runtimeProfile.defaultRedirect ? (
        <Route path="/">
          <Redirect replace to={runtimeProfile.defaultRedirect} />
        </Route>
      ) : null}
      {isOwnerSetupRouteEnabled(runtimeProfile) ? (
        <Route path="/setup">
          <OwnerSetupRoute />
        </Route>
      ) : null}
      {runtimeProfile.instanceShell ? (
        <Route path="/">
          <InstanceShellRoute />
        </Route>
      ) : null}
      {runtimeProfile.publishedSite ? (
        <Route path={runtimeProfile.publishedSite.rootRoute}>
          <SitePageRoute linkMode="published" slug={runtimeProfile.publishedSite.homeSlug} />
        </Route>
      ) : null}
      {runtimeProfile.publishedSite ? (
        <Route path={runtimeProfile.publishedSite.routePattern}>
          {(params) => (
            <SitePageRoute linkMode="published" slug={runtimeWildcardSiteSlug(params)} />
          )}
        </Route>
      ) : null}
      {generatedWorlds.map((world) =>
        world.schemaRoute ? (
          <Route key={world.schemaRoute} path={world.schemaRoute}>
            <SchemaRoute schemaKey={world.app.key} target={world.target} />
          </Route>
        ) : null,
      )}
      {generatedWorlds.map((world) => (
        <Route key={world.route} path={world.route}>
          <HomeRoute schemaKey={world.app.key} screenPath="/" target={world.target} />
        </Route>
      ))}
      {generatedWorlds.map((world) => (
        <Route key={`${world.route}/*`} path={runtimeScreenWildcardRoute(world)}>
          {(params) => (
            <HomeRoute
              schemaKey={world.app.key}
              screenPath={runtimeWildcardScreenPath(params)}
              target={world.target}
            />
          )}
        </Route>
      ))}
      {runtimeProfile.installedAppRoutes?.schemaRoutes ? (
        <Route path={`${runtimeProfile.installedAppRoutes.appRouteBase}/:installId/schema`}>
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
      {runtimeProfile.installedAppRoutes ? (
        <Route path={`${runtimeProfile.installedAppRoutes.appRouteBase}/:installId`}>
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
      {runtimeProfile.installedAppRoutes ? (
        <Route path={`${runtimeProfile.installedAppRoutes.appRouteBase}/:installId/*`}>
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
      {runtimeProfile.installedSitePublicRoutes ? (
        <Route path={`${runtimeProfile.installedSitePublicRoutes.siteRouteBase}/:installId`}>
          {(params) => (
            <InstalledSitePublicRoute
              installedAppRouteInstalls={installedAppRouteInstalls}
              installId={runtimeRouteParam(params, "installId")}
              routeComponents={routeComponents}
              runtimeProfile={runtimeProfile}
              slug={runtimeProfile.installedSitePublicRoutes?.homeSlug ?? "home"}
            />
          )}
        </Route>
      ) : null}
      {runtimeProfile.installedSitePublicRoutes ? (
        <Route path={`${runtimeProfile.installedSitePublicRoutes.siteRouteBase}/:installId/*`}>
          {(params) => (
            <InstalledSitePublicRoute
              installedAppRouteInstalls={installedAppRouteInstalls}
              installId={runtimeRouteParam(params, "installId")}
              routeComponents={routeComponents}
              runtimeProfile={runtimeProfile}
              slug={runtimeWildcardSiteSlug(params)}
            />
          )}
        </Route>
      ) : null}
      {runtimeProfile.publicSitePreview ? (
        <Route path={runtimeProfile.publicSitePreview.rootRoute}>
          {runtimeProfile.publicSitePreview.homeRoute ? (
            <Redirect replace to={runtimeProfile.publicSitePreview.homeRoute} />
          ) : (
            <SitePageRoute
              linkMode={runtimeProfile.publicSitePreview.linkMode}
              slug={runtimeProfile.publicSitePreview.homeSlug}
            />
          )}
        </Route>
      ) : null}
      {runtimeProfile.publicSitePreview ? (
        <Route path={runtimeProfile.publicSitePreview.routePattern}>
          {(params) => (
            <SitePageRoute
              linkMode={runtimeProfile.publicSitePreview?.linkMode}
              slug={runtimeWildcardSiteSlug(params)}
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

  return <SchemaRoute schemaKey={world.app.key} target={world.target} />;
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

  return <HomeRoute schemaKey={world.app.key} screenPath={screenPath} target={world.target} />;
}

function InstalledSitePublicRoute({
  installedAppRouteInstalls,
  installId,
  routeComponents,
  runtimeProfile,
  slug,
}: {
  installedAppRouteInstalls: readonly AppInstall[] | undefined;
  installId: string | undefined;
  routeComponents: AppRouteComponents;
  runtimeProfile: RuntimeProfile;
  slug: string;
}) {
  const { SitePageRoute } = routeComponents;
  const publicRoutes = runtimeProfile.installedSitePublicRoutes;

  if (!installId) {
    return <NotFoundRoute />;
  }

  if (installedAppRouteInstalls === undefined) {
    return <RouteLoading />;
  }

  const sitePath = publicRoutes
    ? `${publicRoutes.siteRouteBase}/${installId}${slug === publicRoutes.homeSlug ? "" : `/${slug}`}`
    : "";
  const surface = installedSitePublicSurfaceFromRoute(runtimeProfile, sitePath, {
    appInstalls: installedAppRouteInstalls,
  });

  if (!surface) {
    return <NotFoundRoute />;
  }

  return (
    <SitePageRoute
      linkMode="installed"
      routeBase={surface.routeBase}
      slug={surface.slug}
      target={surface.target}
    />
  );
}

function RouteLoading() {
  return <p className="text-sm text-muted-fg">Loading...</p>;
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

function isOwnerSetupRouteEnabled(runtimeProfile: RuntimeProfile) {
  return (
    runtimeProfile.kind === "instance" ||
    runtimeProfile.kind === "dev" ||
    runtimeProfile.kind === "publishedSite"
  );
}

function appManagementHref(
  runtimeProfile: RuntimeProfile,
  routeWorld: RuntimeWorldMount | undefined,
): "/" | undefined {
  return runtimeProfile.shell === "instance" && routeWorld?.target ? "/" : undefined;
}

function localPublishForWorld(
  runtimeProfile: RuntimeProfile,
  routeWorld: RuntimeWorldMount | undefined,
): RuntimeProfile["localPublish"] {
  if (routeWorld?.app.key !== "site") {
    return undefined;
  }

  return runtimeProfile.localPublish;
}

function normalizeRoutePath(path: string) {
  return path.split("?")[0] ?? path;
}
