import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { Router } from "wouter";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  App,
  type AppRouteComponents,
  runtimeInstalledAppRouteRegistryRefreshKey,
  runtimeInstalledAppRouteRegistryFromResponse,
  selectRuntimeShellInstalledAppLinks,
} from "./app.tsx";
import { GeneratedAppFrame } from "./app/generated-app-frame.tsx";
import { HomeCollection, RecordList } from "./app/generated/collection.tsx";
import {
  GeneratedCreateDialogForm,
  GeneratedCreateForm,
  resolveCreateValues,
} from "./app/generated/create.tsx";
import { RecordFieldEditor } from "./app/generated/record-field-editor.tsx";
import { SchemaAppProvider, useSchemaKey } from "./app/generated/schema-app-context.tsx";
import { HomeScreen } from "./app/generated/screen.tsx";
import { ReferencedRecordEditorFields, RecordTable } from "./app/generated/table.tsx";
import { EditViewFields } from "./app/generated/table-operation-controls.tsx";
import { RecordTree } from "./app/generated/tree.tsx";
import {
  SitePageRoute,
  SitePageRouteView,
  SitePageRenderer,
  startSitePageRouteSession,
  type SitePageRouteState,
} from "@dpeek/formless-site-app/react";
import {
  applyBootstrapResponse,
  applyRecordMerge,
  getClientStoreSnapshot,
  resetClientStore,
} from "./client/store.ts";
import type { TableCollectionResultModel } from "./client/collection-result-model.ts";
import type { ListResultModel } from "./client/list-result-model.ts";
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
  type EditViewConfig,
  type HomeOperationConfig,
  type HomeScreenModel,
  type HomeQueryTabConfig,
  type HomeViewModel,
  type RecordFieldConfig,
  type ResultOrderingConfig,
  type TableColumnConfig,
} from "./client/views.ts";
import { bundledSourceSchemaHashFixtures } from "./shared/upgrade-migrations.ts";
import { COLLABORATOR_INVITATION_ACCEPT_PATH } from "./shared/instance-auth.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { BootstrapResponse } from "./shared/protocol.ts";
import type { SchemaKey } from "./shared/schema-apps.ts";
import type { AppSchema, EntitySchema } from "@dpeek/formless-schema";
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
import { renderRecordTableHtml, requiredTableModel } from "./test/generated-table.tsx";
import { bootstrapResponse } from "./test/protocol-builders.ts";
import {
  bootstrapSiteEditor,
  requiredSiteCollectionModel,
  requiredSiteTableModel,
  siteBlockRecord,
  sitePlacementRecord,
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

function listResult(
  recordFields: RecordFieldConfig[],
  options: Partial<Omit<ListResultModel, "type" | "itemViewName" | "recordFields">> = {},
): ListResultModel {
  return {
    type: "list",
    itemViewName: "testItem",
    recordFields,
    updateOperation: testUpdateOperation("task"),
    transitionOperations: [],
    ...options,
  };
}

function tableResult(
  columns: TableColumnConfig[],
  options: Partial<Omit<TableCollectionResultModel, "type" | "tableViewName" | "columns">> = {},
): TableCollectionResultModel {
  return {
    type: "table",
    tableViewName: "testTable",
    columns,
    updateOperation: testUpdateOperation("task"),
    transitionOperations: [],
    ...options,
  };
}

function SchemaKeyProbeHomeRoute({
  schemaKey: routeSchemaKey,
  target,
}: {
  schemaKey: ClientAppSchemaKey;
  screenPath: string;
  target?: ClientAppTarget;
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
    </main>
  );
}

function TargetProbeHomeRoute({
  schemaKey,
  screenPath,
  target,
}: {
  schemaKey: ClientAppSchemaKey;
  screenPath: string;
  target?: ClientAppTarget;
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
    />
  );
}

function SitePageRouteProbe({
  linkMode,
  routeBase,
  slug,
  target,
}: {
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
    AuthAccountRoute,
    CollaboratorInvitationAcceptanceRoute,
    GeneratedAppFrame,
    HomeRoute,
    InstanceShellRoute,
    LocalSessionRoute,
    OwnerLoginRoute,
    OwnerSetupRoute,
    SitePageRoute,
    ...overrides,
  };
}

function renderSitePage(slug = "home", records = testSiteSeedRecords) {
  return renderToStaticMarkup(<SitePageRenderer tree={sitePageTree(slug, records)} />);
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

function footerLinkHtml(footerHtml: string, href: string): string {
  return linkHtml(footerHtml, href);
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

function sidebarItemHtml(html: string, text: string): string {
  const labelIndex = html.indexOf(`>${text}</span>`);
  const slotIndex = html.lastIndexOf('data-slot="sidebar-item"', labelIndex);
  const itemStart = html.lastIndexOf("<", slotIndex);
  const labelEnd = html.indexOf("</span>", labelIndex);

  if (labelIndex === -1 || slotIndex === -1 || itemStart === -1 || labelEnd === -1) {
    throw new Error(`Missing sidebar item for "${text}".`);
  }

  return html.slice(itemStart, labelEnd + "</span>".length);
}

function articleHtml(html: string, text: string): string {
  const textIndex = html.indexOf(text);
  const articleStart = html.lastIndexOf("<article", textIndex);
  const articleEnd = html.indexOf("</article>", textIndex);

  if (textIndex === -1 || articleStart === -1 || articleEnd === -1) {
    throw new Error(`Missing article for "${text}".`);
  }

  return html.slice(articleStart, articleEnd + "</article>".length);
}

function mainHtml(html: string): string {
  const start = html.indexOf("<main ");
  const end = html.indexOf("</main>", start);

  if (start === -1 || end === -1) {
    throw new Error("Missing public site main element.");
  }

  return html.slice(start, end + "</main>".length);
}

function stripReactSuspenseMarkers(html: string): string {
  return html.replace(/<!--\/?\$[^>]*-->/g, "");
}

function runtimeShellHtml(html: string): string {
  const frameIndex = html.indexOf('data-frame="runtime-shell"');
  const shellStart = html.lastIndexOf("<header", frameIndex);
  const shellEnd = html.indexOf("</header>", frameIndex);

  if (frameIndex === -1 || shellStart === -1 || shellEnd === -1) {
    throw new Error("Missing runtime shell.");
  }

  return html.slice(shellStart, shellEnd + "</header>".length);
}

function instanceRailHtml(html: string): string {
  const railIndex = html.indexOf('data-formless-instance-rail="true"');
  const railStart = html.lastIndexOf("<nav", railIndex);
  const railEnd = html.indexOf("</nav>", railIndex);

  if (railIndex === -1 || railStart === -1 || railEnd === -1) {
    throw new Error("Missing instance rail.");
  }

  return html.slice(railStart, railEnd + "</nav>".length);
}

function generatedAppFrameHtml(html: string): string {
  const frameIndex = html.indexOf('data-frame="generated-app"');

  if (frameIndex === -1) {
    throw new Error("Missing generated app frame.");
  }

  const runtimeShellIndex = html.indexOf('data-frame="runtime-shell"', frameIndex);

  return runtimeShellIndex === -1
    ? html.slice(frameIndex)
    : html.slice(frameIndex, runtimeShellIndex);
}

function recordsWithContentListBlocks(
  records: StoredRecord[] = testSiteSeedRecords,
): StoredRecord[] {
  return [
    ...records,
    siteBlockRecord("rec_site_block_blog_posts", {
      type: "postList",
      label: "Latest posts",
    }),
    siteBlockRecord("rec_site_block_projects_index", {
      type: "projectList",
      label: "Project index",
    }),
    blockPlacementRecord(
      "rec_site_place_blog_posts",
      "rec_site_content_blog",
      "rec_site_block_blog_posts",
      1000,
    ),
    blockPlacementRecord(
      "rec_site_place_projects_index",
      "rec_site_content_projects",
      "rec_site_block_projects_index",
      1000,
    ),
  ];
}

function blockPlacementRecord(
  id: string,
  parent: string,
  block: string,
  order: number,
  options: {
    label?: string;
    slot?: string;
  } = {},
): StoredRecord {
  return {
    id,
    entity: "block-placement",
    values: {
      parent,
      block,
      order,
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.slot === undefined ? {} : { slot: options.slot }),
    },
    createdAt: "2026-05-05T00:00:40.000Z",
    updatedAt: "2026-05-05T00:00:40.000Z",
  };
}

function recordsWithPrimaryImages(records: StoredRecord[] = testSiteSeedRecords): StoredRecord[] {
  return [
    ...records,
    siteBlockRecord("rec_site_media_post_primary_first", {
      type: "image",
      label: "Shipping primary first",
      mediaAssetId: "post-primary-first.webp",
      width: 1600,
      height: 900,
    }),
    siteBlockRecord("rec_site_media_post_primary_second", {
      type: "image",
      label: "Shipping primary second",
      mediaAssetId: "post-primary-second.png",
      width: 1600,
      height: 900,
    }),
    siteBlockRecord("rec_site_media_project_primary", {
      type: "image",
      label: "OpenSurf primary",
      mediaAssetId: "project-primary.webp",
      width: 1200,
      height: 900,
    }),
    blockPlacementRecord(
      "rec_site_place_post_primary_second",
      "rec_site_content_post_shipped_schema",
      "rec_site_media_post_primary_second",
      200,
      { slot: "primaryImage" },
    ),
    blockPlacementRecord(
      "rec_site_place_post_primary_first",
      "rec_site_content_post_shipped_schema",
      "rec_site_media_post_primary_first",
      100,
      { slot: "primaryImage" },
    ),
    blockPlacementRecord(
      "rec_site_place_project_primary",
      "rec_site_content_project_opensurf",
      "rec_site_media_project_primary",
      100,
      { slot: "primaryImage" },
    ),
  ];
}

function countOccurrences(text: string, search: string): number {
  return text.split(search).length - 1;
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
  return renderToStaticMarkup(
    <HomeCollection
      collection={model.collection}
      onSelectContext={() => {}}
      onSelectQuery={() => {}}
      selectedContextRecordId={selectedContextRecordId}
      selectedQuery={selectedQuery}
      today={today}
    />,
  );
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
    <HomeScreen
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

  expect(html).toContain('data-frame="runtime-shell"');
  expect(html).toContain("bg-bg pt-[var(--runtime-shell-height)] text-fg");
  expect(html).toContain('aria-label="Runtime apps"');
  expect(shellHtml).toContain("App management");
  expect(shellHtml).not.toContain("/schema");
  expect(shellHtml).not.toContain("data-sync-status-control");
  expect(shellHtml).not.toContain("Sync details");
  expect(shellHtml).not.toContain("Reset source seed data");
  expect(shellHtml).not.toContain("Publish");
  expect(shellHtml).not.toContain("Export storage snapshot");
  expect(shellHtml).not.toContain("Restore storage snapshot");
  expect(shellHtml).not.toContain("Portable archive");
  expect(shellHtml).not.toContain("App archive");
  expect(shellHtml).not.toContain("Instance archive");
  expect(shellHtml).not.toContain("Restore archive");
  expect(shellHtml).not.toContain("Import app");
  expect(shellHtml).not.toContain("Backup");
  expect(html).not.toContain('aria-label="Workbench actions"');
  expect(html).not.toContain('data-frame="workbench-toolbar"');
}

function expectAppSettings(
  html: string,
  {
    appLabel,
    resetScopeLabel = appLabel,
    schemaKey,
    syncWorldKey = schemaKey,
  }: {
    appLabel: string;
    resetScopeLabel?: string;
    schemaKey: string;
    syncWorldKey?: string;
  },
) {
  expect(html).toContain(`aria-label="${appLabel} app settings"`);
  expect(html).toContain(">App settings<");
  expect(html).toContain(`aria-label="Toggle ${appLabel} navigation and app settings"`);
  expectSyncStatusControl(html, syncWorldKey);
  expect(html).toContain("Reset source seed data");
  expect(html).toContain(`aria-label="Reset source seed data for ${resetScopeLabel}"`);
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

function expectSyncStatusControl(html: string, schemaKey: string) {
  expect(html).toContain("data-sync-status-control");
  expect(html).toContain(`aria-label="Sync status details for ${schemaKey}"`);
  expect(html).toContain("Sync details");
  expect(html).toContain("World</dt>");
  expect(html).toContain(`<code>${schemaKey}</code>`);
  expect(html).toContain("Schema</dt><dd>");
  expect(html).toContain("Cursor</dt><dd>");
  expect(html).toContain('Push sync</dt><dd><span class="capitalize">');
  expect(html).toContain("Last sync</dt><dd>");
}

function expectGeneratedAppChromeLabels(
  html: string,
  {
    appTitle,
    screenTitle,
    allowSidebarGroupLabel = false,
  }: { appTitle: string; screenTitle: string; allowSidebarGroupLabel?: boolean },
) {
  expect(html).toContain(`<div class="px-2 py-1 text-sm font-semibold">${appTitle}</div>`);
  expect(html).toContain(`<h1 class="truncate text-sm font-medium">${screenTitle}</h1>`);
  if (!allowSidebarGroupLabel) {
    expect(html).not.toContain('data-slot="sidebar-group-label"');
  }
}

describe("App smoke routes", () => {
  it('renders the "/" route as the instance shell', () => {
    const html = renderRoute("/");

    expect(html).toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="instance-shell"');
    expect(html).not.toContain('data-frame="generated-app"');
    expectRuntimeShell(html);
    expect(linkHtml(runtimeShellHtml(html), "/")).toContain('aria-current="page"');
    expect(linkHtml(runtimeShellHtml(html), "/")).toContain("App management");
    expect(html).toContain("Instance Settings");
    expect(html).toContain('aria-label="Instance navigation"');
    expect(html).toContain('aria-label="Open Instance Settings"');
    expect(html).toContain('aria-label="Open Access"');
    expect(html).toContain('href="/access"');
    expect(html).not.toContain("Overview");
    expect(html).not.toContain('href="/deployments"');
    expect(html).toContain("Loading installed apps...");
    expect(html).toContain('href="/tasks"');
    expect(html).toContain('href="/site"');
    expect(html).not.toContain("Loading Tasks...");
  });

  it('does not select the "/deployments" instance shell route with local gateway', () => {
    const html = renderRoute("/deployments", undefined, undefined, {
      localWorkspaceGatewayAvailable: true,
    });

    expect(html).toContain('data-frame="workbench"');
    expect(html).not.toContain('data-frame="instance-shell"');
    expect(html).not.toContain('data-frame="generated-app"');
    expectRuntimeShell(html);
    expect(linkHtml(runtimeShellHtml(html), "/")).not.toContain('aria-current="page"');
    expect(html).toContain("Not found");
    expect(html).not.toContain('href="/deployments"');
    expect(html).not.toContain("Deployment setup and progress");
  });

  it('does not select the "/deployments" instance shell route without local gateway', () => {
    const html = renderRoute("/deployments");

    expect(html).toContain('data-frame="workbench"');
    expect(html).not.toContain('data-frame="instance-shell"');
    expect(html).not.toContain('data-frame="generated-app"');
    expectRuntimeShell(html);
    expect(linkHtml(runtimeShellHtml(html), "/")).not.toContain('aria-current="page"');
    expect(html).toContain("Not found");
    expect(html).not.toContain('href="/deployments"');
    expect(html).not.toContain("Deployment setup and progress");
  });

  it("does not mark app management current on unknown dev routes", () => {
    const html = renderRoute("/unknown");

    expect(html).toContain("Not found");
    expectRuntimeShell(html);
    expect(runtimeShellHtml(html)).not.toContain('aria-current="page"');
    expect(linkHtml(runtimeShellHtml(html), "/")).toContain("App management");
    expect(html).not.toContain('data-frame="generated-app"');
    expect(html).not.toContain("Toggle app navigation and settings");
    expect(html).not.toContain("App settings");
  });

  it('renders the "/tasks" route with task navigation', () => {
    const html = renderRoute("/tasks");

    expect(html).toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="generated-app"');
    expectRuntimeShell(html);
    expect(linkHtml(runtimeShellHtml(html), "/")).not.toContain('aria-current="page"');
    expect(linkHtml(runtimeShellHtml(html), "/tasks")).toContain('aria-current="page"');
    expect(html).toContain('href="/tasks"');
    expect(html).toContain("Tasks");
    expect(html).toContain('href="/site"');
    expect(html).toContain("Site");
    expectAppSettings(html, {
      appLabel: "Tasks",
      schemaKey: "tasks",
    });
    expect(html).toContain('aria-label="Tasks screens"');
    expect(html).toContain("Loading Tasks...");
    expect(html).not.toContain("Create Task");
  });

  it('renders the "/site" route with site navigation', () => {
    const html = renderRoute("/site");

    expect(html).toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="generated-app"');
    expectRuntimeShell(html);
    expect(html).toContain('href="/tasks"');
    expect(html).toContain("Tasks");
    expect(html).toContain('href="/site"');
    expect(html).toContain("Site");
    expectAppSettings(html, {
      appLabel: "Site",
      schemaKey: "site",
    });
    expect(html).toContain('aria-label="Site screens"');
    expect(html).toContain("Loading Site...");
    expect(html).not.toContain("Create Content item");
  });

  it("marks active app sidebar screen and settings links as current", () => {
    applyBootstrapResponse(bootstrap(crmSeedRecords, crmSourceSchema), "crm");
    const devSetupHtml = generatedAppFrameHtml(renderRoute("/crm/audiences"));

    expect(linkHtml(devSetupHtml, "/crm/audiences")).toContain('aria-current="page"');
    expect(linkHtml(devSetupHtml, "/crm")).not.toContain('aria-current="page"');
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

    expect(html).toContain("Checking setup link");
    expect(html).toContain("Loading setup status.");
    expect(html).not.toContain('data-frame="workbench"');
    expect(html).not.toContain('data-frame="generated-app"');
    expect(html).not.toContain('aria-label="Runtime apps"');
  });

  it('renders the "/formless/auth/sign-in" owner login route outside workbench chrome', () => {
    const html = renderRoute(runtimeTopologyRoutes.authAccountSignInRoute);

    expect(html).toContain("Checking owner session");
    expect(html).toContain("Loading sign-in state.");
    expect(html).not.toContain('data-frame="workbench"');
    expect(html).not.toContain('data-frame="generated-app"');
    expect(html).not.toContain('aria-label="Runtime apps"');
  });

  it("renders the collaborator invitation acceptance route outside runtime app chrome", () => {
    const html = renderRoute(
      `${COLLABORATOR_INVITATION_ACCEPT_PATH}?invitationId=invitation%3Aada&token=aW52aXRlLXJhdy10b2tlbi0x`,
    );

    expect(html).toContain("Checking invitation");
    expect(html).toContain("Loading invitation status.");
    expect(html).not.toContain('data-frame="workbench"');
    expect(html).not.toContain('data-frame="generated-app"');
    expect(html).not.toContain('aria-label="Runtime apps"');
  });

  it('renders the "/formless/auth" account route outside runtime app chrome', () => {
    const html = renderRoute(runtimeTopologyRoutes.authAccountRoute);
    const gateHtml = renderRoute("/formless/auth/profile-completion");

    expect(html).toContain("Checking account");
    expect(html).toContain("Loading account status.");
    expect(gateHtml).toContain("Checking account");
    expect(html).not.toContain('data-frame="workbench"');
    expect(html).not.toContain('data-frame="generated-app"');
    expect(html).not.toContain('aria-label="Runtime apps"');
  });

  it('renders the "/local-session" route only for local workspace runtimes', () => {
    const html = renderRoute("/local-session", undefined, undefined, {
      localWorkspaceGatewayAvailable: true,
    });
    const unavailableHtml = renderRoute("/local-session");

    expect(html).toContain("Checking local session");
    expect(html).toContain("Verifying owner access.");
    expect(html).not.toContain('data-frame="workbench"');
    expect(html).not.toContain('data-frame="generated-app"');
    expect(html).not.toContain('aria-label="Runtime apps"');
    expect(unavailableHtml).toContain("Not found");
    expect(unavailableHtml).not.toContain("Checking local session");
    expect(unavailableHtml).not.toContain('data-frame="workbench"');
  });

  it("keeps deployed account gate routes available outside default instance onboarding", () => {
    const instanceProfile = createInstanceRuntimeProfile();
    const shellHtml = renderRoute("/", instanceProfile);
    const setupHtml = renderRoute(runtimeTopologyRoutes.authAccountSetupRoute, instanceProfile);
    const signInHtml = renderRoute(runtimeTopologyRoutes.authAccountSignInRoute, instanceProfile);
    const legacySetupHtml = renderRoute("/setup", instanceProfile);
    const legacyLoginHtml = renderRoute("/login", instanceProfile);

    expect(shellHtml).toContain("Loading installed apps...");
    expect(shellHtml).not.toContain("Owner setup");
    expect(shellHtml).not.toContain("Owner sign in");
    expect(setupHtml).toContain("Checking setup link");
    expect(setupHtml).toContain("Loading setup status.");
    expect(signInHtml).toContain("Checking owner session");
    expect(signInHtml).toContain("Loading sign-in state.");
    expect(setupHtml).not.toContain('data-frame="generated-app"');
    expect(signInHtml).not.toContain('data-frame="generated-app"');
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
    expect(shellHtml).toContain("Loading installed apps...");
    expect(accessHtml).toContain("Access");
    expect(accessHtml).toContain("Loading installed apps...");
    expect(accessHtml).toContain('aria-label="Open Access"');
    expect(accessHtml).not.toContain("Not found");
    expect(deploymentsHtml).toContain("Not found");
    expect(deploymentsHtml).not.toContain("Instance");
    expect(deploymentsHtml).not.toContain('data-frame="workbench"');
    expect(deploymentsHtml).not.toContain('aria-label="Runtime apps"');
    expect(deploymentsHtml).not.toContain('href="/deployments"');
    expect(deploymentsHtml).not.toContain("Deployment setup and progress");
    expect(unavailableDeploymentsHtml).toContain("Not found");
    expect(unavailableDeploymentsHtml).not.toContain('href="/deployments"');
    expect(unavailableDeploymentsHtml).not.toContain("Deployment setup and progress");
    expect(shellHtml).not.toContain('data-frame="workbench"');
    expect(shellHtml).not.toContain('aria-label="Runtime apps"');
    expect(adminHtml).toContain('data-frame="generated-app"');
    expect(adminHtml).toContain('data-target-kind="appInstall"');
    expect(adminHtml).toContain('data-install-id="personal"');
    expect(adminHtml).toContain('aria-label="Instance navigation"');
    expect(adminHtml).toContain('aria-label="Open Instance Settings"');
    expect(adminHtml).toContain('aria-label="Open Access"');
    expect(adminHtml).toContain('aria-label="Open Personal Site admin"');
    expect(adminHtml).toContain('aria-label="Open Personal Site public Site"');
    expect(adminHtml).toContain('href="/"');
    expect(adminHtml).not.toContain('aria-label="Site management"');
    expect(adminHtml).not.toContain("App management");
    expect(adminHtml).toContain(
      'aria-label="Reset source seed data for Site app install personal"',
    );
    expectSyncStatusControl(adminHtml, "app:personal");
    expect(adminHtml).not.toContain('href="/apps/personal/schema"');
    expect(adminHtml).not.toContain('href="/deployments"');
    expect(adminHtml).not.toContain('data-frame="workbench"');
  });

  it("renders instance rail initials, public Site icons, and active route state", () => {
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
    const railHtml = instanceRailHtml(html);
    const settingsTile = linkHtml(railHtml, "/");
    const adminTile = linkHtml(railHtml, "/workspace/personal");
    const publicTile = linkHtml(railHtml, "/public/personal");

    expect(html).toContain('data-frame="generated-app"');
    expect(railHtml).toContain('aria-label="Instance navigation"');
    expect(settingsTile).toContain('aria-label="Open Instance Settings"');
    expect(settingsTile).not.toContain('aria-current="page"');
    expect(adminTile).toContain('aria-label="Open Personal Site admin"');
    expect(adminTile).toContain('<span aria-hidden="true">P</span>');
    expect(adminTile).toContain('aria-current="page"');
    expect(publicTile).toContain('aria-label="Open Personal Site public Site"');
    expect(publicTile).toContain("<svg");
    expect(publicTile).not.toContain("<span");
    expect(publicTile).not.toContain('aria-current="page"');
  });

  it("omits the instance rail outside owner instance and dev app shells", () => {
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

    for (const html of [
      appProfileHtml,
      installedProfileHtml,
      publishedSiteHtml,
      signInHtml,
      setupHtml,
    ]) {
      expect(html).not.toContain('data-formless-instance-rail="true"');
      expect(html).not.toContain('aria-label="Instance navigation"');
    }
  });

  it("renders sync details in app settings instead of generated page content", () => {
    applyBootstrapResponse(bootstrap(testSiteSeedRecords, siteSourceSchema), "site");
    const html = renderRoute("/site");

    expect(html).toContain('aria-label="Site app settings"');
    expectSyncStatusControl(html, "site");
    expect(html).toContain('World</dt><dd class="min-w-0 truncate"><code>site</code></dd>');
    expect(html).toContain("Schema</dt><dd>v1</dd>");
    expect(html).toContain("Cursor</dt><dd>1</dd>");
    expect(html).toContain('Push sync</dt><dd><span class="capitalize">idle</span>');
    expect(html).toContain("Local cache ready.");
    expect(html).toContain("Last sync</dt><dd><time");
    expect(html).not.toContain('<p class="text-sm text-slate-600" role="status">');
  });

  it("renders sync errors as noticeable chrome status", () => {
    setSyncStatus({ state: "error", message: "Push sync unavailable." });
    const html = renderRoute("/site");

    expectSyncStatusControl(html, "site");
    expect(html).toContain("Sync issue");
    expect(html).toContain("Push sync unavailable.");
    expect(html).toContain("text-red-700");
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

    expect(html).toContain('data-schema-key="site"');
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

    expect(html).toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="generated-app"');
    expectRuntimeShell(html);
    expect(html).not.toContain('href="/apps/personal/schema"');
    expect(html).toContain('data-route-schema-key="site"');
    expect(html).toContain('data-screen-path="/settings"');
    expect(html).toContain('data-target-kind="appInstall"');
    expect(html).toContain('data-install-id="personal"');
    expectAppSettings(html, {
      appLabel: "Site",
      resetScopeLabel: "Site app install personal",
      schemaKey: "site",
      syncWorldKey: "app:personal",
    });
    expect(html).toContain("Schema</dt><dd>Loading</dd>");
    expect(html).toContain("Cursor</dt><dd>0</dd>");
    expect(html).not.toContain("Schema</dt><dd>v1</dd>");
    expect(runtimeShellHtml(html)).toContain("App management");
    expect(linkHtml(runtimeShellHtml(html), "/site")).not.toContain('aria-current="page"');
    expect(linkHtml(runtimeShellHtml(html), "/apps/personal")).toContain('aria-current="page"');
    expect(linkHtml(runtimeShellHtml(html), "/apps/personal")).toContain("Personal Site");
    expect(html.slice(0, html.indexOf('data-frame="runtime-shell"'))).not.toContain(
      "App management",
    );
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

    expect(html).toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="generated-app"');
    expectRuntimeShell(html);
    expect(html).toContain('data-route-schema-key="tasks"');
    expect(html).toContain('data-screen-path="/"');
    expect(html).toContain('data-target-kind="appInstall"');
    expect(html).toContain('data-install-id="task-workspace"');
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

    expect(html).toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="generated-app"');
    expectRuntimeShell(html);
    expect(html).toContain('data-route-schema-key="private-site"');
    expect(html).toContain('data-screen-path="/dashboard"');
    expect(html).toContain('data-target-kind="appInstall"');
    expect(html).toContain('data-install-id="private-site"');
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
    expect(html).toContain("Create Task");
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
    expect(html).toContain('href="/apps/crm/audiences"');
    expect(html).toContain('href="/apps/crm/campaigns"');
    expect(html).toContain('href="/apps/crm/broadcasts"');
    expect(html).toContain("Create Contact");
    expect(html).toContain("Email addresses");
    expect(html).not.toContain("Loading CRM...");
    expect(installedWorld.target.browserDatabaseName).toBe("formless:app:crm");
  });

  it("keeps installed Site home routes scoped to the installed app target", () => {
    applyBootstrapResponse(bootstrap(testSiteSeedRecords, siteSourceSchema), "site");
    const appInstalls = [appInstallFixture({ installId: "personal", label: "Personal Site" })];
    const loadingHtml = renderRoute("/apps/personal/settings", undefined, appInstalls);

    expect(loadingHtml).toContain('data-frame="workbench"');
    expect(loadingHtml).toContain('data-frame="generated-app"');
    expectRuntimeShell(loadingHtml);
    expectGeneratedAppChromeLabels(loadingHtml, { appTitle: "Site", screenTitle: "Site" });
    expectAppSettings(loadingHtml, {
      appLabel: "Site",
      resetScopeLabel: "Site app install personal",
      schemaKey: "site",
      syncWorldKey: "app:personal",
    });
    expect(loadingHtml).toContain("Loading Site...");
    expect(loadingHtml).toContain("Schema</dt><dd>Loading</dd>");
    expect(loadingHtml).not.toContain('aria-label="Pages roots"');
    expect(loadingHtml).not.toContain('href="/apps/personal/settings"');
    expect(loadingHtml).not.toContain("Schema</dt><dd>v1</dd>");

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
    expect(activeHtml).toContain("Schema</dt><dd>v1</dd>");
    expect(activeHtml).not.toContain("Loading Site...");
  });

  it("does not render an installed Site schema editor route", () => {
    applyBootstrapResponse(bootstrap(testSiteSeedRecords, siteSourceSchema), "site");
    const appInstalls = [appInstallFixture({ installId: "personal", label: "Personal Site" })];
    const loadingHtml = renderRoute("/apps/personal/schema", undefined, appInstalls);

    expect(loadingHtml).toContain('data-frame="workbench"');
    expect(loadingHtml).toContain('data-frame="generated-app"');
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
    expect(loadingHtml).toContain("Schema</dt><dd>Loading</dd>");
    expect(loadingHtml).not.toContain("Saved draft");
    expect(loadingHtml).not.toContain("&quot;siteSettingsHome&quot;");
    expect(loadingHtml).not.toContain("Schema</dt><dd>v1</dd>");

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
    expect(activeHtml).toContain("Schema</dt><dd>v1</dd>");
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

    expect(html).toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="generated-app"');
    expectRuntimeShell(html);
    expectGeneratedAppChromeLabels(html, { appTitle: "Private Site", screenTitle: "Private Site" });
    expectAppSettings(html, {
      appLabel: "Private Site",
      resetScopeLabel: "Private Site app install private-site",
      schemaKey: "private-site",
      syncWorldKey: "app:private-site",
    });
    expect(html).toContain("Not found");
    expect(html).not.toContain('aria-label="Private Site schema editor"');
    expect(html).not.toContain('data-slot="schema-key-badge"');
    expect(html).not.toContain('aria-label="Schema saved"');
    expect(html).toContain("Schema</dt><dd>v1</dd>");
  });

  it("selects supported installed apps for the dev runtime shell picker", () => {
    const runtimeProfile = createDevRuntimeProfile();
    const appInstalls = [
      appInstallFixture({ installId: "personal", label: "Personal Site" }),
      appInstallFixture({ installId: "docs", label: "Docs Site" }),
      appInstallFixture({
        installId: "task-workspace",
        label: "Task Workspace",
        packageAppKey: "tasks",
      }),
      appInstallFixture({
        installId: "crm",
        label: "CRM",
        packageAppKey: "crm",
      }),
    ];
    const routeWorld = findRuntimeWorldMountByRoute(runtimeProfile, "/apps/personal/settings", {
      appInstalls,
    });

    const links = selectRuntimeShellInstalledAppLinks({
      installs: appInstalls,
      routeWorld,
      runtimeProfile,
    });

    expect(links).toEqual([
      {
        href: "/apps/personal",
        installId: "personal",
        isCurrent: true,
        key: "site:personal",
        label: "Personal Site",
        packageAppKey: "site",
      },
      {
        href: "/apps/docs",
        installId: "docs",
        isCurrent: false,
        key: "site:docs",
        label: "Docs Site",
        packageAppKey: "site",
      },
      {
        href: "/apps/task-workspace",
        installId: "task-workspace",
        isCurrent: false,
        key: "tasks:task-workspace",
        label: "Task Workspace",
        packageAppKey: "tasks",
      },
      {
        href: "/apps/crm",
        installId: "crm",
        isCurrent: false,
        key: "crm:crm",
        label: "CRM",
        packageAppKey: "crm",
      },
    ]);
    expect(
      selectRuntimeShellInstalledAppLinks({
        installs: [],
        routeWorld,
        runtimeProfile,
      }),
    ).toEqual([
      {
        href: "/apps/personal",
        installId: "personal",
        isCurrent: true,
        key: "site:personal",
        label: "Site personal",
        packageAppKey: "site",
      },
    ]);
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

    expect(html).toContain('data-site-link-mode="installed"');
    expect(html).toContain('data-site-slug="blog/shipping-schema-backed-authoring"');
    expect(html).toContain('data-route-base="/sites/personal"');
    expect(html).toContain('data-target-kind="appInstall"');
    expect(html).toContain('data-install-id="personal"');
    expect(html).not.toContain('data-frame="workbench"');
    expect(html).not.toContain('data-frame="generated-app"');
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

    expect(html).toContain("Not found");
    expect(html).not.toContain('data-site-link-mode="installed"');
    expect(html).not.toContain('data-frame="workbench"');
    expect(html).not.toContain('data-frame="generated-app"');
  });

  it('does not render a source app schema editor at "/tasks/schema"', () => {
    applyBootstrapResponse(bootstrap([], appSchema), "tasks");
    const html = renderRoute("/tasks/schema");

    expect(html).toContain('data-frame="workbench"');
    expect(html).not.toContain('data-frame="workbench-tool"');
    expect(html).toContain('data-frame="generated-app"');
    expectRuntimeShell(html);
    expectGeneratedAppChromeLabels(html, { appTitle: "Tasks", screenTitle: "Tasks" });
    expectAppSettings(html, {
      appLabel: "Tasks",
      schemaKey: "tasks",
    });
    expect(html).toContain('aria-label="Tasks screens"');
    expect(html).toContain("Not found");
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

    expect(html).not.toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="generated-app"');
    expectGeneratedAppChromeLabels(html, { appTitle: "Tasks", screenTitle: "Schema path" });
    expect(frameHtml).toContain('href="/schema"');
    expect(linkHtml(frameHtml, "/schema")).toContain("Schema path");
    expect(html).toContain('aria-label="Schema path tasks"');
    expect(html).toContain('aria-label="Schema path tasks copy"');
    expect(html).toContain("Create Task");
    expect(html).not.toContain('data-slot="schema-key-badge"');
    expect(html).not.toContain('aria-label="Schema editor mode"');
    expect(html).not.toContain("Save schema");
  });

  it('renders the "/pages/home" public site route outside generated admin navigation', () => {
    const html = renderRoute("/pages/home");

    expect(html).toContain("Loading site page...");
    expect(html).toContain("Loading home.");
    expect(html).not.toContain('data-frame="workbench"');
    expect(html).not.toContain('data-frame="generated-app"');
    expect(html).not.toContain('href="/tasks"');
    expect(html).not.toContain('href="/site/schema"');
  });

  it('renders a published Site profile home at "/" outside generated admin navigation', () => {
    const html = renderRoute("/", createPublishedSiteRuntimeProfile());

    expect(html).toContain("Loading site page...");
    expect(html).toContain("Loading home.");
    expect(html).not.toContain('data-frame="workbench"');
    expect(html).not.toContain('data-frame="generated-app"');
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

    expect(html).toContain("Unsupported public Site package");
    expect(html).toContain("private-site");
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

    expect(html).toContain('data-site-link-mode="authoring"');
    expect(html).toContain('data-site-slug="home"');
    expect(html).not.toContain('data-frame="workbench"');
    expect(html).not.toContain('data-frame="generated-app"');
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

    expect(html).toContain('data-site-link-mode="authoring"');
    expect(html).toContain('data-site-slug="blog/shipping-schema-backed-authoring"');
    expect(html).not.toContain('data-frame="workbench"');
    expect(html).not.toContain('data-frame="generated-app"');
  });

  it('renders Site authoring profile admin at "/admin" without the multi-app shell', () => {
    applyBootstrapResponse(bootstrap(testSiteSeedRecords, siteSourceSchema), "site");
    const html = renderRoute("/admin", createSiteAuthoringRuntimeProfile());

    expect(html).not.toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="generated-app"');
    expectAppSettings(html, { appLabel: "Site", schemaKey: "site" });
    expect(html).toContain('<div class="px-2 py-1 text-sm font-semibold">Site</div>');
    expect(html).toContain('<h1 class="truncate text-sm font-medium">');
    expect(html).toContain('aria-label="Site screens"');
    expect(html).toContain('href="/admin/settings"');
    expect(html).toContain('aria-label="Pages roots"');
    expect(html).not.toContain('href="/tasks"');
    expect(html).not.toContain('href="/site"');
    expect(html).not.toContain('href="/site/schema"');
    expect(html).not.toContain('href="/admin/schema"');
    expect(html).not.toContain('aria-label="Publish Site through local CLI"');
  });

  it('keeps Site authoring schema editing hidden at "/admin/schema" by default', () => {
    applyBootstrapResponse(bootstrap(testSiteSeedRecords, siteSourceSchema), "site");
    const html = renderRoute("/admin/schema", createSiteAuthoringRuntimeProfile());

    expect(html).toContain('data-frame="generated-app"');
    expectAppSettings(html, { appLabel: "Site", schemaKey: "site" });
    expect(html).toContain("Not found");
    expect(html).not.toContain("Site Schema");
    expect(html).not.toContain("Save schema");
  });

  it("renders a published Site profile slug path outside generated admin navigation", () => {
    const html = renderRoute("/projects/pricinglab", createPublishedSiteRuntimeProfile());

    expect(html).toContain("Loading site page...");
    expect(html).toContain("Loading projects/pricinglab.");
    expect(html).not.toContain('data-frame="workbench"');
    expect(html).not.toContain('data-frame="generated-app"');
    expect(html).not.toContain('href="/tasks"');
    expect(html).not.toContain('href="/site/schema"');
  });

  it("renders the account setup route before published Site wildcard routes", () => {
    const html = renderRoute(
      runtimeTopologyRoutes.authAccountSetupRoute,
      createPublishedSiteRuntimeProfile(),
    );

    expect(html).toContain("Checking setup link");
    expect(html).not.toContain("Loading setup.");
    expect(html).not.toContain('data-frame="workbench"');
    expect(html).not.toContain('data-frame="generated-app"');
  });

  it("renders the account sign-in route before published Site wildcard routes", () => {
    const html = renderRoute(
      runtimeTopologyRoutes.authAccountSignInRoute,
      createPublishedSiteRuntimeProfile(),
    );

    expect(html).toContain("Checking owner session");
    expect(html).not.toContain("Loading login.");
    expect(html).not.toContain('data-frame="workbench"');
    expect(html).not.toContain('data-frame="generated-app"');
  });

  it("renders the account route before published Site wildcard routes", () => {
    const html = renderRoute(
      runtimeTopologyRoutes.authAccountRoute,
      createPublishedSiteRuntimeProfile(),
    );

    expect(html).toContain("Checking account");
    expect(html).not.toContain("Loading formless/auth.");
    expect(html).not.toContain('data-frame="workbench"');
    expect(html).not.toContain('data-frame="generated-app"');
  });

  it('renders an app profile home at "/" without the multi-app switcher', () => {
    applyBootstrapResponse(bootstrap(crmSeedRecords, crmSourceSchema), "crm");
    const html = renderRoute("/", createAppRuntimeProfile("crm"));

    expect(html).not.toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="generated-app"');
    expectAppSettings(html, {
      appLabel: "CRM",
      schemaKey: "crm",
    });
    expectGeneratedAppChromeLabels(html, { appTitle: "CRM", screenTitle: "Contacts" });
    expect(html).toContain(">Contacts</h1>");
    expect(html).toContain('aria-label="CRM screens"');
    expect(html).toContain('href="/audiences"');
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

    expect(html).toContain("Checking account");
    expect(html).not.toContain('data-frame="generated-app"');
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

    expect(html).not.toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="generated-app"');
    expectGeneratedAppChromeLabels(html, { appTitle: "Tasks", screenTitle: "Tasks" });
    expectAppSettings(html, {
      appLabel: "Tasks",
      resetScopeLabel: "Tasks app install task-workspace",
      schemaKey: "tasks",
      syncWorldKey: "app:task-workspace",
    });
    expect(html).toContain("Create Task");
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

    expect(html).not.toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="generated-app"');
    expectAppSettings(html, {
      appLabel: "Private Site",
      resetScopeLabel: "Private Site app install private-site",
      schemaKey: "private-site",
      syncWorldKey: "app:private-site",
    });
    expect(html).toContain('aria-label="Pages roots"');
    expect(html).not.toContain("Not found");
    expect(html).not.toContain('href="/apps/private-site"');
  });

  it("renders an app profile screen path without the schema key prefix", () => {
    applyBootstrapResponse(bootstrap(crmSeedRecords, crmSourceSchema), "crm");
    const html = renderRoute("/audiences", createAppRuntimeProfile("crm"));

    expectGeneratedAppChromeLabels(html, { appTitle: "CRM", screenTitle: "Audiences" });
    expect(html).toContain(">Audiences</h1>");
    expect(html).toContain('aria-label="CRM screens"');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/audiences"');
    expectAppSettings(html, {
      appLabel: "CRM",
      schemaKey: "crm",
    });
    expect(html).toContain("Create Audience");
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

    expect(html).not.toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="generated-app"');
    expectGeneratedAppChromeLabels(html, { appTitle: "Tasks", screenTitle: "Tasks" });
    expectAppSettings(html, {
      appLabel: "Tasks",
      resetScopeLabel: "Tasks app install task-workspace",
      schemaKey: "tasks",
      syncWorldKey: "app:task-workspace",
    });
    expect(html).toContain("Not found");
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

    expect(html).not.toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="generated-app"');
    expectGeneratedAppChromeLabels(html, { appTitle: "Private Site", screenTitle: "Private Site" });
    expectAppSettings(html, {
      appLabel: "Private Site",
      resetScopeLabel: "Private Site app install private-site",
      schemaKey: "private-site",
      syncWorldKey: "app:private-site",
    });
    expect(html).toContain("Not found");
    expect(html).not.toContain('aria-label="Private Site schema editor"');
    expect(html).not.toContain('data-slot="schema-key-badge"');
    expect(html).not.toContain('aria-label="Schema saved"');
    expect(html).not.toContain("Save schema");
    expect(html).not.toContain('href="/apps/private-site/schema"');
  });

  it('does not render an app profile schema editor at "/schema" without a declared screen', () => {
    applyBootstrapResponse(bootstrap(crmSeedRecords, crmSourceSchema), "crm");
    const html = renderRoute("/schema", createAppRuntimeProfile("crm"));

    expect(html).not.toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="generated-app"');
    expectGeneratedAppChromeLabels(html, { appTitle: "CRM", screenTitle: "CRM" });
    expect(html).toContain("Not found");
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

describe("public site renderer", () => {
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

  it("renders the Home page tree with header navigation and hero content", () => {
    const html = renderSitePage("home");

    expect(html).toContain("data-site-header");
    expect(html).toContain('data-site-header-nav="desktop"');
    expect(html).toContain("data-site-header-primary");
    expect(html).toContain("data-site-header-secondary");
    expect(html).toContain('href="/pages/home"');
    expect(html).toContain("Home");
    expect(html).toContain('href="/pages/blog"');
    expect(html).toContain("Blog");
    expect(html).toContain('href="/pages/projects"');
    expect(html).toContain("Projects");
    expect(html).toContain('href="/pages/resume"');
    expect(html).toContain("Resume");
    expect(html).toContain("data-site-theme-toggle");
    expect(html).toContain('data-site-theme-icon="light"');
    expect(html).toContain('aria-label="Switch to dark mode"');
    expect(html).toContain('data-site-theme="light"');
    expect(html).not.toMatch(/href="\/pages\/home"[^>]*>Formless<\/a>/);
    expect(html).not.toContain("border-b border-zinc-200 bg-white");
    expect(html).toContain("Schema-backed software for content-heavy products");
    expect(html).toContain(
      "I design and build schema-backed software for teams that need their tools to keep up with the work.",
    );
  });

  it("marks active header navigation from the current public route", () => {
    const homeHtml = renderSitePage("home");
    const blogHtml = renderSitePage("blog");
    const postHtml = renderSitePage("blog/shipping-schema-backed-authoring");
    const projectsHtml = renderSitePage("projects");

    expect(linkHtml(homeHtml, "/pages/home")).toContain('data-site-nav-active="true"');
    expect(linkHtml(homeHtml, "/pages/home")).toContain("text-[color:var(--site-link)]");
    expect(linkHtml(homeHtml, "/pages/home")).not.toContain("decoration-dashed");
    expect(linkHtml(homeHtml, "/pages/blog")).not.toContain('data-site-nav-active="true"');
    expect(linkHtml(blogHtml, "/pages/blog")).toContain('data-site-nav-active="true"');
    expect(linkHtml(postHtml, "/pages/blog")).toContain('data-site-nav-active="true"');
    expect(linkHtml(projectsHtml, "/pages/projects")).toContain('data-site-nav-active="true"');
    expect(linkHtml(projectsHtml, "/pages/home")).not.toContain('data-site-nav-active="true"');
  });

  it("renders explicit internal link targets through preview and published link modes", () => {
    const records = testSiteSeedRecords.map((record) => {
      if (record.id === "rec_site_content_blog") {
        return {
          ...record,
          values: {
            ...record.values,
            href: "/writing",
          },
        };
      }

      if (record.id === "rec_site_content_link_blog") {
        return {
          ...record,
          values: {
            ...record.values,
            linkTargetMode: "internal",
            linkTargetBlock: "rec_site_content_blog",
            href: "/stale-blog",
          },
        };
      }

      return record;
    });

    const previewHtml = renderSitePage("home", records);
    const publishedHtml = renderToStaticMarkup(
      <SitePageRenderer linkMode="published" tree={sitePageTree("home", records)} />,
    );

    expect(previewHtml).toContain('href="/pages/writing"');
    expect(previewHtml).not.toContain('href="/pages/stale-blog"');
    expect(publishedHtml).toContain('href="/writing"');
    expect(publishedHtml).not.toContain('href="/stale-blog"');
  });

  it("does not render anchors for invalid explicit external links", () => {
    const records = testSiteSeedRecords.map((record) => {
      if (record.id !== "rec_site_content_link_github") {
        return record;
      }

      return {
        ...record,
        values: {
          ...record.values,
          linkTargetMode: "external",
          href: "/not-external",
        },
      };
    });
    const html = renderSitePage("home", records);

    expect(html).not.toContain('href="/pages/not-external"');
    expect(html).not.toContain('aria-label="GitHub"');
  });

  it("renders mobile header overflow without duplicating the first seeded nav item", () => {
    const html = renderSitePage("home");
    const primaryStart = html.indexOf("data-site-header-mobile-primary");
    const menuStart = html.indexOf("data-site-header-mobile-menu");
    const menuEnd = html.indexOf("</details>", menuStart);

    expect(primaryStart).toBeGreaterThan(-1);
    expect(menuStart).toBeGreaterThan(-1);
    expect(menuEnd).toBeGreaterThan(menuStart);

    const primaryHtml = html.slice(primaryStart, menuStart);
    const menuHtml = html.slice(menuStart, menuEnd);

    expect(primaryHtml).toContain(">Home</a>");
    expect(menuHtml).toContain('aria-label="Header menu"');
    expect(menuHtml).not.toContain(">Home</a>");
    expect(menuHtml).toContain(">Blog</a>");
    expect(menuHtml).toContain(">Projects</a>");
    expect(menuHtml).toContain(">Resume</a>");
  });

  it("does not render a mobile header menu when only one seeded nav item exists", () => {
    const tree = sitePageTree("home");
    const header = tree.frame.header;

    if (!header) {
      throw new Error("Missing site header.");
    }

    const html = renderToStaticMarkup(
      <SitePageRenderer
        tree={{
          ...tree,
          frame: {
            ...tree.frame,
            header: {
              ...header,
              placements: header.placements.slice(0, 1),
            },
          },
        }}
      />,
    );

    expect(html).toContain("data-site-header-mobile-primary");
    expect(html).not.toContain("data-site-header-mobile-menu");
  });

  it("renders published Site links at top-level paths", () => {
    const html = renderToStaticMarkup(
      <SitePageRenderer linkMode="published" tree={sitePageTree("home")} />,
    );

    expect(html).toContain('href="/"');
    expect(html).toContain('href="/blog"');
    expect(html).toContain('href="/projects"');
    expect(html).toContain('href="/resume"');
    expect(html).toContain('href="/projects/pricinglab"');
    expect(html).not.toContain('href="/pages/home"');
    expect(html).not.toContain('href="/pages/blog"');
  });

  it("renders installed Site links under the selected public route", () => {
    const html = renderToStaticMarkup(
      <SitePageRenderer
        linkMode="installed"
        routeBase="/sites/personal"
        tree={sitePageTree("home")}
      />,
    );

    expect(html).toContain('href="/sites/personal"');
    expect(html).toContain('href="/sites/personal/blog"');
    expect(html).toContain('href="/sites/personal/projects"');
    expect(html).toContain('href="/sites/personal/resume"');
    expect(html).toContain('href="/sites/personal/projects/pricinglab"');
    expect(html).not.toContain('href="/pages/home"');
    expect(html).not.toContain('href="/pages/blog"');
  });

  it("renders the same published app shell markup from SSR and hydrated route state", () => {
    const tree = sitePageTree("home");
    const ReadySitePageRoute = ({
      linkMode = "preview",
    }: {
      linkMode?: "preview" | "authoring" | "published" | "installed";
      slug: string;
    }) => <SitePageRouteView linkMode={linkMode} state={{ status: "ready", tree }} />;
    const ssrHtml = renderToString(
      <main className="min-h-dvh">
        <SitePageRenderer linkMode="published" tree={tree} />
      </main>,
    );
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

  it("renders seeded post and project summaries from groups", () => {
    const html = renderSitePage("home");

    expect(html).toContain("Recent posts");
    expect(html).toContain("Shipping schema-backed authoring");
    expect(html).toContain("Draft notes on generated editorial tools");
    expect(html).toContain("Featured projects");
    expect(html).toContain("PricingLab");
    expect(html).toContain("OpenSurf");
    expect(html).toContain("Formless makes app schema describe enough behavior");
  });

  it("does not render page root label or body copy on regular page routes", () => {
    const html = renderSitePage("blog");
    const main = mainHtml(html);

    expect(html).toContain("Blog");
    expect(main).not.toContain("Blog");
    expect(main).not.toContain("Notes on product engineering");
    expect(html).not.toContain('href="/pages/blog/generated-editorial-tools"');
    expect(html).not.toContain('href="/pages/blog/shipping-schema-backed-authoring"');
  });

  it("renders post and project list blocks from public tree query items", () => {
    const records = recordsWithContentListBlocks(
      testSiteSeedRecords.filter(
        (record) =>
          ![
            "rec_site_place_projects_pricinglab",
            "rec_site_place_projects_opensurf",
            "rec_site_place_projects_formless",
          ].includes(record.id),
      ),
    );

    const blogHtml = renderSitePage("blog", records);
    const projectsHtml = renderSitePage("projects", records);
    const postCardHtml = articleHtml(blogHtml, "Shipping schema-backed authoring");
    const projectCardHtml = articleHtml(projectsHtml, "OpenSurf");

    expect(blogHtml).toContain('data-site-content-list="postList"');
    expect(blogHtml).toContain("Latest posts");
    expect(blogHtml).toContain("Shipping schema-backed authoring");
    expect(blogHtml).toContain('href="/pages/blog/shipping-schema-backed-authoring"');
    expect(postCardHtml).toContain('data-site-summary-link="post"');
    expect(postCardHtml).toContain("absolute inset-0");
    expect(blogHtml).toContain("Draft notes on generated editorial tools");
    expect(blogHtml).toContain("2026-05-13");
    expect(blogHtml).toContain("2026-05-06");

    expect(projectsHtml).toContain('data-site-content-list="projectList"');
    expect(projectsHtml).toContain("Project index");
    expect(projectsHtml).toContain("OpenSurf");
    expect(projectsHtml).toContain('href="/pages/projects/opensurf"');
    expect(projectsHtml).toContain("Formless");
    expect(projectsHtml).toContain("PricingLab");
    expect(projectCardHtml).toContain('data-site-summary-link="project"');
    expect(projectCardHtml).toContain("absolute inset-0");
    expect(projectsHtml.indexOf("OpenSurf")).toBeLessThan(projectsHtml.indexOf("Formless"));
    expect(projectsHtml.indexOf("Formless")).toBeLessThan(projectsHtml.indexOf("PricingLab"));
    expect(projectsHtml).not.toContain("2026-05-08");
    expect(projectsHtml).not.toContain("2026-05-03");
    expect(projectsHtml).not.toContain("2026-05-01");
  });

  it("renders first slotted primary images in post and project list cards", () => {
    const records = recordsWithPrimaryImages(
      recordsWithContentListBlocks(
        testSiteSeedRecords.filter(
          (record) =>
            ![
              "rec_site_place_projects_pricinglab",
              "rec_site_place_projects_opensurf",
              "rec_site_place_projects_formless",
            ].includes(record.id),
        ),
      ),
    );
    const blogHtml = renderSitePage("blog", records);
    const projectsHtml = renderSitePage("projects", records);

    expect(blogHtml).toContain('data-site-primary-image="summary"');
    expect(blogHtml).toContain("/api/formless/media/media/images/post-primary-first.webp");
    expect(blogHtml).toContain("Shipping primary first");
    expect(blogHtml).not.toContain("/api/formless/media/media/images/post-primary-second.png");
    expect(projectsHtml).toContain('data-site-primary-image="summary"');
    expect(projectsHtml).toContain("/api/formless/media/media/images/project-primary.webp");
    expect(projectsHtml).toContain("OpenSurf primary");
    expect(projectsHtml).toContain('href="/pages/projects/opensurf"');
  });

  it("renders /projects as manually placed project summaries with markdown bodies", () => {
    const html = renderSitePage("projects");
    const main = mainHtml(html);

    expect(main).not.toContain("Projects");
    expect(main).not.toContain("Current and recent product work");
    expect(html).toContain("PricingLab");
    expect(html).toContain("OpenSurf");
    expect(html).toContain("Formless");
    expect(html).toContain('href="/pages/projects/pricinglab"');
    expect(html).toContain('href="/pages/projects/opensurf"');
    expect(html).toContain('href="/pages/projects/formless"');
    expect(main).not.toContain("2026-05-08");
    expect(main).not.toContain("2026-05-03");
    expect(main).not.toContain("2026-05-01");
    expect(html).toContain('data-web-markdown-renderer="shared"');
    expect(html).toContain("operational assumptions");
    expect(html).toContain("<strong");
    expect(html).toContain('href="https://pricinglab.com/"');
    expect(html).toContain(">pricing structures<");
    expect(html).not.toContain("**operational assumptions**");
    expect(html).not.toContain("[pricing structures](https://pricinglab.com)");
  });

  it("renders post detail routes through the Site frame", () => {
    const records = testSiteSeedRecords.map((record) => {
      if (record.id !== "rec_site_content_post_shipped_schema") {
        return record;
      }

      return {
        ...record,
        values: {
          ...record.values,
          body: "Summary-only copy for list cards.",
        },
      };
    });
    const html = renderSitePage("blog/shipping-schema-backed-authoring", records);

    expect(html).toContain("Home");
    expect(html).toContain("Shipping schema-backed authoring");
    expect(html).not.toContain("Summary-only copy for list cards.");
    expect(html).toContain(
      "The first useful content app should keep records flat and move composition into relationships and views.",
    );
    expect(html).toContain(
      "I design and build schema-backed software for teams that need their tools to keep up with the work.",
    );
    expect(html).toContain("GitHub");
  });

  it("renders post detail primary images once in the header", () => {
    const records = recordsWithPrimaryImages(testSiteSeedRecords);
    const html = renderSitePage("blog/shipping-schema-backed-authoring", records);

    expect(html).toContain('data-site-primary-image="post-detail"');
    expect(html).toContain("/api/formless/media/media/images/post-primary-first.webp");
    expect(html).toContain("Shipping primary first");
    expect(
      countOccurrences(html, 'src="/api/formless/media/media/images/post-primary-first.webp"'),
    ).toBe(1);
    expect(html).not.toContain("/api/formless/media/media/images/post-primary-second.png");
    expect(html).toContain(
      "The first useful content app should keep records flat and move composition into relationships and views.",
    );
  });

  it("renders feature blocks with slotted media, markdown copy, and action links", () => {
    const records: StoredRecord[] = [
      ...testSiteSeedRecords,
      siteBlockRecord("rec_site_block_feature_right", {
        type: "feature",
        label: "Ship composable blocks",
        body: "Use **slotted media** with [clear CTAs](https://example.com/feature).",
        alignment: "right",
      }),
      siteBlockRecord("rec_site_media_feature_right", {
        type: "image",
        label: "Feature media right",
        mediaAssetId: "feature-right.webp",
        width: 1200,
        height: 800,
      }),
      siteBlockRecord("rec_site_action_feature_docs", {
        type: "link",
        label: "Read the guide",
        linkTargetMode: "external",
        href: "https://example.com/guide",
      }),
      siteBlockRecord("rec_site_block_feature_default", {
        type: "markdown",
        label: "Follow-up",
        body: "Default child copy.",
      }),
      siteBlockRecord("rec_site_block_feature_ignored", {
        type: "markdown",
        label: "Ignored slot",
        body: "Ignored slot copy.",
      }),
      siteBlockRecord("rec_site_block_feature_left", {
        type: "feature",
        label: "Media first feature",
        body: "Left media body.",
        alignment: "left",
      }),
      siteBlockRecord("rec_site_media_feature_left", {
        type: "image",
        label: "Feature media left",
        mediaAssetId: "feature-left.webp",
        width: 1000,
        height: 750,
      }),
      blockPlacementRecord(
        "rec_site_place_home_feature_right",
        "rec_site_content_home",
        "rec_site_block_feature_right",
        1600,
      ),
      blockPlacementRecord(
        "rec_site_place_feature_right_media",
        "rec_site_block_feature_right",
        "rec_site_media_feature_right",
        100,
        { slot: "media" },
      ),
      blockPlacementRecord(
        "rec_site_place_feature_right_action",
        "rec_site_block_feature_right",
        "rec_site_action_feature_docs",
        200,
        { slot: "actions" },
      ),
      blockPlacementRecord(
        "rec_site_place_feature_right_default",
        "rec_site_block_feature_right",
        "rec_site_block_feature_default",
        300,
      ),
      blockPlacementRecord(
        "rec_site_place_feature_right_ignored",
        "rec_site_block_feature_right",
        "rec_site_block_feature_ignored",
        400,
        { slot: "aside" },
      ),
      blockPlacementRecord(
        "rec_site_place_home_feature_left",
        "rec_site_content_home",
        "rec_site_block_feature_left",
        1700,
      ),
      blockPlacementRecord(
        "rec_site_place_feature_left_media",
        "rec_site_block_feature_left",
        "rec_site_media_feature_left",
        100,
        { slot: "media" },
      ),
    ];
    const html = renderSitePage("home", records);
    const actionHtml = linkHtml(html, "https://example.com/guide");

    expect(html).toContain('data-block-type="feature"');
    expect(html).toContain('data-site-feature-alignment="right"');
    expect(html).toContain('data-site-feature-alignment="left"');
    expect(html).toContain("md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]");
    expect(html).toContain("md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]");
    expect(html).toContain("data-site-feature-media");
    expect(html).toContain("data-site-feature-actions");
    expect(html).toContain("Ship composable blocks");
    expect(html).toContain('href="https://example.com/feature"');
    expect(html).toContain("<strong");
    expect(html).not.toContain("**slotted media**");
    expect(actionHtml).toContain("Read the guide");
    expect(actionHtml).toContain("underline");
    expect(html).toContain("/api/formless/media/media/images/feature-right.webp");
    expect(html).toContain("/api/formless/media/media/images/feature-left.webp");
    expect(html.indexOf("Ship composable blocks")).toBeLessThan(
      html.indexOf('src="/api/formless/media/media/images/feature-right.webp"'),
    );
    expect(html.indexOf('src="/api/formless/media/media/images/feature-left.webp"')).toBeLessThan(
      html.indexOf("Media first feature"),
    );
    expect(html).toContain("Default child copy.");
    expect(html).not.toContain("Ignored slot copy.");
  });

  it("renders generic section, card grid, and metric grid blocks", () => {
    const records: StoredRecord[] = [
      ...testSiteSeedRecords,
      siteBlockRecord("rec_site_block_section", {
        type: "section",
        label: "Capabilities",
        body: "Reusable **page sections** with nested content.",
      }),
      siteBlockRecord("rec_site_block_card_grid", {
        type: "cardGrid",
        label: "What I do",
        body: "A compact grid for related ideas.",
      }),
      siteBlockRecord("rec_site_block_card_product", {
        type: "card",
        label: "Product engineering",
        body: "Shape and ship useful systems.",
        icon: '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>',
        color: "#0f766e",
      }),
      siteBlockRecord("rec_site_block_metric_grid", {
        type: "metricGrid",
        label: "Proof points",
        body: "A short strip of numbers.",
      }),
      siteBlockRecord("rec_site_block_metric_years", {
        type: "metric",
        label: "15+",
        body: "Years building software.",
        color: "#b45309",
      }),
      blockPlacementRecord(
        "rec_site_place_home_section",
        "rec_site_content_home",
        "rec_site_block_section",
        1600,
      ),
      blockPlacementRecord(
        "rec_site_place_section_card_grid",
        "rec_site_block_section",
        "rec_site_block_card_grid",
        100,
      ),
      blockPlacementRecord(
        "rec_site_place_card_grid_product",
        "rec_site_block_card_grid",
        "rec_site_block_card_product",
        100,
      ),
      blockPlacementRecord(
        "rec_site_place_section_metric_grid",
        "rec_site_block_section",
        "rec_site_block_metric_grid",
        200,
      ),
      blockPlacementRecord(
        "rec_site_place_metric_grid_years",
        "rec_site_block_metric_grid",
        "rec_site_block_metric_years",
        100,
      ),
    ];
    const html = renderSitePage("home", records);

    expect(html).toContain('data-block-type="section"');
    expect(html).toContain("Capabilities");
    expect(html).toContain("<strong");
    expect(html).not.toContain("**page sections**");
    expect(html).toContain('data-site-card-grid="true"');
    expect(html).toContain('data-site-card="true"');
    expect(html).toContain("Product engineering");
    expect(html).toContain("Shape and ship useful systems.");
    expect(html).toContain('data-site-card-icon="true"');
    expect(html).toContain('data-web-svg-icon="svg"');
    expect(html).toContain("--site-block-accent:#0f766e");
    expect(html).toContain('data-site-metric-grid="true"');
    expect(html).toContain('data-site-metric="true"');
    expect(html).toContain("15+");
    expect(html).toContain("Years building software.");
    expect(html).toContain("--site-block-accent:#b45309");
  });

  it("renders public markdown block bodies with the shared markdown renderer", () => {
    const records: StoredRecord[] = [
      ...testSiteSeedRecords,
      {
        id: "rec_site_content_home_markdown",
        entity: "block",
        values: {
          type: "markdown",
          label: "Intro markdown",
          body: "I co-founded [pricinglab.example](https://pricinglab.example) and **OpenSurf**.",
        },
        createdAt: "2026-05-05T00:00:32.000Z",
        updatedAt: "2026-05-05T00:00:32.000Z",
      },
      {
        id: "rec_site_place_home_markdown",
        entity: "block-placement",
        values: {
          parent: "rec_site_content_home",
          block: "rec_site_content_home_markdown",
          order: 1500,
        },
        createdAt: "2026-05-05T00:00:33.000Z",
        updatedAt: "2026-05-05T00:00:33.000Z",
      },
    ];
    const html = renderSitePage("home", records);

    expect(html).toContain('data-web-markdown-renderer="shared"');
    expect(html).toContain('href="https://pricinglab.example/"');
    expect(html).toContain(">pricinglab.example<");
    expect(html).toContain("<strong");
    expect(html).not.toContain("[pricinglab.example](https://pricinglab.example)");
    expect(html).not.toContain("**OpenSurf**");
  });

  it("renders public markdown JSON fences with syntax highlighting", () => {
    const records: StoredRecord[] = [
      ...testSiteSeedRecords,
      {
        id: "rec_site_content_home_json_markdown",
        entity: "block",
        values: {
          type: "markdown",
          label: "JSON markdown",
          body: ["```json", "{", '  "name": "Formless",', '  "enabled": true', "}", "```"].join(
            "\n",
          ),
        },
        createdAt: "2026-05-05T00:00:34.000Z",
        updatedAt: "2026-05-05T00:00:34.000Z",
      },
      {
        id: "rec_site_place_home_json_markdown",
        entity: "block-placement",
        values: {
          parent: "rec_site_content_home",
          block: "rec_site_content_home_json_markdown",
          order: 1501,
        },
        createdAt: "2026-05-05T00:00:35.000Z",
        updatedAt: "2026-05-05T00:00:35.000Z",
      },
    ];
    const html = renderSitePage("home", records);

    expect(html).toContain('data-web-markdown-renderer="shared"');
    expect(html).toContain("graph-markdown-code-block");
    expect(html).toContain('data-code-block="true"');
    expect(html).toContain('data-highlight-language="json"');
    expect(html).toContain('data-language="json"');
    expect(html).toContain("hljs-attr");
    expect(html).toContain("hljs-string");
    expect(html).toContain("hljs-literal");
    expect(html).toContain("Formless");
  });

  it("renders missing-image placeholders and core-backed image references", () => {
    const tree = sitePageTree("home");
    const html = renderToStaticMarkup(
      <SitePageRenderer
        tree={{
          ...tree,
          page: {
            ...tree.page,
            placements: [
              {
                id: "test-image-placement",
                order: 1,
                block: {
                  id: "rec_site_media_avatar",
                  type: "image",
                  label: "Site owner portrait",
                  href: "data:image/png;base64,Y292ZXI=",
                  width: 1200,
                  height: 1200,
                  placements: [],
                },
              },
              {
                id: "test-external-image-placement",
                order: 2,
                block: {
                  id: "rec_site_media_external",
                  type: "image",
                  label: "External reference",
                  href: "https://example.com/manual.png",
                  placements: [],
                },
              },
              {
                id: "test-media-asset-image-placement",
                order: 3,
                block: {
                  id: "rec_site_media_asset",
                  type: "image",
                  label: "Media asset reference",
                  href: "https://cdn.example.com/stale-asset-backed.webp",
                  media: {
                    assetId: "asset-backed.webp",
                    href: "/api/formless/media/media/images/asset-backed.webp",
                    kind: "image",
                  },
                  placements: [],
                },
              },
            ],
          },
        }}
      />,
    );

    expect(html).toContain("Site owner portrait");
    expect(html).toContain('aria-label="Site owner portrait"');
    expect(html).not.toContain('src="data:image/png;base64,Y292ZXI="');
    expect(html).toContain('aria-label="External reference"');
    expect(html).not.toContain('src="https://example.com/manual.png"');
    expect(html).toContain('alt="Media asset reference"');
    expect(html).toContain('src="/api/formless/media/media/images/asset-backed.webp"');
    expect(html).not.toContain('src="https://cdn.example.com/stale-asset-backed.webp"');
    expect(html).not.toContain("data-asset-key");
  });

  it("renders nested footer sections and external footer links", () => {
    const records: StoredRecord[] = testSiteSeedRecords.map((record) =>
      record.id === "rec_site_content_group_footer"
        ? {
            ...record,
            values: {
              ...record.values,
              body: "Internal footer body should stay private.",
            },
          }
        : record,
    );
    records.push(
      {
        id: "rec_site_content_footer_copyright",
        entity: "block",
        values: {
          type: "group",
          label: "Copyright 2026 David Peek. All rights reserved.",
        },
        createdAt: "2026-05-05T00:00:32.000Z",
        updatedAt: "2026-05-05T00:00:32.000Z",
      },
      {
        id: "rec_site_place_footer_copyright",
        entity: "block-placement",
        values: {
          parent: "rec_site_content_group_footer",
          block: "rec_site_content_footer_copyright",
          order: 3000,
        },
        createdAt: "2026-05-05T00:00:33.000Z",
        updatedAt: "2026-05-05T00:00:33.000Z",
      },
    );
    const html = renderSitePage("home", records);
    const footerStart = html.indexOf("<footer");
    const footerEnd = html.indexOf("</footer>", footerStart);

    expect(footerStart).toBeGreaterThan(-1);
    expect(footerEnd).toBeGreaterThan(footerStart);

    const footerHtml = html.slice(footerStart, footerEnd);
    const githubLinkHtml = footerLinkHtml(footerHtml, "https://github.com/dpeek");
    const linkedInLinkHtml = footerLinkHtml(footerHtml, "https://linkedin.com/in/dpeekdotcom");

    expect(html).toContain("flex min-h-dvh flex-col");
    expect(html).toContain("mx-auto flex w-full max-w-5xl flex-1 flex-col");
    expect(html).toContain("Explore");
    expect(html).toContain("Social");
    expect(footerHtml).toContain("Copyright 2026 David Peek. All rights reserved.");
    expect(footerHtml).toContain("text-sm text-zinc-700 dark:text-zinc-300");
    expect(html).toContain('href="https://github.com/dpeek"');
    expect(githubLinkHtml).toContain('aria-label="GitHub"');
    expect(githubLinkHtml).toContain('data-web-svg-icon="svg"');
    expect(githubLinkHtml).toContain("size-8");
    expect(githubLinkHtml).toContain('target="_blank"');
    expect(githubLinkHtml).toContain('rel="noreferrer"');
    expect(githubLinkHtml).not.toContain(">GitHub<");
    expect(html).toContain('href="https://linkedin.com/in/dpeekdotcom"');
    expect(linkedInLinkHtml).toContain('aria-label="LinkedIn"');
    expect(linkedInLinkHtml).toContain('data-web-svg-icon="svg"');
    expect(linkedInLinkHtml).toContain("size-8");
    expect(linkedInLinkHtml).toContain('target="_blank"');
    expect(linkedInLinkHtml).toContain('rel="noreferrer"');
    expect(linkedInLinkHtml).not.toContain(">LinkedIn<");
    expect(footerHtml).not.toContain("&lt;svg");
  });

  it("renders inherited target icons for internal footer links", () => {
    const projectIcon = '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>';
    const records = testSiteSeedRecords.map((record) =>
      record.id === "rec_site_content_projects"
        ? {
            ...record,
            values: {
              ...record.values,
              icon: projectIcon,
            },
          }
        : record.id === "rec_site_content_link_projects"
          ? {
              ...record,
              values: {
                ...record.values,
                linkTargetMode: "internal",
                linkTargetBlock: "rec_site_content_projects",
              },
            }
          : record,
    );
    const html = renderSitePage("home", records);
    const footerStart = html.indexOf("<footer");
    const footerEnd = html.indexOf("</footer>", footerStart);
    const footerHtml = html.slice(footerStart, footerEnd);
    const projectsLinkHtml = footerLinkHtml(footerHtml, "/pages/projects");

    expect(projectsLinkHtml).toContain('data-web-svg-icon="svg"');
    expect(projectsLinkHtml).toContain("gap-2.5");
    expect(projectsLinkHtml).toContain(">Projects<");
  });

  it("omits inherited target icons from header navigation links", () => {
    const projectIcon = '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>';
    const records = testSiteSeedRecords.map((record) =>
      record.id === "rec_site_content_projects"
        ? {
            ...record,
            values: {
              ...record.values,
              icon: projectIcon,
            },
          }
        : record.id === "rec_site_content_link_projects"
          ? {
              ...record,
              values: {
                ...record.values,
                linkTargetMode: "internal",
                linkTargetBlock: "rec_site_content_projects",
              },
            }
          : record,
    );
    const html = renderSitePage("home", records);
    const headerStart = html.indexOf("<header");
    const headerEnd = html.indexOf("</header>", headerStart);
    const headerHtml = html.slice(headerStart, headerEnd);
    const projectsLinkHtml = linkHtml(headerHtml, "/pages/projects");

    expect(projectsLinkHtml).not.toContain('data-web-svg-icon="svg"');
    expect(projectsLinkHtml).toContain(">Projects</a>");
  });

  it("renders a 404 state for missing public site pages", () => {
    const html = renderToStaticMarkup(
      <SitePageRouteView state={{ status: "not-found", slug: "missing" }} />,
    );

    expect(html).toContain("Page not found");
    expect(html).toContain("No site page exists for");
    expect(html).toContain("<code>missing</code>");
    expect(html).toContain('href="/pages/home"');
  });

  it("renders a published 404 state with a top-level Home link", () => {
    const html = renderToStaticMarkup(
      <SitePageRouteView linkMode="published" state={{ status: "not-found", slug: "missing" }} />,
    );

    expect(html).toContain("Page not found");
    expect(html).toContain("<code>missing</code>");
    expect(html).toContain('href="/"');
    expect(html).not.toContain('href="/pages/home"');
  });

  it("renders an installed Site 404 state with an installed public Home link", () => {
    const html = renderToStaticMarkup(
      <SitePageRouteView
        linkMode="installed"
        routeBase="/sites/personal"
        state={{ status: "not-found", slug: "missing" }}
      />,
    );

    expect(html).toContain("Page not found");
    expect(html).toContain("<code>missing</code>");
    expect(html).toContain('href="/sites/personal"');
    expect(html).not.toContain('href="/pages/home"');
  });

  it("does not render unknown block types", () => {
    const tree = sitePageTree("home");
    const unknownBlock = {
      id: "rec_site_block_unknown",
      type: "mystery",
      label: "Unsupported block should be hidden",
      placements: [],
    };

    const html = renderToStaticMarkup(
      <SitePageRenderer
        tree={{
          ...tree,
          page: {
            ...tree.page,
            placements: [
              ...tree.page.placements,
              {
                id: "rec_site_place_unknown",
                order: 99,
                block: unknownBlock,
              },
            ],
          },
        }}
      />,
    );

    expect(html).not.toContain("Unsupported block should be hidden");
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

    expect(html).toContain("<h1");
    expect(html).toContain("Tasks");
    expect(html).toContain("All");
    expect(html).toContain("Active");
    expect(html).toContain("Completed");
    expect(html).toContain("Overdue");
    expect(html).toContain('aria-label="Task operations"');
    expect(html).toContain("Create Task");
    expect(html).toContain("Clear completed");
    expect(html).not.toContain('aria-label="Collection summary"');
  });

  it("renders the source one-section task screen with the existing home layout", () => {
    applyBootstrapResponse(bootstrap([], appSchema));
    const html = renderRoute("/tasks");

    expect(html).toContain("<h1");
    expect(html).toContain("Tasks");
    expect(html).toContain("All");
    expect(html).toContain("Active");
    expect(html).toContain("Completed");
    expect(html).toContain("Overdue");
    expect(html).toContain('aria-label="Task operations"');
    expect(html).toContain("Create Task");
    expect(html).toContain("Clear completed");
    expect(html).not.toContain('aria-label="Screens"');
    expect(html).not.toContain('aria-label="Collections"');
  });

  it("renders primary screen links and hides non-primary screens", () => {
    applyBootstrapResponse(bootstrap([], taskNavigationScreenSchema()));
    const html = renderRoute("/tasks");

    expect(html).toContain('aria-label="Tasks screens"');
    expect(html).not.toContain('aria-label="Collections"');
    expect(html).toContain('href="/tasks"');
    expect(html).toContain('href="/tasks/review"');
    expect(html).toContain("Task home");
    expect(html).toContain("Task review");
    expect(html).not.toContain("Hidden setup");
    expect(html).toContain("Create Task");
  });

  it("renders one-section screens with the same markup as the collection renderer", () => {
    const screen = requiredScreenModel(appSchema, "taskHome");
    const collection = selectPrimaryCollectionModels(appSchema)[0];

    if (!collection) {
      throw new Error("Missing task collection model.");
    }

    applyBootstrapResponse(bootstrap(taskSeedRecords, appSchema));

    expect(renderGeneratedHomeScreen(screen, { today: "2026-05-02" })).toBe(
      renderGeneratedHomeCollection(collection, { today: "2026-05-02" }),
    );
  });

  it("renders generated Site workspace with root sidebar nav and tree layout", () => {
    bootstrapSiteEditor();
    const html = renderRoute("/site");

    expect(html).toContain('class="mx-auto w-full max-w-[112rem]"');
    expect(html).toContain('aria-label="Site screens"');
    expect(html).toContain('href="/site/settings"');
    expect(html).not.toContain('aria-label="Settings"');
    expect(html).not.toContain("Example Site");
    expect(html).not.toContain("A public test site.");
    expect(html).toContain('aria-label="Pages roots"');
    expect(html).toContain('aria-label="Posts roots"');
    expect(html).toContain('aria-label="Projects roots"');
    expect(html).toContain('aria-label="Navigation roots"');
    expect(html).toContain('aria-label="Create Post"');
    expect(html).toContain('aria-label="Create Project"');
    expect(html).not.toContain('aria-label="Create Site"');
    expect(html).not.toContain('data-formless-delete-record="rec_site_settings_primary"');
    expect(html).not.toContain(
      "grid min-w-0 gap-6 md:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)] xl:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]",
    );
    expect(html).toContain("grid min-w-0 gap-3 pt-1");
    expect(html).not.toContain("grid min-w-0 gap-3 pt-1 sm:grid-cols-2 xl:grid-cols-3");
    expect(html).toContain('aria-label="Placement tree"');
    expect(html).toContain('aria-label="Drag placement"');
    expect(html).toContain('data-formless-ordering-handle="true"');
    expect(html).toContain("data-formless-sortable-tree-placement=");
    expect(html).not.toContain("Move placement up");
    expect(html).not.toContain("Move placement down");
  });

  it("renders generated Site settings on a dedicated screen", () => {
    bootstrapSiteEditor();
    const html = renderRoute("/site/settings");

    expect(html).toContain("<h1");
    expect(html).toContain(">Settings</h1>");
    expect(html).toContain('aria-label="Site screens"');
    expect(html).toContain('href="/site"');
    expect(html).toContain('href="/site/settings"');
    expect(html).toContain('aria-label="Label"');
    expect(html).toContain('aria-label="Description"');
    expect(html).toContain('aria-label="Edit Icon"');
    expect(html).toContain('aria-label="Accent color"');
    expect(html).toContain('aria-label="Background color"');
    expect(html).toContain('aria-label="Site record"');
    expect(html).toContain('data-formless-legacy-record-result="site:siteSettingsForm"');
    expect(html).not.toContain('data-slot="table"');
    expect(html).not.toContain('role="grid"');
    expect(html).toContain("Example Site");
    expect(html).toContain("A public test site.");
    expect(html).toContain('value="#C98A2E"');
    expect(html).toContain('value="#09090B"');
    expect(html).not.toContain('aria-label="Pages roots"');
    expect(html).not.toContain('aria-label="Posts roots"');
    expect(html).not.toContain('aria-label="Create Site"');
    expect(html).not.toContain('data-formless-delete-record="rec_site_settings_primary"');
  });

  it("renders generated Site settings fields without create or delete workflows", () => {
    const collection = requiredSiteCollectionModel("siteSettingsHome");

    bootstrapSiteEditor();
    const html = renderGeneratedHomeCollection(collection, { today: "2026-05-02" });

    expect(html).toContain('aria-label="Label"');
    expect(html).toContain('aria-label="Description"');
    expect(html).toContain('aria-label="Edit Icon"');
    expect(html).toContain('data-web-field-kind="icon"');
    expect(html).toContain('aria-label="Accent color"');
    expect(html).toContain('aria-label="Background color"');
    expect(html).toContain('aria-label="Site record"');
    expect(html).toContain('data-formless-legacy-record-result="site:siteSettingsForm"');
    expect(html).toContain("Example Site");
    expect(html).toContain("A public test site.");
    expect(html).toContain('value="#C98A2E"');
    expect(html).toContain('value="#09090B"');
    expect(html).not.toContain(">Key<");
    expect(html).not.toContain('aria-label="Create Site"');
    expect(html).not.toContain('data-formless-delete-record="rec_site_settings_primary"');
  });

  it("sorts generated Site tree siblings by result ordering rank", () => {
    const collection = requiredSiteCollectionModel("siteCompositionHome");

    bootstrapSiteEditor([
      siteBlockRecord("page-1", { type: "page", label: "Tree root" }),
      siteBlockRecord("block-1", { type: "group", label: "Shared child" }),
      sitePlacementRecord("placement-3", "Third", 3000),
      sitePlacementRecord("placement-1", "First", 1000),
      sitePlacementRecord("placement-2", "Second", 2000),
    ]);

    const html = renderGeneratedHomeCollection(collection, {
      selectedContextRecordId: "page-1",
      today: "2026-05-02",
    });

    expect(html.indexOf('data-formless-sortable-tree-placement="placement-1"')).toBeLessThan(
      html.indexOf('data-formless-sortable-tree-placement="placement-2"'),
    );
    expect(html.indexOf('data-formless-sortable-tree-placement="placement-2"')).toBeLessThan(
      html.indexOf('data-formless-sortable-tree-placement="placement-3"'),
    );
    expect(html).toContain('aria-label="Drag placement"');
    expect(html).toContain("data-formless-sortable-tree-placement=");
  });

  it("renders Site link tree nodes with mode-specific target editors", () => {
    const collection = requiredSiteCollectionModel("siteCompositionHome");

    if (!collection.context || collection.result.type !== "tree") {
      throw new Error("Site composition home should render a context tree.");
    }

    bootstrapSiteEditor([
      siteBlockRecord("page-1", { type: "page", label: "Tree root" }),
      siteBlockRecord("page-2", { type: "page", label: "Docs page", href: "/docs" }),
      siteBlockRecord("link-1", {
        type: "link",
        label: "Docs internal",
        linkTargetMode: "internal",
        linkTargetBlock: "page-2",
        href: "/stale-docs",
        icon: "book",
        color: "#336699",
      }),
      siteBlockRecord("link-2", {
        type: "link",
        label: "Docs external",
        linkTargetMode: "external",
        href: "https://example.com/docs",
        icon: "book",
      }),
      {
        id: "placement-1",
        entity: "block-placement",
        values: {
          parent: "page-1",
          block: "link-1",
          label: "Placement label",
          order: 1000,
        },
        createdAt: "2026-05-05T00:00:40.000Z",
        updatedAt: "2026-05-05T00:00:40.000Z",
      },
      {
        id: "placement-2",
        entity: "block-placement",
        values: {
          parent: "page-1",
          block: "link-2",
          label: "External placement label",
          order: 2000,
        },
        createdAt: "2026-05-05T00:00:41.000Z",
        updatedAt: "2026-05-05T00:00:41.000Z",
      },
    ]);
    const html = renderToStaticMarkup(
      <RecordTree
        context={collection.context}
        entity={collection.entity}
        entityName={collection.entityName}
        queryContext={{ today: "2026-05-02", values: { block: "page-1" } }}
        result={collection.result}
      />,
    );

    expect(html).toContain('aria-label="Label"');
    expect(html).toContain('value="Docs internal"');
    expect(html).toContain('value="Docs external"');
    expect(html).toContain('aria-label="Link target"');
    expect(html).toContain('value="internal" selected="">Internal</option>');
    expect(html).toContain('value="external" selected="">External</option>');
    expect(html).toContain('aria-label="Target block"');
    expect(html).toContain('value="page-2" selected="">Docs page</option>');
    expect(html).toContain('aria-label="Link"');
    expect(html).toContain('value="https://example.com/docs"');
    expect(html).not.toContain('value="/stale-docs"');
    expect(html).not.toContain("Placement label");
    expect(html).not.toContain("External placement label");
    expect(html).toContain('data-web-field-kind="icon"');
    expect(html).toContain('data-web-svg-icon="empty"');
    expect(html).toContain('aria-label="Edit Icon"');
    expect(html).toMatch(/data-web-icon-field-edit="trigger"[\s\S]*data-web-svg-icon="empty"/);
    expect(html).not.toContain('aria-label="Choose Color"');
  });

  it("renders Site tree add controls from allowed child policy", () => {
    const collection = requiredSiteCollectionModel("siteCompositionHome");

    if (!collection.context || collection.result.type !== "tree") {
      throw new Error("Site composition home should render a context tree.");
    }

    bootstrapSiteEditor([siteBlockRecord("page-1", { type: "page", label: "Blank page" })]);
    const emptyRootHtml = renderToStaticMarkup(
      <RecordTree
        context={collection.context}
        entity={collection.entity}
        entityName={collection.entityName}
        queryContext={{ today: "2026-05-02", values: { block: "page-1" } }}
        result={collection.result}
      />,
    );

    expect(emptyRootHtml).toContain("No records yet.");
    expect(emptyRootHtml).toContain('data-formless-tree-add-parent="page-1"');
    expect(emptyRootHtml).toContain(
      'data-formless-tree-add-operation="block-placement.addTreeChild"',
    );
    expect(emptyRootHtml).toContain(
      'data-formless-tree-add-variants="group section hero feature cardGrid metricGrid markdown image link project postList projectList subscribeForm contactForm publicOperationForm"',
    );
    expect(emptyRootHtml).toContain('aria-label="Add child"');
    expect(emptyRootHtml).toContain('data-formless-tree-add-trigger="page-1"');
    expect(emptyRootHtml).toContain(
      'data-formless-tree-add-variant-operations="block-placement.addTreeChild block-placement.addTreeChild',
    );

    resetClientStore();
    bootstrapSiteEditor([siteBlockRecord("post-1", { type: "post", label: "Blank post" })]);
    const postRootHtml = renderToStaticMarkup(
      <RecordTree
        context={collection.context}
        entity={collection.entity}
        entityName={collection.entityName}
        queryContext={{ today: "2026-05-02", values: { block: "post-1" } }}
        result={collection.result}
      />,
    );

    expect(postRootHtml).toContain('data-formless-tree-add-parent="post-1"');
    expect(postRootHtml).toContain('data-formless-tree-add-variants="markdown image"');
    expect(postRootHtml).toContain('data-formless-tree-add-labels="Markdown|Primary image"');
    expect(postRootHtml).toContain('data-formless-tree-add-slots="default primaryImage"');

    resetClientStore();
    bootstrapSiteEditor([
      siteBlockRecord("project-1", { type: "project", label: "Blank project" }),
    ]);
    const projectRootHtml = renderToStaticMarkup(
      <RecordTree
        context={collection.context}
        entity={collection.entity}
        entityName={collection.entityName}
        queryContext={{ today: "2026-05-02", values: { block: "project-1" } }}
        result={collection.result}
      />,
    );

    expect(projectRootHtml).toContain('data-formless-tree-add-parent="project-1"');
    expect(projectRootHtml).toContain('data-formless-tree-add-variants="image"');
    expect(projectRootHtml).toContain('data-formless-tree-add-labels="Primary image"');
    expect(projectRootHtml).toContain('data-formless-tree-add-slots="primaryImage"');

    resetClientStore();
    bootstrapSiteEditor([
      siteBlockRecord("feature-1", { type: "feature", label: "Blank feature" }),
    ]);
    const featureRootHtml = renderToStaticMarkup(
      <RecordTree
        context={collection.context}
        entity={collection.entity}
        entityName={collection.entityName}
        queryContext={{ today: "2026-05-02", values: { block: "feature-1" } }}
        result={collection.result}
      />,
    );

    expect(featureRootHtml).toContain('data-formless-tree-add-parent="feature-1"');
    expect(featureRootHtml).toContain('data-formless-tree-add-variants="image link"');
    expect(featureRootHtml).toContain('data-formless-tree-add-labels="Feature image|Action link"');
    expect(featureRootHtml).toContain('data-formless-tree-add-slots="media actions"');

    resetClientStore();
    bootstrapSiteEditor([
      siteBlockRecord("section-1", { type: "section", label: "Blank section" }),
    ]);
    const sectionRootHtml = renderToStaticMarkup(
      <RecordTree
        context={collection.context}
        entity={collection.entity}
        entityName={collection.entityName}
        queryContext={{ today: "2026-05-02", values: { block: "section-1" } }}
        result={collection.result}
      />,
    );

    expect(sectionRootHtml).toContain('data-formless-tree-add-parent="section-1"');
    expect(sectionRootHtml).toContain(
      'data-formless-tree-add-variants="group section hero feature cardGrid metricGrid markdown image link project postList projectList subscribeForm contactForm publicOperationForm"',
    );

    resetClientStore();
    bootstrapSiteEditor([
      siteBlockRecord("card-grid-1", { type: "cardGrid", label: "Blank card grid" }),
    ]);
    const cardGridRootHtml = renderToStaticMarkup(
      <RecordTree
        context={collection.context}
        entity={collection.entity}
        entityName={collection.entityName}
        queryContext={{ today: "2026-05-02", values: { block: "card-grid-1" } }}
        result={collection.result}
      />,
    );

    expect(cardGridRootHtml).toContain('data-formless-tree-add-parent="card-grid-1"');
    expect(cardGridRootHtml).toContain('data-formless-tree-add-variants="card"');
    expect(cardGridRootHtml).toContain('data-formless-tree-add-labels="Card"');

    resetClientStore();
    bootstrapSiteEditor([
      siteBlockRecord("metric-grid-1", { type: "metricGrid", label: "Blank metric grid" }),
    ]);
    const metricGridRootHtml = renderToStaticMarkup(
      <RecordTree
        context={collection.context}
        entity={collection.entity}
        entityName={collection.entityName}
        queryContext={{ today: "2026-05-02", values: { block: "metric-grid-1" } }}
        result={collection.result}
      />,
    );

    expect(metricGridRootHtml).toContain('data-formless-tree-add-parent="metric-grid-1"');
    expect(metricGridRootHtml).toContain('data-formless-tree-add-variants="metric"');
    expect(metricGridRootHtml).toContain('data-formless-tree-add-labels="Metric"');

    resetClientStore();
    bootstrapSiteEditor([
      siteBlockRecord("page-1", { type: "page", label: "Tree root" }),
      siteBlockRecord("group-1", { type: "group", label: "Empty group" }),
      siteBlockRecord("link-1", { type: "link", label: "Docs", href: "/docs" }),
      {
        id: "placement-1",
        entity: "block-placement",
        values: {
          parent: "page-1",
          block: "group-1",
          order: 1000,
        },
        createdAt: "2026-05-05T00:00:40.000Z",
        updatedAt: "2026-05-05T00:00:40.000Z",
      },
      {
        id: "placement-2",
        entity: "block-placement",
        values: {
          parent: "page-1",
          block: "link-1",
          order: 2000,
          slot: "actions",
        },
        createdAt: "2026-05-05T00:00:41.000Z",
        updatedAt: "2026-05-05T00:00:41.000Z",
      },
    ]);
    const nestedHtml = renderToStaticMarkup(
      <RecordTree
        context={collection.context}
        entity={collection.entity}
        entityName={collection.entityName}
        queryContext={{ today: "2026-05-02", values: { block: "page-1" } }}
        result={collection.result}
      />,
    );

    expect(nestedHtml).toContain('data-formless-tree-add-parent="group-1"');
    expect(nestedHtml).toContain(
      'data-formless-tree-add-variants="group section hero feature cardGrid metricGrid markdown image link project postList projectList subscribeForm contactForm publicOperationForm"',
    );
    expect(nestedHtml).not.toContain('data-formless-tree-add-parent="link-1"');
    expect(nestedHtml).toContain('data-formless-tree-placement-slot="actions"');
    expect(nestedHtml).toContain('data-formless-tree-remove-placement="placement-1"');
    expect(nestedHtml).toContain(
      'data-formless-tree-remove-operation="block-placement.removeTreePlacement"',
    );
    expect(nestedHtml).toContain('aria-label="Remove child placement"');
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

    expect(disabledHtml).not.toContain('data-formless-delete-record="page-1"');
    expect(enabledHtml).toContain('data-formless-delete-record="page-1"');
    expect(enabledHtml).toContain('aria-label="Delete Disposable page"');
  });

  it("renders tree placement remove controls without child delete actions", () => {
    const disabledSchema = schemaWithEntityDeletePolicy(siteSourceSchema, "block", false);
    const disabledCollection = requiredCollectionModel(disabledSchema, "siteCompositionHome");
    const enabledCollection = requiredSiteCollectionModel("siteCompositionHome");
    const records = [
      siteBlockRecord("page-1", { type: "page", label: "Tree root" }),
      siteBlockRecord("block-1", { type: "group", label: "Disposable group" }),
      sitePlacementRecord("placement-1", "Placed group", 1000),
    ];

    if (!disabledCollection.context || disabledCollection.result.type !== "tree") {
      throw new Error("Site composition home should render a context tree.");
    }

    if (!enabledCollection.context || enabledCollection.result.type !== "tree") {
      throw new Error("Site composition home should render a context tree.");
    }

    applyBootstrapResponse(bootstrap(records, disabledSchema), "site");
    const disabledHtml = renderToStaticMarkup(
      <RecordTree
        context={disabledCollection.context}
        entity={disabledCollection.entity}
        entityName={disabledCollection.entityName}
        queryContext={{ today: "2026-05-02", values: { block: "page-1" } }}
        result={disabledCollection.result}
      />,
    );

    resetClientStore();
    applyBootstrapResponse(bootstrap(records, siteSourceSchema), "site");
    const enabledHtml = renderToStaticMarkup(
      <RecordTree
        context={enabledCollection.context}
        entity={enabledCollection.entity}
        entityName={enabledCollection.entityName}
        queryContext={{ today: "2026-05-02", values: { block: "page-1" } }}
        result={enabledCollection.result}
      />,
    );

    expect(disabledHtml).toContain('data-formless-tree-remove-placement="placement-1"');
    expect(disabledHtml).toContain(
      'data-formless-tree-remove-operation="block-placement.removeTreePlacement"',
    );
    expect(disabledHtml).not.toContain('data-formless-tree-delete-child="block-1"');
    expect(enabledHtml).toContain('data-formless-tree-remove-placement="placement-1"');
    expect(enabledHtml).toContain(
      'data-formless-tree-remove-operation="block-placement.removeTreePlacement"',
    );
    expect(enabledHtml).not.toContain('data-formless-tree-delete-child="block-1"');
    expect(enabledHtml).toContain('aria-label="Remove child placement"');
    expect(enabledHtml).toContain("absolute right-2 top-2");
    expect(enabledHtml).toContain("lucide-x");
    expect(enabledHtml).not.toContain('aria-label="Delete child block"');
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

    expect(defaultSection).toContain('value="$475.00"');
    expect(defaultSection).not.toContain('value="$900.00"');
    expect(backupSection).toContain('value="$900.00"');
    expect(backupSection).not.toContain('value="$475.00"');
  });

  it("labels generated placement operation rows from the active entity", () => {
    const collection = requiredSiteCollectionModel("pageCompositionHome");

    bootstrapSiteEditor();
    const html = renderGeneratedHomeCollection(collection, {
      selectedContextRecordId: "rec_site_content_home",
      today: "2026-05-05",
    });

    expect(html).toContain('aria-label="Placement operations"');
    expect(html).not.toContain('aria-label="Task operations"');
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

    expect(countOccurrences(html, 'data-formless-legacy-list="task:taskListItem"')).toBe(1);
    expect(html).toContain('aria-label="Task records"');
    expect(html).toContain('role="list"');
    expect(html).toContain('data-formless-list-item="record-1"');
    expect(html).toContain('data-formless-list-item="record-2"');
    expect(html).toContain('data-formless-list-item="record-3"');
    expect(html).toMatch(/aria-label="All count"[^>]*>3</);
    expect(html).toMatch(/aria-label="Active count"[^>]*>2</);
    expect(html).toMatch(/aria-label="Completed count"[^>]*>1</);
    expect(html).toMatch(/aria-label="Overdue count"[^>]*>1</);
  });

  it("renders the selected list through the shared task item view", () => {
    const task = appSchema.entities.task;
    const model = selectPrimaryCollectionModels(appSchema)[0];
    const record: StoredRecord = {
      ...taskRecord("record-1", "First", true, "2026-05-01"),
      values: {
        title: "First",
        done: true,
        dueDate: "2026-05-01",
        priority: "high",
      },
    };

    applyBootstrapResponse(bootstrap([record]));
    const html = renderToStaticMarkup(
      <RecordList
        entity={task}
        entityName="task"
        query={{ kind: "all" }}
        result={model?.result.type === "list" ? model.result : listResult([])}
      />,
    );

    expect(html).toContain('data-formless-legacy-list="task:taskListItem"');
    expect(html).toContain('aria-label="Task records"');
    expect(html).toContain('role="list"');
    expect(html).toContain("First");
    expect(html).toContain('type="text"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
    expect(html).toContain('data-formless-field-presentation-mode="completion"');
    expect(html).toContain('aria-label="Priority: High"');
    expect(html).toContain('data-formless-field-presentation-mode="iconOnly"');
    expect(html).toContain('data-formless-field-presentation-color-token="priority.high"');
    expect(html).toContain('data-web-svg-icon="svg"');
    expect(html).toContain('d="M4 15s1-1 4-1');
    expect(html).toContain("2026-05-01");
    expect(html).toContain('data-slot="date-picker-trigger"');
    expect(html).toContain('data-formless-field-presentation-visibility="valueOrInteraction"');
    expect(html).toContain('role="spinbutton"');
    expect(html).not.toContain('aria-label="Estimate"');
    expect(html).not.toContain(record.createdAt);
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
    expect(html).toContain('data-formless-legacy-list="task:taskListItem"');
    expect(html).toContain('aria-label="Reorder First"');
    expect(html).toContain('aria-label="Reorder Second"');
    expect(html).toContain('aria-label="Reorder Third"');
    expect(html).not.toContain("data-formless-sortable-list-item");
    expect(html).not.toContain('data-formless-ordering-handle="true"');
  });

  it("renders clear-completed target count and keeps the button enabled at zero", () => {
    applyBootstrapResponse(bootstrap([]));
    const html = renderRoute("/tasks");

    expect(html).toMatch(/aria-label="Clear completed target count"[^>]*>0</);
    expect(html).toContain("Clear completed");
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

    expect(html).toContain("Review overdue proposal");
    expect(html).toContain("Plan today&#x27;s delivery");
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
    expect(html).toContain("<h1");
    expect(html).toContain(">Blocks</h1>");
    expect(html).toContain('aria-label="Site screens"');
    expect(html).toContain('href="/site/settings"');
    expect(html).toContain('aria-label="Pages roots"');
    expect(html).toContain('aria-label="Posts roots"');
    expect(html).toContain('aria-label="Projects roots"');
    expect(html).toContain('aria-label="Navigation roots"');
    expect(html).not.toContain('href="/site/navigation"');
    expect(html).not.toContain('href="/site/header"');
    expect(html).not.toContain('href="/site/footer"');
    expect(html).toContain("Navigation");
    expect(html).toContain("Posts");
    expect(html).toContain("Projects");
    expect(html).toContain("Header");
    expect(html).toContain("Footer");
    expect(html).toContain('aria-label="Site roots list detail"');
    expect(html).not.toContain('aria-label="Pages records"');
    expect(html).not.toContain('aria-label="Collections"');
    expect(html).toContain('aria-label="Placement tree"');
    expect(html).not.toContain("Add placement");
    expect(html).not.toContain("Create Block<");
    expect(html).not.toContain('aria-label="Create Site"');
    expect(html).not.toContain('data-formless-delete-record="rec_site_settings_primary"');
    expect(html).toContain('data-web-autosize-text-input="true"');
    expect(html).toContain("h-9 w-full text-2xl font-semibold");
    expect(html).toContain('data-web-markdown-editor="textarea"');
    expect(html).toContain('aria-label="Body"');
    expect(html).not.toContain(">Home</h2>");
    expect(html).toContain("Home");
    expect(html).toContain("Blog");
    expect(html).toContain("Resume");
    expect(html).toContain("Projects");
    expect(html).not.toContain("Example Site");
    expect(html).not.toContain("A concise personal site for current work");
    expect(html).not.toContain("A public test site.");
    expect(html).toContain("Schema-backed software for content-heavy products");
    expect(html).toContain("Site owner portrait");
    expect(html).toMatch(/aria-label="Home Placements count"[^>]*>3</);
  });

  it("renders the site route with root sidebar navigation", () => {
    bootstrapSiteEditor();
    const html = generatedAppFrameHtml(renderRoute("/site"));

    expect(html).toContain("<h1");
    expect(html).toContain(">Blocks</h1>");
    expect(html).toContain('aria-label="Site screens"');
    expect(html).toContain('href="/site/settings"');
    expect(linkHtml(html, "/site/settings")).not.toContain('aria-current="page"');
    expect(html).toContain('aria-label="Pages roots"');
    expect(html).toContain('aria-label="Posts roots"');
    expect(html).toContain('aria-label="Projects roots"');
    expect(html).toContain('aria-label="Navigation roots"');
    expect(html).not.toContain('href="/site/navigation"');
    expect(html).not.toContain('href="/site/header"');
    expect(html).not.toContain('href="/site/footer"');
    expect(html).toContain("Pages");
    expect(html).toContain("Posts");
    expect(html).toContain("Projects");
    expect(html).toContain("Navigation");
    expect(html).toContain('aria-label="Create Page"');
    expect(html).toContain('aria-label="Create Post"');
    expect(html).toContain('aria-label="Create Project"');
    expect(html).toContain('aria-label="Site roots list detail"');
    expect(html).toContain("Home");
    expect(sidebarItemHtml(html, "Home")).toContain('aria-current="page"');
    expect(html).toContain('aria-label="Placement tree"');
    expect(html).not.toContain("Add placement");
    expect(html).not.toContain('aria-label="Create Site"');
    expect(html).not.toContain('data-formless-delete-record="rec_site_settings_primary"');
    expect(html).not.toContain('aria-label="Collections"');
    expect(html).not.toContain(">Site</h1>");
  });

  it("does not route site navigation as a separate top-level screen", () => {
    applyBootstrapResponse(bootstrap(testSiteSeedRecords, siteSourceSchema), "site");

    expect(renderRoute("/site/navigation")).toContain("Not found");
  });

  it("routes site settings as a separate top-level screen", () => {
    applyBootstrapResponse(bootstrap(testSiteSeedRecords, siteSourceSchema), "site");

    expect(renderRoute("/site/settings")).toContain(">Settings</h1>");
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
    expect(after).toContain('aria-label="Pages roots"');
    expect(after).toMatch(/aria-label="Unannounced page Placements count"[^>]*>0</);
  });

  it("surfaces site readiness warnings without disabling generated editors", () => {
    const contentTable = requiredSiteTableModel("blockHome");
    const incompletePost: StoredRecord = {
      id: "rec_incomplete_post",
      entity: "block",
      values: {
        type: "post",
        label: "Post without metadata",
      },
      createdAt: "2026-05-05T00:00:00.000Z",
      updatedAt: "2026-05-05T00:00:00.000Z",
    };

    const html = renderRecordTableHtml({
      entity: contentTable.entity,
      entityName: contentTable.entityName,
      records: [incompletePost],
      result: contentTable.result,
      schema: siteSourceSchema,
      schemaKey: "site",
    });

    expect(html).toContain('aria-label="Readiness warnings"');
    expect(html).toContain("Post block should have a link.");
    expect(html).toContain("Post block should include body content.");
    expect(html).toContain("Post without metadata");
    const bodyTextarea = html.match(/<textarea[^>]*aria-label="Body"[^>]*>/)?.[0] ?? "";

    expect(bodyTextarea).not.toEqual("");
    expect(bodyTextarea).not.toMatch(/\sdisabled(?:=|[\s>])/);
  });

  it("renders the scoped site composition workspace for selected content", () => {
    const compositionModel = requiredSiteCollectionModel("blockCompositionHome");

    bootstrapSiteEditor();
    const html = renderGeneratedHomeCollection(compositionModel, {
      selectedContextRecordId: "rec_site_content_home",
      today: "2026-05-05",
    });

    expect(html).toContain('aria-label="Block records"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain("Home");
    expect(html).toMatch(/aria-label="Home Placements count"[^>]*>3</);
    expect(html).toContain("Add placement");
    expect(html).not.toContain('value="rec_site_content_group_header" selected="">Header</option>');
    expect(html).not.toContain('value="rec_site_content_group_footer" selected="">Footer</option>');
    expect(html).toContain("Schema-backed software for content-heavy products");
    expect(html).toContain(
      'value="rec_site_block_home_recent_posts" selected="">Recent posts</option>',
    );
  });

  it("renders header navigation as content block placements", () => {
    const blocksModel = requiredSiteCollectionModel("blockCompositionHome");

    bootstrapSiteEditor();
    const html = renderGeneratedHomeCollection(blocksModel, {
      selectedContextRecordId: "rec_site_content_group_header",
      today: "2026-05-05",
    });

    expect(html).toContain('aria-label="Block records"');
    expect(html).toContain("Header");
    expect(html).toMatch(/aria-label="Header Placements count"[^>]*>2</);
    expect(html).toContain("Add placement");
    expect(html).not.toContain('value="link"');
    expect(html).toContain(
      'value="rec_site_content_group_header_primary" selected="">Primary</option>',
    );
    expect(html).toContain(
      'value="rec_site_content_group_header_secondary" selected="">Secondary</option>',
    );
  });

  it("renders only primary rate-card collection navigation", () => {
    applyBootstrapResponse(bootstrap(rateCardSeedRecords, rateCardSchema), "tasks");
    const html = renderRoute("/tasks");

    expect(html).not.toContain('aria-label="Collections"');
    expect(html).toContain('aria-label="Tasks screens"');
    expect(html).toContain('href="/tasks/setup"');
    expect(html).toContain("Rates");
    expect(html).toContain("Create Resource");
    expect(html).not.toContain("Regenerate missing rates");
    expect(html).not.toMatch(/<button[^>]*>Create Rate<\/button>/);
  });

  it("routes setup through the app screen path", () => {
    applyBootstrapResponse(bootstrap(rateCardSeedRecords, rateCardSchema), "tasks");
    const html = renderRoute("/tasks/setup");

    expect(html).toContain(">Setup</h1>");
    expect(html).toContain('aria-label="Tasks screens"');
    expect(html).toContain('href="/tasks"');
    expect(html).toContain('href="/tasks/setup"');
    expect(html).toContain(">Rate cards</h2>");
    expect(html).toContain(">Resources</h2>");
    expect(html).toContain("Create Rate card");
    expect(html).toContain("Create Resource");
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

    expect(html).toContain('aria-label="Rate card records"');
    expect(html).toContain("<select");
    expect(html).toContain("Default");
    expect(html).toContain("Backup");
    expect(html).not.toContain('aria-label="Default Rates count"');
    expect(html).not.toContain('aria-label="Backup Rates count"');
    expect(html).toContain('aria-label="Create Rate card"');
    expect(html).toMatch(/<button[^>]*>Create Resource<\/button>/);
    expect(html).not.toContain("Regenerate missing rates");
    expect(html).toContain('data-slot="table"');
    expect(html).toContain("<th");
    expect(html).toContain("Role");
    expect(html).toContain('aria-label="Role"');
    expect(html).toContain('value="Designer"');
    expect(html).not.toContain("Edit shared");
    expect(html).not.toContain('aria-label="Edit shared resource"');
    expect(html.match(/data-web-value-unit-input="true"/g)?.length).toBe(1);
    expect(html).toContain('aria-label="Cost"');
    expect(html).toContain('aria-label="Cost unit"');
    expectFormattedNumberInputLabel(html, "Cost");
    expect(html).not.toContain('aria-label="Price unit"');
    expect(html).not.toContain('aria-label="Currency"');
    expect(html).not.toContain("USD");
    expect(html.match(/\/ day/g)?.length ?? 0).toBe(3);
    expect(html).toContain('value="325"');
    expect(html).toContain('value="$475.00"');
    expect(html).not.toContain('value="$900.00"');
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

    expect(html).toContain('aria-label="Rate card records"');
    expect(html).toContain("Default");
    expect(html).toContain("Backup");
    expect(html).toContain('data-slot="table"');
    expect(html).toContain('value="$475.00"');
    expect(html).not.toContain('value="$900.00"');
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
    const tableIndex = html.indexOf('data-slot="table"');
    const actionRowIndex = html.indexOf('aria-label="Rate operations"');

    expect(tableIndex).toBeGreaterThanOrEqual(0);
    expect(actionRowIndex).toBeGreaterThan(tableIndex);
    expect(html).toMatch(/<button[^>]*>Create Resource<\/button>/);
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

    expect(html).toContain('aria-label="Rate card list detail"');
    expect(html).toContain('aria-label="Rate card records"');
    expect(html).not.toContain('role="tablist"');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('aria-label="Backup detail"');
    expect(html).toMatch(/aria-label="Default Rates count"[^>]*>1</);
    expect(html).toMatch(/aria-label="Backup Rates count"[^>]*>1</);
    expect(html).toContain('aria-label="Create Rate card"');
    expect(html).toContain('aria-label="Minimum margin"');
    expect(html).toContain('aria-label="Medium margin"');
    expect(html).toContain('aria-label="Maximum margin"');
    expect(html).toContain('value="0.4"');
    expect(html).toContain('value="0.5"');
    expect(html).toContain('value="0.6"');
    expect(html).toContain('data-slot="table"');
    expect(html).toContain('value="$900.00"');
    expect(html).not.toContain('value="$475.00"');
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
    expect(defaultHtml).toContain('value="$475.00"');
    expect(defaultHtml).not.toContain('value="$900.00"');
    expect(backupHtml).toContain('aria-label="Backup detail"');
    expect(backupHtml).toContain('value="$900.00"');
    expect(backupHtml).not.toContain('value="$475.00"');
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

    expect(selectedHtml).toContain('role="tablist"');
    expect(selectedHtml).toMatch(/aria-label="Selected card count"[^>]*>1</);
    expect(selectedHtml).toMatch(/aria-label="Selected card again count"[^>]*>1</);
    expect(selectedHtml).toMatch(/<button[^>]*>Create Rate<\/button>/);
    expect(selectedHtml).not.toMatch(/<button[^>]*disabled=""[^>]*>Create Rate<\/button>/);

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
    expect(emptyHtml).toMatch(/<button[^>]*disabled=""[^>]*>Create Rate<\/button>/);
    expect(emptyHtml).not.toContain('data-slot="table"');
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
    expect(html).toContain('aria-label="Cost"');
    expect(html).toContain('value="325"');
    expect(html).toContain('value="450"');
    expect(html).toContain('aria-label="Price"');
    expect(html).toContain('value="$475.00"');
    expect(html).toContain('value="$600.00"');
    expect(html).toContain("Margin");
    expect(html).toContain("31.58%");
    expect(html).toContain("25%");
    expect(html).not.toContain('aria-label="Collection summary"');
    expect(html).toContain('data-slot="table-footer"');
    expect(html).toContain('aria-label="Average cost:');
    expect(html).toContain("$387.50");
    expect(html).toContain('aria-label="Average price:');
    expect(html).toContain("$537.50");
    expect(html).toContain('aria-label="Average margin:');
    expect(html).toContain("28.29%");
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

    expect(html).toContain('aria-label="Collection summary"');
    expect(html).toContain('aria-label="Cost total summary"');
    expect(html).toContain("Cost total");
    expect(html).toContain("$400.00");
    expect(html).toContain("/ day");
    expect(html).toContain('aria-label="Average margin summary"');
    expect(html).toContain("Average margin");
    expect(html).toContain("50%");
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

    expect(html).toContain('aria-label="Collection summary"');
    expect(html).toContain("Cost total");
    expect(html).toContain("$0.00");
    expect(html).toContain("Average margin");
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

  it("updates relationship counts after local record merges", () => {
    const schema = rateCardSchemaWithRelatedContext();
    const rateModel = requiredCollectionModel(schema, "rateHome");

    applyBootstrapResponse(
      bootstrap(
        [cardRecord("card-1", "Default"), resourceRecord("resource-1", "Designer")],
        schema,
      ),
    );
    const before = renderGeneratedHomeCollection(rateModel, {
      selectedContextRecordId: "card-1",
      today: "2026-05-01",
    });

    applyRecordMerge([rateCardRateRecord("rate-1", "resource-1", "card-1", 475)], 2);
    const after = renderGeneratedHomeCollection(rateModel, {
      selectedContextRecordId: "card-1",
      today: "2026-05-01",
    });

    expect(before).toMatch(/aria-label="Default Rates count"[^>]*>0</);
    expect(after).toMatch(/aria-label="Default Rates count"[^>]*>1</);
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
    expect(html).toContain('aria-label="Minimum margin"');
    expect(html).toContain('aria-label="Medium margin"');
    expect(html).toContain('aria-label="Maximum margin"');
    expect(html).toContain('value="0.4"');
    expect(html).toContain('value="0.5"');
    expect(html).toContain('value="0.6"');
  });

  it("does not render context item fields when no context record is selected", () => {
    const rateModel = selectRateHomeModel();

    applyBootstrapResponse(bootstrap([], rateCardSchema));
    const html = renderGeneratedHomeCollection(rateModel, {
      selectedContextRecordId: null,
      today: "2026-05-01",
    });

    expect(html).toContain("No rate card records yet.");
    expect(html).not.toContain('aria-label="Minimum margin"');
    expect(html).not.toContain('aria-label="Medium margin"');
    expect(html).not.toContain('aria-label="Maximum margin"');
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

    expect(html).toContain('data-slot="table"');
    expect(html).toContain('value="750"');
    expect(html).toContain('value="$900.00"');
    expect(html).not.toContain('value="325"');
    expect(html).not.toContain('value="$475.00"');
  });

  it("renders seeded rate-card rows under the selected card", () => {
    const rateModel = selectRateHomeModel();

    applyBootstrapResponse(bootstrap(rateCardSeedRecords, rateCardSchema));
    const html = renderGeneratedHomeCollection(rateModel, {
      selectedContextRecordId: null,
      today: "2026-05-02",
    });

    expect(html).toContain("Default");
    expect(html).toContain("Premium");
    expect(html).toContain('data-slot="table"');
    expect(html).toContain("Designer");
    expect(html).toContain("Developer");
    expect(html).toContain('value="$825.00"');
    expect(html).toContain('value="$975.00"');
    expect(html).not.toContain('value="$990.00"');
    expect(html).not.toContain('value="$1170.00"');
  });

  it("keeps the resource create operation enabled without a selected card", () => {
    const rateModel = selectRateHomeModel();

    applyBootstrapResponse(bootstrap([resourceRecord("resource-1", "Designer")], rateCardSchema));
    const html = renderGeneratedHomeCollection(rateModel, {
      selectedContextRecordId: null,
      today: "2026-05-01",
    });

    expect(html).toContain("No rate card records yet.");
    expect(html).toContain(">Create Resource</button>");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Create Resource<\/button>/);
  });
});

describe("generated forms and records", () => {
  it("renders the task create dialog with type-aware controls", () => {
    const task = appSchema.entities.task;
    const operation = createOperation(task, ["title", "done", "dueDate"]);
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm operation={operation} renderDialogCancel={false} />,
    );

    expect(html).toContain("Create Task");
    expect(html).toContain('name="title"');
    expect(html).toContain('name="done"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('data-slot="label"');
    expect(html).toContain('name="dueDate"');
    expect(html).toContain("Due date");
    expect(html).toContain("Cancel");
  });

  it("renders enum create controls with option labels", () => {
    const task = taskEntityWithKindEnum();
    const operation = createOperation(task, ["kind"]);
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm operation={operation} renderDialogCancel={false} />,
    );

    expect(html).toContain('name="kind"');
    expect(html).toContain("<select");
    expect(html).toContain('data-slot="select"');
    expect(html).toContain("Role");
    expect(html).toContain("Stream");
    expect(html).not.toContain("native-select-option");
  });

  it("renders create fields for the active union discriminator", () => {
    const roleOperation = requiredCreateOperation(generatedDiscriminatedTaskSchema(), "taskHome");
    const streamOperation = requiredCreateOperation(
      generatedDiscriminatedTaskSchema({ defaultKind: "stream" }),
      "taskHome",
    );
    const roleHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm operation={roleOperation} renderDialogCancel={false} />,
    );
    const streamHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm operation={streamOperation} renderDialogCancel={false} />,
    );

    expect(roleHtml).toContain('name="kind"');
    expect(roleHtml).toContain('name="title"');
    expect(roleHtml).not.toContain('name="done"');
    expect(streamHtml).toContain('name="kind"');
    expect(streamHtml).toContain('name="done"');
    expect(streamHtml).not.toContain('name="title"');
  });

  it("renders fixed-discriminator create fields from literal defaults", () => {
    const operation = requiredCreateOperation(
      generatedDiscriminatedTaskSchema({ fixedCreateKind: "stream" }),
      "taskHome",
    );
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm operation={operation} renderDialogCancel={false} />,
    );
    const formData = new FormData();
    formData.set("done", "on");

    expect(html).not.toContain('name="kind"');
    expect(html).toContain('name="done"');
    expect(html).not.toContain('name="title"');
    expect(resolveCreateValues(formData, operation)).toEqual({
      done: true,
      kind: "stream",
    });
  });

  it("renders source site page, post and project root creates with fixed block types", () => {
    const pageOperation = requiredRootNavigationCreateOperation("Pages");
    const postOperation = requiredRootNavigationCreateOperation("Posts");
    const projectOperation = requiredRootNavigationCreateOperation("Projects");
    const pageHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm operation={pageOperation} renderDialogCancel={false} />,
    );
    const postHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm operation={postOperation} renderDialogCancel={false} />,
    );
    const projectHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm operation={projectOperation} renderDialogCancel={false} />,
    );
    const pageFormData = new FormData();
    pageFormData.set("label", "Focused Page");
    pageFormData.set("href", "/focused-page");
    pageFormData.set("icon", "page");
    const postFormData = new FormData();
    postFormData.set("label", "A focused post");
    postFormData.set("href", "/blog/focused-post");
    postFormData.set("date", "2026-05-14");
    postFormData.set("body", "A short **summary**.");
    const projectFormData = new FormData();
    projectFormData.set("label", "Focused Project");
    projectFormData.set("href", "/projects/focused-project");
    projectFormData.set("date", "2026-05-13");
    projectFormData.set("body", "A short **summary**.");

    expect(pageHtml).not.toContain('name="type"');
    expect(pageHtml).toContain('name="label"');
    expect(pageHtml).toContain('name="href"');
    expect(pageHtml).toContain('name="icon"');
    expect(pageHtml).not.toContain('name="date"');
    expect(pageHtml).not.toContain('name="body"');
    expect(postHtml).not.toContain('name="type"');
    expect(postHtml).toContain('name="label"');
    expect(postHtml).toContain('name="href"');
    expect(postHtml).toContain('name="date"');
    expect(postHtml).toContain('name="body"');
    expect(projectHtml).not.toContain('name="type"');
    expect(projectHtml).toContain('name="label"');
    expect(projectHtml).toContain('name="href"');
    expect(projectHtml).toContain('name="date"');
    expect(projectHtml).toContain('name="body"');
    expect(resolveCreateValues(pageFormData, pageOperation)).toEqual({
      label: "Focused Page",
      href: "/focused-page",
      icon: "page",
      type: "page",
    });
    expect(resolveCreateValues(postFormData, postOperation)).toEqual({
      label: "A focused post",
      href: "/blog/focused-post",
      date: "2026-05-14",
      body: "A short **summary**.",
      type: "post",
    });
    expect(resolveCreateValues(projectFormData, projectOperation)).toEqual({
      label: "Focused Project",
      href: "/projects/focused-project",
      date: "2026-05-13",
      body: "A short **summary**.",
      type: "project",
    });
  });

  it("renders source site link creates with mode-specific destination fields", () => {
    const baseOperation = requiredCreateOperation(siteSourceSchema, "blockHome");
    const typeField = siteSourceSchema.entities.block.fields.type;

    if (typeField.type !== "enum") {
      throw new Error("Site block type must be an enum field.");
    }

    const operation = {
      ...baseOperation,
      fields: baseOperation.fields.filter((field) => field.fieldName !== "type"),
      defaults: [
        ...baseOperation.defaults,
        {
          fieldName: "type",
          field: typeField,
          value: { kind: "literal" as const, value: "link" },
        },
      ],
    };
    const internalFormData = new FormData();
    internalFormData.set("label", "Internal docs");
    internalFormData.set("linkTargetMode", "internal");
    internalFormData.set("linkTargetBlock", "rec_site_content_blog");
    internalFormData.set("href", "/stale-docs");
    internalFormData.set("icon", "book");
    const externalFormData = new FormData();
    externalFormData.set("label", "External docs");
    externalFormData.set("linkTargetMode", "external");
    externalFormData.set("linkTargetBlock", "rec_site_content_blog");
    externalFormData.set("href", "https://example.com/docs");
    externalFormData.set("icon", "book");

    bootstrapSiteEditor();
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm operation={operation} renderDialogCancel={false} />,
    );

    expect(html).toContain('name="linkTargetMode"');
    expect(html).toContain('name="href"');
    expect(html).not.toContain('name="linkTargetBlock"');
    expect(resolveCreateValues(internalFormData, operation)).toEqual({
      label: "Internal docs",
      linkTargetMode: "internal",
      linkTargetBlock: "rec_site_content_blog",
      icon: "book",
      type: "link",
    });
    expect(resolveCreateValues(externalFormData, operation)).toEqual({
      label: "External docs",
      linkTargetMode: "external",
      href: "https://example.com/docs",
      icon: "book",
      type: "link",
    });
  });

  it("renders record fields for the active union discriminator", () => {
    const schema = generatedDiscriminatedTaskSchema();
    const model = requiredCollectionModel(schema, "taskHome");
    const task = schema.entities.task;

    if (model.result.type !== "list") {
      throw new Error("Task home should render a list.");
    }

    applyBootstrapResponse(
      bootstrap([discriminatedTaskRecord("record-1", "role", "Role title", true)], schema),
    );
    const roleHtml = renderToStaticMarkup(
      <RecordList entity={task} entityName="task" query={{ kind: "all" }} result={model.result} />,
    );

    resetClientStore();
    applyBootstrapResponse(
      bootstrap([discriminatedTaskRecord("record-1", "stream", "Hidden title", true)], schema),
    );
    const streamHtml = renderToStaticMarkup(
      <RecordList entity={task} entityName="task" query={{ kind: "all" }} result={model.result} />,
    );

    expect(roleHtml).toContain("Role title");
    expect(roleHtml).not.toContain('aria-label="Done"');
    expect(streamHtml).toContain('aria-label="Done"');
    expect(streamHtml).toContain("checked");
    expect(streamHtml).not.toContain("Hidden title");
  });

  it("renders tree child fields for the active union discriminator", () => {
    const schema = generatedDiscriminatedTaskSchema();
    const model = requiredCollectionModel(schema, "taskTreeHome");

    if (!model.collection.context || model.result.type !== "tree") {
      throw new Error("Task tree home should render a context tree.");
    }

    applyBootstrapResponse(
      bootstrap(
        [
          discriminatedTaskRecord("task-parent", "role", "Parent", false),
          discriminatedTaskRecord("task-child", "stream", "Hidden child title", true),
          taskPlacementRecord("placement-1", "task-parent", "task-child"),
        ],
        schema,
      ),
    );
    const html = renderToStaticMarkup(
      <RecordTree
        context={model.collection.context}
        queryContext={{ today: "2026-05-01", values: { task: "task-parent" } }}
        result={model.result}
      />,
    );

    expect(html).toContain('aria-label="Placement tree"');
    expect(html).toContain('aria-label="Done"');
    expect(html).toContain("checked");
    expect(html).not.toContain("Hidden child title");
  });

  it("renders tree child context links for active union context-link presentations", () => {
    const schema = generatedDiscriminatedTaskSchema({ streamItemPresentation: "contextLink" });
    const model = requiredCollectionModel(schema, "taskTreeHome");

    if (!model.collection.context || model.result.type !== "tree") {
      throw new Error("Task tree home should render a context tree.");
    }

    applyBootstrapResponse(
      bootstrap(
        [
          discriminatedTaskRecord("task-parent", "role", "Parent", false),
          discriminatedTaskRecord("task-child", "stream", "Stream child", true),
          taskPlacementRecord("placement-1", "task-parent", "task-child"),
        ],
        schema,
      ),
    );
    const html = renderToStaticMarkup(
      <RecordTree
        context={model.collection.context}
        onSelectContext={() => {}}
        queryContext={{ today: "2026-05-01", values: { task: "task-parent" } }}
        result={model.result}
        selectableContextRecordIds={new Set(["task-parent", "task-child"])}
      />,
    );

    expect(html).toContain("Stream child");
    expect(html).toContain('aria-label="Select Stream child"');
    expect(html).toContain(">Open</button>");
    expect(html).not.toContain('aria-label="Done"');
    expect(html).not.toContain("checked");
  });

  it("treats configured tree child variants as leaf nodes", () => {
    const schema = generatedDiscriminatedTaskSchema({
      streamItemPresentation: "contextLink",
      treeBranchVariants: { stream: "leaf" },
    });
    const model = requiredCollectionModel(schema, "taskTreeHome");

    if (!model.collection.context || model.result.type !== "tree") {
      throw new Error("Task tree home should render a context tree.");
    }

    applyBootstrapResponse(
      bootstrap(
        [
          discriminatedTaskRecord("task-parent", "role", "Parent", false),
          discriminatedTaskRecord("task-child", "stream", "Stream child", true),
          discriminatedTaskRecord("task-grandchild", "role", "Nested role", false),
          taskPlacementRecord("placement-1", "task-parent", "task-child"),
          taskPlacementRecord("placement-2", "task-child", "task-grandchild"),
        ],
        schema,
      ),
    );
    const html = renderToStaticMarkup(
      <RecordTree
        context={model.collection.context}
        onSelectContext={() => {}}
        queryContext={{ today: "2026-05-01", values: { task: "task-parent" } }}
        result={model.result}
        selectableContextRecordIds={new Set(["task-parent", "task-child"])}
      />,
    );

    expect(html).toContain("Stream child");
    expect(html).toContain('aria-label="Select Stream child"');
    expect(html).not.toContain("Nested role");
  });

  it("expands a configured leaf variant when it is the selected tree root", () => {
    const schema = generatedDiscriminatedTaskSchema({
      streamItemPresentation: "contextLink",
      treeBranchVariants: { stream: "leaf" },
    });
    const model = requiredCollectionModel(schema, "taskTreeHome");

    if (!model.collection.context || model.result.type !== "tree") {
      throw new Error("Task tree home should render a context tree.");
    }

    applyBootstrapResponse(
      bootstrap(
        [
          discriminatedTaskRecord("task-parent", "role", "Parent", false),
          discriminatedTaskRecord("task-child", "stream", "Stream child", true),
          discriminatedTaskRecord("task-grandchild", "role", "Nested role", false),
          taskPlacementRecord("placement-1", "task-parent", "task-child"),
          taskPlacementRecord("placement-2", "task-child", "task-grandchild"),
        ],
        schema,
      ),
    );
    const html = renderToStaticMarkup(
      <RecordTree
        context={model.collection.context}
        onSelectContext={() => {}}
        queryContext={{ today: "2026-05-01", values: { task: "task-child" } }}
        result={model.result}
        selectableContextRecordIds={new Set(["task-parent", "task-child"])}
      />,
    );

    expect(html).toContain("Nested role");
  });

  it("disables tree child context links outside the selectable context records", () => {
    const schema = generatedDiscriminatedTaskSchema({ streamItemPresentation: "contextLink" });
    const model = requiredCollectionModel(schema, "taskTreeHome");

    if (!model.collection.context || model.result.type !== "tree") {
      throw new Error("Task tree home should render a context tree.");
    }

    applyBootstrapResponse(
      bootstrap(
        [
          discriminatedTaskRecord("task-parent", "role", "Parent", false),
          discriminatedTaskRecord("task-child", "stream", "Stream child", true),
          taskPlacementRecord("placement-1", "task-parent", "task-child"),
        ],
        schema,
      ),
    );
    const html = renderToStaticMarkup(
      <RecordTree
        context={model.collection.context}
        onSelectContext={() => {}}
        queryContext={{ today: "2026-05-01", values: { task: "task-parent" } }}
        result={model.result}
        selectableContextRecordIds={new Set(["task-parent"])}
      />,
    );

    expect(html).toContain('aria-label="Select Stream child"');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('aria-label="Done"');
  });

  it("renders edit view fields for the active union discriminator", () => {
    const schema = generatedDiscriminatedTaskSchema();
    const editView = requiredEditView(schema, "taskEditHome");
    const streamRecord = discriminatedTaskRecord("record-1", "stream", "Hidden title", true);

    applyBootstrapResponse(bootstrap([streamRecord], schema));
    const html = renderToStaticMarkup(
      <EditViewFields editView={editView} targetRecord={streamRecord} targetRecordId="record-1" />,
    );

    expect(html).toContain('aria-label="Kind"');
    expect(html).toContain('aria-label="Done"');
    expect(html).toContain("checked");
    expect(html).not.toContain("Hidden title");
  });

  it("renders referenced-record dialog fields for the active union discriminator", () => {
    const schema = generatedDiscriminatedTaskSchema();
    const model = requiredCollectionModel(schema, "taskHome");

    if (model.result.type !== "list") {
      throw new Error("Task home should render a list.");
    }

    const task = schema.entities.task;
    const taskPlacement = schema.entities["task-placement"];
    const column: Extract<TableColumnConfig, { type: "field" }> = {
      type: "field",
      key: "field:task",
      fieldName: "task",
      field: taskPlacement.fields.task,
      editor: "reference",
      commit: "immediate",
      label: "Task",
      display: "readOnly",
      format: "plain",
      referenceItem: {
        itemViewName: "taskVariantItem",
        entityName: "task",
        entity: task,
        recordFields: model.result.recordFields,
        recordUnion: model.result.recordUnion,
      },
    };
    const streamRecord = discriminatedTaskRecord("record-1", "stream", "Hidden title", true);
    const referenceItem = column.referenceItem;

    if (!referenceItem) {
      throw new Error("Missing reference item config.");
    }

    applyBootstrapResponse(bootstrap([streamRecord], schema));
    const html = renderToStaticMarkup(
      <ReferencedRecordEditorFields referenceItem={referenceItem} referenceRecordId="record-1" />,
    );

    expect(html).toContain('aria-label="Done"');
    expect(html).toContain("checked");
    expect(html).not.toContain("Hidden title");
  });

  it("renders markdown create controls as source editors with hidden string inputs", () => {
    const task = taskEntityWithMarkdownBody();
    const entityOperation = testCreateOperation("task");
    const createOperationConfig: Extract<HomeOperationConfig, { type: "create" }> = {
      type: "create",
      label: "Create Task",
      entityName: "task",
      entity: task,
      operationName: entityOperation.operationName,
      operation: entityOperation,
      fields: [
        {
          fieldName: "body",
          field: task.fields.body,
          editor: "markdown",
        },
      ],
      defaults: [],
      enabled: entityCreateEnabled(task),
    };
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm operation={createOperationConfig} renderDialogCancel={false} />,
    );

    expect(html).toMatch(inputWithNameAndType("body", "hidden"));
    expect(html).toContain('data-web-markdown-editor="textarea"');
    expect(html).toContain('data-web-markdown-source="textarea"');
    expect(html).toContain('aria-label="Body"');
    expect(html).toContain("Body");
  });

  it("renders markdown inline editors as source editors outside compact contexts", () => {
    const task = taskEntityWithMarkdownBody();
    const recordFields: RecordFieldConfig[] = [
      {
        fieldName: "body",
        field: task.fields.body,
        editor: "markdown",
        commit: "field-commit",
      },
    ];

    applyBootstrapResponse(bootstrap([markdownRecord("## Draft\n\nLong body")]));
    const html = renderToStaticMarkup(
      <RecordList
        entity={task}
        entityName="task"
        query={{ kind: "all" }}
        result={listResult(recordFields)}
      />,
    );

    expect(html).toContain('data-web-markdown-editor="textarea"');
    expect(html).toContain('data-web-markdown-source="textarea"');
    expect(html).toContain('aria-label="Body"');
    expect(html).not.toContain("<h2");
    expect(html).toContain("## Draft");
    expect(html).not.toContain('type="text"');
  });

  it("renders read-only markdown table columns with the shared renderer", () => {
    const task = taskEntityWithMarkdownBody();
    const columns: TableColumnConfig[] = [
      {
        type: "field",
        key: "field:body",
        fieldName: "body",
        field: task.fields.body,
        editor: "markdown",
        commit: "field-commit",
        label: "Body",
        display: "readOnly",
        format: "plain",
      },
    ];

    applyBootstrapResponse(bootstrap([markdownRecord("## Draft\n\nLong body")]));
    const html = renderToStaticMarkup(
      <RecordTable
        entity={task}
        entityName="task"
        query={{ kind: "all" }}
        result={tableResult(columns)}
      />,
    );

    expect(html).toContain('data-web-markdown-renderer="shared"');
    expect(html).toContain("<h2");
    expect(html).toContain("Draft");
    expect(html).not.toContain("<textarea");
  });

  it("renders enum inline editors with labels and raw unknown values", () => {
    const task = taskEntityWithKindEnum();
    const recordFields: RecordFieldConfig[] = [
      {
        fieldName: "kind",
        field: task.fields.kind,
        editor: "enum",
        commit: "immediate",
      },
    ];

    applyBootstrapResponse(bootstrap([enumRecord("unlisted")]));
    const html = renderToStaticMarkup(
      <RecordList
        entity={task}
        entityName="task"
        query={{ kind: "all" }}
        result={listResult(recordFields)}
      />,
    );

    expect(html).toContain("unlisted");
    expect(html).toContain("Role");
    expect(html).toContain("Stream");
  });

  it("renders table cells through the same inline field editors", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );
    const columns = rateModel?.result.type === "table" ? rateModel.result.columns : [];

    applyBootstrapResponse(
      bootstrap(
        [
          resourceRecord("resource-1", "Designer"),
          rateCardRateRecord("rate-1", "resource-1", "card-1", 475),
        ],
        rateCardSchema,
      ),
    );
    const html = renderToStaticMarkup(
      <RecordTable
        entity={rateCardSchema.entities.rate}
        entityName="rate"
        query={{ kind: "all" }}
        result={tableResult(columns)}
      />,
    );

    expect(html).toContain('data-slot="table"');
    expect(html).toContain("Role");
    expect(html).toContain('aria-label="Role"');
    expect(html).toContain('value="Designer"');
    expect(html).not.toContain("Edit shared");
    expect(html).not.toContain('aria-label="Edit shared resource"');
    expect(html.match(/data-web-value-unit-input="true"/g)?.length).toBe(1);
    expect(html).toContain('aria-label="Cost"');
    expect(html).toContain('aria-label="Cost unit"');
    expect(html).not.toContain('aria-label="Price unit"');
    expect(html).not.toContain("USD");
    expect(html.match(/\/ day/g)?.length ?? 0).toBe(1);
    expect(html).toContain('data-web-formatted-number-input="true"');
    expect(html).toContain('value="325"');
    expect(html).toContain('value="$475.00"');
  });

  it("characterizes the current one-off referenced-record edit button", () => {
    const rate = rateCardSchema.entities.rate;
    const resource = rateCardSchema.entities.resource;
    const columns: TableColumnConfig[] = [
      {
        type: "field",
        key: "field:resource",
        fieldName: "resource",
        field: rate.fields.resource,
        editor: "reference",
        commit: "immediate",
        label: "Resource",
        width: "lg",
        display: "readOnly",
        format: "plain",
        referenceItem: {
          itemViewName: "resourceListItem",
          entityName: "resource",
          entity: resource,
          recordFields: [
            {
              fieldName: "name",
              field: resource.fields.name,
              editor: "text",
              commit: "field-commit",
            },
          ],
        },
      },
    ];

    applyBootstrapResponse(
      bootstrap(
        [
          resourceRecord("resource-1", "Designer"),
          rateCardRateRecord("rate-1", "resource-1", "card-1", 475),
        ],
        rateCardSchema,
      ),
    );
    const html = renderToStaticMarkup(
      <RecordTable
        entity={rate}
        entityName="rate"
        query={{ kind: "all" }}
        result={tableResult(columns)}
      />,
    );

    expect(html).toContain("Designer");
    expect(html).toContain("Edit shared");
    expect(html).toContain('aria-label="Edit shared resource"');
  });

  it("renders table operation control columns as a button or dropdown", () => {
    const rate = rateCardSchema.entities.rate;
    const columns: TableColumnConfig[] = [
      {
        type: "operationControl",
        key: "operationControl:inspectRate",
        label: "",
        headerLabel: "Inspect rate",
        controls: [
          {
            type: "static",
            bindingName: "inspectRate",
            label: "Inspect rate",
            variant: "default",
            disabled: false,
          },
        ],
        presentation: "button",
        includeOrdering: false,
        align: "end",
        width: "xs",
        display: "readOnly",
        format: "plain",
      },
      {
        type: "operationControl",
        key: "operationControl:inspectRate,blockedRate",
        label: "Rate operations",
        headerLabel: "Rate operations",
        controls: [
          {
            type: "static",
            bindingName: "inspectRate",
            label: "Inspect rate",
            variant: "default",
            disabled: false,
          },
          {
            type: "static",
            bindingName: "blockedRate",
            label: "Blocked rate",
            variant: "destructive",
            disabled: true,
            disabledReason: "No selected card",
          },
        ],
        presentation: "dropdown",
        includeOrdering: false,
        align: "end",
        width: "xs",
        display: "readOnly",
        format: "plain",
      },
    ];

    applyBootstrapResponse(
      bootstrap([rateCardRateRecord("rate-1", "resource-1", "card-1", 475)], rateCardSchema),
    );
    const html = renderToStaticMarkup(
      <RecordTable
        entity={rate}
        entityName="rate"
        query={{ kind: "all" }}
        result={tableResult(columns)}
      />,
    );

    expect(html).toContain("Inspect rate");
    expect(html).toContain('aria-label="Inspect rate: Operation unavailable."');
    expect(html).toContain("Rate operations");
    expect(html).toContain('aria-label="Rate operations"');
  });

  it("renders Site placement row operation dropdowns", () => {
    const placementTable = requiredSiteTableModel("pageCompositionHome");
    const html = renderRecordTableHtml({
      columns: placementTable.columns,
      entity: placementTable.entity,
      entityName: placementTable.entityName,
      ordering: placementTable.ordering,
      records: testSiteSeedRecords,
      schema: siteSourceSchema,
      schemaKey: "site",
    });

    expect(html).toContain('aria-label="Actions"');
    expect(html).toContain('aria-label="Reorder"');
    expect(html).toContain('data-formless-legacy-table="block-placement:table"');
    expect(html).not.toContain('data-formless-ordering-handle="true"');
    expect(html).not.toContain("data-formless-sortable-row=");
  });

  it("sorts generated table rows by ordering rank before rendering", () => {
    const blockPlacement = siteSourceSchema.entities["block-placement"];
    const orderField = blockPlacement.fields.order;
    const columns: TableColumnConfig[] = [
      {
        type: "field",
        key: "field:label",
        fieldName: "label",
        field: blockPlacement.fields.label,
        editor: "text",
        commit: "field-commit",
        label: "Label",
        display: "readOnly",
        format: "plain",
      },
    ];

    if (orderField.type !== "number") {
      throw new Error("Missing placement order field.");
    }

    const ordering: ResultOrderingConfig = {
      fieldName: "order",
      field: orderField,
      scope: [{ kind: "field", fieldName: "parent", field: blockPlacement.fields.parent }],
      presentations: ["moveMenu"],
    };

    const html = renderRecordTableHtml({
      columns,
      entity: blockPlacement,
      entityName: "block-placement",
      ordering,
      records: [
        sitePlacementRecord("placement-3", "Third", 3000),
        sitePlacementRecord("placement-1", "First", 1000),
        sitePlacementRecord("placement-2", "Second", 2000),
      ],
      schema: siteSourceSchema,
      schemaKey: "site",
    });

    expect(html.indexOf("First")).toBeLessThan(html.indexOf("Second"));
    expect(html.indexOf("Second")).toBeLessThan(html.indexOf("Third"));
  });

  it("renders shared resource label updates across rate cards without duplicating resources", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );
    const columns = rateModel?.result.type === "table" ? rateModel.result.columns : [];

    applyBootstrapResponse(
      bootstrap(
        [
          resourceRecord("resource-1", "Designer"),
          rateCardRateRecord("rate-1", "resource-1", "card-1", 475),
          rateCardRateRecord("rate-2", "resource-1", "card-2", 900),
        ],
        rateCardSchema,
      ),
    );

    const before = renderToStaticMarkup(
      <RecordTable
        entity={rateCardSchema.entities.rate}
        entityName="rate"
        query={{ kind: "all" }}
        result={tableResult(columns)}
      />,
    );

    applyRecordMerge([resourceRecord("resource-1", "Principal designer")], 2);

    const after = renderToStaticMarkup(
      <RecordTable
        entity={rateCardSchema.entities.rate}
        entityName="rate"
        query={{ kind: "all" }}
        result={tableResult(columns)}
      />,
    );
    const resourceIds = getClientStoreSnapshot().recordIdsByEntity.resource ?? [];

    expect(before.match(/value="Designer"/g)?.length).toBe(2);
    expect(after.match(/value="Principal designer"/g)?.length).toBe(2);
    expect(after).not.toContain('value="Designer"');
    expect(resourceIds).toEqual(["resource-1"]);
  });

  it("renders missing referenced-record table cells without crashing", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );
    const columns = rateModel?.result.type === "table" ? rateModel.result.columns : [];

    applyBootstrapResponse(
      bootstrap([rateCardRateRecord("rate-1", "missing-resource", "card-1", 475)], rateCardSchema),
    );
    const html = renderToStaticMarkup(
      <RecordTable
        entity={rateCardSchema.entities.rate}
        entityName="rate"
        query={{ kind: "all" }}
        result={tableResult(columns)}
      />,
    );

    expect(html).toContain('data-slot="table"');
    expect(html).toContain('aria-label="Role unavailable"');
    expect(html).toContain('value="$475.00"');
  });

  it("renders read-only table cells with display formatting", () => {
    const rate = rateCardSchema.entities.rate;
    const columns: TableColumnConfig[] = [
      {
        type: "field",
        key: "field:price",
        fieldName: "price",
        field: rate.fields.price,
        editor: "number",
        commit: "field-commit",
        label: "Price",
        align: "end",
        width: "sm",
        display: "readOnly",
        suffix: "/ day",
        format: "currency",
      },
    ];

    applyBootstrapResponse(
      bootstrap([rateCardRateRecord("rate-1", "resource-1", "card-1", 475)], rateCardSchema),
    );
    const html = renderToStaticMarkup(
      <RecordTable
        entity={rate}
        entityName="rate"
        query={{ kind: "all" }}
        result={tableResult(columns)}
      />,
    );

    expect(html).toContain("Price");
    expect(html).toContain("$475.00");
    expect(html).toContain("/ day");
    expect(html).not.toContain('type="number"');
  });

  it("renders computed table cells and updates after source record patches", () => {
    const schema = rateCardSchemaWithComputedMarginColumn();
    const rate = schema.entities.rate;
    const columns = tableColumnsFor(schema, "rateHome");

    applyBootstrapResponse(
      bootstrap([rateCardRateRecord("rate-1", "resource-1", "card-1", 475)], schema),
    );
    const before = renderToStaticMarkup(
      <RecordTable
        entity={rate}
        entityName="rate"
        query={{ kind: "all" }}
        result={tableResult(columns)}
      />,
    );

    applyRecordMerge([rateCardRateRecordWithCost("rate-1", "resource-1", "card-1", 250, 500)], 2);
    const after = renderToStaticMarkup(
      <RecordTable
        entity={rate}
        entityName="rate"
        query={{ kind: "all" }}
        result={tableResult(columns)}
      />,
    );

    expect(before).toContain("Margin");
    expect(before).toContain("31.58%");
    expect(after).toContain("Margin");
    expect(after).toContain("50%");
    expect(after).not.toContain("31.58%");
  });

  it("renders read-only color fields with swatches and tolerates invalid strings", () => {
    const entity = fieldEditorCharacterizationEntity();
    const columns: TableColumnConfig[] = [
      {
        type: "field",
        key: "field:color",
        fieldName: "color",
        field: entity.fields.color,
        editor: "color",
        commit: "field-commit",
        label: "Color",
        display: "readOnly",
        format: "plain",
      },
    ];
    const invalidColorRecord: StoredRecord = {
      ...fieldEditorCharacterizationRecord(),
      id: "record-editor-case-2",
      values: { color: "not-a-color" },
    };

    applyBootstrapResponse(bootstrap([fieldEditorCharacterizationRecord(), invalidColorRecord]));
    const html = renderToStaticMarkup(
      <RecordTable
        entity={entity}
        entityName="editorCase"
        query={{ kind: "all" }}
        result={tableResult(columns)}
      />,
    );

    expect(html).toContain("Color color swatch");
    expect(html).toContain("#336699");
    expect(html).toContain("not-a-color");
    expect(html).not.toContain('style="background-color:not-a-color"');
  });

  it("renders number create controls and inline editors with numeric constraints", () => {
    const task = taskEntityWithEstimateNumber();
    const operation = createOperation(task, ["estimate"]);
    const createHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm operation={operation} renderDialogCancel={false} />,
    );
    const recordFields: RecordFieldConfig[] = [
      {
        fieldName: "estimate",
        field: task.fields.estimate,
        editor: "number",
        commit: "field-commit",
      },
    ];

    applyBootstrapResponse(bootstrap([numberRecord(3)]));
    const rowHtml = renderToStaticMarkup(
      <RecordList
        entity={task}
        entityName="task"
        query={{ kind: "all" }}
        result={listResult(recordFields)}
      />,
    );

    expect(createHtml).toMatch(inputWithNameAndType("estimate", "hidden"));
    expect(createHtml).toMatch(inputWithAriaLabelAndType("Estimate", "text"));
    expect(createHtml).toContain('data-web-formatted-number-input="true"');
    expect(createHtml).toContain('min="0"');
    expect(createHtml).toContain('max="10"');
    expect(createHtml).toContain('step="1"');
    expectFormattedNumberInputLabel(createHtml, "Estimate");
    expect(rowHtml).toContain('aria-label="Estimate"');
    expect(rowHtml).toContain('data-web-formatted-number-input="true"');
    expect(rowHtml).toMatch(inputWithAriaLabelAndType("Estimate", "text"));
    expect(rowHtml).toContain('value="3"');
    expectFormattedNumberInputLabel(rowHtml, "Estimate");
  });

  it("renders formatted number table editors from column format metadata", () => {
    const entity: EntitySchema = {
      label: "Metric",
      fields: {
        price: { type: "number", required: true, label: "Price" },
        margin: { type: "number", required: true, label: "Margin" },
      },
    };
    const columns: TableColumnConfig[] = [
      {
        type: "field",
        key: "field:price",
        fieldName: "price",
        field: entity.fields.price,
        editor: "number",
        commit: "field-commit",
        label: "Price",
        display: "editor",
        format: "currency",
      },
      {
        type: "field",
        key: "field:margin",
        fieldName: "margin",
        field: entity.fields.margin,
        editor: "number",
        commit: "field-commit",
        label: "Margin",
        display: "editor",
        format: "percent",
      },
    ];
    const record: StoredRecord = {
      id: "metric-1",
      entity: "metric",
      values: { price: 475, margin: 0.125 },
      createdAt: "2026-04-29T00:00:01.000Z",
      updatedAt: "2026-04-29T00:00:01.000Z",
    };

    applyBootstrapResponse(bootstrap([record]));
    const html = renderToStaticMarkup(
      <RecordTable
        entity={entity}
        entityName="metric"
        query={{ kind: "all" }}
        result={tableResult(columns)}
      />,
    );

    expect(html.match(/data-web-formatted-number-input="true"/g)?.length).toBe(2);
    expect(html).toMatch(inputWithAriaLabelAndType("Price", "text"));
    expect(html).toMatch(inputWithAriaLabelAndType("Margin", "text"));
    expectFormattedNumberInputLabel(html, "Price");
    expectFormattedNumberInputLabel(html, "Margin");
    expect(html).toContain('value="$475.00"');
    expect(html).toContain('value="12.5%"');
  });

  it("renders reference create controls with target display labels", () => {
    const rate = rateEntity();
    const operation = createOperation(rate, ["resource"], "rate");

    applyBootstrapResponse(
      bootstrap([resourceRecord("resource-1", "Designer"), resourceRecord("resource-2", "Lead")]),
    );
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm operation={operation} renderDialogCancel={false} />,
    );

    expect(html).toContain('name="resource"');
    expect(html).toContain("<select");
    expect(html).toContain('data-slot="select"');
    expect(html).toContain('value="resource-1"');
    expect(html).toContain("Designer");
    expect(html).toContain("Lead");
  });

  it("renders generated create controls for current editor hints", () => {
    const entity = fieldEditorCharacterizationEntity();
    const operation = fieldEditorCharacterizationCreateOperation(entity);

    applyBootstrapResponse(bootstrap([resourceRecord("resource-1", "Designer")]));
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm operation={operation} renderDialogCancel={false} />,
    );

    expect(html).toMatch(inputWithNameAndType("title", "text"));
    expect(html).not.toContain('data-web-autosize-text-input="true"');
    expect(html).toMatch(textareaWithName("summary"));
    expect(html).toMatch(inputWithNameAndType("body", "hidden"));
    expect(html).toContain('data-web-markdown-editor="textarea"');
    expect(html).toMatch(inputWithNameAndType("color", "hidden"));
    expect(html).toContain('aria-label="Choose Color"');
    expect(html).toMatch(inputWithAriaLabelAndType("Color", "text"));
    expect(html).toMatch(inputWithNameAndType("href", "text"));
    expect(html).toMatch(inputWithNameAndType("slug", "text"));
    expect(html).toMatch(inputWithNameAndType("icon", "hidden"));
    expect(html).toContain('data-web-field-kind="icon"');
    expect(html).toContain('data-web-icon-field-edit="trigger"');
    expect(html).not.toContain("data-web-svg-source");
    expect(html).toMatch(inputWithNameAndType("publishedAt", "hidden"));
    expect(html).toContain('data-slot="date-picker-trigger"');
    expect(html).toContain('role="spinbutton"');
    expect(html).toMatch(inputWithNameAndType("count", "hidden"));
    expect(html).toMatch(inputWithAriaLabelAndType("Count", "text"));
    expect(html).toContain('data-web-formatted-number-input="true"');
    expect(html).toContain("Draft");
    expect(html).toContain("Published");
    expect(html).toContain("Designer");

    const formData = new FormData();
    formData.set("title", "Icon create");
    formData.set("summary", "Summary");
    formData.set("body", "# Body");
    formData.set("color", "#336699");
    formData.set("href", "https://example.com");
    formData.set("slug", "icon-create");
    formData.set("icon", '<svg viewBox="0 0 24 24"></svg>');
    formData.set("publishedAt", "2026-05-06");
    formData.set("count", "1.2k");
    formData.set("status", "published");
    formData.set("resource", "resource-1");

    expect(resolveCreateValues(formData, operation)).toMatchObject({
      icon: '<svg viewBox="0 0 24 24"></svg>',
      title: "Icon create",
    });
  });

  it("renders inline patch controls for current editor hints", () => {
    const entity = fieldEditorCharacterizationEntity();

    applyBootstrapResponse(
      bootstrap([resourceRecord("resource-1", "Designer"), fieldEditorCharacterizationRecord()]),
    );
    const html = renderToStaticMarkup(
      <RecordList
        entity={entity}
        entityName="editorCase"
        query={{ kind: "all" }}
        result={listResult(fieldEditorCharacterizationRecordFields(entity))}
      />,
    );

    expect(html).toMatch(inputWithAriaLabelAndType("Title", "text"));
    expect(html).not.toContain('data-web-autosize-text-input="true"');
    expect(html).toContain('value="Plain title"');
    expect(html).toMatch(textareaWithAriaLabel("Summary"));
    expect(html).toContain('data-web-markdown-editor="textarea"');
    expect(html).toContain('aria-label="Body"');
    expect(html).toContain("Heading");
    expect(html).toMatch(inputWithAriaLabelAndType("Color", "text"));
    expect(html).toContain('aria-label="Choose Color"');
    expect(html).toContain('value="#336699"');
    expect(html).toMatch(inputWithAriaLabelAndType("Link", "text"));
    expect(html).toMatch(inputWithAriaLabelAndType("Slug", "text"));
    expect(html).toContain('data-web-field-kind="icon"');
    expect(html).toContain('data-web-svg-icon="empty"');
    expect(html).toContain('aria-label="Edit Icon"');
    expect(html).toMatch(/data-web-icon-field-edit="trigger"[\s\S]*data-web-svg-icon="empty"/);
    expect(html).not.toContain('value="sparkles"');
    expect(html).toContain('data-slot="date-picker-trigger"');
    expect(html).toContain('role="spinbutton"');
    expect(html).toContain("2026");
    expect(html).toMatch(inputWithAriaLabelAndType("Count", "text"));
    expect(html).toContain('data-web-formatted-number-input="true"');
    expect(html).toContain('value="1200"');
    expect(html).toContain("Published");
    expect(html).toContain("Designer");
  });

  it("renders generated read-only icon display as SVG icon markup", () => {
    const entity = fieldEditorCharacterizationEntity();
    const columns: TableColumnConfig[] = [
      {
        type: "field",
        key: "field:icon",
        fieldName: "icon",
        field: entity.fields.icon,
        editor: "icon",
        commit: "field-commit",
        label: "Icon",
        display: "readOnly",
        format: "plain",
        width: "sm",
      },
    ];
    const baseRecord = fieldEditorCharacterizationRecord();
    const record = {
      ...baseRecord,
      values: {
        ...baseRecord.values,
        icon: '<svg viewBox="0 0 24 24"></svg>',
      },
    };

    applyBootstrapResponse(bootstrap([record]));
    const html = renderToStaticMarkup(
      <RecordTable
        entity={entity}
        entityName="editorCase"
        query={{ kind: "all" }}
        result={tableResult(columns)}
      />,
    );

    expect(html).toContain('data-web-svg-icon="svg"');
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).not.toContain("&lt;svg viewBox=&quot;0 0 24 24&quot;&gt;&lt;/svg&gt;");
    expect(html).not.toContain("data-web-svg-source");
  });

  it("renders compact text table editors as regular text inputs", () => {
    const entity = fieldEditorCharacterizationEntity();
    const columns: TableColumnConfig[] = [
      {
        type: "field",
        key: "field:title",
        fieldName: "title",
        field: entity.fields.title,
        editor: "text",
        commit: "field-commit",
        label: "Title",
        display: "editor",
        format: "plain",
        width: "lg",
      },
    ];

    applyBootstrapResponse(bootstrap([fieldEditorCharacterizationRecord()]));
    const html = renderToStaticMarkup(
      <RecordTable
        entity={entity}
        entityName="editorCase"
        query={{ kind: "all" }}
        result={tableResult(columns)}
      />,
    );

    expect(html).not.toContain('data-web-autosize-text-input="true"');
    expect(html).toMatch(inputWithAriaLabelAndType("Title", "text"));
    expect(html).toContain('value="Plain title"');
  });

  it("keeps compact native record controls scoped to unlabeled inline editors", () => {
    const entity = fieldEditorCharacterizationEntity();

    applyBootstrapResponse(
      bootstrap([resourceRecord("resource-1", "Designer"), fieldEditorCharacterizationRecord()]),
    );

    function renderCompactField(
      fieldName: string,
      editor: RecordFieldConfig["editor"],
      commit: RecordFieldConfig["commit"],
      showLabel = false,
    ) {
      return renderToStaticMarkup(
        <SchemaAppProvider schemaKey="tasks">
          <RecordFieldEditor
            density="compact"
            entityName="editorCase"
            fieldConfig={recordFieldConfig(entity, fieldName, editor, commit)}
            recordId="record-editor-case-1"
            showLabel={showLabel}
            updateOperation={testUpdateOperation("editorCase")}
          />
        </SchemaAppProvider>,
      );
    }

    const textHtml = renderCompactField("title", "text", "field-commit");
    const textareaHtml = renderCompactField("summary", "textarea", "field-commit");
    const enumHtml = renderCompactField("status", "enum", "immediate");
    const referenceHtml = renderCompactField("resource", "reference", "immediate");
    const labeledTextHtml = renderCompactField("title", "text", "field-commit", true);
    const labeledDateHtml = renderCompactField("publishedAt", "date", "field-commit", true);
    const labeledEnumHtml = renderCompactField("status", "enum", "immediate", true);

    expect(textHtml).toContain("h-6");
    expect(textHtml).toContain("sm:py-0.5");
    expect(textHtml).toContain("sm:text-xs/4");
    expect(textareaHtml).toContain("min-h-20");
    expect(textareaHtml).toContain("sm:py-1");
    expect(textareaHtml).toContain("sm:text-xs/4");
    expect(enumHtml).toContain("h-6");
    expect(enumHtml).toContain("sm:py-0.5");
    expect(enumHtml).toContain("sm:text-xs/4");
    expect(referenceHtml).toContain("h-6");
    expect(referenceHtml).toContain("sm:py-0.5");
    expect(referenceHtml).toContain("sm:text-xs/4");
    expect(labeledTextHtml).toContain("px-3 py-2");
    expect(labeledTextHtml).not.toContain("h-6 w-full rounded");
    expect(labeledDateHtml).toContain("w-fit max-w-full min-w-36");
    expect(labeledDateHtml).not.toContain("[&amp;_[data-slot=control]]:h-6");
    expect(labeledEnumHtml).not.toContain("h-6 py-0.5 pe-6 ps-2 text-xs/4");
  });

  it("renders the rate-home resource create dialog with only name visible", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );
    const operation = rateModel?.operations.find((candidate) => candidate.type === "create");

    if (!operation || operation.type !== "create") {
      throw new Error("Missing resource create operation.");
    }

    applyBootstrapResponse(
      bootstrap(
        [cardRecord("card-1", "Default"), resourceRecord("resource-1", "Designer")],
        rateCardSchema,
      ),
    );
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm operation={operation} renderDialogCancel={false} />,
    );

    expect(html).toContain('name="name"');
    expect(html).not.toContain('name="resource"');
    expect(html).not.toContain('name="cost"');
    expect(html).not.toContain('name="costUnit"');
    expect(html).not.toContain('name="price"');
    expect(html).not.toContain('name="kind"');
    expect(html).not.toContain('name="unit"');
    expect(html).not.toContain('name="card"');
  });

  it("renders terse rate-card resource and card create dialogs with schema defaults hidden", () => {
    const models = selectCollectionModels(rateCardSchema);
    const resourceCreate = models
      .find((model) => model.viewName === "resourceHome")
      ?.operations.find((operation) => operation.type === "create");
    const cardCreate = models
      .find((model) => model.viewName === "cardHome")
      ?.operations.find((operation) => operation.type === "create");

    if (!resourceCreate || resourceCreate.type !== "create") {
      throw new Error("Missing resource create operation.");
    }

    if (!cardCreate || cardCreate.type !== "create") {
      throw new Error("Missing card create operation.");
    }

    const resourceHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm operation={resourceCreate} renderDialogCancel={false} />,
    );
    const cardHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm operation={cardCreate} renderDialogCancel={false} />,
    );

    expect(resourceHtml).toContain('name="name"');
    expect(resourceHtml).not.toContain('name="kind"');
    expect(resourceHtml).not.toContain('name="unit"');
    expect(resourceHtml).not.toContain('name="period"');
    expect(resourceHtml).not.toContain('name="quantity"');
    expect(cardHtml).toContain('name="name"');
    expect(cardHtml).not.toContain('name="isDefault"');
    expect(cardHtml).not.toContain('name="marginMin"');
    expect(cardHtml).not.toContain('name="marginMed"');
    expect(cardHtml).not.toContain('name="marginMax"');
  });

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

  it("keeps source task create and edit flows wired through field behavior", () => {
    const operation = requiredCreateOperation(appSchema, "taskHome");
    const createHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm operation={operation} renderDialogCancel={false} />,
    );
    const formData = new FormData();
    formData.set("title", "Ship field behavior");
    formData.set("dueDate", "2026-05-06");
    formData.set("priority", "high");

    expect(createHtml).toContain('name="title"');
    expect(createHtml).toContain('name="dueDate"');
    expect(createHtml).toMatch(inputWithNameAndType("dueDate", "hidden"));
    expect(createHtml).toContain('data-slot="date-picker-trigger"');
    expect(createHtml).toContain('role="spinbutton"');
    expect(createHtml).not.toMatch(inputWithNameAndType("dueDate", "text"));
    expect(createHtml).not.toContain('name="estimate"');
    expect(createHtml).toContain('name="priority"');
    expect(createHtml).toContain("High");
    expect(createHtml).not.toContain('name="done"');
    expect(resolveCreateValues(formData, operation)).toEqual({
      title: "Ship field behavior",
      dueDate: "2026-05-06",
      priority: "high",
    });

    const emptyDateFormData = new FormData();
    emptyDateFormData.set("dueDate", "");
    expect(
      resolveCreateValues(emptyDateFormData, createOperation(appSchema.entities.task, ["dueDate"])),
    ).toEqual({
      dueDate: "",
    });

    applyBootstrapResponse(
      bootstrap([
        {
          ...taskRecord("record-1", "Ship field behavior", true, "2026-05-06"),
          values: {
            title: "Ship field behavior",
            done: true,
            dueDate: "2026-05-06",
            priority: "high",
          },
        },
      ]),
    );
    const editHtml = renderToStaticMarkup(
      <RecordList
        entity={appSchema.entities.task}
        entityName="task"
        query={{ kind: "all" }}
        result={listResult(listRecordFieldsFor(appSchema, "taskHome"))}
      />,
    );

    expect(editHtml).toContain('value="Ship field behavior"');
    expect(editHtml).toContain('type="checkbox"');
    expect(editHtml).toContain("checked");
    expect(editHtml).toContain('data-slot="date-picker-trigger"');
    expect(editHtml).toContain('role="spinbutton"');
    expect(editHtml).not.toContain('aria-label="Estimate"');
    expect(editHtml).toContain("High");
  });

  it("keeps source rate-card create and edit flows wired through field behavior", () => {
    const operation = requiredCreateOperation(rateCardSchema, "rateHome");
    const createHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm operation={operation} renderDialogCancel={false} />,
    );
    const formData = new FormData();
    formData.set("name", "Producer");

    expect(createHtml).toContain('name="name"');
    expect(createHtml).not.toContain('name="kind"');
    expect(createHtml).not.toContain('name="unit"');
    expect(resolveCreateValues(formData, operation)).toEqual({
      name: "Producer",
    });

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
    const editHtml = renderToStaticMarkup(
      <RecordTable
        entity={rateCardSchema.entities.rate}
        entityName="rate"
        query={{ kind: "all" }}
        result={tableResult(tableColumnsFor(rateCardSchema, "rateHome"))}
      />,
    );

    expect(editHtml).toContain('aria-label="Role"');
    expect(editHtml).toContain('value="Designer"');
    expect(editHtml).toContain('aria-label="Cost"');
    expect(editHtml).toContain('value="325"');
    expect(editHtml).toContain('aria-label="Price"');
    expect(editHtml).toContain('value="$475.00"');
    expect(editHtml).not.toContain("USD");
    expect(editHtml).toContain('aria-label="Cost unit"');
    expect(editHtml).not.toContain('aria-label="Price unit"');
    expect(editHtml.match(/\/ day/g)?.length ?? 0).toBe(1);
  });

  it("keeps source site create and edit flows wired through field behavior", () => {
    const operation = requiredCreateOperation(siteSourceSchema, "blockHome");
    const formData = new FormData();
    formData.set("type", "post");
    formData.set("label", "Field behavior note");
    formData.set("date", "2026-05-14");
    formData.set("body", "## Note\n\nCreate and edit stay wired.");
    formData.set("href", "https://example.com/field-behavior");
    const imageFormData = new FormData();
    imageFormData.set("type", "image");
    imageFormData.set("label", "Cover image");
    imageFormData.set("mediaAssetId", "cover.png");
    imageFormData.set("width", "1200");
    imageFormData.set("height", "630");
    const imageWithoutHrefFormData = new FormData();
    imageWithoutHrefFormData.set("type", "image");
    imageWithoutHrefFormData.set("label", "Unuploaded image");
    const linkFormData = new FormData();
    linkFormData.set("type", "link");
    linkFormData.set("label", "Field behavior link");
    linkFormData.set("linkTargetMode", "external");
    linkFormData.set("href", "https://example.com/field-behavior");
    linkFormData.set("icon", "note");
    linkFormData.set("color", "#336699");

    bootstrapSiteEditor();
    const createHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm operation={operation} renderDialogCancel={false} />,
    );
    const editHtml = renderToStaticMarkup(
      <RecordTable
        entity={siteSourceSchema.entities.block}
        entityName="block"
        query={{ kind: "all" }}
        result={tableResult(tableColumnsFor(siteSourceSchema, "blockHome"))}
      />,
    );

    expect(createHtml).toContain('name="type"');
    expect(createHtml).toContain("Post");
    expect(createHtml).not.toMatch(inputWithNameAndType("body", "hidden"));
    expect(createHtml).not.toContain('name="templateKey"');
    expect(createHtml).not.toContain('data-web-markdown-editor="textarea"');
    expect(createHtml).not.toContain('name="featured"');
    expect(createHtml).not.toContain('name="publishedAt"');
    expect(createHtml).not.toContain('aria-label="Select date"');
    expect(createHtml).not.toMatch(inputWithNameAndType("order", "hidden"));
    expect(createHtml).not.toMatch(inputWithAriaLabelAndType("Order", "text"));
    expect(createHtml).not.toContain('data-web-formatted-number-input="true"');
    expect(createHtml).not.toContain('name="color"');
    expect(createHtml).not.toContain('aria-label="Choose Color"');
    expect(createHtml).not.toContain('name="assetKey"');
    expect(createHtml).not.toContain('name="alt"');
    expect(createHtml).not.toContain('name="width"');
    expect(createHtml).not.toContain('name="height"');
    expect(createHtml).not.toContain('name="limit"');
    expect(resolveCreateValues(formData, operation)).toEqual({
      type: "post",
      label: "Field behavior note",
      date: "2026-05-14",
      body: "## Note\n\nCreate and edit stay wired.",
      href: "https://example.com/field-behavior",
    });
    expect(resolveCreateValues(imageFormData, operation)).toEqual({
      type: "image",
      label: "Cover image",
      mediaAssetId: "cover.png",
    });
    expect(resolveCreateValues(imageWithoutHrefFormData, operation)).toMatchObject({
      type: "image",
      label: "Unuploaded image",
      mediaAssetId: "",
    });
    expect(resolveCreateValues(linkFormData, operation)).toEqual({
      type: "link",
      label: "Field behavior link",
      linkTargetMode: "external",
      href: "https://example.com/field-behavior",
      icon: "note",
    });
    expect(editHtml).toContain("Shipping schema-backed authoring");
    expect(editHtml).toContain('aria-label="Body"');
    expect(editHtml).toContain("<textarea");
    expect(editHtml).not.toContain('aria-label="Featured"');
    expect(editHtml).not.toContain('aria-label="Published at"');
    expect(editHtml).toContain('data-slot="date-picker-trigger"');
    expect(editHtml).toContain('role="spinbutton"');
    expect(editHtml).not.toContain('aria-label="Order"');
    expect(editHtml).toContain('data-web-formatted-number-input="true"');
  });

  it("renders the generated Site image asset editor without manual URL authoring", () => {
    const mediaAssetField = siteSourceSchema.entities.block.fields.mediaAssetId;

    if (!mediaAssetField || mediaAssetField.type !== "text") {
      throw new Error("Missing Site block media asset field.");
    }

    const mediaAssetFieldConfig: RecordFieldConfig = {
      fieldName: "mediaAssetId",
      field: mediaAssetField,
      editor: "media",
      commit: "field-commit",
    };
    bootstrapSiteEditor([
      siteBlockRecord("block-image", {
        type: "image",
        label: "Cover image",
        mediaAssetId: "cover.webp",
        href: "https://cdn.example.com/manual-cover.webp",
        width: 1200,
        height: 630,
      }),
      siteBlockRecord("block-empty-image", {
        type: "image",
        label: "Empty image",
      }),
    ]);

    const imageHtml = renderToStaticMarkup(
      <SchemaAppProvider schemaKey="site">
        <RecordFieldEditor
          entityName="block"
          fieldConfig={mediaAssetFieldConfig}
          recordId="block-image"
          showLabel
          updateOperation={testUpdateOperation("block")}
        />
      </SchemaAppProvider>,
    );
    const emptyHtml = renderToStaticMarkup(
      <SchemaAppProvider schemaKey="site">
        <RecordFieldEditor
          entityName="block"
          fieldConfig={mediaAssetFieldConfig}
          recordId="block-empty-image"
          showLabel
          updateOperation={testUpdateOperation("block")}
        />
      </SchemaAppProvider>,
    );

    expect(imageHtml).toContain('data-web-field-kind="media"');
    expect(imageHtml).toContain('data-web-media-field-preview="image"');
    expect(imageHtml).toContain('data-web-media-field-upload="trigger"');
    expect(imageHtml).toContain('src="/api/formless/media/media/images/cover.webp"');
    expect(imageHtml).not.toContain('src="https://cdn.example.com/manual-cover.webp"');
    expect(imageHtml).toContain('type="file"');
    expect(imageHtml).toContain('accept="image/jpeg,image/png,image/webp,image/gif"');
    expect(imageHtml).toContain('aria-label="Upload Media asset"');
    expect(imageHtml).toContain('aria-label="Media asset"');
    expect(imageHtml).not.toMatch(inputWithAriaLabelAndType("Media asset id", "text"));
    expect(imageHtml).toContain(">Current image</option>");
    expect(imageHtml).toContain('value="cover.webp"');
    expect(imageHtml).toMatch(/<input(?=[^>]*type="file")(?=[^>]*class="sr-only")[^>]*>/);
    expect(imageHtml).not.toContain('aria-label="Link"');
    expect(emptyHtml).toContain('data-web-media-field-preview="empty"');
    expect(emptyHtml).toContain('data-web-media-field-upload="trigger"');
    expect(emptyHtml).not.toContain("No image");
  });

  it("renders scalar media asset id editors with core media previews and selectors", () => {
    const entity: EntitySchema = {
      label: "Media asset case",
      fields: {
        mediaAssetId: { type: "text", required: false, label: "Image asset" },
      },
    };

    applyBootstrapResponse(
      bootstrap([
        {
          id: "media-asset-case-1",
          entity: "mediaAssetCase",
          values: { mediaAssetId: "cover.webp" },
          createdAt: "2026-05-26T00:00:00.000Z",
          updatedAt: "2026-05-26T00:00:00.000Z",
        },
        {
          id: "media-asset-case-2",
          entity: "mediaAssetCase",
          values: { mediaAssetId: "../bad.webp" },
          createdAt: "2026-05-26T00:00:01.000Z",
          updatedAt: "2026-05-26T00:00:01.000Z",
        },
      ]),
    );

    const validHtml = renderToStaticMarkup(
      <SchemaAppProvider schemaKey="tasks">
        <RecordFieldEditor
          entityName="mediaAssetCase"
          fieldConfig={recordFieldConfig(entity, "mediaAssetId", "media", "field-commit")}
          recordId="media-asset-case-1"
          showLabel
          updateOperation={testUpdateOperation("mediaAssetCase")}
        />
      </SchemaAppProvider>,
    );
    const brokenHtml = renderToStaticMarkup(
      <SchemaAppProvider schemaKey="tasks">
        <RecordFieldEditor
          entityName="mediaAssetCase"
          fieldConfig={recordFieldConfig(entity, "mediaAssetId", "media", "field-commit")}
          recordId="media-asset-case-2"
          showLabel
          updateOperation={testUpdateOperation("mediaAssetCase")}
        />
      </SchemaAppProvider>,
    );

    expect(validHtml).toContain('data-web-field-kind="media"');
    expect(validHtml).toContain('data-web-media-field-preview="image"');
    expect(validHtml).toContain('src="/api/formless/media/media/images/cover.webp"');
    expect(validHtml).toContain('aria-label="Upload Image asset"');
    expect(validHtml).toContain('aria-label="Image asset"');
    expect(validHtml).not.toMatch(inputWithAriaLabelAndType("Image asset id", "text"));
    expect(validHtml).toContain(">Current image</option>");
    expect(validHtml).toContain('value="cover.webp"');
    expect(validHtml).toMatch(/<input(?=[^>]*type="file")(?![^>]*disabled="")[^>]*>/);
    expect(brokenHtml).toContain('data-web-media-field-preview="broken"');
    expect(brokenHtml).toContain("Missing image");
  });

  it("keeps media create and edit controls asset-backed", () => {
    const entity: EntitySchema = {
      label: "Media",
      fields: {
        mediaAssetId: { type: "text", required: false, label: "Image asset" },
      },
    };
    const entityOperation = testCreateOperation("media");
    const createOperationConfig: Extract<HomeOperationConfig, { type: "create" }> = {
      type: "create",
      label: "Create Media",
      entityName: "media",
      entity,
      operationName: entityOperation.operationName,
      operation: entityOperation,
      fields: [createFieldConfig(entity, "mediaAssetId", "media")],
      defaults: [],
      enabled: entityCreateEnabled(entity),
    };
    const record: StoredRecord = {
      id: "media-1",
      entity: "media",
      values: { mediaAssetId: "cover.webp" },
      createdAt: "2026-05-05T00:00:51.000Z",
      updatedAt: "2026-05-05T00:00:51.000Z",
    };
    const formData = new FormData();
    formData.set("mediaAssetId", "create.webp");

    applyBootstrapResponse(bootstrap([record]));
    const createHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm operation={createOperationConfig} renderDialogCancel={false} />,
    );
    const editHtml = renderToStaticMarkup(
      <SchemaAppProvider schemaKey="tasks">
        <RecordFieldEditor
          entityName="media"
          fieldConfig={recordFieldConfig(entity, "mediaAssetId", "media", "field-commit")}
          recordId="media-1"
          showLabel
          updateOperation={testUpdateOperation("media")}
        />
      </SchemaAppProvider>,
    );

    expect(createHtml).toContain('type="file"');
    expect(createHtml).toContain('data-web-media-field-upload="trigger"');
    expect(createHtml).toContain('aria-label="Image asset"');
    expect(resolveCreateValues(formData, createOperationConfig)).toEqual({
      mediaAssetId: "create.webp",
    });
    expect(editHtml).toContain('data-web-field-kind="media"');
    expect(editHtml).toContain('data-web-media-field-preview="image"');
    expect(editHtml).toContain('src="/api/formless/media/media/images/cover.webp"');
    expect(editHtml).toContain('aria-label="Upload Image asset"');
    expect(editHtml).toMatch(/<input(?=[^>]*type="file")(?![^>]*disabled="")[^>]*>/);
    expect(editHtml).not.toMatch(inputWithAriaLabelAndType("Image asset id", "text"));
  });

  it("still resolves scoped create defaults for views that use them", () => {
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

  it("resolves site scoped create defaults for block placements", () => {
    const collection = requiredSiteCollectionModel("pageCompositionHome");
    const placementOperation = collection.operations.find(
      (operation) => operation.type === "create",
    );

    if (!placementOperation || placementOperation.type !== "create") {
      throw new Error("Missing placement create operation.");
    }

    bootstrapSiteEditor();
    const collectionHtml = renderGeneratedHomeCollection(collection, {
      selectedContextRecordId: "rec_site_content_home",
      today: "2026-05-05",
    });
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm operation={placementOperation} renderDialogCancel={false} />,
    );
    const placementFormData = new FormData();
    placementFormData.set("block", "rec_site_block_home_recent_posts");
    placementFormData.set("label", "Recent posts");

    expect(collectionHtml).toContain(">Add placement</button>");
    expect(collectionHtml).not.toMatch(/<button[^>]*disabled=""[^>]*>Add placement<\/button>/);
    expect(html).not.toContain('name="parent"');
    expect(html).not.toContain('name="slot"');
    expect(html).not.toContain('name="variant"');
    expect(html).not.toContain('name="visible"');
    expect(
      resolveCreateValues(placementFormData, placementOperation, {
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

  it("renders reference inline editors with target labels and raw missing values", () => {
    const rate = rateEntity();
    const recordFields: RecordFieldConfig[] = [
      {
        fieldName: "resource",
        field: rate.fields.resource,
        editor: "reference",
        commit: "immediate",
      },
    ];

    applyBootstrapResponse(
      bootstrap([
        resourceRecord("resource-1", "Designer"),
        rateRecord("rate-1", "resource-1"),
        rateRecord("rate-2", "missing-resource"),
      ]),
    );
    const html = renderToStaticMarkup(
      <RecordList
        entity={rate}
        entityName="rate"
        query={{ kind: "all" }}
        result={listResult(recordFields)}
      />,
    );

    expect(html).toContain('aria-label="Resource"');
    expect(html).toContain("Designer");
    expect(html).toContain("missing-resource");
  });

  it("renders only the fields declared by a create view in the dialog", () => {
    const task = appSchema.entities.task;
    const operation = createOperation(task, ["title", "dueDate"]);
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm operation={operation} renderDialogCancel={false} />,
    );

    expect(html).toContain("Create Task");
    expect(html).toContain('name="title"');
    expect(html).toContain('name="dueDate"');
    expect(html).not.toContain('name="done"');
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("Done");
  });

  it("renders a disabled create state when create policy is disabled", () => {
    const task = withMutationPolicy(appSchema.entities.task, { create: false });
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm
        operation={createOperation(task, ["title", "done", "dueDate"])}
        renderDialogCancel={false}
      />,
    );

    expect(html).toContain("Create is disabled for Task.");
    expect(html).toContain("Create disabled");
    expect(html).toContain("disabled");
  });

  it("filters records through the selected query and hides tombstones", () => {
    const task = appSchema.entities.task;
    const model = selectPrimaryCollectionModels(appSchema)[0];
    const active = taskRecord("record-1", "Open", false);
    const deletedCompleted = {
      ...taskRecord("record-2", "Finished", true),
      deletedAt: "2026-04-29T00:02:00.000Z",
    };

    applyBootstrapResponse(bootstrap([active, deletedCompleted]));
    const html = renderToStaticMarkup(
      <RecordList
        entity={task}
        entityName="task"
        query={appSchema.queries.taskCompleted?.expression ?? { kind: "all" }}
        result={model?.result.type === "list" ? model.result : listResult([])}
      />,
    );

    expect(html).toContain("No records yet.");
    expect(html).not.toContain("Finished");
  });

  it("renders generated list delete controls only when entity policy enables them", () => {
    const model = selectPrimaryCollectionModels(appSchema)[0];
    const task = appSchema.entities.task;
    const taskWithDelete = withMutationPolicy(task, { delete: true });
    const recordFields = model?.result.type === "list" ? model.result.recordFields : [];

    applyBootstrapResponse(bootstrap([taskRecord("record-1", "Disposable task", false)]));
    const disabledHtml = renderToStaticMarkup(
      <RecordList
        entity={task}
        entityName="task"
        query={{ kind: "all" }}
        result={listResult(recordFields)}
      />,
    );
    const enabledHtml = renderToStaticMarkup(
      <RecordList
        entity={taskWithDelete}
        entityName="task"
        query={{ kind: "all" }}
        result={listResult(recordFields, { deleteOperation: testDeleteOperation("task") })}
      />,
    );

    expect(disabledHtml).not.toContain('aria-label="More actions for Disposable task"');
    expect(enabledHtml).toContain('aria-label="More actions for Disposable task"');
  });

  it("renders generated table delete controls only when entity policy enables them", () => {
    const task = appSchema.entities.task;
    const taskWithDelete = withMutationPolicy(task, { delete: true });
    const columns: TableColumnConfig[] = [
      {
        type: "field",
        key: "field:title",
        fieldName: "title",
        field: task.fields.title,
        editor: "text",
        commit: "field-commit",
        label: "Title",
        display: "readOnly",
        format: "plain",
      },
    ];

    applyBootstrapResponse(bootstrap([taskRecord("record-1", "Disposable task", false)]));
    const disabledHtml = renderToStaticMarkup(
      <RecordTable
        entity={task}
        entityName="task"
        query={{ kind: "all" }}
        result={tableResult(columns)}
      />,
    );
    const enabledHtml = renderToStaticMarkup(
      <RecordTable
        entity={taskWithDelete}
        entityName="task"
        query={{ kind: "all" }}
        result={tableResult(columns, { deleteOperation: testDeleteOperation("task") })}
      />,
    );

    expect(disabledHtml).not.toContain('aria-label="Delete Disposable task"');
    expect(enabledHtml).toContain('aria-label="Delete Disposable task"');
  });

  it("humanizes field names when labels are omitted", () => {
    const task: EntitySchema = {
      ...appSchema.entities.task,
      fields: {
        dueDate: { type: "date", required: false },
      },
    };
    const html = renderToStaticMarkup(
      <GeneratedCreateForm
        createFields={createFields(task, ["dueDate"])}
        entity={task}
        entityName="task"
      />,
    );

    expect(html).toContain("Due date");
    expect(html).not.toContain("DueDate");
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

function requiredRootNavigationCreateOperation(
  groupLabel: string,
): Extract<HomeOperationConfig, { type: "create" }> {
  const group = requiredSiteCollectionModel("siteCompositionHome").context?.navigation?.groups.find(
    (candidate) => candidate.label === groupLabel,
  );

  if (!group?.createOperation) {
    throw new Error(`Missing root navigation create operation for ${groupLabel}.`);
  }

  return group.createOperation;
}

function requiredEditView(schema: AppSchema, viewName: string): EditViewConfig {
  const model = requiredCollectionModel(schema, viewName);

  if (model.result.type !== "table") {
    throw new Error(`Collection ${viewName} does not render a table.`);
  }

  const operationColumn = model.result.columns.find((column) => column.type === "operationControl");

  if (!operationColumn || operationColumn.type !== "operationControl") {
    throw new Error(`Collection ${viewName} does not expose edit operation controls.`);
  }

  const operationControl = operationColumn.controls.find(
    (candidate) => candidate.type === "editRecord",
  );

  if (!operationControl || operationControl.type !== "editRecord") {
    throw new Error(`Collection ${viewName} does not expose an edit record operation control.`);
  }

  return operationControl.editView;
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

function discriminatedTaskRecord(
  id: string,
  kind: "role" | "stream",
  title: string,
  done: boolean,
): StoredRecord {
  return {
    id,
    entity: "task",
    values: { kind, title, done },
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z",
  };
}

function taskPlacementRecord(id: string, parent: string, task: string): StoredRecord {
  return {
    id,
    entity: "task-placement",
    values: { parent, task, order: 1 },
    createdAt: "2026-05-11T00:00:01.000Z",
    updatedAt: "2026-05-11T00:00:01.000Z",
  };
}

function listRecordFieldsFor(schema: AppSchema, viewName: string): RecordFieldConfig[] {
  const model = requiredCollectionModel(schema, viewName);

  if (model.result.type !== "list") {
    throw new Error(`Collection ${viewName} does not render a list.`);
  }

  return model.result.recordFields;
}

function tableColumnsFor(schema: AppSchema, viewName: string): TableColumnConfig[] {
  return requiredTableModel(schema, viewName).columns;
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

function fieldEditorCharacterizationCreateOperation(
  entity: EntitySchema,
): Extract<HomeOperationConfig, { type: "create" }> {
  const operation = testCreateOperation("editorCase");

  return {
    type: "create",
    label: `Create ${entity.label}`,
    entityName: "editorCase",
    entity,
    operationName: operation.operationName,
    operation,
    fields: [
      createFieldConfig(entity, "title", "text"),
      createFieldConfig(entity, "summary", "textarea"),
      createFieldConfig(entity, "body", "markdown"),
      createFieldConfig(entity, "color", "color"),
      createFieldConfig(entity, "href", "href"),
      createFieldConfig(entity, "slug", "slug"),
      createFieldConfig(entity, "icon", "icon"),
      createFieldConfig(entity, "publishedAt", "date"),
      createFieldConfig(entity, "count", "number"),
      createFieldConfig(entity, "status", "enum"),
      createFieldConfig(entity, "resource", "reference"),
    ],
    defaults: [],
    enabled: entityCreateEnabled(entity),
  };
}

function fieldEditorCharacterizationRecordFields(entity: EntitySchema): RecordFieldConfig[] {
  return [
    recordFieldConfig(entity, "title", "text", "field-commit"),
    recordFieldConfig(entity, "summary", "textarea", "field-commit"),
    recordFieldConfig(entity, "body", "markdown", "field-commit"),
    recordFieldConfig(entity, "color", "color", "field-commit"),
    recordFieldConfig(entity, "href", "href", "field-commit"),
    recordFieldConfig(entity, "slug", "slug", "field-commit"),
    recordFieldConfig(entity, "icon", "icon", "field-commit"),
    recordFieldConfig(entity, "publishedAt", "date", "field-commit"),
    recordFieldConfig(entity, "count", "number", "field-commit"),
    recordFieldConfig(entity, "status", "enum", "immediate"),
    recordFieldConfig(entity, "resource", "reference", "immediate"),
  ];
}

function createFieldConfig(
  entity: EntitySchema,
  fieldName: string,
  editor: CreateFieldConfig["editor"],
): CreateFieldConfig {
  return {
    fieldName,
    field: entity.fields[fieldName],
    editor,
  };
}

function recordFieldConfig(
  entity: EntitySchema,
  fieldName: string,
  editor: RecordFieldConfig["editor"],
  commit: RecordFieldConfig["commit"],
): RecordFieldConfig {
  return {
    fieldName,
    field: entity.fields[fieldName],
    editor,
    commit,
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

function enumRecord(kind: string): StoredRecord {
  return {
    id: "record-1",
    entity: "task",
    values: { kind },
    createdAt: "2026-04-29T00:00:01.000Z",
    updatedAt: "2026-04-29T00:00:01.000Z",
  };
}

function markdownRecord(body: string): StoredRecord {
  return {
    id: "record-1",
    entity: "task",
    values: { body },
    createdAt: "2026-04-29T00:00:01.000Z",
    updatedAt: "2026-04-29T00:00:01.000Z",
  };
}

function numberRecord(estimate: number): StoredRecord {
  return {
    id: "record-1",
    entity: "task",
    values: { estimate },
    createdAt: "2026-04-29T00:00:01.000Z",
    updatedAt: "2026-04-29T00:00:01.000Z",
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

function rateRecord(id: string, resource: string): StoredRecord {
  const createdAt = `2026-04-29T00:00:0${id.at(-1)}.000Z`;

  return {
    id,
    entity: "rate",
    values: { resource },
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

function rateCardSchemaWithComputedMarginColumn(): AppSchema {
  const rateTable = rateCardSchema.tableViews.rateTable;

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
      aggregates: rateCardSchema.readModels?.aggregates ?? {},
    },
    tableViews: {
      ...rateCardSchema.tableViews,
      rateTable: {
        ...rateTable,
        columns: [
          ...rateTable.columns,
          {
            type: "computed",
            computedValue: "rateMargin",
            label: "Margin",
            align: "end",
            width: "sm",
            format: "percent",
          },
        ],
      },
    },
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

function fieldEditorCharacterizationRecord(): StoredRecord {
  return {
    id: "record-editor-case-1",
    entity: "editorCase",
    values: {
      title: "Plain title",
      summary: "Long summary",
      body: "# Heading\n\nMarkdown body",
      color: "#336699",
      href: "https://example.com",
      slug: "field-editor-case",
      icon: "sparkles",
      publishedAt: "2026-05-06",
      count: 1200,
      status: "published",
      resource: "resource-1",
    },
    createdAt: "2026-05-05T00:00:50.000Z",
    updatedAt: "2026-05-05T00:00:50.000Z",
  };
}

function taskEntityWithKindEnum(): EntitySchema {
  return {
    label: "Task",
    fields: {
      kind: {
        type: "enum",
        required: true,
        label: "Kind",
        default: "role",
        values: {
          role: { label: "Role" },
          stream: { label: "Stream" },
        },
      },
    },
  };
}

function taskEntityWithMarkdownBody(): EntitySchema {
  return {
    label: "Task",
    fields: {
      body: {
        type: "text",
        required: false,
        label: "Body",
        format: "markdown",
      },
    },
  };
}

function rateEntity(): EntitySchema {
  return {
    label: "Rate",
    fields: {
      resource: {
        type: "reference",
        required: true,
        label: "Resource",
        to: "resource",
        displayField: "name",
      },
    },
  };
}

function taskEntityWithEstimateNumber(): EntitySchema {
  return {
    label: "Task",
    fields: {
      estimate: {
        type: "number",
        required: false,
        label: "Estimate",
        min: 0,
        max: 10,
        integer: true,
      },
    },
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

function fieldEditorCharacterizationEntity(): EntitySchema {
  return {
    label: "Editor case",
    fields: {
      title: { type: "text", required: true, label: "Title" },
      summary: { type: "text", required: false, label: "Summary", format: "longText" },
      body: { type: "text", required: false, label: "Body", format: "markdown" },
      color: { type: "text", required: false, label: "Color", format: "color" },
      href: { type: "text", required: false, label: "Link", format: "href" },
      slug: { type: "text", required: false, label: "Slug", format: "slug" },
      icon: { type: "text", required: false, label: "Icon", format: "icon" },
      publishedAt: { type: "date", required: false, label: "Published at" },
      count: { type: "number", required: false, label: "Count", min: 0 },
      status: {
        type: "enum",
        required: false,
        label: "Status",
        values: {
          draft: { label: "Draft" },
          published: { label: "Published" },
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

function inputWithNameAndType(name: string, type: string) {
  return new RegExp(`<input(?=[^>]*name="${name}")(?=[^>]*type="${type}")[^>]*>`);
}

function inputWithAriaLabelAndType(label: string, type: string) {
  return new RegExp(`<input(?=[^>]*aria-label="${label}")(?=[^>]*type="${type}")[^>]*>`);
}

function expectFormattedNumberInputLabel(html: string, label: string) {
  const labelMatch = html.match(
    new RegExp(`<label[^>]*for="([^"]+)"[^>]*>${escapeRegExp(label)}</label>`),
  );

  expect(labelMatch).not.toBeNull();

  const id = labelMatch?.[1] ?? "";

  expect(html).toMatch(
    new RegExp(
      `<input(?=[^>]*id="${escapeRegExp(id)}")(?=[^>]*data-web-formatted-number-input="true")[^>]*>`,
    ),
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textareaWithName(name: string) {
  return new RegExp(`<textarea(?=[^>]*name="${name}")[^>]*>`);
}

function textareaWithAriaLabel(label: string) {
  return new RegExp(`<textarea(?=[^>]*aria-label="${label}")[^>]*>`);
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
