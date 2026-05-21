"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";

import { Calendar } from "@dpeek/formless-ui/calendar";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@dpeek/formless-ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@dpeek/formless-ui/popover";

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
}: Omit<
  React.ComponentProps<typeof InputGroupInput>,
  "defaultValue" | "onChange" | "type" | "value"
> & {
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
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState<Date | undefined>(selectedDate);

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
      <InputGroupInput
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
      <InputGroupAddon align="inline-end">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <InputGroupButton
                id="date-picker"
                intent="plain"
                size="sq-xs"
                aria-label="Select date"
              >
                <CalendarIcon />
                <span className="sr-only">Select date</span>
              </InputGroupButton>
            }
          />
          <PopoverContent
            className="w-auto overflow-hidden p-0"
            align="end"
            alignOffset={-8}
            sideOffset={10}
          >
            <Calendar
              mode="single"
              selected={selectedDate}
              month={month}
              onMonthChange={setMonth}
              onSelect={(date) => {
                updateValue(formatDateInputValue(date), { commit: true });
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </InputGroupAddon>
    </InputGroup>
  );
}
