import { describe, expect, it } from "vite-plus/test";

import { CalendarDate } from "@internationalized/date";

import {
  dateValueToFieldValue,
  dateValueToStoredDateValue,
  fieldValueToDateValue,
  storedDateValueToDateValue,
} from "./date-value.ts";

describe("generated date value adapter", () => {
  it("converts stored date strings to React Aria date values", () => {
    const result = storedDateValueToDateValue("2026-05-06");

    expect(result.kind).toBe("valid");

    if (result.kind !== "valid") {
      throw new Error("Expected valid date value.");
    }

    expect(result.inputValue).toBe("2026-05-06");
    expect(result.value.year).toBe(2026);
    expect(result.value.month).toBe(5);
    expect(result.value.day).toBe(6);
  });

  it("converts React Aria date values to stored flat date strings", () => {
    expect(dateValueToStoredDateValue(new CalendarDate(2026, 5, 6))).toBe("2026-05-06");
    expect(dateValueToFieldValue(new CalendarDate(2026, 5, 6))).toBe("2026-05-06");
  });

  it("preserves empty optional date values", () => {
    expect(storedDateValueToDateValue(undefined)).toEqual({
      kind: "empty",
      inputValue: "",
      value: null,
    });
    expect(storedDateValueToDateValue("")).toEqual({
      kind: "empty",
      inputValue: "",
      value: null,
    });
    expect(dateValueToStoredDateValue(null)).toBe("");
    expect(dateValueToStoredDateValue(undefined)).toBe("");
    expect(dateValueToFieldValue(null)).toBe("");
  });

  it("rejects malformed stored date strings", () => {
    expect(storedDateValueToDateValue("May 06, 2026")).toEqual({
      kind: "invalid",
      inputValue: "May 06, 2026",
      message: "Enter a YYYY-MM-DD date.",
      value: null,
    });
    expect(storedDateValueToDateValue("2026-5-6")).toEqual({
      kind: "invalid",
      inputValue: "2026-5-6",
      message: "Enter a YYYY-MM-DD date.",
      value: null,
    });
  });

  it("rejects impossible calendar dates", () => {
    expect(storedDateValueToDateValue("2026-02-31")).toEqual({
      kind: "invalid",
      inputValue: "2026-02-31",
      message: "Enter a YYYY-MM-DD date.",
      value: null,
    });
    expect(storedDateValueToDateValue("2026-13-01")).toEqual({
      kind: "invalid",
      inputValue: "2026-13-01",
      message: "Enter a YYYY-MM-DD date.",
      value: null,
    });
  });

  it("round trips stored values through UI date values", () => {
    const storedValue = "2026-05-06";
    const result = storedDateValueToDateValue(storedValue);

    if (result.kind !== "valid") {
      throw new Error("Expected valid date value.");
    }

    expect(dateValueToStoredDateValue(result.value)).toBe(storedValue);
  });

  it("rejects non-string field values at the generated field boundary", () => {
    expect(fieldValueToDateValue(123)).toEqual({
      kind: "invalid",
      inputValue: "123",
      message: "Enter a YYYY-MM-DD date.",
      value: null,
    });
  });
});
