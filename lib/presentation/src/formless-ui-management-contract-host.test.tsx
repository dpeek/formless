import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  FormlessUiButtonContract,
  FormlessUiContractIntent,
  FormlessUiCreateField,
  FormlessUiManagementInstallDialogContract,
  FormlessUiManagementIntent,
  FormlessUiManagementManifestContract,
  FormlessUiManagementReadyContract,
} from "./formless-ui-contract.ts";
import {
  createFormlessUiMemoryContractHost,
  formlessUiManagementInstallDialogReference,
  formlessUiManagementManifestReference,
  formlessUiShellManifestReference,
  formlessUiWorkspaceManifestReference,
  type FormlessUiContractHostNodeSet,
  type FormlessUiManagementInstallDialogNode,
  type FormlessUiManagementManifestNode,
  type FormlessUiShellManifestNode,
  type FormlessUiWorkspaceManifestNode,
} from "./formless-ui-contract-host.ts";
import {
  FormlessUiContractHostProvider,
  useFormlessUiManagementInstallDialog,
  useFormlessUiManagementManifest,
} from "./formless-ui-contract-host-react.tsx";

const managementReference = formlessUiManagementManifestReference("management:instance");
const installDialogReference = formlessUiManagementInstallDialogReference(
  managementReference.managementId,
  "dialog:install-app",
);
const appsWorkspaceReference = formlessUiWorkspaceManifestReference("workspace:apps");
const routesWorkspaceReference = formlessUiWorkspaceManifestReference("workspace:routes");
const shellReference = formlessUiShellManifestReference("shell:instance");

describe("Formless UI management memory contract host", () => {
  it("reads loading, failed, and ready management snapshots as one typed manifest", () => {
    const host = createFormlessUiMemoryContractHost({ nodes: [loadingManagementNode()] });
    const loading: FormlessUiManagementManifestContract | undefined = host.read({
      ...managementReference,
    });

    expect(loading).toMatchObject({
      message: "Loading installed apps...",
      state: "loading",
    });

    host.publish([failedManagementNode()]);

    expect(host.read(managementReference)).toMatchObject({
      feedback: { intent: "danger" },
      state: "failed",
    });

    host.publish(readyManagementNodes());

    expect(host.read(managementReference)).toMatchObject({
      state: "ready",
      workspaces: [{ role: "apps" }, { role: "routes" }],
    });
  });

  it("provides typed management and install-dialog reads beside shell and workspace nodes", () => {
    const host = createFormlessUiMemoryContractHost({
      nodes: [...readyManagementNodes(), shellNode()],
    });
    const management: FormlessUiManagementManifestContract | undefined = host.read({
      ...managementReference,
    });
    const dialog: FormlessUiManagementInstallDialogContract | undefined = host.read({
      ...installDialogReference,
    });

    expect(management).toMatchObject({
      id: managementReference.managementId,
      state: "ready",
      title: "Instance Settings",
    });
    expect(dialog?.fields.installId.fieldName).toBe("installId");
    expect(dialog?.packageOptions.map(({ packageAppKey }) => packageAppKey)).toEqual([
      "site",
      "tasks",
    ]);
    expect(host.read(appsWorkspaceReference)?.label).toBe("Apps");
    expect(host.read(routesWorkspaceReference)?.label).toBe("Routes");
    expect(host.read(shellReference)?.title).toBe("Formless");
  });

  it("validates management identities, child references, workspace order, and embedded intents", () => {
    expect(() =>
      createFormlessUiMemoryContractHost({
        nodes: readyManagementNodes().filter(
          ({ reference }) => reference.kind !== "managementInstallDialogReference",
        ),
      }),
    ).toThrow("has no snapshot");

    expect(() =>
      createFormlessUiMemoryContractHost({
        nodes: readyManagementNodes().filter(
          ({ reference }) =>
            reference.kind !== "workspaceManifestReference" ||
            reference.workspaceId !== routesWorkspaceReference.workspaceId,
        ),
      }),
    ).toThrow("has no snapshot");

    const manifestNode = readyManagementManifestNode();
    expect(() =>
      createFormlessUiMemoryContractHost({
        nodes: [
          {
            ...manifestNode,
            snapshot: {
              ...manifestNode.snapshot,
              workspaces: [
                manifestNode.snapshot.workspaces[1],
                manifestNode.snapshot.workspaces[0],
              ],
            },
          } as unknown as FormlessUiManagementManifestNode,
          installDialogNode(),
          workspaceNode(appsWorkspaceReference, "Apps"),
          workspaceNode(routesWorkspaceReference, "Routes"),
        ],
      }),
    ).toThrow("invalid workspace order");

    const dialogNode = installDialogNode();
    expect(() =>
      createFormlessUiMemoryContractHost({
        nodes: [
          {
            ...dialogNode,
            snapshot: {
              ...dialogNode.snapshot,
              packageOptions: dialogNode.snapshot.packageOptions.map((option) => ({
                ...option,
                selectionIntent: {
                  ...option.selectionIntent,
                  managementId: "management:other",
                },
              })),
            },
          },
        ],
      }),
    ).toThrow("invalid package-selection intent");
  });

  it("publishes complete management graphs atomically with identity reuse and scoped removal", () => {
    const host = createFormlessUiMemoryContractHost({
      nodes: [...readyManagementNodes(), shellNode()],
    });
    const initialManagement = host.read(managementReference);
    const initialDialog = host.read(installDialogReference);
    const initialAppsWorkspace = host.read(appsWorkspaceReference);
    const initialShell = host.read(shellReference);
    const calls: string[] = [];
    let removedDialogVisibleFromManagementNotification = true;

    host.subscribe(managementReference, () => {
      calls.push("management");
      removedDialogVisibleFromManagementNotification =
        host.read(installDialogReference) !== undefined;
    });
    host.subscribe(installDialogReference, () => calls.push("install-dialog"));
    host.subscribe(appsWorkspaceReference, () => calls.push("apps-workspace"));
    host.subscribe(shellReference, () => calls.push("shell"));

    host.publish([...readyManagementNodes(), shellNode()]);

    expect(calls).toEqual([]);
    expect(host.read(managementReference)).toBe(initialManagement);
    expect(host.read(installDialogReference)).toBe(initialDialog);
    expect(host.read(appsWorkspaceReference)).toBe(initialAppsWorkspace);
    expect(host.read(shellReference)).toBe(initialShell);

    host.publish([...readyManagementNodes({ dialogOpen: true }), shellNode()]);

    expect(calls).toEqual(["install-dialog"]);
    expect(host.read(managementReference)).toBe(initialManagement);
    expect(host.read(appsWorkspaceReference)).toBe(initialAppsWorkspace);
    expect(host.read(shellReference)).toBe(initialShell);

    host.publish([failedManagementNode(), shellNode()]);

    expect(calls).toEqual(["install-dialog", "management", "install-dialog", "apps-workspace"]);
    expect(removedDialogVisibleFromManagementNotification).toBe(false);
    expect(host.read(managementReference)?.state).toBe("failed");
    expect(host.read(installDialogReference)).toBeUndefined();
    expect(host.read(appsWorkspaceReference)).toBeUndefined();
    expect(host.read(routesWorkspaceReference)).toBeUndefined();
    expect(host.read(shellReference)).toBe(initialShell);
  });

  it("keeps management server snapshots stable for server rendering and hydration", () => {
    const serverNodes = readyManagementNodes();
    const host = createFormlessUiMemoryContractHost({
      nodes: readyManagementNodes({ dialogOpen: true }),
      serverNodes,
    });
    const serverManagement = host.getServerSnapshot(managementReference);
    const serverDialog = host.getServerSnapshot(installDialogReference);

    expect(host.read(managementReference)).toBe(serverManagement);
    expect(host.read(installDialogReference)?.open).toBe(true);
    expect(serverDialog?.open).toBe(false);
    expect(
      renderToStaticMarkup(
        <FormlessUiContractHostProvider host={host}>
          <ManagementServerState />
        </FormlessUiContractHostProvider>,
      ),
    ).toContain("ready:closed");
  });

  it("dispatches each canonical management intent without reshaping it", async () => {
    const calls: FormlessUiContractIntent[] = [];
    const host = createFormlessUiMemoryContractHost({
      dispatch: (intent) => {
        calls.push(intent);
      },
      nodes: readyManagementNodes(),
    });
    const dialog = installDialogNode().snapshot;
    const operation = readyManagementManifestNode().snapshot.workspaceOperation;
    if (!operation?.authorizationPrompt) {
      throw new Error("Expected management operation authorization prompt.");
    }
    const intents: readonly FormlessUiManagementIntent[] = [
      { ...dialog.closeIntent, open: true },
      dialog.packageOptions[1]!.selectionIntent,
      {
        dialogId: dialog.id,
        fieldId: dialog.fields.label.fieldId,
        intent: {
          fieldName: dialog.fields.label.fieldName,
          fieldValue: { kind: "input", value: "Personal site" },
          type: "createDraftChange",
        },
        managementId: dialog.managementId,
        type: "managementInstallField",
      },
      dialog.submitIntent,
      {
        controlId: operation.control.id,
        intent: operation.control.trigger.intent,
        managementId: managementReference.managementId,
        operationId: operation.id,
        type: "managementWorkspaceOperation",
      },
      operation.authorizationPrompt.intent,
    ];

    for (const intent of intents) {
      await host.dispatch(intent);
    }

    expect(calls).toEqual(intents);
    calls.forEach((intent, index) => expect(intent).toBe(intents[index]));
  });
});

function ManagementServerState() {
  const management = useFormlessUiManagementManifest(managementReference);
  const dialog = useFormlessUiManagementInstallDialog(installDialogReference);

  return <span>{`${management?.state}:${dialog?.open ? "open" : "closed"}`}</span>;
}

function readyManagementNodes({ dialogOpen = false }: { dialogOpen?: boolean } = {}) {
  return [
    readyManagementManifestNode(),
    installDialogNode({ open: dialogOpen }),
    workspaceNode(appsWorkspaceReference, "Apps"),
    workspaceNode(routesWorkspaceReference, "Routes"),
  ] satisfies FormlessUiContractHostNodeSet;
}

function readyManagementManifestNode(): FormlessUiManagementManifestNode & {
  snapshot: FormlessUiManagementReadyContract;
} {
  const operationId = "operation:push";
  const operationControlId = "control:push";
  const promptId = "prompt:cloudflare-authorization";
  const authorizationControl = button("control:open-authorization", "Open authorization");

  return {
    reference: managementReference,
    snapshot: {
      accessibilityLabel: "Instance management",
      id: managementReference.managementId,
      installDialog: installDialogReference,
      kind: "managementManifest",
      state: "ready",
      title: "Instance Settings",
      workspaceOperation: {
        authorizationPrompt: {
          action: authorizationControl,
          detail: "Authorize Local Cloudflare to continue.",
          id: promptId,
          intent: {
            controlId: authorizationControl.id,
            managementId: managementReference.managementId,
            operationId,
            promptId,
            type: "managementAuthorizationOpen",
          },
          kind: "managementAuthorizationPrompt",
          title: "Cloudflare authorization",
        },
        control: {
          id: operationControlId,
          kind: "operationControl",
          status: {
            accessibilityLabel: "Push pending",
            detail: "Waiting for authorization.",
            id: "status:push",
            intent: "info",
            kind: "compactStatus",
            label: "Push pending",
            status: "pending",
          },
          trigger: {
            ...button(operationControlId, "Push", "primary"),
            intent: {
              controlId: operationControlId,
              invocationSource: "button",
              type: "operationInvoke",
            },
            prominence: "primary",
          },
        },
        id: operationId,
        kind: "managementWorkspaceOperation",
      },
      workspaces: [
        { reference: appsWorkspaceReference, role: "apps" },
        { reference: routesWorkspaceReference, role: "routes" },
      ],
    },
  };
}

function loadingManagementNode(): FormlessUiManagementManifestNode {
  return {
    reference: managementReference,
    snapshot: {
      accessibilityLabel: "Instance management",
      id: managementReference.managementId,
      kind: "managementManifest",
      message: "Loading installed apps...",
      state: "loading",
      title: "Instance Settings",
    },
  };
}

function failedManagementNode(): FormlessUiManagementManifestNode {
  return {
    reference: managementReference,
    snapshot: {
      accessibilityLabel: "Instance management",
      feedback: {
        detail: "Installed apps could not be loaded.",
        id: "feedback:management-load",
        intent: "danger",
        kind: "managementFeedback",
        title: "Instance management unavailable",
      },
      id: managementReference.managementId,
      kind: "managementManifest",
      state: "failed",
      title: "Instance Settings",
    },
  };
}

function installDialogNode({
  open = false,
}: { open?: boolean } = {}): FormlessUiManagementInstallDialogNode {
  const packageField = createField("packageAppKey", "App type", "site");
  const submit = button("control:install-submit", "Install Site", "primary", "submit");
  const option = (id: string, label: string, selected: boolean) => ({
    description: `${label} app package.`,
    id,
    kind: "managementPackageOption" as const,
    label,
    packageAppKey: id.replace("package:", ""),
    selected,
    selectionIntent: {
      dialogId: installDialogReference.dialogId,
      fieldId: packageField.fieldId,
      managementId: managementReference.managementId,
      optionId: id,
      type: "managementInstallPackageSelection" as const,
    },
  });

  return {
    reference: installDialogReference,
    snapshot: {
      cancel: button("control:install-cancel", "Cancel"),
      closeIntent: {
        dialogId: installDialogReference.dialogId,
        managementId: managementReference.managementId,
        open: false,
        type: "managementInstallDialogOpenChange",
      },
      description: "Choose an app type, then set its instance label and install id.",
      errors: [],
      fields: {
        installId: createField("installId", "Install id", "site"),
        label: createField("label", "Label", "Site"),
        package: packageField,
      },
      id: installDialogReference.dialogId,
      kind: "managementInstallDialog",
      managementId: managementReference.managementId,
      open,
      packageOptions: [
        option("package:site", "Site", true),
        option("package:tasks", "Tasks", false),
      ],
      selectedPackageOptionId: "package:site",
      submit,
      submitIntent: {
        controlId: submit.id,
        dialogId: installDialogReference.dialogId,
        managementId: managementReference.managementId,
        type: "managementInstallSubmit",
      },
      title: "Install app",
    },
  };
}

function createField(fieldName: string, label: string, value: string): FormlessUiCreateField {
  const field = {
    label,
    required: true,
    type: "text" as const,
  } satisfies FormlessUiCreateField["field"];
  const control = {
    control: { inputType: "text" as const, kind: "input" as const },
    controlKind: "text" as const,
    createDefaultChecked: false,
    createDefaultValue: undefined,
    editor: "text" as const,
    field,
    inputAttributes: {},
    kind: "text" as const,
    label,
    required: true,
  } satisfies Extract<FormlessUiCreateField["control"], { kind: "text" }>;

  return {
    access: { canPatch: true, kind: "editable", writable: true },
    commit: "submit",
    control,
    density: "default",
    draftInput: { kind: "input", value },
    editor: "text",
    field,
    fieldId: `field:install:${fieldName}`,
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
  prominence: FormlessUiButtonContract["prominence"] = "secondary",
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

function workspaceNode(
  reference: typeof appsWorkspaceReference,
  label: string,
): FormlessUiWorkspaceManifestNode {
  return {
    reference,
    snapshot: {
      accessibilityLabel: `${label} workspace`,
      actions: [],
      id: reference.workspaceId,
      kind: "workspaceManifest",
      label,
      sections: [],
    },
  };
}

function shellNode(): FormlessUiShellManifestNode {
  return {
    reference: shellReference,
    snapshot: {
      accessibilityLabel: "Formless application shell",
      activeDestination: null,
      id: shellReference.shellId,
      kind: "shellManifest",
      navigationSections: [],
      scope: "multiApp",
      title: "Formless",
    },
  };
}
