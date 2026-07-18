import { useState } from "react";
import type {
  FormlessUiManagementInstallDialogContract,
  FormlessUiManagementIntent,
  FormlessUiManagementReadyContract,
  FormlessUiManagementWorkspaceOperationContract,
  FormlessUiWorkspaceIntent,
} from "../formless-ui-contract.ts";
import {
  createFormlessUiMemoryContractHost,
  formlessUiManagementInstallDialogReference,
  formlessUiManagementManifestReference,
  isFormlessUiManagementIntent,
  isFormlessUiWorkspaceIntent,
  type FormlessUiContractHostNodeSet,
  type FormlessUiMutableContractHost,
} from "../formless-ui-contract-host.ts";
import { FormlessUiContractHostProvider } from "../formless-ui-contract-host-react.tsx";
import { applyScenarioFieldIntent } from "./fields/fixture-helpers.ts";
import { FormlessFixtureFrame, FormlessFixtureSelector } from "./fixture-layout.tsx";
import { AstryxSubscribedManagementRenderer } from "./formless-ui-management-renderer.tsx";
import {
  applyGeneratedWorkspaceIntent,
  projectGeneratedWorkspaceFixturePublication,
} from "./generated-workspace.tsx";
import {
  createFormlessInstanceManagementFixtures,
  instanceManagementAppsReference,
  instanceManagementInstallActionControlId,
  instanceManagementInstallActionId,
  instanceManagementWorkspacePushFixture,
  instanceManagementWorkspacePushOperationId,
  type FormlessInstanceManagementFixture,
  type FormlessInstanceManagementFixtureId,
  type FormlessInstanceManagementFixtureState,
} from "./instance-management.fixtures.ts";

export function FormlessInstanceManagementLayout() {
  const [fixtures] = useState(createFormlessInstanceManagementFixtureHosts);
  const [selectedFixtureId, setSelectedFixtureId] =
    useState<FormlessInstanceManagementFixtureId>("installed");
  const selectedFixture = fixtures.find((fixture) => fixture.id === selectedFixtureId);

  if (!selectedFixture) {
    return null;
  }

  return (
    <FormlessFixtureFrame
      ariaLabel="Instance management fixtures"
      controls={
        <FormlessFixtureSelector
          label="Instance management state"
          onSelectionChange={setSelectedFixtureId}
          options={fixtures}
          selectedId={selectedFixtureId}
        />
      }
    >
      <FormlessInstanceManagementFixtureView fixtureHost={selectedFixture} />
    </FormlessFixtureFrame>
  );
}

export function FormlessInstanceManagementFixtureView({
  fixtureHost,
}: {
  fixtureHost: FormlessInstanceManagementFixtureHost;
}) {
  return (
    <FormlessUiContractHostProvider host={fixtureHost.host}>
      <AstryxSubscribedManagementRenderer managementReference={fixtureHost.managementReference} />
    </FormlessUiContractHostProvider>
  );
}

export type FormlessInstanceManagementFixtureHost = FormlessInstanceManagementFixture & {
  getState(): FormlessInstanceManagementFixtureState;
  host: Omit<FormlessUiMutableContractHost, "dispatch"> & {
    dispatch(intent: FormlessUiManagementIntent | FormlessUiWorkspaceIntent): void;
  };
  managementReference: ReturnType<typeof formlessUiManagementManifestReference>;
};

export function createFormlessInstanceManagementFixtureHost(
  fixture: FormlessInstanceManagementFixture,
): FormlessInstanceManagementFixtureHost {
  let state = fixture.state;
  const initialPublication = projectFormlessInstanceManagementFixturePublication(state);
  let host: FormlessUiMutableContractHost;

  host = createFormlessUiMemoryContractHost({
    dispatch: (intent) => {
      const nextState = isFormlessUiManagementIntent(intent)
        ? applyFormlessInstanceManagementFixtureIntent(state, intent)
        : isFormlessUiWorkspaceIntent(intent)
          ? applyFormlessInstanceManagementWorkspaceFixtureIntent(state, intent)
          : undefined;

      if (nextState === undefined) {
        throw new Error("Instance management fixture host received an unsupported intent.");
      }
      if (nextState === state) {
        return;
      }

      state = nextState;
      host.publish(projectFormlessInstanceManagementFixturePublication(state).nodes);

      if (intent.type === "managementWorkspaceOperation") {
        scheduleWorkspacePushTimeline();
      }
    },
    nodes: initialPublication.nodes,
  });

  function scheduleWorkspacePushTimeline() {
    let delayMs = 0;

    for (const transition of instanceManagementWorkspacePushFixture.timeline ?? []) {
      delayMs += transition.delayMs;
      globalThis.setTimeout(() => {
        if (state.manifest.state !== "ready") {
          return;
        }

        const operation = state.manifest.workspaceOperation;
        if (
          operation?.id !== instanceManagementWorkspacePushOperationId ||
          operation.control.status.status !== "pending"
        ) {
          return;
        }

        state = replaceReadyManifest(state, {
          ...state.manifest,
          workspaceOperation: {
            ...operation,
            control: transition.snapshot,
          },
        });
        host.publish(projectFormlessInstanceManagementFixturePublication(state).nodes);
      }, delayMs);
    }
  }

  return {
    ...fixture,
    getState: () => state,
    host: host as FormlessInstanceManagementFixtureHost["host"],
    managementReference: initialPublication.managementReference,
  };
}

export function projectFormlessInstanceManagementFixturePublication(
  state: FormlessInstanceManagementFixtureState,
): {
  managementReference: ReturnType<typeof formlessUiManagementManifestReference>;
  nodes: FormlessUiContractHostNodeSet;
} {
  const managementReference = formlessUiManagementManifestReference(state.manifest.id);
  const workspaceNodes = state.workspaces.flatMap(
    (workspace) => projectGeneratedWorkspaceFixturePublication(workspace).nodes,
  );

  return {
    managementReference,
    nodes: [
      { reference: managementReference, snapshot: state.manifest },
      ...(state.dialog === null
        ? []
        : [
            {
              reference: formlessUiManagementInstallDialogReference(
                state.dialog.managementId,
                state.dialog.id,
              ),
              snapshot: state.dialog,
            },
          ]),
      ...workspaceNodes,
    ],
  };
}

export function applyFormlessInstanceManagementFixtureIntent(
  state: FormlessInstanceManagementFixtureState,
  intent: FormlessUiManagementIntent,
): FormlessInstanceManagementFixtureState {
  if (state.manifest.id !== intent.managementId || state.manifest.state !== "ready") {
    return state;
  }

  if (
    intent.type === "managementWorkspaceOperation" ||
    intent.type === "managementAuthorizationOpen"
  ) {
    return applyManagementOperationIntent(state, state.manifest, intent);
  }

  const dialog = state.dialog;
  if (!dialog || dialog.id !== intent.dialogId || dialog.managementId !== intent.managementId) {
    return state;
  }

  switch (intent.type) {
    case "managementInstallDialogOpenChange":
      return replaceDialog(state, { ...dialog, open: intent.open });
    case "managementInstallField":
      return applyManagementInstallFieldIntent(state, dialog, intent);
    case "managementInstallPackageSelection":
      return applyManagementInstallPackageSelectionIntent(state, dialog, intent);
    case "managementInstallSubmit":
      return applyManagementInstallSubmitIntent(state, dialog, intent);
  }
}

export function applyFormlessInstanceManagementWorkspaceFixtureIntent(
  state: FormlessInstanceManagementFixtureState,
  intent: FormlessUiWorkspaceIntent,
): FormlessInstanceManagementFixtureState {
  if (
    intent.type === "workspaceExternalAction" &&
    intent.screenId === instanceManagementAppsReference.workspaceId &&
    intent.actionId === instanceManagementInstallActionId &&
    intent.controlId === instanceManagementInstallActionControlId &&
    intent.intent.controlId === instanceManagementInstallActionControlId
  ) {
    return state.dialog && !state.dialog.open
      ? replaceDialog(state, { ...state.dialog, open: true })
      : state;
  }

  let changed = false;
  const workspaces = state.workspaces.map((workspace) => {
    const nextWorkspace = applyGeneratedWorkspaceIntent(workspace, intent);
    changed ||= nextWorkspace !== workspace;
    return nextWorkspace;
  });

  return changed ? { ...state, workspaces } : state;
}

function createFormlessInstanceManagementFixtureHosts() {
  return createFormlessInstanceManagementFixtures().map(
    createFormlessInstanceManagementFixtureHost,
  );
}

function applyManagementInstallFieldIntent(
  state: FormlessInstanceManagementFixtureState,
  dialog: FormlessUiManagementInstallDialogContract,
  intent: Extract<FormlessUiManagementIntent, { type: "managementInstallField" }>,
) {
  const fieldKey = managementDialogFieldKey(dialog, intent.fieldId);
  if (!fieldKey) {
    return state;
  }

  const field = applyScenarioFieldIntent(dialog.fields[fieldKey], intent.intent);
  if (field.mode !== "editor" || field.surface !== "create") {
    return state;
  }

  const fields = { ...dialog.fields, [fieldKey]: field };
  return replaceDialog(state, withInstallValidation(dialog, fields));
}

function applyManagementInstallPackageSelectionIntent(
  state: FormlessInstanceManagementFixtureState,
  dialog: FormlessUiManagementInstallDialogContract,
  intent: Extract<FormlessUiManagementIntent, { type: "managementInstallPackageSelection" }>,
) {
  const selectedOption = dialog.packageOptions.find(
    (option) => option.id === intent.optionId && option.selectionIntent.fieldId === intent.fieldId,
  );
  if (!selectedOption || dialog.fields.package.fieldId !== intent.fieldId) {
    return state;
  }

  const packageField = {
    ...dialog.fields.package,
    draftInput: { kind: "input" as const, value: selectedOption.packageAppKey },
    errors: [],
    value: selectedOption.packageAppKey,
  };
  const fields = { ...dialog.fields, package: packageField };

  return replaceDialog(
    state,
    withInstallValidation(
      {
        ...dialog,
        packageOptions: dialog.packageOptions.map((option) => ({
          ...option,
          selected: option.id === selectedOption.id,
        })),
        selectedPackageOptionId: selectedOption.id,
        submit: {
          ...dialog.submit,
          accessibilityLabel: `Install ${selectedOption.label}`,
          content: { kind: "label", label: `Install ${selectedOption.label}` },
        },
      },
      fields,
    ),
  );
}

function applyManagementInstallSubmitIntent(
  state: FormlessInstanceManagementFixtureState,
  dialog: FormlessUiManagementInstallDialogContract,
  intent: Extract<FormlessUiManagementIntent, { type: "managementInstallSubmit" }>,
) {
  if (dialog.submit.id !== intent.controlId || dialog.errors.length > 0 || dialog.submit.disabled) {
    return state;
  }

  return replaceDialog(state, {
    ...dialog,
    feedback: {
      detail: "The fixture is preparing the app install.",
      id: "instance-management:feedback:install-pending",
      intent: "info",
      kind: "managementFeedback",
      title: "Installing app",
    },
    pending: { isPending: true, label: "Installing app" },
    submit: {
      ...dialog.submit,
      disabled: true,
      disabledReason: "Installing app",
      pending: { isPending: true, label: "Installing app" },
    },
  });
}

function applyManagementOperationIntent(
  state: FormlessInstanceManagementFixtureState,
  manifest: FormlessUiManagementReadyContract,
  intent: Extract<
    FormlessUiManagementIntent,
    { type: "managementAuthorizationOpen" | "managementWorkspaceOperation" }
  >,
) {
  const operation = manifest.workspaceOperation;
  if (!operation || operation.id !== intent.operationId) {
    return state;
  }

  if (intent.type === "managementAuthorizationOpen") {
    const prompt = operation.authorizationPrompt;
    if (!prompt || prompt.id !== intent.promptId || prompt.action.id !== intent.controlId) {
      return state;
    }

    return replaceReadyManifest(state, {
      ...manifest,
      workspaceFeedback: {
        detail: "External authorization was simulated by the fixture.",
        id: "instance-management:feedback:authorization-opened",
        intent: "success",
        kind: "managementFeedback",
        title: "Authorization opened",
      },
      workspaceOperation: { ...operation, authorizationPrompt: undefined },
    });
  }

  if (
    operation.control.id !== intent.controlId ||
    intent.intent.controlId !== intent.controlId ||
    intent.intent.type !== "operationInvoke" ||
    operation.control.status.status === "pending"
  ) {
    return state;
  }

  return replaceReadyManifest(state, {
    ...manifest,
    workspaceFeedback: undefined,
    workspaceOperation: pendingOperation(operation),
  });
}

function pendingOperation(
  operation: FormlessUiManagementWorkspaceOperationContract,
): FormlessUiManagementWorkspaceOperationContract {
  return {
    ...operation,
    authorizationPrompt: undefined,
    control: instanceManagementWorkspacePushFixture.pending,
  };
}

function withInstallValidation(
  dialog: FormlessUiManagementInstallDialogContract,
  fields: FormlessUiManagementInstallDialogContract["fields"],
): FormlessUiManagementInstallDialogContract {
  const errors = [fields.label, fields.installId, fields.package].flatMap(
    (field) => field.errors?.map((error) => error.message) ?? [],
  );
  const missingRequiredValue = [fields.label, fields.installId, fields.package].some(
    (field) => field.required && String(field.draftInput?.value ?? field.value ?? "").trim() === "",
  );
  if (missingRequiredValue && errors.length === 0) {
    errors.push("Complete all required install fields.");
  }
  const disabled = errors.length > 0;

  return {
    ...dialog,
    errors,
    fields,
    feedback: undefined,
    pending: undefined,
    submit: {
      ...dialog.submit,
      disabled,
      disabledReason: disabled ? "Resolve the validation errors." : undefined,
      pending: undefined,
    },
  };
}

function managementDialogFieldKey(
  dialog: FormlessUiManagementInstallDialogContract,
  fieldId: string,
): keyof FormlessUiManagementInstallDialogContract["fields"] | undefined {
  return (Object.keys(dialog.fields) as (keyof typeof dialog.fields)[]).find(
    (key) => dialog.fields[key].fieldId === fieldId,
  );
}

function replaceDialog(
  state: FormlessInstanceManagementFixtureState,
  dialog: FormlessUiManagementInstallDialogContract,
) {
  return dialog === state.dialog ? state : { ...state, dialog };
}

function replaceReadyManifest(
  state: FormlessInstanceManagementFixtureState,
  manifest: FormlessUiManagementReadyContract,
) {
  return manifest === state.manifest ? state : { ...state, manifest };
}
