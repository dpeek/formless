import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@dpeek/formless-ui/utils";

export type AutosizeTextInputProps = Omit<
  React.ComponentProps<"input">,
  "className" | "defaultValue" | "onChange" | "value"
> & {
  autoSelect?: boolean;
  className?: string;
  commitOnBlur?: boolean;
  commitOnEnter?: boolean;
  controlClassName?: string;
  onValueChange?: (value: string) => void;
  onValueCommit?: (value: string) => void;
  onValueRevert?: () => void;
  revertOnEscape?: boolean;
  sizerClassName?: string;
  value: string;
};

const baseTextMetricsClass = "border border-transparent px-1 py-0.5 text-inherit leading-inherit";

const baseControlClass = cn(
  "col-start-1 row-start-1 block min-w-0 appearance-none rounded-sm bg-transparent",
  "transition-colors outline-none placeholder:text-muted-foreground",
  "focus-visible:border-ring focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/30",
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
);

function AutosizeTextInput({
  autoComplete = "off",
  autoSelect = false,
  className,
  commitOnBlur = true,
  commitOnEnter = true,
  controlClassName,
  onBlur,
  onFocus,
  onKeyDown,
  onValueChange,
  onValueCommit,
  onValueRevert,
  placeholder,
  revertOnEscape = true,
  size,
  sizerClassName,
  type = "text",
  value,
  ...props
}: AutosizeTextInputProps) {
  const sizerValue = value || placeholder || " ";

  return (
    <span
      className={cn("inline-grid min-w-0 max-w-full align-baseline", className)}
      data-web-autosize-text-input="true"
      data-slot="autosize-text-input"
    >
      <span
        aria-hidden="true"
        className={cn(
          "col-start-1 row-start-1 invisible min-w-[1ch] whitespace-pre",
          baseTextMetricsClass,
          sizerClassName,
        )}
        data-slot="autosize-text-input-sizer"
      >
        {sizerValue}
      </span>
      <InputPrimitive
        autoComplete={autoComplete}
        className={cn(baseTextMetricsClass, baseControlClass, controlClassName)}
        data-slot="autosize-text-input-control"
        onBlur={(event) => {
          onBlur?.(event);

          if (!event.defaultPrevented && commitOnBlur) {
            onValueCommit?.(event.currentTarget.value);
          }
        }}
        onChange={(event) => onValueChange?.(event.currentTarget.value)}
        onFocus={(event) => {
          onFocus?.(event);

          if (!event.defaultPrevented && autoSelect) {
            event.currentTarget.select();
          }
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);

          if (event.defaultPrevented) {
            return;
          }

          if (event.key === "Enter" && commitOnEnter) {
            event.preventDefault();
            onValueCommit?.(event.currentTarget.value);
            return;
          }

          if (event.key === "Escape" && revertOnEscape) {
            event.preventDefault();
            onValueRevert?.();
          }
        }}
        placeholder={placeholder}
        size={size ?? 1}
        type={type}
        value={value}
        {...props}
      />
    </span>
  );
}

export { AutosizeTextInput };
