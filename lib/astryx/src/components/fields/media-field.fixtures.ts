import {
  composeScenarioAxis,
  projectScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type {
  FieldKindKey,
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
const imageUrl = publicMediaFixtureUrl("02");
const missingMediaId = "media-missing-hero";
const mediaAccept = "image/jpeg,image/png,image/webp,image/gif";
const mediaMaxSize = 5 * 1024 * 1024;

const imageField = { type: "text", required: true, label: "Hero Image" } as const;
const optionalImageField = { ...imageField, required: false } as const;
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
const imageValueAxis = composeScenarioAxis("value", "Value", [
  scenarioOption("known", "Preview"),
  scenarioOption("unset", "Unset"),
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
  createMediaGroup("image"),
  existingImageGroup("record"),
  existingImageGroup("table-cell"),
  existingImageGroup("detail"),
  createMediaGroup("media"),
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

function createMediaGroup(kind: Extract<FieldKindKey, "image" | "media">) {
  return projectScenarioGroup({
    id: `${kind}-create`,
    kind,
    axes: [requirednessAxis, kind === "image" ? imageValueAxis : mediaCreateValueAxis],
    projectField: (context) => projectCreateMediaField(kind, context),
  });
}

function existingImageGroup(
  surface: Extract<FormlessUiFieldSurface, "detail" | "record" | "table-cell">,
) {
  return projectScenarioGroup({
    id: `image-${surface}`,
    kind: "image",
    axes: [modeAxis, requirednessAxis, imageValueAxis],
    projectField: (context) => projectExistingImageField(surface, context),
  });
}

function existingMediaGroup(
  surface: Extract<FormlessUiFieldSurface, "detail" | "table-cell">,
) {
  return projectScenarioGroup({
    id: `media-${surface}`,
    kind: "media",
    axes: [modeAxis, requirednessAxis, mediaValueAxis],
    projectField: (context) => projectExistingMediaField(surface, context),
  });
}

function mediaRecordCombinationIsValid({ facets }: FieldScenarioProjectionContext) {
  return (
    facets.runtime === "ready" ||
    (facets.mode === "editor" && facets.value === "selected")
  );
}

function projectCreateMediaField(
  kind: Extract<FieldKindKey, "image" | "media">,
  { facets }: FieldScenarioProjectionContext,
) {
  const required = facets.requiredness === "required";
  const field =
    kind === "image"
      ? required
        ? imageField
        : optionalImageField
      : required
        ? mediaField
        : optionalMediaField;
  const value =
    kind === "image"
      ? facets.value === "known"
        ? imageUrl
        : ""
      : facets.value === "selected"
        ? "media-homepage-hero"
        : "";
  const editor = kind === "image" ? ("image" as const) : ("media" as const);

  return createField({
    fieldName: kind === "image" ? "heroImage" : "heroMediaId",
    field,
    editor,
    control: textControl(field, {
      editor,
      controlKind: kind === "image" ? "image" : "media",
    }),
    draftInput: draftInput(value),
    labelVisibility: "visible",
    media:
      kind === "image"
        ? {
            fileSelectEnabled: false,
            mediaEditorMode: "url",
            previewHref: value || undefined,
            selectedUrl: value || undefined,
            uploadEnabled: false,
            uploadPatchFields: { hrefFieldName: "heroImage" },
          }
        : {
            accept: mediaAccept,
            fileSelectEnabled: true,
            maxSize: mediaMaxSize,
            mediaEditorMode: "asset",
            previewHref: value ? mediaPreviewUrl : undefined,
            selectedAssetId: value || undefined,
            uploadEnabled: true,
            uploadPatchFields: { mediaAssetFieldName: "heroMediaId" },
          },
    options:
      kind === "media" ? { mediaAssetOptions: mediaAssetOptions(mediaOptions) } : undefined,
    recordId: `${kind}-create-${facets.requiredness}-${facets.value}`,
    value: value || undefined,
  });
}

function projectExistingImageField(
  surface: Extract<FormlessUiFieldSurface, "detail" | "record" | "table-cell">,
  { facets }: FieldScenarioProjectionContext,
) {
  const required = facets.requiredness === "required";
  const field = required ? imageField : optionalImageField;
  const value = facets.value === "known" ? imageUrl : "";
  const editorControl = textControl(field, { editor: "image", controlKind: "image" });
  const common = {
    fieldName: "heroImage",
    field,
    editor: "image" as const,
    labelVisibility: surface === "detail" ? ("visible" as const) : ("hidden" as const),
    recordId: `image-${surface}-${facets.mode}-${facets.requiredness}-${facets.value}`,
    surface,
  };

  return facets.mode === "display"
    ? displayField({
        ...common,
        control: textControl(field, { editor: "image", controlKind: "image" }),
        density: surface === "table-cell" ? "compact" : "default",
        formatting: { displayValue: value },
        media: {
          previewHref: value || undefined,
          selectedUrl: value || undefined,
        },
        value: value || undefined,
      })
    : recordField({
        ...common,
        control: editorControl,
        commit: "field-commit",
        density: surface === "table-cell" ? "compact" : "default",
        drafts: recordDrafts({ recordValue: value || undefined }),
        formatting: { displayValue: value },
        media: {
          fileSelectEnabled: false,
          mediaEditorMode: "url",
          previewHref: value || undefined,
          selectedUrl: value || undefined,
          uploadEnabled: false,
          uploadPatchFields: { hrefFieldName: "heroImage" },
        },
        rendererKind: "image",
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
          mediaEditorMode: "asset",
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
          facets.runtime === "uploading"
            ? { isPending: true, label: "Uploading" }
            : undefined,
        rendererKind: "media",
      });
}
