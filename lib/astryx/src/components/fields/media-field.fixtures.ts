import {
  composeScenarioAxis,
  projectScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type {
  FieldScenarioGroup,
  FieldScenarioProjectionContext,
} from "../field-scenario-model.ts";
import type { FormlessUiFieldSurface } from "../../formless-ui-contract.ts";
import {
  createField,
  displayField,
  draftInput,
  mediaAssetOptions,
  recordDrafts,
  recordField,
  textControl,
} from "./fixture-helpers.ts";

const mediaPreviewUrl = publicMediaFixtureUrl("01");
const missingMediaId = "media-missing-hero";
const mediaAccept = "image/jpeg,image/png,image/webp,image/gif";
const mediaMaxSize = 5 * 1024 * 1024;

const mediaField = { type: "text", required: true, label: "Hero Media" } as const;
const optionalMediaField = { ...mediaField, required: false } as const;

const mediaOptions = [
  ...Array.from({ length: 20 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");

    return {
      id: index === 0 ? "media-homepage-hero" : `media-library-${number}`,
      label: `Media fixture ${number}`,
      href: publicMediaFixtureUrl(number),
      width: 240,
      height: 180,
    };
  }),
  {
    id: missingMediaId,
    label: missingMediaId,
    href: "",
    missing: true,
  },
] as const;

function publicMediaFixtureUrl(seed: string) {
  return `https://picsum.photos/seed/formless-media-${seed}/240/180`;
}

const requirednessAxis = composeScenarioAxis("requiredness", "Requiredness", [
  scenarioOption("required", "Required"),
  scenarioOption("optional", "Optional"),
]);
const mediaCreateValueAxis = composeScenarioAxis("value", "Value", [
  scenarioOption("selected", "Selected Asset"),
  scenarioOption("unset", "Unset"),
]);
const mediaValueAxis = composeScenarioAxis("value", "Value", [
  scenarioOption("selected", "Selected Asset"),
  scenarioOption("missing", "Missing Asset"),
  scenarioOption("unset", "Unset"),
]);
const modeAxis = composeScenarioAxis("mode", "Mode", [
  scenarioOption("editor", "Editor"),
  scenarioOption("display", "Display"),
]);
const runtimeAxis = composeScenarioAxis("runtime", "Runtime", [
  scenarioOption("ready", "Ready"),
  scenarioOption("uploading", "Uploading"),
]);

export const mediaScenarioGroups = [
  createMediaGroup(),
  projectScenarioGroup({
    id: "media-record",
    kind: "media",
    axes: [modeAxis, requirednessAxis, mediaValueAxis, runtimeAxis],
    include: mediaRecordCombinationIsValid,
    projectField: (context) => projectExistingMediaField("record", context),
  }),
  existingMediaGroup("table-cell"),
  existingMediaGroup("detail"),
] satisfies readonly FieldScenarioGroup[];

function createMediaGroup() {
  return projectScenarioGroup({
    id: "media-create",
    kind: "media",
    axes: [requirednessAxis, mediaCreateValueAxis],
    projectField: projectCreateMediaField,
  });
}

function existingMediaGroup(surface: Extract<FormlessUiFieldSurface, "detail" | "table-cell">) {
  return projectScenarioGroup({
    id: `media-${surface}`,
    kind: "media",
    axes: [modeAxis, requirednessAxis, mediaValueAxis],
    projectField: (context) => projectExistingMediaField(surface, context),
  });
}

function mediaRecordCombinationIsValid({ facets }: FieldScenarioProjectionContext) {
  return facets.runtime === "ready" || (facets.mode === "editor" && facets.value === "selected");
}

function projectCreateMediaField({ facets }: FieldScenarioProjectionContext) {
  const required = facets.requiredness === "required";
  const field = required ? mediaField : optionalMediaField;
  const value = facets.value === "selected" ? "media-homepage-hero" : "";

  return createField({
    fieldName: "heroMediaId",
    field,
    editor: "media",
    control: textControl(field, {
      editor: "media",
      controlKind: "media",
    }),
    draftInput: draftInput(value),
    labelVisibility: "visible",
    media: {
      accept: mediaAccept,
      fileSelectEnabled: true,
      maxSize: mediaMaxSize,
      previewHref: value ? mediaPreviewUrl : undefined,
      selectedAssetId: value || undefined,
      uploadEnabled: true,
      uploadPatchFields: { mediaAssetFieldName: "heroMediaId" },
    },
    options: { mediaAssetOptions: mediaAssetOptions(mediaOptions) },
    occurrence: {
      ownerId: `media-create-${facets.requiredness}-${facets.value}`,
      placementId: "heroMediaId",
    },
    recordId: `media-create-${facets.requiredness}-${facets.value}`,
    value: value || undefined,
  });
}

function projectExistingMediaField(
  surface: Extract<FormlessUiFieldSurface, "detail" | "record" | "table-cell">,
  { facets }: FieldScenarioProjectionContext,
) {
  const required = facets.requiredness === "required";
  const field = required ? mediaField : optionalMediaField;
  const value =
    facets.value === "selected"
      ? "media-homepage-hero"
      : facets.value === "missing"
        ? missingMediaId
        : "";
  const previewHref = facets.value === "selected" ? mediaPreviewUrl : undefined;
  const common = {
    fieldName: "heroMediaId",
    field,
    editor: "media" as const,
    labelVisibility: surface === "detail" ? ("visible" as const) : ("hidden" as const),
    occurrence: {
      ownerId: `media-${surface}-${facets.mode}-${facets.requiredness}-${facets.value}-${facets.runtime ?? "ready"}`,
      placementId: "heroMediaId",
    },
    recordId: `media-${surface}-${facets.mode}-${facets.requiredness}-${facets.value}-${facets.runtime ?? "ready"}`,
    surface,
  };

  return facets.mode === "display"
    ? displayField({
        ...common,
        control: textControl(field, { editor: "media", controlKind: "media" }),
        density: surface === "table-cell" ? "compact" : "default",
        formatting: { displayValue: value },
        media: {
          ...(facets.value === "missing"
            ? {
                missingSelectedAsset: {
                  assetId: missingMediaId,
                  reason: "Media asset is unavailable.",
                },
              }
            : {}),
          previewHref,
          selectedAssetId: value || undefined,
        },
        options: { mediaAssetOptions: mediaAssetOptions(mediaOptions) },
        value: value || undefined,
      })
    : recordField({
        ...common,
        control: textControl(field, { editor: "media", controlKind: "media" }),
        commit: "field-commit",
        density: surface === "table-cell" ? "compact" : "default",
        drafts: recordDrafts({ recordValue: value || undefined }),
        formatting: { displayValue: value },
        media: {
          accept: mediaAccept,
          fileSelectEnabled: true,
          maxSize: mediaMaxSize,
          mediaPreviewHref: previewHref,
          ...(facets.value === "missing"
            ? {
                missingSelectedAsset: {
                  assetId: missingMediaId,
                  reason: "Media asset is unavailable.",
                },
              }
            : {}),
          previewHref,
          selectedAssetId: value || undefined,
          uploadEnabled: true,
          uploadPatchFields: { mediaAssetFieldName: "heroMediaId" },
        },
        options: { mediaAssetOptions: mediaAssetOptions(mediaOptions) },
        pending:
          facets.runtime === "uploading" ? { isPending: true, label: "Uploading" } : undefined,
        rendererKind: "media",
      });
}
