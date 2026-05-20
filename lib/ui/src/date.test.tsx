import { describe, expect, it } from "vite-plus/test";

import { renderToStaticMarkup } from "react-dom/server";

import { DateInput, formatDateInputValue, parseDateInputValue } from "./date.js";

describe("DateInput", () => {
  it("formats and parses ISO date input values without UTC shifting", () => {
    expect(formatDateInputValue(new Date(2026, 4, 6))).toBe("2026-05-06");

    const date = parseDateInputValue("2026-05-06");

    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(4);
    expect(date?.getDate()).toBe(6);
    expect(parseDateInputValue("May 06, 2026")).toBeUndefined();
    expect(parseDateInputValue("2026-02-31")).toBeUndefined();
  });

  it("renders a text-backed date input that submits YYYY-MM-DD values", () => {
    const markup = renderToStaticMarkup(
      <DateInput defaultValue="2026-05-06" name="dueDate" required />,
    );

    expect(markup).toContain('name="dueDate"');
    expect(markup).toContain('type="text"');
    expect(markup).toContain('inputMode="numeric"');
    expect(markup).toContain('pattern="\\d{4}-\\d{2}-\\d{2}"');
    expect(markup).toContain('value="2026-05-06"');
    expect(markup).toContain('placeholder="2026-05-06"');
    expect(markup).toContain('aria-label="Select date"');
    expect(markup).not.toContain("June 01, 2025");
  });
});
