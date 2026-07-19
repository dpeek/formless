import { Banner } from "@astryxdesign/core/Banner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import type {
  FormlessUiCreateField,
  FormlessUiFieldSetContract,
  FormlessUiTreeChildCreationContract,
  FormlessUiTreeIntent,
  FormlessUiTreeIntentHandler,
  FormlessUiTreeItemContract,
  FormlessUiTreeResultContract,
  FormlessUiTreeResultReference,
  FormlessUiTreeSelectedEditorContract,
  FormlessUiWorkspaceIntentHandler,
  FormlessUiWorkspaceIntentScope,
} from "../formless-ui-contract.ts";
import {
  createFormlessUiMemoryContractHost,
  formlessUiTreeResultReference,
  isFormlessUiWorkspaceIntent,
  type FormlessUiContractHostNodeSet,
  type FormlessUiMutableContractHost,
} from "../formless-ui-contract-host.ts";
import {
  FormlessUiContractHostProvider,
  useFormlessUiTreeResult,
  useFormlessUiWorkspaceIntentHandler,
} from "../formless-ui-contract-host-react.tsx";
import { applyScenarioFieldIntent } from "./fields/fixture-helpers.ts";
import { FormlessFixtureFrame, FormlessFixtureSelector } from "./fixture-layout.tsx";
import {
  createFormlessUiTreeResultFixtures,
  type FormlessUiTreeResultFixture,
  type FormlessUiTreeResultFixtureId,
} from "./tree-results.fixtures.ts";
import { AstryxTreeOutline } from "./formless-ui-tree-outline.tsx";
import { AstryxTreeResultSignals } from "./formless-ui-tree-actions.tsx";
import { AstryxTreeChildCreation } from "./formless-ui-tree-child-creation.tsx";
import { AstryxTreeSelectedEditor } from "./formless-ui-tree-selected-editor.tsx";

export function FormlessTreeResultsLayout() {
  const [fixtureHost] = useState(() =>
    createFormlessUiTreeResultFixtureHost(createFormlessUiTreeResultFixtures()),
  );
  const [selectedFixtureId, setSelectedFixtureId] =
    useState<FormlessUiTreeResultFixtureId>("shallow");

  return (
    <FormlessFixtureFrame
      ariaLabel="Tree result fixtures"
      controls={
        <FormlessFixtureSelector
          label="Tree state"
          onSelectionChange={setSelectedFixtureId}
          options={fixtureHost.fixtures}
          selectedId={selectedFixtureId}
        />
      }
    >
      <main>
        <VStack hAlign="center" paddingBlock={6} paddingInline={4} width="100%">
          <VStack gap={5} maxWidth={1200} width="100%">
            <Heading level={1}>Tree Results</Heading>
            <FormlessUiContractHostProvider host={fixtureHost.host}>
              <AstryxSubscribedTreeResultRenderer
                reference={fixtureHost.referenceFor(selectedFixtureId)}
                scope={treeFixtureWorkspaceScope}
              />
            </FormlessUiContractHostProvider>
          </VStack>
        </VStack>
      </main>
    </FormlessFixtureFrame>
  );
}

export type FormlessUiTreeResultFixtureHost = {
  fixtures: readonly FormlessUiTreeResultFixture[];
  getTree(fixtureId: FormlessUiTreeResultFixtureId): FormlessUiTreeResultContract;
  host: FormlessUiMutableContractHost;
  referenceFor(fixtureId: FormlessUiTreeResultFixtureId): FormlessUiTreeResultReference;
};

export function createFormlessUiTreeResultFixtureHost(
  fixtures: readonly FormlessUiTreeResultFixture[],
): FormlessUiTreeResultFixtureHost {
  const trees = new Map(fixtures.map((fixture) => [fixture.id, structuredClone(fixture.tree)]));
  const references = new Map(
    fixtures.map((fixture) => [fixture.id, treeFixtureReference(fixture.tree)]),
  );
  let host: FormlessUiMutableContractHost;

  host = createFormlessUiMemoryContractHost({
    dispatch: (intent) => {
      if (!isFormlessUiWorkspaceIntent(intent)) {
        throw new Error("Tree-result fixture host received a non-workspace intent.");
      }
      if (intent.type !== "workspaceTree") {
        return;
      }
      if (
        intent.screenId !== treeFixtureWorkspaceScope.screenId ||
        intent.sectionId !== treeFixtureWorkspaceScope.sectionId ||
        intent.collectionId !== treeFixtureWorkspaceScope.collectionId
      ) {
        return;
      }

      const fixture = fixtures.find((candidate) => candidate.tree.id === intent.resultId);
      const tree = fixture ? trees.get(fixture.id) : undefined;
      if (!fixture || !tree) {
        return;
      }

      const nextTree = applyFormlessUiTreeResultFixtureIntent(tree, intent.intent);
      if (nextTree === tree) {
        return;
      }

      trees.set(fixture.id, nextTree);
      host.publish(projectFormlessUiTreeResultFixtureNodes(fixtures, trees));
    },
    nodes: projectFormlessUiTreeResultFixtureNodes(fixtures, trees),
  });

  return {
    fixtures,
    getTree: (fixtureId) => {
      const tree = trees.get(fixtureId);
      if (!tree) {
        throw new Error(`Missing ${fixtureId} tree-result fixture.`);
      }
      return tree;
    },
    host,
    referenceFor: (fixtureId) => {
      const reference = references.get(fixtureId);
      if (!reference) {
        throw new Error(`Missing ${fixtureId} tree-result fixture reference.`);
      }
      return reference;
    },
  };
}

export function projectFormlessUiTreeResultFixtureNodes(
  fixtures: readonly FormlessUiTreeResultFixture[],
  trees: ReadonlyMap<FormlessUiTreeResultFixtureId, FormlessUiTreeResultContract> = new Map(
    fixtures.map((fixture) => [fixture.id, fixture.tree]),
  ),
): FormlessUiContractHostNodeSet {
  return fixtures.map((fixture) => {
    const tree = trees.get(fixture.id);
    if (!tree) {
      throw new Error(`Missing ${fixture.id} tree-result fixture.`);
    }
    return { reference: treeFixtureReference(tree), snapshot: tree };
  });
}

export function AstryxSubscribedTreeResultRenderer({
  reference,
  scope,
}: {
  reference: FormlessUiTreeResultReference;
  scope: FormlessUiWorkspaceIntentScope;
}) {
  const tree = useFormlessUiTreeResult(reference);
  const onIntent = useFormlessUiWorkspaceIntentHandler();

  return tree ? (
    <AstryxTreeResultRenderer
      onIntent={(intent) => dispatchAstryxWorkspaceTreeIntent(onIntent, scope, tree.id, intent)}
      tree={tree}
    />
  ) : null;
}

export function AstryxTreeResultRenderer({
  onIntent = ignoreTreeIntent,
  tree,
}: {
  onIntent?: FormlessUiTreeIntentHandler;
  tree: FormlessUiTreeResultContract;
}) {
  if (tree.availability.state === "empty") {
    return (
      <VStack gap={3} width="100%">
        <EmptyState
          description={tree.availability.emptyState.description}
          title={tree.availability.emptyState.title}
        />
        {tree.rootChildCreation ? (
          <AstryxTreeChildCreation
            creation={tree.rootChildCreation}
            onIntent={onIntent}
            parent={{ kind: "root" }}
            resultId={tree.id}
          />
        ) : null}
      </VStack>
    );
  }

  if (tree.availability.state === "unavailable") {
    return <Banner container="card" status="warning" title={tree.availability.message} />;
  }

  const selectedItem = findSelectedTreeItem(tree.items);

  return (
    <Grid
      aria-label={tree.accessibilityLabel}
      columns={{ max: 2, minWidth: 320, repeat: "fit" }}
      data-formless-astryx-tree-layout={tree.id}
      gap={5}
      width="100%"
    >
      <VStack gap={3} width="100%">
        <AstryxTreeResultSignals tree={tree} />
        <AstryxTreeOutline onIntent={onIntent} tree={tree} />
        {tree.rootChildCreation ? (
          <AstryxTreeChildCreation
            creation={tree.rootChildCreation}
            onIntent={onIntent}
            parent={{ kind: "root" }}
            resultId={tree.id}
          />
        ) : null}
      </VStack>
      <AstryxTreeSelectedEditor
        editor={tree.selectedEditor}
        onIntent={onIntent}
        selectedItem={selectedItem}
        tree={tree}
      />
    </Grid>
  );
}

function findSelectedTreeItem(
  items: readonly FormlessUiTreeItemContract[],
): FormlessUiTreeItemContract | undefined {
  for (const item of items) {
    if (item.selected) {
      return item;
    }
    const selectedChild = findSelectedTreeItem(item.children);
    if (selectedChild) {
      return selectedChild;
    }
  }
  return undefined;
}

export function dispatchAstryxWorkspaceTreeIntent(
  handler: FormlessUiWorkspaceIntentHandler,
  scope: FormlessUiWorkspaceIntentScope,
  resultId: string,
  intent: FormlessUiTreeIntent,
) {
  if (intent.resultId !== resultId) {
    return;
  }

  return handler({ ...scope, intent, resultId, type: "workspaceTree" });
}

export function applyFormlessUiTreeResultFixtureIntent(
  tree: FormlessUiTreeResultContract,
  intent: FormlessUiTreeIntent,
): FormlessUiTreeResultContract {
  if (intent.resultId !== tree.id) {
    return tree;
  }

  if (intent.type === "treeItemSelection") {
    const item = findTreeItem(tree.items, intent.itemId);
    if (!item?.availability.available) {
      return tree;
    }

    return {
      ...tree,
      items: selectTreeItem(tree.items, item.id),
      selectedEditor: fixtureSelectedEditorForItem(tree, item),
    };
  }

  if (intent.type === "treeDisclosureOpenChange") {
    const disclosureItem = findTreeItem(tree.items, intent.itemId);
    if (
      !disclosureItem?.availability.available ||
      !disclosureItem.disclosure ||
      disclosureItem.disclosure.open === intent.open
    ) {
      return tree;
    }
    const updated = updateTreeItem(tree.items, intent.itemId, (item) =>
      item.disclosure
        ? {
            ...item,
            disclosure: {
              ...item.disclosure,
              accessibilityLabel: `${intent.open ? "Collapse" : "Expand"} ${item.label}`,
              intent: { ...item.disclosure.intent, open: !intent.open },
              open: intent.open,
            },
          }
        : item,
    );
    return updated === tree.items ? tree : { ...tree, items: updated };
  }

  if (intent.type === "treeContextAction") {
    const item = findTreeItem(tree.items, intent.itemId);
    const action = item?.contextActions.find(
      (candidate) => candidate.id === intent.actionId && candidate.availability.available,
    );
    if (!item?.availability.available || !action) {
      return tree;
    }

    return {
      ...tree,
      feedback: [
        ...tree.feedback,
        {
          detail: `${item.label} context action handled by the fixture host.`,
          id: `${action.id}:fixture:committed`,
          intent: "success",
          kind: "operationFeedbackEvent",
          status: "committed",
          title: action.control.accessibilityLabel,
        },
      ],
    };
  }

  if (intent.type === "treeChildVariantSelection") {
    return updateTreeChildCreation(tree, intent.parent, (creation) => {
      const variant = creation.variants.find(
        (candidate) => candidate.id === intent.variantId && candidate.availability.available,
      );
      if (!variant) {
        return creation;
      }

      return {
        ...creation,
        activeVariantId: variant.id,
        variants: creation.variants.map((candidate) => ({
          ...candidate,
          selected: candidate.id === variant.id,
        })),
      };
    });
  }

  if (intent.type === "treeCreate") {
    return updateTreeChildCreation(tree, intent.parent, (creation) => {
      const surface = creation.activeCreateSurface;
      if (!surface || surface.id !== intent.surfaceId || intent.intent.surfaceId !== surface.id) {
        return creation;
      }
      return {
        ...creation,
        activeCreateSurface: {
          ...surface,
          dialog: {
            ...surface.dialog,
            open: intent.intent.type === "createOpenChange" ? intent.intent.open : false,
          },
        },
      };
    });
  }

  if (intent.type === "treeField") {
    if (intent.target.kind === "create") {
      const target = intent.target;
      return updateTreeChildCreation(tree, target.parent, (creation) => {
        const surface = creation.activeCreateSurface;
        const field = surface?.dialog.form.fieldSet.fields.find(
          (candidate) => candidate.fieldId === intent.fieldId,
        );
        if (!surface || surface.id !== target.surfaceId || !field) {
          return creation;
        }
        const nextField = applyScenarioFieldIntent(field, intent.intent) as FormlessUiCreateField;
        if (nextField === field) {
          return creation;
        }
        return {
          ...creation,
          activeCreateSurface: {
            ...surface,
            dialog: {
              ...surface.dialog,
              form: {
                ...surface.dialog.form,
                fieldSet: {
                  ...surface.dialog.form.fieldSet,
                  fields: surface.dialog.form.fieldSet.fields.map((candidate) =>
                    candidate.fieldId === field.fieldId ? nextField : candidate,
                  ),
                },
              },
            },
          },
        };
      });
    }

    const editor = tree.selectedEditor;
    if (!editor || editor.itemId !== intent.target.itemId) {
      return tree;
    }

    const fieldSet =
      intent.target.kind === "placement" ? editor.placementFields : editor.childFields;
    if (!fieldSet || fieldSet.id !== intent.target.fieldSetId) {
      return tree;
    }

    const field = fieldSet.fields.find((candidate) => candidate.fieldId === intent.fieldId);
    if (!field) {
      return tree;
    }
    const nextField = applyScenarioFieldIntent(field, intent.intent);
    if (nextField === field) {
      return tree;
    }

    const nextFieldSet = {
      ...fieldSet,
      fields: fieldSet.fields.map((candidate) =>
        candidate.fieldId === field.fieldId ? nextField : candidate,
      ),
    };
    return {
      ...tree,
      selectedEditor: {
        ...editor,
        ...(intent.target.kind === "placement"
          ? { placementFields: nextFieldSet }
          : { childFields: nextFieldSet }),
      },
    };
  }

  if (intent.type === "treeOperation") {
    const editor = tree.selectedEditor;
    const control = editor?.removePlacement;
    if (
      !editor ||
      editor.itemId !== intent.itemId ||
      !control ||
      control.id !== intent.controlId ||
      intent.intent.controlId !== control.id
    ) {
      return tree;
    }

    if (intent.intent.type === "operationConfirmationOpenChange") {
      if (!control.confirmation) {
        return tree;
      }
      return {
        ...tree,
        selectedEditor: {
          ...editor,
          removePlacement: {
            ...control,
            confirmation: { ...control.confirmation, open: intent.intent.open },
          },
        },
      };
    }

    if (control.confirmation && !control.confirmation.open) {
      return tree;
    }

    const items = removeTreeItem(tree.items, editor.itemId);
    const fallback = firstAvailableTreeItem(items);
    return {
      ...tree,
      feedback: [
        ...tree.feedback,
        {
          detail: "Placement removed without deleting its child record.",
          id: `${control.id}:fixture:committed`,
          intent: "success",
          kind: "operationFeedbackEvent",
          status: "committed",
          title: "Placement removed",
        },
      ],
      items: fallback ? selectTreeItem(items, fallback.id) : items,
      selectedEditor: fallback ? fixtureSelectedEditorForItem(tree, fallback) : undefined,
    };
  }

  const item = findTreeItem(tree.items, intent.itemId);
  const action = item?.ordering?.actions.find(
    (candidate) =>
      candidate.id === intent.actionId &&
      candidate.direction === intent.direction &&
      candidate.intent.actionId === intent.actionId &&
      candidate.intent.itemId === intent.itemId,
  );
  if (
    !item?.availability.available ||
    !item.ordering ||
    item.ordering.pending ||
    !action?.structurallyAvailable ||
    action.disabled ||
    action.pending?.isPending
  ) {
    return tree;
  }

  const reordered = reorderTreeItem(tree.items, intent.itemId, intent.direction);
  return reordered === tree.items ? tree : { ...tree, items: reordered };
}

function updateTreeChildCreation(
  tree: FormlessUiTreeResultContract,
  parent: Extract<FormlessUiTreeIntent, { type: "treeChildVariantSelection" }>["parent"],
  update: (creation: FormlessUiTreeChildCreationContract) => FormlessUiTreeChildCreationContract,
) {
  if (parent.kind === "root") {
    if (!tree.rootChildCreation) {
      return tree;
    }
    const rootChildCreation = update(tree.rootChildCreation);
    return rootChildCreation === tree.rootChildCreation ? tree : { ...tree, rootChildCreation };
  }

  const editor = tree.selectedEditor;
  if (!editor?.childCreation || editor.itemId !== parent.itemId) {
    return tree;
  }
  const childCreation = update(editor.childCreation);
  return childCreation === editor.childCreation
    ? tree
    : { ...tree, selectedEditor: { ...editor, childCreation } };
}

function fixtureSelectedEditorForItem(
  tree: FormlessUiTreeResultContract,
  item: FormlessUiTreeItemContract,
): FormlessUiTreeSelectedEditorContract {
  if (tree.selectedEditor?.itemId === item.id) {
    return tree.selectedEditor;
  }

  const placementFields = emptyFixtureTreeFieldSet(
    `${tree.id}:${item.id}:placement-fields`,
    "Placement fields",
    tree.editing,
  );
  return {
    accessibilityLabel: `Edit ${item.label} placement and block`,
    availability: item.availability,
    ...(item.childRecordId
      ? {
          childFields: emptyFixtureTreeFieldSet(
            `${tree.id}:${item.id}:child-fields`,
            "Child fields",
            tree.editing,
          ),
          childRecordId: item.childRecordId,
        }
      : {}),
    editing: tree.editing,
    id: `${tree.id}:${item.id}:editor`,
    itemId: item.id,
    kind: "treeSelectedEditor",
    placementFields,
    placementId: item.placementId,
    warnings: item.warnings,
  };
}

function emptyFixtureTreeFieldSet(
  id: string,
  label: string,
  editing: FormlessUiTreeResultContract["editing"],
): FormlessUiFieldSetContract {
  return {
    disabled: !editing.enabled,
    ...(editing.enabled ? {} : { disabledReason: editing.disabledReason }),
    fields: [],
    id,
    kind: "fieldSet",
    label,
  };
}

function findTreeItem(
  items: readonly FormlessUiTreeItemContract[],
  itemId: string,
): FormlessUiTreeItemContract | undefined {
  for (const item of items) {
    if (item.id === itemId) {
      return item;
    }
    const child = findTreeItem(item.children, itemId);
    if (child) {
      return child;
    }
  }
  return undefined;
}

function firstAvailableTreeItem(
  items: readonly FormlessUiTreeItemContract[],
): FormlessUiTreeItemContract | undefined {
  for (const item of items) {
    if (item.availability.available) {
      return item;
    }
    const child = firstAvailableTreeItem(item.children);
    if (child) {
      return child;
    }
  }
  return undefined;
}

function updateTreeItem(
  items: readonly FormlessUiTreeItemContract[],
  itemId: string,
  update: (item: FormlessUiTreeItemContract) => FormlessUiTreeItemContract,
): readonly FormlessUiTreeItemContract[] {
  let changed = false;
  const nextItems = items.map((item) => {
    if (item.id === itemId) {
      const nextItem = update(item);
      changed ||= nextItem !== item;
      return nextItem;
    }
    const children = updateTreeItem(item.children, itemId, update);
    if (children === item.children) {
      return item;
    }
    changed = true;
    return { ...item, children };
  });
  return changed ? nextItems : items;
}

function selectTreeItem(
  items: readonly FormlessUiTreeItemContract[],
  itemId: string,
): readonly FormlessUiTreeItemContract[] {
  return items.map((item) => ({
    ...item,
    children: selectTreeItem(item.children, itemId),
    selected: item.id === itemId,
  }));
}

function removeTreeItem(
  items: readonly FormlessUiTreeItemContract[],
  itemId: string,
): readonly FormlessUiTreeItemContract[] {
  return items
    .filter((item) => item.id !== itemId)
    .map((item) => ({ ...item, children: removeTreeItem(item.children, itemId) }));
}

function reorderTreeItem(
  items: readonly FormlessUiTreeItemContract[],
  itemId: string,
  direction: Extract<FormlessUiTreeIntent, { type: "treeReorder" }>["direction"],
): readonly FormlessUiTreeItemContract[] {
  const index = items.findIndex((item) => item.id === itemId);
  if (index >= 0) {
    const targetIndex =
      direction === "top"
        ? 0
        : direction === "up"
          ? Math.max(0, index - 1)
          : direction === "down"
            ? Math.min(items.length - 1, index + 1)
            : items.length - 1;
    if (targetIndex === index) {
      return items;
    }
    const reordered = [...items];
    const [item] = reordered.splice(index, 1);
    if (!item) {
      return items;
    }
    reordered.splice(targetIndex, 0, item);
    return reordered;
  }

  let changed = false;
  const nextItems = items.map((item) => {
    const children = reorderTreeItem(item.children, itemId, direction);
    if (children === item.children) {
      return item;
    }
    changed = true;
    return { ...item, children };
  });
  return changed ? nextItems : items;
}

function treeFixtureReference(tree: FormlessUiTreeResultContract) {
  return formlessUiTreeResultReference({
    resultId: tree.id,
    role: "mainResult",
    sectionId: "section:tree-result-fixtures",
    workspaceId: "workspace:tree-result-fixtures",
  });
}

const treeFixtureWorkspaceScope = {
  collectionId: "collection:tree-result-fixtures",
  screenId: "workspace:tree-result-fixtures",
  sectionId: "section:tree-result-fixtures",
} satisfies FormlessUiWorkspaceIntentScope;

function ignoreTreeIntent() {}
