import { describe, expect, it } from "vite-plus/test";

import { parseAppSchema, stringifySchema } from "./index.ts";
import { taskSchema } from "./schema-test-fixtures.ts";

describe("schema parsing and formatting", () => {
  it("returns canonical schema data that round-trips through stringify", () => {
    const schema = parseAppSchema(taskSchema());
    const serialized = JSON.parse(stringifySchema(schema));

    expect(serialized).toEqual(schema);
    expect(parseAppSchema(serialized)).toEqual(schema);
  });

  it("rejects unsupported top-level shape before returning a runtime model", () => {
    expect(() => parseAppSchema(null)).toThrow("Schema must be an object.");
    expect(() => parseAppSchema({ ...taskSchema(), version: 2 })).toThrow(
      "Schema version must be 1.",
    );
    expect(() => parseAppSchema({ ...taskSchema(), generatedAt: "now" })).toThrow(
      'Schema has unsupported key "generatedAt".',
    );
  });
});
