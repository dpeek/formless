import { getFieldTypeBehavior, isFieldCommitPolicy, isFieldEditor } from "./field-types.ts";
import type { FieldCommitPolicy, FieldEditor, FieldSchema } from "./schema-types.ts";

export function parseFieldEditor(context: string, value: unknown, field: FieldSchema): FieldEditor {
  if (!isFieldEditor(value)) {
    throw new Error(`${context} has unsupported editor "${String(value)}".`);
  }

  if (!getFieldTypeBehavior(field).editors.includes(value)) {
    throw new Error(`${context} editor must match field type "${field.type}".`);
  }

  return value;
}

export function parseFieldCommitPolicy(
  context: string,
  value: unknown,
  field: FieldSchema,
): FieldCommitPolicy {
  if (!isFieldCommitPolicy(value)) {
    throw new Error(`${context} has unsupported commit policy "${String(value)}".`);
  }

  const defaultCommit = getFieldTypeBehavior(field).defaultCommit;
  if (value !== defaultCommit) {
    const requirement =
      defaultCommit === "immediate" ? "must commit immediately" : "must use field-commit";
    throw new Error(`${context} ${field.type} fields ${requirement}.`);
  }

  return value;
}
