import { describe, expect, it } from "vite-plus/test";

import { renderToStaticMarkup } from "react-dom/server";

import { Description, FieldError, FieldGroup, Fieldset, Label, Legend } from "./field.js";

describe("field primitives", () => {
  it("renders the IntentUI-shaped field exports", () => {
    const markup = renderToStaticMarkup(
      <Fieldset>
        <Legend>Profile</Legend>
        <FieldGroup>
          <Label htmlFor="name">Name</Label>
          <Description>Required</Description>
          <FieldError>Name is required</FieldError>
        </FieldGroup>
      </Fieldset>,
    );

    expect(markup).toContain('data-slot="legend"');
    expect(markup).toContain('data-slot="control"');
    expect(markup).toContain('data-slot="label"');
    expect(markup).toContain('for="name"');
    expect(markup).toContain('slot="description"');
    expect(markup).toContain('slot="errorMessage"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Name is required");
  });

  it("keeps duplicate manual errors collapsed while generated fields migrate", () => {
    const markup = renderToStaticMarkup(
      <FieldError errors={[{ message: "Required" }, { message: "Required" }]} />,
    );

    expect(markup.match(/Required/g)?.length).toBe(1);
  });
});
