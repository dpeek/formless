import { describe, expect, it } from "vite-plus/test";

import { renderToStaticMarkup } from "react-dom/server";

import { ColorInput, colorSchema, parseColor } from "./color.js";

describe("color input", () => {
  it("keeps the Formless hex parsing contract", () => {
    expect(parseColor("#abc")).toBe("#ABC");
    expect(parseColor("#abcd")).toBe("#ABCD");
    expect(parseColor("#aabbcc")).toBe("#AABBCC");
    expect(parseColor("#aabbccdd")).toBe("#AABBCCDD");
    expect(colorSchema.parse("#123456")).toBe("#123456");

    expect(() => parseColor("red")).toThrow("Color must be a valid hex color");
    expect(() => parseColor("#ggg")).toThrow("Color must be a valid hex color");
  });

  it("renders the text-backed color field with swatch, loading, and disabled state", () => {
    const markup = renderToStaticMarkup(
      <ColorInput
        ariaLabel="Accent"
        disabled
        isLoading
        name="accent"
        onBlur={() => undefined}
        onChange={() => undefined}
        value="#336699"
      />,
    );

    expect(markup).toContain('aria-label="Choose Accent"');
    expect(markup).toContain('aria-label="Accent"');
    expect(markup).toContain('data-disabled="true"');
    expect(markup).toContain('name="accent"');
    expect(markup).toContain('placeholder="#FF0000"');
    expect(markup).toContain('value="#336699"');
    expect(markup).toContain("animate-spin");
  });

  it("keeps alpha-capable manual values when alpha mode is enabled", () => {
    const markup = renderToStaticMarkup(
      <ColorInput
        alpha
        ariaLabel="Overlay"
        onBlur={() => undefined}
        onChange={() => undefined}
        value="#33669980"
      />,
    );

    expect(markup).toContain('aria-label="Overlay"');
    expect(markup).toContain('placeholder="#FF0000FF"');
    expect(markup).toContain('value="#33669980"');
    expect(markup).toContain("background-color:#33669980");
  });
});
