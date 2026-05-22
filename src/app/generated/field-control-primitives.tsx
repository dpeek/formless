import { MarkdownEditor } from "@dpeek/formless-ui/markdown";
import { FormattedNumberInput } from "@dpeek/formless-ui/number-input";
import {
  SourceEditor,
  SourcePreviewFieldEditor,
  sourcePreviewPanelClassName,
} from "@dpeek/formless-ui/source-preview";
import { SvgIcon } from "@dpeek/formless-ui/svg-icon";
import type {
  AriaAttributes,
  ComponentProps,
  FocusEventHandler,
  KeyboardEventHandler,
} from "react";
import type { TableColumnFormat } from "../../shared/schema.ts";
import { GeneratedColorInput } from "./color-field-control.tsx";
import { decodeNumberEditorInputValue, encodeNumberEditorInputValue } from "./format.ts";

const markdownFieldControlClassName =
  "min-h-40 rounded border border-slate-300 bg-white px-3 py-2 text-sm";

export function GeneratedMarkdownFieldControl({
  ariaInvalid,
  label,
  onBlur,
  onChange,
  onKeyDown,
  readOnly,
  value,
}: {
  ariaInvalid?: boolean;
  label: string;
  onBlur?: FocusEventHandler<HTMLDivElement>;
  onChange: (value: string) => void;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  readOnly?: boolean;
  value: string;
}) {
  return (
    <MarkdownEditor
      aria-invalid={ariaInvalid}
      aria-label={label}
      className={markdownFieldControlClassName}
      onBlur={onBlur}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={label}
      readOnly={readOnly}
      value={value}
    />
  );
}

export function GeneratedColorFieldControl({
  className,
  disabled,
  error,
  label,
  onBlur = () => undefined,
  onChange,
  required,
  value,
}: {
  className?: string;
  disabled?: boolean;
  error?: string;
  label: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
}) {
  return (
    <GeneratedColorInput
      ariaLabel={label}
      className={className}
      disabled={disabled}
      error={error}
      onBlur={onBlur}
      onChange={onChange}
      required={required}
      value={value}
    />
  );
}

export function GeneratedIconSourceFieldControl({
  ariaInvalid,
  label,
  name,
  onChange,
  readOnly,
  required,
  sourceLabel = label,
  value,
}: {
  ariaInvalid?: AriaAttributes["aria-invalid"];
  label: string;
  name?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  required?: boolean;
  sourceLabel?: string;
  value: string;
}) {
  return (
    <SourcePreviewFieldEditor
      defaultMode="source"
      kind="icon"
      preview={<GeneratedIconSourcePreview label={label} source={value} />}
      source={
        <SourceEditor
          aria-invalid={ariaInvalid}
          aria-label={sourceLabel}
          name={name}
          onChange={onChange}
          placeholder={'<svg viewBox="0 0 24 24">...</svg>'}
          readOnly={readOnly}
          required={required}
          sourceKind="svg"
          value={value}
        />
      }
    />
  );
}

export function GeneratedIconSourcePreview({ label, source }: { label: string; source: string }) {
  return (
    <div
      className={`${sourcePreviewPanelClassName} flex items-center justify-center`}
      data-web-svg-preview="icon"
    >
      <SvgIcon ariaLabel={`${label} preview`} className="size-12" source={source} />
    </div>
  );
}

export function GeneratedNumberFieldControl({
  format = "plain",
  ...props
}: Omit<ComponentProps<typeof FormattedNumberInput>, "decode" | "encode"> & {
  format?: TableColumnFormat;
}) {
  return (
    <FormattedNumberInput
      {...props}
      decode={(value) => decodeNumberEditorInputValue(value, format)}
      encode={(value) => encodeNumberEditorInputValue(value, format)}
    />
  );
}
