import { useLayoutEffect, useState } from "react";
import type {
  FormlessUiApplicationSystemStateContract,
  FormlessUiApplicationSystemStateIntentHandler,
  FormlessUiApplicationSystemStateReference,
} from "@dpeek/formless-presentation/contract";
import {
  createFormlessUiMemoryContractHost,
  formlessUiApplicationSystemStateReference,
  isFormlessUiApplicationSystemStateIntent,
  type FormlessUiMutableContractHost,
} from "@dpeek/formless-presentation/contract-host";
import { FormlessUiContractHostProvider } from "@dpeek/formless-presentation/contract-host/react";
import { ApplicationPresentation } from "../application-presentation.tsx";

export type ApplicationSystemStateRuntimeHost = {
  host: FormlessUiMutableContractHost;
  publish(snapshot: FormlessUiApplicationSystemStateContract): void;
  reference: FormlessUiApplicationSystemStateReference;
  updateIntentHandler(handler: FormlessUiApplicationSystemStateIntentHandler): void;
};

export function createApplicationSystemStateRuntimeHost(
  snapshot: FormlessUiApplicationSystemStateContract,
  initialIntentHandler: FormlessUiApplicationSystemStateIntentHandler,
): ApplicationSystemStateRuntimeHost {
  const reference = formlessUiApplicationSystemStateReference(snapshot.id);
  let intentHandler = initialIntentHandler;
  const node = { reference, snapshot };
  const host = createFormlessUiMemoryContractHost({
    dispatch: (intent) => {
      if (!isFormlessUiApplicationSystemStateIntent(intent)) {
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
  onIntent?: FormlessUiApplicationSystemStateIntentHandler;
  snapshot: FormlessUiApplicationSystemStateContract;
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
  onIntent: FormlessUiApplicationSystemStateIntentHandler;
  snapshot: FormlessUiApplicationSystemStateContract;
}) {
  const [runtime] = useState(() => createApplicationSystemStateRuntimeHost(snapshot, onIntent));

  runtime.updateIntentHandler(onIntent);
  useLayoutEffect(() => runtime.publish(snapshot), [runtime, snapshot]);

  return (
    <FormlessUiContractHostProvider host={runtime.host}>
      <ApplicationPresentation
        presentation={{
          kind: "applicationSystemState",
          systemStateReference: runtime.reference,
        }}
      />
    </FormlessUiContractHostProvider>
  );
}
