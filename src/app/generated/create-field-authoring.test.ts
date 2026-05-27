import { describe, expect, it } from "vite-plus/test";
import type {
  CreateDefaultConfig,
  CreateFieldConfig,
  CreateUnionPresentationConfig,
} from "../../client/views.ts";
import type { EntityUnionVariantSchema, FieldSchema } from "../../shared/schema.ts";
import {
  initialGeneratedCreateFieldAuthoringState,
  nextGeneratedCreateFieldAuthoringState,
  resolveGeneratedCreateValues,
  selectGeneratedCreateFieldAuthoring,
} from "./create-field-authoring.ts";

describe("generated create field authoring", () => {
  it("selects visible create fields from fixed discriminator defaults and field input state", () => {
    const defaults = [literalTypeDefault("link")];
    const state = initialGeneratedCreateFieldAuthoringState({
      defaults,
      union: blockUnion,
    });

    expect(state).toEqual({
      discriminatorValue: "link",
      inputValues: {},
    });
    expect(
      fieldNames(
        selectGeneratedCreateFieldAuthoring({
          defaults,
          enabled: true,
          fields: [createField("label", "text")],
          state,
          union: blockUnion,
        }).visibleFields,
      ),
    ).toEqual(["label", "linkTargetMode", "href", "icon"]);

    const internalLinkState = nextGeneratedCreateFieldAuthoringState({
      fieldName: "linkTargetMode",
      state,
      union: blockUnion,
      value: "internal",
    });

    expect(
      fieldNames(
        selectGeneratedCreateFieldAuthoring({
          defaults,
          enabled: true,
          fields: [createField("label", "text")],
          state: internalLinkState,
          union: blockUnion,
        }).visibleFields,
      ),
    ).toEqual(["label", "linkTargetMode", "linkTargetBlock", "icon"]);
  });

  it("updates active union fields when the discriminator input changes", () => {
    const state = initialGeneratedCreateFieldAuthoringState({ union: blockUnion });
    const linkState = nextGeneratedCreateFieldAuthoringState({
      fieldName: "type",
      state,
      union: blockUnion,
      value: "link",
    });

    expect(
      fieldNames(
        selectGeneratedCreateFieldAuthoring({
          enabled: true,
          fields: [createField("type", "enum"), createField("label", "text")],
          state,
          union: blockUnion,
        }).visibleFields,
      ),
    ).toEqual(["type", "label", "href", "icon"]);
    expect(
      fieldNames(
        selectGeneratedCreateFieldAuthoring({
          enabled: true,
          fields: [createField("type", "enum"), createField("label", "text")],
          state: linkState,
          union: blockUnion,
        }).visibleFields,
      ),
    ).toEqual(["type", "label", "linkTargetMode", "href", "icon"]);
  });

  it("exposes submit readiness for context defaults", () => {
    const defaults = [
      {
        fieldName: "parent",
        field: fields.parent,
        value: { kind: "context", name: "block" },
      },
    ] satisfies CreateDefaultConfig[];
    const state = initialGeneratedCreateFieldAuthoringState({});

    expect(
      selectGeneratedCreateFieldAuthoring({
        defaults,
        enabled: true,
        fields: [createField("block", "reference"), createField("label", "text")],
        queryContext: { today: "2026-05-27" },
        state,
      }),
    ).toMatchObject({ canSubmit: false, defaultsResolved: false });
    expect(
      selectGeneratedCreateFieldAuthoring({
        defaults,
        enabled: true,
        fields: [createField("block", "reference"), createField("label", "text")],
        queryContext: { today: "2026-05-27", values: { block: "home" } },
        state,
      }),
    ).toMatchObject({ canSubmit: true, defaultsResolved: true });
  });

  it("resolves submitted values from active visible fields and create defaults", () => {
    const linkFormData = new FormData();
    linkFormData.set("label", "Internal docs");
    linkFormData.set("linkTargetMode", "internal");
    linkFormData.set("linkTargetBlock", "docs");
    linkFormData.set("href", "/stale-docs");
    linkFormData.set("icon", "book");

    expect(
      resolveGeneratedCreateValues({
        defaults: [literalTypeDefault("link")],
        fields: [createField("label", "text")],
        formData: linkFormData,
        union: blockUnion,
      }),
    ).toEqual({
      label: "Internal docs",
      linkTargetMode: "internal",
      linkTargetBlock: "docs",
      icon: "book",
      type: "link",
    });

    const placementFormData = new FormData();
    placementFormData.set("block", "hero");
    placementFormData.set("label", "Hero");

    expect(
      resolveGeneratedCreateValues({
        defaults: [
          {
            fieldName: "parent",
            field: fields.parent,
            value: { kind: "context", name: "block" },
          },
        ],
        fields: [createField("block", "reference"), createField("label", "text")],
        formData: placementFormData,
        queryContext: { today: "2026-05-27", values: { block: "home" } },
      }),
    ).toEqual({
      block: "hero",
      label: "Hero",
      parent: "home",
    });
  });
});

function fieldNames(fields: CreateFieldConfig[]) {
  return fields.map((field) => field.fieldName);
}

function createField(fieldName: keyof typeof fields, editor: CreateFieldConfig["editor"]) {
  return {
    fieldName,
    field: fields[fieldName],
    editor,
  } satisfies CreateFieldConfig;
}

function literalTypeDefault(value: "page" | "link") {
  return {
    fieldName: "type",
    field: fields.type,
    value: { kind: "literal", value },
  } satisfies CreateDefaultConfig;
}

const fields = {
  type: {
    type: "enum",
    required: true,
    values: {
      page: { label: "Page" },
      link: { label: "Link" },
    },
  },
  label: { type: "text", required: true },
  href: { type: "text", required: false, format: "href" },
  icon: { type: "text", required: false, format: "icon" },
  linkTargetMode: {
    type: "enum",
    required: false,
    values: {
      internal: { label: "Internal" },
      external: { label: "External" },
    },
  },
  linkTargetBlock: {
    type: "reference",
    required: false,
    to: "block",
    displayField: "label",
  },
  parent: {
    type: "reference",
    required: true,
    to: "block",
  },
  block: {
    type: "reference",
    required: true,
    to: "block",
  },
} satisfies Record<string, FieldSchema>;

const pageVariant = {
  label: "Page",
  fields: ["href", "icon"],
} satisfies EntityUnionVariantSchema;

const linkVariant = {
  label: "Link",
  fields: ["linkTargetMode", "linkTargetBlock", "href", "icon"],
} satisfies EntityUnionVariantSchema;

const blockUnion = {
  unionName: "blockByType",
  union: {
    entity: "block",
    discriminator: "type",
    variants: {
      page: pageVariant,
      link: linkVariant,
    },
  },
  discriminatorFieldName: "type",
  discriminatorField: fields.type,
  variants: [
    {
      variantValue: "page",
      label: "Page",
      unionVariant: pageVariant,
      presentation: {
        type: "fields",
        fields: [createField("href", "href"), createField("icon", "icon")],
      },
    },
    {
      variantValue: "link",
      label: "Link",
      unionVariant: linkVariant,
      presentation: {
        type: "fields",
        fields: [
          createField("linkTargetMode", "enum"),
          {
            ...createField("linkTargetBlock", "reference"),
            visibleWhen: { field: "linkTargetMode", values: ["internal"] },
          },
          {
            ...createField("href", "href"),
            visibleWhen: { field: "linkTargetMode", values: ["", "external"] },
          },
          createField("icon", "icon"),
        ],
      },
    },
  ],
} satisfies CreateUnionPresentationConfig;
