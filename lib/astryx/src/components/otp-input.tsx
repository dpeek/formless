import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useTransition,
  type ChangeEvent,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import * as stylex from "@stylexjs/stylex";
import { Field, type FieldProps, type InputStatus } from "@astryxdesign/core/Field";
import { Spinner } from "@astryxdesign/core/Spinner";
import {
  borderVars,
  colorVars,
  durationVars,
  easeVars,
  fontWeightVars,
  radiusVars,
  shadowVars,
  spacingVars,
  typeScaleVars,
  typographyVars,
} from "@astryxdesign/core/theme/tokens.stylex";

export type OneTimePasscodeInputProps = {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  completeAction?: (value: string) => void | Promise<void>;
  status?: InputStatus;
  length?: number;
  htmlName?: string;
  width?: FieldProps["width"];
  isDisabled?: boolean;
  isLoading?: boolean;
  hasAutoFocus?: boolean;
};

const defaultPasscodeLength = 6;
const accessibleLabel = "one time passcode";

const styles = stylex.create({
  grid: {
    display: "grid",
    gap: spacingVars["--spacing-2"],
    width: "max-content",
    maxWidth: "100%",
  },
  cell: {
    boxSizing: "border-box",
    position: "relative",
    zIndex: 1,
    width: {
      default: spacingVars["--spacing-11"],
      "@media (max-width: 420px)": spacingVars["--spacing-10"],
      "@media (max-width: 360px)": spacingVars["--spacing-8"],
    },
    height: {
      default: spacingVars["--spacing-11"],
      "@media (max-width: 420px)": spacingVars["--spacing-10"],
      "@media (max-width: 360px)": spacingVars["--spacing-8"],
    },
    paddingBlock: 0,
    paddingInline: 0,
    textAlign: "center",
    fontFamily: typographyVars["--font-family-body"],
    fontSize: typeScaleVars["--text-heading-2-size"],
    lineHeight: typeScaleVars["--text-heading-2-leading"],
    fontWeight: fontWeightVars["--font-weight-semibold"],
    letterSpacing: 0,
    color: colorVars["--color-text-primary"],
    caretColor: colorVars["--color-accent"],
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: {
      default: colorVars["--color-border-emphasized"],
      ":focus": colorVars["--color-accent"],
    },
    borderRadius: radiusVars["--radius-element"],
    backgroundColor: colorVars["--color-background-surface"],
    transitionProperty: "border-color, box-shadow",
    transitionDuration: {
      default: durationVars["--duration-fast"],
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionTimingFunction: easeVars["--ease-standard"],
    boxShadow: {
      default: "none",
      ":hover:not(:focus)": {
        "@media (hover: hover)": `inset 0px 0px 0px 2px color-mix(in srgb, ${colorVars["--color-border-emphasized"]} 30%, transparent)`,
      },
      ":focus": `inset 0px 0px 0px 2px ${colorVars["--color-accent-muted"]}`,
    },
    outline: "none",
  },
  cellDisabled: {
    cursor: "not-allowed",
    opacity: 0.5,
    borderColor: colorVars["--color-border-emphasized"],
  },
  cellError: {
    borderColor: {
      default: colorVars["--color-error"],
      ":focus": colorVars["--color-error"],
    },
    boxShadow: {
      default: "none",
      ":hover:not(:focus)": {
        "@media (hover: hover)": shadowVars["--shadow-inset-error"],
      },
      ":focus": shadowVars["--shadow-inset-error"],
    },
  },
  cellSuccess: {
    borderColor: {
      default: colorVars["--color-success"],
      ":focus": colorVars["--color-success"],
    },
    boxShadow: {
      default: "none",
      ":hover:not(:focus)": {
        "@media (hover: hover)": shadowVars["--shadow-inset-success"],
      },
      ":focus": shadowVars["--shadow-inset-success"],
    },
  },
  cellWarning: {
    borderColor: {
      default: colorVars["--color-warning"],
      ":focus": colorVars["--color-warning"],
    },
    boxShadow: {
      default: "none",
      ":hover:not(:focus)": {
        "@media (hover: hover)": shadowVars["--shadow-inset-warning"],
      },
      ":focus": shadowVars["--shadow-inset-warning"],
    },
  },
  loadingGrid: {
    position: "relative",
  },
  loadingCell: {
    visibility: "hidden",
  },
  loadingSpinner: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
  },
});

const dynamicStyles = stylex.create({
  gridColumns: (length: number) => ({
    gridTemplateColumns: `repeat(${length}, max-content)`,
  }),
});

export function OTPInput({
  value,
  onChange,
  onComplete,
  completeAction,
  status,
  length = defaultPasscodeLength,
  htmlName,
  width,
  isDisabled = false,
  isLoading = false,
  hasAutoFocus = false,
}: OneTimePasscodeInputProps) {
  const passcodeLength = resolvePasscodeLength(length);
  const inputId = useId();
  const statusMessageId = useId();
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const didAutoFocusRef = useRef(false);
  const completedCodeRef = useRef<string | null>(null);
  const [isCompleteActionPending, startTransition] = useTransition();
  const isBusy = isLoading || isCompleteActionPending;
  const normalizedValue = normalizePasscode(value, passcodeLength);
  const cells = useMemo(
    () =>
      Array.from({ length: passcodeLength }, (_, index) => ({
        index,
        value: normalizedValue[index] ?? "",
      })),
    [normalizedValue, passcodeLength],
  );
  const describedBy = status?.message ? statusMessageId : undefined;

  const completeCode = useCallback((code: string) => {
    completedCodeRef.current = code;
    onComplete?.(code);

    if (completeAction) {
      startTransition(async () => {
        await completeAction(code);
      });
    }
  }, [completeAction, onComplete, startTransition]);

  useEffect(() => {
    if (!hasAutoFocus || isDisabled || isBusy || didAutoFocusRef.current) {
      return;
    }

    didAutoFocusRef.current = true;
    focusCell(inputsRef.current, Math.min(normalizedValue.length, passcodeLength - 1));
  }, [hasAutoFocus, isBusy, isDisabled, normalizedValue.length, passcodeLength]);

  useEffect(() => {
    if (normalizedValue.length < passcodeLength) {
      completedCodeRef.current = null;
      return;
    }

    if (normalizedValue !== completedCodeRef.current) {
      completeCode(normalizedValue);
    }
  }, [completeCode, normalizedValue, passcodeLength]);

  const commitCode = (nextValue: string, nextFocusIndex: number | null) => {
    const nextCode = normalizePasscode(nextValue, passcodeLength);

    onChange(nextCode);

    if (nextFocusIndex !== null && !isDisabled) {
      focusCell(inputsRef.current, nextFocusIndex);
    }
  };

  const submitCompletedCode = () => {
    if (normalizedValue.length !== passcodeLength) {
      return;
    }

    completeCode(normalizedValue);
  };

  const replaceAtIndex = (index: number, digits: string) => {
    const targetIndex = Math.min(index, normalizedValue.length);
    const nextValue =
      normalizedValue.slice(0, targetIndex) +
      digits +
      normalizedValue.slice(targetIndex + digits.length);
    const nextFocusIndex = Math.min(targetIndex + digits.length, passcodeLength - 1);

    commitCode(nextValue, nextFocusIndex);
  };

  const handleChange =
    (index: number) => (event: ChangeEvent<HTMLInputElement>) => {
      const digits = normalizePasscode(event.currentTarget.value, passcodeLength);

      if (digits.length === 0) {
        commitCode(
          normalizedValue.slice(0, index) + normalizedValue.slice(index + 1),
          index,
        );
        return;
      }

      if (digits.length >= passcodeLength) {
        commitCode(digits, passcodeLength - 1);
        return;
      }

      replaceAtIndex(index, digits);
    };

  const handleKeyDown =
    (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        replaceAtIndex(index, event.key);
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        const targetIndex =
          index < normalizedValue.length
            ? index
            : Math.max(0, normalizedValue.length - 1);
        const nextValue =
          normalizedValue.slice(0, targetIndex) +
          normalizedValue.slice(targetIndex + 1);

        commitCode(nextValue, Math.max(0, targetIndex - 1));
        return;
      }

      if (event.key === "Delete") {
        event.preventDefault();
        commitCode(
          normalizedValue.slice(0, index) + normalizedValue.slice(index + 1),
          index,
        );
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        focusCell(inputsRef.current, index - 1);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        focusCell(inputsRef.current, index + 1);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        focusCell(inputsRef.current, 0);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        focusCell(inputsRef.current, passcodeLength - 1);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        submitCompletedCode();
      }
    };

  const handlePaste =
    (index: number) => (event: ClipboardEvent<HTMLInputElement>) => {
      const digits = normalizePasscode(
        event.clipboardData.getData("text"),
        passcodeLength,
      );

      if (digits.length === 0) {
        return;
      }

      event.preventDefault();

      if (digits.length >= passcodeLength) {
        commitCode(digits, passcodeLength - 1);
        return;
      }

      replaceAtIndex(index, digits);
    };

  const handleFocus =
    (index: number) => (event: FocusEvent<HTMLInputElement>) => {
      const firstEmptyIndex = Math.min(normalizedValue.length, passcodeLength - 1);

      if (index > firstEmptyIndex) {
        focusCell(inputsRef.current, firstEmptyIndex);
        return;
      }

      event.currentTarget.select();
    };

  return (
    <Field
      label={accessibleLabel}
      inputID={inputId}
      isLabelHidden
      isDisabled={isDisabled}
      status={
        status
          ? {
              type: status.type,
              message: status.message,
              messageID: status.message ? statusMessageId : undefined,
            }
          : undefined
      }
      width={width}
    >
      {isBusy ? (
        <div
          role="status"
          aria-label="Submitting one time passcode"
          aria-live="polite"
          {...stylex.props(
            styles.grid,
            styles.loadingGrid,
            dynamicStyles.gridColumns(passcodeLength),
          )}
        >
          {cells.map((cell) => (
            <span
              key={cell.index}
              aria-hidden="true"
              {...stylex.props(styles.cell, styles.loadingCell)}
            />
          ))}
          <span {...stylex.props(styles.loadingSpinner)}>
            <Spinner size="lg" />
          </span>
        </div>
      ) : (
        <div {...stylex.props(styles.grid, dynamicStyles.gridColumns(passcodeLength))}>
          {cells.map((cell) => (
            <input
              key={cell.index}
              ref={(node) => {
                inputsRef.current[cell.index] = node;
              }}
              id={cell.index === 0 ? inputId : undefined}
              type="text"
              value={cell.value}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint={cell.index === passcodeLength - 1 ? "done" : "next"}
              aria-label={`${accessibleLabel} digit ${cell.index + 1} of ${passcodeLength}`}
              aria-describedby={describedBy}
              aria-invalid={status?.type === "error" ? "true" : undefined}
              disabled={isDisabled}
              data-1p-ignore="true"
              data-bwignore="true"
              data-form-type="other"
              data-lpignore="true"
              onChange={handleChange(cell.index)}
              onFocus={handleFocus(cell.index)}
              onKeyDown={handleKeyDown(cell.index)}
              onPaste={handlePaste(cell.index)}
              {...stylex.props(
                styles.cell,
                isDisabled && styles.cellDisabled,
                status?.type === "error" && styles.cellError,
                status?.type === "success" && styles.cellSuccess,
                status?.type === "warning" && styles.cellWarning,
              )}
            />
          ))}
        </div>
      )}
      {htmlName ? <input type="hidden" name={htmlName} value={normalizedValue} /> : null}
    </Field>
  );
}

function normalizePasscode(value: string, length: number) {
  return value.replace(/\D/g, "").slice(0, length);
}

function resolvePasscodeLength(length: number) {
  if (!Number.isFinite(length) || length < 1) {
    return defaultPasscodeLength;
  }

  return Math.floor(length);
}

function focusCell(
  inputs: Array<HTMLInputElement | null>,
  index: number,
) {
  const nextInput = inputs[Math.max(0, Math.min(index, inputs.length - 1))];

  window.requestAnimationFrame(() => {
    nextInput?.focus();
    nextInput?.select();
  });
}
