"use client";

import { cn } from "@formless/ui/utils";
import { useEffect, useRef } from "react";
import { type Value } from "platejs";
import { Plate, PlateContent, usePlateEditor } from "platejs/react";

import { MarkdownFloatingToolbar } from "./markdown-floating-toolbar.js";
import { markdownPlateEditorComponents } from "./markdown-plate-components.js";
import { createMarkdownPlatePlugins } from "./markdown-plate-kit.js";
import {
  decorateMarkdownPlateValue,
  deserializeMarkdownToPlateValue,
  hasMarkdownHeadingBelowMinimum,
  normalizeMarkdownPlateValue,
  serializePlateValueToMarkdown,
  type MarkdownHeadingLevel,
  type MarkdownPlateValue,
} from "./markdown-plate-value.js";

export { MarkdownRenderer } from "./markdown-renderer.js";
export type { MarkdownHeadingLevel } from "./markdown-plate-value.js";

export function MarkdownEditor({
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  className,
  minHeadingLevel,
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
  onBlur?: React.FocusEventHandler<HTMLDivElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  placeholder?: string;
  readOnly?: boolean;
  value: string;
}) {
  const onChangeRef = useRef(onChange);
  const initialValueRef = useRef<MarkdownPlateValue | null>(null);
  const lastEmittedMarkdownRef = useRef<string | null>(null);
  const lastPropValueRef = useRef(value);
  const suppressChangeRef = useRef(false);

  if (initialValueRef.current === null) {
    initialValueRef.current = markdownStringToPlateValue(value, minHeadingLevel);
  }

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = usePlateEditor({
    components: markdownPlateEditorComponents,
    plugins: createMarkdownPlatePlugins(),
    value: initialValueRef.current,
  });

  useEffect(() => {
    if (value === lastPropValueRef.current) {
      return;
    }

    lastPropValueRef.current = value;

    if (value === lastEmittedMarkdownRef.current) {
      return;
    }

    suppressChangeRef.current = true;
    editor.tf.setValue(markdownStringToPlateValue(value, minHeadingLevel) as Value);
    editor.operations = [];
    editor.marks = null;

    if (editor.history) {
      editor.history.undos = [];
      editor.history.redos = [];
    }

    suppressChangeRef.current = false;
  }, [editor, minHeadingLevel, value]);

  return (
    <Plate
      editor={editor}
      readOnly={readOnly}
      onValueChange={({ value }) => {
        if (suppressChangeRef.current) {
          return;
        }

        const normalizedValue = normalizeMarkdownPlateValue(value, { minHeadingLevel });

        if (hasMarkdownHeadingBelowMinimum(value, minHeadingLevel)) {
          suppressChangeRef.current = true;
          editor.tf.setValue(normalizedValue as Value);
          editor.operations = [];
          suppressChangeRef.current = false;
        }

        const nextMarkdown = serializePlateValueToMarkdown(normalizedValue, { minHeadingLevel });

        lastEmittedMarkdownRef.current = nextMarkdown;
        onChangeRef.current(nextMarkdown);
      }}
    >
      <PlateContent
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid || undefined}
        aria-readonly={readOnly || undefined}
        className={cn(
          "graph-markdown graph-markdown-editor prose max-w-none dark:prose-invert",
          className,
        )}
        data-web-markdown-editor="plate"
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
      />
      <MarkdownFloatingToolbar />
    </Plate>
  );
}

function markdownStringToPlateValue(
  markdown: string,
  minHeadingLevel: MarkdownHeadingLevel | undefined,
): MarkdownPlateValue {
  return decorateMarkdownPlateValue(
    deserializeMarkdownToPlateValue(markdown, { minHeadingLevel }),
    markdown,
    {
      minHeadingLevel,
    },
  );
}
