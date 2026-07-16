import { useLayoutEffect, useRef, useState } from "react";
import type {
  FormlessUiContextResultReference,
  FormlessUiMainResultReference,
  FormlessUiRecordResultContract,
  FormlessUiWorkspaceContract,
  FormlessUiWorkspaceIntentHandler,
  FormlessUiWorkspaceManifestReference,
  FormlessUiWorkspaceSectionContract,
  FormlessUiWorkspaceSectionShellReference,
} from "@dpeek/formless-astryx/contract";
import {
  createFormlessUiMemoryContractHost,
  formlessUiListResultReference,
  formlessUiRecordResultReference,
  formlessUiTableResultReference,
  formlessUiWorkspaceManifestReference,
  formlessUiWorkspaceSectionShellReference,
  type FormlessUiContractHostNode,
  type FormlessUiContractHostNodeSet,
  type FormlessUiMutableContractHost,
} from "@dpeek/formless-astryx/contract-host";

export type GeneratedWorkspaceContractHostPublication = {
  nodes: FormlessUiContractHostNodeSet;
  workspaceReference: FormlessUiWorkspaceManifestReference;
};

export function projectGeneratedWorkspaceContractHostPublication(
  workspace: FormlessUiWorkspaceContract,
): GeneratedWorkspaceContractHostPublication {
  const workspaceReference = formlessUiWorkspaceManifestReference(workspace.id);
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
          id: workspace.id,
          kind: "workspaceManifest",
          label: workspace.label,
          sections: sectionReferences,
        },
      },
      ...sectionPublications.flatMap(({ nodes }) => nodes),
    ],
    workspaceReference,
  };
}

export function useGeneratedWorkspaceContractHost({
  dispatch,
  workspace,
}: {
  dispatch: FormlessUiWorkspaceIntentHandler;
  workspace: FormlessUiWorkspaceContract | undefined;
}): {
  host: FormlessUiMutableContractHost;
  workspaceReference: FormlessUiWorkspaceManifestReference | undefined;
} {
  const publication = workspace
    ? projectGeneratedWorkspaceContractHostPublication(workspace)
    : undefined;
  const dispatchRef = useRef(dispatch);
  const [host] = useState(() =>
    createFormlessUiMemoryContractHost({
      dispatch: (intent) => dispatchRef.current(intent),
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
  section: FormlessUiWorkspaceSectionContract,
): {
  nodes: FormlessUiContractHostNodeSet;
  reference: FormlessUiWorkspaceSectionShellReference;
} {
  const reference = formlessUiWorkspaceSectionShellReference(workspaceId, section.id);
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
  result: FormlessUiWorkspaceSectionContract["collection"]["presentation"]["result"],
): {
  node: FormlessUiContractHostNode;
  reference: FormlessUiMainResultReference;
} {
  switch (result.kind) {
    case "list": {
      const reference = formlessUiListResultReference({
        resultId: result.id,
        role: "mainResult",
        sectionId,
        workspaceId,
      });
      return { node: { reference, snapshot: result }, reference };
    }
    case "recordResult": {
      const reference = formlessUiRecordResultReference({
        resultId: result.id,
        role: "mainResult",
        sectionId,
        workspaceId,
      });
      return { node: { reference, snapshot: result }, reference };
    }
    case "table": {
      const reference = formlessUiTableResultReference({
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
  result: FormlessUiRecordResultContract,
): {
  node: FormlessUiContractHostNode;
  reference: FormlessUiContextResultReference;
} {
  const reference = formlessUiRecordResultReference({
    resultId: result.id,
    role: "contextResult",
    sectionId,
    workspaceId,
  });
  return { node: { reference, snapshot: result }, reference };
}
