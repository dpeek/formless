import { describe, expect, it } from "vite-plus/test";
import {
  createDraftInputFromFormData,
  createDefaultsAreResolved,
  parseCreateViewDefaults,
  resolveCreateDraftValues,
  resolveCreateValues,
  type CreateDraftInput,
  type CreateDefaultConfig,
  type CreateDefaultFieldConfig,
  type CreateDefaultUnionConfig,
} from "./index.ts";
import type { CreateViewFieldSchema, EntitySchema } from "./index.ts";

describe("create defaults primitive", () => {
  it("parses context and literal defaults behind one boundary", () => {
    expect(
      parseCreateViewDefaults(
        "rateCreateForCard",
        "rate",
        {
          card: { kind: "context", name: "card" },
          costUnit: { kind: "literal", value: "day" },
        },
        rateEntity,
        rateCreateFields,
      ),
    ).toEqual({
      card: { kind: "context", name: "card" },
      costUnit: { kind: "literal", value: "day" },
    });
  });

  it("keeps unsupported create default errors source-faithful", () => {
    expect(() =>
      parseCreateViewDefaults(
        "rateCreateForCard",
        "rate",
        { card: { kind: "literal", value: "card-1" } },
        rateEntity,
        rateCreateFields,
      ),
    ).toThrow('Create view "rateCreateForCard" default "card" requires a scalar field.');

    expect(() =>
      parseCreateViewDefaults(
        "rateCreateForCard",
        "rate",
        { costUnit: { kind: "context", name: "card" } },
        rateEntity,
        rateCreateFields,
      ),
    ).toThrow('Create view "rateCreateForCard" default "costUnit" requires a reference field.');
  });

  it("resolves visible values, context defaults, and literal defaults for submit", () => {
    const formData = new FormData();
    formData.set("resource", "resource-1");
    formData.set("cost", "325");
    formData.set("price", "475");

    expect(
      resolveCreateValues({
        formData,
        fields: [
          { fieldName: "resource", field: rateEntity.fields.resource },
          { fieldName: "cost", field: rateEntity.fields.cost },
          { fieldName: "price", field: rateEntity.fields.price },
        ],
        defaults: rateCreateDefaults,
        queryContext: { today: "2026-05-12", values: { card: "card-1" } },
      }),
    ).toEqual({
      resource: "resource-1",
      cost: 325,
      price: 475,
      card: "card-1",
      costUnit: "day",
    });
  });

  it("uses literal defaults when choosing fixed-discriminator create fields", () => {
    const formData = new FormData();
    formData.set("label", "A post");
    formData.set("body", "Post body");

    expect(
      resolveCreateValues({
        formData,
        fields: [{ fieldName: "label", field: blockEntity.fields.label }],
        union: {
          discriminatorFieldName: "type",
          discriminatorField: blockEntity.fields.type,
          variants: [
            {
              variantValue: "post",
              presentation: {
                fields: [{ fieldName: "body", field: blockEntity.fields.body }],
              },
            },
          ],
        },
        defaults: [
          {
            fieldName: "type",
            field: blockEntity.fields.type,
            value: { kind: "literal", value: "post" },
          },
        ],
      }),
    ).toEqual({
      label: "A post",
      body: "Post body",
      type: "post",
    });
  });

  it("resolves typed draft values through union fields, visibility, and defaults", () => {
    const result = resolveCreateDraftValues<CreateDefaultFieldConfig>({
      draft: {
        values: {
          type: { kind: "value", value: "link" },
          label: { kind: "value", value: "Internal docs" },
          body: { kind: "input", value: "## Draft\n\nBody copy." },
          featured: { kind: "value", value: true },
          resource: { kind: "value", value: "resource-1" },
          estimate: { kind: "input", value: "1.2k" },
          linkTargetMode: { kind: "value", value: "internal" },
          linkTargetBlock: { kind: "value", value: "docs" },
          href: { kind: "value", value: "/stale-docs" },
        },
      },
      fields: [
        { fieldName: "type", field: blockEntity.fields.type },
        { fieldName: "label", field: blockEntity.fields.label },
        { fieldName: "body", field: blockEntity.fields.body },
        { fieldName: "featured", field: blockEntity.fields.featured },
        { fieldName: "resource", field: blockEntity.fields.resource },
        { fieldName: "estimate", field: blockEntity.fields.estimate },
      ],
      union: blockUnion,
      defaults: [
        {
          fieldName: "visibility",
          field: blockEntity.fields.visibility,
          value: { kind: "literal", value: "public" },
        },
        {
          fieldName: "parent",
          field: blockEntity.fields.parent,
          value: { kind: "context", name: "block" },
        },
      ],
      queryContext: { today: "2026-05-12", values: { block: "home" } },
    });

    expect(result).toEqual({
      values: {
        type: "link",
        label: "Internal docs",
        body: "## Draft\n\nBody copy.",
        featured: true,
        resource: "resource-1",
        estimate: 1200,
        linkTargetMode: "internal",
        linkTargetBlock: "docs",
        visibility: "public",
        parent: "home",
      },
      fieldErrors: {},
      visibleFields: [
        "type",
        "label",
        "body",
        "featured",
        "resource",
        "estimate",
        "linkTargetMode",
        "linkTargetBlock",
      ],
    });
  });

  it("adapts FormData values into typed draft input before resolving", () => {
    const formData = new FormData();
    formData.set("resource", "resource-1");
    formData.set("cost", "325");
    formData.set("price", "475");

    const draft = createDraftInputFromFormData(formData);

    expect(draft).toEqual({
      values: {
        resource: { kind: "input", value: "resource-1" },
        cost: { kind: "input", value: "325" },
        price: { kind: "input", value: "475" },
      },
    });
    expect(
      resolveCreateDraftValues({
        draft,
        fields: [
          { fieldName: "resource", field: rateEntity.fields.resource },
          { fieldName: "cost", field: rateEntity.fields.cost },
          { fieldName: "price", field: rateEntity.fields.price },
        ],
        defaults: rateCreateDefaults,
        queryContext: { today: "2026-05-12", values: { card: "card-1" } },
      }).values,
    ).toEqual(
      resolveCreateValues({
        formData,
        fields: [
          { fieldName: "resource", field: rateEntity.fields.resource },
          { fieldName: "cost", field: rateEntity.fields.cost },
          { fieldName: "price", field: rateEntity.fields.price },
        ],
        defaults: rateCreateDefaults,
        queryContext: { today: "2026-05-12", values: { card: "card-1" } },
      }),
    );
  });

  it("adapts boolean FormData values with field-aware typed drafts", () => {
    const formData = new FormData();
    formData.append("featured", "false");
    formData.append("featured", "on");

    expect(
      createDraftInputFromFormData(formData, [
        { fieldName: "featured", field: blockEntity.fields.featured },
      ]),
    ).toEqual({
      values: {
        featured: { kind: "value", value: true },
      },
    });

    const falseFormData = new FormData();
    falseFormData.set("featured", "false");

    expect(
      resolveCreateValues({
        formData: falseFormData,
        fields: [{ fieldName: "featured", field: blockEntity.fields.featured }],
      }),
    ).toEqual({
      featured: false,
    });
  });

  it("preserves invalid number drafts as field errors instead of operation input", () => {
    const draft = {
      values: {
        estimate: { kind: "input", value: "many" },
        label: { kind: "value", value: "Sizing" },
      },
    } satisfies CreateDraftInput;

    const result = resolveCreateDraftValues({
      draft,
      fields: [
        { fieldName: "estimate", field: blockEntity.fields.estimate },
        { fieldName: "label", field: blockEntity.fields.label },
      ],
    });

    expect(result.values).toEqual({ label: "Sizing" });
    expect(result.fieldErrors).toEqual({
      estimate: {
        fieldName: "estimate",
        message: "Enter a finite number.",
        draftValue: { kind: "input", value: "many" },
      },
    });

    const formData = new FormData();
    formData.set("estimate", "many");
    expect(() =>
      resolveCreateValues({
        formData,
        fields: [{ fieldName: "estimate", field: blockEntity.fields.estimate }],
      }),
    ).toThrow("Enter a finite number.");
  });

  it("reports missing context defaults before and during submit shaping", () => {
    const formData = new FormData();
    formData.set("resource", "resource-1");
    formData.set("cost", "325");
    formData.set("price", "475");

    expect(createDefaultsAreResolved(rateCreateDefaults, { today: "2026-05-12" })).toBe(false);
    expect(
      resolveCreateDraftValues({
        draft: createDraftInputFromFormData(formData),
        fields: [
          { fieldName: "resource", field: rateEntity.fields.resource },
          { fieldName: "cost", field: rateEntity.fields.cost },
          { fieldName: "price", field: rateEntity.fields.price },
        ],
        defaults: rateCreateDefaults,
        queryContext: { today: "2026-05-12" },
      }).fieldErrors,
    ).toEqual({
      card: {
        fieldName: "card",
        message: 'Create default for "card" requires selected context "card".',
      },
    });
    expect(() =>
      resolveCreateValues({
        formData,
        fields: [
          { fieldName: "resource", field: rateEntity.fields.resource },
          { fieldName: "cost", field: rateEntity.fields.cost },
          { fieldName: "price", field: rateEntity.fields.price },
        ],
        defaults: rateCreateDefaults,
        queryContext: { today: "2026-05-12" },
      }),
    ).toThrow('Create default for "card" requires selected context "card".');
  });
});

const rateEntity = {
  label: "Rate",
  fields: {
    resource: { type: "reference", required: true, to: "resource" },
    card: { type: "reference", required: true, to: "card" },
    cost: { type: "number", required: true, min: 0 },
    costUnit: {
      type: "enum",
      required: true,
      values: {
        hour: { label: "Hour" },
        day: { label: "Day" },
      },
    },
    price: { type: "number", required: true, min: 0 },
  },
} satisfies EntitySchema;

const rateCreateFields = {
  resource: { editor: "reference" },
  cost: { editor: "number" },
  price: { editor: "number" },
} satisfies Record<string, CreateViewFieldSchema>;

const rateCreateDefaults = [
  {
    fieldName: "card",
    field: rateEntity.fields.card,
    value: { kind: "context", name: "card" },
  },
  {
    fieldName: "costUnit",
    field: rateEntity.fields.costUnit,
    value: { kind: "literal", value: "day" },
  },
] satisfies CreateDefaultConfig[];

const blockEntity = {
  label: "Block",
  fields: {
    type: {
      type: "enum",
      required: true,
      values: {
        post: { label: "Post" },
        image: { label: "Image" },
        link: { label: "Link" },
      },
    },
    label: { type: "text", required: true },
    body: { type: "text", required: false },
    featured: { type: "boolean", required: true, default: false },
    resource: { type: "reference", required: true, to: "resource" },
    estimate: { type: "number", required: false, min: 0 },
    linkTargetMode: {
      type: "enum",
      required: false,
      values: {
        internal: { label: "Internal" },
        external: { label: "External" },
      },
    },
    linkTargetBlock: { type: "reference", required: false, to: "block" },
    href: { type: "text", required: false, format: "href" },
    visibility: {
      type: "enum",
      required: true,
      values: {
        public: { label: "Public" },
        private: { label: "Private" },
      },
    },
    parent: { type: "reference", required: false, to: "block" },
  },
} satisfies EntitySchema;

const blockUnion: CreateDefaultUnionConfig<CreateDefaultFieldConfig> = {
  discriminatorFieldName: "type",
  discriminatorField: blockEntity.fields.type,
  variants: [
    {
      variantValue: "link",
      presentation: {
        fields: [
          { fieldName: "linkTargetMode", field: blockEntity.fields.linkTargetMode },
          {
            fieldName: "linkTargetBlock",
            field: blockEntity.fields.linkTargetBlock,
            visibleWhen: { field: "linkTargetMode", values: ["internal"] },
          },
          {
            fieldName: "href",
            field: blockEntity.fields.href,
            visibleWhen: { field: "linkTargetMode", values: ["", "external"] },
          },
        ],
      },
    },
  ],
};
