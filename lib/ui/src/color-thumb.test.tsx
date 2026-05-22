import { describe, expect, it } from "vite-plus/test";

import { ColorThumb } from "./color-thumb.js";

describe("color thumb", () => {
  it("exports the source color thumb primitive boundary", () => {
    expect(ColorThumb).toBeTypeOf("function");
  });
});
