import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type {
  FormlessUiField,
  FormlessUiTreeIntent,
  FormlessUiTreeItemContract,
} from "../formless-ui-contract.ts";
import {
  createFormlessUiTreeResultFixtures,
  type FormlessUiTreeResultFixture,
  type FormlessUiTreeResultFixtureId,
} from "./tree-results.fixtures.ts";
import {
  AstryxTreeResultRenderer,
  FormlessTreeResultsLayout,
  createFormlessUiTreeResultFixtureHost,
} from "./tree-results.tsx";

vi.mock("@stylexjs/stylex", () => ({
  create: <Styles,>(styles: Styles) => styles,
  createTheme: () => ({}),
  props: () => ({}),
}));

describe("canonical tree-result fixtures", () => {
  it("cover shallow hierarchy, selected paths, slots, variants, context, and depth", () => {
    const fixtures = createFormlessUiTreeResultFixtures();
    const shallow = requiredFixture(fixtures, "shallow").tree;
    const maximumDepth = requiredFixture(fixtures, "maximum-depth").tree;
    const shallowItems = collectTreeItems(shallow.items);
    const selectedPath = findSelectedPath(maximumDepth.items);
    const activeCreation = shallow.selectedEditor?.childCreation;
    const activeVariant = activeCreation?.variants.find((variant) => variant.selected);

    expect(structuredClone(fixtures)).toEqual(fixtures);
    expect(shallow.availability.state).toBe("ready");
    expect(shallowItems.map((item) => item.label)).toEqual([
      "Navigation",
      "Brand",
      "Primary links",
      "Home",
      "About",
      "Hero",
      "Footer",
    ]);
    expect(shallowItems.map((item) => item.slot?.label).filter(Boolean)).toEqual(
      expect.arrayContaining(["Header", "Start", "Main", "Links", "Footer"]),
    );
    expect(shallowItems.map((item) => item.variant?.label).filter(Boolean)).toEqual(
      expect.arrayContaining(["Navigation", "Logo", "Group", "Link", "Hero", "Footer"]),
    );
    expect(shallowItems[0]?.contextActions[0]).toMatchObject({
      availability: { available: true },
      kind: "treeContextAction",
    });
    expect(activeCreation?.activeVariantId).toBe(activeVariant?.id);
    expect(activeCreation?.activeCreateSurface?.kind).toBe("createSurface");
    expect(activeVariant?.selectionIntent.parent).toEqual({
      itemId: shallow.selectedEditor?.itemId,
      kind: "item",
    });
    expect(selectedPath).toHaveLength(8);
    expect(selectedPath?.slice(0, -1).every((item) => item.disclosure?.open)).toBe(true);
    expect(selectedPath?.at(-1)).toMatchObject({
      label: "Text",
      selected: true,
      structure: { message: "Maximum tree depth reached.", state: "depthStopped" },
    });
  });

  it("covers empty, unavailable, structural, warning, disabled, and pending states", () => {
    const fixtures = createFormlessUiTreeResultFixtures();
    const empty = requiredFixture(fixtures, "empty").tree;
    const unavailable = requiredFixture(fixtures, "unavailable").tree;
    const missingChild = requiredFixture(fixtures, "missing-child").tree;
    const cycle = requiredFixture(fixtures, "cycle").tree;
    const leaf = requiredFixture(fixtures, "leaf").tree;
    const editingDisabled = requiredFixture(fixtures, "editing-disabled").tree;
    const noSelection = requiredFixture(fixtures, "no-selection").tree;
    const pending = requiredFixture(fixtures, "pending").tree;
    const actions = requiredFixture(fixtures, "actions").tree;
    const confirmation = requiredFixture(fixtures, "removal-confirmation").tree;
    const removalPending = requiredFixture(fixtures, "removal-pending").tree;
    const removalFailed = requiredFixture(fixtures, "removal-failed").tree;
    const warningSources = new Set(
      [
        ...editingDisabled.warnings,
        ...(editingDisabled.items[0]?.warnings ?? []),
        ...(editingDisabled.selectedEditor?.warnings ?? []),
      ].map((warning) => warning.source),
    );

    expect(empty.availability.state).toBe("empty");
    expect(empty.items).toEqual([]);
    expect(empty.rootChildCreation?.variants).toHaveLength(2);
    expect(unavailable.availability.state).toBe("unavailable");
    expect(missingChild.items[0]).toMatchObject({
      availability: { available: true },
      structure: { state: "missingChild" },
    });
    expect(missingChild.items[0]?.childRecordId).toBe("block:missing-block");
    expect(missingChild.selectedEditor?.childRecordId).toBe("block:missing-block");
    expect(missingChild.selectedEditor?.removePlacement).toBeDefined();
    expect(missingChild.selectedEditor).not.toHaveProperty("childFields");
    expect(cycle.items[0]?.structure.state).toBe("cycleStopped");
    expect(leaf.items[0]?.structure.state).toBe("leaf");
    expect(leaf.selectedEditor?.childCreation).toBeUndefined();
    expect(noSelection.availability.state).toBe("ready");
    expect(noSelection.selectedEditor).toBeUndefined();
    expect(noSelection.items.every((item) => !item.selected)).toBe(true);
    expect(editingDisabled.editing).toEqual({
      disabledReason: "Editing requires an owner session.",
      enabled: false,
    });
    expect(editingDisabled.items[0]?.availability.available).toBe(false);
    expect(warningSources).toEqual(new Set(["child", "placement", "tree"]));
    expect(pending.status).toMatchObject({ pending: { isPending: true }, status: "pending" });
    expect(pending.feedback[0]?.status).toBe("pending");
    expect(pending.items[0]?.ordering).toMatchObject({ pending: true });
    expect(pending.items[0]?.ordering?.actions.every((action) => action.disabled)).toBe(true);
    expect(
      pending.selectedEditor?.childCreation?.activeCreateSurface?.dialog.form.submit,
    ).toMatchObject({ disabled: true, pending: { isPending: true } });
    expect(actions.items[0]?.ordering?.actions).toMatchObject([
      { direction: "top", structurallyAvailable: false },
      { direction: "up", structurallyAvailable: false },
      { direction: "down", structurallyAvailable: true },
      { direction: "bottom", structurallyAvailable: true },
    ]);
    expect(actions.selectedEditor?.removePlacement).toMatchObject({
      confirmation: { open: false },
      trigger: { prominence: "destructive" },
    });
    expect(confirmation.selectedEditor?.removePlacement?.confirmation?.open).toBe(true);
    expect(removalPending.selectedEditor?.removePlacement).toMatchObject({
      confirmation: { action: { pending: { isPending: true } }, open: true },
      progress: { steps: [{ status: "running" }, { status: "pending" }] },
      status: { status: "pending" },
    });
    expect(removalFailed.selectedEditor?.removePlacement).toMatchObject({
      confirmation: { open: true },
      feedback: { detail: "Remove failed. Try again.", status: "failed" },
      status: { status: "failed" },
    });
    expect(
      removalFailed.selectedEditor?.removePlacement?.confirmation?.action.disabled,
    ).toBeUndefined();
  });

  it("wraps every immutable fixture snapshot in the reusable memory host", () => {
    const fixtures = createFormlessUiTreeResultFixtures();
    const fixtureHost = createFormlessUiTreeResultFixtureHost(fixtures);

    for (const fixture of fixtures) {
      const tree = fixtureHost.getTree(fixture.id);
      const reference = fixtureHost.referenceFor(fixture.id);

      expect(tree).toEqual(fixture.tree);
      expect(tree).not.toBe(fixture.tree);
      expect(fixtureHost.host.read(reference)).toBe(tree);
      expect(reference).toMatchObject({
        resultId: fixture.tree.id,
        role: "mainResult",
        sectionId: "section:tree-result-fixtures",
        workspaceId: "workspace:tree-result-fixtures",
      });
    }
  });

  it("reduces selection, fields, creation, ordering, confirmation, and removal through scoped host identity", () => {
    const fixtures = createFormlessUiTreeResultFixtures();
    const fixtureHost = createFormlessUiTreeResultFixtureHost(fixtures);
    const shallowReference = fixtureHost.referenceFor("shallow");
    const actionsReference = fixtureHost.referenceFor("actions");
    const notifications = new Map<string, number>();
    const stopShallow = fixtureHost.host.subscribe(shallowReference, () => {
      notifications.set("shallow", (notifications.get("shallow") ?? 0) + 1);
    });
    const stopActions = fixtureHost.host.subscribe(actionsReference, () => {
      notifications.set("actions", (notifications.get("actions") ?? 0) + 1);
    });
    const shallow = fixtureHost.getTree("shallow");
    const shallowEditor = shallow.selectedEditor;
    const placementField = shallowEditor?.placementFields.fields.find(
      (field) => field.fieldName === "label",
    );
    const rootCreation = shallow.rootChildCreation;
    const createSurface = rootCreation?.activeCreateSurface;
    const createField = createSurface?.dialog.form.fieldSet.fields[0];
    const brand = shallow.items[0]?.children[0];

    if (
      !shallowEditor ||
      !placementField ||
      !rootCreation ||
      !createSurface ||
      !createField ||
      !brand
    ) {
      throw new Error("Missing interactive shallow tree fixtures.");
    }

    void fixtureHost.host.dispatch({
      collectionId: "collection:tree-result-fixtures",
      intent: brand.selectionIntent,
      resultId: shallow.id,
      screenId: "workspace:stale-tree-result-fixtures",
      sectionId: "section:tree-result-fixtures",
      type: "workspaceTree",
    });
    expect(fixtureHost.getTree("shallow")).toBe(shallow);
    expect(notifications.size).toBe(0);

    dispatchFixtureTreeIntent(fixtureHost, shallow.id, {
      fieldId: placementField.fieldId,
      intent: {
        fieldName: placementField.fieldName,
        type: "recordEditorDraftChange",
        value: "Navigation updated",
      },
      resultId: shallow.id,
      target: {
        fieldSetId: shallowEditor.placementFields.id,
        itemId: shallowEditor.itemId,
        kind: "placement",
      },
      type: "treeField",
    });
    expect(
      recordFieldDraft(
        fixtureHost
          .getTree("shallow")
          .selectedEditor?.placementFields.fields.find(
            (field) => field.fieldId === placementField.fieldId,
          ),
      ),
    ).toBe("Navigation updated");
    expect(fixtureHost.getTree("shallow").items[0]?.warnings).toEqual(shallow.items[0]?.warnings);
    expect(notifications).toEqual(new Map([["shallow", 1]]));

    dispatchFixtureTreeIntent(fixtureHost, shallow.id, {
      intent: { open: true, surfaceId: createSurface.id, type: "createOpenChange" },
      parent: { kind: "root" },
      resultId: shallow.id,
      surfaceId: createSurface.id,
      type: "treeCreate",
    });
    dispatchFixtureTreeIntent(fixtureHost, shallow.id, {
      fieldId: createField.fieldId,
      intent: {
        fieldName: createField.fieldName,
        fieldValue: { kind: "input", value: "Intro block" },
        type: "createDraftChange",
      },
      resultId: shallow.id,
      target: { kind: "create", parent: { kind: "root" }, surfaceId: createSurface.id },
      type: "treeField",
    });
    dispatchFixtureTreeIntent(fixtureHost, shallow.id, {
      intent: { surfaceId: createSurface.id, type: "createSubmit" },
      parent: { kind: "root" },
      resultId: shallow.id,
      surfaceId: createSurface.id,
      type: "treeCreate",
    });
    expect(fixtureHost.getTree("shallow").rootChildCreation?.activeCreateSurface).toMatchObject({
      dialog: {
        form: { fieldSet: { fields: [{ draftInput: { kind: "input", value: "Intro block" } }] } },
        open: false,
      },
    });

    dispatchFixtureTreeIntent(fixtureHost, shallow.id, brand.selectionIntent);
    const selectedBrandTree = fixtureHost.getTree("shallow");
    expect(selectedBrandTree.items[0]?.children[0]).toMatchObject({
      id: brand.id,
      selected: true,
    });
    expect(selectedBrandTree.selectedEditor).toMatchObject({
      itemId: brand.id,
      placementId: brand.placementId,
    });

    notifications.clear();
    const actions = fixtureHost.getTree("actions");
    const actionsEditor = actions.selectedEditor;
    const selectedItem = actions.items.find((item) => item.selected);
    const moveDown = selectedItem?.ordering?.actions.find((action) => action.direction === "down");
    const removal = actionsEditor?.removePlacement;
    if (!actionsEditor || !selectedItem || !moveDown || !removal?.confirmation) {
      throw new Error("Missing interactive action tree fixtures.");
    }

    dispatchFixtureTreeIntent(fixtureHost, actions.id, moveDown.intent);
    expect(fixtureHost.getTree("actions").items.map((item) => item.label)).toEqual([
      "Features",
      "Announcement",
      "Call to action",
    ]);

    dispatchFixtureTreeIntent(fixtureHost, actions.id, {
      controlId: removal.id,
      intent: removal.trigger.intent,
      itemId: actionsEditor.itemId,
      resultId: actions.id,
      type: "treeOperation",
    });
    expect(fixtureHost.getTree("actions").selectedEditor?.removePlacement?.confirmation?.open).toBe(
      true,
    );
    dispatchFixtureTreeIntent(fixtureHost, actions.id, {
      controlId: removal.id,
      intent: removal.confirmation.closeIntent,
      itemId: actionsEditor.itemId,
      resultId: actions.id,
      type: "treeOperation",
    });
    expect(fixtureHost.getTree("actions").selectedEditor?.removePlacement?.confirmation?.open).toBe(
      false,
    );
    dispatchFixtureTreeIntent(fixtureHost, actions.id, {
      controlId: removal.id,
      intent: removal.trigger.intent,
      itemId: actionsEditor.itemId,
      resultId: actions.id,
      type: "treeOperation",
    });
    dispatchFixtureTreeIntent(fixtureHost, actions.id, {
      controlId: removal.id,
      intent: removal.confirmation.action.intent,
      itemId: actionsEditor.itemId,
      resultId: actions.id,
      type: "treeOperation",
    });
    const removed = fixtureHost.getTree("actions");
    expect(removed.items.map((item) => item.label)).toEqual(["Features", "Call to action"]);
    expect(removed.selectedEditor?.itemId).toBe(removed.items[0]?.id);
    expect(removed.feedback.at(-1)).toMatchObject({
      detail: "Placement removed without deleting its child record.",
      status: "committed",
    });
    expect(Array.from(notifications.keys())).toEqual(["actions"]);

    stopShallow();
    stopActions();
  });
});

describe("Tree Results prototype layout", () => {
  it("renders an Astryx hierarchy outline beside one focused selected editor", () => {
    const html = renderToStaticMarkup(<FormlessTreeResultsLayout />);

    expect(html).toContain("Tree Results");
    expect(html).toContain('role="tree"');
    expect(html).toContain('role="treeitem"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("Navigation");
    expect(html).toContain("Primary links");
    expect(html).toContain('aria-label="Edit Navigation placement and block"');
    expect(html).toContain("Navigation · Header");
  });

  it("keeps the complete selected path discoverable in the maximum-depth layout", () => {
    const tree = requiredFixture(createFormlessUiTreeResultFixtures(), "maximum-depth").tree;
    const html = renderToStaticMarkup(<AstryxTreeResultRenderer tree={tree} />);

    for (const label of [
      "Page",
      "Section",
      "Container",
      "Stack",
      "Group",
      "Panel",
      "Content",
      "Text",
    ]) {
      expect(html).toContain(label);
    }
    expect(html.match(/role="treeitem"/g)).toHaveLength(8);
    expect(html).toContain('aria-label="Edit Text placement and block"');
    expect(html).toContain("Maximum tree depth reached.");
    expect(html.indexOf('role="tree"')).toBeLessThan(
      html.indexOf('aria-label="Edit Text placement and block"'),
    );
  });

  it("keeps fixture data and layout outside runtime and production boundaries", async () => {
    const fixtureSource = await readFile(
      new URL("./tree-results.fixtures.ts", import.meta.url),
      "utf8",
    );
    const layoutSource = await readFile(new URL("./tree-results.tsx", import.meta.url), "utf8");
    const outlineSource = await readFile(
      new URL("./formless-ui-tree-outline.tsx", import.meta.url),
      "utf8",
    );
    const rootSource = await readFile(new URL("../root.tsx", import.meta.url), "utf8");
    const productionScreenSource = await readFile(
      new URL("../../../../src/app/generated/screen.tsx", import.meta.url),
      "utf8",
    );

    expect(fixtureSource).not.toMatch(/\breact\b|formless-ui-contract-host|className=|tailwind/i);
    expect(outlineSource).toContain('from "@astryxdesign/core/TreeList"');
    expect(layoutSource).toContain("createFormlessUiMemoryContractHost");
    expect(layoutSource).toContain("useFormlessUiTreeResult");
    expect(layoutSource).toContain('columns={{ max: 2, minWidth: 320, repeat: "fit" }}');
    expect(`${fixtureSource}\n${layoutSource}\n${outlineSource}`).not.toMatch(
      /src\/(?:app|client|worker)|browser-replica|operation-controller|recordsById|rankPlan|sync|@dnd-kit|draggable|droppable/,
    );
    expect(rootSource).toContain("<FormlessTreeResultsLayout />");
    expect(productionScreenSource).not.toMatch(
      /FormlessTreeResultsLayout|AstryxTreeResultRenderer|tree-results\.fixtures/,
    );
  });
});

function requiredFixture(
  fixtures: readonly FormlessUiTreeResultFixture[],
  id: FormlessUiTreeResultFixtureId,
) {
  const fixture = fixtures.find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Missing ${id} tree-result fixture.`);
  }
  return fixture;
}

function collectTreeItems(
  items: readonly FormlessUiTreeItemContract[],
): FormlessUiTreeItemContract[] {
  return items.flatMap((item) => [item, ...collectTreeItems(item.children)]);
}

function findSelectedPath(
  items: readonly FormlessUiTreeItemContract[],
  ancestors: readonly FormlessUiTreeItemContract[] = [],
): FormlessUiTreeItemContract[] | undefined {
  for (const item of items) {
    const path = [...ancestors, item];
    if (item.selected) {
      return path;
    }
    const selectedPath = findSelectedPath(item.children, path);
    if (selectedPath) {
      return selectedPath;
    }
  }
  return undefined;
}

function dispatchFixtureTreeIntent(
  fixtureHost: ReturnType<typeof createFormlessUiTreeResultFixtureHost>,
  resultId: string,
  intent: FormlessUiTreeIntent,
) {
  void fixtureHost.host.dispatch({
    collectionId: "collection:tree-result-fixtures",
    intent,
    resultId,
    screenId: "workspace:tree-result-fixtures",
    sectionId: "section:tree-result-fixtures",
    type: "workspaceTree",
  });
}

function recordFieldDraft(field: FormlessUiField | undefined) {
  return field?.mode === "editor" && "drafts" in field ? field.drafts.draft : undefined;
}
