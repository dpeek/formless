"use client";

import * as React from "react";
import { CalendarDate } from "@internationalized/date";
import {
  Calendar as CalendarPrimitive,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  type CalendarCellRenderProps,
  type CalendarProps as ReactAriaCalendarProps,
} from "react-aria-components/Calendar";
import { Heading } from "react-aria-components/Heading";

import { Button, buttonStyles, type ButtonProps } from "@dpeek/formless-ui/button";
import { CalendarNextIcon, CalendarPreviousIcon } from "@dpeek/formless-ui/icons";
import { cn } from "@dpeek/formless-ui/utils";

type CalendarProps = Omit<
  ReactAriaCalendarProps<CalendarDate>,
  | "children"
  | "className"
  | "defaultValue"
  | "focusedValue"
  | "onChange"
  | "onFocusChange"
  | "value"
> & {
  buttonIntent?: ButtonProps["intent"];
  className?: string;
  month?: Date;
  onMonthChange?: (date: Date) => void;
  onSelect?: (date?: Date) => void;
  selected?: Date;
};

function Calendar({
  "aria-label": ariaLabel = "Calendar",
  buttonIntent = "plain",
  className,
  month,
  onMonthChange,
  onSelect,
  selected,
  ...props
}: CalendarProps) {
  const selectedValue = React.useMemo(() => dateToCalendarDate(selected), [selected]);
  const focusedValue = React.useMemo(
    () => dateToCalendarDate(month ?? selected),
    [month, selected],
  );

  return (
    <CalendarPrimitive
      aria-label={ariaLabel}
      {...props}
      value={selectedValue ?? null}
      focusedValue={focusedValue}
      onChange={(value) => {
        onSelect?.(calendarDateToDate(value));
      }}
      onFocusChange={(value) => {
        onMonthChange?.(calendarDateToDate(value));
      }}
      className={cn(
        "group/calendar w-fit bg-background p-3 [--cell-radius:var(--radius-md)] [--cell-size:--spacing(6)] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent",
        className,
      )}
      data-slot="calendar"
    >
      <div className="mb-4 flex h-(--cell-size) w-full items-center justify-between gap-1">
        <Button
          slot="previous"
          intent={buttonIntent}
          size="sq-xs"
          className="size-(--cell-size) p-0 select-none aria-disabled:opacity-50"
        >
          <CalendarPreviousIcon className="size-4 rtl:rotate-180" />
          <span className="sr-only">Previous month</span>
        </Button>
        <Heading className="px-2 text-sm font-medium select-none" />
        <Button
          slot="next"
          intent={buttonIntent}
          size="sq-xs"
          className="size-(--cell-size) p-0 select-none aria-disabled:opacity-50"
        >
          <CalendarNextIcon className="size-4 rtl:rotate-180" />
          <span className="sr-only">Next month</span>
        </Button>
      </div>
      <CalendarGrid className="w-full border-separate border-spacing-0">
        <CalendarGridHeader>
          {(day) => (
            <CalendarHeaderCell className="h-(--cell-size) text-center text-[0.8rem] font-normal text-muted-foreground select-none">
              {day}
            </CalendarHeaderCell>
          )}
        </CalendarGridHeader>
        <CalendarGridBody>
          {(date) => (
            <CalendarCell
              date={date}
              data-day={calendarDateToDate(date).toLocaleDateString()}
              className={(values) => calendarCellClassName(values)}
            />
          )}
        </CalendarGridBody>
      </CalendarGrid>
    </CalendarPrimitive>
  );
}

function calendarCellClassName({
  isDisabled,
  isFocusVisible,
  isOutsideMonth,
  isSelected,
  isToday,
}: CalendarCellRenderProps) {
  return cn(
    buttonStyles({ intent: "plain", size: "sq-xs" }),
    "my-px flex aspect-square size-auto min-w-(--cell-size) items-center justify-center rounded-(--cell-radius) border-0 text-sm leading-none font-normal select-none",
    "data-[pressed]:bg-secondary data-[hovered]:bg-secondary dark:hover:text-foreground",
    isToday && "bg-muted text-foreground",
    isOutsideMonth && "text-muted-foreground",
    isDisabled && "text-muted-foreground opacity-50",
    isSelected &&
      "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
    isFocusVisible && "outline outline-2 outline-offset-2 outline-ring",
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

export { Calendar };
