import type { FormlessUiContractIntent } from "@dpeek/formless-presentation/contract";
import {
  isFormlessUiAccessIntent,
  type FormlessUiContractHostNodeSet,
} from "@dpeek/formless-presentation/contract-host";
import type {
  ApplicationRuntimeContractPublication,
  ApplicationRuntimePublicationCoordinator,
} from "../generated/application-runtime-contract-host.tsx";
import {
  dispatchAccessIntent,
  projectAccess,
  type AccessIntentActions,
  type AccessProjection,
  type ProjectAccessOptions,
} from "./access-projection.ts";
import {
  INSTANCE_ACCESS_CONTRIBUTOR_ID,
  instanceAccessInvitationAuthoringReference,
  instanceAccessReference,
} from "./access-contract.ts";

export type AccessRuntimePublicationController = {
  activate(): void;
  dispose(): void;
  updateRuntime(input: ProjectAccessOptions, actions: AccessIntentActions): void;
};

export function createAccessRuntimePublicationController(
  application: ApplicationRuntimePublicationCoordinator,
): AccessRuntimePublicationController {
  let actions: AccessIntentActions | undefined;
  let disposed = false;
  let input: ProjectAccessOptions | undefined;
  let projection: AccessProjection | undefined;

  return { activate, dispose, updateRuntime };

  function activate() {
    disposed = false;
    publish();
  }

  function dispose() {
    disposed = true;
    application.remove(INSTANCE_ACCESS_CONTRIBUTOR_ID);
  }

  function updateRuntime(nextInput: ProjectAccessOptions, nextActions: AccessIntentActions) {
    input = nextInput;
    actions = nextActions;
    publish();
  }

  function publish() {
    if (disposed || !input || !actions) {
      return;
    }

    projection = projectAccess(input);
    application.publish(
      INSTANCE_ACCESS_CONTRIBUTOR_ID,
      prepareAccessRuntimePublication({ dispatch: dispatchIntent, projection }),
    );
  }

  async function dispatchIntent(intent: FormlessUiContractIntent) {
    if (!isFormlessUiAccessIntent(intent) || !input || !projection || !actions) {
      return;
    }

    await dispatchAccessIntent(input, projection, intent, actions);
  }
}

export function prepareAccessRuntimePublication({
  dispatch,
  projection,
}: {
  dispatch: (intent: FormlessUiContractIntent) => Promise<void> | void;
  projection: AccessProjection;
}): ApplicationRuntimeContractPublication {
  const nodes: FormlessUiContractHostNodeSet = [
    { reference: instanceAccessReference, snapshot: projection.manifest },
    ...(projection.authoring === undefined
      ? []
      : [
          {
            reference: instanceAccessInvitationAuthoringReference,
            snapshot: projection.authoring,
          },
        ]),
  ];

  return {
    intentHandlers: [
      {
        dispatch,
        matches: (intent) =>
          isFormlessUiAccessIntent(intent) && intent.accessId === instanceAccessReference.accessId,
      },
    ],
    nodes,
  };
}
