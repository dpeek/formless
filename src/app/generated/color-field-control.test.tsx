import { describe, expect, it } from "vite-plus/test";

import { renderToStaticMarkup } from "react-dom/server";

import {
  GeneratedColorInput,
  generatedColorSchema,
  parseGeneratedColor,
} from "./color-field-control.tsx";

describe("color input", () => {
  it("keeps the Formless hex parsing contract", () => {
    expect(parseGeneratedColor("#abc")).toBe("#ABC");
    expect(parseGeneratedColor("#abcd")).toBe("#ABCD");
    expect(parseGeneratedColor("#aabbcc")).toBe("#AABBCC");
    expect(parseGeneratedColor("#aabbccdd")).toBe("#AABBCCDD");
    expect(generatedColorSchema.parse("#123456")).toBe("#123456");

    expect(() => parseGeneratedColor("red")).toThrow("Color must be a valid hex color");
    expect(() => parseGeneratedColor("#ggg")).toThrow("Color must be a valid hex color");
  });

  it("renders the text-backed color field with swatch, loading, and disabled state", () => {
    const markup = renderToStaticMarkup(
      <GeneratedColorInput
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
    expect(markup).toContain('data-slot="control"');
    expect(markup).toContain('data-slot="color-swatch"');
    expect(markup).not.toContain('data-slot="input-group"');
  });

  it("keeps alpha-capable manual values when alpha mode is enabled", () => {
    const markup = renderToStaticMarkup(
      <GeneratedColorInput
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
    expect(markup).toContain('data-slot="color-swatch"');
  });
});
