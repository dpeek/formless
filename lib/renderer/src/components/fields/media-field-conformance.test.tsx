import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import type { FieldIntent, FieldSurface } from "@dpeek/formless-presentation/contract";
import { MediaInput, type MediaInputProps } from "../media-input.tsx";
import { FieldRenderer } from "./field-renderer.tsx";
import { MediaFieldEditor } from "./media-field.tsx";
import { mediaScenarioGroups } from "./media-field.fixtures.ts";

vi.mock("@stylexjs/stylex", () => ({
  create: <Styles,>(styles: Styles) => styles,
  createTheme: () => ({}),
  props: () => ({}),
}));

const supportedMediaSurfaces = [
  { groupId: "media-create", surface: "create" },
  { groupId: "media-record", surface: "record" },
  { groupId: "media-table-cell", surface: "table-cell" },
  { groupId: "media-detail", surface: "detail" },
] as const;

describe("Astryx media field conformance", () => {
  it("covers canonical create, record, table, detail, and tree-record contract surfaces", () => {
    expect(mediaScenarioGroups.map(({ id, surface }) => ({ groupId: id, surface }))).toEqual(
      supportedMediaSurfaces,
    );

    const variants = mediaScenarioGroups.flatMap((group) => group.variants);

    expect(new Set(variants.map(({ field }) => field.surface))).toEqual(
      new Set<FieldSurface>(["create", "record", "table-cell", "detail"]),
    );
    expect(variants.some(({ field }) => field.surface === "operation")).toBe(false);

    for (const variant of variants) {
      const { field } = variant;
      const valueFacet = variant.facets.value;

      expect(field.control.controlKind).toBe("media");
      expect(field.options?.mediaAssetOptions?.length).toBeGreaterThan(0);

      if (valueFacet === "selected") {
        expect(field.media).toMatchObject({
          previewHref: expect.stringMatching(/^https:\/\/picsum\.photos\//),
          selectedAssetId: "media-homepage-hero",
        });
      } else if (valueFacet === "missing") {
        expect(field.media).toMatchObject({
          missingSelectedAsset: {
            assetId: "media-missing-hero",
            reason: "Media asset is unavailable.",
          },
          selectedAssetId: "media-missing-hero",
        });
        expect(field.media?.previewHref).toBeUndefined();
      } else {
        expect(field.media?.selectedAssetId).toBeUndefined();
      }

      if (field.mode === "editor") {
        expect(field.media).toMatchObject({
          fileSelectEnabled: true,
          uploadEnabled: true,
          uploadPatchFields: { mediaAssetFieldName: "heroMediaId" },
        });
      } else {
        expect(field.media).not.toHaveProperty("fileSelectEnabled");
        expect(field.media).not.toHaveProperty("uploadEnabled");
      }

      expect(() => renderToStaticMarkup(<FieldRenderer field={field} />)).not.toThrow();
    }
  });

  it("routes canonical asset selection and file selection for every authoring surface", () => {
    for (const expected of supportedMediaSurfaces) {
      const field = requiredSelectedEditor(expected.groupId);
      const intents: FieldIntent[] = [];
      const element = MediaFieldEditor({
        field,
        inputId: `media-${expected.surface}`,
        onIntent: (intent) => {
          intents.push(intent);
        },
      }) as ReactElement<MediaInputProps, typeof MediaInput>;
      const file = new File(["media"], `${expected.surface}.webp`, { type: "image/webp" });

      expect(element.type).toBe(MediaInput);
      expect(element.props).toMatchObject({
        accept: "image/jpeg,image/png,image/webp,image/gif",
        label: "Hero Media",
        maxSize: 5 * 1024 * 1024,
        previewUrl: expect.stringMatching(/^https:\/\/picsum\.photos\//),
        value: "media-homepage-hero",
      });

      element.props.onSelectOption?.("media-library-02");
      element.props.onUploadFile?.(file);

      expect(intents).toEqual([
        expected.surface === "create"
          ? {
              fieldName: "heroMediaId",
              fieldValue: { kind: "input", value: "media-library-02" },
              type: "createDraftChange",
            }
          : {
              assetId: "media-library-02",
              fieldName: "heroMediaId",
              type: "mediaAssetSelect",
            },
        { fieldName: "heroMediaId", file, type: "mediaFileSelect" },
      ]);
    }
  });
});

function requiredSelectedEditor(groupId: string) {
  const group = mediaScenarioGroups.find((candidate) => candidate.id === groupId);
  const field = group?.variants.find(
    ({ facets, field: candidate }) =>
      candidate.mode === "editor" &&
      facets.requiredness === "optional" &&
      facets.runtime !== "uploading" &&
      facets.value === "selected",
  )?.field;

  if (field?.mode !== "editor") {
    throw new Error(`Missing selected ${groupId} media editor fixture.`);
  }

  return field;
}
