import { describe, expect, it } from "vite-plus/test";
import {
  createDefaultsAreResolved,
  parseCreateViewDefaults,
  resolveCreateValues,
  type CreateDefaultConfig,
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

  it("reports missing context defaults before and during submit shaping", () => {
    const formData = new FormData();
    formData.set("resource", "resource-1");
    formData.set("cost", "325");
    formData.set("price", "475");

    expect(createDefaultsAreResolved(rateCreateDefaults, { today: "2026-05-12" })).toBe(false);
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

const defaultMutations = {
  create: { enabled: true },
  patch: { enabled: true },
  delete: { enabled: false },
} satisfies EntitySchema["mutations"];

const rateEntity = {
  label: "Rate",
  mutations: defaultMutations,
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
  mutations: defaultMutations,
  fields: {
    type: {
      type: "enum",
      required: true,
      values: {
        post: { label: "Post" },
        image: { label: "Image" },
      },
    },
    label: { type: "text", required: true },
    body: { type: "text", required: false },
  },
} satisfies EntitySchema;
