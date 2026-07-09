import { describe, expect, it } from "vite-plus/test";
import type {
  AppSchema,
  EntityOperationSchema,
  FieldSchema,
  GeneratedFieldDraftInput,
  PublicSafeOperationInputField,
  StateMachineTransitionSchema,
} from "@dpeek/formless-schema";
import { generatedFieldDraftInput } from "@dpeek/formless-schema";
import type {
  CreateDefaultConfig,
  CreateFieldConfig,
  RecordFieldConfig,
} from "../../client/views.ts";
import type {
  EntityOperationPresentationConfig,
} from "../../client/operation-presentation-model.ts";
import type { TransitionStateOperationConfig } from "../../client/state-machine-model.ts";
import type {
  FormlessUiDisplayField,
  FormlessUiRecordField,
} from "../../../lib/astryx/src/formless-ui-contract.ts";
import {
  initialGeneratedCreateDraftSessionState,
  markGeneratedCreateDraftSessionSubmitted,
  nextGeneratedCreateDraftSessionState,
  selectGeneratedCreateDraftSession,
} from "./create-field-authoring.ts";
import {
  initialGeneratedOperationDraftSessionState,
  nextGeneratedOperationDraftSessionState,
  selectGeneratedOperationDraftSession,
} from "./operation-field-authoring.ts";
import {
  initialGeneratedUpdateDraftSessionState,
  nextGeneratedUpdateDraftSessionState,
  selectGeneratedUpdateDraftSession,
} from "./record-field-authoring.ts";
import {
  projectGeneratedCreateFormlessUiFields,
  projectGeneratedCreateFormlessUiSession,
  projectGeneratedDisplayFormlessUiField,
  projectGeneratedOperationFormlessUiFields,
  projectGeneratedOperationFormlessUiSession,
  projectGeneratedRecordFormlessUiFields,
  projectGeneratedRecordFormlessUiSession,
  selectFormlessUiValueUnitCommit,
} from "./formless-ui-projection.ts";

describe("generated Formless UI projection", () => {
  it("projects create sessions and field configs into submit-bound create fields", () => {
    const createFields = [
      createField("title", fields.title, "text"),
      createField("estimate", fields.estimate, "number"),
      createField("owner", fields.owner, "reference"),
      {
        ...createField("status", fields.status, "enum"),
        stateMachine,
      },
    ];
    const defaults = [
      {
        fieldName: "owner",
        field: fields.owner,
        value: { kind: "literal", value: "principal-1" },
      },
    ] satisfies CreateDefaultConfig[];
    const state = nextGeneratedCreateDraftSessionState({
      fieldName: "estimate",
      fieldValue: { kind: "input", value: "many" },
      state: nextGeneratedCreateDraftSessionState({
        fieldName: "title",
        fieldValue: { kind: "input", value: "Prepare launch" },
        state: initialGeneratedCreateDraftSessionState({ defaults, fields: createFields }),
      }),
    });
    const session = selectGeneratedCreateDraftSession({
      defaults,
      enabled: true,
      fields: createFields,
      state: markGeneratedCreateDraftSessionSubmitted(state),
    });
    const projectedSession = projectGeneratedCreateFormlessUiSession({
      defaults,
      session,
      state,
    });
    const projected = projectGeneratedCreateFormlessUiFields({
      pendingByFieldName: { owner: true },
      pendingLabelByFieldName: { owner: "Loading people" },
      referenceOptionsByFieldName: {
        owner: [{ id: "principal-1", label: "Dana" }],
      },
      session,
      state,
    });

    expect(projectedSession).toMatchObject({
      canSubmit: false,
      defaults: [{ fieldName: "owner", value: { kind: "literal", value: "principal-1" } }],
      defaultsResolved: true,
      fieldErrors: {
        estimate: {
          draftValue: { kind: "input", value: "many" },
          fieldName: "estimate",
          message: "Enter a finite number.",
        },
      },
      values: {
        owner: "",
        status: "new",
        title: "Prepare launch",
      },
      visibleFieldNames: ["title", "estimate", "owner", "status"],
    });
    expect(projected).toMatchObject([
      {
        access: { kind: "editable" },
        commit: "submit",
        control: { controlKind: "text", label: "Title" },
        draftInput: { kind: "input", value: "Prepare launch" },
        fieldName: "title",
        mode: "editor",
        surface: "create",
        value: "Prepare launch",
      },
      {
        commit: "submit",
        draftInput: { kind: "input", value: "many" },
        errors: [{ fieldName: "estimate", message: "Enter a finite number." }],
        value: undefined,
      },
      {
        commit: "submit",
        options: {
          missingReferenceValue: null,
          referenceOptions: [{ id: "principal-1", label: "Dana" }],
        },
        pending: { isPending: true, label: "Loading people" },
        value: "",
      },
      {
        access: { kind: "stateMachine" },
        commit: "submit",
        stateMachineFacts: {
          currentValue: "new",
          initialState: "new",
          terminal: false,
        },
        value: "new",
      },
    ]);
  });

  it("projects update fields without flattening draft, renderer, option, media, or access facts", () => {
    const recordFields = [
      recordField("title", fields.title, "text"),
      recordField("cost", fields.cost, "number", {
        format: "currency",
        valueUnit: {
          unitFieldName: "costUnit",
          unitField: fields.costUnit,
        },
      }),
      recordField("owner", fields.owner, "reference", { commit: "immediate" }),
      recordField("hero", fields.image, "media"),
      recordField("priority", fields.priority, "enum", { commit: "immediate" }),
      {
        ...recordField("status", fields.status, "enum", { commit: "immediate" }),
        stateMachine,
      },
      recordField("updatedAt", fields.systemText, "text", {
        fieldRef: { kind: "system", name: "updatedAt" },
        writable: false,
      }),
      recordField("summary", fields.systemText, "text", { writable: false }),
    ];
    const draftValues: Array<[string, GeneratedFieldDraftInput]> = [
      ["title", { kind: "input", value: "Edited title" }],
      ["cost", { kind: "value", value: 13 }],
      ["priority", { kind: "input", value: "urgent" }],
    ];
    const state = draftValues.reduce(
      (nextState, [fieldName, fieldValue]) =>
        nextGeneratedUpdateDraftSessionState({
          fieldName: String(fieldName),
          fieldValue,
          state: nextState,
        }),
      initialGeneratedUpdateDraftSessionState({
        baselineValues: recordValues,
        fields: recordFields,
      }),
    );
    const session = selectGeneratedUpdateDraftSession({ fields: recordFields, state });
    const projectedSession = projectGeneratedRecordFormlessUiSession({ session, state });
    const projected = projectGeneratedRecordFormlessUiFields({
      canPatch: true,
      density: "compact",
      entityName: "task",
      errorsByFieldName: { title: "Save failed." },
      mediaAssetOptionsByFieldName: {
        hero: [
          { height: 360, href: "/media/hero.webp", id: "hero.webp", label: "Hero", width: 640 },
        ],
      },
      pendingByFieldName: { hero: true },
      pendingLabelByFieldName: { hero: "Uploading" },
      recordId: "task-1",
      referenceOptionsByFieldName: { owner: [] },
      schema: blockSchema,
      session,
      state,
      surface: "table-cell",
      transitionOperationsByFieldName: { status: transitionOperations },
      unitDraftInputByFieldName: { cost: { kind: "input", value: "hour" } },
    });
    const byName = Object.fromEntries(projected.map((field) => [field.fieldName, field]));
    const title = asRecordField(byName.title);
    const cost = asRecordField(byName.cost);
    const owner = asRecordField(byName.owner);
    const hero = asRecordField(byName.hero);
    const priority = asRecordField(byName.priority);
    const status = asDisplayField(byName.status);
    const updatedAt = asDisplayField(byName.updatedAt);
    const summary = asDisplayField(byName.summary);

    expect(projectedSession).toMatchObject({
      values: {
        cost: 13,
        priority: "urgent",
        title: "Edited title",
      },
      visibleFieldNames: [
        "title",
        "cost",
        "owner",
        "hero",
        "priority",
        "status",
        "updatedAt",
        "summary",
      ],
    });
    expect(title).toMatchObject({
      access: { kind: "editable", canPatch: true },
      commit: "field-commit",
      control: { controlKind: "text" },
      density: "compact",
      drafts: {
        draft: "Edited title",
        draftInput: { kind: "input", value: "Edited title" },
        recordValue: "Committed title",
      },
      errors: [{ fieldName: "title", message: "Save failed." }],
      formatting: { displayValue: "Committed title" },
      mode: "editor",
      rendererKind: "text",
      surface: "table-cell",
    });
    expect(cost).toMatchObject({
      control: { controlKind: "number" },
      drafts: {
        draft: "$13.00",
        draftInput: { kind: "value", value: 13 },
        recordValue: 12.5,
        unitDraft: "hour",
        unitDraftInput: { kind: "input", value: "hour" },
        unitRecordValue: "day",
      },
      rendererKind: "value-unit",
      valueUnit: { unitFieldName: "costUnit" },
    });
    expect(selectFormlessUiValueUnitCommit(cost)).toEqual({
      fieldDraftInput: { kind: "value", value: 13 },
      unitDraftInput: { kind: "input", value: "hour" },
    });
    expect(owner).toMatchObject({
      commit: "immediate",
      options: {
        missingReferenceValue: "missing-owner",
        referenceOptions: [{ id: "missing-owner", label: "missing-owner", missing: true }],
      },
      rendererKind: "reference",
    });
    expect(hero).toMatchObject({
      media: {
        mediaEditorMode: "asset",
        mediaPreviewHref: "/media/hero.webp",
        uploadEnabled: true,
        uploadPatchFields: {
          heightFieldName: "height",
          mediaAssetFieldName: "hero",
          widthFieldName: "width",
        },
      },
      options: {
        mediaAssetOptions: [
          { height: 360, href: "/media/hero.webp", id: "hero.webp", label: "Hero", width: 640 },
        ],
      },
      pending: { isPending: true, label: "Uploading" },
      rendererKind: "media",
    });
    expect(priority.options).toMatchObject({
      unknownEnumValue: "urgent",
      enumOptions: [
        { label: "urgent", missing: true, value: "urgent" },
        {
          label: "High",
          presentation: {
            color: { intent: "danger", known: true, token: "priority.high" },
            icon: { kind: "svg" },
          },
          value: "high",
        },
        {
          label: "Low",
          presentation: { color: { intent: "success", known: true, token: "priority.low" } },
          value: "low",
        },
      ],
    });
    expect(status).toMatchObject({
      access: { kind: "stateMachine" },
      formatting: {
        displayValue: "Archived",
        enumValuePresentation: { label: "Archived" },
      },
      mode: "display",
      stateMachineFacts: {
        currentValue: "archived",
        terminal: true,
        transitions: [
          { availability: { valid: false, disabledReason: "Requires New." } },
          { availability: { valid: true } },
        ],
      },
      value: "archived",
    });
    expect(updatedAt).toMatchObject({
      access: { kind: "system", fieldRef: { kind: "system", name: "updatedAt" } },
      mode: "display",
      value: "2026-07-09T00:00:00.000Z",
    });
    expect(summary).toMatchObject({
      access: { kind: "readOnly" },
      formatting: { displayValue: "Locked" },
      mode: "display",
      value: "Locked",
    });
  });

  it("projects display fields with formatted values, suffixes, references, and badges", () => {
    const referenceDisplay = projectGeneratedDisplayFormlessUiField({
      fieldConfig: {
        ...recordField("owner", fields.owner, "reference"),
        suffix: "assigned",
      },
      recordValue: "principal-1",
      referenceOptions: [{ id: "principal-1", label: "Dana" }],
    });
    const stateDisplay = projectGeneratedDisplayFormlessUiField({
      fieldConfig: {
        ...recordField("status", fields.status, "enum"),
        stateMachine,
        suffix: "current",
      },
      recordValue: "",
      transitionOperations,
    });

    expect(referenceDisplay).toMatchObject({
      formatting: { displayValue: "Dana", suffix: "assigned" },
      options: {
        missingReferenceValue: null,
        referenceOptions: [{ id: "principal-1", label: "Dana" }],
      },
    });
    expect(stateDisplay).toMatchObject({
      formatting: { displayValue: "Unset", suffix: "current" },
      stateMachineFacts: {
        currentValue: "",
        terminal: false,
        transitions: [
          { availability: { valid: false, disabledReason: "Requires New." } },
          { availability: { valid: false, disabledReason: "Requires Archived." } },
        ],
      },
    });
  });

  it("projects operation sessions and public input fields into submit-bound operation fields", () => {
    const operationFields = [
      operationInputField("contactEmail", "Email", "text", true, { format: "email" }),
      operationInputField("message", "Message", "longText", false),
      operationInputField("acceptedTerms", "Accepted terms", "boolean", true),
      operationInputField("teamSize", "Team size", "number", false),
      operationInputField("topic", "Topic", "enum", true, {
        options: [
          { label: "Sales", value: "sales" },
          { label: "Support", value: "support" },
        ],
      }),
    ];
    const draftValues: Array<[string, GeneratedFieldDraftInput]> = [
      ["contactEmail", { kind: "input", value: "ada@example.com" }],
      ["message", { kind: "input", value: "Hello" }],
      ["acceptedTerms", generatedFieldDraftInput(false)],
      ["teamSize", { kind: "input", value: "many" }],
      ["topic", { kind: "input", value: "sales" }],
    ];
    const state = draftValues.reduce(
      (nextState, [inputName, inputValue]) =>
        nextGeneratedOperationDraftSessionState({
          inputName: String(inputName),
          inputValue,
          state: nextState,
        }),
      initialGeneratedOperationDraftSessionState({ fields: operationFields }),
    );
    const session = selectGeneratedOperationDraftSession({
      fields: operationFields,
      state,
      unsupportedRequiredInputNames: ["attachment"],
    });
    const projectedSession = projectGeneratedOperationFormlessUiSession({ session, state });
    const projected = projectGeneratedOperationFormlessUiFields({
      pendingByFieldName: { contactEmail: true },
      pendingLabelByFieldName: { contactEmail: "Submitting" },
      session,
      state,
    });

    expect(projectedSession).toMatchObject({
      canSubmit: false,
      configurationErrors: [
        {
          inputName: "attachment",
          message:
            'Public operation input field "attachment" is required but is not supported by generated public forms.',
        },
      ],
      fieldErrors: {
        teamSize: {
          draftValue: { kind: "input", value: "many" },
          fieldName: "teamSize",
          message: "Enter a finite number.",
        },
      },
      values: {
        acceptedTerms: false,
        contactEmail: "ada@example.com",
        message: "Hello",
        topic: "sales",
      },
      visibleFieldNames: ["contactEmail", "message", "acceptedTerms", "teamSize", "topic"],
    });
    expect(projected).toMatchObject([
      {
        access: { kind: "editable" },
        commit: "submit",
        control: { controlKind: "text", label: "Email" },
        draftInput: { kind: "input", value: "ada@example.com" },
        inputName: "contactEmail",
        mode: "editor",
        pending: { isPending: true, label: "Submitting" },
        surface: "operation",
        value: "ada@example.com",
      },
      {
        commit: "submit",
        control: { controlKind: "textarea" },
        draftInput: { kind: "input", value: "Hello" },
      },
      {
        control: { controlKind: "checkbox" },
        draftInput: { kind: "value", value: false },
        value: false,
      },
      {
        control: { controlKind: "number" },
        draftInput: { kind: "input", value: "many" },
        errors: [{ fieldName: "teamSize", message: "Enter a finite number." }],
        value: undefined,
      },
      {
        control: { controlKind: "select" },
        options: {
          enumOptions: [
            { label: "Sales", value: "sales" },
            { label: "Support", value: "support" },
          ],
          unknownEnumValue: null,
        },
        value: "sales",
      },
    ]);
  });
});

function asRecordField(field: unknown): FormlessUiRecordField {
  if (field === undefined || (field as FormlessUiRecordField).mode !== "editor") {
    throw new Error("Expected record editor field.");
  }

  return field as FormlessUiRecordField;
}

function asDisplayField(field: unknown): FormlessUiDisplayField {
  if (field === undefined || (field as FormlessUiDisplayField).mode !== "display") {
    throw new Error("Expected display field.");
  }

  return field as FormlessUiDisplayField;
}

function createField(
  fieldName: string,
  field: FieldSchema,
  editor: CreateFieldConfig["editor"],
): CreateFieldConfig {
  return {
    editor,
    field,
    fieldName,
  };
}

function recordField(
  fieldName: string,
  field: FieldSchema,
  editor: RecordFieldConfig["editor"],
  options: {
    commit?: RecordFieldConfig["commit"];
    fieldRef?: RecordFieldConfig["fieldRef"];
    format?: RecordFieldConfig["format"];
    valueUnit?: RecordFieldConfig["valueUnit"];
    writable?: boolean;
  } = {},
): RecordFieldConfig {
  return {
    commit: options.commit ?? "field-commit",
    editor,
    field,
    fieldName,
    ...(options.fieldRef === undefined ? {} : { fieldRef: options.fieldRef }),
    ...(options.format === undefined ? {} : { format: options.format }),
    ...(options.valueUnit === undefined ? {} : { valueUnit: options.valueUnit }),
    ...(options.writable === undefined ? {} : { writable: options.writable }),
  };
}

function operationInputField(
  name: string,
  label: string,
  control: PublicSafeOperationInputField["control"],
  required: boolean,
  options: Partial<PublicSafeOperationInputField> = {},
): PublicSafeOperationInputField {
  return {
    control,
    label,
    name,
    required,
    ...options,
  } as PublicSafeOperationInputField;
}

function transitionOperation(
  operationName: string,
  label: string,
  transitionName: string,
  transition: StateMachineTransitionSchema,
): TransitionStateOperationConfig {
  const operation = {
    audit: { input: "none" },
    effect: {
      type: "operationHandler",
      handler: "transition-state",
      config: { machine: stateMachine.machineName, transition: transitionName },
    },
    idempotency: { required: true },
    kind: "command",
    output: { type: "command" },
    scope: "record",
  } satisfies EntityOperationSchema;

  return {
    field: fields.status,
    fieldName: "status",
    label,
    machine: stateMachine.machine,
    machineName: stateMachine.machineName,
    operation: {
      canonicalKey: `task.${operationName}`,
      entityName: "task",
      label,
      operation,
      operationName,
    } satisfies EntityOperationPresentationConfig,
    operationName,
    transition,
    transitionName,
  };
}

const fields = {
  cost: { type: "number", required: false },
  costUnit: {
    type: "enum",
    required: false,
    values: {
      day: { label: "Day" },
      hour: { label: "Hour" },
    },
  },
  estimate: { type: "number", required: false },
  image: { type: "text", required: false, format: "href" },
  owner: { type: "reference", required: false, to: "auth:principal", displayField: "name" },
  priority: {
    type: "enum",
    required: false,
    values: {
      high: { label: "High", presentation: { color: "priority.high", icon: "priority-marker" } },
      low: { label: "Low", presentation: { color: "priority.low" } },
    },
  },
  status: {
    type: "enum",
    required: true,
    values: {
      archived: { label: "Archived", presentation: { color: "success", icon: "confirm" } },
      new: { label: "New", presentation: { color: "warning" } },
    },
  },
  systemText: { type: "text", required: false },
  title: { type: "text", required: true, label: "Title" },
} satisfies Record<string, FieldSchema>;

const stateMachine = {
  fieldName: "status",
  initialState: "new",
  machine: {
    field: "status",
    initial: "new",
    terminal: ["archived"],
    transitions: {
      archive: { label: "Archive", from: ["new"], to: "archived" },
      reopen: { label: "Reopen", from: ["archived"], to: "new" },
    },
  },
  machineName: "statusFlow",
  terminalStates: ["archived"],
} satisfies NonNullable<RecordFieldConfig["stateMachine"]>;

const transitionOperations = [
  transitionOperation(
    "archiveTask",
    "Archive",
    "archive",
    stateMachine.machine.transitions.archive,
  ),
  transitionOperation("reopenTask", "Reopen", "reopen", stateMachine.machine.transitions.reopen),
];

const recordValues = {
  cost: 12.5,
  costUnit: "day",
  hero: "hero.webp",
  owner: "missing-owner",
  priority: "normal",
  status: "archived",
  summary: "Locked",
  title: "Committed title",
  updatedAt: "2026-07-09T00:00:00.000Z",
};

const blockSchema = {
  version: 1,
  entities: {
    task: {
      fields: {
        height: { type: "number", required: false },
        hero: fields.image,
        width: { type: "number", required: false },
      },
    },
  },
  itemViews: {},
  queries: {},
  tableViews: {},
  views: {},
} as unknown as AppSchema;
