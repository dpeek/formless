import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { useState } from "react";
import type {
  FormlessUiAccessActionContract,
  FormlessUiAccessControlledFieldContract,
  FormlessUiAccessGrantSelectionContract,
  FormlessUiAccessIntent,
  FormlessUiAccessInvitationAuthoringContract,
  FormlessUiAccessManifestReference,
  FormlessUiAccessReadyContract,
} from "../formless-ui-contract.ts";
import {
  createFormlessUiMemoryContractHost,
  formlessUiAccessInvitationAuthoringReference,
  formlessUiAccessManifestReference,
  isFormlessUiAccessIntent,
  type FormlessUiContractHostNodeSet,
  type FormlessUiMutableContractHost,
} from "../formless-ui-contract-host.ts";
import { FormlessUiContractHostProvider } from "../formless-ui-contract-host-react.tsx";
import {
  accessFixtureAuthoringReference,
  createFormlessAccessFixtures,
  type FormlessAccessFixture,
  type FormlessAccessFixtureId,
  type FormlessAccessFixtureState,
} from "./access.fixtures.ts";
import {
  createFormlessApplicationShellFixtures,
  type FormlessApplicationShellFixture,
} from "./application-shell.fixtures.ts";
import { projectFormlessApplicationShellFixturePublication } from "./application-shell.tsx";
import { AstryxSubscribedAccessRenderer } from "./formless-ui-access-renderer.tsx";
import { AstryxSubscribedApplicationShellRenderer } from "./shell.tsx";

export function FormlessAccessLayout() {
  const [fixtureHosts] = useState(createFormlessAccessFixtureHosts);
  const [selectedFixtureId, setSelectedFixtureId] =
    useState<FormlessAccessFixtureId>("populated-owner");
  const selectedFixtureHost = fixtureHosts.find((fixture) => fixture.id === selectedFixtureId);

  if (!selectedFixtureHost) {
    return null;
  }

  return (
    <>
      <SegmentedControl
        label="Access state"
        layout="hug"
        onChange={(value) => setSelectedFixtureId(value as FormlessAccessFixtureId)}
        value={selectedFixtureId}
      >
        {fixtureHosts.map((fixture) => (
          <SegmentedControlItem key={fixture.id} label={fixture.label} value={fixture.id} />
        ))}
      </SegmentedControl>
      <FormlessAccessFixtureView fixtureHost={selectedFixtureHost} />
    </>
  );
}

export function FormlessAccessFixtureView({
  fixtureHost,
}: {
  fixtureHost: FormlessAccessFixtureHost;
}) {
  return (
    <FormlessUiContractHostProvider host={fixtureHost.host}>
      <AstryxSubscribedApplicationShellRenderer
        shellReference={fixtureHost.shellReference}
        themeReference={fixtureHost.themeReference}
      >
        <AstryxSubscribedAccessRenderer accessReference={fixtureHost.accessReference} />
      </AstryxSubscribedApplicationShellRenderer>
    </FormlessUiContractHostProvider>
  );
}

export type FormlessAccessFixtureHost = FormlessAccessFixture & {
  accessReference: FormlessUiAccessManifestReference;
  getState(): FormlessAccessFixtureState;
  host: Omit<FormlessUiMutableContractHost, "dispatch"> & {
    dispatch(intent: FormlessUiAccessIntent): void;
  };
  shellReference: NonNullable<
    ReturnType<typeof projectFormlessApplicationShellFixturePublication>["shellReference"]
  >;
  themeReference: NonNullable<
    ReturnType<typeof projectFormlessApplicationShellFixturePublication>["themeReference"]
  >;
};

export function createFormlessAccessFixtureHost(
  fixture: FormlessAccessFixture,
): FormlessAccessFixtureHost {
  let state = fixture.state;
  const initialPublication = projectFormlessAccessFixturePublication(state);
  let host: FormlessUiMutableContractHost;

  host = createFormlessUiMemoryContractHost({
    dispatch: (intent) => {
      if (!isFormlessUiAccessIntent(intent)) {
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
    shellReference: initialPublication.shellReference,
    themeReference: initialPublication.themeReference,
  };
}

export function projectFormlessAccessFixturePublication(state: FormlessAccessFixtureState): {
  accessReference: FormlessUiAccessManifestReference;
  nodes: FormlessUiContractHostNodeSet;
  shellReference: FormlessAccessFixtureHost["shellReference"];
  themeReference: FormlessAccessFixtureHost["themeReference"];
} {
  const shellFixture = accessApplicationShellFixture();
  const shellPublication = projectFormlessApplicationShellFixturePublication(
    shellFixture.shell,
    shellFixture.documentTheme,
  );
  const accessReference = formlessUiAccessManifestReference(state.manifest.id);
  const shellReference = shellPublication.shellReference;
  const themeReference = shellPublication.themeReference;

  if (!shellReference || !themeReference) {
    throw new Error("Access fixture requires shell and document-theme references.");
  }

  return {
    accessReference,
    nodes: [
      ...shellPublication.nodes,
      { reference: accessReference, snapshot: state.manifest },
      ...(state.authoring
        ? [
            {
              reference: formlessUiAccessInvitationAuthoringReference(
                state.authoring.accessId,
                state.authoring.id,
              ),
              snapshot: state.authoring,
            },
          ]
        : []),
    ],
    shellReference,
    themeReference,
  };
}

export function applyFormlessAccessFixtureIntent(
  state: FormlessAccessFixtureState,
  intent: FormlessUiAccessIntent,
): FormlessAccessFixtureState {
  const manifest = state.manifest;
  if (manifest.state !== "ready" || manifest.id !== intent.accessId) {
    return state;
  }

  switch (intent.type) {
    case "accessInvitationAuthoringOpenChange":
      return applyAuthoringOpenChange(state, manifest, intent);
    case "accessInvitationFieldChange":
      return applyAuthoringFieldChange(state, intent);
    case "accessInvitationGrantSelection":
      return applyAuthoringGrantSelection(state, intent);
    case "accessInvitationSubmit":
      return applyAuthoringSubmit(state, intent);
    case "accessInvitationRevocationConfirmationOpenChange":
      return applyRevocationConfirmationOpenChange(state, manifest, intent);
    case "accessInvitationRevoke":
      return applyInvitationRevoke(state, manifest, intent);
  }
}

function createFormlessAccessFixtureHosts() {
  return createFormlessAccessFixtures().map(createFormlessAccessFixtureHost);
}

function accessApplicationShellFixture(): FormlessApplicationShellFixture {
  const fixture = createFormlessApplicationShellFixtures().find(
    (candidate) => candidate.id === "product-instance",
  );
  if (!fixture?.shell || !fixture.documentTheme) {
    throw new Error("Missing product instance application-shell fixture.");
  }

  const accessSection = fixture.shell.sections.find((section) =>
    section.destinations.some((destination) => destination.id === "instance:access"),
  );
  const accessDestination = accessSection?.destinations.find(
    (destination) => destination.id === "instance:access",
  );
  if (!accessSection || !accessDestination) {
    throw new Error("Missing Access application-shell destination.");
  }

  return {
    ...fixture,
    routeLabel: "Access",
    shell: {
      manifest: {
        ...fixture.shell.manifest,
        activeDestination: {
          destinationId: accessDestination.id,
          sectionId: accessSection.id,
        },
      },
      sections: fixture.shell.sections.map((section) => ({
        ...section,
        destinations: section.destinations.map((destination) => ({
          ...destination,
          selected: destination.id === accessDestination.id,
        })),
      })),
    },
  };
}

function applyAuthoringOpenChange(
  state: FormlessAccessFixtureState,
  manifest: FormlessUiAccessReadyContract,
  intent: Extract<FormlessUiAccessIntent, { type: "accessInvitationAuthoringOpenChange" }>,
) {
  const authoring = state.authoring;
  if (!authoring || authoring.id !== intent.authoringId) {
    return state;
  }

  const currentAction = intent.open ? manifest.invite : authoring.cancel;
  if (!isExactAccessIntent(intent, currentAction.intent) || currentAction.control.disabled) {
    return state;
  }

  return replaceAuthoring(state, {
    ...authoring,
    feedback: undefined,
    open: intent.open,
  });
}

function applyAuthoringFieldChange(
  state: FormlessAccessFixtureState,
  intent: Extract<FormlessUiAccessIntent, { type: "accessInvitationFieldChange" }>,
) {
  const authoring = state.authoring;
  if (!authoring || authoring.id !== intent.authoringId || authoring.pending) {
    return state;
  }

  const fieldEntry = Object.entries(authoring.fields).find(([, field]) =>
    isExactAccessIntent(intent, { ...field.changeIntent, value: intent.value }),
  ) as
    | [
        keyof FormlessUiAccessInvitationAuthoringContract["fields"],
        FormlessUiAccessControlledFieldContract,
      ]
    | undefined;
  if (!fieldEntry || fieldEntry[1].disabledReason) {
    return state;
  }

  const [fieldKey, field] = fieldEntry;
  const fields = normalizeAuthoringFields({
    ...authoring.fields,
    [fieldKey]: {
      ...field,
      errors: fieldErrors(field, intent.value),
      options: field.options?.map((option) => ({
        ...option,
        selected: option.value === intent.value,
      })),
      value: intent.value,
    },
  });

  return replaceAuthoring(state, validateAuthoring({ ...authoring, feedback: undefined, fields }));
}

function applyAuthoringGrantSelection(
  state: FormlessAccessFixtureState,
  intent: Extract<FormlessUiAccessIntent, { type: "accessInvitationGrantSelection" }>,
) {
  const authoring = state.authoring;
  if (!authoring || authoring.id !== intent.authoringId || authoring.pending) {
    return state;
  }

  const grantSelections: FormlessUiAccessInvitationAuthoringContract["grantSelections"] = [
    applyGrantSelection(authoring.grantSelections[0], intent),
    applyGrantSelection(authoring.grantSelections[1], intent),
  ];
  const changed = grantSelections.some(
    (selection, index) => selection !== authoring.grantSelections[index],
  );

  return changed
    ? replaceAuthoring(
        state,
        validateAuthoring({ ...authoring, feedback: undefined, grantSelections }),
      )
    : state;
}

function applyAuthoringSubmit(
  state: FormlessAccessFixtureState,
  intent: Extract<FormlessUiAccessIntent, { type: "accessInvitationSubmit" }>,
) {
  const authoring = state.authoring;
  if (
    !authoring ||
    !authoring.open ||
    authoring.pending ||
    authoring.submit.control.disabled ||
    !isExactAccessIntent(intent, authoring.submit.intent)
  ) {
    return state;
  }

  const pendingReason = "Invitation creation is in progress.";
  const fields = Object.fromEntries(
    Object.entries(authoring.fields).map(([key, field]) => [
      key,
      { ...field, disabledReason: pendingReason },
    ]),
  ) as FormlessUiAccessInvitationAuthoringContract["fields"];
  const grantSelections: FormlessUiAccessInvitationAuthoringContract["grantSelections"] = [
    pendingGrantSelection(authoring.grantSelections[0], pendingReason),
    pendingGrantSelection(authoring.grantSelections[1], pendingReason),
  ];

  return replaceAuthoring(state, {
    ...authoring,
    cancel: pendingAction(authoring.cancel, pendingReason),
    feedback: undefined,
    fields,
    grantSelections,
    pending: { isPending: true, label: "Sending invitation" },
    submit: pendingAction(authoring.submit, pendingReason, "Sending invitation"),
  });
}

function applyRevocationConfirmationOpenChange(
  state: FormlessAccessFixtureState,
  manifest: FormlessUiAccessReadyContract,
  intent: Extract<
    FormlessUiAccessIntent,
    { type: "accessInvitationRevocationConfirmationOpenChange" }
  >,
) {
  if (!intent.open) {
    const confirmation = manifest.confirmation;
    if (!confirmation || !isExactAccessIntent(intent, confirmation.cancel.intent)) {
      return state;
    }

    const { confirmation: _confirmation, ...nextManifest } = manifest;
    return { ...state, manifest: nextManifest };
  }

  const invitation = manifest.invitations.find(
    (candidate) =>
      candidate.id === intent.invitationId &&
      candidate.revocation.availability === "available" &&
      isExactAccessIntent(intent, candidate.revocation.action.intent),
  );
  if (!invitation || invitation.revocation.availability !== "available") {
    return state;
  }

  return {
    ...state,
    manifest: {
      ...manifest,
      confirmation: revocationConfirmation(intent.invitationId, invitation.targetEmail),
    },
  };
}

function applyInvitationRevoke(
  state: FormlessAccessFixtureState,
  manifest: FormlessUiAccessReadyContract,
  intent: Extract<FormlessUiAccessIntent, { type: "accessInvitationRevoke" }>,
) {
  const confirmation = manifest.confirmation;
  if (
    !confirmation ||
    confirmation.action.control.disabled ||
    !isExactAccessIntent(intent, confirmation.action.intent)
  ) {
    return state;
  }

  const pendingReason = "Invitation revocation is in progress.";
  return {
    ...state,
    manifest: {
      ...manifest,
      confirmation: {
        ...confirmation,
        action: pendingAction(confirmation.action, pendingReason, "Revoking..."),
        cancel: pendingAction(confirmation.cancel, pendingReason),
      },
      feedback: undefined,
      invitations: manifest.invitations.map((invitation) => {
        if (
          invitation.id !== intent.invitationId ||
          invitation.revocation.availability !== "available"
        ) {
          return invitation;
        }

        return {
          ...invitation,
          revocation: {
            ...invitation.revocation,
            action: pendingAction(invitation.revocation.action, pendingReason, "Revoking..."),
          },
        };
      }),
    },
  };
}

function applyGrantSelection<Purpose extends "memberships" | "roles">(
  selection: FormlessUiAccessGrantSelectionContract & { purpose: Purpose },
  intent: Extract<FormlessUiAccessIntent, { type: "accessInvitationGrantSelection" }>,
): FormlessUiAccessGrantSelectionContract & { purpose: Purpose } {
  if (selection.id !== intent.controlId || selection.disabledReason) {
    return selection;
  }

  const groups = selection.groups.map((group) => {
    if (group.id !== intent.groupId) {
      return group;
    }

    const options = group.options.map((option) => {
      if (
        option.id !== intent.optionId ||
        option.disabledReason ||
        !isExactAccessIntent(intent, option.selectionIntent)
      ) {
        return option;
      }

      return {
        ...option,
        selected: intent.selected,
        selectionIntent: { ...option.selectionIntent, selected: !intent.selected },
      };
    });

    return options.some((option, index) => option !== group.options[index])
      ? { ...group, options }
      : group;
  });

  if (!groups.some((group, index) => group !== selection.groups[index])) {
    return selection;
  }

  return {
    ...selection,
    errors: groups.flatMap((group) =>
      group.options.flatMap((option) =>
        option.selected && option.disabledReason ? [option.disabledReason] : [],
      ),
    ),
    groups,
    selectedOptionIds: groups.flatMap((group) =>
      group.options.filter((option) => option.selected).map((option) => option.id),
    ),
  };
}

function pendingGrantSelection<Purpose extends "memberships" | "roles">(
  selection: FormlessUiAccessGrantSelectionContract & { purpose: Purpose },
  pendingReason: string,
): FormlessUiAccessGrantSelectionContract & { purpose: Purpose } {
  return {
    ...selection,
    disabledReason: pendingReason,
    groups: selection.groups.map((group) => ({
      ...group,
      options: group.options.map((option) => ({ ...option, disabledReason: pendingReason })),
    })),
  };
}

function normalizeAuthoringFields(
  fields: FormlessUiAccessInvitationAuthoringContract["fields"],
): FormlessUiAccessInvitationAuthoringContract["fields"] {
  const targetSurface = fields.targetSurface.value;
  return {
    ...fields,
    targetAppInstall: {
      ...fields.targetAppInstall,
      disabledReason:
        targetSurface === "app-install" ? undefined : "Choose App install as the target surface.",
      errors:
        targetSurface === "app-install" && !fields.targetAppInstall.value
          ? ["Choose an available app install scope."]
          : [],
      required: targetSurface === "app-install",
    },
    targetOrganization: {
      ...fields.targetOrganization,
      disabledReason:
        targetSurface === "organization" ? undefined : "Choose Organization as the target surface.",
      errors:
        targetSurface === "organization" && !fields.targetOrganization.value
          ? ["Choose an available organization scope."]
          : [],
      required: targetSurface === "organization",
    },
  };
}

function fieldErrors(field: FormlessUiAccessControlledFieldContract, value: string) {
  const trimmed = value.trim();
  if (field.required && !trimmed) {
    return [`${field.label} is required.`];
  }
  if (field.inputKind === "email" && !/^\S+@\S+\.\S+$/.test(trimmed)) {
    return ["Email must be valid."];
  }
  return [];
}

function validateAuthoring(
  authoring: FormlessUiAccessInvitationAuthoringContract,
): FormlessUiAccessInvitationAuthoringContract {
  const errors = [
    ...Object.values(authoring.fields).flatMap((field) => field.errors),
    ...authoring.grantSelections.flatMap((selection) => selection.errors),
  ];
  const {
    disabled: _disabled,
    disabledReason: _disabledReason,
    ...submitControl
  } = authoring.submit.control;

  return {
    ...authoring,
    errors,
    submit: {
      ...authoring.submit,
      control:
        errors.length > 0
          ? { ...submitControl, disabled: true, disabledReason: errors[0] }
          : submitControl,
    },
  };
}

function revocationConfirmation(
  invitationId: string,
  targetEmail: string,
): FormlessUiAccessReadyContract["confirmation"] {
  return {
    action: accessAction("invitation-revoke", "Revoke invitation", {
      accessId: "access:fixture",
      actionId: "access:fixture:revocation-confirm",
      confirmationId: "access:fixture:revocation-confirmation",
      controlId: "access:fixture:revocation-confirm:control",
      invitationId,
      type: "accessInvitationRevoke",
    }),
    cancel: accessAction("revocation-cancel", "Cancel", {
      accessId: "access:fixture",
      actionId: "access:fixture:revocation-cancel",
      confirmationId: "access:fixture:revocation-confirmation",
      controlId: "access:fixture:revocation-cancel:control",
      invitationId,
      open: false,
      type: "accessInvitationRevocationConfirmationOpenChange",
    }),
    description: `The pending invitation for ${targetEmail} will no longer be usable.`,
    id: "access:fixture:revocation-confirmation",
    invitationId,
    kind: "accessConfirmation",
    open: true,
    title: "Revoke invitation?",
  };
}

function accessAction<Intent extends FormlessUiAccessActionContract["intent"]>(
  purpose: FormlessUiAccessActionContract<Intent>["purpose"],
  label: string,
  intent: Intent,
): FormlessUiAccessActionContract<Intent> {
  return {
    control: {
      accessibilityLabel: label,
      content: { kind: "label", label },
      density: "default",
      id: intent.controlId,
      kind: "button",
      prominence: purpose === "invitation-revoke" ? "primary" : "secondary",
      type: "button",
    },
    id: intent.actionId,
    intent,
    kind: "accessAction",
    purpose,
  };
}

function pendingAction<Intent extends FormlessUiAccessActionContract["intent"]>(
  action: FormlessUiAccessActionContract<Intent>,
  disabledReason: string,
  label?: string,
): FormlessUiAccessActionContract<Intent> {
  const nextLabel = label ?? action.control.accessibilityLabel;

  return {
    ...action,
    control: {
      ...action.control,
      accessibilityLabel: nextLabel,
      content: { kind: "label", label: nextLabel },
      disabled: true,
      disabledReason,
      pending: { isPending: true, label: nextLabel },
    },
  };
}

function replaceAuthoring(
  state: FormlessAccessFixtureState,
  authoring: FormlessUiAccessInvitationAuthoringContract,
) {
  return authoring === state.authoring ? state : { ...state, authoring };
}

function isExactAccessIntent(actual: FormlessUiAccessIntent, expected: FormlessUiAccessIntent) {
  const actualRecord = actual as unknown as Record<string, unknown>;
  const expectedRecord = expected as unknown as Record<string, unknown>;
  const actualKeys = Object.keys(actualRecord);
  const expectedKeys = Object.keys(expectedRecord);

  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => actualRecord[key] === expectedRecord[key])
  );
}

export { accessFixtureAuthoringReference };
