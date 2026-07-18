import type { FieldSchema } from "@dpeek/formless-schema";
import type {
  FormlessUiActionTriggerContract,
  FormlessUiButtonContract,
  FormlessUiCreateField,
  FormlessUiCreateSurfaceContract,
  FormlessUiField,
  FormlessUiManagementInstallDialogContract,
  FormlessUiManagementManifestContract,
  FormlessUiManagementReadyContract,
  FormlessUiManagementWorkspaceOperationContract,
  FormlessUiOperationControlContract,
  FormlessUiTableActionGroupContract,
  FormlessUiTableColumnContract,
  FormlessUiTableContract,
  FormlessUiTableEditActionContract,
  FormlessUiWorkspaceCollectionContract,
  FormlessUiWorkspaceCollectionActionGroupContract,
  FormlessUiWorkspaceContract,
  FormlessUiWorkspaceIntentScope,
  FormlessUiWorkspaceSectionContract,
} from "../formless-ui-contract.ts";
import {
  formlessUiManagementInstallDialogReference,
  formlessUiManagementManifestReference,
  formlessUiWorkspaceManifestReference,
} from "../formless-ui-contract-host.ts";
import {
  booleanControl,
  createField,
  draftInput,
  enumControl,
  enumOptions,
  fieldError,
  recordDrafts,
  recordField,
  referenceControl,
  referenceEditorFacts,
  referenceOptions,
  textControl,
} from "./fields/fixture-helpers.ts";
import { createWorkspacePushOperationControlFixture } from "./operation-controls.fixtures.ts";

export type FormlessInstanceManagementFixtureId =
  | "empty"
  | "failed"
  | "gateway-unavailable"
  | "installed"
  | "loading"
  | "push-authorization-required";

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
export const instanceManagementInstallActionId = "instance-management:apps:install";
export const instanceManagementInstallActionControlId = `${instanceManagementInstallActionId}:control`;
export const instanceManagementWorkspacePushOperationId = "instance-management:workspace:push";
export const instanceManagementWorkspacePushFixture = createWorkspacePushOperationControlFixture({
  id: `${instanceManagementWorkspacePushOperationId}:control`,
  outcome: "success",
});

const installFieldSchema = (label: string) =>
  ({ label, required: true, type: "text" }) satisfies Extract<FieldSchema, { type: "text" }>;

const routeEnabledField = {
  default: true,
  label: "Enabled",
  required: true,
  type: "boolean",
} as const satisfies Extract<FieldSchema, { type: "boolean" }>;
const routeMatchHostField = {
  label: "Match host",
  required: false,
  type: "text",
} as const satisfies Extract<FieldSchema, { type: "text" }>;
const routeMatchPathField = {
  label: "Match path",
  required: true,
  type: "text",
} as const satisfies Extract<FieldSchema, { type: "text" }>;
const routeMatchPrefixField = {
  label: "Match prefix",
  required: false,
  type: "text",
} as const satisfies Extract<FieldSchema, { type: "text" }>;
const routeKindField = {
  label: "Kind",
  required: true,
  type: "enum",
  values: {
    mount: { label: "Mount" },
    redirect: { label: "Redirect" },
  },
} as const satisfies Extract<FieldSchema, { type: "enum" }>;
const routeTargetProfileField = {
  label: "Target profile",
  required: false,
  type: "enum",
  values: {
    app: { label: "App" },
    instance: { label: "Instance" },
    "public-site": { label: "Public Site" },
  },
} as const satisfies Extract<FieldSchema, { type: "enum" }>;
const routeAppInstallField = {
  displayField: "label",
  label: "App install",
  required: false,
  to: "app-install",
  type: "reference",
} as const satisfies Extract<FieldSchema, { type: "reference" }>;
const routeSurfaceField = {
  label: "Surface",
  required: false,
  type: "enum",
  values: {
    admin: { label: "Admin" },
    "public-site": { label: "Public Site" },
  },
} as const satisfies Extract<FieldSchema, { type: "enum" }>;
const routeAccessField = {
  label: "Access",
  required: false,
  type: "enum",
  values: {
    anonymous: { label: "Anonymous" },
    authenticated: { label: "Authenticated" },
    owner: { label: "Owner" },
  },
} as const satisfies Extract<FieldSchema, { type: "enum" }>;
const routeDeploymentConfigField = {
  displayField: "label",
  label: "Deployment config",
  required: false,
  to: "deployment-config",
  type: "reference",
} as const satisfies Extract<FieldSchema, { type: "reference" }>;

const routeAppInstallOptions = [
  { id: "site", label: "Site" },
  { id: "tasks", label: "Tasks" },
] as const;
const routeDeploymentConfigOptions = [
  { id: "instance.primary", label: "instance.primary" },
] as const;

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

type PushFixtureState = "authorization-required" | "idle";

function pushOperation(state: PushFixtureState): FormlessUiManagementWorkspaceOperationContract {
  const operationId = instanceManagementWorkspacePushOperationId;
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
    control: pushControl(state),
    id: operationId,
    kind: "managementWorkspaceOperation",
  };
}

function pushControl(state: PushFixtureState): FormlessUiOperationControlContract {
  const control = instanceManagementWorkspacePushFixture.initial;

  return state === "authorization-required"
    ? {
        ...control,
        status: {
          ...control.status,
          accessibilityLabel: "Authorization required. Authorize the workspace gateway.",
          detail: "Authorize the workspace gateway.",
          intent: "warning",
          label: "Authorization required",
        },
      }
    : control;
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
    keepCollectionReadyWhenEmpty: true,
    rows: installed
      ? [
          ["site", "Site", "site"],
          ["tasks", "Tasks", "tasks"],
        ]
      : [],
    sectionActions: () => [installAppAction()],
  });
}

function routesWorkspace(installed: boolean) {
  return managementWorkspace(instanceManagementRoutesReference.workspaceId, "Routes", "routes", {
    collectionActions: routeCollectionActions,
    columns: [
      ["app", "App", "reference"],
      ["path", "Path", "computed"],
    ],
    emptyDescription: "Installed apps publish their routes here.",
    emptyTitle: "No routes configured",
    keepCollectionReadyWhenEmpty: true,
    rowActions: (scope, [id, app, path]) =>
      routeRowActions(scope, {
        access: id === "site-home" ? "anonymous" : "owner",
        appInstall: app.toLowerCase(),
        id,
        matchPath: path,
        surface: id === "site-home" ? "public-site" : "admin",
        targetProfile: id === "site-home" ? "public-site" : "app",
      }),
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
    collectionActions?: (
      scope: FormlessUiWorkspaceIntentScope,
    ) => FormlessUiWorkspaceCollectionActionGroupContract;
    emptyDescription: string;
    emptyTitle: string;
    keepCollectionReadyWhenEmpty?: boolean;
    rowActions?: (
      scope: FormlessUiWorkspaceIntentScope,
      row: readonly [id: string, first: string, second: string],
    ) => FormlessUiTableActionGroupContract;
    rows: readonly (readonly [id: string, first: string, second: string])[];
    sectionActions?: (
      scope: FormlessUiWorkspaceIntentScope,
    ) => FormlessUiWorkspaceSectionContract["actions"];
  },
): FormlessUiWorkspaceContract {
  const scope = workspaceScope(workspaceId, localId);
  const table = managementTable(scope, label, input);
  const queryNavigation = managementQueryNavigation(scope, input.rows.length);
  const collection: FormlessUiWorkspaceCollectionContract = {
    accessibilityLabel: label,
    availability:
      input.rows.length === 0 && !input.keepCollectionReadyWhenEmpty
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
      actions: input.collectionActions?.(scope) ?? emptyCollectionActions(scope),
      kind: "ordinary",
      queryNavigation,
      result: table,
      summaries: [],
    },
    selectedQueryId: queryNavigation.items[0]!.id,
  };
  const section: FormlessUiWorkspaceSectionContract = {
    accessibilityLabel: `${label} section`,
    actions: input.sectionActions?.(scope) ?? [],
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
    rowActions?: (
      scope: FormlessUiWorkspaceIntentScope,
      row: readonly [id: string, first: string, second: string],
    ) => FormlessUiTableActionGroupContract;
    rows: readonly (readonly [id: string, first: string, second: string])[];
  },
): FormlessUiTableContract {
  const resultId = `${scope.collectionId}:result`;
  const columns = [
    ...input.columns.map(([id, columnLabel, contentRole], index) => ({
      accessibilityLabel: columnLabel,
      alignment: "start" as const,
      contentRole,
      id,
      isRowHeader: index === 0,
      kind: "tableColumn" as const,
      label: columnLabel,
      labelVisibility: "visible" as const,
      width: index === 0 ? ("auto" as const) : ("md" as const),
    })),
    ...(input.rowActions === undefined
      ? []
      : [
          {
            accessibilityLabel: `${label} operations`,
            alignment: "end" as const,
            contentRole: "actions" as const,
            id: "actions",
            isRowHeader: false,
            kind: "tableColumn" as const,
            label: "Actions",
            labelVisibility: "hidden" as const,
            width: "xs" as const,
          },
        ]),
  ] satisfies readonly FormlessUiTableColumnContract[];

  return {
    accessibilityLabel: label,
    columns,
    density: "default",
    editing:
      input.rowActions === undefined
        ? { disabledReason: "Fixture records are read-only.", enabled: false }
        : { enabled: true },
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
    rows: input.rows.map((row) => ({
      accessibilityLabel: `${row[1]} ${label.toLowerCase()} record`,
      cells: [
        tableCell(row[0], columns[0]!, row[1]),
        tableCell(row[0], columns[1]!, row[2]),
        ...(input.rowActions === undefined
          ? []
          : [
              {
                columnId: "actions",
                contents: [input.rowActions(scope, row)],
                id: `${row[0]}:actions`,
                kind: "tableCell" as const,
              },
            ]),
      ],
      id: `${resultId}:row:${row[0]}`,
      kind: "tableRow" as const,
      warnings: [],
    })),
  };
}

function installAppAction(): FormlessUiWorkspaceSectionContract["actions"][number] {
  const action: FormlessUiActionTriggerContract = {
    accessibilityLabel: "Install app",
    icon: "add",
    id: instanceManagementInstallActionControlId,
    intent: "primary",
    invocationSource: "button",
    invoke: {
      controlId: instanceManagementInstallActionControlId,
      invocationSource: "button",
    },
    kind: "actionTrigger",
    label: "Install App",
  };

  return {
    action,
    id: instanceManagementInstallActionId,
    kind: "workspaceExternalAction",
  };
}

function routeCollectionActions(
  scope: FormlessUiWorkspaceIntentScope,
): FormlessUiWorkspaceCollectionActionGroupContract {
  return {
    id: `${scope.collectionId}:actions`,
    kind: "workspaceCollectionActions",
    primary: [{ kind: "createAction", surface: routeCreateSurface(scope) }],
    secondary: [],
    secondaryAccessibilityLabel: "More route actions",
  };
}

function routeCreateSurface(
  scope: FormlessUiWorkspaceIntentScope,
): FormlessUiCreateSurfaceContract {
  const id = `${scope.collectionId}:create:route`;
  const title = "Create Route";

  return {
    dialog: {
      form: {
        cancel: button(`${id}:cancel`, "Cancel"),
        errors: [],
        fieldSet: {
          disabled: false,
          fields: routeCreateFields(id),
          id: `${id}:fields`,
          kind: "fieldSet",
        },
        id: `${id}:form`,
        kind: "createForm",
        submit: button(`${id}:submit`, title, { prominence: "primary", type: "submit" }),
      },
      id: `${id}:dialog`,
      kind: "createDialog",
      open: false,
      title,
    },
    id,
    kind: "createSurface",
    trigger: {
      ...button(`${id}:trigger`, title, { prominence: "primary" }),
      content: { icon: "add", kind: "iconAndLabel", label: title },
    },
  };
}

function routeCreateFields(ownerId: string): FormlessUiCreateField[] {
  return [
    createRouteBooleanField(ownerId, "enabled", routeEnabledField, true),
    createRouteTextField(ownerId, "matchHost", routeMatchHostField, ""),
    createRouteTextField(ownerId, "matchPath", routeMatchPathField, "/docs"),
    createRouteTextField(ownerId, "matchPrefix", routeMatchPrefixField, ""),
    createRouteEnumField(ownerId, "kind", routeKindField, "mount"),
    createRouteEnumField(ownerId, "targetProfile", routeTargetProfileField, "public-site"),
    createRouteReferenceField(
      ownerId,
      "appInstall",
      routeAppInstallField,
      "site",
      routeAppInstallOptions,
    ),
    createRouteEnumField(ownerId, "surface", routeSurfaceField, "public-site"),
    createRouteEnumField(ownerId, "access", routeAccessField, "anonymous"),
    createRouteReferenceField(
      ownerId,
      "deploymentConfig",
      routeDeploymentConfigField,
      "instance.primary",
      routeDeploymentConfigOptions,
    ),
  ];
}

function createRouteTextField(
  ownerId: string,
  fieldName: string,
  field: Extract<FieldSchema, { type: "text" }>,
  value: string,
) {
  const control = textControl(field);

  return createField({
    control,
    draftInput: draftInput(value),
    editor: control.editor,
    field,
    fieldName,
    labelVisibility: "visible",
    occurrence: { ownerId, placementId: fieldName },
    recordId: ownerId,
    value,
  });
}

function createRouteBooleanField(
  ownerId: string,
  fieldName: string,
  field: Extract<FieldSchema, { type: "boolean" }>,
  value: boolean,
) {
  const control = booleanControl(field);

  return createField({
    control,
    draftInput: draftInput(value),
    editor: control.editor,
    field,
    fieldName,
    labelVisibility: "visible",
    occurrence: { ownerId, placementId: fieldName },
    recordId: ownerId,
    value,
  });
}

function createRouteEnumField(
  ownerId: string,
  fieldName: string,
  field: Extract<FieldSchema, { type: "enum" }>,
  value: string,
) {
  const control = enumControl(field);

  return createField({
    control,
    draftInput: draftInput(value),
    editor: control.editor,
    field,
    fieldName,
    labelVisibility: "visible",
    occurrence: { ownerId, placementId: fieldName },
    options: { enumOptions: enumOptions(field) },
    recordId: ownerId,
    value,
  });
}

function createRouteReferenceField(
  ownerId: string,
  fieldName: string,
  field: Extract<FieldSchema, { type: "reference" }>,
  value: string,
  options: readonly { id: string; label: string }[],
) {
  const control = referenceControl(field);

  return createField({
    control,
    draftInput: draftInput(value),
    editor: control.editor,
    field,
    fieldName,
    labelVisibility: "visible",
    occurrence: { ownerId, placementId: fieldName },
    options: { referenceOptions: referenceOptions(options) },
    recordId: ownerId,
    reference: referenceEditorFacts(field, value, options),
    value,
  });
}

type RouteFixtureRecord = {
  access: "anonymous" | "authenticated" | "owner";
  appInstall: string;
  id: string;
  matchPath: string;
  surface: "admin" | "public-site";
  targetProfile: "app" | "instance" | "public-site";
};

function routeRowActions(
  scope: FormlessUiWorkspaceIntentScope,
  record: RouteFixtureRecord,
): FormlessUiTableActionGroupContract {
  return {
    id: `${scope.collectionId}:result:row:${record.id}:actions`,
    kind: "actionGroup",
    primary: [],
    secondary: [routeEditAction(scope, record)],
    secondaryAccessibilityLabel: `Route operations for ${record.matchPath}`,
  };
}

function routeEditAction(
  scope: FormlessUiWorkspaceIntentScope,
  record: RouteFixtureRecord,
): FormlessUiTableEditActionContract {
  const tableId = `${scope.collectionId}:result`;
  const rowId = `${tableId}:row:${record.id}`;
  const dialogId = `${rowId}:route.update:dialog`;
  const openIntent = {
    dialogId,
    open: true,
    rowId,
    tableId,
    type: "tableEditDialogOpenChange" as const,
  };

  return {
    dialog: {
      close: button(`${dialogId}:close`, "Done", { density: "compact" }),
      description: "Route",
      id: dialogId,
      kind: "tableEditDialog",
      open: false,
      openChangeIntent: { ...openIntent, open: false },
      target: {
        fieldSet: {
          disabled: false,
          fields: routeEditFields(rowId, record),
          id: `${dialogId}:fields`,
          kind: "fieldSet",
        },
        kind: "available",
      },
      targetKind: "row",
      title: "Edit route",
    },
    kind: "editAction",
    openIntent,
    trigger: button(`${dialogId}:open`, "Edit route", { density: "compact" }),
  };
}

function routeEditFields(rowId: string, record: RouteFixtureRecord): FormlessUiField[] {
  return [
    recordRouteBooleanField(rowId, "enabled", routeEnabledField, true),
    recordRouteTextField(rowId, "matchHost", routeMatchHostField, ""),
    recordRouteTextField(rowId, "matchPath", routeMatchPathField, record.matchPath),
    recordRouteTextField(rowId, "matchPrefix", routeMatchPrefixField, ""),
    recordRouteEnumField(rowId, "targetProfile", routeTargetProfileField, record.targetProfile),
    recordRouteReferenceField(
      rowId,
      "appInstall",
      routeAppInstallField,
      record.appInstall,
      routeAppInstallOptions,
    ),
    recordRouteEnumField(rowId, "surface", routeSurfaceField, record.surface),
    recordRouteEnumField(rowId, "access", routeAccessField, record.access),
    recordRouteReferenceField(
      rowId,
      "deploymentConfig",
      routeDeploymentConfigField,
      "instance.primary",
      routeDeploymentConfigOptions,
    ),
  ];
}

function recordRouteTextField(
  rowId: string,
  fieldName: string,
  field: Extract<FieldSchema, { type: "text" }>,
  value: string,
) {
  const control = textControl(field);

  return recordField({
    commit: "field-commit",
    control,
    drafts: recordDrafts({ recordValue: value }),
    editor: control.editor,
    field,
    fieldName,
    labelVisibility: "visible",
    occurrence: { ownerId: rowId, placementId: fieldName },
    recordId: rowId,
    rendererKind: "text",
  });
}

function recordRouteBooleanField(
  rowId: string,
  fieldName: string,
  field: Extract<FieldSchema, { type: "boolean" }>,
  value: boolean,
) {
  const control = booleanControl(field);

  return recordField({
    commit: "immediate",
    control,
    drafts: recordDrafts({ recordValue: value }),
    editor: control.editor,
    field,
    fieldName,
    labelVisibility: "visible",
    occurrence: { ownerId: rowId, placementId: fieldName },
    recordId: rowId,
    rendererKind: "checkbox",
  });
}

function recordRouteEnumField(
  rowId: string,
  fieldName: string,
  field: Extract<FieldSchema, { type: "enum" }>,
  value: string,
) {
  const control = enumControl(field);

  return recordField({
    commit: "immediate",
    control,
    drafts: recordDrafts({ recordValue: value }),
    editor: control.editor,
    field,
    fieldName,
    labelVisibility: "visible",
    occurrence: { ownerId: rowId, placementId: fieldName },
    options: { enumOptions: enumOptions(field) },
    recordId: rowId,
    rendererKind: "enum",
  });
}

function recordRouteReferenceField(
  rowId: string,
  fieldName: string,
  field: Extract<FieldSchema, { type: "reference" }>,
  value: string,
  options: readonly { id: string; label: string }[],
) {
  const control = referenceControl(field);

  return recordField({
    commit: "immediate",
    control,
    drafts: recordDrafts({ recordValue: value }),
    editor: control.editor,
    field,
    fieldName,
    labelVisibility: "visible",
    occurrence: { ownerId: rowId, placementId: fieldName },
    options: { referenceOptions: referenceOptions(options) },
    recordId: rowId,
    reference: referenceEditorFacts(field, value, options),
    rendererKind: "reference",
  });
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
