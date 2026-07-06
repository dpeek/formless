"use client";

import { cn } from "./primitive";
import type { FocusEventHandler, KeyboardEventHandler } from "react";
import type { MarkdownHeadingLevel } from "./markdown-renderer.js";

export { MarkdownRenderer } from "./markdown-renderer.js";
export type { MarkdownHeadingLevel } from "./markdown-renderer.js";

export function MarkdownEditor({
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  className,
  onChange,
  onBlur,
  onKeyDown,
  placeholder,
  readOnly,
  value,
}: {
  "aria-invalid"?: boolean;
  "aria-label"?: string;
  className?: string;
  minHeadingLevel?: MarkdownHeadingLevel;
  onChange: (nextMarkdown: string) => void;
  onBlur?: FocusEventHandler<HTMLTextAreaElement>;
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
  placeholder?: string;
  readOnly?: boolean;
  value: string;
}) {
  return (
    <textarea
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid || undefined}
      aria-readonly={readOnly || undefined}
      className={cn(
        "graph-markdown graph-markdown-editor min-h-32 w-full resize-y whitespace-pre-wrap rounded border border-input bg-bg px-3 py-2 font-mono text-sm leading-6 text-fg placeholder:text-muted-fg outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
        className,
      )}
      data-web-markdown-editor="textarea"
      data-web-markdown-source="textarea"
      onBlur={onBlur}
      onChange={(event) => onChange(event.currentTarget.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      readOnly={readOnly}
      spellCheck={false}
      value={value}
    />
  );
}
