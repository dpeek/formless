import { describe, expect, it } from "vite-plus/test";

import { ColorField } from "./color-field.js";

describe("color field", () => {
  it("exports the source color field primitive boundary", () => {
    expect(ColorField).toBeTypeOf("function");
  });
});
