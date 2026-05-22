import { describe, expect, it } from "vite-plus/test";

import { ColorSlider, ColorSliderOutput, ColorSliderTrack } from "./color-slider.js";

describe("color slider", () => {
  it("exports the source color slider primitive boundary", () => {
    expect(ColorSlider).toBeTypeOf("function");
    expect(ColorSliderOutput).toBeTypeOf("function");
    expect(ColorSliderTrack).toBeTypeOf("function");
  });
});
