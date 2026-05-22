import { describe, expect, it } from "vite-plus/test";

import { renderToStaticMarkup } from "react-dom/server";

import { FieldError, Label } from "./field.js";
import { Input } from "./input.js";
import { TextField } from "./text-field.js";
import { Textarea } from "./textarea.js";

describe("TextField", () => {
  it("renders label and input inside the React Aria text field root", () => {
    const markup = renderToStaticMarkup(
      <TextField defaultValue="Draft" isInvalid isRequired name="title">
        <Label>Title</Label>
        <Input />
        <FieldError>Title is required</FieldError>
      </TextField>,
    );

    expect(markup).toContain('data-slot="control"');
    expect(markup).toContain('data-slot="label"');
    expect(markup).toContain('name="title"');
    expect(markup).toContain('value="Draft"');
    expect(markup).toContain('slot="errorMessage"');
    expect(markup).toContain("Title is required");
  });

  it("renders textarea controls through the same field root", () => {
    const markup = renderToStaticMarkup(
      <TextField defaultValue="Long note" name="summary">
        <Label>Summary</Label>
        <Textarea />
      </TextField>,
    );

    expect(markup).toContain('data-slot="label"');
    expect(markup).toContain('name="summary"');
    expect(markup).toContain(">Long note</textarea>");
  });
});
