import { useState } from "react";
import type {
  AccessActionContract,
  AccessConfirmationContract,
  AccessFeedbackContract,
  AccessIntent,
  AccessManifestReference,
  ButtonContract,
} from "@dpeek/formless-presentation/contract";
import {
  accessInvitationAuthoringReference,
  accessManifestReference,
  accessPersonRoleAuthoringReference,
  createMemoryPresentationHost,
  isAccessIntent,
  type MutablePresentationHost,
  type PresentationNodeSet,
} from "@dpeek/formless-presentation/host";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import { AstryxApplicationSurfaceFrame } from "./application-surface-frame.tsx";
import {
  createFormlessAccessFixtures,
  personRoleAuthoring,
  type FormlessAccessFixture,
  type FormlessAccessFixtureId,
  type FormlessAccessFixtureState,
} from "./access.fixtures.ts";
import { AstryxSubscribedAccessRenderer } from "./access-renderer.tsx";
import { FormlessFixtureFrame, FormlessFixtureSelector } from "./fixture-layout.tsx";

export function FormlessAccessLayout() {
  const [fixtureHosts] = useState(createFormlessAccessFixtureHosts);
  const [selectedFixtureId, setSelectedFixtureId] =
    useState<FormlessAccessFixtureId>("populated-owner");
  const selectedFixtureHost = fixtureHosts.find((fixture) => fixture.id === selectedFixtureId);

  if (!selectedFixtureHost) {
    return null;
  }

  return (
    <FormlessFixtureFrame
      ariaLabel="Access fixtures"
      controls={
        <FormlessFixtureSelector
          label="Access state"
          onSelectionChange={setSelectedFixtureId}
          options={fixtureHosts}
          selectedId={selectedFixtureId}
        />
      }
    >
      <AstryxApplicationSurfaceFrame width="standard">
        <FormlessAccessFixtureView fixtureHost={selectedFixtureHost} />
      </AstryxApplicationSurfaceFrame>
    </FormlessFixtureFrame>
  );
}

export function FormlessAccessFixtureView({
  fixtureHost,
}: {
  fixtureHost: FormlessAccessFixtureHost;
}) {
  return (
    <PresentationHostProvider host={fixtureHost.host}>
      <AstryxSubscribedAccessRenderer accessReference={fixtureHost.accessReference} />
    </PresentationHostProvider>
  );
}

export type FormlessAccessFixtureHost = FormlessAccessFixture & {
  accessReference: AccessManifestReference;
  getState(): FormlessAccessFixtureState;
  host: Omit<MutablePresentationHost, "dispatch"> & {
    dispatch(intent: AccessIntent): void;
  };
};

export function createFormlessAccessFixtureHost(
  fixture: FormlessAccessFixture,
): FormlessAccessFixtureHost {
  let state = fixture.state;
  const initialPublication = projectFormlessAccessFixturePublication(state);
  let host: MutablePresentationHost;

  host = createMemoryPresentationHost({
    dispatch: (intent) => {
      if (!isAccessIntent(intent)) {
        throw new Error("Access fixture host received an unsupported intent.");
      }
      const nextState = applyFormlessAccessFixtureIntent(state, intent);
      if (nextState === state) {
        return;
      }
      state = nextState;
      host.publish(projectFormlessAccessFixturePublication(state).nodes);
    },
    nodes: initialPublication.nodes,
  });

  return {
    ...fixture,
    accessReference: initialPublication.accessReference,
    getState: () => state,
    host: host as FormlessAccessFixtureHost["host"],
  };
}

export function projectFormlessAccessFixturePublication(state: FormlessAccessFixtureState): {
  accessReference: AccessManifestReference;
  nodes: PresentationNodeSet;
} {
  const accessReference = accessManifestReference(state.manifest.id);

  return {
    accessReference,
    nodes: [
      { reference: accessReference, snapshot: state.manifest },
      ...(state.authoring
        ? [
            {
              reference: accessInvitationAuthoringReference(
                state.authoring.accessId,
                state.authoring.id,
              ),
              snapshot: state.authoring,
            },
          ]
        : []),
      ...(state.personAuthoring
        ? [
            {
              reference: accessPersonRoleAuthoringReference(
                state.personAuthoring.accessId,
                state.personAuthoring.id,
                state.personAuthoring.personId,
              ),
              snapshot: state.personAuthoring,
            },
          ]
        : []),
    ],
  };
}

export function applyFormlessAccessFixtureIntent(
  state: FormlessAccessFixtureState,
  intent: AccessIntent,
): FormlessAccessFixtureState {
  if (state.manifest.state !== "ready" || state.manifest.id !== intent.accessId) {
    return state;
  }
  const manifest = state.manifest;

  switch (intent.type) {
    case "accessInvitationAuthoringOpenChange":
      return state.authoring?.id === intent.authoringId
        ? { ...state, authoring: { ...state.authoring, open: intent.open } }
        : state;
    case "accessInvitationFieldChange": {
      const authoring = state.authoring;
      if (!authoring || authoring.id !== intent.authoringId) {
        return state;
      }
      const entry = Object.entries(authoring.fields).find(
        ([, field]) => field?.id === intent.fieldId,
      );
      return entry?.[1]
        ? {
            ...state,
            authoring: {
              ...authoring,
              fields: {
                ...authoring.fields,
                [entry[0]]: { ...entry[1], errors: [], value: intent.value },
              },
            },
          }
        : state;
    }
    case "accessInvitationRoleSelectionChange":
      return state.authoring?.id === intent.authoringId
        ? {
            ...state,
            authoring: {
              ...state.authoring,
              roleSelection: applyRoleSelection(
                state.authoring.roleSelection,
                intent.selectedOptionIds,
              ),
            },
          }
        : state;
    case "accessInvitationMembershipSelectionChange":
      return state.authoring?.id === intent.authoringId
        ? {
            ...state,
            authoring: {
              ...state.authoring,
              membershipSelection: {
                ...state.authoring.membershipSelection,
                groups: state.authoring.membershipSelection.groups.map((group) => ({
                  ...group,
                  options: group.options.map((option) => ({
                    ...option,
                    selected: intent.selectedOptionIds.includes(option.id),
                  })),
                })),
                selectedOptionIds: [...intent.selectedOptionIds],
              },
            },
          }
        : state;
    case "accessInvitationSubmit":
      return state.authoring?.id === intent.authoringId
        ? {
            ...state,
            authoring: { ...state.authoring, open: false },
            manifest: {
              ...manifest,
              feedback: feedback("invitation-created", "Invitation created"),
            },
          }
        : state;
    case "accessPersonRoleAuthoringOpenChange":
      if (!intent.open) {
        return state.personAuthoring?.personId === intent.personId
          ? {
              ...state,
              manifest: { ...manifest, personAuthoring: undefined },
              personAuthoring: null,
            }
          : state;
      }
      return {
        ...state,
        manifest: {
          ...manifest,
          personAuthoring: accessPersonRoleAuthoringReference(
            intent.accessId,
            intent.authoringId,
            intent.personId,
          ),
        },
        personAuthoring: personRoleAuthoring(),
      };
    case "accessPersonRoleSelectionChange":
      return state.personAuthoring?.id === intent.authoringId
        ? {
            ...state,
            personAuthoring: {
              ...state.personAuthoring,
              roleSelection: applyRoleSelection(
                state.personAuthoring.roleSelection,
                intent.selectedOptionIds,
              ),
            },
          }
        : state;
    case "accessPersonRoleSubmit":
      return state.personAuthoring?.id === intent.authoringId
        ? {
            ...state,
            manifest: {
              ...manifest,
              feedback: feedback("roles-saved", "Roles saved"),
              personAuthoring: undefined,
            },
            personAuthoring: null,
          }
        : state;
    case "accessInvitationDeletionConfirmationOpenChange":
      return intent.open
        ? {
            ...state,
            manifest: {
              ...manifest,
              confirmation: invitationDeletionConfirmation(intent.invitationId),
            },
          }
        : { ...state, manifest: { ...manifest, confirmation: undefined } };
    case "accessInvitationDelete":
      return manifest.confirmation?.purpose === "invitation-deletion"
        ? {
            ...state,
            manifest: {
              ...manifest,
              confirmation: undefined,
              feedback: feedback("invitation-deleted", "Invitation deleted"),
              invitations: manifest.invitations.filter(({ id }) => id !== intent.invitationId),
            },
          }
        : state;
    case "accessPersonRemovalConfirmationOpenChange":
      return intent.open
        ? {
            ...state,
            manifest: {
              ...manifest,
              confirmation: personRemovalConfirmation(intent.personId),
            },
          }
        : { ...state, manifest: { ...manifest, confirmation: undefined } };
    case "accessPersonRemove":
      return manifest.confirmation?.purpose === "person-removal"
        ? {
            ...state,
            manifest: {
              ...manifest,
              confirmation: undefined,
              feedback: feedback("person-removed", "Person removed"),
              people: manifest.people.filter(({ id }) => id !== intent.personId),
            },
          }
        : state;
  }
}

function applyRoleSelection(
  selection: FormlessAccessFixtureState["authoring"] extends infer _Authoring
    ? NonNullable<FormlessAccessFixtureState["authoring"]>["roleSelection"]
    : never,
  selectedOptionIds: readonly string[],
) {
  return {
    ...selection,
    options: selection.options
      .map((option) => ({ ...option, selected: selectedOptionIds.includes(option.id) }))
      .filter(
        (option) =>
          option.selected ||
          !selection.options.some(
            (candidate) =>
              candidate.surfaceId === option.surfaceId && selectedOptionIds.includes(candidate.id),
          ),
      ),
    selectedOptionIds: [...selectedOptionIds],
  };
}

function invitationDeletionConfirmation(invitationId: string): AccessConfirmationContract {
  return {
    action: action("invitation-delete", "Delete invitation", {
      accessId: "access:fixture",
      actionId: "access:fixture:confirmation:action",
      confirmationId: "access:fixture:confirmation",
      controlId: "access:fixture:confirmation:action-control",
      invitationId,
      type: "accessInvitationDelete",
    }),
    cancel: action("invitation-deletion-cancel", "Cancel", {
      accessId: "access:fixture",
      actionId: "access:fixture:confirmation:cancel",
      confirmationId: "access:fixture:confirmation",
      controlId: "access:fixture:confirmation:cancel-control",
      invitationId,
      open: false,
      type: "accessInvitationDeletionConfirmationOpenChange",
    }),
    description: "The pending invitation will no longer be usable.",
    id: "access:fixture:confirmation",
    invitationId,
    kind: "accessConfirmation",
    open: true,
    purpose: "invitation-deletion",
    title: "Delete invitation?",
  };
}

function personRemovalConfirmation(personId: string): AccessConfirmationContract {
  return {
    action: action("person-remove", "Remove person", {
      accessId: "access:fixture",
      actionId: "access:fixture:confirmation:action",
      confirmationId: "access:fixture:confirmation",
      controlId: "access:fixture:confirmation:action-control",
      personId,
      type: "accessPersonRemove",
    }),
    cancel: action("person-removal-cancel", "Cancel", {
      accessId: "access:fixture",
      actionId: "access:fixture:confirmation:cancel",
      confirmationId: "access:fixture:confirmation",
      controlId: "access:fixture:confirmation:cancel-control",
      open: false,
      personId,
      type: "accessPersonRemovalConfirmationOpenChange",
    }),
    description: "This person will lose access immediately.",
    id: "access:fixture:confirmation",
    kind: "accessConfirmation",
    open: true,
    personId,
    purpose: "person-removal",
    title: "Remove person?",
  };
}

function action<Intent extends AccessActionContract["intent"]>(
  purpose: AccessActionContract<Intent>["purpose"],
  label: string,
  intent: Intent,
): AccessActionContract<Intent> {
  return {
    control: button(intent.controlId, label),
    id: intent.actionId,
    intent,
    kind: "accessAction",
    purpose,
  };
}

function button(id: string, label: string): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    prominence: "secondary",
    type: "button",
  };
}

function feedback(id: string, title: string): AccessFeedbackContract {
  return {
    detail: title,
    id: `access:fixture:feedback:${id}`,
    intent: "success",
    kind: "accessFeedback",
    title,
  };
}

function createFormlessAccessFixtureHosts() {
  return createFormlessAccessFixtures().map(createFormlessAccessFixtureHost);
}
