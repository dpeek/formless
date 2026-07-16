import { createContext, type ReactNode, useContext, useLayoutEffect, useState } from "react";
import type {
  FormlessUiContractIntent,
  FormlessUiContractIntentHandler,
} from "@dpeek/formless-astryx/contract";
import {
  createFormlessUiMemoryContractHost,
  type FormlessUiContractHostNodeSet,
  type FormlessUiMutableContractHost,
} from "@dpeek/formless-astryx/contract-host";
import { FormlessUiContractHostProvider } from "@dpeek/formless-astryx/contract-host/react";

export type ApplicationRuntimeIntentHandler = {
  dispatch: FormlessUiContractIntentHandler;
  matches: (intent: FormlessUiContractIntent) => boolean;
};

export type ApplicationRuntimeContractPublication = {
  intentHandlers?: readonly ApplicationRuntimeIntentHandler[];
  nodes: FormlessUiContractHostNodeSet;
};

export type ApplicationRuntimePublicationCoordinator = {
  host: FormlessUiMutableContractHost;
  publish(contributorId: string, publication: ApplicationRuntimeContractPublication): void;
  remove(contributorId: string): void;
};

export type ApplicationRuntimeContractContribution = readonly [
  contributorId: string,
  publication: ApplicationRuntimeContractPublication,
];

const ApplicationRuntimePublicationCoordinatorContext =
  createContext<ApplicationRuntimePublicationCoordinator | null>(null);

export function createApplicationRuntimePublicationCoordinator(
  initialContributions: readonly ApplicationRuntimeContractContribution[] = [],
): ApplicationRuntimePublicationCoordinator {
  let contributions = new Map(initialContributions);
  const initialNodes = combinedNodes(contributions);
  const host = createFormlessUiMemoryContractHost({
    dispatch: dispatchIntent,
    nodes: initialNodes,
    serverNodes: initialNodes,
  });

  return { host, publish, remove };

  function dispatchIntent(intent: FormlessUiContractIntent) {
    const matches = Array.from(contributions.values()).flatMap(
      (publication) =>
        publication.intentHandlers?.filter((handler) => handler.matches(intent)) ?? [],
    );

    if (matches.length === 0) {
      throw new Error(`Application runtime has no current handler for ${intent.type}.`);
    }
    if (matches.length > 1) {
      throw new Error(`Application runtime has multiple current handlers for ${intent.type}.`);
    }

    return matches[0]?.dispatch(intent);
  }

  function publish(contributorId: string, publication: ApplicationRuntimeContractPublication) {
    const next = new Map(contributions);
    next.set(contributorId, publication);
    commit(next);
  }

  function remove(contributorId: string) {
    if (!contributions.has(contributorId)) {
      return;
    }

    const next = new Map(contributions);
    next.delete(contributorId);
    commit(next);
  }

  function commit(next: ReadonlyMap<string, ApplicationRuntimeContractPublication>) {
    const nodes = combinedNodes(next);

    // Validate the complete graph before exposing its handlers to host subscribers.
    createFormlessUiMemoryContractHost({ nodes });
    contributions = new Map(next);
    host.publish(nodes);
  }
}

export function useApplicationRuntimePublicationCoordinator(
  initialContributions: readonly ApplicationRuntimeContractContribution[] = [],
) {
  const [coordinator] = useState(() =>
    createApplicationRuntimePublicationCoordinator(initialContributions),
  );
  return coordinator;
}

export function ApplicationRuntimeContractHostProvider({
  children,
  coordinator,
}: {
  children: ReactNode;
  coordinator: ApplicationRuntimePublicationCoordinator;
}) {
  return (
    <ApplicationRuntimePublicationCoordinatorContext.Provider value={coordinator}>
      <FormlessUiContractHostProvider host={coordinator.host}>
        {children}
      </FormlessUiContractHostProvider>
    </ApplicationRuntimePublicationCoordinatorContext.Provider>
  );
}

export function useApplicationRuntimeContractPublication(
  contributorId: string,
  publication: ApplicationRuntimeContractPublication | undefined,
) {
  const coordinator = useApplicationRuntimePublicationCoordinatorContext();

  useLayoutEffect(() => {
    if (publication) {
      coordinator.publish(contributorId, publication);
    } else {
      coordinator.remove(contributorId);
    }
  }, [contributorId, coordinator, publication]);

  useLayoutEffect(() => () => coordinator.remove(contributorId), [contributorId, coordinator]);
}

export function useApplicationRuntimePublicationCoordinatorContext() {
  const coordinator = useContext(ApplicationRuntimePublicationCoordinatorContext);

  if (!coordinator) {
    throw new Error(
      "Application runtime publication requires ApplicationRuntimeContractHostProvider.",
    );
  }

  return coordinator;
}

function combinedNodes(
  contributions: ReadonlyMap<string, ApplicationRuntimeContractPublication>,
): FormlessUiContractHostNodeSet {
  return Array.from(contributions.values()).flatMap((publication) => publication.nodes);
}
