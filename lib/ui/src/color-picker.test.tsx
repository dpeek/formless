import { describe, expect, test } from "vite-plus/test";
import { ColorPicker, EyeDropper } from "./color-picker.js";

describe("ColorPicker", () => {
  test("exports the source color picker primitive boundary", () => {
    expect(ColorPicker).toBeTypeOf("function");
    expect(EyeDropper).toBeTypeOf("function");
  });
});
