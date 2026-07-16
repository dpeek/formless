import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  FormlessUiListContract,
  FormlessUiRecordResultContract,
  FormlessUiWorkspaceContract,
  FormlessUiWorkspaceSectionShellContract,
} from "@dpeek/formless-astryx/contract";
import {
  createFormlessUiMemoryContractHost,
  formlessUiListResultReference,
  formlessUiRecordResultReference,
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

function contextResult(): FormlessUiRecordResultContract {
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
    id: contextResultReference.resultId,
    kind: "recordResult",
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
