import { Banner } from "@astryxdesign/core/Banner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  TreeIntent,
  TreeIntentHandler,
  TreeItemContract,
  TreeResultContract,
  TreeResultReference,
  WorkspaceIntentHandler,
  WorkspaceIntentScope,
} from "@dpeek/formless-presentation/contract";
import { useTreeResult, useWorkspaceIntentHandler } from "@dpeek/formless-presentation/host/react";
import { AstryxTreeResultSignals } from "./tree-actions.tsx";
import { AstryxTreeChildCreation } from "./tree-child-creation.tsx";
import { AstryxTreeOutline } from "./tree-outline.tsx";
import { AstryxTreeSelectedEditor } from "./tree-selected-editor.tsx";

export function AstryxSubscribedTreeResultRenderer({
  reference,
  scope,
}: {
  reference: TreeResultReference;
  scope: WorkspaceIntentScope;
}) {
  const tree = useTreeResult(reference);
  const onIntent = useWorkspaceIntentHandler();

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
  onIntent?: TreeIntentHandler;
  tree: TreeResultContract;
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

export function dispatchAstryxWorkspaceTreeIntent(
  handler: WorkspaceIntentHandler,
  scope: WorkspaceIntentScope,
  resultId: string,
  intent: TreeIntent,
) {
  if (intent.resultId !== resultId) {
    return;
  }

  return handler({ ...scope, intent, resultId, type: "workspaceTree" });
}

function findSelectedTreeItem(items: readonly TreeItemContract[]): TreeItemContract | undefined {
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

function ignoreTreeIntent() {}
