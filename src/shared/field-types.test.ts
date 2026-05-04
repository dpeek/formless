import { describe, expect, it } from "vite-plus/test";
import {
  fieldCreateDefaultValue,
  fieldHasCreateDefault,
  formatFieldDisplayPrimitive,
  getFieldTypeBehavior,
  isValidStoredFieldValue,
  shouldValidateExistingFieldValue,
  validateAuthorityFieldValue,
} from "./field-types.ts";
import type { FieldSchema } from "./schema.ts";

describe("field type behavior", () => {
  it("defines query operators, editors, and default commits for built-in field types", () => {
    expect(
      Object.fromEntries(
        Object.entries(fields).map(([name, field]) => {
          const behavior = getFieldTypeBehavior(field);

          return [
            name,
            {
              filterOps: behavior.filterOps,
              editors: behavior.editors,
              defaultEditor: behavior.defaultEditor,
              defaultCommit: behavior.defaultCommit,
            },
          ];
        }),
      ),
    ).toEqual({
      title: {
        filterOps: ["eq"],
        editors: ["text"],
        defaultEditor: "text",
        defaultCommit: "field-commit",
      },
      done: {
        filterOps: ["eq"],
        editors: ["boolean"],
        defaultEditor: "boolean",
        defaultCommit: "immediate",
      },
      dueDate: {
        filterOps: ["eq", "before"],
        editors: ["date"],
        defaultEditor: "date",
        defaultCommit: "field-commit",
      },
      estimate: {
        filterOps: ["eq"],
        editors: ["number"],
        defaultEditor: "number",
        defaultCommit: "field-commit",
      },
      priority: {
        filterOps: ["eq"],
        editors: ["enum"],
        defaultEditor: "enum",
        defaultCommit: "immediate",
      },
      resource: {
        filterOps: ["eq"],
        editors: ["reference"],
        defaultEditor: "reference",
        defaultCommit: "immediate",
      },
    });
  });

  it("centralizes built-in create defaults", () => {
    expect(fieldHasCreateDefault(fields.done)).toBe(true);
    expect(fieldCreateDefaultValue(fields.done)).toBe(false);
    expect(fieldHasCreateDefault(fields.estimate)).toBe(true);
    expect(fieldCreateDefaultValue(fields.estimate)).toBe(0);
    expect(fieldHasCreateDefault(fields.priority)).toBe(true);
    expect(fieldCreateDefaultValue(fields.priority)).toBe("normal");
    expect(fieldHasCreateDefault(fields.title)).toBe(false);
    expect(fieldHasCreateDefault(fields.resource)).toBe(false);
  });

  it("formats display primitives without React", () => {
    expect(formatFieldDisplayPrimitive(fields.title, "Task")).toBe("Task");
    expect(formatFieldDisplayPrimitive(fields.done, true)).toBe("Yes");
    expect(formatFieldDisplayPrimitive(fields.done, false)).toBe("No");
    expect(formatFieldDisplayPrimitive(fields.estimate, 1.5)).toBe("1.5");
    expect(formatFieldDisplayPrimitive(fields.priority, "high")).toBe("High");
    expect(formatFieldDisplayPrimitive(fields.priority, "stale")).toBe("stale");
    expect(formatFieldDisplayPrimitive(fields.resource, "rec_resource_1")).toBe("rec_resource_1");
  });

  it("validates authority values while preserving current empty and default semantics", () => {
    expect(validateAuthorityFieldValue("done", fields.done, undefined, false)).toEqual({
      kind: "set",
      value: false,
    });
    expect(validateAuthorityFieldValue("estimate", fields.estimate, "", true)).toEqual({
      kind: "omit",
    });
    expect(validateAuthorityFieldValue("estimate", fields.estimate, 0, true)).toEqual({
      kind: "set",
      value: 0,
    });
    expect(validateAuthorityFieldValue("priority", fields.priority, "", true)).toEqual({
      kind: "omit",
    });
    expect(
      validateAuthorityFieldValue("resource", fields.resource, "rec_resource_1", true),
    ).toEqual({
      kind: "set",
      value: "rec_resource_1",
    });

    expect(() => validateAuthorityFieldValue("estimate", fields.estimate, Infinity, true)).toThrow(
      'Field "estimate" must be a finite number.',
    );
    expect(() => validateAuthorityFieldValue("priority", fields.priority, "missing", true)).toThrow(
      'Field "priority" must be a known enum value.',
    );
    expect(() => validateAuthorityFieldValue("resource", fields.resource, 1, true)).toThrow(
      'Field "resource" must be a reference ID.',
    );
  });

  it("validates stored values for schema compatibility checks", () => {
    expect(shouldValidateExistingFieldValue(fields.dueDate)).toBe(false);
    expect(shouldValidateExistingFieldValue(fields.estimate)).toBe(true);
    expect(shouldValidateExistingFieldValue(fields.resource)).toBe(true);
    expect(isValidStoredFieldValue(undefined, fields.done)).toBe(true);
    expect(isValidStoredFieldValue(undefined, fields.title)).toBe(false);
    expect(isValidStoredFieldValue(0, fields.estimate)).toBe(true);
    expect(isValidStoredFieldValue(1.5, fields.estimate)).toBe(false);
    expect(isValidStoredFieldValue("high", fields.priority)).toBe(true);
    expect(isValidStoredFieldValue("", fields.resource)).toBe(false);
  });
});

const fields = {
  title: { type: "text", required: true },
  done: { type: "boolean", required: true, default: false },
  dueDate: { type: "date", required: false },
  estimate: { type: "number", required: false, default: 0, min: 0, integer: true },
  priority: {
    type: "enum",
    required: false,
    default: "normal",
    values: {
      normal: { label: "Normal" },
      high: { label: "High" },
    },
  },
  resource: { type: "reference", required: true, to: "resource", displayField: "name" },
} satisfies Record<string, FieldSchema>;
