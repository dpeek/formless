import type { FieldSchema } from "@dpeek/formless-schema";
import type {
  FormlessUiButtonContract,
  FormlessUiCreateField,
  FormlessUiManagementInstallDialogContract,
  FormlessUiManagementManifestContract,
  FormlessUiManagementReadyContract,
  FormlessUiManagementWorkspaceOperationContract,
  FormlessUiOperationControlContract,
  FormlessUiTableColumnContract,
  FormlessUiTableContract,
  FormlessUiWorkspaceCollectionContract,
  FormlessUiWorkspaceContract,
  FormlessUiWorkspaceIntentScope,
  FormlessUiWorkspaceSectionContract,
} from "../formless-ui-contract.ts";
import {
  formlessUiManagementInstallDialogReference,
  formlessUiManagementManifestReference,
  formlessUiWorkspaceManifestReference,
} from "../formless-ui-contract-host.ts";
import { createField, fieldError, textControl } from "./fields/fixture-helpers.ts";

export type FormlessInstanceManagementFixtureId =
  | "empty"
  | "failed"
  | "gateway-unavailable"
  | "install-dialog-failed"
  | "install-dialog-idle"
  | "install-dialog-pending"
  | "install-dialog-validation"
  | "installed"
  | "loading"
  | "push-authorization-required"
  | "push-failed"
  | "push-idle"
  | "push-pending"
  | "push-success";

export type FormlessInstanceManagementFixtureState = {
  dialog: FormlessUiManagementInstallDialogContract | null;
  manifest: FormlessUiManagementManifestContract;
  workspaces: readonly FormlessUiWorkspaceContract[];
};

export type FormlessInstanceManagementFixture = {
  id: FormlessInstanceManagementFixtureId;
  label: string;
  state: FormlessInstanceManagementFixtureState;
};

export const instanceManagementReference =
  formlessUiManagementManifestReference("instance-management");
export const instanceManagementInstallDialogReference = formlessUiManagementInstallDialogReference(
  instanceManagementReference.managementId,
  "instance-management:install-dialog",
);
export const instanceManagementAppsReference = formlessUiWorkspaceManifestReference(
  "instance-management:apps",
);
export const instanceManagementRoutesReference = formlessUiWorkspaceManifestReference(
  "instance-management:routes",
);

const installFieldSchema = (label: string) =>
  ({ label, required: true, type: "text" }) satisfies Extract<FieldSchema, { type: "text" }>;

export function createFormlessInstanceManagementFixtures(): FormlessInstanceManagementFixture[] {
  return [
    fixture("loading", "Loading", {
      dialog: null,
      manifest: loadingManifest(),
      workspaces: [],
    }),
    fixture("failed", "Failed", {
      dialog: null,
      manifest: failedManifest(),
      workspaces: [],
    }),
    readyFixture("empty", "Empty", { installed: false }),
    readyFixture("installed", "Installed", {}),
    readyFixture("install-dialog-idle", "Install", {
      dialog: installDialog({ open: true }),
    }),
    readyFixture("install-dialog-validation", "Install validation", {
      dialog: installDialog({
        errors: ["Install id is required."],
        fields: installFields({ installId: "", installIdError: "Install id is required." }),
        open: true,
        submit: button("instance-management:install-submit", "Install Site", {
          disabledReason: "Resolve the validation errors.",
          disabled: true,
          prominence: "primary",
          type: "submit",
        }),
      }),
    }),
    readyFixture("install-dialog-pending", "Installing", {
      dialog: installDialog({
        feedback: managementFeedback(
          "install-pending",
          "Installing app",
          "The app install is being prepared.",
          "info",
        ),
        open: true,
        pending: { isPending: true, label: "Installing app" },
        submit: button("instance-management:install-submit", "Install Site", {
          disabled: true,
          pending: { isPending: true, label: "Installing app" },
          prominence: "primary",
          type: "submit",
        }),
      }),
    }),
    readyFixture("install-dialog-failed", "Install failed", {
      dialog: installDialog({
        feedback: managementFeedback(
          "install-failed",
          "Install failed",
          "The selected install id is already in use.",
          "danger",
        ),
        open: true,
      }),
    }),
    readyFixture("gateway-unavailable", "Gateway unavailable", {
      manifestOverrides: {
        workspaceFeedback: managementFeedback(
          "gateway-unavailable",
          "Workspace Push unavailable",
          "Connect the local workspace gateway to push source changes.",
          "warning",
        ),
        workspaceOperation: undefined,
      },
    }),
    readyFixture("push-idle", "Push idle", { pushState: "idle" }),
    readyFixture("push-pending", "Push pending", { pushState: "pending" }),
    readyFixture("push-success", "Push success", { pushState: "success" }),
    readyFixture("push-failed", "Push failed", { pushState: "failed" }),
    readyFixture("push-authorization-required", "Push authorization", {
      pushState: "authorization-required",
    }),
  ];
}

function fixture(
  id: FormlessInstanceManagementFixtureId,
  label: string,
  state: FormlessInstanceManagementFixtureState,
): FormlessInstanceManagementFixture {
  return { id, label, state };
}

function readyFixture(
  id: FormlessInstanceManagementFixtureId,
  label: string,
  options: {
    dialog?: FormlessUiManagementInstallDialogContract;
    installed?: boolean;
    manifestOverrides?: Partial<FormlessUiManagementReadyContract>;
    pushState?: PushFixtureState;
  },
) {
  const installed = options.installed ?? true;
  const dialog = options.dialog ?? installDialog();
  const manifest = readyManifest(
    options.pushState === undefined
      ? options.manifestOverrides
      : {
          workspaceOperation: pushOperation(options.pushState),
          ...options.manifestOverrides,
        },
  );

  return fixture(id, label, {
    dialog,
    manifest,
    workspaces: [appsWorkspace(installed), routesWorkspace(installed)],
  });
}

function manifestBase() {
  return {
    accessibilityLabel: "Instance settings overview",
    id: instanceManagementReference.managementId,
    kind: "managementManifest" as const,
    title: "Instance Settings",
  };
}

function loadingManifest(): FormlessUiManagementManifestContract {
  return {
    ...manifestBase(),
    message: "Loading instance settings...",
    state: "loading",
  };
}

function failedManifest(): FormlessUiManagementManifestContract {
  return {
    ...manifestBase(),
    feedback: managementFeedback(
      "load-failed",
      "Instance management unavailable",
      "Instance settings could not be loaded.",
      "danger",
    ),
    state: "failed",
  };
}

function readyManifest(
  overrides: Partial<FormlessUiManagementReadyContract> = {},
): FormlessUiManagementReadyContract {
  return {
    ...manifestBase(),
    installDialog: instanceManagementInstallDialogReference,
    state: "ready",
    workspaceOperation: pushOperation("idle"),
    workspaces: [
      { reference: instanceManagementAppsReference, role: "apps" },
      { reference: instanceManagementRoutesReference, role: "routes" },
    ],
    ...overrides,
  };
}

function installDialog(
  overrides: Partial<FormlessUiManagementInstallDialogContract> = {},
): FormlessUiManagementInstallDialogContract {
  const fields = overrides.fields ?? installFields();
  const packageOptions = packageOptionsFor(fields.package);
  const submit =
    overrides.submit ??
    button("instance-management:install-submit", "Install Site", {
      prominence: "primary",
      type: "submit",
    });

  return {
    cancel: button("instance-management:install-cancel", "Cancel"),
    closeIntent: {
      dialogId: instanceManagementInstallDialogReference.dialogId,
      managementId: instanceManagementReference.managementId,
      open: false,
      type: "managementInstallDialogOpenChange",
    },
    description: "Choose an app type, then set its instance label and install id.",
    errors: [],
    fields,
    id: instanceManagementInstallDialogReference.dialogId,
    kind: "managementInstallDialog",
    managementId: instanceManagementReference.managementId,
    open: false,
    packageOptions,
    selectedPackageOptionId: packageOptions[0]!.id,
    submit,
    submitIntent: {
      controlId: submit.id,
      dialogId: instanceManagementInstallDialogReference.dialogId,
      managementId: instanceManagementReference.managementId,
      type: "managementInstallSubmit",
    },
    title: "Install app",
    ...overrides,
  };
}

function installFields(options: { installId?: string; installIdError?: string } = {}) {
  return {
    installId: installField(
      "installId",
      options.installId ?? "docs",
      "Install id",
      options.installIdError,
    ),
    label: installField("label", "Docs Site", "Label"),
    package: installField("packageAppKey", "site", "App type"),
  } satisfies FormlessUiManagementInstallDialogContract["fields"];
}

function installField(
  fieldName: string,
  value: string,
  label: string,
  error?: string,
): FormlessUiCreateField {
  const field = installFieldSchema(label);
  const control = textControl(field);

  return createField({
    control,
    draftInput: { kind: "input", value },
    editor: control.editor,
    ...(error === undefined ? {} : { errors: [fieldError(fieldName, error, value)] }),
    field,
    fieldName,
    labelVisibility: "visible",
    occurrence: {
      ownerId: instanceManagementInstallDialogReference.dialogId,
      placementId: fieldName,
    },
    recordId: instanceManagementInstallDialogReference.dialogId,
    value,
  });
}

function packageOptionsFor(packageField: FormlessUiCreateField) {
  return [
    packageOption(packageField, "site", "Site", "Install the Site package.", true),
    packageOption(packageField, "tasks", "Tasks", "Install the Tasks package.", false),
    packageOption(packageField, "crm", "CRM", "Install the CRM package.", false),
  ];
}

function packageOption(
  packageField: FormlessUiCreateField,
  packageAppKey: string,
  label: string,
  description: string,
  selected: boolean,
) {
  const id = `instance-management:package:${packageAppKey}`;

  return {
    description,
    id,
    kind: "managementPackageOption" as const,
    label,
    packageAppKey,
    selected,
    selectionIntent: {
      dialogId: instanceManagementInstallDialogReference.dialogId,
      fieldId: packageField.fieldId,
      managementId: instanceManagementReference.managementId,
      optionId: id,
      type: "managementInstallPackageSelection" as const,
    },
  };
}

type PushFixtureState = "authorization-required" | "failed" | "idle" | "pending" | "success";

function pushOperation(state: PushFixtureState): FormlessUiManagementWorkspaceOperationContract {
  const controlId = "instance-management:workspace:push:control";
  const operationId = "instance-management:workspace:push";
  const promptId = `${operationId}:authorization`;

  return {
    ...(state === "authorization-required"
      ? {
          authorizationPrompt: {
            action: button(`${promptId}:open`, "Open authorization"),
            detail: "Authorize the local workspace gateway, then retry Push.",
            id: promptId,
            intent: {
              controlId: `${promptId}:open`,
              managementId: instanceManagementReference.managementId,
              operationId,
              promptId,
              type: "managementAuthorizationOpen" as const,
            },
            kind: "managementAuthorizationPrompt" as const,
            title: "Cloudflare authorization required",
          },
        }
      : {}),
    control: pushControl(controlId, state),
    id: operationId,
    kind: "managementWorkspaceOperation",
  };
}

function pushControl(
  controlId: string,
  state: PushFixtureState,
): FormlessUiOperationControlContract {
  const pending = state === "pending";
  const status =
    state === "success"
      ? operationStatus(
          controlId,
          "Workspace pushed",
          "Source is up to date.",
          "success",
          "committed",
        )
      : state === "failed"
        ? operationStatus(
            controlId,
            "Push failed",
            "The workspace gateway rejected Push.",
            "danger",
            "failed",
          )
        : state === "authorization-required"
          ? operationStatus(
              controlId,
              "Authorization required",
              "Authorize the workspace gateway.",
              "warning",
              "idle",
            )
          : pending
            ? operationStatus(
                controlId,
                "Pushing workspace",
                "Uploading source files.",
                "info",
                "pending",
              )
            : operationStatus(
                controlId,
                "Push ready",
                "Workspace source can be pushed.",
                "neutral",
                "idle",
              );
  const progress = pending
    ? {
        detail: "Uploading display-safe workspace source.",
        id: `${controlId}:progress`,
        kind: "operationProgress" as const,
        steps: [
          { id: `${controlId}:plan`, label: "Plan", status: "succeeded" as const },
          { id: `${controlId}:upload`, label: "Upload source", status: "running" as const },
        ],
        title: "Pushing workspace",
        updatedAt: 1,
      }
    : undefined;
  const feedback =
    state === "success"
      ? operationFeedback(
          controlId,
          "Workspace pushed",
          "Source is up to date.",
          "success",
          "committed",
        )
      : state === "failed"
        ? operationFeedback(
            controlId,
            "Push failed",
            "The workspace gateway rejected Push.",
            "danger",
            "failed",
          )
        : pending
          ? {
              ...operationFeedback(
                controlId,
                "Pushing workspace",
                "Uploading source files.",
                "info",
                "pending",
              ),
              activeProgress: { label: "Upload source", stepId: `${controlId}:upload` },
              progress,
            }
          : undefined;

  return {
    ...(feedback === undefined ? {} : { feedback }),
    id: controlId,
    kind: "operationControl",
    ...(progress === undefined ? {} : { progress }),
    status,
    trigger: operationButton(controlId, "Push workspace", {
      ...(pending
        ? {
            disabled: true,
            disabledReason: "Pushing workspace",
            pending: { isPending: true, label: "Pushing workspace" },
          }
        : {}),
      density: "compact",
      prominence: "primary",
    }),
  };
}

function operationStatus(
  controlId: string,
  label: string,
  detail: string,
  intent: "danger" | "info" | "neutral" | "success" | "warning",
  status: "committed" | "failed" | "idle" | "pending",
) {
  return {
    accessibilityLabel: `${label}. ${detail}`,
    detail,
    id: `${controlId}:status`,
    intent,
    kind: "compactStatus" as const,
    ...(status === "pending" ? { pending: { isPending: true, label } } : {}),
    label,
    status,
  };
}

function operationFeedback(
  controlId: string,
  title: string,
  detail: string,
  intent: "danger" | "info" | "success",
  status: "committed" | "failed" | "pending",
) {
  return {
    detail,
    id: `${controlId}:feedback`,
    intent,
    kind: "operationFeedbackEvent" as const,
    status,
    title,
  };
}

function managementFeedback(
  localId: string,
  title: string,
  detail: string,
  intent: "danger" | "info" | "success" | "warning",
) {
  return {
    detail,
    id: `instance-management:feedback:${localId}`,
    intent,
    kind: "managementFeedback" as const,
    title,
  };
}

function appsWorkspace(installed: boolean) {
  return managementWorkspace(instanceManagementAppsReference.workspaceId, "Apps", "apps", {
    columns: [
      ["label", "App", "field"],
      ["install-id", "Install id", "computed"],
    ],
    emptyDescription: "Install an app to add it to this instance.",
    emptyTitle: "No apps installed",
    rows: installed
      ? [
          ["site", "Site", "site"],
          ["tasks", "Tasks", "tasks"],
        ]
      : [],
  });
}

function routesWorkspace(installed: boolean) {
  return managementWorkspace(instanceManagementRoutesReference.workspaceId, "Routes", "routes", {
    columns: [
      ["app", "App", "reference"],
      ["path", "Path", "computed"],
    ],
    emptyDescription: "Installed apps publish their routes here.",
    emptyTitle: "No routes configured",
    rows: installed
      ? [
          ["site-home", "Site", "/"],
          ["tasks-home", "Tasks", "/apps/tasks"],
        ]
      : [],
  });
}

function managementWorkspace(
  workspaceId: string,
  label: string,
  localId: string,
  input: {
    columns: readonly (readonly [
      id: string,
      label: string,
      role: "computed" | "field" | "reference",
    ])[];
    emptyDescription: string;
    emptyTitle: string;
    rows: readonly (readonly [id: string, first: string, second: string])[];
  },
): FormlessUiWorkspaceContract {
  const scope = workspaceScope(workspaceId, localId);
  const table = managementTable(scope, label, input);
  const queryNavigation = managementQueryNavigation(scope, input.rows.length);
  const collection: FormlessUiWorkspaceCollectionContract = {
    accessibilityLabel: label,
    availability:
      input.rows.length === 0
        ? {
            emptyState: {
              description: input.emptyDescription,
              id: `${scope.collectionId}:empty`,
              kind: "workspaceEmptyState",
              title: input.emptyTitle,
            },
            state: "empty",
          }
        : { state: "ready" },
    id: scope.collectionId,
    kind: "workspaceCollection",
    label,
    presentation: {
      actions: emptyCollectionActions(scope),
      kind: "ordinary",
      queryNavigation,
      result: table,
      summaries: [],
    },
    selectedQueryId: queryNavigation.items[0]!.id,
  };
  const section: FormlessUiWorkspaceSectionContract = {
    accessibilityLabel: `${label} section`,
    actions: [],
    collection,
    headingVisibility: "hidden",
    id: scope.sectionId,
    kind: "workspaceSection",
    label,
  };

  return {
    accessibilityLabel: `${label} workspace`,
    actions: [],
    id: workspaceId,
    kind: "workspace",
    label,
    sections: [section],
  };
}

function managementTable(
  scope: FormlessUiWorkspaceIntentScope,
  label: string,
  input: {
    columns: readonly (readonly [
      id: string,
      label: string,
      role: "computed" | "field" | "reference",
    ])[];
    emptyDescription: string;
    emptyTitle: string;
    rows: readonly (readonly [id: string, first: string, second: string])[];
  },
): FormlessUiTableContract {
  const resultId = `${scope.collectionId}:result`;
  const columns = input.columns.map(([id, columnLabel, contentRole], index) => ({
    accessibilityLabel: columnLabel,
    alignment: "start" as const,
    contentRole,
    id,
    isRowHeader: index === 0,
    kind: "tableColumn" as const,
    label: columnLabel,
    labelVisibility: "visible" as const,
    width: index === 0 ? ("auto" as const) : ("md" as const),
  })) satisfies readonly FormlessUiTableColumnContract[];

  return {
    accessibilityLabel: label,
    columns,
    density: "default",
    editing: { disabledReason: "Fixture records are read-only.", enabled: false },
    ...(input.rows.length === 0
      ? {
          emptyState: {
            description: input.emptyDescription,
            id: `${resultId}:empty`,
            kind: "tableEmptyState" as const,
            title: input.emptyTitle,
          },
        }
      : {}),
    id: resultId,
    kind: "table",
    rows: input.rows.map(([id, first, second]) => ({
      accessibilityLabel: `${first} ${label.toLowerCase()} record`,
      cells: [tableCell(id, columns[0]!, first), tableCell(id, columns[1]!, second)],
      id: `${resultId}:row:${id}`,
      kind: "tableRow" as const,
      warnings: [],
    })),
  };
}

function tableCell(rowId: string, column: FormlessUiTableColumnContract, displayValue: string) {
  return {
    columnId: column.id,
    contents: [
      {
        accessibilityLabel: `${column.label}: ${displayValue}`,
        displayValue,
        kind: "displayValue" as const,
        status: { kind: "ready" as const },
        valueKind:
          column.contentRole === "reference"
            ? ("reference" as const)
            : column.contentRole === "computed"
              ? ("computed" as const)
              : ("text" as const),
      },
    ],
    id: `${rowId}:${column.id}`,
    kind: "tableCell" as const,
  };
}

function managementQueryNavigation(scope: FormlessUiWorkspaceIntentScope, count: number) {
  const allId = `${scope.collectionId}:query:all`;
  const activeId = `${scope.collectionId}:query:active`;
  const item = (id: string, label: string, selected: boolean) => ({
    availability: { available: true as const },
    countText: String(count),
    id,
    kind: "workspaceQuery" as const,
    label,
    selected,
    selectionIntent: { ...scope, queryId: id, type: "workspaceQuerySelection" as const },
  });

  return {
    accessibilityLabel: `${scope.collectionId} queries`,
    id: `${scope.collectionId}:queries`,
    items: [item(allId, "All", true), item(activeId, "Active", false)],
    kind: "workspaceQueryNavigation" as const,
  };
}

function emptyCollectionActions(scope: FormlessUiWorkspaceIntentScope) {
  return {
    id: `${scope.collectionId}:actions`,
    kind: "workspaceCollectionActions" as const,
    primary: [],
    secondary: [],
    secondaryAccessibilityLabel: `More actions for ${scope.collectionId}`,
  };
}

function workspaceScope(workspaceId: string, localId: string): FormlessUiWorkspaceIntentScope {
  const sectionId = `${workspaceId}:section:${localId}`;
  return {
    collectionId: `${sectionId}:collection:${localId}`,
    screenId: workspaceId,
    sectionId,
  };
}

function button(
  id: string,
  label: string,
  options: {
    density?: FormlessUiButtonContract["density"];
    disabled?: boolean;
    disabledReason?: string;
    pending?: FormlessUiButtonContract["pending"];
    prominence?: FormlessUiButtonContract["prominence"];
    type?: FormlessUiButtonContract["type"];
  } = {},
): FormlessUiButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label: label.replace(/ workspace$/, "") },
    density: options.density ?? "default",
    ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
    ...(options.disabledReason === undefined ? {} : { disabledReason: options.disabledReason }),
    id,
    kind: "button",
    ...(options.pending === undefined ? {} : { pending: options.pending }),
    prominence: options.prominence ?? "secondary",
    type: options.type ?? "button",
  };
}

function operationButton(
  id: string,
  label: string,
  options: Parameters<typeof button>[2] = {},
): FormlessUiOperationControlContract["trigger"] {
  return {
    ...button(id, label, options),
    intent: { controlId: id, invocationSource: "button", type: "operationInvoke" },
  };
}
