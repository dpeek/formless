import { describe, expect, it } from "vite-plus/test";
import type {
  CreateDraftFieldInput,
  FieldSchema,
  PublicSafeOperationInputField,
} from "@dpeek/formless-schema";
import { generatedFieldDraftInput } from "@dpeek/formless-schema";
import type { CreateFieldConfig, RecordFieldConfig } from "../../client/views.ts";
import {
  createGeneratedCreateAstryxFieldIntentHandlers,
  createGeneratedOperationAstryxFieldIntentHandlers,
  createGeneratedUpdateAstryxFieldIntentHandlers,
  projectGeneratedCreateAstryxFields,
  projectGeneratedOperationAstryxFields,
  projectGeneratedRecordAstryxField,
  projectGeneratedRecordAstryxFields,
} from "./astryx-field-projection.ts";
import {
  initialGeneratedCreateDraftSessionState,
  nextGeneratedCreateDraftSessionState,
  resolveGeneratedCreateValues,
  selectGeneratedCreateDraftSession,
  type GeneratedCreateDraftSessionState,
} from "./create-field-authoring.ts";
import {
  initialGeneratedUpdateDraftSessionState,
  nextGeneratedUpdateDraftSessionState,
  selectGeneratedUpdateDraftSession,
  type GeneratedUpdateDraftFieldInput,
} from "./record-field-authoring.ts";
import {
  initialGeneratedOperationDraftSessionState,
  nextGeneratedOperationDraftSessionState,
  selectGeneratedOperationDraftSession,
  selectGeneratedOperationInputFieldConfigs,
  type GeneratedOperationDraftFieldInput,
} from "./operation-field-authoring.ts";

describe("generated Astryx field projection", () => {
  it("projects visible create field configs and authoring state into Astryx editor data", () => {
    const visibleFields = [
      createField("title", fields.title, "text"),
      createField("done", fields.done, "boolean"),
      createField("owner", fields.owner, "reference"),
      {
        ...createField("status", fields.status, "enum"),
        stateMachine,
      },
    ];
    const state = {
      draft: {
        values: {
          owner: { kind: "input", value: "principal-1" },
          title: { kind: "input", value: "Prepare launch" },
        },
      },
      submitAttempted: false,
    } satisfies GeneratedCreateDraftSessionState;
    const session = {
      fieldErrors: {
        title: {
          fieldName: "title",
          message: "Title is required.",
        },
      },
      visibleFields,
    };

    const projected = projectGeneratedCreateAstryxFields({
      pendingByFieldName: {
        owner: true,
      },
      pendingLabelByFieldName: {
        owner: "Loading people",
      },
      referenceOptionsByFieldName: {
        owner: [{ id: "principal-1", label: "Dana" }],
      },
      session,
      state,
    });

    expect(projected).toMatchObject([
      {
        accessMode: "editable",
        commitPolicy: "submit",
        draftValue: "Prepare launch",
        errors: [{ id: "title:error", message: "Title is required." }],
        id: "title",
        isRequired: true,
        kind: "text",
        label: "Title",
        mode: "editor",
        name: "title",
        surface: "create",
      },
      {
        commitPolicy: "submit",
        draftValue: true,
        kind: "boolean",
      },
      {
        commitPolicy: "submit",
        draftValue: "principal-1",
        kind: "reference",
        options: [{ label: "Dana", value: "principal-1" }],
        pending: { isPending: true, label: "Loading people" },
      },
      {
        accessMode: "state-machine",
        commitPolicy: "submit",
        draftValue: "new",
        kind: "enum",
      },
    ]);
    expect(projected[0]).not.toHaveProperty("htmlName");
    expect(projected[0]).not.toHaveProperty("hiddenInput");
  });

  it("projects record authoring state, display values, access modes, options, and media metadata", () => {
    const recordFields = [
      recordField("title", fields.title, "text"),
      recordField("done", fields.done, "boolean", { commit: "immediate" }),
      recordField("owner", fields.owner, "reference", { commit: "immediate" }),
      recordField("accentColor", fields.color, "color"),
      recordField("hero", fields.image, "media"),
      {
        ...recordField("updatedAt", fields.systemText, "text", {
          fieldRef: { kind: "system", name: "updatedAt" },
          writable: false,
        }),
        label: "Updated at",
      },
      {
        ...recordField("status", fields.status, "enum"),
        stateMachine,
      },
    ];
    const baselineValues = {
      accentColor: "#2563EB80",
      done: false,
      hero: "hero.webp",
      owner: "missing-owner",
      status: "new",
      title: "Committed title",
      updatedAt: "2026-07-06T05:00:00Z",
    };
    const draftInputs: Array<[string, GeneratedUpdateDraftFieldInput]> = [
      ["accentColor", generatedFieldDraftInput("#2563EB80")],
      ["owner", generatedFieldDraftInput("missing-owner")],
      ["title", generatedFieldDraftInput("Edited title")],
    ];
    const state = draftInputs.reduce(
      (nextState, [fieldName, fieldValue]) =>
        nextGeneratedUpdateDraftSessionState({
          fieldName,
          fieldValue,
          state: nextState,
        }),
      initialGeneratedUpdateDraftSessionState({
        baselineValues,
        fields: recordFields,
      }),
    );
    const session = selectGeneratedUpdateDraftSession({
      fields: recordFields,
      state,
    });
    const projected = projectGeneratedRecordAstryxFields({
      canPatch: true,
      density: "compact",
      errorsByFieldName: {
        title: "Save failed.",
      },
      mediaAssetOptionsByFieldName: {
        hero: [{ href: "/media/hero.webp", id: "hero.webp", label: "Hero" }],
      },
      mediaPreviewHrefByFieldName: {
        hero: "/media/hero.webp",
      },
      referenceOptionsByFieldName: {
        owner: [],
      },
      session,
      state,
      surface: "table-cell",
    });

    expect(projected).toMatchObject([
      {
        accessMode: "editable",
        committedDisplayValue: "Committed title",
        commitPolicy: "field",
        density: "compact",
        draftValue: "Edited title",
        errors: [{ id: "title:error", message: "Save failed." }],
        kind: "text",
        mode: "editor",
        surface: "table-cell",
      },
      {
        committedDisplayValue: "No",
        commitPolicy: "immediate",
        draftValue: false,
        kind: "boolean",
        mode: "editor",
      },
      {
        committedDisplayValue: "missing-owner",
        commitPolicy: "immediate",
        draftValue: "missing-owner",
        kind: "reference",
        mode: "editor",
        options: [{ isMissing: true, label: "missing-owner", value: "missing-owner" }],
      },
      {
        committedDisplayValue: "#2563EB80",
        draftValue: "#2563EB80",
        kind: "color",
        presentation: { colorValue: "#2563EB80" },
      },
      {
        committedDisplayValue: "hero.webp",
        draftValue: "hero.webp",
        kind: "media",
        options: [{ detail: "/media/hero.webp", label: "Hero", value: "hero.webp" }],
        presentation: { mediaPreviewUrl: "/media/hero.webp" },
      },
      {
        accessMode: "system",
        displayValue: "2026-07-06T05:00:00Z",
        kind: "text",
        mode: "display",
        value: "2026-07-06T05:00:00Z",
      },
      {
        accessMode: "state-machine",
        displayValue: "New",
        kind: "enum",
        mode: "display",
        value: "new",
      },
    ]);
  });

  it("projects only visible update-session fields and keeps hidden drafts out of Astryx", () => {
    const recordFields = [
      recordField("linkTargetMode", fields.linkTargetMode, "enum", { commit: "immediate" }),
      {
        ...recordField("href", fields.image, "text"),
        visibleWhen: { field: "linkTargetMode", values: ["external"] },
      },
      {
        ...recordField("linkTargetBlock", fields.blockReference, "reference"),
        visibleWhen: { field: "linkTargetMode", values: ["internal"] },
      },
    ];
    const initial = initialGeneratedUpdateDraftSessionState({
      baselineValues: {
        href: "https://old.example",
        linkTargetMode: "external",
      },
      fields: recordFields,
    });
    const withHiddenHrefDraft = nextGeneratedUpdateDraftSessionState({
      fieldName: "href",
      fieldValue: generatedFieldDraftInput("https://draft.example"),
      state: initial,
    });
    const state = nextGeneratedUpdateDraftSessionState({
      fieldName: "linkTargetMode",
      fieldValue: generatedFieldDraftInput("internal"),
      state: withHiddenHrefDraft,
    });
    const session = selectGeneratedUpdateDraftSession({
      fields: recordFields,
      state,
    });

    const projected = projectGeneratedRecordAstryxFields({
      canPatch: true,
      referenceOptionsByFieldName: {
        linkTargetBlock: [],
      },
      session,
      state,
    });

    expect(projected.map((field) => field.id)).toEqual(["linkTargetMode", "linkTargetBlock"]);
    expect(projected).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "href" })]),
    );
    expect(state.draft.values.href).toEqual({
      kind: "input",
      value: "https://draft.example",
    });
  });

  it("projects disabled writable record fields without losing commit and draft data", () => {
    expect(
      projectGeneratedRecordAstryxField({
        canPatch: false,
        fieldConfig: recordField("title", fields.title, "text"),
        recordValue: "Committed",
      }),
    ).toMatchObject({
      accessMode: "disabled",
      committedDisplayValue: "Committed",
      commitPolicy: "field",
      draftValue: "Committed",
      mode: "editor",
    });
  });

  it("adapts update Astryx intents to typed drafts and resolver-backed commits", () => {
    const events: unknown[] = [];
    const file = { name: "hero.webp" } as File;
    const recordFields = [
      recordField("owner", fields.owner, "reference", { commit: "immediate" }),
      recordField("title", fields.title, "text"),
      recordField("estimate", fields.estimate, "number", { commit: "immediate" }),
      recordField("hero", fields.image, "media"),
    ];
    const state = initialGeneratedUpdateDraftSessionState({
      baselineValues: {
        estimate: 2,
        owner: "principal-1",
        title: "Existing title",
      },
      fields: recordFields,
    });
    const handlers = createGeneratedUpdateAstryxFieldIntentHandlers({
      fields: recordFields,
      onCommit: (fieldName, resolution) =>
        events.push([`${fieldName}:commit`, resolution.patchValues]),
      onDraftChange: (fieldName, fieldValue) => events.push([`${fieldName}:draft`, fieldValue]),
      onErrorChange: (fieldName, message) => events.push([`${fieldName}:error`, message]),
      onOpenPicker: (fieldName, picker) => events.push([`${fieldName}:picker`, picker]),
      onUploadFile: (fieldName, uploadedFile) => events.push([`${fieldName}:upload`, uploadedFile]),
      state,
    });

    handlers.onSelectOption?.("owner", "principal-2");
    handlers.onDraftChange?.("title", "Draft title");
    handlers.onCommit?.("title", "Saved title");
    handlers.onCommit?.("estimate", "not a number");
    handlers.onCommit?.("title", "Existing title");
    handlers.onRevert?.("title");
    handlers.onOpenPicker?.("hero", "media");
    handlers.onUploadFile?.("hero", file);

    expect(events).toEqual([
      ["owner:draft", { kind: "input", value: "principal-2" }],
      ["owner:error", null],
      ["owner:commit", { owner: "principal-2" }],
      ["title:draft", { kind: "input", value: "Draft title" }],
      ["title:error", null],
      ["title:draft", { kind: "input", value: "Saved title" }],
      ["title:error", null],
      ["title:commit", { title: "Saved title" }],
      ["estimate:draft", { kind: "input", value: "not a number" }],
      ["estimate:error", "Enter a finite number."],
      ["title:draft", { kind: "input", value: "Existing title" }],
      ["title:error", null],
      ["title:commit", {}],
      ["title:draft", undefined],
      ["title:error", null],
      ["hero:picker", "media"],
      ["hero:upload", file],
    ]);
  });

  it("adapts create Astryx intents into typed create draft session updates", () => {
    const createFields = [
      createField("title", fields.title, "text"),
      createField("done", fields.done, "boolean"),
      createField("owner", fields.owner, "reference"),
      createField("estimate", fields.estimate, "number"),
    ];
    const changes: Array<[string, CreateDraftFieldInput]> = [];
    const errors: Array<[string, string | null]> = [];
    const handlers = createGeneratedCreateAstryxFieldIntentHandlers({
      fields: createFields,
      onDraftChange: (fieldName, fieldValue) => {
        changes.push([fieldName, fieldValue]);
      },
      onErrorChange: (fieldName, message) => {
        errors.push([fieldName, message]);
      },
    });

    handlers.onDraftChange?.("title", "Prepare launch");
    handlers.onDraftChange?.("done", true);
    handlers.onSelectOption?.("owner", "principal-1");
    handlers.onCommit?.("estimate", "many");

    expect(changes).toEqual([
      ["title", { kind: "input", value: "Prepare launch" }],
      ["done", { kind: "value", value: true }],
      ["owner", { kind: "input", value: "principal-1" }],
      ["estimate", { kind: "input", value: "many" }],
    ]);
    expect(errors).toEqual([
      ["title", null],
      ["done", null],
      ["owner", null],
      ["estimate", null],
    ]);

    const state = changes.reduce(
      (nextState, [fieldName, fieldValue]) =>
        nextGeneratedCreateDraftSessionState({
          fieldName,
          fieldValue,
          state: nextState,
        }),
      initialGeneratedCreateDraftSessionState({ fields: createFields }),
    );

    expect(
      selectGeneratedCreateDraftSession({
        enabled: true,
        fields: createFields,
        state,
      }),
    ).toMatchObject({
      canSubmit: false,
      fieldErrors: {
        estimate: {
          draftValue: { kind: "input", value: "many" },
          fieldName: "estimate",
          message: "Enter a finite number.",
        },
      },
      values: {
        done: true,
        owner: "principal-1",
        title: "Prepare launch",
      },
    });
  });

  it("keeps Astryx create fields value-driven while native submit adapters use the create resolver", () => {
    const createFields = [
      createField("title", fields.title, "text"),
      createField("done", fields.done, "boolean"),
      createField("estimate", fields.estimate, "number"),
    ];
    const state = ["title", "done", "estimate"].reduce(
      (nextState, fieldName) => {
        const value = fieldName === "title" ? "Prepare launch" : fieldName === "done" ? false : 4;

        return nextGeneratedCreateDraftSessionState({
          fieldName,
          fieldValue: generatedFieldDraftInput(value),
          state: nextState,
        });
      },
      initialGeneratedCreateDraftSessionState({ fields: createFields }),
    );
    const session = selectGeneratedCreateDraftSession({
      enabled: true,
      fields: createFields,
      state,
    });
    const projected = projectGeneratedCreateAstryxFields({
      session,
      state,
    });
    const formData = new FormData();

    for (const field of projected) {
      formData.set(field.name, String(field.draftValue ?? ""));
    }

    expect(projected.map((field) => field.draftValue)).toEqual(["Prepare launch", false, 4]);
    expect(projected.every((field) => field.commitPolicy === "submit")).toBe(true);
    expect(
      resolveGeneratedCreateValues({
        fields: createFields,
        formData,
      }),
    ).toEqual(session.values);
  });

  it("projects public operation draft sessions into Astryx public-action field data", () => {
    const operationFields = [
      operationInputField("contactEmail", "Email", "text", true, { format: "email" }),
      operationInputField("message", "Message", "longText", false),
      operationInputField("acceptedTerms", "Accepted terms", "boolean", true),
      operationInputField("requestedDate", "Requested date", "date", false),
      operationInputField("teamSize", "Team size", "number", false),
      operationInputField("topic", "Topic", "enum", true, {
        options: [
          { label: "Sales", value: "sales" },
          { label: "Support", value: "support" },
        ],
      }),
    ];
    const draftValues: Array<[string, GeneratedOperationDraftFieldInput]> = [
      ["contactEmail", { kind: "input", value: "ada@example.com" }],
      ["message", { kind: "input", value: "Hello" }],
      ["acceptedTerms", generatedFieldDraftInput(false)],
      ["requestedDate", { kind: "input", value: "2026-07-09" }],
      ["teamSize", { kind: "input", value: "many" }],
      ["topic", { kind: "input", value: "sales" }],
    ];
    const state = draftValues.reduce(
      (nextState, [inputName, inputValue]) =>
        nextGeneratedOperationDraftSessionState({
          inputName,
          inputValue,
          state: nextState,
        }),
      initialGeneratedOperationDraftSessionState({ fields: operationFields }),
    );
    const session = selectGeneratedOperationDraftSession({
      fields: operationFields,
      state,
    });
    const projected = projectGeneratedOperationAstryxFields({
      pendingByFieldName: { contactEmail: true },
      pendingLabelByFieldName: { contactEmail: "Submitting email" },
      session,
      state,
    });

    expect(projected).toMatchObject([
      {
        accessMode: "editable",
        commitPolicy: "submit",
        draftValue: "ada@example.com",
        kind: "text",
        mode: "editor",
        name: "contactEmail",
        pending: { isPending: true, label: "Submitting email" },
        presentation: { format: "email", placeholder: "Email" },
        surface: "public-action",
      },
      {
        commitPolicy: "submit",
        draftValue: "Hello",
        kind: "long-text",
        presentation: { maxLines: 4, placeholder: "Message" },
      },
      {
        draftValue: false,
        kind: "boolean",
      },
      {
        draftValue: "2026-07-09",
        kind: "date",
      },
      {
        draftValue: "many",
        errors: [{ message: "Enter a finite number." }],
        kind: "number",
      },
      {
        draftValue: "sales",
        kind: "enum",
        options: [
          { label: "Sales", value: "sales" },
          { label: "Support", value: "support" },
        ],
      },
    ]);
    expect(projected[0]).not.toHaveProperty("htmlName");
    expect(projected[0]).not.toHaveProperty("hiddenInput");
  });

  it("adapts public operation Astryx intents into typed operation drafts", () => {
    const operationFields = [
      operationInputField("contactEmail", "Email", "text", true, { format: "email" }),
      operationInputField("acceptedTerms", "Accepted terms", "boolean", true),
      operationInputField("teamSize", "Team size", "number", false),
      operationInputField("topic", "Topic", "enum", true, {
        options: [{ label: "Sales", value: "sales" }],
      }),
    ];
    const changes: Array<[string, GeneratedOperationDraftFieldInput]> = [];
    const errors: Array<[string, string | null]> = [];
    const handlers = createGeneratedOperationAstryxFieldIntentHandlers({
      fields: selectGeneratedOperationInputFieldConfigs(operationFields),
      onDraftChange: (inputName, inputValue) => {
        changes.push([inputName, inputValue]);
      },
      onErrorChange: (inputName, message) => {
        errors.push([inputName, message]);
      },
    });

    handlers.onDraftChange?.("contactEmail", "ada@example.com");
    handlers.onDraftChange?.("acceptedTerms", false);
    handlers.onCommit?.("teamSize", "many");
    handlers.onSelectOption?.("topic", "sales");

    expect(changes).toEqual([
      ["contactEmail", { kind: "input", value: "ada@example.com" }],
      ["acceptedTerms", { kind: "value", value: false }],
      ["teamSize", { kind: "input", value: "many" }],
      ["topic", { kind: "input", value: "sales" }],
    ]);
    expect(errors).toEqual([
      ["contactEmail", null],
      ["acceptedTerms", null],
      ["teamSize", null],
      ["topic", null],
    ]);

    const state = changes.reduce(
      (nextState, [inputName, inputValue]) =>
        nextGeneratedOperationDraftSessionState({
          inputName,
          inputValue,
          state: nextState,
        }),
      initialGeneratedOperationDraftSessionState({ fields: operationFields }),
    );

    expect(
      selectGeneratedOperationDraftSession({
        fields: operationFields,
        state,
      }),
    ).toMatchObject({
      canSubmit: false,
      fieldErrors: {
        teamSize: {
          draftValue: { kind: "input", value: "many" },
          fieldName: "teamSize",
          message: "Enter a finite number.",
        },
      },
      input: {
        acceptedTerms: false,
        contactEmail: "ada@example.com",
        topic: "sales",
      },
    });
  });

  it("projects invalid create number drafts as raw Astryx draft values with field errors", () => {
    const createFields = [createField("estimate", fields.estimate, "number")];
    const state = nextGeneratedCreateDraftSessionState({
      fieldName: "estimate",
      fieldValue: { kind: "input", value: "many" },
      state: initialGeneratedCreateDraftSessionState({ fields: createFields }),
    });
    const session = selectGeneratedCreateDraftSession({
      enabled: true,
      fields: createFields,
      state,
    });

    expect(projectGeneratedCreateAstryxFields({ session, state })).toMatchObject([
      {
        draftValue: "many",
        errors: [{ message: "Enter a finite number." }],
        kind: "number",
      },
    ]);
  });

  it("projects invalid update number drafts as raw Astryx draft values with field errors", () => {
    const recordFields = [recordField("estimate", fields.estimate, "number")];
    const state = nextGeneratedUpdateDraftSessionState({
      fieldName: "estimate",
      fieldValue: { kind: "input", value: "many" },
      state: initialGeneratedUpdateDraftSessionState({
        baselineValues: { estimate: 2 },
        fields: recordFields,
      }),
    });
    const session = selectGeneratedUpdateDraftSession({
      fields: recordFields,
      state,
    });

    expect(projectGeneratedRecordAstryxFields({ canPatch: true, session, state })).toMatchObject([
      {
        draftValue: "many",
        errors: [{ message: "Enter a finite number." }],
        kind: "number",
      },
    ]);
  });
});

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
    writable?: boolean;
  } = {},
): RecordFieldConfig {
  return {
    commit: options.commit ?? "field-commit",
    editor,
    field,
    fieldName,
    ...(options.fieldRef === undefined ? {} : { fieldRef: options.fieldRef }),
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
    name,
    label,
    required,
    control,
    ...options,
  } as PublicSafeOperationInputField;
}

const fields = {
  blockReference: { type: "reference", required: false, to: "block", displayField: "title" },
  color: { type: "text", required: false, format: "color" },
  done: { type: "boolean", required: true, default: true },
  estimate: { type: "number", required: false },
  image: { type: "text", required: false, format: "href" },
  linkTargetMode: {
    type: "enum",
    required: true,
    values: {
      external: { label: "External" },
      internal: { label: "Internal" },
    },
  },
  owner: { type: "reference", required: false, to: "auth:principal", displayField: "name" },
  status: {
    type: "enum",
    required: true,
    values: {
      archived: { label: "Archived" },
      new: { label: "New" },
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
    transitions: {},
  },
  machineName: "statusFlow",
  terminalStates: ["archived"],
} satisfies NonNullable<RecordFieldConfig["stateMachine"]>;
