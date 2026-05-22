import { describe, expect, it } from "vite-plus/test";

import { renderToStaticMarkup } from "react-dom/server";

import * as fieldModule from "./field.js";
import { Description, FieldError, FieldGroup, Fieldset, Label, Legend } from "./field.js";
import { Input } from "./input.js";
import { TextField } from "./text-field.js";

describe("field primitives", () => {
  it("renders the IntentUI-shaped field exports", () => {
    const markup = renderToStaticMarkup(
      <Fieldset>
        <Legend>Profile</Legend>
        <FieldGroup>
          <TextField isInvalid name="name">
            <Label>Name</Label>
            <Input />
            <Description>Required</Description>
            <FieldError>Name is required</FieldError>
          </TextField>
        </FieldGroup>
      </Fieldset>,
    );

    expect(markup).toContain('data-slot="legend"');
    expect(markup).toContain('data-slot="control"');
    expect(markup).toContain('data-slot="label"');
    expect(markup).toContain('name="name"');
    expect(markup).toContain('slot="description"');
    expect(markup).toContain('slot="errorMessage"');
    expect(markup).toContain("Name is required");
  });

  it("does not expose the old generic field wrapper exports", () => {
    expect("Field" in fieldModule).toBe(false);
    expect("FieldContent" in fieldModule).toBe(false);
    expect("FieldDescription" in fieldModule).toBe(false);
    expect("FieldLabel" in fieldModule).toBe(false);
    expect("FieldLegend" in fieldModule).toBe(false);
    expect("FieldSeparator" in fieldModule).toBe(false);
    expect("FieldSet" in fieldModule).toBe(false);
    expect("FieldTitle" in fieldModule).toBe(false);
  });
});
