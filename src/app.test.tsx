import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { App } from "./app.tsx";
import { HomeCollection, RecordList } from "./app/generated/collection.tsx";
import {
  GeneratedCreateDialogForm,
  GeneratedCreateForm,
  resolveCreateValues,
} from "./app/generated/create.tsx";
import { RecordTable } from "./app/generated/table.tsx";
import {
  applyBootstrapResponse,
  applyRecordMerge,
  getClientStoreSnapshot,
  resetClientStore,
} from "./client/store.ts";
import {
  selectCollectionModels,
  selectPrimaryCollectionModels,
  type CreateFieldConfig,
  type HomeActionConfig,
  type HomeQueryTabConfig,
  type HomeViewModel,
  type RecordFieldConfig,
  type TableColumnConfig,
} from "./client/views.ts";
import type { BootstrapResponse, StoredRecord } from "./shared/protocol.ts";
import type { AppSchema, EntitySchema } from "./shared/schema.ts";
import {
  rateSeedRecords as rateCardSeedRecords,
  rateSourceSchema as rateCardSchema,
  siteSeedRecords,
  siteSourceSchema,
  taskSeedRecords,
  taskSourceSchema as appSchema,
} from "./test/schema-apps.ts";

function renderRoute(path: string) {
  return renderToStaticMarkup(
    <Router ssrPath={path}>
      <App />
    </Router>,
  );
}

beforeEach(() => {
  resetClientStore();
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

function selectRateHomeModel() {
  const model = selectCollectionModels(rateCardSchema).find(
    (candidate) => candidate.viewName === "rateHome",
  );

  if (!model) {
    throw new Error("Missing rate home model.");
  }

  return model;
}

describe("App smoke routes", () => {
  it('renders the "/tasks" route with task navigation', () => {
    const html = renderRoute("/tasks");

    expect(html).toContain('href="/tasks"');
    expect(html).toContain("Tasks");
    expect(html).toContain('href="/rates"');
    expect(html).toContain("Rates");
    expect(html).toContain('href="/site"');
    expect(html).toContain("Site");
    expect(html).toContain('href="/tasks/schema"');
    expect(html).toContain("Schema");
    expect(html).toContain("Loading Tasks...");
    expect(html).not.toContain("Create Task");
  });

  it('renders the "/rates" route with rate navigation', () => {
    const html = renderRoute("/rates");

    expect(html).toContain('href="/tasks"');
    expect(html).toContain("Tasks");
    expect(html).toContain('href="/rates"');
    expect(html).toContain("Rates");
    expect(html).toContain('href="/site"');
    expect(html).toContain("Site");
    expect(html).toContain('href="/rates/schema"');
    expect(html).toContain("Schema");
    expect(html).toContain("Loading Rates...");
    expect(html).not.toContain("Create Resource");
  });

  it('renders the "/site" route with site navigation', () => {
    const html = renderRoute("/site");

    expect(html).toContain('href="/tasks"');
    expect(html).toContain("Tasks");
    expect(html).toContain('href="/rates"');
    expect(html).toContain("Rates");
    expect(html).toContain('href="/site"');
    expect(html).toContain("Site");
    expect(html).toContain('href="/site/schema"');
    expect(html).toContain("Schema");
    expect(html).toContain("Loading Site...");
    expect(html).not.toContain("Create Content item");
  });

  it('renders the "/tasks/schema" route', () => {
    applyBootstrapResponse(bootstrap([], appSchema), "tasks");
    const html = renderRoute("/tasks/schema");

    expect(html).toContain('href="/tasks/schema"');
    expect(html).toContain("Tasks Schema");
    expect(html).toContain("<code>tasks</code>");
    expect(html).toContain('aria-label="Tasks route reset controls"');
    expect(html).toContain("Save schema");
    expect(html).toContain("Reset source schema");
    expect(html).toContain("Reset seed data");
    expect(html).toContain("&quot;task&quot;");
    expect(html).not.toContain("<code>rates</code>");
  });

  it('renders the "/rates/schema" route', () => {
    applyBootstrapResponse(bootstrap([], rateCardSchema), "rates");
    const html = renderRoute("/rates/schema");

    expect(html).toContain('href="/rates/schema"');
    expect(html).toContain("Rates Schema");
    expect(html).toContain("<code>rates</code>");
    expect(html).toContain('aria-label="Rates route reset controls"');
    expect(html).toContain("Save schema");
    expect(html).toContain("Reset source schema");
    expect(html).toContain("Reset seed data");
    expect(html).toContain("&quot;rate&quot;");
    expect(html).toContain("&quot;resource&quot;");
    expect(html).not.toContain("<code>tasks</code>");
  });

  it('renders the "/site/schema" route', () => {
    applyBootstrapResponse(bootstrap([], siteSourceSchema), "site");
    const html = renderRoute("/site/schema");

    expect(html).toContain('href="/site/schema"');
    expect(html).toContain("Site Schema");
    expect(html).toContain("<code>site</code>");
    expect(html).toContain('aria-label="Site route reset controls"');
    expect(html).toContain("Save schema");
    expect(html).toContain("Reset source schema");
    expect(html).toContain("Reset seed data");
    expect(html).toContain("&quot;contentItem&quot;");
    expect(html).toContain("&quot;contentPlacement&quot;");
    expect(html).not.toContain("<code>tasks</code>");
    expect(html).not.toContain("<code>rates</code>");
  });
});

describe("generated collection home", () => {
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

  it("labels generated action rows from the active entity", () => {
    applyBootstrapResponse(bootstrap(siteSeedRecords, siteSourceSchema), "site");
    const html = renderRoute("/site");

    expect(html).toContain('aria-label="Content item actions"');
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
    expect(html).toContain('type="number"');
    expect(html).toContain('aria-label="Estimate"');
    expect(html).not.toContain(record.createdAt);
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
    applyBootstrapResponse(bootstrap(siteSeedRecords, siteSourceSchema), "site");
    const html = renderRoute("/site");

    expect(html).toContain("<h1");
    expect(html).toContain("Content");
    expect(html).toContain('aria-label="Collections"');
    expect(html).toContain("Blocks");
    expect(html).toContain("Media");
    expect(html).toContain("Create Content item");
    expect(html).toContain('data-slot="table"');
    expect(html).toContain("Body");
    expect(html).toContain("<textarea");
    expect(html).toContain('aria-label="Body"');
    expect(html).toContain("Home");
    expect(html).toContain("Estii");
    expect(html).toContain("Formless");
    expect(html).toContain("Draft notes on generated editorial tools");
    expect(html).toMatch(/aria-label="All count"[^>]*>16</);
    expect(html).toMatch(/aria-label="Draft count"[^>]*>1</);
    expect(html).toMatch(/aria-label="Published count"[^>]*>15</);
    expect(html).toMatch(/aria-label="Projects count"[^>]*>3</);
    expect(html).toMatch(/aria-label="Featured count"[^>]*>6</);
  });

  it("updates site content query counts after local record merges", () => {
    applyBootstrapResponse(bootstrap(siteSeedRecords, siteSourceSchema), "site");
    const before = renderRoute("/site");

    applyRecordMerge(
      [
        siteContentRecord("rec_site_content_project_unannounced", {
          kind: "project",
          title: "Unannounced project",
          status: "draft",
          featured: true,
          order: 3,
          templateKey: "project",
        }),
      ],
      2,
      "site",
    );
    const after = renderRoute("/site");

    expect(before).toMatch(/aria-label="All count"[^>]*>16</);
    expect(before).toMatch(/aria-label="Draft count"[^>]*>1</);
    expect(before).toMatch(/aria-label="Projects count"[^>]*>3</);
    expect(before).toMatch(/aria-label="Featured count"[^>]*>6</);
    expect(after).toMatch(/aria-label="All count"[^>]*>17</);
    expect(after).toMatch(/aria-label="Draft count"[^>]*>2</);
    expect(after).toMatch(/aria-label="Projects count"[^>]*>4</);
    expect(after).toMatch(/aria-label="Featured count"[^>]*>7</);
    expect(after).toContain("Unannounced project");
  });

  it("surfaces site readiness warnings without disabling generated editors", () => {
    const contentModel = selectCollectionModels(siteSourceSchema).find(
      (model) => model.viewName === "contentHome",
    );
    const incompletePost: StoredRecord = {
      id: "rec_incomplete_post",
      entity: "contentItem",
      values: {
        kind: "post",
        title: "Published without metadata",
        status: "published",
        featured: false,
      },
      createdAt: "2026-05-05T00:00:00.000Z",
    };

    if (!contentModel || contentModel.result.type !== "table") {
      throw new Error("Missing content table model.");
    }

    applyBootstrapResponse(bootstrap([incompletePost], siteSourceSchema), "site");
    const html = renderToStaticMarkup(
      <RecordTable
        columns={contentModel.result.columns}
        entity={contentModel.entity}
        entityName={contentModel.entityName}
        query={{ kind: "all" }}
      />,
    );

    expect(html).toContain('aria-label="Readiness warnings"');
    expect(html).toContain("Published post should have a slug or link.");
    expect(html).toContain("Published post should include body content.");
    expect(html).toContain("Published post should have a published date.");
    expect(html).toContain("Published without metadata");
    expect(html).toMatch(/<textarea[^>]*aria-label="Body"/);
    expect(html).not.toMatch(/aria-label="Body"[^>]*disabled/);
  });

  it("renders the scoped site composition workspace for selected content", () => {
    const compositionModel = selectCollectionModels(siteSourceSchema).find(
      (model) => model.viewName === "contentCompositionHome",
    );

    if (!compositionModel) {
      throw new Error("Missing composition model.");
    }

    applyBootstrapResponse(bootstrap(siteSeedRecords, siteSourceSchema), "site");
    const html = renderGeneratedHomeCollection(compositionModel, {
      selectedContextRecordId: "rec_site_content_home",
      today: "2026-05-05",
    });

    expect(html).toContain('aria-label="Content item records"');
    expect(html).toContain("Home");
    expect(html).toMatch(/aria-label="Home Placements count"[^>]*>3</);
    expect(html).toContain("Create Block placement");
    expect(html).toContain("Hero");
    expect(html).toContain("Content list");
    expect(html).toContain("Content grid");
    expect(html).toContain('value="Recent posts"');
    expect(html).toContain('value="publishedPosts"');
    expect(html).toContain('value="featuredProjects"');
  });

  it("renders header navigation as content block placements", () => {
    const blocksModel = selectCollectionModels(siteSourceSchema).find(
      (model) => model.viewName === "contentCompositionHome",
    );

    if (!blocksModel) {
      throw new Error("Missing blocks model.");
    }

    applyBootstrapResponse(bootstrap(siteSeedRecords, siteSourceSchema), "site");
    const html = renderGeneratedHomeCollection(blocksModel, {
      selectedContextRecordId: "rec_site_content_group_header",
      today: "2026-05-05",
    });

    expect(html).toContain('aria-label="Content item records"');
    expect(html).toContain("Header");
    expect(html).toMatch(/aria-label="Header Placements count"[^>]*>4</);
    expect(html).toContain("Create Block placement");
    expect(html).toContain("Link");
    expect(html).toContain('value="Home"');
    expect(html).toContain('value="Blog"');
    expect(html).toContain('value="Projects"');
    expect(html).toContain('value="Resume"');
  });

  it("renders only primary rate-card collection navigation", () => {
    applyBootstrapResponse(bootstrap(rateCardSeedRecords, rateCardSchema));
    const html = renderRoute("/rates");

    expect(html).not.toContain('aria-label="Collections"');
    expect(html).toContain("Rates");
    expect(html).toContain("Create Resource");
    expect(html).toContain("Regenerate missing rates");
    expect(html).not.toMatch(/<button[^>]*>Create Rate<\/button>/);
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
    expect(html).not.toContain("<select");
    expect(html).toContain("Default");
    expect(html).toContain("Backup");
    expect(html).toMatch(/aria-label="Default Rates count"[^>]*>1</);
    expect(html).toMatch(/aria-label="Backup Rates count"[^>]*>1</);
    expect(html).toContain('aria-label="Create Rate card"');
    expect(html).toMatch(/<button[^>]*>Create Resource<\/button>/);
    expect(html).toContain("Regenerate missing rates");
    expect(html).toContain('data-slot="table"');
    expect(html).toContain("<th");
    expect(html).toContain("Role");
    expect(html).toContain('aria-label="Role"');
    expect(html).toContain('value="Designer"');
    expect(html).not.toContain("Edit shared");
    expect(html).not.toContain('aria-label="Edit shared resource"');
    expect(html).toContain('aria-label="Cost"');
    expect(html).not.toContain("Cost unit");
    expect(html).not.toContain('aria-label="Currency"');
    expect(html).toContain("USD");
    expect(html).toContain("/ day");
    expect(html).toContain('value="325"');
    expect(html).toContain('value="475"');
    expect(html).not.toContain('value="900"');
  });

  it("updates relationship counts after local record merges", () => {
    const rateModel = selectRateHomeModel();

    applyBootstrapResponse(
      bootstrap(
        [cardRecord("card-1", "Default"), resourceRecord("resource-1", "Designer")],
        rateCardSchema,
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
    expect(html).toContain('value="900"');
    expect(html).not.toContain('value="325"');
    expect(html).not.toContain('value="475"');
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
    expect(html).toContain('value="825"');
    expect(html).toContain('value="975"');
    expect(html).not.toContain('value="990"');
    expect(html).not.toContain('value="1170"');
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

  it("renders markdown create controls as multiline textareas", () => {
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

    expect(html).toContain("<textarea");
    expect(html).toContain('name="body"');
    expect(html).toContain("Body");
  });

  it("renders markdown inline editors as multiline textareas", () => {
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

    expect(html).toContain("<textarea");
    expect(html).toContain('aria-label="Body"');
    expect(html).toContain("## Draft");
    expect(html).not.toContain('type="text"');
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
    expect(html).toContain('aria-label="Cost"');
    expect(html).not.toContain("Cost unit");
    expect(html).toContain("USD");
    expect(html).toContain("/ day");
    expect(html).toContain('type="number"');
    expect(html).toContain('value="325"');
    expect(html).toContain('value="475"');
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

    expect(before.match(/Designer/g)?.length).toBe(2);
    expect(after.match(/Principal designer/g)?.length).toBe(2);
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
    expect(html).toContain('value="475"');
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

    expect(createHtml).toContain('name="estimate"');
    expect(createHtml).toContain('type="number"');
    expect(createHtml).toContain('min="0"');
    expect(createHtml).toContain('max="10"');
    expect(createHtml).toContain('step="1"');
    expect(rowHtml).toContain('aria-label="Estimate"');
    expect(rowHtml).toContain('type="number"');
    expect(rowHtml).toContain('value="3"');
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
    expect(createHtml).toContain('name="estimate"');
    expect(createHtml).toContain('type="number"');
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
    expect(editHtml).toContain('type="number"');
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
    expect(editHtml).toContain('value="475"');
    expect(editHtml).toContain("USD");
    expect(editHtml).toContain("/ day");
    expect(editHtml).not.toContain("Cost unit");
  });

  it("keeps source site create and edit flows wired through field behavior", () => {
    const action = requiredCreateAction(siteSourceSchema, "contentHome");
    const formData = new FormData();
    formData.set("kind", "post");
    formData.set("title", "Field behavior note");
    formData.set("label", "Field behavior");
    formData.set("subtitle", "Regression coverage");
    formData.set("body", "## Note\n\nCreate and edit stay wired.");
    formData.set("status", "published");
    formData.set("featured", "on");
    formData.set("publishedAt", "2026-05-06");
    formData.set("order", "4");
    formData.set("slug", "blog/field-behavior-note");
    formData.set("href", "https://example.com/field-behavior");
    formData.set("icon", "note");
    formData.set("color", "#336699");
    formData.set("templateKey", "post");
    formData.set("primaryMedia", "rec_site_media_avatar");

    applyBootstrapResponse(bootstrap(siteSeedRecords, siteSourceSchema), "site");
    const createHtml = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={action} renderDialogCancel={false} />,
    );
    const editHtml = renderToStaticMarkup(
      <RecordTable
        columns={tableColumnsFor(siteSourceSchema, "contentHome")}
        entity={siteSourceSchema.entities.contentItem}
        entityName="contentItem"
        query={{ kind: "all" }}
      />,
    );

    expect(createHtml).toContain('name="kind"');
    expect(createHtml).toContain("Post");
    expect(createHtml).toContain('name="body"');
    expect(createHtml).toContain("<textarea");
    expect(createHtml).toContain('name="featured"');
    expect(createHtml).toContain('type="checkbox"');
    expect(createHtml).toContain('name="publishedAt"');
    expect(createHtml).toContain('aria-label="Select date"');
    expect(createHtml).toContain('name="order"');
    expect(createHtml).toContain('type="number"');
    expect(createHtml).toContain('min="0"');
    expect(createHtml).toContain('step="1"');
    expect(createHtml).toContain('name="primaryMedia"');
    expect(createHtml).toContain("Site owner portrait");
    expect(resolveCreateValues(formData, action)).toEqual({
      kind: "post",
      title: "Field behavior note",
      label: "Field behavior",
      subtitle: "Regression coverage",
      body: "## Note\n\nCreate and edit stay wired.",
      status: "published",
      featured: true,
      publishedAt: "2026-05-06",
      order: 4,
      slug: "blog/field-behavior-note",
      href: "https://example.com/field-behavior",
      icon: "note",
      color: "#336699",
      templateKey: "post",
      primaryMedia: "rec_site_media_avatar",
    });
    expect(editHtml).toContain("Shipping schema-backed authoring");
    expect(editHtml).toContain('aria-label="Body"');
    expect(editHtml).toContain("<textarea");
    expect(editHtml).toContain('aria-label="Featured"');
    expect(editHtml).toContain('type="checkbox"');
    expect(editHtml).toContain('aria-label="Published at"');
    expect(editHtml).toContain('type="date"');
    expect(editHtml).toContain('aria-label="Order"');
    expect(editHtml).toContain('type="number"');
    expect(editHtml).toContain("Published");
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
    const models = selectCollectionModels(siteSourceSchema);
    const placementAction = models
      .find((model) => model.viewName === "contentCompositionHome")
      ?.actions.find((action) => action.type === "create");

    if (!placementAction || placementAction.type !== "create") {
      throw new Error("Missing placement create action.");
    }

    const html = renderToStaticMarkup(
      <GeneratedCreateDialogForm action={placementAction} renderDialogCancel={false} />,
    );
    const placementFormData = new FormData();
    placementFormData.set("slot", "main");
    placementFormData.set("kind", "contentList");
    placementFormData.set("title", "Recent posts");
    placementFormData.set("queryKey", "publishedPosts");
    placementFormData.set("limit", "3");
    placementFormData.set("order", "1");
    placementFormData.set("visible", "on");

    expect(html).not.toContain('name="parent"');
    expect(
      resolveCreateValues(placementFormData, placementAction, {
        today: "2026-05-05",
        values: { content: "rec_site_content_home" },
      }),
    ).toMatchObject({
      parent: "rec_site_content_home",
      slot: "main",
      kind: "contentList",
      title: "Recent posts",
      queryKey: "publishedPosts",
      limit: 3,
      order: 1,
      visible: true,
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

function listRecordFieldsFor(schema: AppSchema, viewName: string): RecordFieldConfig[] {
  const model = requiredCollectionModel(schema, viewName);

  if (model.result.type !== "list") {
    throw new Error(`Collection ${viewName} does not render a list.`);
  }

  return model.result.recordFields;
}

function tableColumnsFor(schema: AppSchema, viewName: string): TableColumnConfig[] {
  const model = requiredCollectionModel(schema, viewName);

  if (model.result.type !== "table") {
    throw new Error(`Collection ${viewName} does not render a table.`);
  }

  return model.result.columns;
}

function requiredCollectionModel(schema: AppSchema, viewName: string) {
  const model = selectCollectionModels(schema).find((candidate) => candidate.viewName === viewName);

  if (!model) {
    throw new Error(`Missing collection model ${viewName}.`);
  }

  return model;
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
  return {
    id,
    entity: "rate",
    values: {
      resource,
      card,
      cost: price - 150,
      costUnit: "day",
      price,
      priceSet: true,
      currency: "usd",
    },
    createdAt: `2026-04-29T00:00:0${id.at(-1)}.000Z`,
  };
}

function siteContentRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity: "contentItem",
    values,
    createdAt: "2026-05-05T00:00:40.000Z",
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

function withMutationPolicy(
  entity: EntitySchema,
  options: { create?: boolean; patch?: boolean },
): EntitySchema {
  return {
    ...entity,
    mutations: {
      create: { enabled: options.create ?? entity.mutations.create.enabled },
      patch: { enabled: options.patch ?? entity.mutations.patch.enabled },
      delete: { enabled: false },
    },
  };
}

function bootstrap(records: StoredRecord[], schema = appSchema): BootstrapResponse {
  return {
    schema,
    schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
    records,
    cursor: 1,
  };
}
