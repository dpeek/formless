import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  FormlessUiButtonContract,
  FormlessUiCreateField,
  FormlessUiManagementInstallDialogContract,
  FormlessUiManagementIntent,
  FormlessUiManagementManifestContract,
  FormlessUiManagementReadyContract,
  FormlessUiManagementWorkspaceOperationContract,
  FormlessUiWorkspaceContract,
  FormlessUiWorkspaceManifestContract,
} from "@dpeek/formless-astryx/contract";
import {
  createFormlessUiMemoryContractHost,
  formlessUiManagementInstallDialogReference,
  formlessUiManagementManifestReference,
  formlessUiWorkspaceManifestReference,
} from "@dpeek/formless-astryx/contract-host";
import { FormlessUiContractHostProvider } from "@dpeek/formless-astryx/contract-host/react";
import {
  LegacyManagementInstallDialogContent,
  LegacyManagementRenderer,
  LegacySubscribedManagementRenderer,
  dispatchLegacyManagementInstallFieldIntent,
  dispatchLegacyManagementWorkspaceOperationIntent,
} from "./legacy-management-renderer.tsx";

const managementReference = formlessUiManagementManifestReference("instance-management");
const dialogReference = formlessUiManagementInstallDialogReference(
  managementReference.managementId,
  "instance-management:install-dialog",
);
const appsReference = formlessUiWorkspaceManifestReference("instance-management:apps");
const routesReference = formlessUiWorkspaceManifestReference("instance-management:routes");

describe("legacy management renderer", () => {
  it("renders accessible loading and display-safe failure states from snapshots", () => {
    const loadingHtml = renderToStaticMarkup(
      <LegacyManagementRenderer
        manifest={managementManifest({ state: "loading" })}
        onIntent={() => undefined}
        onWorkspaceIntent={() => undefined}
      />,
    );
    const failedHtml = renderToStaticMarkup(
      <LegacyManagementRenderer
        manifest={managementManifest({ state: "failed" })}
        onIntent={() => undefined}
        onWorkspaceIntent={() => undefined}
      />,
    );

    expect(loadingHtml).toContain('data-formless-management-state="loading"');
    expect(loadingHtml).toContain("Instance Settings");
    expect(loadingHtml).toContain("Loading Instance control plane...");
    expect(failedHtml).toContain('data-formless-management-state="failed"');
    expect(failedHtml).toContain('role="alert"');
    expect(failedHtml).toContain("Instance management unavailable");
    expect(failedHtml).toContain("Could not read &lt;path&gt; with TOKEN=[redacted].");
    expect(failedHtml).not.toContain("/Users/ada/formless");
    expect(failedHtml).not.toContain("owner-secret");
  });

  it("renders referenced workspaces, controlled install fields, Push, and authorization", () => {
    const manifest = readyManifest();
    const dialog = installDialog();
    const html = renderToStaticMarkup(
      <LegacyManagementRenderer
        dialog={dialog}
        manifest={manifest}
        onIntent={() => undefined}
        onWorkspaceIntent={() => undefined}
        workspaces={[
          completeWorkspace(appsReference.workspaceId, "Apps"),
          completeWorkspace(routesReference.workspaceId, "Routes"),
        ]}
      />,
    );
    const dialogHtml = renderToStaticMarkup(
      <LegacyManagementInstallDialogContent dialog={dialog} onIntent={() => undefined} />,
    );

    expect(html).toContain('aria-label="Apps"');
    expect(html).toContain('aria-label="Routes"');
    expect(html).toContain(`data-formless-legacy-workspace="${appsReference.workspaceId}"`);
    expect(html).toContain(`data-formless-legacy-workspace="${routesReference.workspaceId}"`);
    expect(dialogHtml).toContain('data-formless-management-install-dialog="');
    expect(dialogHtml).toContain('aria-label="App type"');
    expect(dialogHtml).toContain('aria-selected="true"');
    expect(dialogHtml).toContain('value="Docs Site"');
    expect(dialogHtml).toContain('value="docs"');
    expect(html).toContain('aria-label="Push workspace"');
    expect(html).toContain('data-formless-generated-operation-status="pending"');
    expect(html).toContain("Writing &lt;path&gt; with TOKEN=[redacted]");
    expect(html).toContain("Cloudflare authorization");
    expect(html).toContain('aria-label="Open authorization"');
    expect(html).not.toContain("/Users/ada/formless");
    expect(html).not.toContain("owner-secret");
  });

  it("subscribes through management, dialog, and workspace references on one host", () => {
    const manifest = readyManifest({
      workspaceFeedback: {
        detail: "Gateway failed at <path> with TOKEN=[redacted].",
        id: "instance-management:feedback:gateway",
        intent: "danger",
        kind: "managementFeedback",
        title: "Push unavailable",
      },
      workspaceOperation: undefined,
    });
    const host = createFormlessUiMemoryContractHost({
      nodes: [
        { reference: managementReference, snapshot: manifest },
        { reference: dialogReference, snapshot: installDialog({ open: false }) },
        {
          reference: appsReference,
          snapshot: workspaceManifest(appsReference.workspaceId, "Apps"),
        },
        {
          reference: routesReference,
          snapshot: workspaceManifest(routesReference.workspaceId, "Routes"),
        },
      ],
    });
    const html = renderToStaticMarkup(
      <FormlessUiContractHostProvider host={host}>
        <LegacySubscribedManagementRenderer managementReference={managementReference} />
      </FormlessUiContractHostProvider>,
    );

    expect(html).toContain('data-formless-management-state="ready"');
    expect(html).toContain(`data-formless-legacy-workspace="${appsReference.workspaceId}"`);
    expect(html).toContain(`data-formless-legacy-workspace="${routesReference.workspaceId}"`);
    expect(html).toContain(
      'data-formless-management-feedback="instance-management:feedback:gateway"',
    );
    expect(html).toContain("Push unavailable");
    expect(html).toContain("Gateway failed at &lt;path&gt; with TOKEN=[redacted].");
    expect(html).not.toContain("owner-secret");
  });

  it("dispatches exact canonical field and Push intent envelopes", async () => {
    const manifest = readyManifest();
    const dialog = installDialog();
    const operation = required(manifest.workspaceOperation);
    const intents: FormlessUiManagementIntent[] = [];
    const onIntent = (intent: FormlessUiManagementIntent) => {
      intents.push(intent);
    };
    const fieldIntent = {
      fieldName: "label",
      fieldValue: { kind: "input", value: "Docs" },
      type: "createDraftChange",
    } as const;

    await dispatchLegacyManagementInstallFieldIntent(
      onIntent,
      dialog,
      dialog.fields.label,
      fieldIntent,
    );
    await dispatchLegacyManagementWorkspaceOperationIntent(
      onIntent,
      manifest,
      operation,
      operation.control.trigger.intent,
    );

    expect(intents).toEqual([
      {
        dialogId: dialog.id,
        fieldId: dialog.fields.label.fieldId,
        intent: fieldIntent,
        managementId: manifest.id,
        type: "managementInstallField",
      },
      {
        controlId: operation.control.id,
        intent: operation.control.trigger.intent,
        managementId: manifest.id,
        operationId: operation.id,
        type: "managementWorkspaceOperation",
      },
    ]);
    expect(dialog.packageOptions[1]?.selectionIntent.type).toBe(
      "managementInstallPackageSelection",
    );
    expect(dialog.submitIntent.type).toBe("managementInstallSubmit");
    expect(operation.authorizationPrompt?.intent.type).toBe("managementAuthorizationOpen");
  });
});

function managementManifest({
  state,
}: {
  state: "failed" | "loading";
}): FormlessUiManagementManifestContract {
  const base = {
    accessibilityLabel: "Instance settings overview",
    id: managementReference.managementId,
    kind: "managementManifest" as const,
    title: "Instance Settings",
  };

  return state === "loading"
    ? { ...base, message: "Loading Instance control plane...", state }
    : {
        ...base,
        feedback: {
          detail: "Could not read <path> with TOKEN=[redacted].",
          id: "instance-management:feedback:load",
          intent: "danger",
          kind: "managementFeedback",
          title: "Instance management unavailable",
        },
        state,
      };
}

function readyManifest(
  overrides: Partial<FormlessUiManagementReadyContract> = {},
): FormlessUiManagementReadyContract {
  return {
    accessibilityLabel: "Instance settings overview",
    id: managementReference.managementId,
    installDialog: dialogReference,
    kind: "managementManifest",
    state: "ready",
    title: "Instance Settings",
    workspaceOperation: workspaceOperation(),
    workspaces: [
      { reference: appsReference, role: "apps" },
      { reference: routesReference, role: "routes" },
    ],
    ...overrides,
  };
}

function installDialog({
  open = true,
}: {
  open?: boolean;
} = {}): FormlessUiManagementInstallDialogContract {
  const packageField = createField("packageAppKey", "site", "App type");
  const labelField = createField("label", "Docs Site", "Label");
  const installIdField = createField("installId", "docs", "Install id");
  const submit = button("instance-management:install-submit", "Install Site", "primary", "submit");
  const option = (packageAppKey: string, label: string, selected: boolean) => {
    const id = `instance-management:package:${packageAppKey}`;
    return {
      description: `${label} package description.`,
      id,
      kind: "managementPackageOption" as const,
      label,
      packageAppKey,
      selected,
      selectionIntent: {
        dialogId: dialogReference.dialogId,
        fieldId: packageField.fieldId,
        managementId: managementReference.managementId,
        optionId: id,
        type: "managementInstallPackageSelection" as const,
      },
    };
  };

  return {
    cancel: button("instance-management:install-cancel", "Cancel", "secondary"),
    closeIntent: {
      dialogId: dialogReference.dialogId,
      managementId: managementReference.managementId,
      open: false,
      type: "managementInstallDialogOpenChange",
    },
    description: "Choose an app type, then set its instance label and install id.",
    errors: [],
    fields: { installId: installIdField, label: labelField, package: packageField },
    id: dialogReference.dialogId,
    kind: "managementInstallDialog",
    managementId: managementReference.managementId,
    open,
    packageOptions: [option("site", "Site", true), option("tasks", "Tasks", false)],
    selectedPackageOptionId: "instance-management:package:site",
    submit,
    submitIntent: {
      controlId: submit.id,
      dialogId: dialogReference.dialogId,
      managementId: managementReference.managementId,
      type: "managementInstallSubmit",
    },
    title: "Install app",
  };
}

function workspaceOperation(): FormlessUiManagementWorkspaceOperationContract {
  const controlId = "instance-management:workspace:push:control";
  const promptId = "instance-management:workspace:push:authorization:event-1";

  return {
    authorizationPrompt: {
      action: button(`${promptId}:open`, "Open authorization", "secondary"),
      detail: "Local Cloudflare requires external authorization.",
      id: promptId,
      intent: {
        controlId: `${promptId}:open`,
        managementId: managementReference.managementId,
        operationId: "instance-management:workspace:push",
        promptId,
        type: "managementAuthorizationOpen",
      },
      kind: "managementAuthorizationPrompt",
      title: "Cloudflare authorization",
    },
    control: {
      feedback: {
        activeProgress: { label: "Push source", stepId: "push" },
        detail: "Writing <path> with TOKEN=[redacted]",
        id: `${controlId}:feedback`,
        intent: "info",
        kind: "operationFeedbackEvent",
        status: "pending",
        title: "Pushing workspace",
      },
      id: controlId,
      kind: "operationControl",
      progress: {
        id: `${controlId}:progress`,
        kind: "operationProgress",
        steps: [
          { id: "plan", label: "Plan", status: "succeeded" },
          {
            detail: "Writing <path> with TOKEN=[redacted]",
            id: "push",
            label: "Push source",
            status: "running",
          },
        ],
        title: "Pushing workspace",
        updatedAt: 1,
      },
      status: {
        accessibilityLabel: "Push pending",
        detail: "Push source",
        id: `${controlId}:status`,
        intent: "info",
        kind: "compactStatus",
        label: "Pushing workspace",
        pending: { isPending: true, label: "Pushing workspace" },
        status: "pending",
      },
      trigger: {
        accessibilityLabel: "Push workspace",
        content: { kind: "label", label: "Push" },
        density: "compact",
        disabled: true,
        disabledReason: "Pushing workspace",
        id: controlId,
        intent: { controlId, invocationSource: "button", type: "operationInvoke" },
        kind: "button",
        pending: { isPending: true, label: "Pushing workspace" },
        prominence: "primary",
        type: "button",
      },
    },
    id: "instance-management:workspace:push",
    kind: "managementWorkspaceOperation",
  };
}

function completeWorkspace(id: string, label: string): FormlessUiWorkspaceContract {
  return {
    ...workspaceManifest(id, label),
    kind: "workspace",
    sections: [],
  };
}

function workspaceManifest(id: string, label: string): FormlessUiWorkspaceManifestContract {
  return {
    accessibilityLabel: `${label} workspace`,
    actions: [
      {
        accessibilityLabel: `${label} workspace action`,
        href: `/${label.toLowerCase()}`,
        id: `${id}:link`,
        kind: "workspaceLinkAction",
        label: `${label} workspace action`,
        prominence: "secondary",
        target: "sameTab",
      },
    ],
    id,
    kind: "workspaceManifest",
    label,
    sections: [],
  };
}

function createField(fieldName: string, value: string, label: string): FormlessUiCreateField {
  const field = { label, required: true, type: "text" as const };
  return {
    access: { canPatch: true, kind: "editable", writable: true },
    commit: "submit",
    control: {
      control: { inputType: "text", kind: "input" },
      controlKind: "text",
      createDefaultChecked: false,
      createDefaultValue: undefined,
      editor: "text",
      field,
      inputAttributes: {},
      kind: "text",
      label,
      required: true,
    },
    density: "default",
    draftInput: { kind: "input", value },
    editor: "text",
    field,
    fieldId: `field:standalone:${dialogReference.dialogId}:${fieldName}`,
    fieldName,
    label,
    labelVisibility: "visible",
    mode: "editor",
    required: true,
    surface: "create",
    value,
  };
}

function button(
  id: string,
  label: string,
  prominence: FormlessUiButtonContract["prominence"],
  type: FormlessUiButtonContract["type"] = "button",
): FormlessUiButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    prominence,
    type,
  };
}

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("Expected value.");
  }
  return value;
}
