import { describe, expect, it } from "vite-plus/test";

import { renderToStaticMarkup } from "react-dom/server";

import { AutosizeTextInput } from "./text-input.js";

describe("AutosizeTextInput", () => {
  it("renders a text-like input with an invisible autosize sizer", () => {
    const markup = renderToStaticMarkup(
      <AutosizeTextInput aria-label="Title" placeholder="Title" required value="Plain title" />,
    );

    expect(markup).toContain('data-web-autosize-text-input="true"');
    expect(markup).toContain('data-slot="autosize-text-input-sizer"');
    expect(markup).toContain("Plain title");
    expect(markup).toContain('aria-label="Title"');
    expect(markup).toContain('type="text"');
    expect(markup).toContain('required=""');
    expect(markup).toContain('value="Plain title"');
    expect(markup).toContain('autoComplete="off"');
  });

  it("uses placeholder text to size empty values", () => {
    const markup = renderToStaticMarkup(
      <AutosizeTextInput aria-label="Name" placeholder="Name" value="" />,
    );

    expect(markup).toContain('data-slot="autosize-text-input-sizer"');
    expect(markup).toContain(">Name</span>");
    expect(markup).toContain('placeholder="Name"');
    expect(markup).toContain('value=""');
  });
});
