import { describe, expect, it } from "vite-plus/test";

import { renderToStaticMarkup } from "react-dom/server";

import { ColorSwatch } from "./color-swatch.js";

describe("color swatch", () => {
  it("renders the source color swatch primitive slot and label", () => {
    const markup = renderToStaticMarkup(<ColorSwatch aria-label="Accent color" color="#336699" />);

    expect(markup).toContain('data-slot="color-swatch"');
    expect(markup).toContain("Accent color");
  });
});
