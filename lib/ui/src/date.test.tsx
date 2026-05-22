import { describe, expect, it } from "vite-plus/test";

import { CalendarDate } from "@internationalized/date";
import { renderToStaticMarkup } from "react-dom/server";

import { Calendar } from "./calendar.js";
import { DateInput, formatDateInputValue, parseDateInputValue } from "./date.js";
import { DateField, DateInput as SegmentedDateInput } from "./date-field.js";
import { DatePicker, DatePickerTrigger } from "./date-picker.js";
import { RangeCalendar } from "./range-calendar.js";

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
    expect(markup).toContain('data-slot="control"');
    expect(markup).not.toContain('data-slot="input-group"');
    expect(markup).not.toContain("June 01, 2025");
  });

  it("renders a React Aria calendar with the selected local date", () => {
    const markup = renderToStaticMarkup(
      <Calendar aria-label="Due date" value={new CalendarDate(2026, 5, 6)} />,
    );

    expect(markup).toContain('data-slot="calendar"');
    expect(markup).toContain('aria-label="Due date, May 2026"');
    expect(markup).toContain("May 2026");
    expect(markup).toContain('data-selected="true"');
    expect(markup).not.toContain("rdp-");
  });

  it("renders Intent date field segments", () => {
    const markup = renderToStaticMarkup(
      <DateField aria-label="Event date" value={new CalendarDate(2026, 5, 6)}>
        <SegmentedDateInput />
      </DateField>,
    );

    expect(markup).toContain('aria-label="Event date"');
    expect(markup).toContain('data-slot="control"');
    expect(markup).toContain('role="spinbutton"');
    expect(markup).toContain('data-type="month"');
    expect(markup).toContain('data-type="day"');
    expect(markup).toContain('data-type="year"');
  });

  it("renders an Intent date picker trigger around the segmented input", () => {
    const markup = renderToStaticMarkup(
      <DatePicker aria-label="Event date" value={new CalendarDate(2026, 5, 6)}>
        <DatePickerTrigger />
      </DatePicker>,
    );

    expect(markup).toContain('aria-label="Event date"');
    expect(markup).toContain('data-slot="date-picker-trigger"');
    expect(markup).toContain('data-slot="control"');
    expect(markup).toContain('role="spinbutton"');
  });

  it("renders an Intent range calendar with selected range cells", () => {
    const markup = renderToStaticMarkup(
      <RangeCalendar
        aria-label="Trip dates"
        value={{ start: new CalendarDate(2026, 5, 6), end: new CalendarDate(2026, 5, 8) }}
      />,
    );

    expect(markup).toContain('data-slot="calendar"');
    expect(markup).toContain('aria-label="Trip dates, May 2026"');
    expect(markup).toContain("May 2026");
    expect(markup).toContain('data-selected="true"');
  });
});
