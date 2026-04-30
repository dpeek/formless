import type { FieldValue, StoredRecord } from "./protocol.ts";
import type { EntitySchema, FieldSchema } from "./schema.ts";
import type { QueryOperator } from "./query.ts";

export type SystemFieldName = "id" | "createdAt" | "deletedAt";

export type FieldRef = { kind: "value"; name: string } | { kind: "system"; name: SystemFieldName };

export type AddressableFieldType = "text" | "boolean" | "date" | "id" | "datetime";

export type AddressableField = {
  ref: FieldRef;
  type: AddressableFieldType;
  label: string;
  writable: boolean;
  filterOps: QueryOperator[];
};

const SYSTEM_FIELDS: AddressableField[] = [
  {
    ref: { kind: "system", name: "id" },
    type: "id",
    label: "ID",
    writable: false,
    filterOps: ["eq"],
  },
  {
    ref: { kind: "system", name: "createdAt" },
    type: "datetime",
    label: "Created at",
    writable: false,
    filterOps: ["eq"],
  },
  {
    ref: { kind: "system", name: "deletedAt" },
    type: "datetime",
    label: "Deleted at",
    writable: false,
    filterOps: ["eq"],
  },
];

export function getEntityFieldCatalog(entity: EntitySchema): AddressableField[] {
  return [
    ...Object.entries(entity.fields).map(([fieldName, field]) =>
      valueFieldCatalogEntry(fieldName, field),
    ),
    ...SYSTEM_FIELDS,
  ];
}

export function fieldRefsEqual(left: FieldRef, right: FieldRef) {
  return left.kind === right.kind && left.name === right.name;
}

export function findAddressableField(
  catalog: AddressableField[],
  ref: FieldRef,
): AddressableField | undefined {
  return catalog.find((field) => fieldRefsEqual(field.ref, ref));
}

export function resolveRecordFieldValue(
  record: StoredRecord,
  ref: FieldRef,
): FieldValue | undefined {
  if (ref.kind === "value") {
    return record.values[ref.name];
  }

  if (ref.name === "id") {
    return record.id;
  }

  if (ref.name === "createdAt") {
    return record.createdAt;
  }

  return record.deletedAt;
}

export function isSystemFieldName(value: string): value is SystemFieldName {
  return value === "id" || value === "createdAt" || value === "deletedAt";
}

export function formatFieldRef(ref: FieldRef) {
  return `${ref.kind}.${ref.name}`;
}

function valueFieldCatalogEntry(fieldName: string, field: FieldSchema): AddressableField {
  return {
    ref: { kind: "value", name: fieldName },
    type: field.type,
    label: field.label ?? humanizeFieldName(fieldName),
    writable: true,
    filterOps: ["eq"],
  };
}

function humanizeFieldName(fieldName: string) {
  const withSpaces = fieldName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();

  if (withSpaces === "") {
    return fieldName;
  }

  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1).toLowerCase();
}
