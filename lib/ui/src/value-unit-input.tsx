import * as React from "react";

import {
  FormattedNumberInput,
  type FormattedNumberInputDecodeResult,
  type FormattedNumberInputValue,
} from "@dpeek/formless-ui/number-input";
import { NativeSelect, NativeSelectOption } from "@dpeek/formless-ui/native-select";
import { cn } from "@dpeek/formless-ui/utils";

export type ValueUnitInputOption = {
  value: string;
  label: string;
};

export type ValueUnitInputProps = Omit<React.ComponentProps<"div">, "onChange" | "value"> & {
  commitOnBlur?: boolean;
  decode: (value: string) => FormattedNumberInputDecodeResult;
  disabled?: boolean;
  encode: (value: FormattedNumberInputValue) => string;
  inputClassName?: string;
  inputRequired?: boolean;
  inputValue: string;
  label: string;
  onInvalidCommit?: (message: string, value: string) => void;
  onInputValueChange?: (value: string) => void;
  onInputValueCommit?: (value: FormattedNumberInputValue, encodedValue: string) => void;
  onInputValueRevert?: () => void;
  onUnitChange?: (unit: string) => void;
  onUnitCommit?: (unit: string) => void;
  options: ValueUnitInputOption[];
  unit: string;
  unitClassName?: string;
  unitLabel?: string;
  unitRequired?: boolean;
};

function ValueUnitInput({
  className,
  commitOnBlur = true,
  decode,
  disabled,
  encode,
  inputClassName,
  inputRequired,
  inputValue,
  label,
  onInvalidCommit,
  onInputValueChange,
  onInputValueCommit,
  onInputValueRevert,
  onUnitChange,
  onUnitCommit,
  options,
  unit,
  unitClassName,
  unitLabel = `${label} unit`,
  unitRequired,
  ...props
}: ValueUnitInputProps) {
  const unknownUnit = unit !== "" && !options.some((option) => option.value === unit) ? unit : null;

  return (
    <div
      className={cn("flex w-full min-w-0 items-center gap-1", className)}
      data-web-value-unit-input="true"
      data-slot="value-unit-input"
      {...props}
    >
      <FormattedNumberInput
        aria-label={label}
        className={inputClassName}
        commitOnBlur={commitOnBlur}
        decode={decode}
        disabled={disabled}
        encode={encode}
        onInvalidCommit={onInvalidCommit}
        onValueChange={onInputValueChange}
        onValueCommit={onInputValueCommit}
        onValueRevert={onInputValueRevert}
        required={inputRequired}
        value={inputValue}
      />
      <NativeSelect
        aria-label={unitLabel}
        className={cn("w-20 shrink-0", unitClassName)}
        disabled={disabled}
        onChange={(event) => {
          const nextUnit = event.currentTarget.value;

          onUnitChange?.(nextUnit);
          onUnitCommit?.(nextUnit);
        }}
        required={unitRequired}
        size="sm"
        value={unit}
      >
        {!unitRequired || unit === "" ? <NativeSelectOption value="" /> : null}
        {unknownUnit ? (
          <NativeSelectOption value={unknownUnit}>{unknownUnit}</NativeSelectOption>
        ) : null}
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

export { ValueUnitInput };
