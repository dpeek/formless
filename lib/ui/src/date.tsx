"use client";

import * as React from "react";
import { CalendarDate } from "@internationalized/date";

import { Button } from "@dpeek/formless-ui/button";
import { Calendar } from "@dpeek/formless-ui/calendar";
import { Dialog } from "@dpeek/formless-ui/dialog";
import { ControlCalendarIcon } from "@dpeek/formless-ui/icons";
import { Input, InputGroup } from "@dpeek/formless-ui/input";
import { Popover, PopoverContent } from "@dpeek/formless-ui/popover";

export function formatDateInputValue(date: Date | undefined) {
  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function parseDateInputValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }

  return date;
}

export function DateInput({
  className,
  date,
  defaultValue,
  inputClassName,
  name,
  onDateChange,
  onValueCommit,
  onValueChange,
  value,
  ...inputProps
}: Omit<React.ComponentProps<typeof Input>, "defaultValue" | "onChange" | "type" | "value"> & {
  className?: string;
  date?: Date;
  defaultValue?: string;
  inputClassName?: string;
  onDateChange?: (date?: Date) => void;
  onValueCommit?: (value: string) => void;
  onValueChange?: (value: string) => void;
  value?: string;
}) {
  const isValueControlled = value !== undefined;
  const dateInputValue = date ? formatDateInputValue(date) : undefined;
  const [internalValue, setInternalValue] = React.useState(
    () => value ?? defaultValue ?? dateInputValue ?? "",
  );
  const resolvedValue = value ?? internalValue;
  const selectedDateValue = dateInputValue ?? resolvedValue;
  const selectedDate = React.useMemo(
    () => parseDateInputValue(selectedDateValue),
    [selectedDateValue],
  );
  const selectedCalendarDate = React.useMemo(
    () => dateToCalendarDate(selectedDate),
    [selectedDate],
  );
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState<Date | undefined>(selectedDate);
  const focusedCalendarDate = React.useMemo(
    () => dateToCalendarDate(month ?? selectedDate),
    [month, selectedDate],
  );

  React.useEffect(() => {
    if (dateInputValue && !isValueControlled) {
      setInternalValue(dateInputValue);
    }
  }, [dateInputValue, isValueControlled]);

  React.useEffect(() => {
    if (selectedDate) {
      setMonth(selectedDate);
    }
  }, [selectedDate]);

  function updateValue(nextValue: string, options: { commit?: boolean } = {}) {
    if (!isValueControlled) {
      setInternalValue(nextValue);
    }

    onValueChange?.(nextValue);

    if (nextValue === "") {
      onDateChange?.(undefined);
      if (options.commit) {
        onValueCommit?.(nextValue);
      }
      return;
    }

    const nextDate = parseDateInputValue(nextValue);

    if (nextDate) {
      onDateChange?.(nextDate);
      setMonth(nextDate);
    }

    if (options.commit) {
      onValueCommit?.(nextValue);
    }
  }

  return (
    <InputGroup className={className}>
      <Input
        name={name}
        placeholder="2026-05-06"
        {...inputProps}
        className={inputClassName}
        inputMode="numeric"
        pattern="\d{4}-\d{2}-\d{2}"
        type="text"
        value={resolvedValue}
        onChange={(e) => {
          updateValue(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            return;
          }

          inputProps.onKeyDown?.(e);
        }}
      />
      <Popover isOpen={open} onOpenChange={setOpen}>
        <Button id="date-picker" intent="plain" size="sq-xs" aria-label="Select date" type="button">
          <ControlCalendarIcon />
          <span className="sr-only">Select date</span>
        </Button>
        <PopoverContent
          className="w-auto overflow-hidden p-0"
          placement="bottom end"
          offset={10}
          crossOffset={-8}
        >
          <Dialog aria-label="Select date">
            <Calendar
              aria-label="Select date"
              value={selectedCalendarDate ?? null}
              focusedValue={focusedCalendarDate}
              onFocusChange={(date) => {
                setMonth(calendarDateToDate(date));
              }}
              onChange={(date) => {
                updateValue(formatCalendarDateValue(date), { commit: true });
                setOpen(false);
              }}
            />
          </Dialog>
        </PopoverContent>
      </Popover>
    </InputGroup>
  );
}

function dateToCalendarDate(date: Date | undefined) {
  if (!date || Number.isNaN(date.getTime())) {
    return undefined;
  }

  return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function calendarDateToDate(value: CalendarDate) {
  return new Date(value.year, value.month - 1, value.day);
}

function formatCalendarDateValue(date: CalendarDate | null) {
  if (!date) {
    return "";
  }

  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}
