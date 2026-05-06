import { describe, expect, it } from "vite-plus/test";

import { renderToStaticMarkup } from "react-dom/server";

import type { FormattedNumberInputDecodeResult } from "./number-input.js";
import { ValueUnitInput } from "./value-unit-input.js";

describe("ValueUnitInput", () => {
  it("renders a formatted value editor paired with a unit select", () => {
    const markup = renderToStaticMarkup(
      <ValueUnitInput
        decode={decodeNumber}
        encode={encodeNumber}
        inputRequired
        inputValue="1.2k"
        label="Cost"
        options={[
          { value: "hour", label: "Hour" },
          { value: "day", label: "Day" },
        ]}
        unit="day"
        unitRequired
      />,
    );

    expect(markup).toContain('data-web-value-unit-input="true"');
    expect(markup).toContain('data-web-formatted-number-input="true"');
    expect(markup).toContain('aria-label="Cost"');
    expect(markup).toContain('aria-label="Cost unit"');
    expect(markup).toContain('value="1.2k"');
    expect(markup).toContain("<select");
    expect(markup).toContain('value="day" selected=""');
    expect(markup).toContain("Hour");
    expect(markup).toContain("Day");
  });
});

function encodeNumber(value: number | "") {
  return value === "" ? "" : String(value);
}

function decodeNumber(value: string): FormattedNumberInputDecodeResult {
  const input = value.trim();

  if (input === "") {
    return { kind: "valid", value: "" };
  }

  const match = /^(\d+(?:\.\d+)?)(k)?$/i.exec(input);

  if (!match) {
    return { kind: "invalid", message: "Enter a finite number." };
  }

  return {
    kind: "valid",
    value: Number(match[1]) * (match[2] ? 1_000 : 1),
  };
}
