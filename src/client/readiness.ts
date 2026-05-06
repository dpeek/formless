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

  if (record.entity === "block") {
    return getBlockWarnings(record);
  }

  if (record.entity === "blockPlacement") {
    return getBlockPlacementWarnings(record, recordsById);
  }

  return [];
}

function getBlockWarnings(record: StoredRecord): RecordReadinessWarning[] {
  const type = stringValue(record, "type");
  const status = stringValue(record, "status");
  const warnings: RecordReadinessWarning[] = [];

  if (status === "published" && ["page", "post", "project"].includes(type)) {
    if (!hasTextValue(record, "slug") && !hasTextValue(record, "href")) {
      warnings.push({
        code: "published-block-route",
        message: `Published ${type} block should have a slug or link.`,
      });
    }

    if (type === "post") {
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

    if (type === "project" && !hasTextValue(record, "subtitle") && !hasTextValue(record, "body")) {
      warnings.push({
        code: "published-project-summary",
        message: "Published project should include a summary or body.",
      });
    }
  }

  if (["image", "video"].includes(type) && !hasTextValue(record, "alt")) {
    warnings.push({
      code: "block-media-alt",
      message: "Media block should include alt text.",
    });
  }

  if (["contentList", "contentGrid"].includes(type) && !hasTextValue(record, "templateKey")) {
    warnings.push({
      code: `block-${type}-query`,
      message: `${blockTypeLabel(type)} block should include a query key.`,
    });
  }

  return warnings;
}

function getBlockPlacementWarnings(
  record: StoredRecord,
  recordsById: Record<string, StoredRecord>,
): RecordReadinessWarning[] {
  if (record.values.visible === false) {
    return [];
  }

  const warnings: RecordReadinessWarning[] = [];

  warnWhenMissingReference(warnings, record, recordsById, "block", "block", {
    code: "placement-block-child",
    message: "Visible placement should point to a child block.",
  });

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

function blockTypeLabel(type: string) {
  if (type === "contentList") {
    return "Content list";
  }

  if (type === "contentGrid") {
    return "Content grid";
  }

  return type.charAt(0).toUpperCase() + type.slice(1);
}
