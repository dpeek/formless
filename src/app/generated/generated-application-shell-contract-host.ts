import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  FormlessUiContractIntent,
  FormlessUiShellIntent,
  FormlessUiShellIntentHandler,
  FormlessUiShellManifestReference,
} from "@dpeek/formless-astryx/contract";
import {
  createFormlessUiMemoryContractHost,
  formlessUiShellManifestReference,
  formlessUiShellNavigationSectionReference,
  type FormlessUiContractHostNodeSet,
  type FormlessUiMutableContractHost,
} from "@dpeek/formless-astryx/contract-host";
import {
  GENERATED_APPLICATION_SHELL_ID,
  type GeneratedApplicationShellProjection,
} from "./formless-ui-shell-projection.ts";
import {
  indexGeneratedCreateSurfaceFields,
  resolveGeneratedCreateFieldIntent,
} from "./generated-create-field-index.ts";

export type GeneratedApplicationShellContractHostPublication = {
  nodes: FormlessUiContractHostNodeSet;
  shellReference: FormlessUiShellManifestReference;
};

export type ResolvedGeneratedShellIntent =
  | {
      intent: Extract<FormlessUiShellIntent, { type: "shellCreate" }>;
      kind: "create";
    }
  | {
      intent: Extract<FormlessUiShellIntent, { type: "shellLogout" }>;
      kind: "logout";
    }
  | {
      intent: Extract<FormlessUiShellIntent, { type: "shellReset" }>;
      kind: "reset";
    }
  | {
      intent: Extract<FormlessUiShellIntent, { type: "shellRootRecordSelection" }>;
      kind: "rootSelection";
    }
  | { kind: "ignored" };

export function projectGeneratedApplicationShellContractHostPublication(
  projection: GeneratedApplicationShellProjection,
): GeneratedApplicationShellContractHostPublication {
  const shellReference = formlessUiShellManifestReference(projection.manifest.id);

  return {
    nodes: [
      { reference: shellReference, snapshot: projection.manifest },
      ...projection.sections.map((section) => ({
        reference: formlessUiShellNavigationSectionReference(projection.manifest.id, section.id),
        snapshot: section,
      })),
    ],
    shellReference,
  };
}

export function resolveGeneratedApplicationShellIntent(
  projection: GeneratedApplicationShellProjection | undefined,
  intent: FormlessUiShellIntent,
): ResolvedGeneratedShellIntent {
  if (!projection || intent.shellId !== projection.manifest.id) {
    return { kind: "ignored" };
  }

  const section = projection.sections.find((candidate) => candidate.id === intent.sectionId);

  if (!section) {
    return { kind: "ignored" };
  }

  switch (intent.type) {
    case "shellRootRecordSelection": {
      const destination = section.destinations.find(
        (candidate) =>
          candidate.kind === "shellRootRecordDestination" &&
          candidate.id === intent.destinationId &&
          candidate.recordId === intent.recordId,
      );

      return destination ? { intent, kind: "rootSelection" } : { kind: "ignored" };
    }
    case "shellCreate": {
      const surface = section.createSurface;
      if (surface?.id !== intent.surfaceId) {
        return { kind: "ignored" };
      }

      if ("fieldId" in intent) {
        return resolveGeneratedCreateFieldIntent(
          indexGeneratedCreateSurfaceFields(surface),
          intent.fieldId,
          intent.intent,
        ) === undefined
          ? { kind: "ignored" }
          : { intent, kind: "create" };
      }

      return intent.intent.surfaceId === intent.surfaceId
        ? { intent, kind: "create" }
        : { kind: "ignored" };
    }
    case "shellReset": {
      const reset = section.settings?.reset;

      return reset?.id === intent.controlId ? { intent, kind: "reset" } : { kind: "ignored" };
    }
    case "shellLogout": {
      const logout =
        section.session?.state === "authenticated" ? section.session.logout : undefined;

      return logout?.id === intent.controlId ? { intent, kind: "logout" } : { kind: "ignored" };
    }
  }
}

export function useGeneratedApplicationShellContractHost({
  dispatch,
  projection,
}: {
  dispatch: FormlessUiShellIntentHandler;
  projection: GeneratedApplicationShellProjection | undefined;
}): {
  host: FormlessUiMutableContractHost;
  shellReference: FormlessUiShellManifestReference | undefined;
} {
  const publication = projection
    ? projectGeneratedApplicationShellContractHostPublication(projection)
    : undefined;
  const dispatchRef = useRef(dispatch);
  const [host] = useState(() =>
    createFormlessUiMemoryContractHost({
      dispatch: (intent) => dispatchShellIntent(intent, dispatchRef),
      ...(publication ? { nodes: publication.nodes } : {}),
    }),
  );
  const shellReference = useMemo(
    () => formlessUiShellManifestReference(GENERATED_APPLICATION_SHELL_ID),
    [],
  );

  useLayoutEffect(() => {
    dispatchRef.current = dispatch;
    host.publish(publication?.nodes ?? []);
  }, [dispatch, host, publication]);

  return {
    host,
    shellReference: projection ? shellReference : undefined,
  };
}

function dispatchShellIntent(
  intent: FormlessUiContractIntent,
  dispatchRef: { current: FormlessUiShellIntentHandler },
) {
  switch (intent.type) {
    case "shellCreate":
    case "shellLogout":
    case "shellReset":
    case "shellRootRecordSelection":
      return dispatchRef.current(intent);
    default:
      throw new Error("Generated application shell host received a workspace intent.");
  }
}
