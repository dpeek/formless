import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  FormlessUiButtonContract,
  FormlessUiCreateSurfaceContract,
  FormlessUiOperationButtonContract,
  FormlessUiOperationControlContract,
  FormlessUiTreeItemContract,
  FormlessUiTreeResultContract,
} from "@dpeek/formless-astryx/contract";
import {
  createFormlessUiMemoryContractHost,
  formlessUiTreeResultReference,
} from "@dpeek/formless-astryx/contract-host";
import { FormlessUiContractHostProvider } from "@dpeek/formless-astryx/contract-host/react";
import { LegacySubscribedTreeRenderer, LegacyTreeRenderer } from "./legacy-tree-renderer.tsx";

const treeReference = formlessUiTreeResultReference({
  resultId: "tree:site",
  role: "mainResult",
  sectionId: "section:composition",
  workspaceId: "workspace:site",
});
const treeScope = {
  collectionId: "collection:composition",
  screenId: treeReference.workspaceId,
  sectionId: treeReference.sectionId,
};

describe("legacy tree renderer", () => {
  it("renders complete canonical tree capabilities from a pure snapshot", () => {
    const html = renderToStaticMarkup(
      <LegacyTreeRenderer onIntent={() => undefined} tree={treeContract()} />,
    );

    expect(html).toContain('data-formless-legacy-tree-result="tree:site"');
    expect(html).toContain('data-formless-legacy-tree-item="tree:site:item:hero"');
    expect(html).toContain('data-formless-legacy-tree-editor="tree:site:editor:hero"');
    expect(html).toContain('data-formless-legacy-tree-ordering="tree:site:hero:ordering"');
    expect(html).toContain('data-formless-legacy-tree-child-creation="tree:site:hero:children"');
    expect(html).toContain("Homepage");
    expect(html).toContain("Hero");
    expect(html).toContain("Main");
    expect(html).toContain(
      'data-formless-legacy-tree-ordering-actions="Move to top|Move to up|Move to down|Move to bottom"',
    );
    expect(html).toContain("Open block");
    expect(html).toContain("Placement fields");
    expect(html).toContain("Child fields");
    expect(html).toContain("Add child");
    expect(html).toContain('data-formless-legacy-tree-child-variants="Markdown"');
    expect(html).toContain("Remove placement");
    expect(html).toContain("Placement label is recommended.");
    expect(html).toContain("Missing child record.");
    expect(html).not.toContain("Delete child record");
    expect(html).not.toContain("data-formless-sortable-tree-placement");
  });

  it("subscribes by scoped tree reference and delegates to the pure snapshot renderer", () => {
    const tree = treeContract();
    const host = createFormlessUiMemoryContractHost({
      dispatch: () => undefined,
      nodes: [{ reference: treeReference, snapshot: tree }],
    });
    const subscribedHtml = renderToStaticMarkup(
      <FormlessUiContractHostProvider host={host}>
        <LegacySubscribedTreeRenderer reference={treeReference} scope={treeScope} />
      </FormlessUiContractHostProvider>,
    );
    const pureHtml = renderToStaticMarkup(
      <LegacyTreeRenderer onIntent={() => undefined} tree={tree} />,
    );

    expect(subscribedHtml).toBe(pureHtml);
    expect(subscribedHtml).toContain('data-formless-legacy-tree-result="tree:site"');
  });

  it("keeps runtime models, reads, controllers, storage, and sync outside the legacy seam", () => {
    const source = readFileSync(new URL("./legacy-tree-renderer.tsx", import.meta.url), "utf8");
    const screenSource = readFileSync(new URL("./screen.tsx", import.meta.url), "utf8");
    const collectionSource = readFileSync(
      new URL("./legacy-workspace-collection-renderer.tsx", import.meta.url),
      "utf8",
    );

    for (const excludedImport of [
      "../../client/",
      "./generated-tree-foundation",
      "./operation-control-runtime",
      "./ordering-ui",
      "./schema-app-context",
      "./tree.tsx",
    ]) {
      expect(source).not.toContain(excludedImport);
    }
    expect(screenSource).not.toContain("generatedWorkspaceRuntimeRendererIsAvailable");
    expect(screenSource).not.toContain("./tree.tsx");
    expect(collectionSource).toContain("LegacySubscribedTreeRenderer");
    expect(collectionSource).toContain("LegacyTreeRenderer");
  });
});

function treeContract(): FormlessUiTreeResultContract {
  const item = treeItem("hero", "Hero", true, { state: "branch" });
  const missing = treeItem("missing", "Missing child", false, {
    message: "Missing child record.",
    state: "missingChild",
  });
  const childCreation = {
    accessibilityLabel: "Allowed child blocks",
    activeCreateSurface: createSurface(),
    activeVariantId: "tree:site:hero:variant:markdown",
    id: "tree:site:hero:children",
    kind: "treeChildCreation" as const,
    variants: [
      {
        availability: { available: true } as const,
        id: "tree:site:hero:variant:markdown",
        kind: "treeChildVariant" as const,
        label: "Markdown",
        selected: true,
        selectionIntent: {
          parent: { itemId: item.id, kind: "item" as const },
          resultId: "tree:site",
          type: "treeChildVariantSelection" as const,
          variantId: "tree:site:hero:variant:markdown",
        },
        slot: { id: "slot:main", kind: "treeItemSlot" as const, label: "Main" },
      },
    ],
  };

  return {
    accessibilityLabel: "Homepage composition",
    availability: { state: "ready" },
    density: "default",
    editing: { enabled: true },
    feedback: [],
    id: "tree:site",
    items: [
      {
        ...item,
        children: [missing],
        contextActions: [
          {
            availability: { available: true },
            control: button("tree:site:hero:open", "Open block"),
            id: "tree:site:hero:context",
            intent: {
              actionId: "tree:site:hero:context",
              itemId: item.id,
              resultId: "tree:site",
              type: "treeContextAction",
            },
            kind: "treeContextAction",
          },
        ],
        ordering: {
          accessibilityLabel: "Order Hero",
          actions: (["top", "up", "down", "bottom"] as const).map((direction) => ({
            direction,
            id: `tree:site:hero:order:${direction}`,
            intent: {
              actionId: `tree:site:hero:order:${direction}`,
              direction,
              itemId: item.id,
              resultId: "tree:site",
              type: "treeReorder" as const,
            },
            label: `Move to ${direction}`,
            structurallyAvailable: true,
          })),
          affordance: "reorder",
          id: "tree:site:hero:ordering",
          kind: "treeOrdering",
          pending: false,
        },
      },
    ],
    kind: "treeResult",
    root: {
      accessibilityLabel: "Homepage tree root",
      id: "tree:site:root",
      kind: "treeRoot",
      label: "Homepage",
    },
    selectedEditor: {
      accessibilityLabel: "Edit Hero placement and block",
      availability: { available: true },
      childCreation,
      childFields: {
        disabled: false,
        fields: [],
        id: "tree:site:hero:child-fields",
        kind: "fieldSet",
        label: "Child fields",
      },
      childRecordId: "block:hero",
      editing: { enabled: true },
      id: "tree:site:editor:hero",
      itemId: item.id,
      kind: "treeSelectedEditor",
      placementFields: {
        disabled: false,
        fields: [],
        id: "tree:site:hero:placement-fields",
        kind: "fieldSet",
        label: "Placement fields",
      },
      placementId: item.placementId,
      removePlacement: removePlacementControl(),
      warnings: [
        {
          id: "tree:site:hero:placement-warning",
          items: [{ code: "placement-label", message: "Placement label is recommended." }],
          kind: "treeWarning",
          source: "placement",
          title: "Placement readiness",
        },
      ],
    },
    warnings: [],
  };
}

function treeItem(
  id: string,
  label: string,
  available: boolean,
  structure: FormlessUiTreeItemContract["structure"],
): FormlessUiTreeItemContract {
  const itemId = `tree:site:item:${id}`;
  return {
    accessibilityLabel: label,
    availability: available
      ? { available: true }
      : { available: false, message: "Child unavailable." },
    children: [],
    contextActions: [],
    id: itemId,
    kind: "treeItem",
    label,
    placementId: `placement:${id}`,
    selected: id === "hero",
    selectionIntent: { itemId, resultId: "tree:site", type: "treeItemSelection" },
    slot: { id: `slot:${id}`, kind: "treeItemSlot", label: "Main" },
    structure,
    variant: { id: `variant:${id}`, kind: "treeItemVariant", label },
    warnings: [],
  };
}

function createSurface(): FormlessUiCreateSurfaceContract {
  const id = "tree:site:hero:create";
  return {
    dialog: {
      form: {
        cancel: button(`${id}:cancel`, "Cancel"),
        errors: [],
        fieldSet: {
          disabled: false,
          fields: [],
          id: `${id}:fields`,
          kind: "fieldSet",
          label: "New child",
        },
        id: `${id}:form`,
        kind: "createForm",
        submit: {
          ...button(`${id}:submit`, "Create child"),
          prominence: "primary",
          type: "submit",
        },
      },
      id: `${id}:dialog`,
      kind: "createDialog",
      open: true,
      title: "Add Markdown",
    },
    id,
    kind: "createSurface",
    trigger: button(`${id}:open`, "Add child"),
  };
}

function removePlacementControl(): FormlessUiOperationControlContract {
  const controlId = "tree:site:hero:remove";
  const trigger = operationButton(controlId, "Remove placement", {
    controlId,
    invocationSource: "button",
    type: "operationInvoke",
  });
  return {
    confirmation: {
      action: operationButton(`${controlId}:confirm`, "Remove", {
        controlId,
        invocationSource: "confirmationDialog",
        type: "operationInvoke",
      }),
      cancel: operationButton(`${controlId}:cancel`, "Cancel", {
        controlId,
        open: false,
        type: "operationConfirmationOpenChange",
      }),
      closeIntent: { controlId, open: false, type: "operationConfirmationOpenChange" },
      description: "This removes the placement only.",
      id: `${controlId}:confirmation`,
      kind: "destructiveConfirmation",
      open: true,
      title: "Remove placement?",
    },
    id: controlId,
    kind: "operationControl",
    status: {
      accessibilityLabel: "Remove placement status",
      detail: "Ready",
      id: `${controlId}:status`,
      intent: "neutral",
      kind: "compactStatus",
      label: "Ready",
      status: "idle",
    },
    trigger,
  };
}

function button(id: string, label: string): FormlessUiButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    prominence: "secondary",
    type: "button",
  };
}

function operationButton(
  id: string,
  label: string,
  intent: FormlessUiOperationButtonContract["intent"],
): FormlessUiOperationButtonContract {
  return {
    ...button(id, label),
    intent,
    prominence: label === "Remove" ? "destructive" : "secondary",
  };
}
