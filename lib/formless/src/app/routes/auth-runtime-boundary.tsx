import { type ReactNode, useLayoutEffect, useState } from "react";
import type {
  AuthIntent,
  AuthIntentHandler,
  AuthSurfaceContract,
  AuthSurfaceReference,
} from "@dpeek/formless-presentation/contract";
import {
  createMemoryPresentationHost,
  isAuthIntent,
  type MutablePresentationHost,
} from "@dpeek/formless-presentation/host";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";

export type NoShellAuthRuntimeHost = {
  host: MutablePresentationHost;
  publish(snapshot: AuthSurfaceContract): void;
  updateIntentHandler(handler: AuthIntentHandler): void;
};

export function createNoShellAuthRuntimeHost(
  reference: AuthSurfaceReference,
  snapshot: AuthSurfaceContract,
  initialIntentHandler: AuthIntentHandler,
): NoShellAuthRuntimeHost {
  let intentHandler = initialIntentHandler;
  const host = createMemoryPresentationHost({
    dispatch: (intent) => {
      if (!isAuthIntent(intent)) {
        throw new Error(`No-shell auth runtime cannot dispatch ${intent.type}.`);
      }
      return intentHandler(intent);
    },
    nodes: [{ reference, snapshot }],
    serverNodes: [{ reference, snapshot }],
  });

  return {
    host,
    publish: (nextSnapshot) => host.publish([{ reference, snapshot: nextSnapshot }]),
    updateIntentHandler: (handler) => {
      intentHandler = handler;
    },
  };
}

export function NoShellAuthRuntimeBoundary({
  children,
  onIntent,
  reference,
  snapshot,
}: {
  children: ReactNode;
  onIntent: AuthIntentHandler;
  reference: AuthSurfaceReference;
  snapshot: AuthSurfaceContract;
}) {
  const [runtime] = useState(() => createNoShellAuthRuntimeHost(reference, snapshot, onIntent));

  runtime.updateIntentHandler(onIntent);

  useLayoutEffect(() => runtime.publish(snapshot), [runtime, snapshot]);

  return <PresentationHostProvider host={runtime.host}>{children}</PresentationHostProvider>;
}

export type AuthPendingGuard = {
  isPending(): boolean;
  run(operation: () => Promise<void>): Promise<boolean>;
};

export function createAuthPendingGuard(): AuthPendingGuard {
  let pending = false;

  return {
    isPending: () => pending,
    run: async (operation) => {
      if (pending) {
        return false;
      }

      pending = true;
      try {
        await operation();
        return true;
      } finally {
        pending = false;
      }
    },
  };
}

export function authIntentIsCurrent(surface: AuthSurfaceContract, intent: AuthIntent): boolean {
  if (intent.surfaceId !== surface.id) {
    return false;
  }

  switch (intent.type) {
    case "authAction": {
      const action = surface.actions.find((candidate) => candidate.id === intent.actionId);
      return (
        !surface.pending &&
        action !== undefined &&
        action.control.disabled !== true &&
        action.control.id === intent.controlId
      );
    }
    case "authContinuation":
      return (
        !surface.pending &&
        surface.continuation?.destination.id === intent.destinationId &&
        surface.continuation.control.id === intent.controlId &&
        surface.continuation.control.disabled !== true
      );
    case "authField": {
      const authField = surface.fields.find(
        (candidate) => candidate.field.fieldId === intent.fieldId,
      );
      if (!authField || surface.pending || authField.field.pending?.isPending) {
        return false;
      }

      if (authField.field.surface === "create") {
        return (
          intent.intent.type === "createDraftChange" &&
          intent.intent.fieldName === authField.field.fieldName
        );
      }

      return (
        authField.field.surface === "operation" &&
        intent.intent.type === "operationDraftChange" &&
        intent.intent.inputName === authField.field.inputName
      );
    }
    case "authPasskey":
      return (
        !surface.pending &&
        surface.passkey?.availability === "available" &&
        surface.passkey.id === intent.passkeyId &&
        surface.passkey.control.id === intent.controlId &&
        surface.passkey.control.disabled !== true
      );
    case "authPolicySelection":
      return (
        !surface.pending &&
        surface.policies.some(
          (policy) =>
            policy.id === intent.policyId && policy.selectionIntent?.accepted === intent.accepted,
        )
      );
  }
}
