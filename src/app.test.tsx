import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { Router } from "wouter";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  App,
  type AppRouteComponents,
  runtimeInstalledAppRouteRegistryRefreshKey,
  runtimeInstalledAppRouteRegistryFromResponse,
} from "./app.tsx";
import { ApplicationShellRuntimeBoundary } from "./app/application-shell-runtime.tsx";
import { GeneratedWorkspaceRuntime } from "./app/generated/generated-workspace-runtime.tsx";
import { resolveCreateValues } from "./app/generated/generated-create-runtime.ts";
import { useSchemaKey } from "./app/generated/schema-app-context.tsx";
import {
  SitePageRoute,
  SitePageRouteView,
  startSitePageRouteSession,
  type SitePublicRendererComponent,
  type SitePublicSystemStateRendererComponent,
  type SitePageRouteState,
} from "@dpeek/formless-site-app/react";
import { FormlessSitePageRenderer } from "@dpeek/formless-renderer/site/renderer";
import { applyBootstrapResponse, applyRecordMerge, resetClientStore } from "./client/store.ts";
import type { EntityOperationPresentationConfig } from "./client/operation-presentation-model.ts";
import type { ClientAppTarget } from "./client/app-target.ts";
import type { ClientAppSchemaKey } from "./client/app-target.ts";
import { resetSyncStatus, setSyncStatus } from "./client/sync-status.ts";
import {
  HomeRoute,
  createHomeRouteSelectionState,
  homeRouteSectionSelectionKey,
  selectHomeRouteSectionContextRecordId,
  selectHomeRouteSectionQueryName,
  withHomeRouteSelectedScreenName,
  withHomeRouteSelectedSectionContextRecordId,
  withHomeRouteSelectedSectionQueryName,
} from "./app/routes/home.tsx";
import { InstanceShellRoute } from "./app/routes/instance-shell.tsx";
import { AccessRoute } from "./app/routes/access.tsx";
import { LocalSessionRoute } from "./app/routes/local-session.tsx";
import { OwnerLoginRoute } from "./app/routes/owner-login.tsx";
import { OwnerSetupRoute } from "./app/routes/owner-setup.tsx";
import { AuthAccountRoute } from "./app/routes/auth-account.tsx";
import { CollaboratorInvitationAcceptanceRoute } from "./app/routes/collaborator-invitation-acceptance.tsx";
import { runtimeTopologyRoutes } from "./shared/runtime-topology.ts";
import { buildSitePageTree, type SitePageTree } from "@dpeek/formless-site-app";
import {
  createDevRuntimeProfile,
  createAppRuntimeProfile,
  createInstalledAppRuntimeProfile,
  createInstanceRuntimeProfile,
  createPublishedSiteRuntimeProfile,
  createSiteAuthoringRuntimeProfile,
  findRuntimeWorldMountByRoute,
  runtimeProfileWithActivePackageResolver,
  type RuntimeProfile,
} from "./app/runtime-profile.ts";
import {
  selectCollectionModels,
  selectPrimaryCollectionModels,
  selectScreenModels,
  type CreateFieldConfig,
  type HomeOperationConfig,
  type HomeScreenModel,
  type HomeQueryTabConfig,
  type HomeViewModel,
  type ResultOrderingConfig,
} from "./client/views.ts";
import { bundledSourceSchemaHashFixtures } from "./shared/upgrade-migrations.ts";
import { COLLABORATOR_INVITATION_ACCEPT_PATH } from "./shared/instance-auth.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { BootstrapResponse } from "./shared/protocol.ts";
import type { SchemaKey } from "./shared/schema-apps.ts";
import type { AppSchema, EntitySchema } from "@dpeek/formless-schema";
import type { WorkspaceLinkActionContract } from "@dpeek/formless-presentation/contract";
import { parseAppSchema } from "@dpeek/formless-schema";
import type { NumericExpression } from "@dpeek/formless-schema";
import {
  crmSeedRecords,
  crmSourceSchema,
  rateSeedRecords as rateCardSeedRecords,
  rateSourceSchema as rateCardSchema,
  siteSourceSchema,
  taskSeedRecords,
  taskSourceSchema as appSchema,
} from "./test/schema-apps.ts";
import { bootstrapResponse } from "./test/protocol-builders.ts";
import {
  bootstrapSiteEditor,
  requiredSiteCollectionModel,
  siteBlockRecord,
} from "./test/site-editor.ts";
import { testSiteSeedRecords } from "./test/site-records.ts";
import type { AppInstall, InstallableAppPackage } from "@dpeek/formless-installed-apps";

function renderRoute(
  path: string,
  runtimeProfile?: RuntimeProfile,
  installedAppRouteInstalls?: readonly AppInstall[],
  options: {
    installedAppRoutePackages?: readonly InstallableAppPackage[];
    localWorkspaceGatewayAvailable?: boolean;
  } = {},
) {
  return renderToStaticMarkup(
    <Router ssrPath={path}>
      <App
        installedAppRouteInstalls={installedAppRouteInstalls}
        installedAppRoutePackages={options.installedAppRoutePackages}
        localWorkspaceGatewayAvailable={options.localWorkspaceGatewayAvailable}
        routeComponents={appRouteComponents()}
        runtimeProfile={runtimeProfile ?? createDevRuntimeProfile()}
      />
    </Router>,
  );
}

function SchemaKeyProbeHomeRoute({
  schemaKey: routeSchemaKey,
  target,
  workspaceActions = [],
}: {
  schemaKey: ClientAppSchemaKey;
  screenPath: string;
  target?: ClientAppTarget;
  workspaceActions?: readonly WorkspaceLinkActionContract[];
}) {
  const contextSchemaKey = useSchemaKey();
  const targetKind = typeof target === "string" ? "schemaKey" : (target?.kind ?? "none");
  const installId =
    typeof target === "object" && target.kind === "appInstall" ? target.installId : "";

  return (
    <main
      data-install-id={installId}
      data-route-schema-key={routeSchemaKey}
      data-schema-key={contextSchemaKey}
      data-target-kind={targetKind}
    >
      Schema key {contextSchemaKey}
      <WorkspaceActionProbe actions={workspaceActions} />
    </main>
  );
}

function TargetProbeHomeRoute({
  schemaKey,
  screenPath,
  target,
  workspaceActions = [],
}: {
  schemaKey: ClientAppSchemaKey;
  screenPath: string;
  target?: ClientAppTarget;
  workspaceActions?: readonly WorkspaceLinkActionContract[];
}) {
  const targetKind = typeof target === "string" ? "schemaKey" : (target?.kind ?? "none");
  const installId =
    typeof target === "object" && target.kind === "appInstall" ? target.installId : "";

  return (
    <main
      data-install-id={installId}
      data-route-schema-key={schemaKey}
      data-screen-path={screenPath}
      data-target-kind={targetKind}
    >
      <WorkspaceActionProbe actions={workspaceActions} />
    </main>
  );
}

function WorkspaceActionProbe({ actions }: { actions: readonly WorkspaceLinkActionContract[] }) {
  return actions.map((action) => (
    <a
      aria-label={action.accessibilityLabel}
      data-workspace-link-action={action.id}
      href={action.href}
      key={action.id}
      rel={action.target === "newTab" ? "noopener noreferrer" : undefined}
      target={action.target === "newTab" ? "_blank" : undefined}
    >
      {action.label}
    </a>
  ));
}

function SitePageRouteProbe({
  builtInRenderer,
  builtInSystemStateRenderer,
  linkMode,
  routeBase,
  slug,
  target,
}: {
  builtInRenderer: SitePublicRendererComponent;
  builtInSystemStateRenderer: SitePublicSystemStateRendererComponent;
  linkMode?: string;
  routeBase?: string;
  slug: string;
  target?: ClientAppTarget;
}) {
  const targetKind = typeof target === "string" ? "schemaKey" : (target?.kind ?? "none");
  const installId =
    typeof target === "object" && target.kind === "appInstall" ? target.installId : "";

  return (
    <main
      data-built-in-renderer={builtInRenderer.name}
      data-built-in-system-state-renderer={builtInSystemStateRenderer.name}
      data-install-id={installId}
      data-route-base={routeBase}
      data-site-link-mode={linkMode}
      data-site-slug={slug}
      data-target-kind={targetKind}
    >
      Site page {slug}
    </main>
  );
}

function appRouteComponents(overrides: Partial<AppRouteComponents> = {}): AppRouteComponents {
  return {
    AccessRoute,
    ApplicationShellRuntimeBoundary,
    AuthAccountRoute,
    CollaboratorInvitationAcceptanceRoute,
    HomeRoute,
    InstanceShellRoute,
    LocalSessionRoute,
    OwnerLoginRoute,
    OwnerSetupRoute,
    SitePageRoute,
    ...overrides,
  };
}

function sitePageTree(slug = "home", records = testSiteSeedRecords): SitePageTree {
  const projection = buildSitePageTree(siteSourceSchema, records, slug, {
    generatedAt: "2026-05-06T00:00:00.000Z",
  });

  if (!projection.tree) {
    throw new Error(`Missing site page tree for "${slug}".`);
  }

  return projection.tree;
}

function siteTreeFetcher(fetchPaths: string[], tree: SitePageTree): typeof fetch {
  return async (input) => {
    fetchPaths.push(requestUrl(input));

    return Response.json(tree);
  };
}

function linkHtml(html: string, href: string): string {
  const hrefIndex = html.indexOf(`href="${href}"`);
  const linkStart = html.lastIndexOf("<a", hrefIndex);
  const linkEnd = html.indexOf("</a>", hrefIndex);

  if (hrefIndex === -1 || linkStart === -1 || linkEnd === -1) {
    throw new Error(`Missing link for "${href}".`);
  }

  return html.slice(linkStart, linkEnd + "</a>".length);
}

function stripReactSuspenseMarkers(html: string): string {
  return html.replace(/<!--\/?\$[^>]*-->/g, "");
}

function expectHtmlToContain(html: string, expected: string) {
  expect(html.includes(expected), expected).toBe(true);
}

function buttonsContainingText(html: string, text: string) {
  return (html.match(/<button\b[\s\S]*?<\/button>/g) ?? []).filter((button) =>
    button.includes(`>${text}</span>`),
  );
}

function runtimeShellHtml(html: string): string {
  if (!html.includes('data-testid="formless-astryx-application-shell:')) {
    throw new Error("Missing application shell.");
  }

  return html;
}

function generatedAppFrameHtml(html: string): string {
  if (!html.includes('data-testid="formless-astryx-application-shell:')) {
    throw new Error("Missing application shell.");
  }

  return html;
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.href : input.url;
}

beforeEach(() => {
  resetClientStore();
  resetSyncStatus();
});

function renderGeneratedHomeCollection(
  model: HomeViewModel,
  {
    selectedContextRecordId,
    selectedQuery = model.collection.queries.defaultTab,
    today,
  }: {
    selectedContextRecordId?: string | null;
    selectedQuery?: HomeQueryTabConfig;
    today: string;
  },
) {
  const sectionId = model.viewName;
  const screen: HomeScreenModel = {
    label: model.label,
    layout: {
      sections: [
        {
          collection: model.collection,
          id: sectionId,
          label: model.label,
          type: "collection",
          viewName: model.viewName,
        },
      ],
      type: "stack",
    },
    navigation: { primary: true },
    screenName: model.viewName,
    type: "workspace",
  };

  return renderGeneratedHomeScreen(screen, {
    selectedContextRecordIdsBySection: { [sectionId]: selectedContextRecordId ?? null },
    selectedQueryNamesBySection: { [sectionId]: selectedQuery.queryName },
    today,
  });
}

function renderGeneratedHomeScreen(
  screen: HomeScreenModel,
  {
    selectedContextRecordIdsBySection = {},
    selectedQueryNamesBySection = {},
    today,
  }: {
    selectedContextRecordIdsBySection?: Record<string, string | null>;
    selectedQueryNamesBySection?: Record<string, string | null>;
    today: string;
  },
) {
  return renderToStaticMarkup(
    <GeneratedWorkspaceRuntime
      getSectionSelection={(section) => ({
        selectedContextRecordId: selectedContextRecordIdsBySection[section.id] ?? null,
        selectedQueryName: selectedQueryNamesBySection[section.id] ?? null,
      })}
      onSelectContext={() => {}}
      onSelectQuery={() => {}}
      screen={screen}
      today={today}
    />,
  );
}

function selectRateHomeModel() {
  const model = selectCollectionModels(rateCardSchema).find(
    (candidate) => candidate.viewName === "rateHome",
  );

  if (!model) {
    throw new Error("Missing rate home model.");
  }

  return model;
}

function appInstallFixture({
  installId,
  label,
  packageAppKey = "site",
}: {
  installId: string;
  label: string;
  packageAppKey?: SchemaKey;
}): AppInstall {
  return {
    adminRoute: `/apps/${installId}`,
    createdAt: "2026-05-25T00:00:00.000Z",
    installId,
    label,
    packageAppKey,
    packageRevision: 1,
    registrationPolicy: "closed",
    sourceSchemaHash: bundledSourceSchemaHashFixtures[packageAppKey],
    status: "installed",
    updatedAt: "2026-05-25T00:00:00.000Z",
    ...(packageAppKey === "site"
      ? {
          publicRoute: `/sites/${installId}` as const,
          publicRoutePrefix: `/sites/${installId}/` as const,
        }
      : {}),
  };
}

function privateSitePackage(): InstallableAppPackage {
  return {
    adminRouteBase: "/apps",
    defaultInstallId: "private-site",
    description: "Workspace-linked public Site package.",
    label: "Private Site",
    packageAppKey: "private-site",
    packageRevision: 7,
    publicRouteBase: "/sites",
    seedRecordsKey: "private-site",
    seedRecordsLocation: {
      kind: "workspace",
      key: "private-site",
      path: "source/seed-records.json",
    },
    sourceOrigin: "workspace",
    sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
    sourceSchemaKey: "private-site",
    sourceSchemaLocation: {
      kind: "workspace",
      key: "private-site",
      path: "source/schema.json",
    },
    supportsMultipleInstalls: false,
  };
}

function appInstallFromPackage({
  appPackage,
  installId,
  label,
}: {
  appPackage: InstallableAppPackage;
  installId: string;
  label: string;
}): AppInstall {
  return {
    adminRoute: `/apps/${installId}`,
    createdAt: "2026-05-25T00:00:00.000Z",
    installId,
    label,
    packageAppKey: appPackage.packageAppKey,
    packageRevision: appPackage.packageRevision,
    registrationPolicy: "closed",
    sourceSchemaHash: appPackage.sourceSchemaHash,
    status: "installed",
    updatedAt: "2026-05-25T00:00:00.000Z",
  };
}

function expectRuntimeShell(html: string) {
  const shellHtml = runtimeShellHtml(html);

  expectHtmlToContain(html, 'data-testid="formless-astryx-application-shell:');
  expectHtmlToContain(html, 'data-formless-astryx-shell-scope="multiApp"');
  expect(html).toMatch(/aria-label="[^"]+ application shell"/);
  expect(linkHtml(shellHtml, "/")).toContain("Instance");
  expect(html).not.toContain('aria-label="Workbench actions"');
  expect(html).not.toContain('data-frame="workbench-toolbar"');
}

function expectAppSettings(
  html: string,
  {
    appLabel,
    resetScopeLabel: _resetScopeLabel = appLabel,
    schemaKey: _schemaKey,
    syncWorldKey: _syncWorldKey = _schemaKey,
  }: {
    appLabel: string;
    resetScopeLabel?: string;
    schemaKey: string;
    syncWorldKey?: string;
  },
) {
  expectHtmlToContain(html, appLabel);
  expectHtmlToContain(html, "Settings");
  expect(html).not.toContain(`aria-label="Toggle ${appLabel} navigation"`);
  expect(html).not.toContain("data-sync-status-control");
  expect(html).not.toContain("Export storage snapshot");
  expect(html).not.toContain("Restore storage snapshot");
  expect(html).not.toContain("snapshot file");
  expect(html).not.toContain(`aria-label="Restorage snapshot for ${appLabel}"`);
  expect(html).not.toContain("Portable archive");
  expect(html).not.toContain("App archive");
  expect(html).not.toContain("Instance archive");
  expect(html).not.toContain("Restore archive");
  expect(html).not.toContain("Import app");
  expect(html).not.toContain("Backup");
}

function expectSyncStatusControl(html: string, _schemaKey: string) {
  expectHtmlToContain(html, "Settings");
  expect(html).not.toContain("data-sync-status-control");
}

function expectGeneratedAppChromeLabels(
  html: string,
  {
    appTitle,
    screenTitle,
    allowSidebarGroupLabel = false,
  }: { appTitle: string; screenTitle: string; allowSidebarGroupLabel?: boolean },
) {
  expectHtmlToContain(html, appTitle);
  expectHtmlToContain(html, screenTitle);
  if (!allowSidebarGroupLabel) {
    expect(html).not.toContain('data-slot="sidebar-group-label"');
  }
}

describe("App smoke routes", () => {
  it('renders the "/" route as the instance shell', () => {
    const html = renderRoute("/");

    expectHtmlToContain(html, 'data-testid="formless-astryx-application-shell:');
    expectHtmlToContain(html, 'data-formless-astryx-shell-scope="multiApp"');
    expectRuntimeShell(html);
    expect(linkHtml(runtimeShellHtml(html), "/")).toContain('aria-current="page"');
    expect(linkHtml(runtimeShellHtml(html), "/")).toContain("Instance");
    expectHtmlToContain(html, "Settings");
    expectHtmlToContain(html, "Access");
    expectHtmlToContain(html, 'href="/access"');
    expectHtmlToContain(html, 'data-formless-astryx-management="instance-management"');
    expectHtmlToContain(html, 'data-formless-astryx-management-state="loading"');
    expectHtmlToContain(html, "Loading instance settings");
    expect(html).not.toContain("Overview");
    expect(html).not.toContain('href="/deployments"');
    expect(html).not.toContain('data-formless-control-plane-screen="apps"');
    expect(html).not.toContain('data-formless-control-plane-screen="routes"');
    expectHtmlToContain(html, 'href="/tasks"');
    expectHtmlToContain(html, 'href="/site"');
    expect(html).not.toContain("Loading Tasks...");
  });

  it('does not select the "/deployments" instance shell route with local gateway', () => {
    const html = renderRoute("/deployments", undefined, undefined, {
      localWorkspaceGatewayAvailable: true,
    });

    expectHtmlToContain(html, 'data-testid="formless-astryx-application-shell:');
    expectHtmlToContain(html, 'data-formless-astryx-shell-scope="multiApp"');
    expectRuntimeShell(html);
    expect(linkHtml(runtimeShellHtml(html), "/")).not.toContain('aria-current="page"');
    expectHtmlToContain(html, "Not found");
    expect(html).not.toContain('href="/deployments"');
    expect(html).not.toContain("Deployment setup and progress");
  });

  it('does not select the "/deployments" instance shell route without local gateway', () => {
    const html = renderRoute("/deployments");

    expectHtmlToContain(html, 'data-testid="formless-astryx-application-shell:');
    expectHtmlToContain(html, 'data-formless-astryx-shell-scope="multiApp"');
    expectRuntimeShell(html);
    expect(linkHtml(runtimeShellHtml(html), "/")).not.toContain('aria-current="page"');
    expectHtmlToContain(html, "Not found");
    expect(html).not.toContain('href="/deployments"');
    expect(html).not.toContain("Deployment setup and progress");
  });

  it("does not mark app management current on unknown dev routes", () => {
    const html = renderRoute("/unknown");

    expectHtmlToContain(html, "Not found");
    expectRuntimeShell(html);
    expect(runtimeShellHtml(html)).not.toContain('aria-current="page"');
    expect(linkHtml(runtimeShellHtml(html), "/")).toContain("Instance");
    expect(html).not.toContain('aria-label="Instance navigation"');
    expectHtmlToContain(html, 'data-testid="formless-astryx-application-shell:');
    expect(html).not.toContain('aria-label="Tasks app settings"');
  });

  it('renders the "/tasks" route with task navigation', () => {
    const html = renderRoute("/tasks");

    expectHtmlToContain(html, 'data-testid="formless-astryx-application-shell:');
    expectHtmlToContain(html, 'data-formless-astryx-shell-scope="multiApp"');
    expectRuntimeShell(html);
    expect(linkHtml(runtimeShellHtml(html), "/")).not.toContain('aria-current="page"');
    expect(linkHtml(runtimeShellHtml(html), "/tasks")).toContain('aria-current="page"');
    expectHtmlToContain(html, 'href="/tasks"');
    expectHtmlToContain(html, "Tasks");
    expectHtmlToContain(html, 'href="/site"');
    expectHtmlToContain(html, "Site");
    expectAppSettings(html, {
      appLabel: "Tasks",
      schemaKey: "tasks",
    });
    expectHtmlToContain(html, "Tasks screens");
    expectHtmlToContain(html, "Loading Tasks...");
    expect(html).not.toContain("Create Task");
  });

  it('renders the "/site" route with site navigation', () => {
    const html = renderRoute("/site");

    expectHtmlToContain(html, 'data-testid="formless-astryx-application-shell:');
    expectHtmlToContain(html, 'data-formless-astryx-shell-scope="multiApp"');
    expectRuntimeShell(html);
    expectHtmlToContain(html, 'href="/tasks"');
    expectHtmlToContain(html, "Tasks");
    expectHtmlToContain(html, 'href="/site"');
    expectHtmlToContain(html, "Site");
    expectAppSettings(html, {
      appLabel: "Site",
      schemaKey: "site",
    });
    expectHtmlToContain(html, "Site screens");
    expectHtmlToContain(html, "Loading Site...");
    expect(html).not.toContain("Create Content item");
  });

  it("marks active app sidebar screen and settings links as current", () => {
    applyBootstrapResponse(bootstrap(crmSeedRecords, crmSourceSchema), "crm");
    const devSetupHtml = generatedAppFrameHtml(renderRoute("/crm/audiences"));

    expect(linkHtml(devSetupHtml, "/crm/audiences")).toContain('aria-current="page"');
    expect(linkHtml(devSetupHtml, "/crm")).toContain('aria-current="page"');
    expect(devSetupHtml).not.toContain('href="/crm/schema"');

    resetClientStore();
    const appInstalls = [appInstallFixture({ installId: "personal", label: "Personal Site" })];
    const installedWorld = findRuntimeWorldMountByRoute(
      createDevRuntimeProfile(),
      "/apps/personal/settings",
      {
        appInstalls,
      },
    );
    if (!installedWorld?.target) {
      throw new Error("Expected installed app target for /apps/personal/settings.");
    }
    applyBootstrapResponse(bootstrap(testSiteSeedRecords, siteSourceSchema), installedWorld.target);
    const installedSchemaHtml = generatedAppFrameHtml(
      renderRoute("/apps/personal/settings", undefined, appInstalls),
    );

    expect(linkHtml(installedSchemaHtml, "/apps/personal/settings")).toContain(
      'aria-current="page"',
    );
    expect(installedSchemaHtml).not.toContain('href="/apps/personal/schema"');
  });

  it('renders the "/formless/auth/setup" owner setup route outside workbench chrome', () => {
    const html = renderRoute(runtimeTopologyRoutes.authAccountSetupRoute);

    expectHtmlToContain(html, "Checking setup link");
    expectHtmlToContain(html, "Loading setup status.");
    expect(html).not.toContain('data-testid="formless-astryx-application-shell:');
  });

  it('renders the "/formless/auth/sign-in" owner login route outside workbench chrome', () => {
    const html = renderRoute(runtimeTopologyRoutes.authAccountSignInRoute);

    expectHtmlToContain(html, "Checking owner session");
    expectHtmlToContain(html, "Loading sign-in state.");
    expect(html).not.toContain('data-testid="formless-astryx-application-shell:');
  });

  it("renders the collaborator invitation acceptance route outside runtime app chrome", () => {
    const html = renderRoute(
      `${COLLABORATOR_INVITATION_ACCEPT_PATH}?invitationId=invitation%3Aada&token=aW52aXRlLXJhdy10b2tlbi0x`,
    );

    expectHtmlToContain(html, "Checking invitation");
    expectHtmlToContain(html, "Loading invitation status.");
    expect(html).not.toContain('data-testid="formless-astryx-application-shell:');
  });

  it('renders the "/formless/auth" account route outside runtime app chrome', () => {
    const html = renderRoute(runtimeTopologyRoutes.authAccountRoute);
    const gateHtml = renderRoute("/formless/auth/profile-completion");

    expectHtmlToContain(html, "Checking account");
    expectHtmlToContain(html, "Loading account status.");
    expect(gateHtml).toContain("Checking account");
    expect(html).not.toContain('data-testid="formless-astryx-application-shell:');
  });

  it('renders the "/local-session" route only for local workspace runtimes', () => {
    const html = renderRoute("/local-session", undefined, undefined, {
      localWorkspaceGatewayAvailable: true,
    });
    const unavailableHtml = renderRoute("/local-session");

    expectHtmlToContain(html, "Checking local session");
    expectHtmlToContain(html, "Verifying owner access.");
    expect(html).not.toContain('data-testid="formless-astryx-application-shell:');
    expect(unavailableHtml).toContain("Not found");
    expect(unavailableHtml).not.toContain("Checking local session");
    expect(unavailableHtml).not.toContain('data-testid="formless-astryx-application-shell:');
  });

  it("keeps deployed account gate routes available outside default instance onboarding", () => {
    const instanceProfile = createInstanceRuntimeProfile();
    const shellHtml = renderRoute("/", instanceProfile);
    const setupHtml = renderRoute(runtimeTopologyRoutes.authAccountSetupRoute, instanceProfile);
    const signInHtml = renderRoute(runtimeTopologyRoutes.authAccountSignInRoute, instanceProfile);
    const legacySetupHtml = renderRoute("/setup", instanceProfile);
    const legacyLoginHtml = renderRoute("/login", instanceProfile);

    expect(shellHtml).toContain('data-testid="formless-astryx-application-shell:');
    expect(shellHtml).not.toContain("Owner setup");
    expect(shellHtml).not.toContain("Owner sign in");
    expect(setupHtml).toContain("Checking setup link");
    expect(setupHtml).toContain("Loading setup status.");
    expect(signInHtml).toContain("Checking owner session");
    expect(signInHtml).toContain("Loading sign-in state.");
    expect(setupHtml).not.toContain('data-testid="formless-astryx-application-shell:');
    expect(signInHtml).not.toContain('data-testid="formless-astryx-application-shell:');
    expect(legacySetupHtml).toContain("Not found");
    expect(legacySetupHtml).not.toContain("Checking setup link");
    expect(legacyLoginHtml).toContain("Not found");
    expect(legacyLoginHtml).not.toContain("Checking owner session");
  });

  it("renders product instance routes outside the dev workbench route vocabulary", () => {
    const instanceProfile = createInstanceRuntimeProfile();
    const appInstalls = [appInstallFixture({ installId: "personal", label: "Personal Site" })];
    const shellHtml = renderRoute("/", instanceProfile);
    const accessHtml = renderRoute("/access", instanceProfile);
    const deploymentsHtml = renderRoute("/deployments", instanceProfile, undefined, {
      localWorkspaceGatewayAvailable: true,
    });
    const unavailableDeploymentsHtml = renderRoute("/deployments", instanceProfile);
    const adminHtml = renderToStaticMarkup(
      <Router ssrPath="/apps/personal/settings">
        <App
          installedAppRouteInstalls={appInstalls}
          routeComponents={appRouteComponents({ HomeRoute: SchemaKeyProbeHomeRoute })}
          runtimeProfile={instanceProfile}
        />
      </Router>,
    );

    expect(shellHtml).toContain("Instance");
    expect(shellHtml).toContain('data-testid="formless-astryx-application-shell:');
    expect(accessHtml).toContain("Access");
    expect(accessHtml).toContain("Loading access management...");
    expect(accessHtml).toContain('aria-labelledby="instance-access:heading"');
    expect(accessHtml).not.toContain("Not found");
    expect(deploymentsHtml).toContain("Not found");
    expect(deploymentsHtml).not.toContain("Instance");
    expect(deploymentsHtml).not.toContain('data-testid="formless-astryx-application-shell:');
    expect(deploymentsHtml).not.toContain('href="/deployments"');
    expect(deploymentsHtml).not.toContain("Deployment setup and progress");
    expect(unavailableDeploymentsHtml).toContain("Not found");
    expect(unavailableDeploymentsHtml).not.toContain('href="/deployments"');
    expect(unavailableDeploymentsHtml).not.toContain("Deployment setup and progress");
    expect(shellHtml).toContain('data-formless-astryx-shell-scope="multiApp"');
    expect(adminHtml).toContain('data-testid="formless-astryx-application-shell:');
    expect(adminHtml).toContain('data-formless-astryx-shell-scope="multiApp"');
    expect(adminHtml).toContain('data-target-kind="appInstall"');
    expect(adminHtml).toContain('data-install-id="personal"');
    expect(adminHtml).not.toContain('aria-label="Instance navigation"');
    expect(linkHtml(adminHtml, "/")).toContain("Instance");
    expect(adminHtml).toContain("Personal Site");
    expect(adminHtml).not.toContain('aria-label="Personal Site public site"');
    expect(linkHtml(adminHtml, "/sites/personal")).toContain(
      'aria-label="View site (opens in a new tab)"',
    );
    expect(linkHtml(adminHtml, "/sites/personal")).toContain('target="_blank"');
    expect(adminHtml).toContain('href="/"');
    expect(adminHtml).not.toContain('aria-label="Site management"');
    expect(adminHtml).not.toContain("App management");
    expect(adminHtml).toContain("Reset source seed data");
    expectSyncStatusControl(adminHtml, "app:personal");
    expect(adminHtml).not.toContain('href="/apps/personal/schema"');
    expect(adminHtml).not.toContain('href="/deployments"');
  });

  it("renders unified instance and app destinations", () => {
    const personalInstall: AppInstall = {
      ...appInstallFixture({ installId: "personal", label: "Personal Site" }),
      adminRoute: "/workspace/personal",
      publicRoute: "/public/personal",
      publicRoutePrefix: "/public/personal/",
      launchLinks: [
        {
          access: "owner",
          href: "/workspace/personal",
          installId: "personal",
          label: "Personal Site",
          packageAppKey: "site",
          routeId: "route:personal:admin",
          routeKind: "admin",
        },
        {
          access: "anonymous",
          href: "/public/personal",
          installId: "personal",
          label: "Personal Site",
          packageAppKey: "site",
          routeId: "route:personal:public-site",
          routeKind: "publicSite",
        },
      ],
      routes: [
        {
          access: "owner",
          enabled: true,
          id: "route:personal:admin",
          path: "/workspace/personal",
          routeKind: "admin",
        },
        {
          access: "anonymous",
          enabled: true,
          id: "route:personal:public-site",
          path: "/public/personal",
          prefix: "/public/personal/",
          routeKind: "publicSite",
        },
      ],
    };
    const html = renderToStaticMarkup(
      <Router ssrPath="/workspace/personal/settings">
        <App
          installedAppRouteInstalls={[personalInstall]}
          routeComponents={appRouteComponents({ HomeRoute: TargetProbeHomeRoute })}
          runtimeProfile={createInstanceRuntimeProfile()}
        />
      </Router>,
    );
    const settingsTile = linkHtml(html, "/");
    const adminTile = linkHtml(html, "/workspace/personal");

    expectHtmlToContain(html, 'data-formless-astryx-shell-scope="multiApp"');
    expect(html).not.toContain('aria-label="Instance navigation"');
    expect(settingsTile).toContain("Instance");
    expect(settingsTile).not.toContain('aria-current="page"');
    expect(adminTile).toContain("Personal Site");
    expect(adminTile).toContain('aria-current="page"');
    expect(html).not.toContain('aria-label="Personal Site public site"');
  });

  it("uses app-only scope outside instance profiles and no shell for public and auth routes", () => {
    const installedProfile = createInstalledAppRuntimeProfile({
      installId: "task-workspace",
      packageAppKey: "tasks",
    });

    if (!installedProfile) {
      throw new Error("Missing installed app profile.");
    }

    const appProfileHtml = renderToStaticMarkup(
      <Router ssrPath="/">
        <App
          routeComponents={appRouteComponents({ HomeRoute: TargetProbeHomeRoute })}
          runtimeProfile={createAppRuntimeProfile("crm")}
        />
      </Router>,
    );
    const installedProfileHtml = renderToStaticMarkup(
      <Router ssrPath="/">
        <App
          routeComponents={appRouteComponents({ HomeRoute: TargetProbeHomeRoute })}
          runtimeProfile={installedProfile}
        />
      </Router>,
    );
    const publishedSiteHtml = renderToStaticMarkup(
      <Router ssrPath="/">
        <App
          routeComponents={appRouteComponents({
            HomeRoute: TargetProbeHomeRoute,
            SitePageRoute: SitePageRouteProbe,
          })}
          runtimeProfile={createPublishedSiteRuntimeProfile()}
        />
      </Router>,
    );
    const signInHtml = renderRoute(runtimeTopologyRoutes.authAccountSignInRoute);
    const setupHtml = renderRoute(runtimeTopologyRoutes.authAccountSetupRoute);

    expect(appProfileHtml).toContain('data-formless-astryx-shell-scope="appOnly"');
    expect(installedProfileHtml).toContain('data-formless-astryx-shell-scope="appOnly"');
    expect(appProfileHtml).not.toContain('aria-label="Instance navigation"');
    expect(installedProfileHtml).not.toContain('aria-label="Instance navigation"');
    expect(publishedSiteHtml).not.toContain('data-testid="formless-astryx-application-shell:');
    expect(publishedSiteHtml).toContain('data-built-in-renderer="FormlessSitePageRenderer"');
    expect(publishedSiteHtml).toContain(
      'data-built-in-system-state-renderer="FormlessSiteSystemStateRenderer"',
    );
    expect(signInHtml).not.toContain('data-testid="formless-astryx-application-shell:');
    expect(setupHtml).not.toContain('data-testid="formless-astryx-application-shell:');
  });

  it("keeps projected sync details behind the Astryx settings surface", () => {
    applyBootstrapResponse(bootstrap(testSiteSeedRecords, siteSourceSchema), "site");
    const html = renderRoute("/site");

    expectAppSettings(html, { appLabel: "Site", schemaKey: "site" });
    expectSyncStatusControl(html, "site");
  });

  it("keeps sync errors on the Astryx settings surface", () => {
    setSyncStatus({ state: "error", message: "Push sync unavailable." });
    const html = renderRoute("/site");

    expectSyncStatusControl(html, "site");
  });

  it("provides the route schema key through the generated app frame", () => {
    const html = renderToStaticMarkup(
      <Router ssrPath="/site">
        <App
          routeComponents={appRouteComponents({ HomeRoute: SchemaKeyProbeHomeRoute })}
          runtimeProfile={createDevRuntimeProfile()}
        />
      </Router>,
    );

    expectHtmlToContain(html, 'data-schema-key="site"');
    expect(html).not.toContain('data-schema-key="tasks"');
  });

  it("routes installed Site admin paths through generated app targets", () => {
    applyBootstrapResponse(bootstrap(testSiteSeedRecords, siteSourceSchema), "site");
    const appInstalls = [appInstallFixture({ installId: "personal", label: "Personal Site" })];
    const html = renderToStaticMarkup(
      <Router ssrPath="/apps/personal/settings">
        <App
          installedAppRouteInstalls={appInstalls}
          routeComponents={appRouteComponents({ HomeRoute: TargetProbeHomeRoute })}
          runtimeProfile={createDevRuntimeProfile()}
        />
      </Router>,
    );

    expectHtmlToContain(html, 'data-formless-astryx-shell-scope="multiApp"');
    expectHtmlToContain(html, 'data-testid="formless-astryx-application-shell:');
    expectRuntimeShell(html);
    expect(html).not.toContain('href="/apps/personal/schema"');
    expectHtmlToContain(html, 'data-route-schema-key="site"');
    expectHtmlToContain(html, 'data-screen-path="/settings"');
    expectHtmlToContain(html, 'data-target-kind="appInstall"');
    expectHtmlToContain(html, 'data-install-id="personal"');
    expectAppSettings(html, {
      appLabel: "Site",
      resetScopeLabel: "Site app install personal",
      schemaKey: "site",
      syncWorldKey: "app:personal",
    });
    expect(html).not.toContain("data-sync-status-control");
    expect(linkHtml(runtimeShellHtml(html), "/")).toContain("Instance");
    expect(linkHtml(runtimeShellHtml(html), "/site")).not.toContain('aria-current="page"');
    expect(linkHtml(runtimeShellHtml(html), "/apps/personal")).toContain('aria-current="page"');
    expect(linkHtml(runtimeShellHtml(html), "/apps/personal")).toContain("Personal Site");
  });

  it("routes installed Tasks admin paths through install metadata", () => {
    const appInstalls = [
      appInstallFixture({
        installId: "task-workspace",
        label: "Task Workspace",
        packageAppKey: "tasks",
      }),
    ];
    const html = renderToStaticMarkup(
      <Router ssrPath="/apps/task-workspace">
        <App
          installedAppRouteInstalls={appInstalls}
          routeComponents={appRouteComponents({ HomeRoute: TargetProbeHomeRoute })}
          runtimeProfile={createDevRuntimeProfile()}
        />
      </Router>,
    );

    expectHtmlToContain(html, 'data-formless-astryx-shell-scope="multiApp"');
    expectHtmlToContain(html, 'data-testid="formless-astryx-application-shell:');
    expectRuntimeShell(html);
    expectHtmlToContain(html, 'data-route-schema-key="tasks"');
    expectHtmlToContain(html, 'data-screen-path="/"');
    expectHtmlToContain(html, 'data-target-kind="appInstall"');
    expectHtmlToContain(html, 'data-install-id="task-workspace"');
    expectAppSettings(html, {
      appLabel: "Tasks",
      resetScopeLabel: "Tasks app install task-workspace",
      schemaKey: "tasks",
      syncWorldKey: "app:task-workspace",
    });
    expect(linkHtml(runtimeShellHtml(html), "/apps/task-workspace")).toContain(
      'aria-current="page"',
    );
    expect(linkHtml(runtimeShellHtml(html), "/apps/task-workspace")).toContain("Task Workspace");
  });

  it("routes workspace package admin paths through active package metadata", () => {
    const privatePackage = privateSitePackage();
    const appInstalls = [
      appInstallFromPackage({
        appPackage: privatePackage,
        installId: "private-site",
        label: "Workspace Site",
      }),
    ];
    const html = renderToStaticMarkup(
      <Router ssrPath="/apps/private-site/dashboard">
        <App
          installedAppRouteInstalls={appInstalls}
          installedAppRoutePackages={[privatePackage]}
          routeComponents={appRouteComponents({ HomeRoute: TargetProbeHomeRoute })}
          runtimeProfile={createDevRuntimeProfile()}
        />
      </Router>,
    );

    expectHtmlToContain(html, 'data-formless-astryx-shell-scope="multiApp"');
    expectHtmlToContain(html, 'data-testid="formless-astryx-application-shell:');
    expectRuntimeShell(html);
    expectHtmlToContain(html, 'data-route-schema-key="private-site"');
    expectHtmlToContain(html, 'data-screen-path="/dashboard"');
    expectHtmlToContain(html, 'data-target-kind="appInstall"');
    expectHtmlToContain(html, 'data-install-id="private-site"');
    expectAppSettings(html, {
      appLabel: "Private Site",
      resetScopeLabel: "Private Site app install private-site",
      schemaKey: "private-site",
      syncWorldKey: "app:private-site",
    });
    expect(linkHtml(runtimeShellHtml(html), "/apps/private-site")).toContain('aria-current="page"');
    expect(linkHtml(runtimeShellHtml(html), "/apps/private-site")).toContain("Workspace Site");
    expect(html).not.toContain("Not found");
  });

  it("preserves fetched active packages with runtime route installs", () => {
    const privatePackage = privateSitePackage();
    const privateInstall = {
      adminRoute: "/apps/private-site",
      createdAt: "2026-05-25T00:00:00.000Z",
      installId: "private-site",
      label: "Private Site",
      packageAppKey: "private-site",
      packageRevision: privatePackage.packageRevision,
      registrationPolicy: "closed",
      sourceSchemaHash: privatePackage.sourceSchemaHash,
      status: "installed",
      updatedAt: "2026-05-25T00:00:00.000Z",
    } satisfies AppInstall;
    const registry = runtimeInstalledAppRouteRegistryFromResponse({
      installs: [privateInstall],
      packages: [privatePackage],
    });

    expect(registry.installs).toEqual([privateInstall]);
    expect(registry.packages).toEqual([privatePackage]);
    expect(registry.activePackageResolver?.findPackage("private-site")).toMatchObject({
      packageAppKey: "private-site",
      sourceOrigin: "workspace",
      sourceSchemaKey: "private-site",
    });
    expect(registry.activePackageResolver?.findPackage("site")).toBeUndefined();
  });

  it("keeps installed app registry refresh keys stable across app screen paths", () => {
    const runtimeProfile = createDevRuntimeProfile();

    expect(runtimeInstalledAppRouteRegistryRefreshKey(runtimeProfile, "/apps/crm")).toBe(
      "/apps/crm",
    );
    expect(runtimeInstalledAppRouteRegistryRefreshKey(runtimeProfile, "/apps/crm/audiences")).toBe(
      "/apps/crm",
    );
    expect(runtimeInstalledAppRouteRegistryRefreshKey(runtimeProfile, "/sites/site/blog")).toBe(
      "/sites/site",
    );
    expect(runtimeInstalledAppRouteRegistryRefreshKey(runtimeProfile, "/crm/audiences")).toBe(
      "/crm/audiences",
    );
  });

  it("renders installed Tasks generated UI from the install-scoped target", () => {
    const appInstalls = [
      appInstallFixture({
        installId: "task-workspace",
        label: "Task Workspace",
        packageAppKey: "tasks",
      }),
    ];
    const installedWorld = findRuntimeWorldMountByRoute(
      createDevRuntimeProfile(),
      "/apps/task-workspace",
      { appInstalls },
    );

    if (
      !installedWorld?.target ||
      typeof installedWorld.target !== "object" ||
      installedWorld.target.kind !== "appInstall"
    ) {
      throw new Error("Expected installed Tasks target for /apps/task-workspace.");
    }

    applyBootstrapResponse(bootstrap(taskSeedRecords, appSchema), installedWorld.target);
    const html = renderRoute("/apps/task-workspace", undefined, appInstalls);

    expectGeneratedAppChromeLabels(html, { appTitle: "Tasks", screenTitle: "Tasks" });
    expectAppSettings(html, {
      appLabel: "Tasks",
      resetScopeLabel: "Tasks app install task-workspace",
      schemaKey: "tasks",
      syncWorldKey: "app:task-workspace",
    });
    expectHtmlToContain(html, "Create Task");
    expect(html).not.toContain("Loading Tasks...");
    expect(installedWorld.target.browserDatabaseName).toBe("formless:app:task-workspace");
  });

  it("renders installed CRM generated UI from the install-scoped target", () => {
    const appInstalls = [
      appInstallFixture({
        installId: "crm",
        label: "CRM",
        packageAppKey: "crm",
      }),
    ];
    const installedWorld = findRuntimeWorldMountByRoute(createDevRuntimeProfile(), "/apps/crm", {
      appInstalls,
    });

    if (
      !installedWorld?.target ||
      typeof installedWorld.target !== "object" ||
      installedWorld.target.kind !== "appInstall"
    ) {
      throw new Error("Expected installed CRM target for /apps/crm.");
    }

    applyBootstrapResponse(bootstrap(crmSeedRecords, crmSourceSchema), installedWorld.target);
    const html = renderRoute("/apps/crm", undefined, appInstalls);

    expectGeneratedAppChromeLabels(html, { appTitle: "CRM", screenTitle: "Contacts" });
    expectAppSettings(html, {
      appLabel: "CRM",
      resetScopeLabel: "CRM app install crm",
      schemaKey: "crm",
      syncWorldKey: "app:crm",
    });
    expectHtmlToContain(html, 'href="/apps/crm/audiences"');
    expectHtmlToContain(html, 'href="/apps/crm/campaigns"');
    expectHtmlToContain(html, 'href="/apps/crm/broadcasts"');
    expectHtmlToContain(html, "Create Contact");
    expectHtmlToContain(html, "Email addresses");
    expect(html).not.toContain("Loading CRM...");
    expect(installedWorld.target.browserDatabaseName).toBe("formless:app:crm");
  });

  it("keeps installed Site home routes scoped to the installed app target", () => {
    applyBootstrapResponse(bootstrap(testSiteSeedRecords, siteSourceSchema), "site");
    const appInstalls = [appInstallFixture({ installId: "personal", label: "Personal Site" })];
    const loadingHtml = renderRoute("/apps/personal/settings", undefined, appInstalls);

    expect(loadingHtml).toContain('data-formless-astryx-shell-scope="multiApp"');
    expect(loadingHtml).toContain('data-testid="formless-astryx-application-shell:');
    expectRuntimeShell(loadingHtml);
    expectGeneratedAppChromeLabels(loadingHtml, { appTitle: "Site", screenTitle: "Site" });
    expectAppSettings(loadingHtml, {
      appLabel: "Site",
      resetScopeLabel: "Site app install personal",
      schemaKey: "site",
      syncWorldKey: "app:personal",
    });
    expect(loadingHtml).toContain("Loading Site...");
    expect(loadingHtml).not.toContain(">Pages<");
    expect(loadingHtml).not.toContain('href="/apps/personal/settings"');
    expect(loadingHtml).not.toContain("data-sync-status-control");

    resetClientStore();
    const installedWorld = findRuntimeWorldMountByRoute(
      createDevRuntimeProfile(),
      "/apps/personal/settings",
      { appInstalls },
    );
    if (!installedWorld?.target) {
      throw new Error("Expected installed app target for /apps/personal/settings.");
    }
    applyBootstrapResponse(bootstrap(testSiteSeedRecords, siteSourceSchema), installedWorld.target);
    const activeHtml = renderRoute("/apps/personal/settings", undefined, appInstalls);

    expectGeneratedAppChromeLabels(activeHtml, { appTitle: "Site", screenTitle: "Settings" });
    expect(activeHtml).toContain('href="/apps/personal/settings"');
    expect(activeHtml).not.toContain("Loading Site...");
  });

  it("does not render an installed Site schema editor route", () => {
    applyBootstrapResponse(bootstrap(testSiteSeedRecords, siteSourceSchema), "site");
    const appInstalls = [appInstallFixture({ installId: "personal", label: "Personal Site" })];
    const loadingHtml = renderRoute("/apps/personal/schema", undefined, appInstalls);

    expect(loadingHtml).toContain('data-formless-astryx-shell-scope="multiApp"');
    expect(loadingHtml).toContain('data-testid="formless-astryx-application-shell:');
    expectRuntimeShell(loadingHtml);
    expectGeneratedAppChromeLabels(loadingHtml, { appTitle: "Site", screenTitle: "Site" });
    expectAppSettings(loadingHtml, {
      appLabel: "Site",
      resetScopeLabel: "Site app install personal",
      schemaKey: "site",
      syncWorldKey: "app:personal",
    });
    expect(loadingHtml).not.toContain("Site Schema");
    expect(loadingHtml).not.toContain("Loading draft");
    expect(loadingHtml).not.toContain("Open app");
    expect(loadingHtml).not.toContain('aria-label="Schema saved"');
    expect(loadingHtml).not.toContain("Saved draft");
    expect(loadingHtml).not.toContain("&quot;siteSettingsHome&quot;");
    expect(loadingHtml).not.toContain("data-sync-status-control");

    resetClientStore();
    const installedWorld = findRuntimeWorldMountByRoute(
      createDevRuntimeProfile(),
      "/apps/personal/schema",
      {
        appInstalls,
      },
    );
    if (!installedWorld?.target) {
      throw new Error("Expected installed app target for /apps/personal/schema.");
    }
    applyBootstrapResponse(bootstrap(testSiteSeedRecords, siteSourceSchema), installedWorld.target);
    const activeHtml = renderRoute("/apps/personal/schema", undefined, appInstalls);

    expect(activeHtml).toContain("Not found");
    expect(activeHtml).not.toContain('aria-label="Schema saved"');
    expect(activeHtml).not.toContain("&quot;siteSettingsHome&quot;");
  });

  it("does not render a workspace package schema editor route", () => {
    const privatePackage = privateSitePackage();
    const appInstalls = [
      appInstallFromPackage({
        appPackage: privatePackage,
        installId: "private-site",
        label: "Workspace Site",
      }),
    ];
    const registry = runtimeInstalledAppRouteRegistryFromResponse({
      installs: appInstalls,
      packages: [privatePackage],
    });
    const installedWorld = findRuntimeWorldMountByRoute(
      createDevRuntimeProfile(),
      "/apps/private-site/schema",
      {
        activePackageResolver: registry.activePackageResolver,
        appInstalls,
      },
    );

    if (!installedWorld?.target) {
      throw new Error("Expected workspace package target for /apps/private-site/schema.");
    }

    applyBootstrapResponse(bootstrap(testSiteSeedRecords, siteSourceSchema), installedWorld.target);
    const html = renderRoute("/apps/private-site/schema", undefined, appInstalls, {
      installedAppRoutePackages: [privatePackage],
    });

    expectHtmlToContain(html, 'data-formless-astryx-shell-scope="multiApp"');
    expectHtmlToContain(html, 'data-testid="formless-astryx-application-shell:');
    expectRuntimeShell(html);
    expectGeneratedAppChromeLabels(html, { appTitle: "Private Site", screenTitle: "Private Site" });
    expectAppSettings(html, {
      appLabel: "Private Site",
      resetScopeLabel: "Private Site app install private-site",
      schemaKey: "private-site",
      syncWorldKey: "app:private-site",
    });
    expectHtmlToContain(html, "Not found");
    expect(html).not.toContain('aria-label="Private Site schema editor"');
    expect(html).not.toContain('data-slot="schema-key-badge"');
    expect(html).not.toContain('aria-label="Schema saved"');
    expect(html).not.toContain("data-sync-status-control");
  });

  it("routes installed Site public paths without workbench chrome", () => {
    const appInstalls = [appInstallFixture({ installId: "personal", label: "Personal Site" })];
    const html = renderToStaticMarkup(
      <Router ssrPath="/sites/personal/blog/shipping-schema-backed-authoring">
        <App
          installedAppRouteInstalls={appInstalls}
          routeComponents={appRouteComponents({
            HomeRoute,
            SitePageRoute: SitePageRouteProbe,
          })}
          runtimeProfile={createDevRuntimeProfile()}
        />
      </Router>,
    );

    expectHtmlToContain(html, 'data-site-link-mode="installed"');
    expectHtmlToContain(html, 'data-site-slug="blog/shipping-schema-backed-authoring"');
    expectHtmlToContain(html, 'data-route-base="/sites/personal"');
    expectHtmlToContain(html, 'data-target-kind="appInstall"');
    expectHtmlToContain(html, 'data-install-id="personal"');
    expectHtmlToContain(html, 'data-built-in-renderer="FormlessSitePageRenderer"');
    expectHtmlToContain(
      html,
      'data-built-in-system-state-renderer="FormlessSiteSystemStateRenderer"',
    );
    expect(html).not.toContain('data-testid="formless-astryx-application-shell:');
  });

  it("does not route non-Site installs through installed Site public paths", () => {
    const appInstalls = [
      appInstallFixture({
        installId: "task-workspace",
        label: "Task Workspace",
        packageAppKey: "tasks",
      }),
    ];
    const html = renderToStaticMarkup(
      <Router ssrPath="/sites/task-workspace">
        <App
          installedAppRouteInstalls={appInstalls}
          routeComponents={appRouteComponents({
            HomeRoute,
            SitePageRoute: SitePageRouteProbe,
          })}
          runtimeProfile={createDevRuntimeProfile()}
        />
      </Router>,
    );

    expectHtmlToContain(html, "Not found");
    expect(html).not.toContain('data-site-link-mode="installed"');
    expect(html).not.toContain('data-testid="formless-astryx-application-shell:');
  });

  it('does not render a source app schema editor at "/tasks/schema"', () => {
    applyBootstrapResponse(bootstrap([], appSchema), "tasks");
    const html = renderRoute("/tasks/schema");

    expectHtmlToContain(html, 'data-formless-astryx-shell-scope="multiApp"');
    expect(html).not.toContain('data-frame="workbench-tool"');
    expectHtmlToContain(html, 'data-testid="formless-astryx-application-shell:');
    expectRuntimeShell(html);
    expectGeneratedAppChromeLabels(html, { appTitle: "Tasks", screenTitle: "Tasks" });
    expectAppSettings(html, {
      appLabel: "Tasks",
      schemaKey: "tasks",
    });
    expectHtmlToContain(html, "Tasks screens");
    expectHtmlToContain(html, "Not found");
    expect(html).not.toContain("Tasks Schema");
    expect(html).not.toContain('data-slot="schema-key-badge"');
    expect(html).not.toContain('aria-label="Tasks route reset controls"');
    expect(html).not.toContain('aria-label="Tasks source reset controls"');
    expect(html).not.toContain('aria-label="Schema editor mode"');
    expect(html).not.toContain('aria-label="Schema builder"');
    expect(html).not.toContain('aria-label="Schema source"');
    expect(html).not.toContain('aria-label="Schema saved"');
    expect(html).not.toContain("Save schema");
    expect(html).not.toContain("Revert draft");
    expect(html).not.toContain("Open app");
    expect(html).not.toContain("Reset schema and seed data");
    expect(html).not.toContain('aria-label="Tasks storage snapshot controls"');
    expect(html).not.toContain("Export storage snapshot");
    expect(html).not.toContain("Tasks snapshot file");
    expect(html).not.toContain("Restore storage snapshot");
    expect(html).not.toContain("Reset source schema");
    expect(html).not.toContain("<code>rates</code>");
  });

  it('renders a declared app screen at "/schema"', () => {
    const schema = taskSchemaWithSchemaPathScreen();

    applyBootstrapResponse(bootstrap(taskSeedRecords, schema), "tasks");
    const html = renderRoute("/schema", createAppRuntimeProfile("tasks"));
    const frameHtml = generatedAppFrameHtml(html);

    expectHtmlToContain(html, 'data-formless-astryx-shell-scope="appOnly"');
    expectHtmlToContain(html, 'data-testid="formless-astryx-application-shell:');
    expectGeneratedAppChromeLabels(html, { appTitle: "Tasks", screenTitle: "Schema path" });
    expect(frameHtml).toContain('href="/schema"');
    expect(linkHtml(frameHtml, "/schema")).toContain("Schema path");
    expectHtmlToContain(html, 'aria-label="Schema path tasks"');
    expectHtmlToContain(html, 'aria-label="Schema path tasks copy"');
    expectHtmlToContain(html, "Create Task");
    expect(html).not.toContain('data-slot="schema-key-badge"');
    expect(html).not.toContain('aria-label="Schema editor mode"');
    expect(html).not.toContain("Save schema");
  });

  it('renders the "/pages/home" public site route outside generated admin navigation', () => {
    const html = renderRoute("/pages/home");

    expectHtmlToContain(html, "Loading site page...");
    expectHtmlToContain(html, "Loading home.");
    expect(html).not.toContain('data-testid="formless-astryx-application-shell:');
    expect(html).not.toContain('href="/tasks"');
    expect(html).not.toContain('href="/site/schema"');
  });

  it("supplies explicit Astryx built-ins to source public Site preview routes", () => {
    const html = renderToStaticMarkup(
      <Router ssrPath="/pages/home">
        <App
          routeComponents={appRouteComponents({ SitePageRoute: SitePageRouteProbe })}
          runtimeProfile={createDevRuntimeProfile()}
        />
      </Router>,
    );

    expectHtmlToContain(html, 'data-site-link-mode="preview"');
    expectHtmlToContain(html, 'data-built-in-renderer="FormlessSitePageRenderer"');
    expectHtmlToContain(
      html,
      'data-built-in-system-state-renderer="FormlessSiteSystemStateRenderer"',
    );
  });

  it('renders a published Site profile home at "/" outside generated admin navigation', () => {
    const html = renderRoute("/", createPublishedSiteRuntimeProfile());

    expectHtmlToContain(html, "Loading site page...");
    expectHtmlToContain(html, "Loading home.");
    expect(html).not.toContain('data-testid="formless-astryx-application-shell:');
    expect(html).not.toContain('href="/tasks"');
    expect(html).not.toContain('href="/site/schema"');
    expect(html).not.toContain("Formless</span>");
  });

  it("rejects published public Site routes whose package has no React adapter", () => {
    const html = renderToStaticMarkup(
      <Router ssrPath="/">
        <App
          routeComponents={appRouteComponents({
            HomeRoute,
            SitePageRoute: SitePageRouteProbe,
          })}
          runtimeProfile={createPublishedSiteRuntimeProfile({ packageAppKey: "private-site" })}
        />
      </Router>,
    );

    expectHtmlToContain(html, "Unsupported public Site package");
    expectHtmlToContain(html, "private-site");
    expect(html).not.toContain('data-site-link-mode="published"');
  });

  it('renders a Site authoring profile home preview at "/" with top-level links', () => {
    const html = renderToStaticMarkup(
      <Router ssrPath="/">
        <App
          routeComponents={appRouteComponents({
            HomeRoute,
            SitePageRoute: SitePageRouteProbe,
          })}
          runtimeProfile={createSiteAuthoringRuntimeProfile()}
        />
      </Router>,
    );

    expectHtmlToContain(html, 'data-site-link-mode="authoring"');
    expectHtmlToContain(html, 'data-site-slug="home"');
    expectHtmlToContain(html, 'data-built-in-renderer="FormlessSitePageRenderer"');
    expectHtmlToContain(
      html,
      'data-built-in-system-state-renderer="FormlessSiteSystemStateRenderer"',
    );
    expect(html).not.toContain('data-testid="formless-astryx-application-shell:');
    expect(html).not.toContain('href="/tasks"');
    expect(html).not.toContain('href="/site/schema"');
  });

  it("renders Site authoring profile slug paths through the public preview", () => {
    const html = renderToStaticMarkup(
      <Router ssrPath="/blog/shipping-schema-backed-authoring">
        <App
          routeComponents={appRouteComponents({
            HomeRoute,
            SitePageRoute: SitePageRouteProbe,
          })}
          runtimeProfile={createSiteAuthoringRuntimeProfile()}
        />
      </Router>,
    );

    expectHtmlToContain(html, 'data-site-link-mode="authoring"');
    expectHtmlToContain(html, 'data-site-slug="blog/shipping-schema-backed-authoring"');
    expect(html).not.toContain('data-testid="formless-astryx-application-shell:');
  });

  it('renders Site authoring profile admin at "/admin" without the multi-app shell', () => {
    applyBootstrapResponse(bootstrap(testSiteSeedRecords, siteSourceSchema), "site");
    const html = renderRoute("/admin", createSiteAuthoringRuntimeProfile());
    const viewSiteLink = linkHtml(html, "/");

    expectHtmlToContain(html, 'data-formless-astryx-shell-scope="appOnly"');
    expectHtmlToContain(html, 'data-testid="formless-astryx-application-shell:');
    expect(viewSiteLink).toContain('aria-label="View site (opens in a new tab)"');
    expect(viewSiteLink).toContain('target="_blank"');
    expectAppSettings(html, { appLabel: "Site", schemaKey: "site" });
    expectGeneratedAppChromeLabels(html, { appTitle: "Site", screenTitle: "Site" });
    expectHtmlToContain(html, "Site screens");
    expectHtmlToContain(html, 'href="/admin/settings"');
    expectHtmlToContain(html, ">Pages<");
    expect(html).not.toContain('href="/tasks"');
    expect(html).not.toContain('href="/site"');
    expect(html).not.toContain('href="/site/schema"');
    expect(html).not.toContain('href="/admin/schema"');
    expect(html).not.toContain('aria-label="Publish Site through local CLI"');
  });

  it('keeps Site authoring schema editing hidden at "/admin/schema" by default', () => {
    applyBootstrapResponse(bootstrap(testSiteSeedRecords, siteSourceSchema), "site");
    const html = renderRoute("/admin/schema", createSiteAuthoringRuntimeProfile());

    expectHtmlToContain(html, 'data-formless-astryx-shell-scope="appOnly"');
    expectHtmlToContain(html, 'data-testid="formless-astryx-application-shell:');
    expectAppSettings(html, { appLabel: "Site", schemaKey: "site" });
    expectHtmlToContain(html, "Not found");
    expect(html).not.toContain("Site Schema");
    expect(html).not.toContain("Save schema");
  });

  it("renders a published Site profile slug path outside generated admin navigation", () => {
    const html = renderRoute("/projects/pricinglab", createPublishedSiteRuntimeProfile());

    expectHtmlToContain(html, "Loading site page...");
    expectHtmlToContain(html, "Loading projects/pricinglab.");
    expect(html).not.toContain('data-testid="formless-astryx-application-shell:');
    expect(html).not.toContain('href="/tasks"');
    expect(html).not.toContain('href="/site/schema"');
  });

  it("renders the account setup route before published Site wildcard routes", () => {
    const html = renderRoute(
      runtimeTopologyRoutes.authAccountSetupRoute,
      createPublishedSiteRuntimeProfile(),
    );

    expectHtmlToContain(html, "Checking setup link");
    expect(html).not.toContain("Loading setup.");
    expect(html).not.toContain('data-testid="formless-astryx-application-shell:');
  });

  it("renders the account sign-in route before published Site wildcard routes", () => {
    const html = renderRoute(
      runtimeTopologyRoutes.authAccountSignInRoute,
      createPublishedSiteRuntimeProfile(),
    );

    expectHtmlToContain(html, "Checking owner session");
    expect(html).not.toContain("Loading login.");
    expect(html).not.toContain('data-testid="formless-astryx-application-shell:');
  });

  it("renders the account route before published Site wildcard routes", () => {
    const html = renderRoute(
      runtimeTopologyRoutes.authAccountRoute,
      createPublishedSiteRuntimeProfile(),
    );

    expectHtmlToContain(html, "Checking account");
    expect(html).not.toContain("Loading formless/auth.");
    expect(html).not.toContain('data-testid="formless-astryx-application-shell:');
  });

  it('renders an app profile home at "/" without the multi-app switcher', () => {
    applyBootstrapResponse(bootstrap(crmSeedRecords, crmSourceSchema), "crm");
    const html = renderRoute("/", createAppRuntimeProfile("crm"));

    expectHtmlToContain(html, 'data-formless-astryx-shell-scope="appOnly"');
    expectHtmlToContain(html, 'data-testid="formless-astryx-application-shell:');
    expectAppSettings(html, {
      appLabel: "CRM",
      schemaKey: "crm",
    });
    expectGeneratedAppChromeLabels(html, { appTitle: "CRM", screenTitle: "Contacts" });
    expect(linkHtml(html, "/")).toContain('aria-current="page"');
    expectHtmlToContain(html, "CRM screens");
    expectHtmlToContain(html, 'href="/audiences"');
    expect(html).not.toContain('href="/tasks"');
    expect(html).not.toContain('href="/site"');
    expect(html).not.toContain('href="/crm"');
    expect(html).not.toContain('href="/crm/schema"');
  });

  it("keeps account auth routes out of app profile generated screens", () => {
    const html = renderRoute(
      runtimeTopologyRoutes.authAccountRoute,
      createAppRuntimeProfile("crm"),
    );

    expectHtmlToContain(html, "Checking account");
    expect(html).not.toContain('data-testid="formless-astryx-application-shell:');
  });

  it('renders an installed app profile home at "/" from the install-scoped target', () => {
    const profile = createInstalledAppRuntimeProfile({
      installId: "task-workspace",
      packageAppKey: "tasks",
    });
    const world = profile?.worlds[0];

    if (!profile || !world?.target) {
      throw new Error("Missing installed app profile.");
    }

    applyBootstrapResponse(bootstrap(taskSeedRecords, appSchema), world.target);
    const html = renderRoute("/", profile);

    expectHtmlToContain(html, 'data-formless-astryx-shell-scope="appOnly"');
    expectHtmlToContain(html, 'data-testid="formless-astryx-application-shell:');
    expectGeneratedAppChromeLabels(html, { appTitle: "Tasks", screenTitle: "Tasks" });
    expectAppSettings(html, {
      appLabel: "Tasks",
      resetScopeLabel: "Tasks app install task-workspace",
      schemaKey: "tasks",
      syncWorldKey: "app:task-workspace",
    });
    expectHtmlToContain(html, "Create Task");
    expect(html).not.toContain("Loading Tasks...");
    expect(html).not.toContain('href="/apps/task-workspace"');
    expect(html).not.toContain('href="/tasks"');
  });

  it('renders a workspace package app profile home at "/" from active package metadata', () => {
    const privatePackage = privateSitePackage();
    const pendingProfile = createInstalledAppRuntimeProfile({
      installId: "private-site",
      packageAppKey: "private-site",
    });

    if (!pendingProfile) {
      throw new Error("Missing pending workspace app profile.");
    }

    const registry = runtimeInstalledAppRouteRegistryFromResponse({
      installs: [],
      packages: [privatePackage],
    });
    const profile = runtimeProfileWithActivePackageResolver(
      pendingProfile,
      registry.activePackageResolver,
    );
    const world = findRuntimeWorldMountByRoute(profile, "/");

    if (!world?.target) {
      throw new Error("Missing workspace app profile target.");
    }

    applyBootstrapResponse(bootstrap(testSiteSeedRecords, siteSourceSchema), world.target);
    const html = renderRoute("/", pendingProfile, [], {
      installedAppRoutePackages: [privatePackage],
    });

    expectHtmlToContain(html, 'data-formless-astryx-shell-scope="appOnly"');
    expectHtmlToContain(html, 'data-testid="formless-astryx-application-shell:');
    expectAppSettings(html, {
      appLabel: "Private Site",
      resetScopeLabel: "Private Site app install private-site",
      schemaKey: "private-site",
      syncWorldKey: "app:private-site",
    });
    expectHtmlToContain(html, ">Pages<");
    expect(html).not.toContain("Not found");
    expect(html).not.toContain('href="/apps/private-site"');
  });

  it("renders an app profile screen path without the schema key prefix", () => {
    applyBootstrapResponse(bootstrap(crmSeedRecords, crmSourceSchema), "crm");
    const html = renderRoute("/audiences", createAppRuntimeProfile("crm"));

    expectGeneratedAppChromeLabels(html, { appTitle: "CRM", screenTitle: "Audiences" });
    expect(linkHtml(html, "/audiences")).toContain('aria-current="page"');
    expectHtmlToContain(html, "CRM screens");
    expectHtmlToContain(html, 'href="/"');
    expectHtmlToContain(html, 'href="/audiences"');
    expectAppSettings(html, {
      appLabel: "CRM",
      schemaKey: "crm",
    });
    expectHtmlToContain(html, "Create Audience");
    expect(html).not.toContain('href="/crm/audiences"');
  });

  it('does not render an installed app profile schema editor at "/schema"', () => {
    const profile = createInstalledAppRuntimeProfile({
      installId: "task-workspace",
      packageAppKey: "tasks",
    });
    const world = profile?.worlds[0];

    if (!profile || !world?.target) {
      throw new Error("Missing installed app profile.");
    }

    applyBootstrapResponse(bootstrap(taskSeedRecords, appSchema), world.target);
    const html = renderRoute("/schema", profile);

    expectHtmlToContain(html, 'data-formless-astryx-shell-scope="appOnly"');
    expectHtmlToContain(html, 'data-testid="formless-astryx-application-shell:');
    expectGeneratedAppChromeLabels(html, { appTitle: "Tasks", screenTitle: "Tasks" });
    expectAppSettings(html, {
      appLabel: "Tasks",
      resetScopeLabel: "Tasks app install task-workspace",
      schemaKey: "tasks",
      syncWorldKey: "app:task-workspace",
    });
    expectHtmlToContain(html, "Not found");
    expect(html).not.toContain('data-slot="schema-key-badge"');
    expect(html).not.toContain('aria-label="Schema saved"');
    expect(html).not.toContain("Save schema");
    expect(html).not.toContain('href="/apps/task-workspace/schema"');
  });

  it('does not render a workspace package app profile schema editor at "/schema"', () => {
    const privatePackage = privateSitePackage();
    const pendingProfile = createInstalledAppRuntimeProfile({
      installId: "private-site",
      packageAppKey: "private-site",
    });

    if (!pendingProfile) {
      throw new Error("Missing pending workspace app profile.");
    }

    const registry = runtimeInstalledAppRouteRegistryFromResponse({
      installs: [],
      packages: [privatePackage],
    });
    const profile = runtimeProfileWithActivePackageResolver(
      pendingProfile,
      registry.activePackageResolver,
    );
    const world = findRuntimeWorldMountByRoute(profile, "/schema");

    if (!world?.target) {
      throw new Error("Missing workspace app profile schema target.");
    }

    applyBootstrapResponse(bootstrap(testSiteSeedRecords, siteSourceSchema), world.target);
    const html = renderRoute("/schema", pendingProfile, [], {
      installedAppRoutePackages: [privatePackage],
    });

    expectHtmlToContain(html, 'data-formless-astryx-shell-scope="appOnly"');
    expectHtmlToContain(html, 'data-testid="formless-astryx-application-shell:');
    expectGeneratedAppChromeLabels(html, { appTitle: "Private Site", screenTitle: "Private Site" });
    expectAppSettings(html, {
      appLabel: "Private Site",
      resetScopeLabel: "Private Site app install private-site",
      schemaKey: "private-site",
      syncWorldKey: "app:private-site",
    });
    expectHtmlToContain(html, "Not found");
    expect(html).not.toContain('aria-label="Private Site schema editor"');
    expect(html).not.toContain('data-slot="schema-key-badge"');
    expect(html).not.toContain('aria-label="Schema saved"');
    expect(html).not.toContain("Save schema");
    expect(html).not.toContain('href="/apps/private-site/schema"');
  });

  it('does not render an app profile schema editor at "/schema" without a declared screen', () => {
    applyBootstrapResponse(bootstrap(crmSeedRecords, crmSourceSchema), "crm");
    const html = renderRoute("/schema", createAppRuntimeProfile("crm"));

    expectHtmlToContain(html, 'data-formless-astryx-shell-scope="appOnly"');
    expectHtmlToContain(html, 'data-testid="formless-astryx-application-shell:');
    expectGeneratedAppChromeLabels(html, { appTitle: "CRM", screenTitle: "CRM" });
    expectHtmlToContain(html, "Not found");
    expect(html).not.toContain("CRM Schema");
    expect(html).not.toContain('data-slot="schema-key-badge"');
    expectAppSettings(html, {
      appLabel: "CRM",
      schemaKey: "crm",
    });
    expect(html).not.toContain('aria-label="CRM route reset controls"');
    expect(html).not.toContain("Reset schema and seed data");
    expect(html).not.toContain("Save schema");
    expect(html).not.toContain('href="/tasks"');
    expect(html).not.toContain('href="/site"');
    expect(html).not.toContain('href="/crm/schema"');
  });
});

describe("public Site route runtime", () => {
  it("refetches the active preview tree after pushed Site sync", async () => {
    const fetchPaths: string[] = [];
    const states: SitePageRouteState[] = [];
    const tree = sitePageTree("home");
    let notifySynced: (() => void) | undefined;
    let stoppedPreviewSync = false;

    const stop = startSitePageRouteSession({
      fetcher: siteTreeFetcher(fetchPaths, tree),
      linkMode: "preview",
      listenForPreviewChanges: () => () => {},
      onState: (state) => states.push(state),
      slug: "home",
      startPreviewSync: (onSynced) => {
        notifySynced = onSynced;
        return () => {
          stoppedPreviewSync = true;
        };
      },
    });

    try {
      await waitFor(() => states.some((state) => state.status === "ready"));
      expect(fetchPaths).toEqual(["/api/site/tree/home"]);

      notifySynced?.();

      await waitFor(() => states.filter((state) => state.status === "ready").length === 2);
      expect(fetchPaths).toEqual(["/api/site/tree/home", "/api/site/tree/home"]);
      expect(states.filter((state) => state.status === "ready")).toHaveLength(2);
    } finally {
      stop();
    }

    expect(stoppedPreviewSync).toBe(true);
  });

  it("refetches the active authoring preview tree after pushed Site sync", async () => {
    const fetchPaths: string[] = [];
    const states: SitePageRouteState[] = [];
    let notifySynced: (() => void) | undefined;

    const stop = startSitePageRouteSession({
      fetcher: siteTreeFetcher(fetchPaths, sitePageTree("blog")),
      linkMode: "authoring",
      listenForPreviewChanges: () => () => {},
      onState: (state) => states.push(state),
      slug: "blog",
      startPreviewSync: (onSynced) => {
        notifySynced = onSynced;
        return () => {};
      },
    });

    try {
      await waitFor(() => states.some((state) => state.status === "ready"));
      expect(fetchPaths).toEqual(["/api/site/tree/blog"]);

      notifySynced?.();

      await waitFor(() => states.filter((state) => state.status === "ready").length === 2);
      expect(fetchPaths).toEqual(["/api/site/tree/blog", "/api/site/tree/blog"]);
    } finally {
      stop();
    }
  });

  it("refetches the active preview tree after same-profile Site changes", async () => {
    const fetchPaths: string[] = [];
    const states: SitePageRouteState[] = [];
    let notifyChanged: (() => void) | undefined;
    let stoppedPreviewChanges = false;

    const stop = startSitePageRouteSession({
      fetcher: siteTreeFetcher(fetchPaths, sitePageTree("home")),
      linkMode: "preview",
      listenForPreviewChanges: (onChanged) => {
        notifyChanged = onChanged;
        return () => {
          stoppedPreviewChanges = true;
        };
      },
      onState: (state) => states.push(state),
      slug: "home",
      startPreviewSync: () => () => {},
    });

    try {
      await waitFor(() => states.some((state) => state.status === "ready"));

      notifyChanged?.();

      await waitFor(() => fetchPaths.length === 2);
      expect(fetchPaths).toEqual(["/api/site/tree/home", "/api/site/tree/home"]);
    } finally {
      stop();
    }

    expect(stoppedPreviewChanges).toBe(true);
  });

  it("aborts in-flight preview tree fetches and subscriptions on cleanup", () => {
    let signal: AbortSignal | undefined;
    let stoppedPreviewSync = false;
    let stoppedPreviewChanges = false;

    const fetcher: typeof fetch = (_input, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    };

    const stop = startSitePageRouteSession({
      fetcher,
      linkMode: "preview",
      listenForPreviewChanges: () => {
        return () => {
          stoppedPreviewChanges = true;
        };
      },
      onState: () => {},
      slug: "home",
      startPreviewSync: () => {
        return () => {
          stoppedPreviewSync = true;
        };
      },
    });

    expect(signal?.aborted).toBe(false);

    stop();

    expect(signal?.aborted).toBe(true);
    expect(stoppedPreviewSync).toBe(true);
    expect(stoppedPreviewChanges).toBe(true);
  });

  it("renders the same published app shell markup from SSR and hydrated route state", () => {
    const tree = sitePageTree("home");
    const ReadySitePageRoute = ({
      builtInRenderer,
      builtInSystemStateRenderer,
      linkMode = "preview",
    }: {
      builtInRenderer: SitePublicRendererComponent;
      builtInSystemStateRenderer: SitePublicSystemStateRendererComponent;
      linkMode?: "preview" | "authoring" | "published" | "installed";
      slug: string;
    }) => (
      <SitePageRouteView
        builtInRenderer={builtInRenderer}
        builtInSystemStateRenderer={builtInSystemStateRenderer}
        linkMode={linkMode}
        state={{ status: "ready", tree }}
      />
    );
    const ssrHtml = renderToString(<FormlessSitePageRenderer linkMode="published" tree={tree} />);
    const hydratedAppHtml = renderToString(
      <Router ssrPath="/">
        <App
          routeComponents={appRouteComponents({
            HomeRoute,
            SitePageRoute: ReadySitePageRoute,
          })}
          runtimeProfile={createPublishedSiteRuntimeProfile()}
        />
      </Router>,
    );

    expect(stripReactSuspenseMarkers(hydratedAppHtml)).toBe(ssrHtml);
  });
});

describe("generated collection home", () => {
  it("characterizes home route query state as schema-key local", () => {
    const currentRouteState = withHomeRouteSelectedSectionContextRecordId(
      withHomeRouteSelectedSectionQueryName(
        withHomeRouteSelectedScreenName(createHomeRouteSelectionState(), "taskHome"),
        "taskHome",
        "tasks",
        "taskCompleted",
      ),
      "taskHome",
      "tasks",
      "record-1",
    );
    const nextRouteState = createHomeRouteSelectionState();
    const tasksSectionKey = homeRouteSectionSelectionKey("taskHome", "tasks");

    expect(currentRouteState).toEqual({
      selectedScreenName: "taskHome",
      selectedQueryNamesBySection: {
        [tasksSectionKey]: "taskCompleted",
      },
      selectedContextIdsBySection: {
        [tasksSectionKey]: "record-1",
      },
    });
    expect(nextRouteState).toEqual({
      selectedScreenName: null,
      selectedQueryNamesBySection: {},
      selectedContextIdsBySection: {},
    });
  });

  it("characterizes context state as screen-section local", () => {
    const state = withHomeRouteSelectedSectionContextRecordId(
      withHomeRouteSelectedSectionContextRecordId(
        createHomeRouteSelectionState(),
        "rateHome",
        "rates",
        "card-1",
      ),
      "rateSetup",
      "rates",
      "card-2",
    );

    expect(selectHomeRouteSectionContextRecordId(state, "rateHome", "rates")).toBe("card-1");
    expect(selectHomeRouteSectionContextRecordId(state, "rateSetup", "rates")).toBe("card-2");
    expect(selectHomeRouteSectionContextRecordId(state, "rateSetup", "resources")).toBeNull();
    expect(selectHomeRouteSectionQueryName(state, "rateHome", "rates")).toBeNull();
  });

  it("renders Tasks as the collection title with query tabs and actions", () => {
    applyBootstrapResponse(bootstrap([]));
    const html = renderRoute("/tasks");

    expectHtmlToContain(html, 'data-formless-astryx-workspace="workspace:taskHome"');
    expectHtmlToContain(html, "Tasks");
    expectHtmlToContain(html, "All");
    expectHtmlToContain(html, "Active");
    expectHtmlToContain(html, "Completed");
    expectHtmlToContain(html, "Overdue");
    expectHtmlToContain(html, 'aria-label="More Task actions"');
    expectHtmlToContain(html, "Create Task");
    expectHtmlToContain(html, "Clear completed");
    expect(html).not.toContain('aria-label="Collection summary"');
  });

  it("renders the source one-section task screen with the existing home layout", () => {
    applyBootstrapResponse(bootstrap([], appSchema));
    const html = renderRoute("/tasks");

    expectHtmlToContain(html, 'data-formless-astryx-workspace="workspace:taskHome"');
    expectHtmlToContain(html, "Tasks");
    expectHtmlToContain(html, "All");
    expectHtmlToContain(html, "Active");
    expectHtmlToContain(html, "Completed");
    expectHtmlToContain(html, "Overdue");
    expectHtmlToContain(html, 'aria-label="More Task actions"');
    expectHtmlToContain(html, "Create Task");
    expectHtmlToContain(html, "Clear completed");
    expect(html).not.toContain('aria-label="Screens"');
    expect(html).not.toContain('aria-label="Collections"');
  });

  it("renders primary screen links and hides non-primary screens", () => {
    applyBootstrapResponse(bootstrap([], taskNavigationScreenSchema()));
    const html = renderRoute("/tasks");

    expectHtmlToContain(html, "Tasks screens");
    expect(html).not.toContain('aria-label="Collections"');
    expectHtmlToContain(html, 'href="/tasks"');
    expectHtmlToContain(html, 'href="/tasks/review"');
    expectHtmlToContain(html, "Task home");
    expectHtmlToContain(html, "Task review");
    expect(html).not.toContain("Hidden setup");
    expectHtmlToContain(html, "Create Task");
  });

  it("routes one-section screens through the selected Astryx workspace seam", () => {
    const screen = requiredScreenModel(appSchema, "taskHome");

    applyBootstrapResponse(bootstrap(taskSeedRecords, appSchema));

    const screenHtml = renderGeneratedHomeScreen(screen, { today: "2026-05-02" });

    expect(screenHtml).toContain('data-formless-astryx-workspace="workspace:taskHome"');
    expect(screenHtml).toContain("data-formless-astryx-workspace-collection=");
    expect(screenHtml).toContain('aria-label="Task records"');
  });

  it("renders the generated Site tree through the selected Astryx workspace seam", () => {
    bootstrapSiteEditor();
    const html = renderRoute("/site");

    expectHtmlToContain(html, "Site screens");
    expectHtmlToContain(html, 'href="/site/settings"');
    expectHtmlToContain(html, ">Settings<");
    expect(linkHtml(html, "/site")).toContain('aria-current="page"');
    expect(linkHtml(html, "/site/settings")).not.toContain('aria-current="page"');
    expect(html).not.toContain("Example Site");
    expect(html).not.toContain("A public test site.");
    expectHtmlToContain(html, ">Pages<");
    expectHtmlToContain(html, ">Posts<");
    expectHtmlToContain(html, ">Projects<");
    expectHtmlToContain(html, ">Navigation<");
    expectHtmlToContain(html, 'aria-label="Create Post"');
    expectHtmlToContain(html, 'aria-label="Create Project"');
    expect(html).not.toContain('aria-label="Create Site"');
    expect(html).not.toContain('data-formless-delete-record="rec_site_settings_primary"');
    expectHtmlToContain(html, 'data-formless-astryx-workspace="workspace:siteEditor"');
    expectHtmlToContain(html, "data-formless-astryx-workspace-collection=");
    expectHtmlToContain(html, "data-formless-astryx-tree-layout=");
    expectHtmlToContain(html, "data-formless-astryx-tree-outline=");
    expectHtmlToContain(html, "data-formless-astryx-tree-editor=");
    expectHtmlToContain(html, "data-formless-astryx-tree-actions=");
    expectHtmlToContain(html, "data-formless-astryx-tree-child-creation=");
  });

  it("renders generated Site settings on a dedicated screen", () => {
    bootstrapSiteEditor();
    const html = renderRoute("/site/settings");

    expectHtmlToContain(html, "data-formless-astryx-workspace=");
    expect(linkHtml(html, "/site/settings")).toContain('aria-current="page"');
    expectHtmlToContain(html, "Site screens");
    expectHtmlToContain(html, 'href="/site"');
    expectHtmlToContain(html, 'href="/site/settings"');
    expectHtmlToContain(html, 'placeholder="Label"');
    expectHtmlToContain(html, ">Description");
    expectHtmlToContain(html, 'aria-label="Edit Icon"');
    expectHtmlToContain(html, ">Accent color");
    expectHtmlToContain(html, ">Background color");
    expectHtmlToContain(html, 'aria-label="Site record"');
    expect(html).not.toContain('data-slot="table"');
    expect(html).not.toContain('role="grid"');
    expectHtmlToContain(html, "Example Site");
    expectHtmlToContain(html, "A public test site.");
    expectHtmlToContain(html, 'value="#C98A2E"');
    expectHtmlToContain(html, 'value="#09090B"');
    expect(html).not.toContain(">Pages<");
    expect(html).not.toContain(">Posts<");
    expect(html).not.toContain('aria-label="Create Site"');
    expect(html).not.toContain('data-formless-delete-record="rec_site_settings_primary"');
  });

  it("renders generated Site settings fields without create or delete workflows", () => {
    const collection = requiredSiteCollectionModel("siteSettingsHome");

    bootstrapSiteEditor();
    const html = renderGeneratedHomeCollection(collection, { today: "2026-05-02" });

    expectHtmlToContain(html, 'placeholder="Label"');
    expectHtmlToContain(html, ">Description");
    expectHtmlToContain(html, 'aria-label="Edit Icon"');
    expectHtmlToContain(html, 'data-astryx-icon-preview="valid"');
    expectHtmlToContain(html, ">Accent color");
    expectHtmlToContain(html, ">Background color");
    expectHtmlToContain(html, 'aria-label="Site record"');
    expectHtmlToContain(html, "Example Site");
    expectHtmlToContain(html, "A public test site.");
    expectHtmlToContain(html, 'value="#C98A2E"');
    expectHtmlToContain(html, 'value="#09090B"');
    expect(html).not.toContain(">Key<");
    expect(html).not.toContain('aria-label="Create Site"');
    expect(html).not.toContain('data-formless-delete-record="rec_site_settings_primary"');
  });

  it("renders source Site list/detail delete controls only when context entity policy enables them", () => {
    const disabledSchema = schemaWithEntityDeletePolicy(siteSourceSchema, "block", false);
    const disabledCollection = requiredCollectionModel(disabledSchema, "siteCompositionHome");
    const enabledCollection = requiredSiteCollectionModel("siteCompositionHome");

    applyBootstrapResponse(
      bootstrap(
        [siteBlockRecord("page-1", { type: "page", label: "Disposable page" })],
        disabledSchema,
      ),
      "site",
    );
    const disabledHtml = renderGeneratedHomeCollection(disabledCollection, {
      selectedContextRecordId: "page-1",
      today: "2026-05-02",
    });

    resetClientStore();
    applyBootstrapResponse(
      bootstrap(
        [siteBlockRecord("page-1", { type: "page", label: "Disposable page" })],
        siteSourceSchema,
      ),
      "site",
    );
    const enabledHtml = renderGeneratedHomeCollection(enabledCollection, {
      selectedContextRecordId: "page-1",
      today: "2026-05-02",
    });

    expect(disabledHtml).not.toContain('aria-label="More actions for Disposable page"');
    expect(enabledHtml).toContain('aria-label="More actions for Disposable page"');
  });

  it("renders synthetic stack sections in order with independent selected queries", () => {
    const schema = taskStackScreenSchema();
    const screen = requiredScreenModel(schema, "taskStack");

    applyBootstrapResponse(
      bootstrap(
        [
          taskRecord("record-1", "Needs active work", false, "2026-05-10"),
          taskRecord("record-2", "Finished shipped work", true, "2026-05-01"),
        ],
        schema,
      ),
    );

    const html = renderGeneratedHomeScreen(screen, {
      selectedQueryNamesBySection: {
        open: "taskActive",
        done: "taskCompleted",
      },
      today: "2026-05-02",
    });
    const openSection = sliceSectionHtml(html, "Open work", "Done work");
    const doneSection = sliceSectionHtml(html, "Done work");

    expect(html.indexOf(">Open work</h2>")).toBeLessThan(html.indexOf(">Done work</h2>"));
    expect(openSection).toContain("Needs active work");
    expect(openSection).not.toContain("Finished shipped work");
    expect(doneSection).toContain("Finished shipped work");
    expect(doneSection).not.toContain("Needs active work");
  });

  it("renders synthetic stack sections with independent selected context records", () => {
    const schema = rateStackScreenSchema();
    const screen = requiredScreenModel(schema, "rateStack");

    applyBootstrapResponse(
      bootstrap(
        [
          cardRecord("card-1", "Default"),
          cardRecord("card-2", "Backup"),
          resourceRecord("resource-1", "Designer"),
          rateCardRateRecord("rate-1", "resource-1", "card-1", 475),
          rateCardRateRecord("rate-2", "resource-1", "card-2", 900),
        ],
        schema,
      ),
    );

    const html = renderGeneratedHomeScreen(screen, {
      selectedContextRecordIdsBySection: {
        defaultCard: "card-1",
        backupCard: "card-2",
      },
      today: "2026-05-02",
    });
    const defaultSection = sliceSectionHtml(html, "Default card rates", "Backup card rates");
    const backupSection = sliceSectionHtml(html, "Backup card rates");

    expect(defaultSection).toContain('value="475.00"');
    expect(defaultSection).not.toContain('value="900.00"');
    expect(backupSection).toContain('value="900.00"');
    expect(backupSection).not.toContain('value="475.00"');
  });

  it("labels generated placement operation rows from the active entity", () => {
    const collection = requiredSiteCollectionModel("pageCompositionHome");

    bootstrapSiteEditor();
    const html = renderGeneratedHomeCollection(collection, {
      selectedContextRecordId: "rec_site_content_home",
      today: "2026-05-05",
    });

    expectHtmlToContain(html, 'aria-label="More Placement actions"');
    expect(html).not.toContain('aria-label="More Task actions"');
  });

  it("renders query tab counts from each resolved query", () => {
    applyBootstrapResponse(
      bootstrap([
        taskRecord("record-1", "Open overdue", false, "2026-01-01"),
        taskRecord("record-2", "Open later", false, "2026-12-31"),
        taskRecord("record-3", "Finished", true, "2026-05-01"),
      ]),
    );
    const html = renderRoute("/tasks");

    expectHtmlToContain(html, 'aria-label="Task records"');
    expectHtmlToContain(html, 'role="list"');
    expectHtmlToContain(html, 'aria-label="Open overdue"');
    expectHtmlToContain(html, 'aria-label="Open later"');
    expectHtmlToContain(html, 'aria-label="Finished"');
    expect(html).toMatch(/aria-label="All count"[^>]*>3</);
    expect(html).toMatch(/aria-label="Active count"[^>]*>2</);
    expect(html).toMatch(/aria-label="Completed count"[^>]*>1</);
    expect(html).toMatch(/aria-label="Overdue count"[^>]*>1</);
  });

  it("sorts generated list items and projects directional ordering actions without drag handles", () => {
    const schema = taskListOrderingSchema();
    const model = requiredCollectionModel(schema, "taskHome");

    applyBootstrapResponse(
      bootstrap(
        [
          orderedTaskRecord("record-3", "Third", 3000),
          orderedTaskRecord("record-1", "First", 1000),
          orderedTaskRecord("record-2", "Second", 2000),
        ],
        schema,
      ),
    );
    const html = renderGeneratedHomeCollection(model, { today: "2026-05-02" });
    const firstIndex = html.indexOf('value="First"');
    const secondIndex = html.indexOf('value="Second"');
    const thirdIndex = html.indexOf('value="Third"');

    expect(firstIndex).toBeGreaterThan(-1);
    expect(firstIndex).toBeLessThan(secondIndex);
    expect(secondIndex).toBeLessThan(thirdIndex);
    expectHtmlToContain(html, 'aria-label="Task records"');
    expectHtmlToContain(html, 'aria-label="Reorder First"');
    expectHtmlToContain(html, 'aria-label="Reorder Second"');
    expectHtmlToContain(html, 'aria-label="Reorder Third"');
    expect(html).not.toContain("data-formless-sortable-list-item");
    expect(html).not.toContain('data-formless-ordering-handle="true"');
  });

  it("renders clear-completed target count and keeps the button enabled at zero", () => {
    applyBootstrapResponse(bootstrap([]));
    const html = renderRoute("/tasks");

    expect(html).toMatch(/aria-label="Clear completed target count"[^>]*>0</);
    expectHtmlToContain(html, "Clear completed");
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>[^<]*Clear completed/);
  });

  it("updates command operation target counts after local record merges", () => {
    applyBootstrapResponse(bootstrap([taskRecord("record-1", "Open", false)]));
    const before = renderRoute("/tasks");

    applyRecordMerge([taskRecord("record-2", "Finished", true)], 2);
    const after = renderRoute("/tasks");

    expect(before).toMatch(/aria-label="Clear completed target count"[^>]*>0</);
    expect(after).toMatch(/aria-label="Clear completed target count"[^>]*>1</);
  });

  it("renders seeded task records with useful query and command operation counts", () => {
    const model = selectPrimaryCollectionModels(appSchema)[0];

    if (!model) {
      throw new Error("Missing task home model.");
    }

    applyBootstrapResponse(bootstrap(taskSeedRecords));
    const html = renderGeneratedHomeCollection(model, { today: "2026-05-02" });

    expectHtmlToContain(html, "Review overdue proposal");
    expectHtmlToContain(html, "Plan today&#x27;s delivery");
    expect(html).toMatch(/aria-label="All count"[^>]*>5</);
    expect(html).toMatch(/aria-label="Active count"[^>]*>4</);
    expect(html).toMatch(/aria-label="Completed count"[^>]*>1</);
    expect(html).toMatch(/aria-label="Overdue count"[^>]*>1</);
    expect(html).toMatch(/aria-label="Clear completed target count"[^>]*>1</);
  });

  it("renders seeded site content from the site route", () => {
    bootstrapSiteEditor();
    const html = renderRoute("/site");

    expectGeneratedAppChromeLabels(html, {
      appTitle: "Site",
      screenTitle: "Blocks",
      allowSidebarGroupLabel: true,
    });
    expectHtmlToContain(html, 'data-formless-astryx-workspace="workspace:siteEditor"');
    expect(linkHtml(html, "/site")).toContain('aria-current="page"');
    expectHtmlToContain(html, "Site screens");
    expectHtmlToContain(html, 'href="/site/settings"');
    expectHtmlToContain(html, ">Pages<");
    expectHtmlToContain(html, ">Posts<");
    expectHtmlToContain(html, ">Projects<");
    expectHtmlToContain(html, ">Navigation<");
    expect(html).not.toContain('href="/site/navigation"');
    expect(html).not.toContain('href="/site/header"');
    expect(html).not.toContain('href="/site/footer"');
    expectHtmlToContain(html, "Navigation");
    expectHtmlToContain(html, "Posts");
    expectHtmlToContain(html, "Projects");
    expectHtmlToContain(html, "Header");
    expectHtmlToContain(html, "Footer");
    expectHtmlToContain(html, 'aria-label="Home tree"');
    expect(html).not.toContain('aria-label="Pages records"');
    expect(html).not.toContain('aria-label="Collections"');
    expectHtmlToContain(html, "data-formless-astryx-tree-layout=");
    expect(html).not.toContain("Add placement");
    expect(html).not.toContain("Create Block<");
    expect(html).not.toContain('aria-label="Create Site"');
    expect(html).not.toContain('data-formless-delete-record="rec_site_settings_primary"');
    expect(html).not.toContain("h-9 w-full text-2xl font-semibold");
    expectHtmlToContain(html, ">Body");
    expectHtmlToContain(html, "Home");
    expectHtmlToContain(html, "Blog");
    expectHtmlToContain(html, "Resume");
    expectHtmlToContain(html, "Projects");
    expect(html).not.toContain("Example Site");
    expect(html).not.toContain("A concise personal site for current work");
    expect(html).not.toContain("A public test site.");
    expectHtmlToContain(html, "Schema-backed software for content-heavy products");
    expectHtmlToContain(html, "Site owner portrait");
  });

  it("renders the site route with root sidebar navigation", () => {
    bootstrapSiteEditor();
    const html = generatedAppFrameHtml(renderRoute("/site"));

    expectHtmlToContain(html, 'data-formless-astryx-workspace="workspace:siteEditor"');
    expect(linkHtml(html, "/site")).toContain('aria-current="page"');
    expectHtmlToContain(html, "Site screens");
    expectHtmlToContain(html, 'href="/site/settings"');
    expect(linkHtml(html, "/site/settings")).not.toContain('aria-current="page"');
    expectHtmlToContain(html, ">Pages<");
    expectHtmlToContain(html, ">Posts<");
    expectHtmlToContain(html, ">Projects<");
    expectHtmlToContain(html, ">Navigation<");
    expect(html).not.toContain('href="/site/navigation"');
    expect(html).not.toContain('href="/site/header"');
    expect(html).not.toContain('href="/site/footer"');
    expectHtmlToContain(html, "Pages");
    expectHtmlToContain(html, "Posts");
    expectHtmlToContain(html, "Projects");
    expectHtmlToContain(html, "Navigation");
    expectHtmlToContain(html, 'aria-label="Create Page"');
    expectHtmlToContain(html, 'aria-label="Create Post"');
    expectHtmlToContain(html, 'aria-label="Create Project"');
    expectHtmlToContain(html, 'aria-label="Home tree"');
    expectHtmlToContain(html, "Home");
    expectHtmlToContain(html, "data-formless-astryx-tree-layout=");
    expect(html).not.toContain("data-formless-shell-destination=");
    expect(html).not.toContain("Add placement");
    expect(html).not.toContain('aria-label="Create Site"');
    expect(html).not.toContain('data-formless-delete-record="rec_site_settings_primary"');
    expect(html).not.toContain('aria-label="Collections"');
    expectHtmlToContain(html, 'aria-label="Site application shell"');
  });

  it("does not route site navigation as a separate top-level screen", () => {
    applyBootstrapResponse(bootstrap(testSiteSeedRecords, siteSourceSchema), "site");

    expect(renderRoute("/site/navigation")).toContain("Not found");
  });

  it("routes site settings as a separate top-level screen", () => {
    applyBootstrapResponse(bootstrap(testSiteSeedRecords, siteSourceSchema), "site");

    expect(linkHtml(renderRoute("/site/settings"), "/site/settings")).toContain(
      'aria-current="page"',
    );
  });

  it("does not route site header and footer as top-level screens", () => {
    applyBootstrapResponse(bootstrap(testSiteSeedRecords, siteSourceSchema), "site");

    expect(renderRoute("/site/header")).toContain("Not found");
    expect(renderRoute("/site/footer")).toContain("Not found");
  });

  it("updates site page root selection after local record merges", () => {
    bootstrapSiteEditor();
    const before = renderRoute("/site");

    applyRecordMerge(
      [
        siteBlockRecord("rec_site_content_page_unannounced", {
          type: "page",
          label: "Unannounced page",
          href: "/unannounced",
        }),
      ],
      2,
      "site",
    );
    const after = renderRoute("/site");

    expect(before).not.toContain("Unannounced page");
    expect(after).toContain("Unannounced page");
    expect(after).toContain(">Pages<");
  });

  it("renders the scoped site composition workspace for selected content", () => {
    const compositionModel = requiredSiteCollectionModel("blockCompositionHome");

    bootstrapSiteEditor();
    const html = renderGeneratedHomeCollection(compositionModel, {
      selectedContextRecordId: "rec_site_content_home",
      today: "2026-05-05",
    });

    expectHtmlToContain(html, 'aria-label="Block records"');
    expectHtmlToContain(html, "Home");
    expect(html).toMatch(/aria-label="Home count"[^>]*>3</);
    expectHtmlToContain(html, "Add placement");
    expect(html).not.toContain('aria-label="Header detail"');
    expect(html).not.toContain('aria-label="Footer detail"');
    expectHtmlToContain(html, "Schema-backed software for content-heavy products");
    expectHtmlToContain(html, "Recent posts");
  });

  it("renders header navigation as content block placements", () => {
    const blocksModel = requiredSiteCollectionModel("blockCompositionHome");

    bootstrapSiteEditor();
    const html = renderGeneratedHomeCollection(blocksModel, {
      selectedContextRecordId: "rec_site_content_group_header",
      today: "2026-05-05",
    });

    expectHtmlToContain(html, 'aria-label="Block records"');
    expectHtmlToContain(html, "Header");
    expect(html).toMatch(/aria-label="Header count"[^>]*>2</);
    expectHtmlToContain(html, "Add placement");
    expect(html).not.toContain('value="link"');
    expectHtmlToContain(html, "Primary");
    expectHtmlToContain(html, "Secondary");
  });

  it("renders only primary rate-card collection navigation", () => {
    applyBootstrapResponse(bootstrap(rateCardSeedRecords, rateCardSchema), "tasks");
    const html = renderRoute("/tasks");

    expect(html).not.toContain('aria-label="Collections"');
    expectHtmlToContain(html, "Tasks screens");
    expectHtmlToContain(html, 'href="/tasks/setup"');
    expectHtmlToContain(html, "Rates");
    expectHtmlToContain(html, "Create Resource");
    expect(html).not.toContain("Regenerate missing rates");
    expect(html).not.toMatch(/<button[^>]*>Create Rate<\/button>/);
  });

  it("routes setup through the app screen path", () => {
    applyBootstrapResponse(bootstrap(rateCardSeedRecords, rateCardSchema), "tasks");
    const html = renderRoute("/tasks/setup");

    expect(linkHtml(html, "/tasks/setup")).toContain('aria-current="page"');
    expectHtmlToContain(html, "Tasks screens");
    expectHtmlToContain(html, 'href="/tasks"');
    expectHtmlToContain(html, 'href="/tasks/setup"');
    expectHtmlToContain(html, ">Rate cards</h2>");
    expectHtmlToContain(html, ">Resources</h2>");
    expectHtmlToContain(html, "Create Rate card");
    expectHtmlToContain(html, "Create Resource");
    expect(html).not.toContain(">Rates</h1>");
  });

  it("renders the scoped rate-card collection with a card selector", () => {
    const rateModel = selectRateHomeModel();

    applyBootstrapResponse(
      bootstrap(
        [
          cardRecord("card-1", "Default"),
          cardRecord("card-2", "Backup"),
          resourceRecord("resource-1", "Designer"),
          rateCardRateRecord("rate-1", "resource-1", "card-1", 475),
          rateCardRateRecord("rate-2", "resource-1", "card-2", 900),
        ],
        rateCardSchema,
      ),
    );
    const html = renderGeneratedHomeCollection(rateModel, {
      selectedContextRecordId: null,
      today: "2026-05-01",
    });

    expectHtmlToContain(html, 'aria-label="Rate card records"');
    expectHtmlToContain(html, "Default");
    expectHtmlToContain(html, "Backup");
    expect(html).not.toContain('aria-label="Default Rates count"');
    expect(html).not.toContain('aria-label="Backup Rates count"');
    expectHtmlToContain(html, 'aria-label="Create Rate card"');
    expectHtmlToContain(html, 'aria-label="Create Resource"');
    expect(html).not.toContain("Regenerate missing rates");
    expectHtmlToContain(html, '<table aria-label="Rate records"');
    expectHtmlToContain(html, "<th");
    expectHtmlToContain(html, "Role");
    expectHtmlToContain(html, 'aria-label="Role"');
    expectHtmlToContain(html, 'value="Designer"');
    expect(html).not.toContain("Edit shared");
    expect(html).not.toContain('aria-label="Edit shared resource"');
    expectHtmlToContain(html, 'aria-label="Cost"');
    expectHtmlToContain(html, ">Unit");
    expectFormattedNumberInputLabel(html, "Cost");
    expect(html).not.toContain('aria-label="Price unit"');
    expect(html).not.toContain('aria-label="Currency"');
    expect(html).not.toContain("USD");
    expect(html.match(/\/ day/g)?.length ?? 0).toBe(3);
    expectHtmlToContain(html, 'value="325"');
    expectHtmlToContain(html, 'value="475.00"');
    expect(html).not.toContain('value="900.00"');
  });

  it("falls back to the first scoped context option when the selected context is stale", () => {
    const rateModel = selectRateHomeModel();

    applyBootstrapResponse(
      bootstrap(
        [
          cardRecord("card-1", "Default"),
          cardRecord("card-2", "Backup"),
          resourceRecord("resource-1", "Designer"),
          rateCardRateRecord("rate-1", "resource-1", "card-1", 475),
          rateCardRateRecord("rate-2", "resource-1", "card-2", 900),
        ],
        rateCardSchema,
      ),
    );
    const html = renderGeneratedHomeCollection(rateModel, {
      selectedContextRecordId: "missing-card",
      today: "2026-05-01",
    });

    expectHtmlToContain(html, 'aria-label="Rate card records"');
    expectHtmlToContain(html, "Default");
    expectHtmlToContain(html, "Backup");
    expectHtmlToContain(html, '<table aria-label="Rate records"');
    expectHtmlToContain(html, 'value="475.00"');
    expect(html).not.toContain('value="900.00"');
  });

  it("keeps collection operations below the current generated table result", () => {
    const rateModel = selectRateHomeModel();

    applyBootstrapResponse(
      bootstrap(
        [
          cardRecord("card-1", "Default"),
          resourceRecord("resource-1", "Designer"),
          rateCardRateRecord("rate-1", "resource-1", "card-1", 475),
        ],
        rateCardSchema,
      ),
    );
    const html = renderGeneratedHomeCollection(rateModel, {
      selectedContextRecordId: "card-1",
      today: "2026-05-01",
    });
    const tableIndex = html.indexOf('<table aria-label="Rate records"');
    const actionRowIndex = html.indexOf('aria-label="More Rate actions"');

    expect(tableIndex).toBeGreaterThanOrEqual(0);
    expect(actionRowIndex).toBeGreaterThan(tableIndex);
    expectHtmlToContain(html, 'aria-label="Create Resource"');
    expect(html).not.toContain("Regenerate missing rates");
  });

  it("renders list/detail context presentation with selected context fields and rows", () => {
    const schema = rateCardSchemaWithListDetailContext();
    const rateModel = requiredCollectionModel(schema, "rateHome");

    applyBootstrapResponse(
      bootstrap(
        [
          cardRecord("card-1", "Default"),
          cardRecord("card-2", "Backup"),
          resourceRecord("resource-1", "Designer"),
          rateCardRateRecord("rate-1", "resource-1", "card-1", 475),
          rateCardRateRecord("rate-2", "resource-1", "card-2", 900),
        ],
        schema,
      ),
    );
    const html = renderGeneratedHomeCollection(rateModel, {
      selectedContextRecordId: "card-2",
      today: "2026-05-01",
    });

    expectHtmlToContain(html, 'aria-label="Rate card list detail"');
    expect(html).not.toContain('role="tablist"');
    expectHtmlToContain(html, 'aria-label="Backup detail"');
    expect(html).toMatch(/aria-label="Default count"[^>]*>1</);
    expect(html).toMatch(/aria-label="Backup count"[^>]*>1</);
    expectHtmlToContain(html, 'aria-label="Create Rate card"');
    expectHtmlToContain(html, ">Minimum margin");
    expectHtmlToContain(html, ">Medium margin");
    expectHtmlToContain(html, ">Maximum margin");
    expectHtmlToContain(html, 'value="0.4"');
    expectHtmlToContain(html, 'value="0.5"');
    expectHtmlToContain(html, 'value="0.6"');
    expectHtmlToContain(html, '<table aria-label="Rate records"');
    expectHtmlToContain(html, 'value="900.00"');
    expect(html).not.toContain('value="475.00"');
  });

  it("changes list/detail result rows when the selected context changes", () => {
    const schema = rateCardSchemaWithListDetailContext();
    const rateModel = requiredCollectionModel(schema, "rateHome");

    applyBootstrapResponse(
      bootstrap(
        [
          cardRecord("card-1", "Default"),
          cardRecord("card-2", "Backup"),
          resourceRecord("resource-1", "Designer"),
          rateCardRateRecord("rate-1", "resource-1", "card-1", 475),
          rateCardRateRecord("rate-2", "resource-1", "card-2", 900),
        ],
        schema,
      ),
    );
    const defaultHtml = renderGeneratedHomeCollection(rateModel, {
      selectedContextRecordId: "card-1",
      today: "2026-05-01",
    });
    const backupHtml = renderGeneratedHomeCollection(rateModel, {
      selectedContextRecordId: "card-2",
      today: "2026-05-01",
    });

    expect(defaultHtml).toContain('aria-label="Default detail"');
    expect(defaultHtml).toContain('value="475.00"');
    expect(defaultHtml).not.toContain('value="900.00"');
    expect(backupHtml).toContain('aria-label="Backup detail"');
    expect(backupHtml).toContain('value="900.00"');
    expect(backupHtml).not.toContain('value="475.00"');
  });

  it("keeps list/detail query counts and scoped create operations tied to context", () => {
    const schema = rateCardSchemaWithListDetailQueryTabsAndScopedRateCreate();
    const rateModel = requiredCollectionModel(schema, "rateHome");

    applyBootstrapResponse(
      bootstrap(
        [
          cardRecord("card-1", "Default"),
          resourceRecord("resource-1", "Designer"),
          rateCardRateRecord("rate-1", "resource-1", "card-1", 475),
        ],
        schema,
      ),
    );
    const selectedHtml = renderGeneratedHomeCollection(rateModel, {
      selectedContextRecordId: "card-1",
      today: "2026-05-01",
    });

    expect(selectedHtml).toContain('aria-label="Rate queries"');
    expect(selectedHtml).toMatch(/aria-label="Selected card count"[^>]*>1</);
    expect(selectedHtml).toMatch(/aria-label="Selected card again count"[^>]*>1</);
    expect(
      buttonsContainingText(selectedHtml, "Create Rate").some(
        (button) => !/\s(?:aria-disabled|disabled)(?:=|[\s>])/.test(button),
      ),
    ).toBe(true);

    const rateCreateOperation = rateModel.operations.find(
      (operation) => operation.type === "create" && operation.entityName === "rate",
    );

    if (!rateCreateOperation || rateCreateOperation.type !== "create") {
      throw new Error("Missing scoped rate create operation.");
    }

    const rateFormData = new FormData();
    rateFormData.set("resource", "resource-1");
    rateFormData.set("cost", "325");
    rateFormData.set("costUnit", "day");
    rateFormData.set("price", "475");

    expect(
      resolveCreateValues(rateFormData, rateCreateOperation, {
        today: "2026-05-01",
        values: { card: "card-1" },
      }),
    ).toEqual({
      resource: "resource-1",
      cost: 325,
      costUnit: "day",
      price: 475,
      card: "card-1",
    });

    applyBootstrapResponse(bootstrap([resourceRecord("resource-1", "Designer")], schema));
    const emptyHtml = renderGeneratedHomeCollection(rateModel, {
      selectedContextRecordId: null,
      today: "2026-05-01",
    });

    expect(emptyHtml).toContain("No rate card records yet.");
    const emptyCreateButtons = buttonsContainingText(emptyHtml, "Create Rate");
    expect(emptyCreateButtons.length).toBeGreaterThan(0);
    expect(
      emptyCreateButtons.every((button) => /\s(?:aria-disabled|disabled)(?:=|[\s>])/.test(button)),
    ).toBe(true);
  });

  it("renders source rate-card margin and footer aggregates", () => {
    const rateModel = selectRateHomeModel();

    applyBootstrapResponse(
      bootstrap(
        [
          cardRecord("card-1", "Default"),
          cardRecord("card-2", "Backup"),
          resourceRecord("resource-1", "Designer"),
          resourceRecord("resource-2", "Engineer"),
          rateCardRateRecord("rate-1", "resource-1", "card-1", 475),
          rateCardRateRecord("rate-2", "resource-2", "card-1", 600),
          rateCardRateRecord("rate-3", "resource-1", "card-2", 900),
        ],
        rateCardSchema,
      ),
    );
    const html = renderGeneratedHomeCollection(rateModel, {
      selectedContextRecordId: null,
      today: "2026-05-01",
    });

    expect(html).not.toContain('aria-label="Default Rates count"');
    expect(html).not.toContain('aria-label="Backup Rates count"');
    expectHtmlToContain(html, 'aria-label="Cost"');
    expectHtmlToContain(html, 'value="325"');
    expectHtmlToContain(html, 'value="450"');
    expectHtmlToContain(html, 'aria-label="Price"');
    expectHtmlToContain(html, 'value="475.00"');
    expectHtmlToContain(html, 'value="600.00"');
    expectHtmlToContain(html, "Margin");
    expectHtmlToContain(html, "31.58%");
    expectHtmlToContain(html, "25%");
    expect(html).not.toContain('aria-label="Collection summary"');
    expectHtmlToContain(html, 'aria-label="Aggregate footer"');
    expectHtmlToContain(html, 'aria-label="Average cost:');
    expectHtmlToContain(html, "$387.50");
    expectHtmlToContain(html, 'aria-label="Average price:');
    expectHtmlToContain(html, "$537.50");
    expectHtmlToContain(html, 'aria-label="Average margin:');
    expectHtmlToContain(html, "28.29%");
    expect(html).not.toContain("USD");
    expect(html.match(/\/ day/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(html).not.toContain('value="750"');
    expect(html).not.toContain("$900.00");
  });

  it("renders aggregate collection summaries over the active context", () => {
    const schema = rateCardSchemaWithAggregateSummarySlots();
    const rateModel = selectCollectionModels(schema).find(
      (candidate) => candidate.viewName === "rateHome",
    );

    if (!rateModel) {
      throw new Error("Missing rate home model.");
    }

    applyBootstrapResponse(
      bootstrap(
        [
          cardRecord("card-1", "Default"),
          cardRecord("card-2", "Backup"),
          resourceRecord("resource-1", "Designer"),
          resourceRecord("resource-2", "Engineer"),
          rateCardRateRecordWithCost("rate-1", "resource-1", "card-1", 300, 600),
          rateCardRateRecordWithCost("rate-2", "resource-2", "card-1", 100, 200),
          rateCardRateRecordWithCost("rate-3", "resource-1", "card-2", 750, 900),
        ],
        schema,
      ),
    );
    const html = renderGeneratedHomeCollection(rateModel, {
      selectedContextRecordId: "card-1",
      today: "2026-05-01",
    });

    expectHtmlToContain(html, 'aria-label="Collection summary"');
    expectHtmlToContain(html, 'aria-label="Cost total summary"');
    expectHtmlToContain(html, "Cost total");
    expectHtmlToContain(html, "$400.00");
    expectHtmlToContain(html, "/ day");
    expectHtmlToContain(html, 'aria-label="Average margin summary"');
    expectHtmlToContain(html, "Average margin");
    expectHtmlToContain(html, "50%");
    expect(html).not.toContain("$750.00");
  });

  it("renders empty aggregate summary inputs predictably", () => {
    const schema = rateCardSchemaWithAggregateSummarySlots();
    const rateModel = selectCollectionModels(schema).find(
      (candidate) => candidate.viewName === "rateHome",
    );

    if (!rateModel) {
      throw new Error("Missing rate home model.");
    }

    applyBootstrapResponse(
      bootstrap(
        [cardRecord("card-1", "Default"), resourceRecord("resource-1", "Designer")],
        schema,
      ),
    );
    const html = renderGeneratedHomeCollection(rateModel, {
      selectedContextRecordId: "card-1",
      today: "2026-05-01",
    });

    expectHtmlToContain(html, 'aria-label="Collection summary"');
    expectHtmlToContain(html, "Cost total");
    expectHtmlToContain(html, "$0.00");
    expectHtmlToContain(html, "Average margin");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  });

  it("renders aggregate summaries for the active query tab only", () => {
    const schema = taskSchemaWithAggregateSummarySlots();
    const model = selectPrimaryCollectionModels(schema)[0];

    if (!model) {
      throw new Error("Missing task home model.");
    }

    const allQuery = model.collection.queries.tabs.find((tab) => tab.queryName === "taskAll");
    const completedQuery = model.collection.queries.tabs.find(
      (tab) => tab.queryName === "taskCompleted",
    );

    if (!allQuery || !completedQuery) {
      throw new Error("Missing task summary query tabs.");
    }

    applyBootstrapResponse(
      bootstrap(
        [
          {
            ...taskRecord("record-1", "Open", false),
            values: { title: "Open", done: false, estimate: 2 },
          },
          {
            ...taskRecord("record-2", "Finished", true),
            values: { title: "Finished", done: true, estimate: 3 },
          },
        ],
        schema,
      ),
    );

    const allHtml = renderGeneratedHomeCollection(model, {
      selectedQuery: allQuery,
      today: "2026-05-01",
    });
    const completedHtml = renderGeneratedHomeCollection(model, {
      selectedQuery: completedQuery,
      today: "2026-05-01",
    });

    expect(allHtml).toContain("All estimate total");
    expect(allHtml).toContain(">5<");
    expect(allHtml).not.toContain("Completed estimate total");
    expect(completedHtml).toContain("Completed estimate total");
    expect(completedHtml).toContain(">3<");
    expect(completedHtml).not.toContain("All estimate total");
  });

  it("renders selected card context fields from the context item view", () => {
    const rateModel = selectRateHomeModel();

    applyBootstrapResponse(
      bootstrap([cardRecord("card-1", "Default"), cardRecord("card-2", "Backup")], rateCardSchema),
    );
    const html = renderGeneratedHomeCollection(rateModel, {
      selectedContextRecordId: "card-2",
      today: "2026-05-01",
    });

    expect(html).not.toContain('aria-label="Name"');
    expect(html).not.toContain('aria-label="Default"');
    expect(html).not.toContain('type="checkbox"');
    expectHtmlToContain(html, ">Minimum margin");
    expectHtmlToContain(html, ">Medium margin");
    expectHtmlToContain(html, ">Maximum margin");
    expectHtmlToContain(html, 'value="0.4"');
    expectHtmlToContain(html, 'value="0.5"');
    expectHtmlToContain(html, 'value="0.6"');
  });

  it("does not render context item fields when no context record is selected", () => {
    const rateModel = selectRateHomeModel();

    applyBootstrapResponse(bootstrap([], rateCardSchema));
    const html = renderGeneratedHomeCollection(rateModel, {
      selectedContextRecordId: null,
      today: "2026-05-01",
    });

    expectHtmlToContain(html, "No rate card records yet.");
    expect(html).not.toContain(">Minimum margin");
    expect(html).not.toContain(">Medium margin");
    expect(html).not.toContain(">Maximum margin");
  });

  it("changes visible table rows when the selected card changes", () => {
    const rateModel = selectRateHomeModel();

    applyBootstrapResponse(
      bootstrap(
        [
          cardRecord("card-1", "Default"),
          cardRecord("card-2", "Backup"),
          resourceRecord("resource-1", "Designer"),
          rateCardRateRecord("rate-1", "resource-1", "card-1", 475),
          rateCardRateRecord("rate-2", "resource-1", "card-2", 900),
        ],
        rateCardSchema,
      ),
    );
    const html = renderGeneratedHomeCollection(rateModel, {
      selectedContextRecordId: "card-2",
      today: "2026-05-01",
    });

    expectHtmlToContain(html, '<table aria-label="Rate records"');
    expectHtmlToContain(html, 'value="750"');
    expectHtmlToContain(html, 'value="900.00"');
    expect(html).not.toContain('value="325"');
    expect(html).not.toContain('value="475.00"');
  });

  it("renders seeded rate-card rows under the selected card", () => {
    const rateModel = selectRateHomeModel();

    applyBootstrapResponse(bootstrap(rateCardSeedRecords, rateCardSchema));
    const html = renderGeneratedHomeCollection(rateModel, {
      selectedContextRecordId: null,
      today: "2026-05-02",
    });

    expectHtmlToContain(html, "Default");
    expectHtmlToContain(html, "Premium");
    expectHtmlToContain(html, '<table aria-label="Rate records"');
    expectHtmlToContain(html, "Designer");
    expectHtmlToContain(html, "Developer");
    expectHtmlToContain(html, 'value="825.00"');
    expectHtmlToContain(html, 'value="975.00"');
    expect(html).not.toContain('value="990.00"');
    expect(html).not.toContain('value="1170.00"');
  });

  it("keeps the resource create operation enabled without a selected card", () => {
    const rateModel = selectRateHomeModel();

    applyBootstrapResponse(bootstrap([resourceRecord("resource-1", "Designer")], rateCardSchema));
    const html = renderGeneratedHomeCollection(rateModel, {
      selectedContextRecordId: null,
      today: "2026-05-01",
    });

    expectHtmlToContain(html, "No rate card records yet.");
    expectHtmlToContain(html, 'aria-label="Create Resource"');
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Create Resource<\/button>/);
  });
});

describe("generated create values", () => {
  it("resolves resource create values without hidden schema defaults", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );
    const operation = rateModel?.operations.find((candidate) => candidate.type === "create");

    if (!operation || operation.type !== "create") {
      throw new Error("Missing resource create operation.");
    }

    const formData = new FormData();
    formData.set("name", "Producer");

    expect(resolveCreateValues(formData, operation, { today: "2026-05-01" })).toEqual({
      name: "Producer",
    });
  });

  it("resolves current visible create values by field type", () => {
    const entity = fieldBehaviorEntity();
    const operation = createOperation(entity, [
      "title",
      "done",
      "dueDate",
      "estimate",
      "priority",
      "resource",
    ]);
    const formData = new FormData();

    formData.set("title", "Write field tests");
    formData.set("dueDate", "2026-05-06");
    formData.set("estimate", "1.5");
    formData.set("priority", "high");
    formData.set("resource", "rec_resource_1");

    expect(resolveCreateValues(formData, operation)).toEqual({
      title: "Write field tests",
      done: false,
      dueDate: "2026-05-06",
      estimate: 1.5,
      priority: "high",
      resource: "rec_resource_1",
    });

    formData.set("done", "on");
    formData.set("estimate", "");

    expect(resolveCreateValues(formData, operation)).toEqual({
      title: "Write field tests",
      done: true,
      dueDate: "2026-05-06",
      estimate: "",
      priority: "high",
      resource: "rec_resource_1",
    });
  });

  it("resolves create values from active union fields only", () => {
    const operation = requiredCreateOperation(generatedDiscriminatedTaskSchema(), "taskHome");
    const formData = new FormData();

    formData.set("kind", "stream");
    formData.set("title", "Hidden title");
    formData.set("done", "on");

    expect(resolveCreateValues(formData, operation)).toEqual({
      kind: "stream",
      done: true,
    });
  });

  it("resolves scoped create defaults for views that use them", () => {
    const operation = scopedRateCreateOperation();
    const formData = new FormData();
    formData.set("resource", "resource-1");
    formData.set("cost", "325");
    formData.set("costUnit", "day");
    formData.set("price", "475");

    expect(
      resolveCreateValues(formData, operation, {
        today: "2026-05-01",
        values: { card: "card-1" },
      }),
    ).toEqual({
      resource: "resource-1",
      cost: 325,
      costUnit: "day",
      price: 475,
      card: "card-1",
    });
  });

  it("resolves Site scoped create defaults for block placements", () => {
    const collection = requiredSiteCollectionModel("pageCompositionHome");
    const operation = collection.operations.find((candidate) => candidate.type === "create");

    if (!operation || operation.type !== "create") {
      throw new Error("Missing placement create operation.");
    }

    const formData = new FormData();
    formData.set("block", "rec_site_block_home_recent_posts");
    formData.set("label", "Recent posts");

    expect(
      resolveCreateValues(formData, operation, {
        today: "2026-05-05",
        values: { block: "rec_site_content_home" },
      }),
    ).toMatchObject({
      parent: "rec_site_content_home",
      block: "rec_site_block_home_recent_posts",
      label: "Recent posts",
    });
  });

  it("throws when create context defaults are unresolved", () => {
    const operation = scopedRateCreateOperation();
    const formData = new FormData();
    formData.set("resource", "resource-1");
    formData.set("cost", "325");
    formData.set("costUnit", "day");
    formData.set("price", "475");

    expect(() => resolveCreateValues(formData, operation, { today: "2026-05-01" })).toThrow(
      'requires selected context "card"',
    );
  });
});

function createFields(entity: EntitySchema, fieldNames: string[]): CreateFieldConfig[] {
  return fieldNames.map((fieldName) => ({
    fieldName,
    field: entity.fields[fieldName],
    editor: entity.fields[fieldName]?.type ?? "text",
  })) as CreateFieldConfig[];
}

function testCreateOperation(entityName: string): EntityOperationPresentationConfig {
  return testOperation(entityName, "create", "collection");
}

function testUpdateOperation(entityName: string): EntityOperationPresentationConfig {
  return testOperation(entityName, "update", "record");
}

function testDeleteOperation(entityName: string): EntityOperationPresentationConfig {
  return testOperation(entityName, "delete", "record");
}

function testOperation(
  entityName: string,
  kind: "create" | "update" | "delete",
  scope: "collection" | "record",
): EntityOperationPresentationConfig {
  const operationName = kind === "update" ? "update" : kind;
  const effect =
    kind === "create"
      ? { type: "createRecord" as const }
      : kind === "update"
        ? { type: "patchRecord" as const }
        : { type: "deleteRecord" as const };

  return {
    entityName,
    operationName,
    canonicalKey: `${entityName}.${operationName}`,
    label: kind === "create" ? "Create" : kind === "update" ? "Update" : "Delete",
    operation: {
      kind,
      scope,
      input: { fields: {} },
      effect,
      output: { type: kind },
      idempotency: { required: true },
      audit: { input: "summary" },
    },
  };
}

function createOperation(
  entity: EntitySchema,
  fieldNames: string[],
  entityName = "task",
): Extract<HomeOperationConfig, { type: "create" }> {
  const operation = testCreateOperation(entityName);

  return {
    type: "create",
    label: `Create ${entity.label}`,
    entityName,
    entity,
    operationName: operation.operationName,
    operation,
    fields: createFields(entity, fieldNames),
    defaults: [],
    enabled: entityCreateEnabled(entity),
  };
}

function requiredCreateOperation(
  schema: AppSchema,
  viewName: string,
): Extract<HomeOperationConfig, { type: "create" }> {
  const operation = requiredCollectionModel(schema, viewName).operations.find(
    (candidate) => candidate.type === "create",
  );

  if (!operation || operation.type !== "create") {
    throw new Error(`Missing create operation for ${viewName}.`);
  }

  return operation;
}

function generatedDiscriminatedTaskSchema(
  options: {
    defaultKind?: "role" | "stream";
    fixedCreateKind?: "role" | "stream";
    streamItemPresentation?: "fields" | "contextLink";
    treeBranchVariants?: Partial<Record<"role" | "stream", "leaf">>;
  } = {},
): AppSchema {
  const createFields =
    options.fixedCreateKind === undefined
      ? {
          kind: { editor: "enum" },
        }
      : options.fixedCreateKind === "stream"
        ? {
            done: { editor: "boolean" },
          }
        : {
            title: { editor: "text" },
          };

  return parseAppSchema({
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields: {
          kind: {
            type: "enum",
            required: true,
            label: "Kind",
            default: options.defaultKind ?? "role",
            values: {
              role: { label: "Role" },
              stream: { label: "Stream" },
            },
          },
          title: { type: "text", required: false, label: "Title" },
          done: { type: "boolean", required: true, label: "Done", default: false },
        },
        operations: {
          create: {
            label: "Create Task",
            kind: "create",
            scope: "collection",
            input: {
              fields: {
                kind: { field: "kind" },
                title: { field: "title" },
                done: { field: "done" },
              },
            },
            effect: { type: "createRecord" },
            output: { type: "create" },
            idempotency: { required: true },
            audit: { input: "summary" },
          },
          update: {
            label: "Update Task",
            kind: "update",
            scope: "record",
            input: {
              fields: {
                kind: { field: "kind" },
                title: { field: "title" },
                done: { field: "done" },
              },
            },
            effect: { type: "patchRecord" },
            output: { type: "update" },
            idempotency: { required: true },
            audit: { input: "summary" },
          },
        },
      },
      "task-placement": {
        label: "Task placement",
        fields: {
          parent: { type: "reference", required: true, label: "Parent", to: "task" },
          task: { type: "reference", required: true, label: "Task", to: "task" },
          order: { type: "number", required: true, label: "Order" },
        },
        operations: sourceWriteOperations("Task placement", ["parent", "task", "order"]),
      },
    },
    relationships: {
      taskPlacements: {
        kind: "toMany",
        from: { entity: "task" },
        to: { entity: "task-placement", field: "parent" },
      },
    },
    unions: {
      taskByKind: {
        entity: "task",
        discriminator: "kind",
        variants: {
          role: {
            label: "Role",
            fields: ["title"],
          },
          stream: {
            label: "Stream",
            fields: ["done"],
          },
        },
      },
    },
    queries: {
      taskAll: {
        label: "All",
        entity: "task",
        expression: { kind: "all" },
      },
      placementsForSelectedTask: {
        label: "Selected task",
        entity: "task-placement",
        expression: {
          kind: "where",
          ref: { kind: "value", name: "parent" },
          op: "eq",
          value: { kind: "context", name: "task" },
        },
      },
    },
    itemViews: {
      taskVariantItem: {
        entity: "task",
        fields: {
          kind: { editor: "enum", commit: "immediate" },
        },
        union: "taskByKind",
        variants: {
          role: {
            presentation: "fields",
            fields: {
              title: { editor: "text", commit: "field-commit" },
            },
          },
          stream:
            options.streamItemPresentation === "contextLink"
              ? {
                  presentation: "contextLink",
                  labelField: "title",
                  target: { kind: "selectContext", context: "task", record: "self" },
                }
              : {
                  presentation: "fields",
                  fields: {
                    done: { editor: "boolean", commit: "immediate" },
                  },
                },
        },
      },
    },
    tableViews: {
      taskEditTable: {
        entity: "task",
        operations: [
          {
            operation: "task.update",
            label: "Edit task",
            target: { kind: "row" },
            editView: "taskEdit",
          },
        ],
        columns: [
          { type: "field", field: "title" },
          { type: "operationControl", operation: "task.update" },
        ],
      },
    },
    views: {
      taskHome: {
        type: "collection",
        label: "Tasks",
        entity: "task",
        queries: [{ query: "taskAll" }],
        defaultQuery: "taskAll",
        result: { type: "list", itemView: "taskVariantItem" },
        operations: [{ operation: "task.create", createView: "taskCreate" }],
      },
      taskEditHome: {
        type: "collection",
        label: "Task edits",
        entity: "task",
        navigation: { primary: false },
        queries: [{ query: "taskAll" }],
        defaultQuery: "taskAll",
        result: { type: "table", tableView: "taskEditTable" },
      },
      taskTreeHome: {
        type: "collection",
        label: "Task tree",
        entity: "task-placement",
        navigation: { primary: false },
        context: {
          name: "task",
          entity: "task",
          query: "taskAll",
          labelField: "title",
          presentation: "listDetail",
          relationship: "taskPlacements",
        },
        queries: [{ query: "placementsForSelectedTask" }],
        defaultQuery: "placementsForSelectedTask",
        result: {
          type: "tree",
          relationship: "taskPlacements",
          childField: "task",
          childItemView: "taskVariantItem",
          ...(options.treeBranchVariants === undefined
            ? {}
            : { branches: { variants: options.treeBranchVariants } }),
        },
      },
      taskCreate: {
        type: "create",
        entity: "task",
        fields: createFields,
        ...(options.fixedCreateKind === undefined
          ? {}
          : {
              defaults: {
                kind: { kind: "literal", value: options.fixedCreateKind },
              },
            }),
        union: "taskByKind",
        variants: {
          role: {
            presentation: "fields",
            fields: {
              title: { editor: "text" },
            },
          },
          stream: {
            presentation: "fields",
            fields: {
              done: { editor: "boolean" },
            },
          },
        },
      },
      taskEdit: {
        type: "edit",
        entity: "task",
        fields: {
          kind: { editor: "enum", commit: "immediate" },
        },
        union: "taskByKind",
        variants: {
          role: {
            presentation: "fields",
            fields: {
              title: { editor: "text", commit: "field-commit" },
            },
          },
          stream: {
            presentation: "fields",
            fields: {
              done: { editor: "boolean", commit: "immediate" },
            },
          },
        },
      },
    },
    screens: {
      taskHome: {
        type: "workspace",
        label: "Tasks",
        navigation: { primary: true },
        layout: {
          type: "stack",
          sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
        },
      },
    },
  });
}

function sourceWriteOperations(label: string, fields: string[]) {
  const input = {
    fields: Object.fromEntries(fields.map((field) => [field, { field }])),
  };

  return {
    create: {
      label: `Create ${label}`,
      kind: "create",
      scope: "collection",
      input,
      effect: { type: "createRecord" },
      output: { type: "create" },
      idempotency: { required: true },
      audit: { input: "summary" },
    },
    update: {
      label: `Update ${label}`,
      kind: "update",
      scope: "record",
      input,
      effect: { type: "patchRecord" },
      output: { type: "update" },
      idempotency: { required: true },
      audit: { input: "summary" },
    },
  };
}

function requiredCollectionModel(schema: AppSchema, viewName: string) {
  const model = selectCollectionModels(schema).find((candidate) => candidate.viewName === viewName);

  if (!model) {
    throw new Error(`Missing collection model ${viewName}.`);
  }

  return model;
}

function requiredScreenModel(schema: AppSchema, screenName: string) {
  const model = selectScreenModels(schema).find((candidate) => candidate.screenName === screenName);

  if (!model) {
    throw new Error(`Missing screen model ${screenName}.`);
  }

  return model;
}

function schemaWithEntityDeletePolicy(
  schema: AppSchema,
  entityName: string,
  enabled: boolean,
): AppSchema {
  const entity = schema.entities[entityName];

  if (!entity) {
    throw new Error(`Missing entity ${entityName}.`);
  }

  return {
    ...schema,
    entities: {
      ...schema.entities,
      [entityName]: withMutationPolicy(entity, { delete: enabled }),
    },
  };
}

function sliceSectionHtml(html: string, label: string, nextLabel?: string) {
  const startMarker = `>${label}</h2>`;
  const start = html.indexOf(startMarker);

  if (start === -1) {
    throw new Error(`Missing section heading ${label}.`);
  }

  if (!nextLabel) {
    return html.slice(start);
  }

  const end = html.indexOf(`>${nextLabel}</h2>`, start + startMarker.length);

  if (end === -1) {
    throw new Error(`Missing next section heading ${nextLabel}.`);
  }

  return html.slice(start, end);
}

function taskStackScreenSchema(): AppSchema {
  return {
    ...appSchema,
    screens: {
      taskStack: {
        type: "workspace",
        label: "Task stack",
        navigation: {
          primary: true,
        },
        layout: {
          type: "stack",
          sections: [
            {
              id: "open",
              type: "collection",
              label: "Open work",
              view: "taskHome",
            },
            {
              id: "done",
              type: "collection",
              label: "Done work",
              view: "taskHome",
            },
          ],
        },
      },
    },
  };
}

function taskListOrderingSchema(): AppSchema {
  const taskHome = appSchema.views.taskHome;
  const orderField: EntitySchema["fields"][string] = {
    type: "number",
    required: false,
    label: "Order",
  };
  const ordering: ResultOrderingConfig = {
    fieldName: "order",
    field: orderField,
    scope: [],
    presentations: ["dragHandle", "moveMenu"],
  };

  if (taskHome?.type !== "collection" || taskHome.result.type !== "list") {
    throw new Error("Missing task list collection.");
  }

  return {
    ...appSchema,
    entities: {
      ...appSchema.entities,
      task: {
        ...appSchema.entities.task,
        fields: {
          ...appSchema.entities.task.fields,
          order: orderField,
        },
      },
    },
    views: {
      ...appSchema.views,
      taskHome: {
        ...taskHome,
        result: {
          ...taskHome.result,
          ordering: { field: ordering.fieldName, presentations: ordering.presentations },
        },
      },
    },
  };
}

function taskNavigationScreenSchema(): AppSchema {
  const taskHome = appSchema.views.taskHome;

  if (taskHome?.type !== "collection") {
    throw new Error("Missing task home collection view.");
  }

  return {
    ...appSchema,
    views: {
      ...appSchema.views,
      taskHome: {
        ...taskHome,
        navigation: {
          primary: false,
        },
      },
    },
    screens: {
      taskHome: {
        type: "workspace",
        label: "Task home",
        path: "/",
        navigation: {
          primary: true,
        },
        layout: {
          type: "stack",
          sections: [
            {
              id: "tasks",
              type: "collection",
              view: "taskHome",
            },
          ],
        },
      },
      taskReview: {
        type: "workspace",
        label: "Task review",
        path: "/review",
        navigation: {
          primary: true,
        },
        layout: {
          type: "stack",
          sections: [
            {
              id: "review",
              type: "collection",
              view: "taskHome",
            },
          ],
        },
      },
      taskSetup: {
        type: "workspace",
        label: "Hidden setup",
        path: "/setup",
        navigation: {
          primary: false,
        },
        layout: {
          type: "stack",
          sections: [
            {
              id: "setup",
              type: "collection",
              view: "taskHome",
            },
          ],
        },
      },
    },
  };
}

function rateStackScreenSchema(): AppSchema {
  return {
    ...rateCardSchema,
    screens: {
      rateStack: {
        type: "workspace",
        label: "Rate stack",
        navigation: {
          primary: true,
        },
        layout: {
          type: "stack",
          sections: [
            {
              id: "defaultCard",
              type: "collection",
              label: "Default card rates",
              view: "rateHome",
            },
            {
              id: "backupCard",
              type: "collection",
              label: "Backup card rates",
              view: "rateHome",
            },
          ],
        },
      },
    },
  };
}

function scopedRateCreateOperation(): Extract<HomeOperationConfig, { type: "create" }> {
  const rate = rateCardSchema.entities.rate;
  const operation = testCreateOperation("rate");

  return {
    type: "create",
    label: "Create Rate",
    entityName: "rate",
    entity: rate,
    operationName: operation.operationName,
    operation,
    fields: createFields(rate, ["resource", "cost", "costUnit", "price"]),
    defaults: [
      {
        fieldName: "card",
        field: rate.fields.card,
        value: { kind: "context", name: "card" },
      },
    ],
    enabled: entityCreateEnabled(rate),
  };
}

function taskRecord(
  id: string,
  title: string,
  done: boolean,
  dueDate = "2026-05-01",
): StoredRecord {
  const createdAt = `2026-04-29T00:00:0${id.at(-1)}.000Z`;

  return {
    id,
    entity: "task",
    values: { title, done, dueDate },
    createdAt,
    updatedAt: createdAt,
  };
}

function orderedTaskRecord(id: string, title: string, order: number): StoredRecord {
  const record = taskRecord(id, title, false);

  return {
    ...record,
    values: {
      ...record.values,
      order,
    },
  };
}

function resourceRecord(id: string, name: string): StoredRecord {
  const createdAt = `2026-04-29T00:00:0${id.at(-1)}.000Z`;

  return {
    id,
    entity: "resource",
    values: { name, kind: "role", unit: "day" },
    createdAt,
    updatedAt: createdAt,
  };
}

function cardRecord(id: string, name: string): StoredRecord {
  const createdAt = `2026-04-29T00:00:0${id.at(-1)}.000Z`;

  return {
    id,
    entity: "card",
    values: { name, isDefault: false, marginMin: 0.4, marginMed: 0.5, marginMax: 0.6 },
    createdAt,
    updatedAt: createdAt,
  };
}

function rateCardRateRecord(
  id: string,
  resource: string,
  card: string,
  price: number,
): StoredRecord {
  return rateCardRateRecordWithCost(id, resource, card, price - 150, price);
}

function rateCardRateRecordWithCost(
  id: string,
  resource: string,
  card: string,
  cost: number,
  price: number,
): StoredRecord {
  const createdAt = `2026-04-29T00:00:0${id.at(-1)}.000Z`;

  return {
    id,
    entity: "rate",
    values: {
      resource,
      card,
      cost,
      costUnit: "day",
      price,
      priceSet: true,
      currency: "usd",
    },
    createdAt,
    updatedAt: createdAt,
  };
}

function rateCardSchemaWithAggregateSummarySlots(): AppSchema {
  const rateHome = rateCardSchema.views.rateHome as Extract<
    AppSchema["views"][string],
    { type: "collection" }
  >;

  return {
    ...rateCardSchema,
    readModels: {
      computedValues: {
        rateMargin: {
          entity: "rate",
          type: "number",
          expression: rateMarginExpression(),
        },
      },
      aggregates: {
        selectedCardCostTotal: {
          query: "ratesForSelectedCard",
          function: "sum",
          value: { kind: "field", field: "cost" },
        },
        selectedCardAverageMargin: {
          query: "ratesForSelectedCard",
          function: "average",
          value: { kind: "computed", computedValue: "rateMargin" },
        },
      },
    },
    views: {
      ...rateCardSchema.views,
      rateHome: {
        ...rateHome,
        result:
          rateHome.result.type === "table"
            ? { type: "table", tableView: rateHome.result.tableView }
            : rateHome.result,
        summary: [
          {
            type: "aggregate",
            aggregate: "selectedCardCostTotal",
            label: "Cost total",
            suffix: "/ day",
            format: "currency",
          },
          {
            type: "aggregate",
            aggregate: "selectedCardAverageMargin",
            label: "Average margin",
            format: "percent",
          },
        ],
      },
    },
  };
}

function rateCardSchemaWithListDetailContext(): AppSchema {
  const base = rateCardSchemaWithRelatedContext();
  const rateHome = base.views.rateHome;

  if (rateHome?.type !== "collection" || !rateHome.context) {
    throw new Error("Missing rate home context.");
  }

  return {
    ...base,
    views: {
      ...base.views,
      rateHome: {
        ...rateHome,
        context: {
          ...rateHome.context,
          presentation: "listDetail",
        },
      },
    },
  };
}

function rateCardSchemaWithRelatedContext(): AppSchema {
  const rateHome = rateCardSchema.views.rateHome;

  if (rateHome?.type !== "collection" || !rateHome.context) {
    throw new Error("Missing rate home context.");
  }

  return {
    ...rateCardSchema,
    views: {
      ...rateCardSchema.views,
      rateHome: {
        ...rateHome,
        context: {
          ...rateHome.context,
          relationship: "cardRates",
        },
      },
    },
  };
}

function rateCardSchemaWithListDetailQueryTabsAndScopedRateCreate(): AppSchema {
  const base = rateCardSchemaWithListDetailContext();
  const rateHome = base.views.rateHome;
  const rateCreate = base.views.rateCreate;
  const selectedCardQuery = base.queries.ratesForSelectedCard;

  if (rateHome?.type !== "collection") {
    throw new Error("Missing rate home collection.");
  }

  if (rateCreate?.type !== "create") {
    throw new Error("Missing rate create view.");
  }

  if (!selectedCardQuery) {
    throw new Error("Missing selected-card rate query.");
  }

  const { cost, costUnit, price, resource } = rateCreate.fields;

  if (!cost || !costUnit || !price || !resource) {
    throw new Error("Missing rate create fields.");
  }

  return {
    ...base,
    queries: {
      ...base.queries,
      ratesForSelectedCardAgain: {
        ...selectedCardQuery,
        label: "Selected card again",
      },
    },
    views: {
      ...base.views,
      rateHome: {
        ...rateHome,
        queries: [
          ...rateHome.queries,
          {
            query: "ratesForSelectedCardAgain",
            count: { type: "count" },
          },
        ],
        operations: [
          {
            operation: "rate.create",
            createView: "rateCreateForCard",
            label: "Create Rate",
          },
        ],
      },
      rateCreateForCard: {
        type: "create",
        entity: "rate",
        fields: {
          resource,
          cost,
          costUnit,
          price,
        },
        defaults: {
          card: { kind: "context", name: "card" },
        },
      },
    },
  };
}

function taskSchemaWithAggregateSummarySlots(): AppSchema {
  const taskHome = appSchema.views.taskHome as Extract<
    AppSchema["views"][string],
    { type: "collection" }
  >;

  return {
    ...appSchema,
    readModels: {
      aggregates: {
        allEstimateTotal: {
          query: "taskAll",
          function: "sum",
          value: { kind: "field", field: "estimate" },
        },
        completedEstimateTotal: {
          query: "taskCompleted",
          function: "sum",
          value: { kind: "field", field: "estimate" },
        },
      },
    },
    views: {
      ...appSchema.views,
      taskHome: {
        ...taskHome,
        summary: [
          {
            type: "aggregate",
            aggregate: "allEstimateTotal",
            label: "All estimate total",
            format: "number",
          },
          {
            type: "aggregate",
            aggregate: "completedEstimateTotal",
            label: "Completed estimate total",
            format: "number",
          },
        ],
      },
    },
  };
}

function rateMarginExpression(): NumericExpression {
  return {
    kind: "binary",
    op: "divide",
    left: {
      kind: "binary",
      op: "subtract",
      left: { kind: "field", field: "price" },
      right: { kind: "field", field: "cost" },
    },
    right: { kind: "field", field: "price" },
  };
}

function fieldBehaviorEntity(): EntitySchema {
  return {
    label: "Field behavior",
    fields: {
      title: { type: "text", required: true, label: "Title" },
      done: { type: "boolean", required: true, label: "Done", default: false },
      dueDate: { type: "date", required: false, label: "Due date" },
      estimate: { type: "number", required: false, label: "Estimate" },
      priority: {
        type: "enum",
        required: false,
        label: "Priority",
        values: {
          low: { label: "Low" },
          high: { label: "High" },
        },
      },
      resource: {
        type: "reference",
        required: false,
        label: "Resource",
        to: "resource",
        displayField: "name",
      },
    },
  };
}

function expectFormattedNumberInputLabel(html: string, label: string) {
  const labelMatch = html.match(
    new RegExp(`<(?:label[^>]*for|span[^>]*id)="([^"]+)"[^>]*>${escapeRegExp(label)}(?:<|$)`),
  );

  expect(labelMatch).not.toBeNull();

  const id = labelMatch?.[1] ?? "";

  expect(html).toMatch(
    new RegExp(
      `<input(?=[^>]*(?:id="${escapeRegExp(id)}"|aria-labelledby="[^"]*${escapeRegExp(id)}[^"]*"))[^>]*>`,
    ),
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function withMutationPolicy(
  entity: EntitySchema,
  options: { create?: boolean; patch?: boolean; delete?: boolean },
): EntitySchema {
  const createEnabled = options.create ?? entityCreateEnabled(entity);
  const patchEnabled = options.patch ?? entityPatchEnabled(entity);
  const deleteEnabled = options.delete ?? entityDeleteEnabled(entity);
  const operations = { ...entity.operations };

  if (createEnabled) {
    operations.create ??= testCreateOperation("entity").operation;
  } else {
    delete operations.create;
  }

  if (patchEnabled) {
    operations.update ??= testUpdateOperation("entity").operation;
  } else {
    delete operations.update;
  }

  if (deleteEnabled) {
    operations.delete ??= testDeleteOperation("entity").operation;
  } else {
    delete operations.delete;
  }

  return {
    ...entity,
    operations,
  };
}

function entityCreateEnabled(entity: EntitySchema): boolean {
  return entity.operations ? entity.operations.create?.kind === "create" : true;
}

function entityPatchEnabled(entity: EntitySchema): boolean {
  return entity.operations ? entity.operations.update?.kind === "update" : true;
}

function entityDeleteEnabled(entity: EntitySchema): boolean {
  return entity.operations ? entity.operations.delete?.kind === "delete" : false;
}

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 1000;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  throw new Error("Timed out waiting for condition.");
}

function bootstrap(records: StoredRecord[], schema = appSchema): BootstrapResponse {
  return bootstrapResponse(schema, records, {
    cursor: 1,
    schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
  });
}

function taskSchemaWithSchemaPathScreen(): AppSchema {
  return parseAppSchema({
    ...appSchema,
    screens: {
      ...appSchema.screens,
      taskSchemaPath: {
        type: "workspace",
        label: "Schema path",
        path: "/schema",
        navigation: { primary: true },
        layout: {
          type: "stack",
          sections: [
            {
              id: "schema-tasks",
              type: "collection",
              label: "Schema path tasks",
              view: "taskHome",
            },
            {
              id: "schema-tasks-copy",
              type: "collection",
              label: "Schema path tasks copy",
              view: "taskHome",
            },
          ],
        },
      },
    },
  });
}
