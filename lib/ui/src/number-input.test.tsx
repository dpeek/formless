import { describe, expect, it } from "vite-plus/test";

import { renderToStaticMarkup } from "react-dom/server";

import {
  FormattedNumberInput,
  formattedNumberInputFormValue,
  type FormattedNumberInputDecodeResult,
  type FormattedNumberInputValue,
} from "./number-input.js";

describe("FormattedNumberInput", () => {
  it("renders a text input with a canonical hidden form value", () => {
    const markup = renderToStaticMarkup(
      <FormattedNumberInput
        aria-label="Amount"
        decode={decodeCurrency}
        encode={encodeCurrency}
        name="amount"
        required
        value="$1.2k"
      />,
    );

    expect(markup).toContain('data-web-formatted-number-input="true"');
    expect(markup).toContain('name="amount"');
    expect(markup).toContain('type="hidden"');
    expect(markup).toContain('value="1200"');
    expect(markup).toContain('aria-label="Amount"');
    expect(markup).toContain('type="text"');
    expect(markup).toContain('inputMode="decimal"');
    expect(markup).toContain('required=""');
    expect(markup).toContain('value="$1.2k"');
  });

  it("serializes invalid values predictably for form submission", () => {
    const markup = renderToStaticMarkup(
      <FormattedNumberInput
        aria-label="Amount"
        decode={decodeCurrency}
        encode={encodeCurrency}
        name="amount"
        value="not numeric"
      />,
    );

    expect(markup).toContain('value="NaN"');
    expect(markup).toContain('aria-invalid="true"');
    expect(formattedNumberInputFormValue("not numeric", decodeCurrency)).toBe("NaN");
  });
});

function encodeCurrency(value: FormattedNumberInputValue) {
  return value === "" ? "" : `$${value.toFixed(2)}`;
}

function decodeCurrency(value: string): FormattedNumberInputDecodeResult {
  const input = value.trim();

  if (input === "") {
    return { kind: "valid", value: "" };
  }

  const normalized = input.replace(/[$,]/g, "");
  const match = /^(\d+(?:\.\d+)?)(k)?$/i.exec(normalized);

  if (!match) {
    return { kind: "invalid", message: "Enter a finite number." };
  }

  return {
    kind: "valid",
    value: Number(match[1]) * (match[2] ? 1_000 : 1),
  };
}
