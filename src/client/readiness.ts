import type { StoredRecord } from "../shared/protocol.ts";

export type RecordReadinessWarning = {
  code: string;
  message: string;
};

export function getRecordReadinessWarnings(
  record: StoredRecord,
  recordsById: Record<string, StoredRecord> = {},
): RecordReadinessWarning[] {
  if (record.deletedAt) {
    return [];
  }

  if (record.entity === "contentItem") {
    return getContentItemWarnings(record);
  }

  if (record.entity === "mediaAsset") {
    return getMediaAssetWarnings(record);
  }

  if (record.entity === "contentPlacement") {
    return getContentPlacementWarnings(record, recordsById);
  }

  return [];
}

function getContentItemWarnings(record: StoredRecord): RecordReadinessWarning[] {
  const kind = stringValue(record, "kind");
  const status = stringValue(record, "status");

  if (status !== "published" || !["page", "post", "project"].includes(kind)) {
    return [];
  }

  const warnings: RecordReadinessWarning[] = [];

  if (!hasTextValue(record, "slug") && !hasTextValue(record, "href")) {
    warnings.push({
      code: "published-content-route",
      message: `Published ${kind} should have a slug or link.`,
    });
  }

  if (kind === "post") {
    if (!hasTextValue(record, "body")) {
      warnings.push({
        code: "published-post-body",
        message: "Published post should include body content.",
      });
    }

    if (!hasTextValue(record, "publishedAt")) {
      warnings.push({
        code: "published-post-date",
        message: "Published post should have a published date.",
      });
    }
  }

  if (kind === "project" && !hasTextValue(record, "subtitle") && !hasTextValue(record, "body")) {
    warnings.push({
      code: "published-project-summary",
      message: "Published project should include a summary or body.",
    });
  }

  return warnings;
}

function getMediaAssetWarnings(record: StoredRecord): RecordReadinessWarning[] {
  if (hasTextValue(record, "alt")) {
    return [];
  }

  return [
    {
      code: "media-alt",
      message: "Media asset should include alt text.",
    },
  ];
}

function getContentPlacementWarnings(
  record: StoredRecord,
  recordsById: Record<string, StoredRecord>,
): RecordReadinessWarning[] {
  if (record.values.visible === false) {
    return [];
  }

  const kind = stringValue(record, "kind");
  const warnings: RecordReadinessWarning[] = [];

  if (
    kind === "hero" &&
    !hasTextValue(record, "title") &&
    !hasLiveReference(record, "item", recordsById, "contentItem")
  ) {
    warnings.push({
      code: "placement-hero-source",
      message: "Hero placement should point to content or provide a title.",
    });
  }

  if (["header", "footer", "markdown", "link", "contentCard", "cta"].includes(kind)) {
    warnWhenMissingReference(warnings, record, recordsById, "item", "contentItem", {
      code: `placement-${kind}-item`,
      message: `${placementKindLabel(kind)} placement should point to a content item.`,
    });
  }

  if (kind === "media") {
    warnWhenMissingReference(warnings, record, recordsById, "media", "mediaAsset", {
      code: "placement-media-asset",
      message: "Media placement should point to a media asset.",
    });
  }

  if (["contentList", "contentGrid"].includes(kind) && !hasTextValue(record, "queryKey")) {
    warnings.push({
      code: `placement-${kind}-query`,
      message: `${placementKindLabel(kind)} placement should include a query key.`,
    });
  }

  return warnings;
}

function warnWhenMissingReference(
  warnings: RecordReadinessWarning[],
  record: StoredRecord,
  recordsById: Record<string, StoredRecord>,
  fieldName: string,
  entityName: string,
  warning: RecordReadinessWarning,
) {
  if (!hasLiveReference(record, fieldName, recordsById, entityName)) {
    warnings.push(warning);
  }
}

function hasLiveReference(
  record: StoredRecord,
  fieldName: string,
  recordsById: Record<string, StoredRecord>,
  entityName: string,
) {
  const recordId = stringValue(record, fieldName);
  const referencedRecord = recordsById[recordId];

  return referencedRecord?.entity === entityName && !referencedRecord.deletedAt;
}

function hasTextValue(record: StoredRecord, fieldName: string) {
  return stringValue(record, fieldName) !== "";
}

function stringValue(record: StoredRecord, fieldName: string) {
  const value = record.values[fieldName];

  if (typeof value === "string") {
    return value.trim();
  }

  return "";
}

function placementKindLabel(kind: string) {
  if (kind === "contentCard") {
    return "Content card";
  }

  if (kind === "contentList") {
    return "Content list";
  }

  if (kind === "contentGrid") {
    return "Content grid";
  }

  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
