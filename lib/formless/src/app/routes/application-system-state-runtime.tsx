import { useLayoutEffect, useState } from "react";
import type {
  ApplicationSystemStateContract,
  ApplicationSystemStateIntentHandler,
  ApplicationSystemStateReference,
} from "@dpeek/formless-presentation/contract";
import {
  createMemoryPresentationHost,
  applicationSystemStateReference,
  isApplicationSystemStateIntent,
  type MutablePresentationHost,
} from "@dpeek/formless-presentation/host";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import { ApplicationPresentation } from "../application-presentation.tsx";

export type ApplicationSystemStateRuntimeHost = {
  host: MutablePresentationHost;
  publish(snapshot: ApplicationSystemStateContract): void;
  reference: ApplicationSystemStateReference;
  updateIntentHandler(handler: ApplicationSystemStateIntentHandler): void;
};

export function createApplicationSystemStateRuntimeHost(
  snapshot: ApplicationSystemStateContract,
  initialIntentHandler: ApplicationSystemStateIntentHandler,
): ApplicationSystemStateRuntimeHost {
  const reference = applicationSystemStateReference(snapshot.id);
  let intentHandler = initialIntentHandler;
  const node = { reference, snapshot };
  const host = createMemoryPresentationHost({
    dispatch: (intent) => {
      if (!isApplicationSystemStateIntent(intent)) {
        throw new Error(`Application system-state runtime cannot dispatch ${intent.type}.`);
      }
      return intentHandler(intent);
    },
    nodes: [node],
    serverNodes: [node],
  });

  return {
    host,
    publish: (nextSnapshot) => host.publish([{ reference, snapshot: nextSnapshot }]),
    reference,
    updateIntentHandler: (handler) => {
      intentHandler = handler;
    },
  };
}

export function ApplicationSystemStateRuntime({
  onIntent = () => undefined,
  snapshot,
}: {
  onIntent?: ApplicationSystemStateIntentHandler;
  snapshot: ApplicationSystemStateContract;
}) {
  return (
    <StableApplicationSystemStateRuntime
      key={snapshot.id}
      onIntent={onIntent}
      snapshot={snapshot}
    />
  );
}

function StableApplicationSystemStateRuntime({
  onIntent,
  snapshot,
}: {
  onIntent: ApplicationSystemStateIntentHandler;
  snapshot: ApplicationSystemStateContract;
}) {
  const [runtime] = useState(() => createApplicationSystemStateRuntimeHost(snapshot, onIntent));

  runtime.updateIntentHandler(onIntent);
  useLayoutEffect(() => runtime.publish(snapshot), [runtime, snapshot]);

  return (
    <PresentationHostProvider host={runtime.host}>
      <ApplicationPresentation
        presentation={{
          kind: "applicationSystemState",
          systemStateReference: runtime.reference,
        }}
      />
    </PresentationHostProvider>
  );
}
