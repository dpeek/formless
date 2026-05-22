import { describe, expect, it } from "vite-plus/test";

import { ColorWheel } from "./color-wheel.js";

describe("color wheel", () => {
  it("exports the source color wheel primitive boundary", () => {
    expect(ColorWheel).toBeTypeOf("function");
  });
});
