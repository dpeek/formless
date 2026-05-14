import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { Router } from "wouter";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { App } from "./app.tsx";
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
import { EditViewFields } from "./app/generated/table-actions.tsx";
import { RecordTree } from "./app/generated/tree.tsx";
import {
  SitePageRoute,
  SitePageRouteView,
  startSitePageRouteSession,
  type SitePageRouteState,
} from "./app/routes/site-page.tsx";
import { SitePageRenderer } from "./app/site-renderer/renderer.tsx";
import {
  applyBootstrapResponse,
  applyRecordMerge,
  getClientStoreSnapshot,
  resetClientStore,
} from "./client/store.ts";
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
import { SchemaRoute } from "./app/routes/schema.tsx";
import { buildSitePageTree } from "./site/tree.ts";
import {
  createDevRuntimeProfile,
  createAppRuntimeProfile,
  createPublishedSiteRuntimeProfile,
  type RuntimeProfile,
} from "./app/runtime-profile.ts";
import {
  selectCollectionModels,
  selectPrimaryCollectionModels,
  selectScreenModels,
  type CreateFieldConfig,
  type EditViewConfig,
  type HomeActionConfig,
  type HomeScreenModel,
  type HomeQueryTabConfig,
  type HomeViewModel,
  type RecordFieldConfig,
  type ResultOrderingConfig,
  type TableColumnConfig,
  type TableOrderingConfig,
} from "./client/views.ts";
import type { BootstrapResponse, StoredRecord } from "./shared/protocol.ts";
import type { SitePageTree } from "./shared/protocol.ts";
import type { SchemaKey } from "./shared/schema-apps.ts";
import { parseAppSchema, type AppSchema, type EntitySchema } from "./shared/schema.ts";
import type { NumericExpression } from "./shared/read-model.ts";
import {
  rateSeedRecords as rateCardSeedRecords,
  rateSourceSchema as rateCardSchema,
  siteSeedRecords,
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

function renderRoute(path: string, runtimeProfile?: RuntimeProfile) {
  return renderToStaticMarkup(
    <Router ssrPath={path}>
      <App
        routeComponents={{ HomeRoute, SchemaRoute, SitePageRoute }}
        runtimeProfile={runtimeProfile ?? createDevRuntimeProfile()}
      />
    </Router>,
  );
}

function SchemaKeyProbeHomeRoute({
  schemaKey: routeSchemaKey,
}: {
  schemaKey: SchemaKey;
  screenPath: string;
}) {
  const contextSchemaKey = useSchemaKey();

  return (
    <main data-route-schema-key={routeSchemaKey} data-schema-key={contextSchemaKey}>
      Schema key {contextSchemaKey}
    </main>
  );
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
): StoredRecord {
  return {
    id,
    entity: "blockPlacement",
    values: {
      parent,
      block,
      order,
    },
    createdAt: "2026-05-05T00:00:40.000Z",
  };
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

function expectWorkbenchToolbar(html: string, schemaRoute: string, schemaKey: string) {
  expect(html).toContain('data-frame="workbench-toolbar"');
  expect(html).toContain("bg-background pb-[var(--workbench-toolbar-height)] text-foreground");
  expect(html).toContain(`href="${schemaRoute}"`);
  expect(html).toContain('aria-label="Workbench actions"');
  expect(html).toContain("Export");
  expect(html).toContain("Restore");
  expect(html).toContain("Reset");
  expect(html).toContain('type="file"');
  expect(html).toContain(`aria-label="Sync status details for ${schemaKey}"`);
  expect(html).not.toContain("data-workbench-tools");
  expect(html).not.toContain("Tools");
  expect(html).not.toContain("Dev profile");
}

function expectSyncStatusControl(html: string, schemaKey: string) {
  expect(html).toContain("data-sync-status-control");
  expect(html).toContain(`aria-label="Sync status details for ${schemaKey}"`);
  expect(html).toContain(`<code>${schemaKey}</code>`);
  expect(html).toContain("Push sync");
  expect(html).toContain("Cursor");
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
  it('renders the "/tasks" route with task navigation', () => {
    const html = renderRoute("/tasks");

    expect(html).toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="generated-app"');
    expect(html).toContain('aria-label="Workbench apps"');
    expect(html).toContain('href="/tasks"');
    expect(html).toContain("Tasks");
    expect(html).toContain('href="/estii"');
    expect(html).toContain("Estii");
    expect(html).toContain('href="/site"');
    expect(html).toContain("Site");
    expectWorkbenchToolbar(html, "/tasks/schema", "tasks");
    expect(html).toContain('aria-label="Tasks screens"');
    expect(html).toContain("Loading Tasks...");
    expect(html).not.toContain("Create Task");
  });

  it('renders the "/estii" route with Estii navigation', () => {
    const html = renderRoute("/estii");

    expect(html).toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="generated-app"');
    expect(html).toContain('aria-label="Workbench apps"');
    expect(html).toContain('href="/tasks"');
    expect(html).toContain("Tasks");
    expect(html).toContain('href="/estii"');
    expect(html).toContain("Estii");
    expect(html).toContain('href="/site"');
    expect(html).toContain("Site");
    expectWorkbenchToolbar(html, "/estii/schema", "estii");
    expect(html).toContain('aria-label="Estii screens"');
    expect(html).toContain("Loading Estii...");
    expect(html).not.toContain("Create Resource");
  });

  it('renders the "/site" route with site navigation', () => {
    const html = renderRoute("/site");

    expect(html).toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="generated-app"');
    expect(html).toContain('aria-label="Workbench apps"');
    expect(html).toContain('href="/tasks"');
    expect(html).toContain("Tasks");
    expect(html).toContain('href="/estii"');
    expect(html).toContain("Estii");
    expect(html).toContain('href="/site"');
    expect(html).toContain("Site");
    expectWorkbenchToolbar(html, "/site/schema", "site");
    expectSyncStatusControl(html, "site");
    expect(html).toContain('aria-label="Site screens"');
    expect(html).toContain("Loading Site...");
    expect(html).not.toContain("Create Content item");
  });

  it("renders sync details in workbench chrome instead of generated page content", () => {
    applyBootstrapResponse(bootstrap(siteSeedRecords, siteSourceSchema), "site");
    const html = renderRoute("/site");

    expectSyncStatusControl(html, "site");
    expect(html).toContain("Sync details");
    expect(html).toContain("Schema</dt><dd>v1</dd>");
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
    expect(html).toContain("text-red-200");
  });

  it("provides the route schema key through the generated app frame", () => {
    const html = renderToStaticMarkup(
      <Router ssrPath="/site">
        <App
          routeComponents={{
            HomeRoute: SchemaKeyProbeHomeRoute,
            SchemaRoute,
            SitePageRoute,
          }}
          runtimeProfile={createDevRuntimeProfile()}
        />
      </Router>,
    );

    expect(html).toContain('data-schema-key="site"');
    expect(html).not.toContain('data-schema-key="tasks"');
  });

  it('renders the "/tasks/schema" route', () => {
    applyBootstrapResponse(bootstrap([], appSchema), "tasks");
    const html = renderRoute("/tasks/schema");

    expect(html).toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="workbench-tool"');
    expect(html).not.toContain('data-frame="generated-app"');
    expect(html).toContain('aria-label="Workbench apps"');
    expectWorkbenchToolbar(html, "/tasks/schema", "tasks");
    expect(html).not.toContain('aria-label="Tasks screens"');
    expect(html).toContain("Tasks Schema");
    expect(html).toContain("<code>tasks</code>");
    expect(html).not.toContain('aria-label="Tasks route reset controls"');
    expect(html).not.toContain('aria-label="Tasks source reset controls"');
    expect(html).toContain("Save schema");
    expect(html).not.toContain("Reset schema and seed data");
    expect(html).not.toContain('aria-label="Tasks store snapshot controls"');
    expect(html).not.toContain("Export store snapshot");
    expect(html).not.toContain("Tasks snapshot file");
    expect(html).not.toContain("Restore store snapshot");
    expect(html).not.toContain("Reset source schema");
    expect(html).toContain("&quot;screens&quot;");
    expect(html).toContain("&quot;task&quot;");
    expect(html).not.toContain("<code>rates</code>");
    expect(html).not.toContain("<code>estii</code>");
  });

  it('renders the "/estii/schema" route', () => {
    applyBootstrapResponse(bootstrap([], rateCardSchema), "estii");
    const html = renderRoute("/estii/schema");

    expect(html).toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="workbench-tool"');
    expect(html).not.toContain('data-frame="generated-app"');
    expect(html).toContain('aria-label="Workbench apps"');
    expectWorkbenchToolbar(html, "/estii/schema", "estii");
    expect(html).not.toContain('aria-label="Estii screens"');
    expect(html).not.toContain('href="/estii/setup"');
    expect(html).toContain("Estii Schema");
    expect(html).toContain("<code>estii</code>");
    expect(html).not.toContain('aria-label="Estii route reset controls"');
    expect(html).not.toContain('aria-label="Estii source reset controls"');
    expect(html).toContain("Save schema");
    expect(html).not.toContain("Reset schema and seed data");
    expect(html).not.toContain('aria-label="Estii store snapshot controls"');
    expect(html).not.toContain("Export store snapshot");
    expect(html).not.toContain("Estii snapshot file");
    expect(html).not.toContain("Restore store snapshot");
    expect(html).not.toContain("Reset source schema");
    expect(html).toContain("&quot;rateSetup&quot;");
    expect(html).toContain("&quot;rate&quot;");
    expect(html).toContain("&quot;resource&quot;");
    expect(html).not.toContain("<code>tasks</code>");
    expect(html).not.toContain("<code>rates</code>");
  });

  it('renders the "/site/schema" route', () => {
    applyBootstrapResponse(bootstrap([], siteSourceSchema), "site");
    const html = renderRoute("/site/schema");

    expect(html).toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="workbench-tool"');
    expect(html).not.toContain('data-frame="generated-app"');
    expect(html).toContain('aria-label="Workbench apps"');
    expectWorkbenchToolbar(html, "/site/schema", "site");
    expect(html).not.toContain('aria-label="Site screens"');
    expect(html).not.toContain('href="/site/header"');
    expect(html).not.toContain('href="/site/footer"');
    expect(html).toContain("Site Schema");
    expect(html).toContain("<code>site</code>");
    expect(html).not.toContain('aria-label="Site route reset controls"');
    expect(html).not.toContain('aria-label="Site source reset controls"');
    expect(html).toContain("Save schema");
    expect(html).not.toContain("Reset schema and seed data");
    expect(html).not.toContain('aria-label="Site store snapshot controls"');
    expect(html).not.toContain("Export store snapshot");
    expect(html).not.toContain("Site snapshot file");
    expect(html).not.toContain("Restore store snapshot");
    expect(html).not.toContain("Reset source schema");
    expect(html).toContain("&quot;siteEditor&quot;");
    expect(html).toContain("&quot;siteCompositionHome&quot;");
    expect(html).toContain("&quot;blockSiteRoots&quot;");
    expect(html).not.toContain("&quot;siteHeader&quot;");
    expect(html).not.toContain("&quot;siteFooter&quot;");
    expect(html).toContain("&quot;block&quot;");
    expect(html).toContain("&quot;blockPlacement&quot;");
    expect(html).not.toContain("<code>tasks</code>");
    expect(html).not.toContain("<code>rates</code>");
    expect(html).not.toContain("<code>estii</code>");
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

  it("renders a published Site profile slug path outside generated admin navigation", () => {
    const html = renderRoute("/projects/estii", createPublishedSiteRuntimeProfile());

    expect(html).toContain("Loading site page...");
    expect(html).toContain("Loading projects/estii.");
    expect(html).not.toContain('data-frame="workbench"');
    expect(html).not.toContain('data-frame="generated-app"');
    expect(html).not.toContain('href="/tasks"');
    expect(html).not.toContain('href="/site/schema"');
  });

  it('renders an app profile home at "/" without the multi-app switcher', () => {
    applyBootstrapResponse(bootstrap(rateCardSeedRecords, rateCardSchema), "estii");
    const html = renderRoute("/", createAppRuntimeProfile("estii"));

    expect(html).not.toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="generated-app"');
    expectSyncStatusControl(html, "estii");
    expectGeneratedAppChromeLabels(html, { appTitle: "Estii", screenTitle: "Rates" });
    expect(html).toContain(">Rates</h1>");
    expect(html).toContain('aria-label="Estii screens"');
    expect(html).toContain('href="/setup"');
    expect(html).not.toContain('href="/schema"');
    expect(html).not.toContain('href="/tasks"');
    expect(html).not.toContain('href="/site"');
    expect(html).not.toContain('href="/estii"');
    expect(html).not.toContain('href="/estii/schema"');
  });

  it("renders an app profile screen path without the schema key prefix", () => {
    applyBootstrapResponse(bootstrap(rateCardSeedRecords, rateCardSchema), "estii");
    const html = renderRoute("/setup", createAppRuntimeProfile("estii"));

    expectGeneratedAppChromeLabels(html, { appTitle: "Estii", screenTitle: "Setup" });
    expect(html).toContain(">Setup</h1>");
    expect(html).toContain('aria-label="Estii screens"');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/setup"');
    expect(html).not.toContain('href="/schema"');
    expect(html).toContain(">Rate cards</h2>");
    expect(html).toContain(">Resources</h2>");
    expect(html).not.toContain('href="/estii/setup"');
  });

  it('renders an app profile schema editor at "/schema" with the selected schema key', () => {
    applyBootstrapResponse(bootstrap(rateCardSeedRecords, rateCardSchema), "estii");
    const html = renderRoute("/schema", createAppRuntimeProfile("estii"));

    expect(html).not.toContain('data-frame="workbench"');
    expect(html).toContain('data-frame="generated-app"');
    expect(html).toContain("Estii Schema");
    expect(html).toContain("<code>estii</code>");
    expect(html).toContain('href="/setup"');
    expect(html).not.toContain('href="/schema"');
    expect(html).not.toContain('aria-label="Estii route reset controls"');
    expect(html).not.toContain("Reset schema and seed data");
    expect(html).not.toContain('href="/tasks"');
    expect(html).not.toContain('href="/site"');
    expect(html).not.toContain('href="/estii/schema"');
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
    expect(linkHtml(homeHtml, "/pages/home")).toContain("decoration-dashed");
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
    expect(html).toContain('href="/projects/estii"');
    expect(html).not.toContain('href="/pages/home"');
    expect(html).not.toContain('href="/pages/blog"');
  });

  it("renders the same published app shell markup from SSR and hydrated route state", () => {
    const tree = sitePageTree("home");
    const ReadySitePageRoute = ({
      linkMode = "preview",
    }: {
      linkMode?: "preview" | "published";
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
          routeComponents={{
            HomeRoute,
            SchemaRoute,
            SitePageRoute: ReadySitePageRoute,
          }}
          runtimeProfile={createPublishedSiteRuntimeProfile()}
        />
      </Router>,
    );

    expect(hydratedAppHtml).toBe(ssrHtml);
  });

  it("renders seeded post and project summaries from groups", () => {
    const html = renderSitePage("home");

    expect(html).toContain("Recent posts");
    expect(html).toContain("Shipping schema-backed authoring");
    expect(html).toContain("Draft notes on generated editorial tools");
    expect(html).toContain("Featured projects");
    expect(html).toContain("Estii");
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
            "rec_site_place_projects_estii",
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
    expect(projectsHtml).toContain("Estii");
    expect(projectCardHtml).toContain('data-site-summary-link="project"');
    expect(projectCardHtml).toContain("absolute inset-0");
    expect(projectsHtml.indexOf("OpenSurf")).toBeLessThan(projectsHtml.indexOf("Formless"));
    expect(projectsHtml.indexOf("Formless")).toBeLessThan(projectsHtml.indexOf("Estii"));
    expect(projectsHtml).not.toContain("2026-05-08");
    expect(projectsHtml).not.toContain("2026-05-03");
    expect(projectsHtml).not.toContain("2026-05-01");
  });

  it("renders /projects as manually placed project summaries with markdown bodies", () => {
    const html = renderSitePage("projects");
    const main = mainHtml(html);

    expect(main).not.toContain("Projects");
    expect(main).not.toContain("Current and recent product work");
    expect(html).toContain("Estii");
    expect(html).toContain("OpenSurf");
    expect(html).toContain("Formless");
    expect(html).toContain('href="/pages/projects/estii"');
    expect(html).toContain('href="/pages/projects/opensurf"');
    expect(html).toContain('href="/pages/projects/formless"');
    expect(main).not.toContain("2026-05-08");
    expect(main).not.toContain("2026-05-03");
    expect(main).not.toContain("2026-05-01");
    expect(html).toContain('data-web-markdown-renderer="server"');
    expect(html).toContain("operational assumptions");
    expect(html).toContain("<strong");
    expect(html).toContain('href="https://estii.com/"');
    expect(html).toContain(">pricing structures<");
    expect(html).not.toContain("**operational assumptions**");
    expect(html).not.toContain("[pricing structures](https://estii.com)");
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

  it("renders public markdown block bodies with the shared markdown renderer", () => {
    const records: StoredRecord[] = [
      ...testSiteSeedRecords,
      {
        id: "rec_site_content_home_markdown",
        entity: "block",
        values: {
          type: "markdown",
          label: "Intro markdown",
          body: "I co-founded [estii.com](https://estii.com) and **OpenSurf**.",
        },
        createdAt: "2026-05-05T00:00:32.000Z",
      },
      {
        id: "rec_site_place_home_markdown",
        entity: "blockPlacement",
        values: {
          parent: "rec_site_content_home",
          block: "rec_site_content_home_markdown",
          order: 1500,
        },
        createdAt: "2026-05-05T00:00:33.000Z",
      },
    ];
    const html = renderSitePage("home", records);

    expect(html).toContain('data-web-markdown-renderer="server"');
    expect(html).toContain('href="https://estii.com/"');
    expect(html).toContain(">estii.com<");
    expect(html).toContain("<strong");
    expect(html).not.toContain("[estii.com](https://estii.com)");
    expect(html).not.toContain("**OpenSurf**");
  });

  it("renders image media blocks from uploaded and external href metadata", () => {
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
                  href: "/api/site/media/site/images/cover.webp",
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
            ],
          },
        }}
      />,
    );

    expect(html).toContain("Site owner portrait");
    expect(html).toContain('alt="Site owner portrait"');
    expect(html).toContain('src="/api/site/media/site/images/cover.webp"');
    expect(html).toContain('alt="External reference"');
    expect(html).toContain('src="https://example.com/manual.png"');
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
      },
      {
        id: "rec_site_place_footer_copyright",
        entity: "blockPlacement",
        values: {
          parent: "rec_site_content_group_footer",
          block: "rec_site_content_footer_copyright",
          order: 3000,
        },
        createdAt: "2026-05-05T00:00:33.000Z",
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
    expect(html).toContain('aria-label="Task actions"');
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
    expect(html).toContain('aria-label="Task actions"');
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
    expect(html).toContain('aria-label="Pages roots"');
    expect(html).toContain('aria-label="Posts roots"');
    expect(html).toContain('aria-label="Projects roots"');
    expect(html).toContain('aria-label="Navigation roots"');
    expect(html).toContain('aria-label="Create Post"');
    expect(html).toContain('aria-label="Create Project"');
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
    expect(html).not.toContain('data-slot="table"');
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
        entity: "blockPlacement",
        values: {
          parent: "page-1",
          block: "link-1",
          label: "Placement label",
          order: 1000,
        },
        createdAt: "2026-05-05T00:00:40.000Z",
      },
      {
        id: "placement-2",
        entity: "blockPlacement",
        values: {
          parent: "page-1",
          block: "link-2",
          label: "External placement label",
          order: 2000,
        },
        createdAt: "2026-05-05T00:00:41.000Z",
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
      'data-formless-tree-add-variants="group hero markdown image link project postList projectList"',
    );
    expect(emptyRootHtml).toContain('aria-label="Add child"');
    expect(emptyRootHtml).toContain('data-formless-tree-add-trigger="page-1"');

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
    expect(postRootHtml).toContain('data-formless-tree-add-variants="markdown"');

    resetClientStore();
    bootstrapSiteEditor([
      siteBlockRecord("page-1", { type: "page", label: "Tree root" }),
      siteBlockRecord("group-1", { type: "group", label: "Empty group" }),
      siteBlockRecord("link-1", { type: "link", label: "Docs", href: "/docs" }),
      {
        id: "placement-1",
        entity: "blockPlacement",
        values: {
          parent: "page-1",
          block: "group-1",
          order: 1000,
        },
        createdAt: "2026-05-05T00:00:40.000Z",
      },
      {
        id: "placement-2",
        entity: "blockPlacement",
        values: {
          parent: "page-1",
          block: "link-1",
          order: 2000,
        },
        createdAt: "2026-05-05T00:00:41.000Z",
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
    expect(nestedHtml).not.toContain('data-formless-tree-add-parent="link-1"');
    expect(nestedHtml).toContain('data-formless-tree-remove-placement="placement-1"');
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
    expect(enabledHtml).toContain('data-slot="alert-dialog-trigger"');
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
    expect(disabledHtml).not.toContain('data-formless-tree-delete-child="block-1"');
    expect(enabledHtml).toContain('data-formless-tree-remove-placement="placement-1"');
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

  it("labels generated placement action rows from the active entity", () => {
    const collection = requiredSiteCollectionModel("pageCompositionHome");

    bootstrapSiteEditor();
    const html = renderGeneratedHomeCollection(collection, {
      selectedContextRecordId: "rec_site_content_home",
      today: "2026-05-05",
    });

    expect(html).toContain('aria-label="Placement actions"');
    expect(html).not.toContain('aria-label="Task actions"');
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

    expect(html).toMatch(/aria-label="All count"[^>]*>3</);
    expect(html).toMatch(/aria-label="Active count"[^>]*>2</);
    expect(html).toMatch(/aria-label="Completed count"[^>]*>1</);
    expect(html).toMatch(/aria-label="Overdue count"[^>]*>1</);
  });

  it("renders the selected list through the shared task item view", () => {
    const task = appSchema.entities.task;
    const model = selectPrimaryCollectionModels(appSchema)[0];
    const record: StoredRecord = taskRecord("record-1", "First", true, "2026-05-01");

    applyBootstrapResponse(bootstrap([record]));
    const html = renderToStaticMarkup(
      <RecordList
        entity={task}
        entityName="task"
        query={{ kind: "all" }}
        recordFields={model?.result.type === "list" ? model.result.recordFields : []}
      />,
    );

    expect(html).toContain("First");
    expect(html).toContain('type="text"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
    expect(html).toContain('type="date"');
    expect(html).toContain("2026-05-01");
    expect(html).toContain('aria-label="Due date"');
    expect(html).toContain('data-web-formatted-number-input="true"');
    expect(html).toContain('aria-label="Estimate"');
    expect(html).not.toContain(record.createdAt);
  });

  it("sorts generated list rows by result ordering and renders drag handles", () => {
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
    expect(html).toContain('data-formless-sortable-list-item="record-1"');
    expect(html.match(/data-formless-ordering-handle="true"/g) ?? []).toHaveLength(3);
  });

  it("renders clear-completed target count and keeps the button enabled at zero", () => {
    applyBootstrapResponse(bootstrap([]));
    const html = renderRoute("/tasks");

    expect(html).toMatch(/aria-label="Clear completed target count"[^>]*>0</);
    expect(html).toContain("Clear completed");
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>[^<]*Clear completed/);
  });

  it("updates action target counts after local record merges", () => {
    applyBootstrapResponse(bootstrap([taskRecord("record-1", "Open", false)]));
    const before = renderRoute("/tasks");

    applyRecordMerge([taskRecord("record-2", "Finished", true)], 2);
    const after = renderRoute("/tasks");

    expect(before).toMatch(/aria-label="Clear completed target count"[^>]*>0</);
    expect(after).toMatch(/aria-label="Clear completed target count"[^>]*>1</);
  });

  it("renders seeded task records with useful query and action counts", () => {
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
      screenTitle: "Site",
      allowSidebarGroupLabel: true,
    });
    expect(html).toContain("<h1");
    expect(html).toContain(">Site</h1>");
    expect(html).toContain('aria-label="Pages roots"');
    expect(html).toContain('aria-label="Posts roots"');
    expect(html).toContain('aria-label="Projects roots"');
    expect(html).toContain('aria-label="Navigation roots"');
    expect(html).not.toContain('aria-label="Site screens"');
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
    expect(html).not.toContain('data-slot="table"');
    expect(html).toContain('data-web-autosize-text-input="true"');
    expect(html).toContain("h-9 w-full text-2xl font-semibold");
    expect(html).toContain('data-web-markdown-editor="plate"');
    expect(html).toContain('aria-label="Body"');
    expect(html).not.toContain(">Home</h2>");
    expect(html).toContain("Home");
    expect(html).toContain("Blog");
    expect(html).toContain("Resume");
    expect(html).toContain("Projects");
    expect(html).not.toContain("A concise personal site for current work");
    expect(html).toContain("Schema-backed software for content-heavy products");
    expect(html).toContain("Site owner portrait");
    expect(html).toMatch(/aria-label="Home Placements count"[^>]*>3</);
  });

  it("renders the site route with root sidebar navigation", () => {
    bootstrapSiteEditor();
    const html = renderRoute("/site");

    expect(html).toContain("<h1");
    expect(html).toContain(">Site</h1>");
    expect(html).toContain('aria-label="Pages roots"');
    expect(html).toContain('aria-label="Posts roots"');
    expect(html).toContain('aria-label="Projects roots"');
    expect(html).toContain('aria-label="Navigation roots"');
    expect(html).not.toContain('aria-label="Site screens"');
    expect(html).not.toContain('href="/site/navigation"');
    expect(html).not.toContain('href="/site/header"');
    expect(html).not.toContain('href="/site/footer"');
    expect(html).toContain("Pages");
    expect(html).toContain("Posts");
    expect(html).toContain("Projects");
    expect(html).toContain("Navigation");
    expect(html).toContain('aria-label="Create Post"');
    expect(html).toContain('aria-label="Create Project"');
    expect(html).toContain('aria-label="Site roots list detail"');
    expect(html).toContain("Home");
    expect(html).toContain('aria-label="Placement tree"');
    expect(html).not.toContain("Add placement");
    expect(html).not.toContain('data-slot="table"');
    expect(html).not.toContain('aria-label="Collections"');
    expect(html).not.toContain(">Blocks</h1>");
  });

  it("does not route site navigation as a separate top-level screen", () => {
    applyBootstrapResponse(bootstrap(siteSeedRecords, siteSourceSchema), "site");

    expect(renderRoute("/site/navigation")).toContain("Not found");
  });

  it("does not route site header and footer as top-level screens", () => {
    applyBootstrapResponse(bootstrap(siteSeedRecords, siteSourceSchema), "site");

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
    };

    const html = renderRecordTableHtml({
      columns: contentTable.columns,
      entity: contentTable.entity,
      entityName: contentTable.entityName,
      records: [incompletePost],
      schema: siteSourceSchema,
      schemaKey: "site",
    });

    expect(html).toContain('aria-label="Readiness warnings"');
    expect(html).toContain("Post block should have a link.");
    expect(html).toContain("Post block should include body content.");
    expect(html).toContain("Post without metadata");
    expect(html).toMatch(/<textarea[^>]*aria-label="Body"/);
    expect(html).not.toMatch(/aria-label="Body"[^>]*disabled/);
  });

  it("renders the scoped site composition workspace for selected content", () => {
    const compositionModel = requiredSiteCollectionModel("blockCompositionHome");

    bootstrapSiteEditor();
    const html = renderGeneratedHomeCollection(compositionModel, {
      selectedContextRecordId: "rec_site_content_home",
      today: "2026-05-05",
    });

    expect(html).toContain('aria-label="Block records"');
    expect(html).toContain('data-slot="tabs-list"');
    expect(html).toContain('data-slot="tabs-trigger"');
    expect(html).toContain("Home");
    expect(html).toMatch(/aria-label="Home Placements count"[^>]*>3</);
    expect(html).toContain("Add placement");
    expect(html).not.toContain('value="rec_site_content_group_header" selected="">Header</option>');
    expect(html).not.toContain('value="rec_site_content_group_footer" selected="">Footer</option>');
    expect(html).toContain("Schema-backed software for content-heavy products");
    expect(html).toContain(
      'value="rec_site_block_home_recent_posts" selected="">Recent posts</option>',
    );
    for (const removedType of ["contentList", "contentGrid", "video", "file", "cta", "subscribe"]) {
      expect(html).not.toContain(`value="${removedType}"`);
    }
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
    applyBootstrapResponse(bootstrap(rateCardSeedRecords, rateCardSchema));
    const html = renderRoute("/estii");

    expect(html).not.toContain('aria-label="Collections"');
    expect(html).toContain('aria-label="Estii screens"');
    expect(html).toContain('href="/estii/setup"');
    expect(html).toContain("Rates");
    expect(html).toContain("Create Resource");
    expect(html).not.toContain("Regenerate missing rates");
    expect(html).not.toMatch(/<button[^>]*>Create Rate<\/button>/);
  });

  it("routes Estii setup through the setup screen path", () => {
    applyBootstrapResponse(bootstrap(rateCardSeedRecords, rateCardSchema), "estii");
    const html = renderRoute("/estii/setup");

    expect(html).toContain(">Setup</h1>");
    expect(html).toContain('aria-label="Estii screens"');
    expect(html).toContain('href="/estii"');
    expect(html).toContain('href="/estii/setup"');
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

  it("keeps collection actions below the current generated table result", () => {
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
    const actionRowIndex = html.indexOf('aria-label="Rate actions"');

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
    expect(html).not.toContain('data-slot="tabs-list"');
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

  it("keeps list/detail query counts and scoped create actions tied to context", () => {
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

    expect(selectedHtml).toContain('data-slot="tabs-list"');
    expect(selectedHtml).toMatch(/aria-label="Selected card count"[^>]*>1</);
    expect(selectedHtml).toMatch(/aria-label="Selected card again count"[^>]*>1</);
    expect(selectedHtml).toMatch(/<button[^>]*>Create Rate<\/button>/);
    expect(selectedHtml).not.toMatch(/<button[^>]*disabled=""[^>]*>Create Rate<\/button>/);

    const rateCreateAction = rateModel.actions.find(
      (action) => action.type === "create" && action.entityName === "rate",
    );

    if (!rateCreateAction || rateCreateAction.type !== "create") {
      throw new Error("Missing scoped rate create action.");
    }

    const rateFormData = new FormData();
    rateFormData.set("resource", "resource-1");
    rateFormData.set("cost", "325");
    rateFormData.set("costUnit", "day");
    rateFormData.set("price", "475");

    expect(
      resolveCreateValues(rateFormData, rateCreateAction, {
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
    expect(html).toContain('aria-label="Average cost"');
    expect(html).toContain("$387.50");
    expect(html).toContain('aria-label="Average price"');
    expect(html).toContain("$537.50");
    expect(html).toContain('aria-label="Average margin"');
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

  it("keeps the resource create action enabled without a selected card", () => {
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
    const action = createAction(task, ["title", "done", "dueDate"]);
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={action} renderDialogCancel={false} />,
    );

    expect(html).toContain("Create Task");
    expect(html).toContain('name="title"');
    expect(html).toContain('name="done"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('name="dueDate"');
    expect(html).toContain("Due date");
    expect(html).toContain("Cancel");
  });

  it("renders enum create controls with option labels", () => {
    const task = taskEntityWithKindEnum();
    const action = createAction(task, ["kind"]);
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={action} renderDialogCancel={false} />,
    );

    expect(html).toContain('name="kind"');
    expect(html).toContain("<select");
    expect(html).toContain("Role");
    expect(html).toContain("Stream");
  });

  it("renders create fields for the active union discriminator", () => {
    const roleAction = requiredCreateAction(generatedDiscriminatedTaskSchema(), "taskHome");
    const streamAction = requiredCreateAction(
      generatedDiscriminatedTaskSchema({ defaultKind: "stream" }),
      "taskHome",
    );
    const roleHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={roleAction} renderDialogCancel={false} />,
    );
    const streamHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={streamAction} renderDialogCancel={false} />,
    );

    expect(roleHtml).toContain('name="kind"');
    expect(roleHtml).toContain('name="title"');
    expect(roleHtml).not.toContain('name="done"');
    expect(streamHtml).toContain('name="kind"');
    expect(streamHtml).toContain('name="done"');
    expect(streamHtml).not.toContain('name="title"');
  });

  it("renders fixed-discriminator create fields from literal defaults", () => {
    const action = requiredCreateAction(
      generatedDiscriminatedTaskSchema({ fixedCreateKind: "stream" }),
      "taskHome",
    );
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={action} renderDialogCancel={false} />,
    );
    const formData = new FormData();
    formData.set("done", "on");

    expect(html).not.toContain('name="kind"');
    expect(html).toContain('name="done"');
    expect(html).not.toContain('name="title"');
    expect(resolveCreateValues(formData, action)).toEqual({
      done: true,
      kind: "stream",
    });
  });

  it("renders source site post and project root creates with fixed block types", () => {
    const postAction = requiredRootNavigationCreateAction("Posts");
    const projectAction = requiredRootNavigationCreateAction("Projects");
    const postHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={postAction} renderDialogCancel={false} />,
    );
    const projectHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={projectAction} renderDialogCancel={false} />,
    );
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
    expect(resolveCreateValues(postFormData, postAction)).toEqual({
      label: "A focused post",
      href: "/blog/focused-post",
      date: "2026-05-14",
      body: "A short **summary**.",
      type: "post",
    });
    expect(resolveCreateValues(projectFormData, projectAction)).toEqual({
      label: "Focused Project",
      href: "/projects/focused-project",
      date: "2026-05-13",
      body: "A short **summary**.",
      type: "project",
    });
  });

  it("renders source site link creates with mode-specific destination fields", () => {
    const baseAction = requiredCreateAction(siteSourceSchema, "blockHome");
    const typeField = siteSourceSchema.entities.block.fields.type;

    if (typeField.type !== "enum") {
      throw new Error("Site block type must be an enum field.");
    }

    const action = {
      ...baseAction,
      fields: baseAction.fields.filter((field) => field.fieldName !== "type"),
      defaults: [
        ...baseAction.defaults,
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
      <GeneratedCreateDialogForm action={action} renderDialogCancel={false} />,
    );

    expect(html).toContain('name="linkTargetMode"');
    expect(html).toContain('name="href"');
    expect(html).not.toContain('name="linkTargetBlock"');
    expect(resolveCreateValues(internalFormData, action)).toEqual({
      label: "Internal docs",
      linkTargetMode: "internal",
      linkTargetBlock: "rec_site_content_blog",
      icon: "book",
      type: "link",
    });
    expect(resolveCreateValues(externalFormData, action)).toEqual({
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
      <RecordList
        entity={task}
        entityName="task"
        query={{ kind: "all" }}
        recordFields={model.result.recordFields}
        recordUnion={model.result.recordUnion}
      />,
    );

    resetClientStore();
    applyBootstrapResponse(
      bootstrap([discriminatedTaskRecord("record-1", "stream", "Hidden title", true)], schema),
    );
    const streamHtml = renderToStaticMarkup(
      <RecordList
        entity={task}
        entityName="task"
        query={{ kind: "all" }}
        recordFields={model.result.recordFields}
        recordUnion={model.result.recordUnion}
      />,
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
    const taskPlacement = schema.entities.taskPlacement;
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

  it("renders markdown create controls as rich editors with hidden string inputs", () => {
    const task = taskEntityWithMarkdownBody();
    const action: Extract<HomeActionConfig, { type: "create" }> = {
      type: "create",
      label: "Create Task",
      entityName: "task",
      entity: task,
      fields: [
        {
          fieldName: "body",
          field: task.fields.body,
          editor: "markdown",
        },
      ],
      defaults: [],
      enabled: task.mutations.create.enabled,
    };
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={action} renderDialogCancel={false} />,
    );

    expect(html).toMatch(inputWithNameAndType("body", "hidden"));
    expect(html).toContain('data-web-markdown-editor="plate"');
    expect(html).toContain('aria-label="Body"');
    expect(html).toContain("Body");
  });

  it("renders markdown inline editors as rich editors outside compact contexts", () => {
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
        recordFields={recordFields}
      />,
    );

    expect(html).toContain('data-web-markdown-editor="plate"');
    expect(html).toContain('aria-label="Body"');
    expect(html).toContain("<h2");
    expect(html).toContain("Draft");
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
      <RecordTable columns={columns} entity={task} entityName="task" query={{ kind: "all" }} />,
    );

    expect(html).toContain('data-web-markdown-renderer="plate"');
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

    applyBootstrapResponse(bootstrap([enumRecord("legacy")]));
    const html = renderToStaticMarkup(
      <RecordList
        entity={task}
        entityName="task"
        query={{ kind: "all" }}
        recordFields={recordFields}
      />,
    );

    expect(html).toContain("legacy");
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
        columns={columns}
        entity={rateCardSchema.entities.rate}
        entityName="rate"
        query={{ kind: "all" }}
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
      <RecordTable columns={columns} entity={rate} entityName="rate" query={{ kind: "all" }} />,
    );

    expect(html).toContain("Designer");
    expect(html).toContain("Edit shared");
    expect(html).toContain('aria-label="Edit shared resource"');
  });

  it("renders table invokeAction columns as a button or dropdown", () => {
    const rate = rateCardSchema.entities.rate;
    const columns: TableColumnConfig[] = [
      {
        type: "invokeAction",
        key: "invokeAction:inspectRate",
        label: "",
        headerLabel: "Inspect rate",
        actions: [
          {
            type: "static",
            actionName: "inspectRate",
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
        type: "invokeAction",
        key: "invokeAction:inspectRate,blockedRate",
        label: "Rate actions",
        headerLabel: "Rate actions",
        actions: [
          {
            type: "static",
            actionName: "inspectRate",
            label: "Inspect rate",
            variant: "default",
            disabled: false,
          },
          {
            type: "static",
            actionName: "blockedRate",
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
      <RecordTable columns={columns} entity={rate} entityName="rate" query={{ kind: "all" }} />,
    );

    expect(html).toContain("Inspect rate");
    expect(html).toContain('aria-label="Inspect rate"');
    expect(html).toContain("Rate actions");
    expect(html).toContain('aria-label="Rate actions"');
    expect(html).toContain('data-slot="dropdown-menu-trigger"');
  });

  it("renders Site placement row action dropdowns", () => {
    const placementTable = requiredSiteTableModel("pageCompositionHome");
    const html = renderRecordTableHtml({
      columns: placementTable.columns,
      entity: placementTable.entity,
      entityName: placementTable.entityName,
      ordering: placementTable.ordering,
      records: siteSeedRecords,
      schema: siteSourceSchema,
      schemaKey: "site",
    });

    expect(html).toContain('aria-label="Actions"');
    expect(html).toContain('data-slot="dropdown-menu-trigger"');
    expect(html).toContain('aria-label="Reorder"');
    expect(html).toContain('data-formless-ordering-handle="true"');
    expect(html).toContain("data-formless-sortable-row=");
  });

  it("sorts generated table rows by ordering rank before rendering", () => {
    const blockPlacement = siteSourceSchema.entities.blockPlacement;
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

    const ordering: TableOrderingConfig = {
      fieldName: "order",
      field: orderField,
      scope: [{ kind: "field", fieldName: "parent", field: blockPlacement.fields.parent }],
      presentations: ["moveMenu"],
    };

    const html = renderRecordTableHtml({
      columns,
      entity: blockPlacement,
      entityName: "blockPlacement",
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
        columns={columns}
        entity={rateCardSchema.entities.rate}
        entityName="rate"
        query={{ kind: "all" }}
      />,
    );

    applyRecordMerge([resourceRecord("resource-1", "Principal designer")], 2);

    const after = renderToStaticMarkup(
      <RecordTable
        columns={columns}
        entity={rateCardSchema.entities.rate}
        entityName="rate"
        query={{ kind: "all" }}
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
        columns={columns}
        entity={rateCardSchema.entities.rate}
        entityName="rate"
        query={{ kind: "all" }}
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
      <RecordTable columns={columns} entity={rate} entityName="rate" query={{ kind: "all" }} />,
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
      <RecordTable columns={columns} entity={rate} entityName="rate" query={{ kind: "all" }} />,
    );

    applyRecordMerge([rateCardRateRecordWithCost("rate-1", "resource-1", "card-1", 250, 500)], 2);
    const after = renderToStaticMarkup(
      <RecordTable columns={columns} entity={rate} entityName="rate" query={{ kind: "all" }} />,
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
        columns={columns}
        entity={entity}
        entityName="editorCase"
        query={{ kind: "all" }}
      />,
    );

    expect(html).toContain('aria-label="Color color swatch"');
    expect(html).toContain("#336699");
    expect(html).toContain("not-a-color");
    expect(html).not.toContain('style="background-color:not-a-color"');
  });

  it("renders number create controls and inline editors with numeric constraints", () => {
    const task = taskEntityWithEstimateNumber();
    const action = createAction(task, ["estimate"]);
    const createHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={action} renderDialogCancel={false} />,
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
        recordFields={recordFields}
      />,
    );

    expect(createHtml).toMatch(inputWithNameAndType("estimate", "hidden"));
    expect(createHtml).toMatch(inputWithAriaLabelAndType("Estimate", "text"));
    expect(createHtml).toContain('data-web-formatted-number-input="true"');
    expect(createHtml).toContain('min="0"');
    expect(createHtml).toContain('max="10"');
    expect(createHtml).toContain('step="1"');
    expect(rowHtml).toContain('aria-label="Estimate"');
    expect(rowHtml).toContain('data-web-formatted-number-input="true"');
    expect(rowHtml).toMatch(inputWithAriaLabelAndType("Estimate", "text"));
    expect(rowHtml).toContain('value="3"');
  });

  it("renders formatted number table editors from column format metadata", () => {
    const entity: EntitySchema = {
      label: "Metric",
      fields: {
        price: { type: "number", required: true, label: "Price" },
        margin: { type: "number", required: true, label: "Margin" },
      },
      mutations: {
        create: { enabled: true },
        patch: { enabled: true },
        delete: { enabled: false },
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
    };

    applyBootstrapResponse(bootstrap([record]));
    const html = renderToStaticMarkup(
      <RecordTable columns={columns} entity={entity} entityName="metric" query={{ kind: "all" }} />,
    );

    expect(html.match(/data-web-formatted-number-input="true"/g)?.length).toBe(2);
    expect(html).toMatch(inputWithAriaLabelAndType("Price", "text"));
    expect(html).toMatch(inputWithAriaLabelAndType("Margin", "text"));
    expect(html).toContain('value="$475.00"');
    expect(html).toContain('value="12.5%"');
  });

  it("renders reference create controls with target display labels", () => {
    const rate = rateEntity();
    const action = createAction(rate, ["resource"], "rate");

    applyBootstrapResponse(
      bootstrap([resourceRecord("resource-1", "Designer"), resourceRecord("resource-2", "Lead")]),
    );
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={action} renderDialogCancel={false} />,
    );

    expect(html).toContain('name="resource"');
    expect(html).toContain("<select");
    expect(html).toContain('value="resource-1"');
    expect(html).toContain("Designer");
    expect(html).toContain("Lead");
  });

  it("renders generated create controls for current editor hints", () => {
    const entity = fieldEditorCharacterizationEntity();
    const action = fieldEditorCharacterizationCreateAction(entity);

    applyBootstrapResponse(bootstrap([resourceRecord("resource-1", "Designer")]));
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={action} renderDialogCancel={false} />,
    );

    expect(html).toMatch(inputWithNameAndType("title", "text"));
    expect(html).not.toContain('data-web-autosize-text-input="true"');
    expect(html).toMatch(textareaWithName("summary"));
    expect(html).toMatch(inputWithNameAndType("body", "hidden"));
    expect(html).toContain('data-web-markdown-editor="plate"');
    expect(html).toMatch(inputWithNameAndType("color", "hidden"));
    expect(html).toContain('aria-label="Choose Color"');
    expect(html).toMatch(inputWithAriaLabelAndType("Color", "text"));
    expect(html).toMatch(inputWithNameAndType("href", "text"));
    expect(html).toMatch(inputWithNameAndType("slug", "text"));
    expect(html).toMatch(textareaWithName("icon"));
    expect(html).toContain('data-web-field-kind="icon"');
    expect(html).toContain("data-web-svg-source");
    expect(html).toMatch(inputWithNameAndType("publishedAt", "date"));
    expect(html).toMatch(inputWithNameAndPlaceholder("publishedAt", "2026-05-06"));
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

    expect(resolveCreateValues(formData, action)).toMatchObject({
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
        recordFields={fieldEditorCharacterizationRecordFields(entity)}
      />,
    );

    expect(html).toMatch(inputWithAriaLabelAndType("Title", "text"));
    expect(html).toContain('data-web-autosize-text-input="true"');
    expect(html).toContain('value="Plain title"');
    expect(html).toMatch(textareaWithAriaLabel("Summary"));
    expect(html).toContain('data-web-markdown-editor="plate"');
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
    expect(html).not.toContain('value="sparkles"');
    expect(html).toMatch(inputWithAriaLabelAndType("Published at", "date"));
    expect(html).toContain('value="2026-05-06"');
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
        columns={columns}
        entity={entity}
        entityName="editorCase"
        query={{ kind: "all" }}
      />,
    );

    expect(html).toContain('data-web-svg-icon="svg"');
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).not.toContain("&lt;svg viewBox=&quot;0 0 24 24&quot;&gt;&lt;/svg&gt;");
    expect(html).not.toContain("data-web-svg-source");
  });

  it("renders compact text table editors as autosizing editable text", () => {
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
        columns={columns}
        entity={entity}
        entityName="editorCase"
        query={{ kind: "all" }}
      />,
    );

    expect(html).toContain('data-web-autosize-text-input="true"');
    expect(html).toMatch(inputWithAriaLabelAndType("Title", "text"));
    expect(html).toContain('value="Plain title"');
    expect(html).not.toContain('data-slot="input"');
  });

  it("renders the rate-home resource create dialog with only name visible", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );
    const action = rateModel?.actions.find((candidate) => candidate.type === "create");

    if (!action || action.type !== "create") {
      throw new Error("Missing resource create action.");
    }

    applyBootstrapResponse(
      bootstrap(
        [cardRecord("card-1", "Default"), resourceRecord("resource-1", "Designer")],
        rateCardSchema,
      ),
    );
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={action} renderDialogCancel={false} />,
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
      ?.actions.find((action) => action.type === "create");
    const cardCreate = models
      .find((model) => model.viewName === "cardHome")
      ?.actions.find((action) => action.type === "create");

    if (!resourceCreate || resourceCreate.type !== "create") {
      throw new Error("Missing resource create action.");
    }

    if (!cardCreate || cardCreate.type !== "create") {
      throw new Error("Missing card create action.");
    }

    const resourceHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={resourceCreate} renderDialogCancel={false} />,
    );
    const cardHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={cardCreate} renderDialogCancel={false} />,
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
    const action = rateModel?.actions.find((candidate) => candidate.type === "create");

    if (!action || action.type !== "create") {
      throw new Error("Missing resource create action.");
    }

    const formData = new FormData();
    formData.set("name", "Producer");

    expect(resolveCreateValues(formData, action, { today: "2026-05-01" })).toEqual({
      name: "Producer",
    });
  });

  it("resolves current visible create values by field type", () => {
    const entity = fieldBehaviorEntity();
    const action = createAction(entity, [
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

    expect(resolveCreateValues(formData, action)).toEqual({
      title: "Write field tests",
      done: false,
      dueDate: "2026-05-06",
      estimate: 1.5,
      priority: "high",
      resource: "rec_resource_1",
    });

    formData.set("done", "on");
    formData.set("estimate", "");

    expect(resolveCreateValues(formData, action)).toEqual({
      title: "Write field tests",
      done: true,
      dueDate: "2026-05-06",
      estimate: "",
      priority: "high",
      resource: "rec_resource_1",
    });
  });

  it("resolves create values from active union fields only", () => {
    const action = requiredCreateAction(generatedDiscriminatedTaskSchema(), "taskHome");
    const formData = new FormData();

    formData.set("kind", "stream");
    formData.set("title", "Hidden title");
    formData.set("done", "on");

    expect(resolveCreateValues(formData, action)).toEqual({
      kind: "stream",
      done: true,
    });
  });

  it("keeps source task create and edit flows wired through field behavior", () => {
    const action = requiredCreateAction(appSchema, "taskHome");
    const createHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={action} renderDialogCancel={false} />,
    );
    const formData = new FormData();
    formData.set("title", "Ship field behavior");
    formData.set("dueDate", "2026-05-06");
    formData.set("estimate", "2");
    formData.set("priority", "high");

    expect(createHtml).toContain('name="title"');
    expect(createHtml).toContain('name="dueDate"');
    expect(createHtml).toContain('aria-label="Select date"');
    expect(createHtml).toMatch(inputWithNameAndType("estimate", "hidden"));
    expect(createHtml).toMatch(inputWithAriaLabelAndType("Estimate", "text"));
    expect(createHtml).toContain('data-web-formatted-number-input="true"');
    expect(createHtml).toContain('min="0"');
    expect(createHtml).toContain('step="1"');
    expect(createHtml).toContain('name="priority"');
    expect(createHtml).toContain("High");
    expect(createHtml).not.toContain('name="done"');
    expect(resolveCreateValues(formData, action)).toEqual({
      title: "Ship field behavior",
      dueDate: "2026-05-06",
      estimate: 2,
      priority: "high",
    });

    applyBootstrapResponse(
      bootstrap([
        {
          ...taskRecord("record-1", "Ship field behavior", true, "2026-05-06"),
          values: {
            title: "Ship field behavior",
            done: true,
            dueDate: "2026-05-06",
            estimate: 2,
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
        recordFields={listRecordFieldsFor(appSchema, "taskHome")}
      />,
    );

    expect(editHtml).toContain('value="Ship field behavior"');
    expect(editHtml).toContain('type="checkbox"');
    expect(editHtml).toContain("checked");
    expect(editHtml).toContain('type="date"');
    expect(editHtml).toContain('value="2026-05-06"');
    expect(editHtml).toContain('data-web-formatted-number-input="true"');
    expect(editHtml).toContain('value="2"');
    expect(editHtml).toContain("High");
  });

  it("keeps source rate-card create and edit flows wired through field behavior", () => {
    const action = requiredCreateAction(rateCardSchema, "rateHome");
    const createHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={action} renderDialogCancel={false} />,
    );
    const formData = new FormData();
    formData.set("name", "Producer");

    expect(createHtml).toContain('name="name"');
    expect(createHtml).not.toContain('name="kind"');
    expect(createHtml).not.toContain('name="unit"');
    expect(resolveCreateValues(formData, action)).toEqual({
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
        columns={tableColumnsFor(rateCardSchema, "rateHome")}
        entity={rateCardSchema.entities.rate}
        entityName="rate"
        query={{ kind: "all" }}
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
    const action = requiredCreateAction(siteSourceSchema, "blockHome");
    const formData = new FormData();
    formData.set("type", "post");
    formData.set("label", "Field behavior note");
    formData.set("date", "2026-05-14");
    formData.set("body", "## Note\n\nCreate and edit stay wired.");
    formData.set("href", "https://example.com/field-behavior");
    const imageFormData = new FormData();
    imageFormData.set("type", "image");
    imageFormData.set("label", "Cover image");
    imageFormData.set("href", "https://example.com/cover.png");
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
      <GeneratedCreateDialogForm action={action} renderDialogCancel={false} />,
    );
    const editHtml = renderToStaticMarkup(
      <RecordTable
        columns={tableColumnsFor(siteSourceSchema, "blockHome")}
        entity={siteSourceSchema.entities.block}
        entityName="block"
        query={{ kind: "all" }}
      />,
    );

    expect(createHtml).toContain('name="type"');
    expect(createHtml).toContain("Post");
    expect(createHtml).not.toMatch(inputWithNameAndType("body", "hidden"));
    expect(createHtml).not.toContain('name="templateKey"');
    expect(createHtml).not.toContain('data-web-markdown-editor="plate"');
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
    expect(resolveCreateValues(formData, action)).toEqual({
      type: "post",
      label: "Field behavior note",
      date: "2026-05-14",
      body: "## Note\n\nCreate and edit stay wired.",
      href: "https://example.com/field-behavior",
    });
    expect(resolveCreateValues(imageFormData, action)).toEqual({
      type: "image",
      label: "Cover image",
      href: "https://example.com/cover.png",
      width: 1200,
      height: 630,
    });
    expect(resolveCreateValues(imageWithoutHrefFormData, action)).toMatchObject({
      type: "image",
      label: "Unuploaded image",
      href: "",
    });
    expect(resolveCreateValues(linkFormData, action)).toEqual({
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
    expect(editHtml).toContain('type="date"');
    expect(editHtml).not.toContain('aria-label="Order"');
    expect(editHtml).toContain('data-web-formatted-number-input="true"');
  });

  it("renders the generated Site image upload editor with preview and URL fallback", () => {
    const hrefField = siteSourceSchema.entities.block.fields.href;

    if (!hrefField || hrefField.type !== "text") {
      throw new Error("Missing Site block href field.");
    }

    const fieldConfig: RecordFieldConfig = {
      fieldName: "href",
      field: hrefField,
      editor: "image",
      commit: "field-commit",
    };

    bootstrapSiteEditor([
      siteBlockRecord("block-image", {
        type: "image",
        label: "Cover image",
        href: "/api/site/media/site/images/cover.webp",
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
          canPatch
          entityName="block"
          fieldConfig={fieldConfig}
          recordId="block-image"
          showLabel
        />
      </SchemaAppProvider>,
    );
    const emptyHtml = renderToStaticMarkup(
      <SchemaAppProvider schemaKey="site">
        <RecordFieldEditor
          canPatch
          entityName="block"
          fieldConfig={fieldConfig}
          recordId="block-empty-image"
          showLabel
        />
      </SchemaAppProvider>,
    );

    expect(imageHtml).toContain('data-web-field-kind="image"');
    expect(imageHtml).toContain('data-web-image-field-preview="image"');
    expect(imageHtml).toContain('src="/api/site/media/site/images/cover.webp"');
    expect(imageHtml).toContain('type="file"');
    expect(imageHtml).toContain('accept="image/jpeg,image/png,image/webp,image/gif"');
    expect(imageHtml).toContain('aria-label="Upload Link"');
    expect(imageHtml).toContain('aria-label="Link URL"');
    expect(imageHtml).toContain('value="/api/site/media/site/images/cover.webp"');
    expect(emptyHtml).toContain('data-web-image-field-preview="empty"');
    expect(emptyHtml).toContain("No image");
  });

  it("still resolves scoped create defaults for views that use them", () => {
    const action = scopedRateCreateAction();
    const formData = new FormData();
    formData.set("resource", "resource-1");
    formData.set("cost", "325");
    formData.set("costUnit", "day");
    formData.set("price", "475");

    expect(
      resolveCreateValues(formData, action, {
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
    const placementAction = collection.actions.find((action) => action.type === "create");

    if (!placementAction || placementAction.type !== "create") {
      throw new Error("Missing placement create action.");
    }

    bootstrapSiteEditor();
    const collectionHtml = renderGeneratedHomeCollection(collection, {
      selectedContextRecordId: "rec_site_content_home",
      today: "2026-05-05",
    });
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={placementAction} renderDialogCancel={false} />,
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
      resolveCreateValues(placementFormData, placementAction, {
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
    const action = scopedRateCreateAction();

    const formData = new FormData();
    formData.set("resource", "resource-1");
    formData.set("cost", "325");
    formData.set("costUnit", "day");
    formData.set("price", "475");

    expect(() => resolveCreateValues(formData, action, { today: "2026-05-01" })).toThrow(
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
        recordFields={recordFields}
      />,
    );

    expect(html).toContain('aria-label="Resource"');
    expect(html).toContain("Designer");
    expect(html).toContain("missing-resource");
  });

  it("renders only the fields declared by a create view in the dialog", () => {
    const task = appSchema.entities.task;
    const action = createAction(task, ["title", "dueDate"]);
    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={action} renderDialogCancel={false} />,
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
        action={createAction(task, ["title", "done", "dueDate"])}
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
        recordFields={model?.result.type === "list" ? model.result.recordFields : []}
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
        recordFields={recordFields}
      />,
    );
    const enabledHtml = renderToStaticMarkup(
      <RecordList
        entity={taskWithDelete}
        entityName="task"
        query={{ kind: "all" }}
        recordFields={recordFields}
      />,
    );

    expect(disabledHtml).not.toContain('data-formless-delete-record="record-1"');
    expect(enabledHtml).toContain('data-formless-delete-record="record-1"');
    expect(enabledHtml).toContain('data-slot="alert-dialog-trigger"');
    expect(enabledHtml).toContain('aria-label="Delete Disposable task"');
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
      <RecordTable columns={columns} entity={task} entityName="task" query={{ kind: "all" }} />,
    );
    const enabledHtml = renderToStaticMarkup(
      <RecordTable
        columns={columns}
        entity={taskWithDelete}
        entityName="task"
        query={{ kind: "all" }}
      />,
    );

    expect(disabledHtml).not.toContain('data-formless-delete-record="record-1"');
    expect(enabledHtml).toContain('data-formless-delete-record="record-1"');
    expect(enabledHtml).toContain('data-slot="alert-dialog-trigger"');
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

function createAction(
  entity: EntitySchema,
  fieldNames: string[],
  entityName = "task",
): Extract<HomeActionConfig, { type: "create" }> {
  return {
    type: "create",
    label: `Create ${entity.label}`,
    entityName,
    entity,
    fields: createFields(entity, fieldNames),
    defaults: [],
    enabled: entity.mutations.create.enabled,
  };
}

function requiredCreateAction(
  schema: AppSchema,
  viewName: string,
): Extract<HomeActionConfig, { type: "create" }> {
  const action = requiredCollectionModel(schema, viewName).actions.find(
    (candidate) => candidate.type === "create",
  );

  if (!action || action.type !== "create") {
    throw new Error(`Missing create action for ${viewName}.`);
  }

  return action;
}

function requiredRootNavigationCreateAction(
  groupLabel: string,
): Extract<HomeActionConfig, { type: "create" }> {
  const group = requiredSiteCollectionModel("siteCompositionHome").context?.navigation?.groups.find(
    (candidate) => candidate.label === groupLabel,
  );

  if (!group?.createAction) {
    throw new Error(`Missing root navigation create action for ${groupLabel}.`);
  }

  return group.createAction;
}

function requiredEditView(schema: AppSchema, viewName: string): EditViewConfig {
  const model = requiredCollectionModel(schema, viewName);

  if (model.result.type !== "table") {
    throw new Error(`Collection ${viewName} does not render a table.`);
  }

  const actionColumn = model.result.columns.find((column) => column.type === "invokeAction");

  if (!actionColumn || actionColumn.type !== "invokeAction") {
    throw new Error(`Collection ${viewName} does not expose edit actions.`);
  }

  const action = actionColumn.actions.find((candidate) => candidate.type === "editRecord");

  if (!action || action.type !== "editRecord") {
    throw new Error(`Collection ${viewName} does not expose an edit record action.`);
  }

  return action.editView;
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
        mutations: {
          create: { enabled: true },
          patch: { enabled: true },
          delete: { enabled: false },
        },
      },
      taskPlacement: {
        label: "Task placement",
        fields: {
          parent: { type: "reference", required: true, label: "Parent", to: "task" },
          task: { type: "reference", required: true, label: "Task", to: "task" },
          order: { type: "number", required: true, label: "Order" },
        },
        mutations: {
          create: { enabled: true },
          patch: { enabled: true },
          delete: { enabled: false },
        },
      },
    },
    relationships: {
      taskPlacements: {
        kind: "toMany",
        from: { entity: "task" },
        to: { entity: "taskPlacement", field: "parent" },
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
        entity: "taskPlacement",
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
        actions: {
          editTask: {
            type: "editRecord",
            label: "Edit task",
            target: { kind: "row" },
            editView: "taskEdit",
          },
        },
        columns: [
          { type: "field", field: "title" },
          { type: "invokeAction", action: "editTask" },
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
        actions: [{ type: "create", createView: "taskCreate" }],
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
        entity: "taskPlacement",
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
  });
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
  };
}

function taskPlacementRecord(id: string, parent: string, task: string): StoredRecord {
  return {
    id,
    entity: "taskPlacement",
    values: { parent, task, order: 1 },
    createdAt: "2026-05-11T00:00:01.000Z",
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
    presentations: ["dragHandle"],
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

function scopedRateCreateAction(): Extract<HomeActionConfig, { type: "create" }> {
  const rate = rateCardSchema.entities.rate;

  return {
    type: "create",
    label: "Create Rate",
    entityName: "rate",
    entity: rate,
    fields: createFields(rate, ["resource", "cost", "costUnit", "price"]),
    defaults: [
      {
        fieldName: "card",
        field: rate.fields.card,
        value: { kind: "context", name: "card" },
      },
    ],
    enabled: rate.mutations.create.enabled,
  };
}

function fieldEditorCharacterizationCreateAction(
  entity: EntitySchema,
): Extract<HomeActionConfig, { type: "create" }> {
  return {
    type: "create",
    label: `Create ${entity.label}`,
    entityName: "editorCase",
    entity,
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
    enabled: entity.mutations.create.enabled,
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
  return {
    id,
    entity: "task",
    values: { title, done, dueDate },
    createdAt: `2026-04-29T00:00:0${id.at(-1)}.000Z`,
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
  };
}

function markdownRecord(body: string): StoredRecord {
  return {
    id: "record-1",
    entity: "task",
    values: { body },
    createdAt: "2026-04-29T00:00:01.000Z",
  };
}

function numberRecord(estimate: number): StoredRecord {
  return {
    id: "record-1",
    entity: "task",
    values: { estimate },
    createdAt: "2026-04-29T00:00:01.000Z",
  };
}

function resourceRecord(id: string, name: string): StoredRecord {
  return {
    id,
    entity: "resource",
    values: { name, kind: "role", unit: "day" },
    createdAt: `2026-04-29T00:00:0${id.at(-1)}.000Z`,
  };
}

function cardRecord(id: string, name: string): StoredRecord {
  return {
    id,
    entity: "card",
    values: { name, isDefault: false, marginMin: 0.4, marginMed: 0.5, marginMax: 0.6 },
    createdAt: `2026-04-29T00:00:0${id.at(-1)}.000Z`,
  };
}

function rateRecord(id: string, resource: string): StoredRecord {
  return {
    id,
    entity: "rate",
    values: { resource },
    createdAt: `2026-04-29T00:00:0${id.at(-1)}.000Z`,
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
    createdAt: `2026-04-29T00:00:0${id.at(-1)}.000Z`,
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
        actions: [
          {
            type: "create",
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
    mutations: {
      create: { enabled: true },
      patch: { enabled: true },
      delete: { enabled: false },
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
    mutations: {
      create: { enabled: true },
      patch: { enabled: true },
      delete: { enabled: false },
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
    mutations: {
      create: { enabled: true },
      patch: { enabled: true },
      delete: { enabled: false },
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
    mutations: {
      create: { enabled: true },
      patch: { enabled: true },
      delete: { enabled: false },
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
    mutations: {
      create: { enabled: true },
      patch: { enabled: true },
      delete: { enabled: false },
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
    mutations: {
      create: { enabled: true },
      patch: { enabled: true },
      delete: { enabled: false },
    },
  };
}

function inputWithNameAndType(name: string, type: string) {
  return new RegExp(`<input(?=[^>]*name="${name}")(?=[^>]*type="${type}")[^>]*>`);
}

function inputWithNameAndPlaceholder(name: string, placeholder: string) {
  return new RegExp(`<input(?=[^>]*name="${name}")(?=[^>]*placeholder="${placeholder}")[^>]*>`);
}

function inputWithAriaLabelAndType(label: string, type: string) {
  return new RegExp(`<input(?=[^>]*aria-label="${label}")(?=[^>]*type="${type}")[^>]*>`);
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
  return {
    ...entity,
    mutations: {
      create: { enabled: options.create ?? entity.mutations.create.enabled },
      patch: { enabled: options.patch ?? entity.mutations.patch.enabled },
      delete: { enabled: options.delete ?? entity.mutations.delete.enabled },
    },
  };
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
