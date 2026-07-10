import {
  composeScenarioAxis,
  composeScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type { FieldScenarioGroup } from "../field-scenario-model.ts";
import {
  createField,
  draftInput,
  mediaAssetOptions,
  recordDrafts,
  recordField,
  textControl,
} from "./fixture-helpers.ts";

const mediaPreviewUrls = {
  homepagePreview: "https://picsum.photos/seed/formless-homepage-preview/960/540",
  homepageHero: "https://picsum.photos/seed/formless-homepage-hero/1280/720",
  productDetail: "https://picsum.photos/seed/formless-product-detail/960/540",
};

const imageOptions = [
  {
    id: "image-homepage-preview",
    label: "Homepage",
    href: mediaPreviewUrls.homepagePreview,
    width: 960,
    height: 540,
  },
  {
    id: "image-product-detail",
    label: "Detail",
    href: mediaPreviewUrls.productDetail,
    width: 960,
    height: 540,
  },
] as const;

const mediaOptions = [
  {
    id: "media-homepage-hero",
    label: "Hero",
    href: mediaPreviewUrls.homepageHero,
    width: 1280,
    height: 720,
  },
  ...imageOptions,
] as const;

const imageField = {
  type: "text",
  required: false,
  label: "Hero Image",
} as const;

const mediaField = {
  type: "text",
  required: false,
  label: "Hero Media",
} as const;

const imageCreateBase = createField({
  fieldName: "heroImageId",
  field: imageField,
  editor: "image",
  control: textControl(imageField, { editor: "image", controlKind: "image" }),
  draftInput: draftInput("image-homepage-preview"),
  options: { mediaAssetOptions: mediaAssetOptions(imageOptions) },
  recordId: "create-image",
  value: "image-homepage-preview",
});

const mediaRecordBase = recordField({
  fieldName: "heroMediaId",
  field: mediaField,
  editor: "media",
  control: textControl(mediaField, { editor: "media", controlKind: "media" }),
  commit: "field-commit",
  drafts: recordDrafts({ recordValue: "media-homepage-hero" }),
  formatting: { displayValue: "media-homepage-hero" },
  media: {
    mediaEditorMode: "asset",
    mediaPreviewHref: mediaPreviewUrls.homepageHero,
    uploadEnabled: true,
    uploadPatchFields: { mediaAssetFieldName: "heroMediaId" },
  },
  options: { mediaAssetOptions: mediaAssetOptions(mediaOptions) },
  recordId: "record-media",
  rendererKind: "media",
});

export const mediaScenarioGroups = [
  composeScenarioGroup({
    id: "image-create",
    kind: "image",
    surface: "create",
    base: imageCreateBase,
    axes: [
      composeScenarioAxis("state", "State", [
        scenarioOption("asset", "Asset"),
        scenarioOption("pending", "Pending", {
          pending: { isPending: true, label: "Uploading" },
          recordId: "create-image-pending",
        }),
      ]),
    ],
  }),
  composeScenarioGroup({
    id: "media-record",
    kind: "media",
    surface: "record",
    base: mediaRecordBase,
    axes: [composeScenarioAxis("state", "State", [scenarioOption("asset", "Asset")])],
  }),
] satisfies readonly FieldScenarioGroup[];
