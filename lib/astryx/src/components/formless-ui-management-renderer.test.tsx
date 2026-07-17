import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
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
} from "../formless-ui-contract.ts";
import {
  createFormlessUiMemoryContractHost,
  formlessUiManagementInstallDialogReference,
  formlessUiManagementManifestReference,
  formlessUiWorkspaceManifestReference,
} from "../formless-ui-contract-host.ts";
import { FormlessUiContractHostProvider } from "../formless-ui-contract-host-react.tsx";
import {
  AstryxManagementInstallDialogContent,
  AstryxManagementRenderer,
  AstryxSubscribedManagementRenderer,
  dispatchAstryxManagementInstallFieldIntent,
  dispatchAstryxManagementWorkspaceOperationIntent,
} from "./formless-ui-management-renderer.tsx";

vi.mock("@stylexjs/stylex", () => ({
  create: <Styles,>(styles: Styles) => styles,
  createTheme: () => ({}),
  props: () => ({}),
}));

const managementReference = formlessUiManagementManifestReference("instance-management");
const dialogReference = formlessUiManagementInstallDialogReference(
  managementReference.managementId,
  "instance-management:install-dialog",
);
const appsReference = formlessUiWorkspaceManifestReference("instance-management:apps");
const routesReference = formlessUiWorkspaceManifestReference("instance-management:routes");

describe("Astryx management renderer", () => {
  it("renders accessible loading and display-safe failure snapshots", () => {
    const loadingHtml = renderToStaticMarkup(
      <AstryxManagementRenderer
        manifest={managementManifest("loading")}
        onIntent={() => undefined}
        onWorkspaceIntent={() => undefined}
      />,
    );
    const failedHtml = renderToStaticMarkup(
      <AstryxManagementRenderer
        manifest={managementManifest("failed")}
        onIntent={() => undefined}
        onWorkspaceIntent={() => undefined}
      />,
    );

    expect(loadingHtml).toContain('data-formless-astryx-management-state="loading"');
    expect(loadingHtml).toContain("Instance Settings");
    expect(loadingHtml).toContain("Loading Instance control plane...");
    expect(loadingHtml).toContain('role="status"');
    expect(failedHtml).toContain('data-formless-astryx-management-state="failed"');
    expect(failedHtml).toContain('role="alert"');
    expect(failedHtml).toContain("Instance management unavailable");
    expect(failedHtml).toContain("Could not read &lt;path&gt; with TOKEN=[redacted].");
    expect(failedHtml).not.toContain("/Users/ada/formless");
    expect(failedHtml).not.toContain("owner-secret");
  });

  it("composes nested workspaces, controlled install fields, Push, and authorization", () => {
    const manifest = readyManifest();
    const dialog = installDialog({
      errors: ["Install id is reserved."],
      feedback: {
        detail: "Choose a different install id.",
        id: "instance-management:install-feedback",
        intent: "danger",
        kind: "managementFeedback",
        title: "Install failed",
      },
    });
    const html = renderToStaticMarkup(
      <AstryxManagementRenderer
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
      <AstryxManagementInstallDialogContent dialog={dialog} onIntent={() => undefined} />,
    );

    expect(html).toContain('data-formless-astryx-management-state="ready"');
    expect(html).toContain('aria-label="Apps"');
    expect(html).toContain('aria-label="Routes"');
    expect(html).toContain(`data-formless-astryx-workspace="${appsReference.workspaceId}"`);
    expect(html).toContain(`data-formless-astryx-workspace="${routesReference.workspaceId}"`);
    expect(html).toContain('aria-label="Workspace Push"');
    expect(html).toContain('aria-label="Push workspace"');
    expect(html).not.toContain("data-operation-status");
    expect(html).toContain('data-operation-progress="instance-management:push:progress"');
    expect(html).toContain("Writing &lt;path&gt; with TOKEN=[redacted].");
    expect(html).toContain("Cloudflare authorization");
    expect(html).toContain(
      'data-formless-astryx-management-control="instance-management:workspace:push:authorization:event-1:open"',
    );
    expect(html).toContain("Open authorization");
    expect(dialogHtml).toContain('data-formless-astryx-management-install-dialog="');
    expect(dialogHtml).toContain('data-formless-astryx-management-package-field="');
    expect(dialogHtml).toContain("App type");
    expect(dialogHtml).toContain("Site package description.");
    expect(dialogHtml).toContain('value="Docs Site"');
    expect(dialogHtml).toContain('value="docs"');
    expect(dialogHtml).toContain("Install id is reserved.");
    expect(dialogHtml).toContain("Install failed");
    expect(dialogHtml).toContain("Choose a different install id.");
    expect(`${html}\n${dialogHtml}`).not.toContain("/Users/ada/formless");
    expect(`${html}\n${dialogHtml}`).not.toContain("owner-secret");
  });

  it("subscribes to management, dialog, and both workspaces through one host", () => {
    const manifest = readyManifest({ workspaceOperation: undefined });
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
        <AstryxSubscribedManagementRenderer managementReference={managementReference} />
      </FormlessUiContractHostProvider>,
    );

    expect(html).toContain('data-formless-astryx-management-state="ready"');
    expect(html).toContain(`data-formless-astryx-workspace="${appsReference.workspaceId}"`);
    expect(html).toContain(`data-formless-astryx-workspace="${routesReference.workspaceId}"`);
    expect(html).toContain("Apps workspace action");
    expect(html).toContain("Routes workspace action");
    expect(html).not.toContain("data-formless-legacy-workspace");
  });

  it("dispatches exact canonical management intent envelopes", async () => {
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

    await dispatchAstryxManagementInstallFieldIntent(
      onIntent,
      dialog,
      dialog.fields.label,
      fieldIntent,
    );
    await dispatchAstryxManagementWorkspaceOperationIntent(
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
    expect(dialog.closeIntent).toMatchObject({
      dialogId: dialog.id,
      managementId: manifest.id,
      type: "managementInstallDialogOpenChange",
    });
    expect(dialog.packageOptions[1]?.selectionIntent).toMatchObject({
      dialogId: dialog.id,
      managementId: manifest.id,
      type: "managementInstallPackageSelection",
    });
    expect(dialog.submitIntent).toMatchObject({
      dialogId: dialog.id,
      managementId: manifest.id,
      type: "managementInstallSubmit",
    });
    expect(operation.authorizationPrompt?.intent).toMatchObject({
      managementId: manifest.id,
      operationId: operation.id,
      type: "managementAuthorizationOpen",
    });
  });

  it("keeps the renderer package-local, runtime-free, and inactive in production", async () => {
    const rendererSource = await readFile(
      new URL("./formless-ui-management-renderer.tsx", import.meta.url),
      "utf8",
    );
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { exports?: Record<string, unknown> };
    const productionRuntimeSource = await readFile(
      new URL("../../../../src/app/routes/instance-management-runtime.tsx", import.meta.url),
      "utf8",
    );
    const imports = importSpecifiers(rendererSource);

    expect(imports).not.toContain("@dpeek/formless-ui");
    expect(
      imports.filter((specifier) =>
        /(?:^|\/)(?:src\/app|src\/client|control-plane|gateway|storage|replica|routing|operation-controller)(?:\/|$)|\bwouter\b/.test(
          specifier,
        ),
      ),
    ).toEqual([]);
    expect(rendererSource).not.toMatch(
      /\bclassName\b|\blocalStorage\b|\bsessionStorage\b|\bdocument\.|\bwindow\.|\bfetch\(/,
    );
    expect(Object.keys(packageJson.exports ?? {})).toEqual([
      "./contract",
      "./contract-host",
      "./contract-host/react",
    ]);
    expect(productionRuntimeSource).toContain("LegacySubscribedManagementRenderer");
    expect(productionRuntimeSource).not.toContain("AstryxSubscribedManagementRenderer");
    expect(productionRuntimeSource).not.toContain("global.css");
  });
});

function managementManifest(state: "failed" | "loading"): FormlessUiManagementManifestContract {
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

function installDialog(
  overrides: Partial<FormlessUiManagementInstallDialogContract> = {},
): FormlessUiManagementInstallDialogContract {
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
    open: true,
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
    ...overrides,
  };
}

function workspaceOperation(): FormlessUiManagementWorkspaceOperationContract {
  const controlId = "instance-management:workspace:push:control";
  const operationId = "instance-management:workspace:push";
  const promptId = "instance-management:workspace:push:authorization:event-1";

  return {
    authorizationPrompt: {
      action: button(`${promptId}:open`, "Open authorization", "secondary"),
      detail: "Local Cloudflare requires external authorization.",
      id: promptId,
      intent: {
        controlId: `${promptId}:open`,
        managementId: managementReference.managementId,
        operationId,
        promptId,
        type: "managementAuthorizationOpen",
      },
      kind: "managementAuthorizationPrompt",
      title: "Cloudflare authorization",
    },
    control: {
      feedback: {
        activeProgress: { label: "Push source", stepId: "push" },
        detail: "Writing <path> with TOKEN=[redacted].",
        id: `${controlId}:feedback`,
        intent: "info",
        kind: "operationFeedbackEvent",
        status: "pending",
        title: "Pushing workspace",
      },
      id: controlId,
      kind: "operationControl",
      progress: {
        id: "instance-management:push:progress",
        kind: "operationProgress",
        steps: [
          { id: "plan", label: "Plan", status: "succeeded" },
          {
            detail: "Writing <path> with TOKEN=[redacted].",
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
    id: operationId,
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

function importSpecifiers(source: string) {
  return Array.from(source.matchAll(/\bfrom\s+["']([^"']+)["']/g), (match) => match[1]!);
}
