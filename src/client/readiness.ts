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
  const warnings: RecordReadinessWarning[] = [];

  if (["page", "post", "project"].includes(type) && !hasTextValue(record, "href")) {
    warnings.push({
      code: "block-route",
      message: `${blockTypeLabel(type)} block should have a link.`,
    });
  }

  if (type === "post" && !hasTextValue(record, "body")) {
    warnings.push({
      code: "post-body",
      message: "Post block should include body content.",
    });
  }

  if (type === "project" && !hasTextValue(record, "body")) {
    warnings.push({
      code: "project-summary",
      message: "Project block should include body content.",
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
  const warnings: RecordReadinessWarning[] = [];

  warnWhenMissingReference(warnings, record, recordsById, "block", "block", {
    code: "placement-block-child",
    message: "Placement should point to a live child block.",
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
