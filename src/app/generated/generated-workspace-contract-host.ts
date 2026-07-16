import { useLayoutEffect, useRef, useState } from "react";
import type {
  FormlessUiContractIntent,
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
  isFormlessUiWorkspaceIntent,
  type FormlessUiContractHostNode,
  type FormlessUiContractHostNodeSet,
  type FormlessUiMutableContractHost,
} from "@dpeek/formless-astryx/contract-host";
import type { ApplicationRuntimeContractPublication } from "./application-runtime-contract-host.tsx";

export type GeneratedWorkspaceContractHostPublication = {
  nodes: FormlessUiContractHostNodeSet;
  workspaceReference: FormlessUiWorkspaceManifestReference;
};

export type GeneratedWorkspaceRuntimePublication = GeneratedWorkspaceContractHostPublication &
  ApplicationRuntimeContractPublication;

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
          actions: workspace.actions,
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

export function prepareGeneratedWorkspaceRuntimePublication(
  workspace: FormlessUiWorkspaceContract,
  dispatch: FormlessUiWorkspaceIntentHandler,
): GeneratedWorkspaceRuntimePublication {
  const publication = projectGeneratedWorkspaceContractHostPublication(workspace);

  return {
    ...publication,
    intentHandlers: [
      {
        dispatch: (intent: FormlessUiContractIntent) => {
          if (!isFormlessUiWorkspaceIntent(intent)) {
            return;
          }
          return dispatch(intent);
        },
        matches: (intent) =>
          isFormlessUiWorkspaceIntent(intent) && intent.screenId === workspace.id,
      },
    ],
  };
}

export function useGeneratedWorkspaceContractHost({
  dispatch,
  publication,
}: {
  dispatch: FormlessUiWorkspaceIntentHandler;
  publication: GeneratedWorkspaceRuntimePublication | undefined;
}): {
  host: FormlessUiMutableContractHost;
  workspaceReference: FormlessUiWorkspaceManifestReference | undefined;
} {
  const dispatchRef = useRef(dispatch);
  const [host] = useState(() =>
    createFormlessUiMemoryContractHost({
      dispatch: (intent) => {
        if (!isFormlessUiWorkspaceIntent(intent)) {
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
