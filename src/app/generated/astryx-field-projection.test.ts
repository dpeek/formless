import { describe, expect, it } from "vite-plus/test";
import type { FieldSchema } from "@dpeek/formless-schema";
import type { CreateFieldConfig, RecordFieldConfig } from "../../client/views.ts";
import {
  astryxFieldValueToGeneratedFieldValue,
  createGeneratedAstryxFieldIntentHandlers,
  projectGeneratedCreateAstryxFields,
  projectGeneratedRecordAstryxField,
  projectGeneratedRecordAstryxFields,
} from "./astryx-field-projection.ts";
import type { GeneratedCreateFieldAuthoringState } from "./create-field-authoring.ts";

describe("generated Astryx field projection", () => {
  it("projects visible create field configs and authoring state into Astryx editor data", () => {
    const state = {
      discriminatorValue: undefined,
      inputValues: {
        owner: "principal-1",
        title: "Prepare launch",
      },
    } satisfies GeneratedCreateFieldAuthoringState;

    expect(
      projectGeneratedCreateAstryxFields({
        errorsByFieldName: {
          title: "Title is required.",
        },
        fields: [
          createField("title", fields.title, "text"),
          createField("done", fields.done, "boolean"),
          createField("owner", fields.owner, "reference"),
          {
            ...createField("status", fields.status, "enum"),
            stateMachine,
          },
        ],
        pendingByFieldName: {
          owner: true,
        },
        pendingLabelByFieldName: {
          owner: "Loading people",
        },
        referenceOptionsByFieldName: {
          owner: [{ id: "principal-1", label: "Dana" }],
        },
        state,
      }),
    ).toMatchObject([
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
  });

  it("projects record authoring state, display values, access modes, options, and media metadata", () => {
    const projected = projectGeneratedRecordAstryxFields({
      canPatch: true,
      density: "compact",
      draftsByFieldName: {
        accentColor: "#2563EB80",
        owner: "missing-owner",
        title: "Edited title",
      },
      errorsByFieldName: {
        title: "Save failed.",
      },
      fields: [
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
      ],
      mediaAssetOptionsByFieldName: {
        hero: [{ href: "/media/hero.webp", id: "hero.webp", label: "Hero" }],
      },
      mediaPreviewHrefByFieldName: {
        hero: "/media/hero.webp",
      },
      recordValues: {
        accentColor: "#2563EB80",
        done: false,
        hero: "hero.webp",
        owner: "missing-owner",
        status: "new",
        title: "Committed title",
        updatedAt: "2026-07-06T05:00:00Z",
      },
      referenceOptionsByFieldName: {
        owner: [],
      },
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

  it("adapts Astryx intents to generated draft, commit, revert, option, upload, and error callbacks", () => {
    const events: unknown[] = [];
    const file = { name: "hero.webp" } as File;
    const handlers = createGeneratedAstryxFieldIntentHandlers([
      {
        commitPolicy: "immediate",
        field: fields.owner,
        fieldId: "owner",
        onCommit: (value) => events.push(["owner:commit", value]),
        onDraftChange: (value) => events.push(["owner:draft", value]),
        onErrorChange: (message) => events.push(["owner:error", message]),
        onReferenceOptionSelect: (value) => events.push(["owner:select", value]),
      },
      {
        commitPolicy: "field",
        field: fields.title,
        fieldId: "title",
        onCommit: (value) => events.push(["title:commit", value]),
        onDraftChange: (value) => events.push(["title:draft", value]),
        onErrorChange: (message) => events.push(["title:error", message]),
        onRevert: () => events.push(["title:revert"]),
      },
      {
        commitPolicy: "field",
        field: fields.estimate,
        fieldId: "estimate",
        onCommit: (value) => events.push(["estimate:commit", value]),
        onErrorChange: (message) => events.push(["estimate:error", message]),
      },
      {
        commitPolicy: "field",
        field: fields.image,
        fieldId: "hero",
        onMediaAssetSelect: (assetId) => events.push(["hero:select", assetId]),
        onOpenPicker: (picker) => events.push(["hero:picker", picker]),
        onUploadFile: (uploadedFile) => events.push(["hero:upload", uploadedFile]),
      },
    ]);

    handlers.onDraftChange?.("owner", "principal-1");
    handlers.onSelectOption?.("owner", "principal-2");
    handlers.onDraftChange?.("title", "Draft title");
    handlers.onCommit?.("title", "Saved title");
    handlers.onCommit?.("estimate", "not a number");
    handlers.onRevert?.("title");
    handlers.onOpenPicker?.("hero", "media");
    handlers.onSelectOption?.("hero", "hero.webp");
    handlers.onUploadFile?.("hero", file);

    expect(events).toEqual([
      ["owner:draft", "principal-1"],
      ["owner:error", null],
      ["owner:commit", "principal-1"],
      ["owner:draft", "principal-2"],
      ["owner:select", "principal-2"],
      ["title:draft", "Draft title"],
      ["title:error", null],
      ["title:commit", "Saved title"],
      ["estimate:error", "Enter a finite number."],
      ["title:revert"],
      ["title:error", null],
      ["hero:picker", "media"],
      ["hero:select", "hero.webp"],
      ["hero:upload", file],
    ]);
  });

  it("coerces Astryx field values through existing generated field value semantics", () => {
    expect(astryxFieldValueToGeneratedFieldValue(fields.done, true)).toBe(true);
    expect(astryxFieldValueToGeneratedFieldValue(fields.estimate, 3.5)).toBe(3.5);
    expect(astryxFieldValueToGeneratedFieldValue(fields.estimate, "4")).toBe(4);
    expect(astryxFieldValueToGeneratedFieldValue(fields.title, null)).toBe("");
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

const fields = {
  color: { type: "text", required: false, format: "color" },
  done: { type: "boolean", required: true, default: true },
  estimate: { type: "number", required: false },
  image: { type: "text", required: false, format: "href" },
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
