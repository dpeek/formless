import { useLayoutEffect, useRef, useState } from "react";
import type {
  PresentationIntent,
  ContextResultReference,
  MainResultReference,
  RecordResultContract,
  WorkspaceContract,
  WorkspaceIntentHandler,
  WorkspaceManifestReference,
  WorkspaceSectionContract,
  WorkspaceSectionShellReference,
} from "@dpeek/formless-presentation/contract";
import {
  createMemoryPresentationHost,
  listResultReference,
  recordResultReference,
  tableResultReference,
  treeResultReference,
  workspaceManifestReference,
  workspaceSectionShellReference,
  isWorkspaceIntent,
  type PresentationNode,
  type PresentationNodeSet,
  type MutablePresentationHost,
} from "@dpeek/formless-presentation/host";
import type { ApplicationRuntimeContractPublication } from "./application-runtime-contract-host.tsx";

export type GeneratedWorkspaceContractHostPublication = {
  nodes: PresentationNodeSet;
  workspaceReference: WorkspaceManifestReference;
};

export type GeneratedWorkspaceRuntimePublication = GeneratedWorkspaceContractHostPublication &
  ApplicationRuntimeContractPublication;

export function projectGeneratedWorkspaceContractHostPublication(
  workspace: WorkspaceContract,
): GeneratedWorkspaceContractHostPublication {
  const workspaceReference = workspaceManifestReference(workspace.id);
  const sectionPublications = workspace.sections.map((section) =>
    projectSection(workspaceReference.workspaceId, section),
  );
  const sectionReferences = sectionPublications.map(({ reference }) => reference);

  return {
    nodes: [
      {
        reference: workspaceReference,
        snapshot: {
          accessibilityLabel: workspace.accessibilityLabel,
          actions: workspace.actions,
          id: workspace.id,
          kind: "workspaceManifest",
          label: workspace.label,
          sections: sectionReferences,
          width: workspace.width,
        },
      },
      ...sectionPublications.flatMap(({ nodes }) => nodes),
    ],
    workspaceReference,
  };
}

export function prepareGeneratedWorkspaceRuntimePublication(
  workspace: WorkspaceContract,
  dispatch: WorkspaceIntentHandler,
): GeneratedWorkspaceRuntimePublication {
  const publication = projectGeneratedWorkspaceContractHostPublication(workspace);

  return {
    ...publication,
    intentHandlers: [
      {
        dispatch: (intent: PresentationIntent) => {
          if (!isWorkspaceIntent(intent)) {
            return;
          }
          return dispatch(intent);
        },
        matches: (intent) => isWorkspaceIntent(intent) && intent.screenId === workspace.id,
      },
    ],
  };
}

export function useGeneratedWorkspaceContractHost({
  dispatch,
  publication,
}: {
  dispatch: WorkspaceIntentHandler;
  publication: GeneratedWorkspaceRuntimePublication | undefined;
}): {
  host: MutablePresentationHost;
  workspaceReference: WorkspaceManifestReference | undefined;
} {
  const dispatchRef = useRef(dispatch);
  const [host] = useState(() =>
    createMemoryPresentationHost({
      dispatch: (intent) => {
        if (!isWorkspaceIntent(intent)) {
          throw new Error("Generated workspace contract host received a shell intent.");
        }
        return dispatchRef.current(intent);
      },
      ...(publication === undefined ? {} : { nodes: publication.nodes }),
    }),
  );

  useLayoutEffect(() => {
    dispatchRef.current = dispatch;
    host.publish(publication?.nodes ?? []);
  }, [dispatch, host, publication]);

  return { host, workspaceReference: publication?.workspaceReference };
}

function projectSection(
  workspaceId: string,
  section: WorkspaceSectionContract,
): {
  nodes: PresentationNodeSet;
  reference: WorkspaceSectionShellReference;
} {
  const reference = workspaceSectionShellReference(workspaceId, section.id);
  const { contextDetail, result, ...presentation } = section.collection.presentation;
  const mainResult = projectMainResult(workspaceId, section.id, result);
  const projectedContext = contextDetail
    ? projectContextResult(workspaceId, section.id, contextDetail)
    : undefined;

  return {
    nodes: [
      {
        reference,
        snapshot: {
          accessibilityLabel: section.accessibilityLabel,
          actions: section.actions,
          collection: {
            ...section.collection,
            presentation: {
              ...presentation,
              ...(projectedContext === undefined
                ? {}
                : { contextDetail: projectedContext.reference }),
              result: mainResult.reference,
            },
          },
          headingVisibility: section.headingVisibility,
          id: section.id,
          kind: "workspaceSectionShell",
          label: section.label,
        },
      },
      mainResult.node,
      ...(projectedContext === undefined ? [] : [projectedContext.node]),
    ],
    reference,
  };
}

function projectMainResult(
  workspaceId: string,
  sectionId: string,
  result: WorkspaceSectionContract["collection"]["presentation"]["result"],
): {
  node: PresentationNode;
  reference: MainResultReference;
} {
  switch (result.kind) {
    case "list": {
      const reference = listResultReference({
        resultId: result.id,
        role: "mainResult",
        sectionId,
        workspaceId,
      });
      return { node: { reference, snapshot: result }, reference };
    }
    case "recordResult": {
      const reference = recordResultReference({
        resultId: result.id,
        role: "mainResult",
        sectionId,
        workspaceId,
      });
      return { node: { reference, snapshot: result }, reference };
    }
    case "table": {
      const reference = tableResultReference({
        resultId: result.id,
        role: "mainResult",
        sectionId,
        workspaceId,
      });
      return { node: { reference, snapshot: result }, reference };
    }
    case "treeResult": {
      const reference = treeResultReference({
        resultId: result.id,
        role: "mainResult",
        sectionId,
        workspaceId,
      });
      return { node: { reference, snapshot: result }, reference };
    }
  }
}

function projectContextResult(
  workspaceId: string,
  sectionId: string,
  result: RecordResultContract,
): {
  node: PresentationNode;
  reference: ContextResultReference;
} {
  const reference = recordResultReference({
    resultId: result.id,
    role: "contextResult",
    sectionId,
    workspaceId,
  });
  return { node: { reference, snapshot: result }, reference };
}
