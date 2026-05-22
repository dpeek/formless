import { describe, expect, it } from "vite-plus/test";

import { ColorArea } from "./color-area.js";

describe("color area", () => {
  it("exports the source color area primitive boundary", () => {
    expect(ColorArea).toBeTypeOf("function");
  });
});
