import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  FormlessUiButtonContract,
  FormlessUiContractIntent,
  FormlessUiOperationButtonContract,
  FormlessUiOperationControlContract,
  FormlessUiTreeIntent,
  FormlessUiTreeResultContract,
  FormlessUiWorkspaceTreeIntent,
} from "./formless-ui-contract.ts";
import {
  createFormlessUiMemoryContractHost,
  formlessUiContractReferenceKey,
  formlessUiTreeResultReference,
  formlessUiWorkspaceManifestReference,
  formlessUiWorkspaceSectionShellReference,
  type FormlessUiContractHostNodeSet,
  type FormlessUiTreeResultNode,
} from "./formless-ui-contract-host.ts";
import {
  FormlessUiContractHostProvider,
  useFormlessUiTreeResult,
} from "./formless-ui-contract-host-react.tsx";

const workspaceReference = formlessUiWorkspaceManifestReference("workspace:site");
const sectionReference = formlessUiWorkspaceSectionShellReference(
  workspaceReference.workspaceId,
  "section:pages",
);
const treeReference = formlessUiTreeResultReference({
  resultId: "tree:homepage",
  role: "mainResult",
  sectionId: sectionReference.sectionId,
  workspaceId: workspaceReference.workspaceId,
});

describe("Formless UI tree contract", () => {
  it("composes complete renderer-neutral tree data and canonical nested intents", () => {
    const tree = treeResult();
    const intents = treeIntents();
    const workspaceIntent: FormlessUiWorkspaceTreeIntent = {
      collectionId: "collection:pages",
      intent: intents[0]!,
      resultId: tree.id,
      screenId: workspaceReference.workspaceId,
      sectionId: sectionReference.sectionId,
      type: "workspaceTree",
    };
    const serialized = JSON.stringify({ intents, tree, workspaceIntent });

    expect(structuredClone({ intents, tree, workspaceIntent })).toEqual({
      intents,
      tree,
      workspaceIntent,
    });
    expect(intents.map(({ type }) => type)).toEqual([
      "treeItemSelection",
      "treeDisclosureOpenChange",
      "treeContextAction",
      "treeChildVariantSelection",
      "treeCreate",
      "treeField",
      "treeOperation",
      "treeReorder",
    ]);
    expect(tree.items[0]).toMatchObject({
      childRecordId: "block:hero",
      id: "tree-item:hero",
      placementId: "placement:hero",
    });
    expect(tree.selectedEditor).toMatchObject({
      childFields: { kind: "fieldSet" },
      placementFields: { kind: "fieldSet" },
      removePlacement: {
        confirmation: { kind: "destructiveConfirmation" },
        kind: "operationControl",
      },
    });
    expect(serialized).not.toMatch(
      /recordsById|relationship|schema|orderingContext|rankPlan|operationController|sync|className/,
    );
  });
});

describe("Formless UI tree-result host member", () => {
  it("provides typed reads, a stable reference key, and complete-set validation", () => {
    const nodes = treeNodes();
    const host = createFormlessUiMemoryContractHost({ nodes });
    const tree: FormlessUiTreeResultContract | undefined = host.read({ ...treeReference });

    expect(tree?.kind).toBe("treeResult");
    expect(formlessUiContractReferenceKey(treeReference)).toBe(
      JSON.stringify([
        "mainResult",
        "workspace:site",
        "section:pages",
        "treeResultReference",
        "tree:homepage",
      ]),
    );
    expect(() => host.publish(nodes.slice(0, -1))).toThrow("has no snapshot");
    expect(host.read(treeReference)).toBe(tree);

    const mismatchedNode: FormlessUiTreeResultNode = {
      reference: treeReference,
      snapshot: treeResult({ id: "tree:other" }),
    };
    expect(() => createFormlessUiMemoryContractHost({ nodes: [mismatchedNode] })).toThrow(
      "does not match reference",
    );
  });

  it("publishes tree results atomically with identity reuse and scoped removal", () => {
    const host = createFormlessUiMemoryContractHost({ nodes: treeNodes() });
    const initialWorkspace = host.read(workspaceReference);
    const initialSection = host.read(sectionReference);
    const initialTree = host.read(treeReference);
    const calls: string[] = [];
    let updatedLabelSeenFromTreeNotification: string | undefined;
    let removedTreeSeenFromWorkspaceNotification = true;

    host.subscribe(workspaceReference, () => {
      calls.push("workspace");
      removedTreeSeenFromWorkspaceNotification = host.read(treeReference) !== undefined;
    });
    host.subscribe(sectionReference, () => calls.push("section"));
    host.subscribe(treeReference, () => {
      calls.push("tree");
      updatedLabelSeenFromTreeNotification = host.read(treeReference)?.items[0]?.label;
    });

    host.publish(treeNodes());

    expect(calls).toEqual([]);
    expect(host.read(workspaceReference)).toBe(initialWorkspace);
    expect(host.read(sectionReference)).toBe(initialSection);
    expect(host.read(treeReference)).toBe(initialTree);

    host.publish(treeNodes({ itemLabel: "Updated hero" }));

    expect(calls).toEqual(["tree"]);
    expect(updatedLabelSeenFromTreeNotification).toBe("Updated hero");
    expect(host.read(workspaceReference)).toBe(initialWorkspace);
    expect(host.read(sectionReference)).toBe(initialSection);

    host.publish([]);

    expect(calls).toEqual(["tree", "workspace", "section", "tree"]);
    expect(removedTreeSeenFromWorkspaceNotification).toBe(false);
    expect(host.read(treeReference)).toBeUndefined();
  });

  it("keeps tree server snapshots stable for server rendering and hydration", () => {
    const serverNodes = treeNodes({ itemLabel: "Server hero" });
    const host = createFormlessUiMemoryContractHost({
      nodes: treeNodes({ itemLabel: "Client hero" }),
      serverNodes,
    });
    const serverTree = host.getServerSnapshot(treeReference);

    expect(serverTree?.items[0]?.label).toBe("Server hero");
    expect(host.read(treeReference)?.items[0]?.label).toBe("Client hero");
    expect(host.getServerSnapshot(treeReference)).toBe(serverTree);
    expect(
      renderToStaticMarkup(
        <FormlessUiContractHostProvider host={host}>
          <TreeItemLabel />
        </FormlessUiContractHostProvider>,
      ),
    ).toContain("Server hero");
  });

  it("dispatches the scoped canonical workspace tree intent", async () => {
    const calls: FormlessUiContractIntent[] = [];
    const host = createFormlessUiMemoryContractHost({
      dispatch: (intent) => {
        calls.push(intent);
      },
      nodes: treeNodes(),
    });
    const intent: FormlessUiWorkspaceTreeIntent = {
      collectionId: "collection:pages",
      intent: treeIntents()[7]!,
      resultId: treeReference.resultId,
      screenId: workspaceReference.workspaceId,
      sectionId: sectionReference.sectionId,
      type: "workspaceTree",
    };

    await host.dispatch(intent);

    expect(calls).toEqual([intent]);
  });
});

function TreeItemLabel() {
  const tree = useFormlessUiTreeResult(treeReference);
  return <span>{tree?.items[0]?.label}</span>;
}

function treeNodes({
  itemLabel = "Hero",
}: { itemLabel?: string } = {}): FormlessUiContractHostNodeSet {
  return [
    {
      reference: workspaceReference,
      snapshot: {
        accessibilityLabel: "Site workspace",
        actions: [],
        id: workspaceReference.workspaceId,
        kind: "workspaceManifest",
        label: "Site",
        sections: [sectionReference],
      },
    },
    {
      reference: sectionReference,
      snapshot: {
        accessibilityLabel: "Pages section",
        actions: [],
        collection: {
          accessibilityLabel: "Page tree",
          availability: { state: "ready" },
          id: "collection:pages",
          kind: "workspaceCollection",
          label: "Pages",
          presentation: {
            actions: {
              id: "collection:pages:actions",
              kind: "workspaceCollectionActions",
              primary: [],
              secondary: [],
              secondaryAccessibilityLabel: "More page actions",
            },
            kind: "ordinary",
            result: treeReference,
            summaries: [],
          },
          selectedQueryId: null,
        },
        headingVisibility: "visible",
        id: sectionReference.sectionId,
        kind: "workspaceSectionShell",
        label: "Pages",
      },
    },
    {
      reference: treeReference,
      snapshot: treeResult({ itemLabel }),
    },
  ];
}

function treeResult({
  id = treeReference.resultId,
  itemLabel = "Hero",
}: {
  id?: string;
  itemLabel?: string;
} = {}): FormlessUiTreeResultContract {
  const resultId = id;
  const itemId = "tree-item:hero";
  const parent = { itemId, kind: "item" as const };
  const warning = {
    id: "warning:child-readiness",
    items: [{ code: "missing-reference", message: "Image reference is unavailable." }],
    kind: "treeWarning" as const,
    source: "child" as const,
    title: "Child needs attention",
  };

  return {
    accessibilityLabel: "Homepage block tree",
    availability: { state: "ready" },
    density: "default",
    editing: { enabled: true },
    feedback: [
      {
        detail: "Placement moved.",
        id: "feedback:move",
        intent: "success",
        kind: "operationFeedbackEvent",
        status: "committed",
        title: "Move complete",
      },
    ],
    id: resultId,
    items: [
      {
        accessibilityLabel: `${itemLabel} block`,
        availability: { available: true },
        childRecordId: "block:hero",
        children: [],
        contextActions: [
          {
            availability: { available: true },
            control: button("control:open-hero", "Open hero"),
            id: "action:open-hero",
            intent: {
              actionId: "action:open-hero",
              itemId,
              resultId,
              type: "treeContextAction",
            },
            kind: "treeContextAction",
          },
        ],
        disclosure: {
          accessibilityLabel: "Collapse Hero",
          id: "disclosure:hero",
          intent: {
            itemId,
            open: false,
            resultId,
            type: "treeDisclosureOpenChange",
          },
          kind: "treeItemDisclosure",
          open: true,
        },
        id: itemId,
        kind: "treeItem",
        label: itemLabel,
        ordering: {
          accessibilityLabel: "Order Hero",
          actions: [
            {
              direction: "down",
              id: "order:hero:down",
              intent: {
                actionId: "order:hero:down",
                direction: "down",
                itemId,
                resultId,
                type: "treeReorder",
              },
              label: "Move down",
              structurallyAvailable: true,
            },
          ],
          affordance: "reorder",
          id: "ordering:hero",
          kind: "treeOrdering",
          pending: false,
        },
        placementId: "placement:hero",
        selected: true,
        selectionIntent: { itemId, resultId, type: "treeItemSelection" },
        slot: { id: "slot:main", kind: "treeItemSlot", label: "Main" },
        structure: { state: "branch" },
        variant: { id: "variant:hero", kind: "treeItemVariant", label: "Hero" },
        warnings: [warning],
      },
    ],
    kind: "treeResult",
    root: {
      accessibilityLabel: "Homepage root",
      id: "page:homepage",
      kind: "treeRoot",
      label: "Homepage",
    },
    rootChildCreation: childCreation(resultId, { kind: "root" }),
    selectedEditor: {
      accessibilityLabel: "Edit Hero placement and block",
      availability: { available: true },
      childCreation: childCreation(resultId, parent),
      childFields: fieldSet("fields:hero", "Block fields"),
      childRecordId: "block:hero",
      editing: { enabled: true },
      id: "editor:hero",
      itemId,
      kind: "treeSelectedEditor",
      placementFields: fieldSet("fields:hero-placement", "Placement fields"),
      placementId: "placement:hero",
      removePlacement: removePlacementControl(),
      warnings: [warning],
    },
    status: {
      accessibilityLabel: "Tree authoring status",
      detail: "All changes saved.",
      id: "status:tree",
      intent: "success",
      kind: "compactStatus",
      label: "Saved",
      status: "committed",
    },
    warnings: [],
  };
}

function childCreation(
  resultId: string,
  parent: { kind: "root" } | { itemId: string; kind: "item" },
): NonNullable<FormlessUiTreeResultContract["rootChildCreation"]> {
  const variantId = parent.kind === "root" ? "variant:root:hero" : "variant:hero:text";
  return {
    accessibilityLabel: "Allowed child blocks",
    activeCreateSurface: createSurface(),
    activeVariantId: variantId,
    id: `children:${variantId}`,
    kind: "treeChildCreation",
    variants: [
      {
        availability: { available: true },
        id: variantId,
        kind: "treeChildVariant",
        label: "Text",
        selected: true,
        selectionIntent: {
          parent,
          resultId,
          variantId,
          type: "treeChildVariantSelection",
        },
        slot: { id: "slot:main", kind: "treeItemSlot", label: "Main" },
      },
    ],
  };
}

function createSurface() {
  return {
    dialog: {
      form: {
        cancel: button("control:create-cancel", "Cancel"),
        errors: [],
        fieldSet: fieldSet("fields:create-child", "New child fields"),
        id: "form:create-child",
        kind: "createForm" as const,
        submit: { ...button("control:create-submit", "Create"), type: "submit" as const },
      },
      id: "dialog:create-child",
      kind: "createDialog" as const,
      open: true,
      title: "Add child",
    },
    id: "surface:create-child",
    kind: "createSurface" as const,
    trigger: button("control:create-open", "Add child"),
  };
}

function fieldSet(id: string, label: string) {
  return {
    disabled: false,
    fields: [],
    id,
    kind: "fieldSet" as const,
    label,
  };
}

function removePlacementControl(): FormlessUiOperationControlContract {
  return {
    confirmation: {
      action: operationButton("control:remove-confirm", "Remove", "destructive", {
        controlId: "operation:remove-placement",
        invocationSource: "confirmationDialog",
        type: "operationInvoke",
      }),
      cancel: operationButton("control:remove-cancel", "Cancel", "secondary", {
        controlId: "operation:remove-placement",
        open: false,
        type: "operationConfirmationOpenChange",
      }),
      closeIntent: {
        controlId: "operation:remove-placement",
        open: false,
        type: "operationConfirmationOpenChange",
      },
      description: "Remove this placement from the page.",
      id: "confirmation:remove-placement",
      kind: "destructiveConfirmation",
      open: true,
      title: "Remove placement?",
    },
    id: "operation:remove-placement",
    kind: "operationControl",
    status: {
      accessibilityLabel: "Remove placement status",
      detail: "Ready to remove.",
      id: "status:remove-placement",
      intent: "neutral",
      kind: "compactStatus",
      label: "Ready",
      status: "idle",
    },
    trigger: operationButton("control:remove-open", "Remove placement", "destructive", {
      controlId: "operation:remove-placement",
      open: true,
      type: "operationConfirmationOpenChange",
    }),
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
  prominence: FormlessUiOperationButtonContract["prominence"],
  intent: FormlessUiOperationButtonContract["intent"],
): FormlessUiOperationButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    intent,
    kind: "button",
    prominence,
    type: "button",
  };
}

function treeIntents(): readonly FormlessUiTreeIntent[] {
  const resultId = treeReference.resultId;
  const itemId = "tree-item:hero";
  const parent = { itemId, kind: "item" as const };
  return [
    { itemId, resultId, type: "treeItemSelection" },
    { itemId, open: false, resultId, type: "treeDisclosureOpenChange" },
    { actionId: "action:open-hero", itemId, resultId, type: "treeContextAction" },
    {
      parent,
      resultId,
      type: "treeChildVariantSelection",
      variantId: "variant:hero:text",
    },
    {
      intent: { open: true, surfaceId: "surface:create-child", type: "createOpenChange" },
      parent,
      resultId,
      surfaceId: "surface:create-child",
      type: "treeCreate",
    },
    {
      fieldId: "field:placement:slot",
      intent: { fieldName: "slot", type: "recordEditorDraftChange", value: "main" },
      resultId,
      target: { fieldSetId: "fields:hero-placement", itemId, kind: "placement" },
      type: "treeField",
    },
    {
      controlId: "operation:remove-placement",
      intent: {
        controlId: "operation:remove-placement",
        invocationSource: "confirmationDialog",
        type: "operationInvoke",
      },
      itemId,
      resultId,
      type: "treeOperation",
    },
    {
      actionId: "order:hero:down",
      direction: "down",
      itemId,
      resultId,
      type: "treeReorder",
    },
  ];
}
