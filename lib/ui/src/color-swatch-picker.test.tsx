import { describe, expect, it } from "vite-plus/test";

import { ColorSwatchPicker, ColorSwatchPickerItem } from "./color-swatch-picker.js";

describe("color swatch picker", () => {
  it("exports the source color swatch picker primitive boundary", () => {
    expect(ColorSwatchPicker).toBeTypeOf("function");
    expect(ColorSwatchPickerItem).toBeTypeOf("function");
  });
});
