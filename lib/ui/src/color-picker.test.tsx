import { describe, expect, test } from "vite-plus/test";
import { ColorPicker, EyeDropper, parseColor } from "./color-picker.js";

describe("ColorPicker", () => {
  test("exports the source color picker primitive boundary", () => {
    expect(ColorPicker).toBeTypeOf("function");
    expect(EyeDropper).toBeTypeOf("function");
    expect(parseColor).toBeTypeOf("function");
  });
});
