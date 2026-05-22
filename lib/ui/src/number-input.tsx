import {
  Input as InputPrimitive,
  type InputProps as PrimitiveInputProps,
} from "react-aria-components/Input";

import { cn } from "./primitive";

export type FormattedNumberInputValue = number | "";

export type FormattedNumberInputDecodeResult =
  | { kind: "valid"; value: FormattedNumberInputValue }
  | { kind: "invalid"; message: string };

export type FormattedNumberInputProps = Omit<
  PrimitiveInputProps,
  "className" | "defaultValue" | "name" | "onChange" | "type" | "value"
> & {
  className?: string;
  commitOnBlur?: boolean;
  commitOnEnter?: boolean;
  decode: (value: string) => FormattedNumberInputDecodeResult;
  encode: (value: FormattedNumberInputValue) => string;
  name?: string;
  onInvalidCommit?: (message: string, value: string) => void;
  onValueChange?: (value: string) => void;
  onValueCommit?: (value: FormattedNumberInputValue, encodedValue: string) => void;
  onValueRevert?: () => void;
  revertOnEscape?: boolean;
  value: string;
};

const baseFormattedNumberInputClass = cn(
  "h-7 w-full min-w-0 rounded-md border border-input bg-input/20 px-2 py-0.5 text-sm",
  "transition-colors outline-none placeholder:text-muted-fg",
  "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  "aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger/20",
  "md:text-xs/relaxed dark:bg-input/30 dark:aria-invalid:border-danger/50 dark:aria-invalid:ring-danger/40",
);

function FormattedNumberInput({
  autoComplete = "off",
  className,
  commitOnBlur = true,
  commitOnEnter = true,
  decode,
  encode,
  inputMode = "decimal",
  name,
  onBlur,
  onInvalidCommit,
  onKeyDown,
  onValueChange,
  onValueCommit,
  onValueRevert,
  revertOnEscape = true,
  value,
  ...props
}: FormattedNumberInputProps) {
  const decoded = decodeFormattedNumberInputValue(value, decode);
  const ariaInvalid = props["aria-invalid"] ?? (decoded.kind === "invalid" ? true : undefined);

  function commitValue() {
    const result = decodeFormattedNumberInputValue(value, decode);

    if (result.kind === "invalid") {
      onInvalidCommit?.(result.message, value);
      return;
    }

    const encodedValue = encode(result.value);
    onValueChange?.(encodedValue);
    onValueCommit?.(result.value, encodedValue);
  }

  return (
    <>
      {name ? (
        <input
          name={name}
          readOnly
          type="hidden"
          value={formattedNumberInputFormValue(value, decode)}
        />
      ) : null}
      <InputPrimitive
        autoComplete={autoComplete}
        className={cn(baseFormattedNumberInputClass, className)}
        data-web-formatted-number-input="true"
        data-slot="formatted-number-input"
        inputMode={inputMode}
        onBlur={(event) => {
          onBlur?.(event);

          if (!event.defaultPrevented && commitOnBlur) {
            commitValue();
          }
        }}
        onChange={(event) => onValueChange?.(event.currentTarget.value)}
        onKeyDown={(event) => {
          onKeyDown?.(event);

          if (event.defaultPrevented) {
            return;
          }

          if (event.key === "Enter" && commitOnEnter) {
            event.preventDefault();
            commitValue();
            return;
          }

          if (event.key === "Escape" && revertOnEscape) {
            event.preventDefault();
            onValueRevert?.();
          }
        }}
        type="text"
        value={value}
        {...props}
        aria-invalid={ariaInvalid}
      />
    </>
  );
}

export function formattedNumberInputFormValue(
  value: string,
  decode: (value: string) => FormattedNumberInputDecodeResult,
) {
  const result = decodeFormattedNumberInputValue(value, decode);

  if (result.kind === "invalid") {
    return "NaN";
  }

  return result.value === "" ? "" : String(result.value);
}

function decodeFormattedNumberInputValue(
  value: string,
  decode: (value: string) => FormattedNumberInputDecodeResult,
): FormattedNumberInputDecodeResult {
  const result = decode(value);

  if (result.kind === "invalid") {
    return result;
  }

  if (typeof result.value === "number" && !Number.isFinite(result.value)) {
    return { kind: "invalid", message: "Enter a finite number." };
  }

  return result;
}

export { FormattedNumberInput };
