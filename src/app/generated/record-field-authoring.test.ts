import { describe, expect, it } from "vite-plus/test";
import type { RecordFieldConfig } from "../../client/views.ts";
import type { AppSchema, FieldSchema } from "../../shared/schema.ts";
import {
  fieldValueToRecordFieldEditorInputValue,
  imageMediaAssetOptionFromUpload,
  selectGeneratedIconDialogDraft,
  selectGeneratedRecordFieldDraftValues,
  selectGeneratedRecordFieldEditability,
  selectGeneratedRecordFieldMediaAuthoring,
  selectGeneratedRecordFieldPatchValues,
  siteImageUploadPatchValues,
  selectValueUnitRecordPatchValues,
  upsertMediaAssetOption,
} from "./record-field-authoring.ts";

describe("generated record field authoring", () => {
  it("selects inline draft values from record fields and value/unit companion fields", () => {
    expect(
      selectGeneratedRecordFieldDraftValues({
        fieldConfig: costFieldConfig,
        numberFormat: "currency",
        recordValue: 12.5,
        unitRecordValue: "hour",
      }),
    ).toEqual({
      draft: "$12.50",
      unitDraft: "hour",
    });
    expect(fieldValueToRecordFieldEditorInputValue(numberField, 0.25, "percent")).toBe("25%");
    expect(fieldValueToRecordFieldEditorInputValue(textField, undefined, "plain")).toBe("");
  });

  it("diffs commit patch values without writing unchanged or blank absent values", () => {
    expect(
      selectGeneratedRecordFieldPatchValues({
        currentValues: {
          done: true,
          title: "Existing",
        },
        values: {
          done: false,
          missingText: "",
          title: "Existing",
        },
      }),
    ).toEqual({
      done: false,
    });
  });

  it("keeps icon dialog draft transitions explicit", () => {
    expect(
      selectGeneratedIconDialogDraft({
        draft: "<svg />",
        open: true,
        recordDraft: "",
      }),
    ).toBe("<svg />");
    expect(
      selectGeneratedIconDialogDraft({
        draft: "<svg />",
        open: false,
        recordDraft: "<svg data-record />",
      }),
    ).toBe("<svg data-record />");
  });

  it("selects media asset authoring facts and flat upload patch fields", () => {
    const authoring = selectGeneratedRecordFieldMediaAuthoring({
      draft: "hero.webp",
      entityName: "block",
      fieldConfig: mediaAssetFieldConfig,
      mediaAssetOptions: [{ href: "/media/hero.webp", id: "hero.webp", label: "Hero" }],
      schema: blockSchema,
    });

    expect(authoring).toEqual({
      mediaEditorMode: "asset",
      mediaPreviewHref: "/media/hero.webp",
      uploadEnabled: true,
      uploadPatchFields: {
        heightFieldName: "height",
        mediaAssetFieldName: "mediaAsset",
        widthFieldName: "width",
      },
    });
    expect(
      siteImageUploadPatchValues({
        ...authoring.uploadPatchFields,
        upload: {
          assetId: "uploaded.webp",
          contentType: "image/webp",
          dimensions: { height: 300, width: 400 },
          href: "/api/formless/media/media/images/uploaded.webp",
          key: "media/images/uploaded.webp",
          size: 10,
        },
      }),
    ).toEqual({
      height: 300,
      mediaAsset: "uploaded.webp",
      width: 400,
    });

    expect(
      selectGeneratedRecordFieldMediaAuthoring({
        draft: "/manual.webp",
        entityName: "block",
        fieldConfig: hrefMediaFieldConfig,
        mediaAssetOptions: [],
        schema: blockSchema,
      }),
    ).toEqual({
      mediaEditorMode: "url",
      mediaPreviewHref: undefined,
      uploadEnabled: false,
      uploadPatchFields: {},
    });
  });

  it("builds uploaded media asset options and keeps selector options sorted", () => {
    const uploadedOption = imageMediaAssetOptionFromUpload({
      asset: {
        byteSize: 10,
        contentType: "image/webp",
        deliveryHref: "/api/formless/media/media/images/uploaded.webp",
        height: 350,
        id: "uploaded.webp",
        kind: "image",
        label: "Uploaded",
        provider: "r2",
        status: "ready",
        storageKey: "media/images/uploaded.webp",
      },
      assetId: "uploaded.webp",
      contentType: "image/webp",
      dimensions: { height: 300, width: 400 },
      href: "/fallback.webp",
      key: "media/images/uploaded.webp",
      size: 10,
    });

    expect(uploadedOption).toEqual({
      height: 350,
      href: "/api/formless/media/media/images/uploaded.webp",
      id: "uploaded.webp",
      label: "Uploaded",
      width: 400,
    });
    expect(
      upsertMediaAssetOption(
        [
          { href: "/z.webp", id: "z.webp", label: "Zed" },
          { href: "/uploaded-old.webp", id: "uploaded.webp", label: "Old" },
        ],
        uploadedOption!,
      ),
    ).toEqual([uploadedOption, { href: "/z.webp", id: "z.webp", label: "Zed" }]);
  });

  it("selects value/unit patch values and leaves invalid amounts out of unit commits", () => {
    expect(
      selectValueUnitRecordPatchValues({
        draft: "$12.50",
        fieldName: "cost",
        numberFormat: "currency",
        unit: "hour",
        valueUnitConfig: costFieldConfig.valueUnit!,
      }),
    ).toEqual({
      cost: 12.5,
      costUnit: "hour",
    });
    expect(
      selectValueUnitRecordPatchValues({
        draft: "not a number",
        fieldName: "cost",
        numberFormat: "currency",
        unit: "day",
        valueUnitConfig: costFieldConfig.valueUnit!,
      }),
    ).toEqual({
      costUnit: "day",
    });
  });

  it("selects editability from patch and pending state", () => {
    expect(
      selectGeneratedRecordFieldEditability({
        canPatch: true,
        isPending: false,
        uploadEnabled: false,
      }),
    ).toEqual({
      canEdit: true,
      controlDisabled: false,
      uploadDisabled: true,
    });
    expect(
      selectGeneratedRecordFieldEditability({
        canPatch: false,
        isPending: false,
        uploadEnabled: true,
      }),
    ).toEqual({
      canEdit: false,
      controlDisabled: true,
      uploadDisabled: true,
    });
  });
});

const numberField = { type: "number", required: false } satisfies FieldSchema;
const textField = { type: "text", required: false } satisfies FieldSchema;
const imageTextField = { type: "text", required: false, format: "href" } satisfies FieldSchema;
const costUnitField = {
  type: "enum",
  required: false,
  values: {
    day: { label: "Day" },
    hour: { label: "Hour" },
  },
} satisfies FieldSchema;

const costFieldConfig = {
  fieldName: "cost",
  field: numberField,
  editor: "number",
  commit: "field-commit",
  format: "currency",
  valueUnit: {
    unitFieldName: "costUnit",
    unitField: costUnitField,
  },
} satisfies RecordFieldConfig;

const mediaAssetFieldConfig = {
  fieldName: "mediaAsset",
  field: imageTextField,
  editor: "media",
  commit: "field-commit",
} satisfies RecordFieldConfig;

const hrefMediaFieldConfig = {
  fieldName: "href",
  field: imageTextField,
  editor: "media",
  commit: "field-commit",
} satisfies RecordFieldConfig;

const blockSchema = {
  version: 1,
  entities: {
    block: {
      fields: {
        height: { type: "number", required: false },
        href: imageTextField,
        mediaAsset: imageTextField,
        width: { type: "number", required: false },
      },
    },
  },
  queries: {},
  itemViews: {},
  tableViews: {},
  views: {},
} as unknown as AppSchema;
