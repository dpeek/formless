import { cn } from "@dpeek/formless-ui/utils";
import { useState, type AriaAttributes, type ReactNode } from "react";

const sourcePreviewSurfaceClassName = "border-input bg-bg rounded-xl border shadow-sm";

export const sourcePreviewPanelClassName = `${sourcePreviewSurfaceClassName} min-h-[22rem] p-4`;
export const sourcePreviewEditorFrameClassName = `${sourcePreviewSurfaceClassName} overflow-hidden px-4`;
export const sourcePreviewTextareaClassName = `${sourcePreviewSurfaceClassName} text-fg min-h-[22rem] w-full px-4 py-3 text-sm leading-6 outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30`;

export type SourcePreviewMode = "source" | "preview";

export function SourceEditor({
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  name,
  onChange,
  placeholder,
  readOnly = false,
  required,
  sourceKind,
  value,
}: {
  "aria-label"?: string;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
  name?: string;
  onChange?: (nextValue: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  required?: boolean;
  sourceKind: string;
  value: string;
}) {
  const isReadOnly = readOnly || onChange === undefined;
  const sourceData = {
    [`data-web-${sourceKind}-source`]: "textarea",
  } as Record<`data-${string}`, string>;

  return (
    <textarea
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid}
      className={sourcePreviewTextareaClassName}
      data-web-field-kind="textarea"
      {...sourceData}
      name={name}
      onChange={onChange ? (event) => onChange(event.currentTarget.value) : undefined}
      placeholder={placeholder}
      readOnly={isReadOnly}
      required={required}
      spellCheck={false}
      value={value}
    />
  );
}

export function SourcePreviewFieldEditor({
  defaultMode = "source",
  kind,
  preview,
  source,
}: {
  defaultMode?: SourcePreviewMode;
  kind: string;
  preview: ReactNode;
  source: ReactNode;
}) {
  const [mode, setMode] = useState<SourcePreviewMode>(defaultMode);
  const isPreview = mode === "preview";

  return (
    <div className="space-y-3" data-web-field-kind={kind} data-web-source-preview-mode={mode}>
      <div className="relative" data-web-source-preview-panel={mode}>
        <button
          aria-label={isPreview ? "Hide preview" : "Show preview"}
          aria-pressed={isPreview}
          className={cn(
            "border-border/80 absolute top-3 right-3 z-10 inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur transition",
            isPreview ? "border-fg/10 bg-fg text-bg" : "bg-bg/90 text-fg hover:bg-bg",
          )}
          data-web-source-preview-toggle="preview"
          data-web-source-preview-toggle-state={isPreview ? "active" : "inactive"}
          onClick={() => setMode(isPreview ? "source" : "preview")}
          type="button"
        >
          Preview
        </button>

        {isPreview ? preview : source}
      </div>
    </div>
  );
}

export function EmptyPreview({ attribute, children }: { attribute: string; children: ReactNode }) {
  return (
    <p
      className={cn(sourcePreviewPanelClassName, "text-muted-fg border-dashed text-sm")}
      data-web-source-preview-empty={attribute}
    >
      {children}
    </p>
  );
}
