import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  FormlessUiContextResultReference,
  FormlessUiListContract,
  FormlessUiRecordResultContract,
  FormlessUiTreeResultReference,
  FormlessUiTreeResultContract,
  FormlessUiWorkspaceContract,
  FormlessUiWorkspaceSectionShellContract,
} from "@dpeek/formless-astryx/contract";
import {
  createFormlessUiMemoryContractHost,
  formlessUiListResultReference,
  formlessUiRecordResultReference,
  formlessUiTreeResultReference,
  formlessUiWorkspaceManifestReference,
  formlessUiWorkspaceSectionShellReference,
  type FormlessUiContractHostNodeSet,
} from "@dpeek/formless-astryx/contract-host";
import { FormlessUiContractHostProvider } from "@dpeek/formless-astryx/contract-host/react";
import {
  LegacySubscribedWorkspaceScreenRenderer,
  LegacyWorkspaceScreenRenderer,
} from "./legacy-workspace-screen-renderer.tsx";

const workspaceReference = formlessUiWorkspaceManifestReference("workspace:tasks");
const sectionReference = formlessUiWorkspaceSectionShellReference(
  workspaceReference.workspaceId,
  "section:tasks",
);
const mainResultReference = formlessUiListResultReference({
  resultId: "list:tasks",
  role: "mainResult",
  sectionId: sectionReference.sectionId,
  workspaceId: workspaceReference.workspaceId,
});
const contextResultReference = formlessUiRecordResultReference({
  resultId: "record:task-context",
  role: "contextResult",
  sectionId: sectionReference.sectionId,
  workspaceId: workspaceReference.workspaceId,
});

describe("legacy subscribed workspace renderer", () => {
  it("composes separate result subscriptions beside the direct snapshot entrypoint", () => {
    const host = createFormlessUiMemoryContractHost({ nodes: workspaceNodes() });
    const subscribedHtml = renderToStaticMarkup(
      <FormlessUiContractHostProvider host={host}>
        <LegacySubscribedWorkspaceScreenRenderer reference={workspaceReference} />
      </FormlessUiContractHostProvider>,
    );
    const directHtml = renderToStaticMarkup(
      <LegacyWorkspaceScreenRenderer onIntent={() => undefined} workspace={completeWorkspace()} />,
    );

    for (const html of [subscribedHtml, directHtml]) {
      expect(html).toContain('data-formless-legacy-workspace="workspace:tasks"');
      expect(html).toContain('data-formless-legacy-list="list:tasks"');
      expect(html).toContain('data-formless-legacy-record-result="record:task-context"');
      expect(html).toContain("Tasks section");
    }
  });

  it("renders a list-detail tree result through separate stable host references", () => {
    const treeWorkspaceReference = formlessUiWorkspaceManifestReference("workspace:site");
    const treeSectionReference = formlessUiWorkspaceSectionShellReference(
      treeWorkspaceReference.workspaceId,
      "section:composition",
    );
    const treeResultReference = formlessUiTreeResultReference({
      resultId: "tree:site",
      role: "mainResult",
      sectionId: treeSectionReference.sectionId,
      workspaceId: treeWorkspaceReference.workspaceId,
    });
    const treeContextReference = formlessUiRecordResultReference({
      resultId: "record:site-root",
      role: "contextResult",
      sectionId: treeSectionReference.sectionId,
      workspaceId: treeWorkspaceReference.workspaceId,
    });
    const host = createFormlessUiMemoryContractHost({
      nodes: [
        {
          reference: treeWorkspaceReference,
          snapshot: {
            accessibilityLabel: "Site workspace",
            actions: [],
            id: treeWorkspaceReference.workspaceId,
            kind: "workspaceManifest",
            label: "Site",
            sections: [treeSectionReference],
          },
        },
        {
          reference: treeSectionReference,
          snapshot: treeSectionShell(treeResultReference, treeContextReference),
        },
        { reference: treeResultReference, snapshot: treeResult() },
        { reference: treeContextReference, snapshot: contextResult("record:site-root") },
      ],
    });
    const html = renderToStaticMarkup(
      <FormlessUiContractHostProvider host={host}>
        <LegacySubscribedWorkspaceScreenRenderer reference={treeWorkspaceReference} />
      </FormlessUiContractHostProvider>,
    );

    expect(html).toContain('data-formless-legacy-workspace="workspace:site"');
    expect(html).toContain('data-formless-legacy-workspace-collection="collection:composition"');
    expect(html).toContain('data-formless-legacy-record-result="record:site-root"');
    expect(html).toContain('data-formless-legacy-tree-result="tree:site"');
    expect(html).toContain("Site roots");
  });
});

function workspaceNodes(): FormlessUiContractHostNodeSet {
  return [
    {
      reference: workspaceReference,
      snapshot: {
        accessibilityLabel: "Tasks workspace",
        actions: [],
        id: workspaceReference.workspaceId,
        kind: "workspaceManifest",
        label: "Tasks",
        sections: [sectionReference],
      },
    },
    { reference: sectionReference, snapshot: sectionShell() },
    { reference: mainResultReference, snapshot: listResult() },
    { reference: contextResultReference, snapshot: contextResult() },
  ];
}

function sectionShell(): FormlessUiWorkspaceSectionShellContract {
  return {
    accessibilityLabel: "Tasks section",
    actions: [],
    collection: {
      accessibilityLabel: "Tasks collection",
      availability: { state: "ready" },
      id: "collection:tasks",
      kind: "workspaceCollection",
      label: "Tasks",
      presentation: {
        actions: {
          id: "collection:tasks:actions",
          kind: "workspaceCollectionActions",
          primary: [],
          secondary: [],
          secondaryAccessibilityLabel: "More task actions",
        },
        context: {
          accessibilityLabel: "Project context",
          availability: { state: "ready" },
          id: "context:project",
          kind: "workspaceContext",
          label: "Project",
          options: [],
          presentation: "singletonDetail",
        },
        contextDetail: contextResultReference,
        kind: "ordinary",
        result: mainResultReference,
        summaries: [],
      },
      selectedQueryId: null,
    },
    headingVisibility: "visible",
    id: sectionReference.sectionId,
    kind: "workspaceSectionShell",
    label: "Tasks section",
  };
}

function listResult(): FormlessUiListContract {
  return {
    accessibilityLabel: "Tasks result",
    density: "default",
    editing: { enabled: true },
    id: mainResultReference.resultId,
    items: [],
    kind: "list",
  };
}

function contextResult(id = contextResultReference.resultId): FormlessUiRecordResultContract {
  return {
    accessibilityLabel: "Selected task context",
    actions: {
      id: "record:task-context:actions",
      kind: "actionGroup",
      primary: [],
      secondary: [],
      secondaryAccessibilityLabel: "More context actions",
    },
    availability: { state: "ready" },
    density: "compact",
    editing: { enabled: true },
    fields: [],
    id,
    kind: "recordResult",
    warnings: [],
  };
}

function treeSectionShell(
  result: FormlessUiTreeResultReference,
  context: FormlessUiContextResultReference,
): FormlessUiWorkspaceSectionShellContract {
  return {
    accessibilityLabel: "Composition section",
    actions: [],
    collection: {
      accessibilityLabel: "Site composition",
      availability: { state: "ready" },
      id: "collection:composition",
      kind: "workspaceCollection",
      label: "Composition",
      presentation: {
        accessibilityLabel: "Site composition list detail",
        actions: {
          id: "collection:composition:actions",
          kind: "workspaceCollectionActions",
          primary: [],
          secondary: [],
          secondaryAccessibilityLabel: "More composition actions",
        },
        contextDetail: context,
        id: "collection:composition:list-detail",
        kind: "listDetail",
        result,
        selector: {
          accessibilityLabel: "Site roots",
          availability: { state: "ready" },
          id: "context:site-root",
          kind: "workspaceContext",
          label: "Site roots",
          options: [],
          presentation: "localListDetail",
        },
        summaries: [],
      },
      selectedQueryId: null,
    },
    headingVisibility: "visible",
    id: "section:composition",
    kind: "workspaceSectionShell",
    label: "Composition",
  };
}

function treeResult(): FormlessUiTreeResultContract {
  return {
    accessibilityLabel: "Homepage composition",
    availability: { state: "ready" },
    density: "default",
    editing: { enabled: true },
    feedback: [],
    id: "tree:site",
    items: [],
    kind: "treeResult",
    root: {
      accessibilityLabel: "Homepage root",
      id: "tree:site:root",
      kind: "treeRoot",
      label: "Homepage",
    },
    warnings: [],
  };
}

function completeWorkspace(): FormlessUiWorkspaceContract {
  const section = sectionShell();

  return {
    accessibilityLabel: "Tasks workspace",
    actions: [],
    id: workspaceReference.workspaceId,
    kind: "workspace",
    label: "Tasks",
    sections: [
      {
        ...section,
        collection: {
          ...section.collection,
          presentation: {
            ...section.collection.presentation,
            contextDetail: contextResult(),
            result: listResult(),
          },
        },
        kind: "workspaceSection",
      },
    ],
  };
}
