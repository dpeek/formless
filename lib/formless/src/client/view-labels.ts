import type { FieldSchema } from "@dpeek/formless-schema";

export function fieldLabel(fieldName: string, field: FieldSchema) {
  return field.label ?? humanizeFieldName(fieldName);
}

export function humanizeFieldName(fieldName: string) {
  const withSpaces = fieldName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();

  if (withSpaces === "") {
    return fieldName;
  }

  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1).toLowerCase();
}
