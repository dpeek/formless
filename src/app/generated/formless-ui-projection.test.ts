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
import type { EntityOperationPresentationConfig } from "../../client/operation-presentation-model.ts";
import type { TransitionStateOperationConfig } from "../../client/state-machine-model.ts";
import type {
  FormlessUiDisplayField,
  FormlessUiRecordField,
} from "@dpeek/formless-astryx/contract";
import { resolveIconCatalogSvg } from "../../shared/icon-catalog.ts";
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
  projectGeneratedCreateFormlessUiField,
  projectGeneratedCreateFormlessUiSession,
  projectGeneratedCreateFormlessUiSurface,
  projectGeneratedDisplayFormlessUiField,
  projectGeneratedOperationFormlessUiFields,
  projectGeneratedOperationFormlessUiSession,
  projectGeneratedRecordFormlessUiField,
  projectGeneratedRecordFormlessUiFields,
  projectGeneratedRecordFormlessUiSession,
  selectFormlessUiValueUnitCommit,
} from "./formless-ui-projection.ts";

describe("generated Formless UI projection", () => {
  it("projects opaque picker and swatch facts for color fields", () => {
    const colorField = {
      type: "text",
      required: false,
      label: "Accent",
      format: "color",
    } satisfies FieldSchema;
    const createColor = projectGeneratedCreateFormlessUiField({
      fieldConfig: createField("accent", colorField, "color"),
      value: "#abc",
    });
    const unsupportedAlphaDisplay = projectGeneratedDisplayFormlessUiField({
      fieldConfig: recordField("accent", colorField, "color"),
      recordValue: "#2563eb80",
    });
    const invalidDisplay = projectGeneratedDisplayFormlessUiField({
      fieldConfig: recordField("accent", colorField, "color"),
      recordValue: "not-a-color",
    });

    expect(createColor.color).toEqual({
      picker: { kind: "hex", value: "#AABBCC" },
      swatch: { kind: "hex", value: "#AABBCC" },
    });
    expect(unsupportedAlphaDisplay.color).toEqual({
      picker: { kind: "unavailable" },
      swatch: { kind: "unavailable" },
    });
    expect(invalidDisplay.color).toEqual({
      picker: { kind: "unavailable" },
      swatch: { kind: "unavailable" },
    });
  });

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
          referenceOptions: [{ id: "principal-1", label: "Dana" }],
        },
        pending: { isPending: true, label: "Loading people" },
        reference: {
          clearable: true,
          kind: "editor",
          valueStatus: { kind: "unset" },
        },
        value: "",
      },
      {
        access: { kind: "stateMachine" },
        commit: "submit",
        draftInput: { kind: "value", value: "new" },
        labelVisibility: "visible",
        stateMachineFacts: {
          currentValue: "new",
          initialState: "new",
          interaction: { kind: "display" },
          terminal: false,
          valueStatus: { kind: "declared", value: "new" },
        },
        value: "new",
      },
    ]);
  });

  it("projects controlled create trigger, dialog, form, and pending control facts", () => {
    const createFields = [createField("title", fields.title, "text")];
    const state = nextGeneratedCreateDraftSessionState({
      fieldName: "title",
      fieldValue: { kind: "input", value: "Prepare launch" },
      state: initialGeneratedCreateDraftSessionState({ fields: createFields }),
    });
    const session = selectGeneratedCreateDraftSession({
      enabled: true,
      fields: createFields,
      state,
    });
    const surface = projectGeneratedCreateFormlessUiSurface({
      enabled: true,
      entityLabel: "Task",
      id: "task:create",
      isSubmitting: true,
      open: true,
      session,
      state,
      submitLabel: "Create Task",
      trigger: {
        content: { icon: "add", kind: "iconAndLabel", label: "Create Task" },
        density: "default",
        prominence: "primary",
      },
      triggerLabel: "Create Task",
    });

    expect(surface).toMatchObject({
      dialog: {
        form: {
          cancel: { content: { kind: "label", label: "Cancel" } },
          fieldSet: {
            disabled: true,
            fields: [{ fieldName: "title", value: "Prepare launch" }],
          },
          submit: {
            content: { kind: "label", label: "Saving..." },
            disabled: true,
            pending: { isPending: true, label: "Saving" },
            type: "submit",
          },
        },
        open: true,
        title: "Create Task",
      },
      id: "task:create",
      kind: "createSurface",
      trigger: {
        accessibilityLabel: "Create Task",
        content: { icon: "add", kind: "iconAndLabel", label: "Create Task" },
        disabled: false,
      },
    });
  });

  it("disables create opening when context defaults are unresolved", () => {
    const createFields = [createField("owner", fields.owner, "reference")];
    const defaults = [
      {
        fieldName: "owner",
        field: fields.owner,
        value: { kind: "context", name: "principal" },
      },
    ] satisfies CreateDefaultConfig[];
    const state = initialGeneratedCreateDraftSessionState({ defaults, fields: createFields });
    const session = selectGeneratedCreateDraftSession({
      defaults,
      enabled: true,
      fields: createFields,
      state,
    });
    const surface = projectGeneratedCreateFormlessUiSurface({
      defaults,
      enabled: true,
      entityLabel: "Task",
      id: "task:create:scoped",
      isSubmitting: false,
      open: false,
      session,
      state,
      submitLabel: "Create Task",
      trigger: {
        content: { icon: "add", kind: "iconOnly" },
        density: "compact",
        prominence: "quiet",
      },
      triggerLabel: "Create Task",
    });

    expect(surface.trigger).toMatchObject({
      disabled: true,
      disabledReason: "Create task requires a selected context.",
    });
    expect(surface.dialog.form.fieldSet).toMatchObject({
      disabled: true,
      disabledReason: "Create task requires a selected context.",
    });
  });

  it("projects required reference defaults from loaded options", () => {
    const requiredOwner = {
      ...fields.owner,
      required: true,
    } satisfies Extract<FieldSchema, { type: "reference" }>;
    const requiredField = createField("owner", requiredOwner, "reference");
    const requiredState = initialGeneratedCreateDraftSessionState({ fields: [requiredField] });
    const projectedDefault = projectGeneratedCreateFormlessUiField({
      fieldConfig: requiredField,
      referenceOptions: [
        { id: "principal-1", label: "Dana" },
        { id: "principal-2", label: "Jordan" },
      ],
      state: requiredState,
    });
    const projectedWithoutOptions = projectGeneratedCreateFormlessUiField({
      fieldConfig: requiredField,
      state: requiredState,
    });
    const optionalField = createField("owner", fields.owner, "reference");
    const optionalState = initialGeneratedCreateDraftSessionState({ fields: [optionalField] });
    const projectedOptional = projectGeneratedCreateFormlessUiField({
      fieldConfig: optionalField,
      referenceOptions: [{ id: "principal-1", label: "Dana" }],
      state: optionalState,
    });

    expect(projectedDefault).toMatchObject({
      draftInput: { kind: "input", value: "principal-1" },
      reference: {
        clearable: false,
        kind: "editor",
        valueStatus: { kind: "resolved", value: "principal-1" },
      },
      value: "principal-1",
    });
    expect(projectedWithoutOptions).toMatchObject({
      draftInput: undefined,
      reference: {
        clearable: false,
        kind: "editor",
        valueStatus: { kind: "unset" },
      },
      value: undefined,
    });
    expect(projectedOptional).toMatchObject({
      draftInput: { kind: "value", value: "" },
      reference: {
        clearable: true,
        kind: "editor",
        valueStatus: { kind: "unset" },
      },
      value: "",
    });
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
      editorDraftByFieldName: { cost: "$13." },
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
        draft: "$13.",
        draftInput: { kind: "value", value: 13 },
        recordValue: 12.5,
        unitDraft: "hour",
        unitDraftInput: { kind: "input", value: "hour" },
        unitRecordValue: "day",
      },
      rendererKind: "value-unit",
      valueUnit: {
        clearable: true,
        options: [
          { label: "Day", status: "declared", value: "day" },
          { label: "Hour", status: "declared", value: "hour" },
        ],
        required: false,
        unitFieldName: "costUnit",
      },
    });
    expect(selectFormlessUiValueUnitCommit(cost)).toEqual({
      fieldDraftInput: { kind: "value", value: 13 },
      unitDraftInput: { kind: "input", value: "hour" },
    });
    expect(owner).toMatchObject({
      commit: "immediate",
      options: {
        referenceOptions: [],
      },
      reference: {
        clearable: true,
        kind: "editor",
        valueStatus: { kind: "missing", value: "missing-owner" },
      },
      rendererKind: "reference",
    });
    expect(hero).toMatchObject({
      media: {
        accept: "image/jpeg,image/png,image/webp,image/gif",
        fileSelectEnabled: true,
        maxSize: 5 * 1024 * 1024,
        previewHref: "/media/hero.webp",
        selectedAssetId: "hero.webp",
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
    expect(priority).toMatchObject({
      enum: {
        clearable: true,
        kind: "editor",
        listContent: "label",
        style: "plain",
        triggerContent: "label",
        valueStatus: { kind: "undeclared", value: "urgent" },
      },
      options: {
        enumOptions: [
          {
            label: "High",
            presentation: {
              color: { intent: "danger", known: true, token: "priority.high" },
              icon: { kind: "svg" },
              iconKnown: true,
              iconToken: "priority-marker",
            },
            status: "declared",
            value: "high",
          },
          {
            label: "Low",
            presentation: {
              color: { intent: "success", known: true, token: "priority.low" },
            },
            status: "declared",
            value: "low",
          },
        ],
      },
    });
    expect(status).toMatchObject({
      access: { kind: "stateMachine" },
      density: "compact",
      formatting: {
        displayValue: "Archived",
        enumValuePresentation: { label: "Archived" },
      },
      mode: "display",
      labelVisibility: "hidden",
      stateMachineFacts: {
        currentValue: "archived",
        interaction: {
          invocationSource: "menuItem",
          kind: "transitions",
          transitions: [
            { availability: { valid: false, disabledReason: "Requires New." } },
            { availability: { valid: false, disabledReason: "Requires New." } },
          ],
        },
        terminal: true,
        valueStatus: { kind: "declared", value: "archived" },
      },
      value: "archived",
    });
    expect(updatedAt).toMatchObject({
      access: { kind: "system", fieldRef: { kind: "system", name: "updatedAt" } },
      density: "compact",
      mode: "display",
      value: "2026-07-09T00:00:00.000Z",
    });
    expect(summary).toMatchObject({
      access: { kind: "readOnly" },
      density: "compact",
      formatting: { displayValue: "Locked" },
      mode: "display",
      value: "Locked",
    });
  });

  it("projects source-backed icon picker options and dialog state", () => {
    const addIconSource = requiredIconSource("add");
    const customIconSource = '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" /></svg>';
    const catalogField = asRecordField(
      projectGeneratedRecordFormlessUiField({
        canPatch: true,
        fieldConfig: recordField("icon", fields.icon, "icon", { commit: "immediate" }),
        iconDialogDraft: addIconSource,
        iconDialogOpen: true,
        recordValue: customIconSource,
      }),
    );
    const customField = asRecordField(
      projectGeneratedRecordFormlessUiField({
        canPatch: true,
        fieldConfig: recordField("icon", fields.icon, "icon", { commit: "immediate" }),
        iconDialogDraft: customIconSource,
        iconDialogOpen: true,
        iconParseError: "Enter valid SVG.",
        recordValue: addIconSource,
      }),
    );
    const createIconField = projectGeneratedCreateFormlessUiField({
      fieldConfig: createField("icon", fields.icon, "icon"),
      iconDialogDraft: addIconSource,
      iconDialogOpen: true,
      value: customIconSource,
    });

    expect(catalogField.options?.iconOptions?.find((option) => option.id === "add")).toEqual({
      group: "ui",
      id: "add",
      label: "Add",
      source: addIconSource,
    });
    expect(catalogField.icon).toMatchObject({
      dialogDraft: addIconSource,
      dialogOpen: true,
      emptyValue: false,
      previewSource: addIconSource,
      selection: { kind: "option", optionId: "add", source: addIconSource },
      valueMode: "svgSource",
    });
    expect(customField.icon).toMatchObject({
      canCancel: true,
      canSave: false,
      customParseError: "Enter valid SVG.",
      dialogDraft: customIconSource,
      dialogOpen: true,
      emptyValue: false,
      previewSource: addIconSource,
      selection: { kind: "customSource", source: customIconSource },
      valueMode: "svgSource",
    });
    expect(createIconField.icon).toMatchObject({
      canCancel: true,
      canSave: true,
      dialogDraft: addIconSource,
      dialogOpen: true,
      previewSource: addIconSource,
      selection: { kind: "option", optionId: "add", source: addIconSource },
      valueMode: "svgSource",
    });
  });

  it("projects media assets as thumbnail presentation facts for create and display", () => {
    const mediaAssetOptions = [
      { height: 360, href: "/media/hero.webp", id: "hero.webp", label: "Hero", width: 640 },
    ];
    const createMediaField = projectGeneratedCreateFormlessUiField({
      fieldConfig: createField("hero", fields.image, "media"),
      mediaAssetOptions,
      value: "hero.webp",
    });
    const displayMediaField = projectGeneratedDisplayFormlessUiField({
      fieldConfig: recordField("hero", fields.image, "media"),
      mediaAssetOptions,
      recordValue: "hero.webp",
    });

    expect(createMediaField).toMatchObject({
      control: { controlKind: "media" },
      media: {
        fileSelectEnabled: true,
        previewHref: "/media/hero.webp",
        selectedAssetId: "hero.webp",
        uploadEnabled: true,
      },
      options: { mediaAssetOptions },
    });
    expect(displayMediaField).toMatchObject({
      control: { controlKind: "media" },
      media: {
        previewHref: "/media/hero.webp",
        selectedAssetId: "hero.webp",
      },
      options: { mediaAssetOptions },
    });
  });

  it("projects missing media asset picker facts without changing stored asset ids", () => {
    const missingMediaField = asRecordField(
      projectGeneratedRecordFormlessUiField({
        canPatch: true,
        entityName: "task",
        fieldConfig: recordField("hero", fields.image, "media"),
        mediaAssetOptions: [],
        recordValue: "not/a-core-asset",
        schema: blockSchema,
      }),
    );

    expect(missingMediaField.media).toMatchObject({
      fileSelectEnabled: true,
      missingSelectedAsset: {
        assetId: "not/a-core-asset",
        reason: "Selected media asset is unavailable.",
      },
      selectedAssetId: "not/a-core-asset",
      uploadEnabled: true,
    });
    expect(missingMediaField.drafts.recordValue).toBe("not/a-core-asset");
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
    const missingReferenceDisplay = projectGeneratedDisplayFormlessUiField({
      fieldConfig: recordField("owner", fields.owner, "reference"),
      recordValue: "principal-missing",
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
    const unknownStateDisplay = projectGeneratedDisplayFormlessUiField({
      fieldConfig: {
        ...recordField("status", fields.status, "enum"),
        stateMachine,
      },
      recordValue: "paused",
      transitionOperations,
    });
    const recordStateDisplay = projectGeneratedDisplayFormlessUiField({
      fieldConfig: {
        ...recordField("status", fields.status, "enum"),
        stateMachine,
      },
      recordValue: "new",
      showLabel: false,
      surface: "record",
      transitionOperations,
    });
    const tableStateDisplay = projectGeneratedDisplayFormlessUiField({
      density: "compact",
      fieldConfig: {
        ...recordField("status", fields.status, "enum"),
        stateMachine,
      },
      recordValue: "new",
      surface: "table-cell",
      transitionOperations,
    });
    const dateDisplay = projectGeneratedDisplayFormlessUiField({
      fieldConfig: recordField("dueDate", fields.dueDate, "date"),
      recordValue: "2026-07-08",
      surface: "detail",
    });
    const timestampDisplay = projectGeneratedDisplayFormlessUiField({
      fieldConfig: recordField("updatedAt", fields.systemText, "text", {
        fieldRef: { kind: "system", name: "updatedAt" },
        writable: false,
      }),
      recordValue: "2026-07-09T00:00:00.000Z",
      surface: "detail",
    });

    expect(referenceDisplay).toMatchObject({
      formatting: { displayValue: "Dana", suffix: "assigned" },
      options: {
        referenceOptions: [{ id: "principal-1", label: "Dana" }],
      },
      reference: {
        kind: "display",
        valueStatus: { kind: "resolved", value: "principal-1" },
      },
    });
    expect(missingReferenceDisplay).toMatchObject({
      formatting: { displayValue: "principal-missing" },
      options: {
        referenceOptions: [{ id: "principal-1", label: "Dana" }],
      },
      reference: {
        kind: "display",
        valueStatus: { kind: "missing", value: "principal-missing" },
      },
    });
    expect(dateDisplay.formatting.temporal).toEqual({
      kind: "date",
      value: "2026-07-08",
    });
    expect(timestampDisplay.formatting.temporal).toEqual({
      kind: "dateTime",
      value: "2026-07-09T00:00:00.000Z",
    });
    expect(stateDisplay).toMatchObject({
      density: "default",
      formatting: { displayValue: "Unset", suffix: "current" },
      labelVisibility: "visible",
      stateMachineFacts: {
        currentValue: "",
        interaction: {
          invocationSource: "menuItem",
          kind: "transitions",
          transitions: [
            { availability: { valid: false, disabledReason: "Requires New." } },
            { availability: { valid: false, disabledReason: "Requires New." } },
          ],
        },
        terminal: false,
        valueStatus: { kind: "unset", message: "Current state is missing." },
      },
    });
    expect(unknownStateDisplay).toMatchObject({
      stateMachineFacts: {
        currentValue: "paused",
        valueStatus: {
          kind: "undeclared",
          message: 'Current state "paused" is not declared.',
          value: "paused",
        },
      },
    });
    expect(recordStateDisplay).toMatchObject({
      density: "default",
      labelVisibility: "hidden",
      stateMachineFacts: {
        interaction: {
          invocationSource: "menuItem",
          kind: "transitions",
          transitions: [{ availability: { valid: true } }, { availability: { valid: true } }],
        },
      },
      surface: "record",
    });
    expect(tableStateDisplay).toMatchObject({
      density: "compact",
      labelVisibility: "hidden",
      stateMachineFacts: {
        interaction: {
          invocationSource: "menuItem",
          kind: "transitions",
          transitions: [{ availability: { valid: true } }, { availability: { valid: true } }],
        },
      },
      surface: "table-cell",
    });
  });

  it("projects explicit enum presentation, label visibility, and undeclared value facts", () => {
    const field = {
      type: "enum",
      required: true,
      label: "Status",
      values: {
        fallback: {
          label: "Legacy fallback",
          presentation: { color: "priority.unknown", icon: "missing-icon" },
        },
        open: {
          label: "Open",
          presentation: { color: "priority.normal", icon: "priority-marker" },
        },
      },
    } satisfies Extract<FieldSchema, { type: "enum" }>;
    const fieldConfig = {
      ...recordField("status", field, "enum", { commit: "immediate" }),
      presentation: { mode: "iconOnly", trigger: "label", list: "icon" } as const,
    };
    const editor = projectGeneratedRecordFormlessUiField({
      canPatch: true,
      draftInput: { kind: "input", value: "paused" },
      fieldConfig,
      recordValue: "paused",
      showLabel: false,
      surface: "record",
    });
    const iconTriggerEditor = projectGeneratedRecordFormlessUiField({
      canPatch: true,
      fieldConfig: {
        ...fieldConfig,
        presentation: { mode: "iconOnly", trigger: "icon", list: "both" },
      },
      recordValue: "open",
      surface: "record",
    });
    const display = projectGeneratedDisplayFormlessUiField({
      fieldConfig,
      recordValue: "fallback",
      showLabel: true,
      surface: "detail",
    });

    expect(editor).toMatchObject({
      enum: {
        clearable: false,
        kind: "editor",
        listContent: "icon",
        style: "rich",
        triggerContent: "label",
        valueStatus: { kind: "undeclared", value: "paused" },
      },
      labelVisibility: "hidden",
      options: {
        enumOptions: [
          {
            presentation: {
              color: { intent: "neutral", known: false, token: "priority.unknown" },
              iconKnown: false,
              iconToken: "missing-icon",
            },
            status: "declared",
            value: "fallback",
          },
          {
            presentation: {
              color: { intent: "warning", known: true, token: "priority.normal" },
              iconKnown: true,
              iconToken: "priority-marker",
            },
            status: "declared",
            value: "open",
          },
        ],
      },
      rendererKind: "enum-icon",
    });
    expect(iconTriggerEditor).toMatchObject({
      enum: {
        listContent: "both",
        style: "rich",
        triggerContent: "both",
      },
    });
    expect(display).toMatchObject({
      enum: {
        content: "icon",
        kind: "display",
        valueStatus: { kind: "declared", value: "fallback" },
      },
      labelVisibility: "visible",
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
        input: { format: "email" },
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
        enum: {
          clearable: true,
          kind: "editor",
          placeholder: "Select",
          style: "plain",
          valueStatus: { kind: "declared", value: "sales" },
        },
        options: {
          enumOptions: [
            { label: "Sales", status: "declared", value: "sales" },
            { label: "Support", status: "declared", value: "support" },
          ],
        },
        value: "sales",
      },
    ]);

    const undeclaredTopicState = nextGeneratedOperationDraftSessionState({
      inputName: "topic",
      inputValue: { kind: "input", value: "enterprise" },
      state: initialGeneratedOperationDraftSessionState({ fields: operationFields }),
    });
    const undeclaredTopicSession = selectGeneratedOperationDraftSession({
      fields: operationFields,
      state: undeclaredTopicState,
    });
    const undeclaredTopic = projectGeneratedOperationFormlessUiFields({
      session: undeclaredTopicSession,
      state: undeclaredTopicState,
    }).find((field) => field.inputName === "topic");

    expect(undeclaredTopic).toMatchObject({
      enum: {
        clearable: true,
        valueStatus: { kind: "undeclared", value: "enterprise" },
      },
      errors: [{ message: 'Field "topic" must be a known enum value.' }],
      options: {
        enumOptions: [
          { label: "Sales", status: "declared", value: "sales" },
          { label: "Support", status: "declared", value: "support" },
        ],
      },
    });
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
  dueDate: { type: "date", required: false },
  estimate: { type: "number", required: false },
  image: { type: "text", required: false, format: "href" },
  icon: { type: "text", required: false, format: "icon" },
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
      reopen: { label: "Reopen", from: ["new"], to: "new" },
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

function requiredIconSource(key: string): string {
  const source = resolveIconCatalogSvg(key);

  if (source === undefined) {
    throw new Error(`Missing test icon ${key}.`);
  }

  return source;
}
