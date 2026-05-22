import { describe, expect, it } from "vite-plus/test";

import { renderToStaticMarkup } from "react-dom/server";

import { Checkbox } from "./checkbox.js";

describe("Checkbox", () => {
  it("keeps the checkbox label inside the checkbox root", () => {
    const markup = renderToStaticMarkup(
      <Checkbox defaultSelected isRequired name="done">
        Done
      </Checkbox>,
    );

    expect(markup).toContain('data-slot="control"');
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain('name="done"');
    expect(markup).toContain('data-slot="label"');
    expect(markup).toContain("Done");
  });
});
