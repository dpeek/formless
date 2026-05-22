import { describe, expect, it } from "vite-plus/test";

import { renderToStaticMarkup } from "react-dom/server";

import { Label } from "./field.js";
import { NativeSelect, NativeSelectContent } from "./native-select.js";

describe("NativeSelect", () => {
  it("renders a field root with select content and normal option elements", () => {
    const markup = renderToStaticMarkup(
      <NativeSelect>
        <Label>Priority</Label>
        <NativeSelectContent defaultValue="high" name="priority" required>
          <option value="">None</option>
          <option value="high">High</option>
        </NativeSelectContent>
      </NativeSelect>,
    );

    expect(markup).toContain('data-slot="control"');
    expect(markup).toContain('data-slot="label"');
    expect(markup).toContain('data-slot="select"');
    expect(markup).toContain('name="priority"');
    expect(markup).toContain('value="high" selected=""');
    expect(markup).toContain("<option");
    expect(markup).not.toContain("native-select-option");
  });
});
