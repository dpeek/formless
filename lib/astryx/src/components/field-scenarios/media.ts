import {
  composeScenarioAxis,
  composeScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type { FieldScenarioGroup } from "../field-scenario-model.ts";
import type { AstryxFieldData } from "../../field-contract.ts";
import { imageOptions, mediaOptions, mediaPreviewUrls, publishedPageIconSource } from "./fixtures.ts";

const sourceIconDetailBase = {
  id: "detail-page-icon",
  name: "pageIcon",
  label: "Page Icon",
  surface: "detail",
  density: "balanced",
  accessMode: "read-only",
  kind: "source-icon",
  mode: "display",
  value: "published-page",
  displayValue: "Published page",
  presentation: { sourceIcon: publishedPageIconSource },
} satisfies AstryxFieldData;

const imageCreateBase = {
  id: "create-image",
  name: "heroImageId",
  label: "Hero Image",
  surface: "create",
  density: "balanced",
  accessMode: "editable",
  kind: "image",
  mode: "editor",
  draftValue: "image-homepage-preview",
  committedDisplayValue: "",
  commitPolicy: "submit",
  presentation: {
    accept: "image/*",
    mediaAlt: "Homepage preview",
    mediaPreviewUrl: mediaPreviewUrls.homepagePreview,
  },
  options: imageOptions,
} satisfies AstryxFieldData;

const mediaRecordBase = {
  id: "record-media",
  name: "heroMediaId",
  label: "Hero Media",
  surface: "record",
  density: "balanced",
  accessMode: "editable",
  kind: "media",
  mode: "editor",
  draftValue: "media-homepage-hero",
  committedValue: "media-homepage-hero",
  committedDisplayValue: "media-homepage-hero",
  commitPolicy: "field",
  presentation: {
    accept: "image/*",
    mediaAlt: "Homepage hero",
    mediaPreviewUrl: mediaPreviewUrls.homepageHero,
  },
  options: mediaOptions,
} satisfies AstryxFieldData;

export const mediaScenarioGroups = [
  composeScenarioGroup({
    id: "source-icon-detail",
    kind: "source-icon",
    surface: "detail",
    base: sourceIconDetailBase,
    axes: [
      composeScenarioAxis("state", "State", [
        scenarioOption("source", "Source"),
        scenarioOption("empty", "Empty", {
          id: "detail-empty-icon",
          name: "emptyIcon",
          label: "Empty Icon",
          density: "compact",
          value: "",
          displayValue: "Empty source",
          presentation: { sourceIcon: "" },
        }),
      ]),
    ],
  }),
  composeScenarioGroup({
    id: "image-create",
    kind: "image",
    surface: "create",
    base: imageCreateBase,
    axes: [
      composeScenarioAxis("state", "State", [
        scenarioOption("asset", "Asset"),
        scenarioOption("pending", "Pending", {
          id: "create-image-pending",
          pending: { isPending: true, label: "Uploading" },
        }),
      ]),
    ],
  }),
  composeScenarioGroup({
    id: "media-record",
    kind: "media",
    surface: "record",
    base: mediaRecordBase,
    axes: [
      composeScenarioAxis("state", "State", [
        scenarioOption("asset", "Asset"),
      ]),
    ],
  }),
] satisfies readonly FieldScenarioGroup[];
