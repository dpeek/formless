import rawSiteSourceSchema from "@dpeek/formless-site-app/schema.json";
import { parseAppSchema } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";

import type { CreateFieldConfig, RecordFieldConfig } from "../../client/views.ts";
import {
  projectGeneratedCreateFormlessUiField,
  projectGeneratedRecordFormlessUiField,
} from "./formless-ui-projection.ts";

const siteSourceSchema = parseAppSchema(rawSiteSourceSchema);

const siteMediaOccurrenceConformance = [
  {
    id: "create-operation",
    schemaPath: "views.blockCreate.variants.image.fields.mediaAssetId",
    surface: "create",
  },
  {
    id: "record",
    schemaPath: "views.blockEdit.variants.image.fields.mediaAssetId",
    surface: "record",
  },
  {
    id: "table",
    schemaPath: "tableViews.blockTable.columns.4",
    surface: "table-cell",
  },
  {
    id: "detail",
    schemaPath: "itemViews.blockRootDetail.variants.image.fields.mediaAssetId",
    surface: "detail",
  },
  {
    id: "tree",
    schemaPath: "itemViews.blockTreeNode.variants.image.fields.mediaAssetId",
    surface: "record",
  },
] as const;

describe("generated media presentation conformance", () => {
  it("covers every canonical live Site media editor occurrence", () => {
    expect(collectMediaEditorPaths(rawSiteSourceSchema)).toEqual(
      siteMediaOccurrenceConformance.map(({ schemaPath }) => schemaPath).sort(),
    );
    expect(siteMediaOccurrenceConformance.map(({ id }) => id)).toEqual([
      "create-operation",
      "record",
      "table",
      "detail",
      "tree",
    ]);
  });

  it("projects every occurrence through the canonical media field contract", () => {
    const mediaField = siteSourceSchema.entities.block?.fields.mediaAssetId;

    if (mediaField?.type !== "text") {
      throw new Error("Missing canonical Site block mediaAssetId text field.");
    }

    const createConfig = {
      editor: "media",
      field: mediaField,
      fieldName: "mediaAssetId",
    } satisfies CreateFieldConfig;
    const recordConfig = {
      commit: "field-commit",
      editor: "media",
      field: mediaField,
      fieldName: "mediaAssetId",
    } satisfies RecordFieldConfig;
    const mediaAssetOptions = [
      {
        height: 630,
        href: "/api/formless/media/media/images/hero.webp",
        id: "hero.webp",
        label: "Hero",
        width: 1200,
      },
    ];
    const projectedById = {
      "create-operation": projectGeneratedCreateFormlessUiField({
        fieldConfig: createConfig,
        mediaAssetOptions,
        occurrence: {
          owner: { kind: "createSurface", surfaceId: "site:block-create" },
          placementId: "mediaAssetId",
        },
        value: "hero.webp",
      }),
      record: projectGeneratedRecordFormlessUiField({
        canPatch: true,
        entityName: "block",
        fieldConfig: recordConfig,
        mediaAssetOptions,
        occurrence: {
          owner: { kind: "listItem", listId: "site:block-list", recordId: "block-image" },
          placementId: "mediaAssetId",
        },
        recordId: "block-image",
        recordValue: "hero.webp",
        schema: siteSourceSchema,
        surface: "record",
      }),
      table: projectGeneratedRecordFormlessUiField({
        canPatch: true,
        density: "compact",
        entityName: "block",
        fieldConfig: recordConfig,
        mediaAssetOptions,
        occurrence: {
          owner: { cellId: "block-image", kind: "tableCell", tableId: "site:block-table" },
          placementId: "mediaAssetId",
        },
        recordId: "block-image",
        recordValue: "hero.webp",
        schema: siteSourceSchema,
        surface: "table-cell",
      }),
      detail: projectGeneratedRecordFormlessUiField({
        canPatch: true,
        entityName: "block",
        fieldConfig: recordConfig,
        mediaAssetOptions,
        occurrence: {
          owner: {
            kind: "recordResult",
            recordId: "block-image",
            resultId: "site:block-detail",
          },
          placementId: "mediaAssetId",
        },
        recordId: "block-image",
        recordValue: "hero.webp",
        schema: siteSourceSchema,
        showLabel: true,
        surface: "detail",
      }),
      tree: projectGeneratedRecordFormlessUiField({
        canPatch: true,
        entityName: "block",
        fieldConfig: recordConfig,
        mediaAssetOptions,
        occurrence: {
          owner: {
            kind: "recordResult",
            recordId: "block-image",
            resultId: "site:block-tree:child-fields",
          },
          placementId: "mediaAssetId",
        },
        recordId: "block-image",
        recordValue: "hero.webp",
        schema: siteSourceSchema,
        showLabel: true,
        surface: "record",
      }),
    };

    const fieldIds = new Set<string>();

    for (const occurrence of siteMediaOccurrenceConformance) {
      const field = projectedById[occurrence.id];

      if (field.mode !== "editor") {
        throw new Error(`Expected ${occurrence.id} media occurrence to be editable.`);
      }

      fieldIds.add(field.fieldId);

      expect(field).toMatchObject({
        control: { controlKind: "media" },
        media: {
          fileSelectEnabled: true,
          previewHref: mediaAssetOptions[0]!.href,
          selectedAssetId: "hero.webp",
          uploadEnabled: true,
        },
        mode: "editor",
        options: { mediaAssetOptions },
        surface: occurrence.surface,
      });
      expect(field.media?.uploadPatchFields).toMatchObject({
        mediaAssetFieldName: "mediaAssetId",
      });

      if (occurrence.id !== "create-operation") {
        expect(field.media?.uploadPatchFields).toMatchObject({
          heightFieldName: "height",
          widthFieldName: "width",
        });
      }
    }

    expect(fieldIds.size).toBe(siteMediaOccurrenceConformance.length);
  });
});

function collectMediaEditorPaths(value: unknown, path: readonly string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      collectMediaEditorPaths(entry, [...path, String(index)]),
    );
  }

  if (typeof value !== "object" || value === null) {
    return [];
  }

  const record = value as Record<string, unknown>;
  const current = record.editor === "media" ? [path.join(".")] : [];

  return [
    ...current,
    ...Object.entries(record).flatMap(([key, entry]) =>
      collectMediaEditorPaths(entry, [...path, key]),
    ),
  ];
}
