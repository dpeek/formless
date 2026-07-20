import { CalendarDate, type DateValue } from "@internationalized/date";
import type { FieldValue } from "@dpeek/formless-storage";

const storedDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const invalidStoredDateMessage = "Enter a YYYY-MM-DD date.";

export type StoredDateValueParseResult =
  | { kind: "empty"; inputValue: ""; value: null }
  | { kind: "valid"; inputValue: string; value: CalendarDate }
  | { kind: "invalid"; inputValue: string; message: string; value: null };

export function storedDateValueToDateValue(value: string | undefined): StoredDateValueParseResult {
  const inputValue = value ?? "";

  if (inputValue === "") {
    return { kind: "empty", inputValue: "", value: null };
  }

  const match = storedDatePattern.exec(inputValue);

  if (!match) {
    return invalidStoredDateValue(inputValue);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dateValue =
    year === 0 ? new CalendarDate("BC", 1, month, day) : new CalendarDate(year, month, day);

  if (dateValueToStoredDateValue(dateValue) !== inputValue) {
    return invalidStoredDateValue(inputValue);
  }

  return { kind: "valid", inputValue, value: dateValue };
}

export function fieldValueToDateValue(value: FieldValue | undefined): StoredDateValueParseResult {
  if (value === undefined || typeof value === "string") {
    return storedDateValueToDateValue(value);
  }

  return invalidStoredDateValue(String(value));
}

export function dateValueToStoredDateValue(value: DateValue | null | undefined) {
  if (!value) {
    return "";
  }

  return value.toString().slice(0, 10);
}

export function dateValueToFieldValue(value: DateValue | null | undefined): FieldValue {
  return dateValueToStoredDateValue(value);
}

function invalidStoredDateValue(inputValue: string): StoredDateValueParseResult {
  return {
    kind: "invalid",
    inputValue,
    message: invalidStoredDateMessage,
    value: null,
  };
}
