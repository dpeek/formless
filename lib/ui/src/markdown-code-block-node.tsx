"use client";

import { Button } from "@dpeek/formless-ui/button";
import { cn } from "@dpeek/formless-ui/utils";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";
import {
  PlateElement,
  PlateLeaf,
  type PlateElementProps,
  type PlateLeafProps,
} from "platejs/react";
import {
  SlateElement,
  SlateLeaf,
  type SlateElementProps,
  type SlateLeafProps,
} from "platejs/static";

import { parseMarkdownCodeInfo } from "./markdown-code-info.js";
import { markdownPlateNodeText, type MarkdownPlateElementNode } from "./markdown-plate-value.js";

type MarkdownCodeBlockElementProps = SlateElementProps<MarkdownPlateElementNode>;
type MarkdownEditableCodeBlockElementProps = PlateElementProps<MarkdownPlateElementNode>;

export function MarkdownCodeBlockElement(props: MarkdownCodeBlockElementProps) {
  const { element } = props;
  const markdownLanguage = stringNodeProperty(element, "markdownLanguage");
  const markdownMeta = stringNodeProperty(element, "markdownMeta");
  const codeInfo = parseMarkdownCodeInfo({
    language: markdownLanguage ?? stringNodeProperty(element, "lang"),
    meta: markdownMeta ?? stringNodeProperty(element, "meta"),
  });
  const code = codeBlockText(element);
  const attributes = {
    ...props.attributes,
    "data-code-block": "true",
    "data-highlight-language": codeInfo.highlightLanguage ?? undefined,
    "data-language": codeInfo.language ?? undefined,
  };

  return (
    <SlateElement
      {...props}
      attributes={attributes}
      as="div"
      className="not-prose graph-markdown-code-block"
    >
      <div className="graph-markdown-code-block-header" contentEditable={false}>
        {codeInfo.label ? (
          <span className="graph-markdown-code-block-label">{codeInfo.label}</span>
        ) : (
          <span aria-hidden="true" />
        )}
        <MarkdownCodeCopyButton code={code} />
      </div>
      <div className="graph-markdown-code-block-body">
        <pre className="graph-markdown-code-block-pre">
          <code>{props.children}</code>
        </pre>
      </div>
    </SlateElement>
  );
}

export function MarkdownCodeLineElement(props: SlateElementProps) {
  return <SlateElement {...props} as="span" className="graph-markdown-code-line" />;
}

export function MarkdownCodeSyntaxLeaf(props: SlateLeafProps) {
  const tokenClassName = typeof props.leaf.className === "string" ? props.leaf.className : "";

  return <SlateLeaf {...props} className={cn("graph-markdown-code-syntax", tokenClassName)} />;
}

export function MarkdownEditableCodeBlockElement(props: MarkdownEditableCodeBlockElementProps) {
  const { element } = props;
  const markdownLanguage = stringNodeProperty(element, "markdownLanguage");
  const markdownMeta = stringNodeProperty(element, "markdownMeta");
  const codeInfo = parseMarkdownCodeInfo({
    language: markdownLanguage ?? stringNodeProperty(element, "lang"),
    meta: markdownMeta ?? stringNodeProperty(element, "meta"),
  });
  const attributes = {
    ...props.attributes,
    "data-code-block": "true",
    "data-highlight-language": codeInfo.highlightLanguage ?? undefined,
    "data-language": codeInfo.language ?? undefined,
  };

  return (
    <PlateElement
      {...props}
      attributes={attributes}
      as="div"
      className="not-prose graph-markdown-code-block"
    >
      <div className="graph-markdown-code-block-header" contentEditable={false}>
        {codeInfo.label ? (
          <span className="graph-markdown-code-block-label">{codeInfo.label}</span>
        ) : (
          <span aria-hidden="true" />
        )}
      </div>
      <div className="graph-markdown-code-block-body">
        <pre className="graph-markdown-code-block-pre">
          <code>{props.children}</code>
        </pre>
      </div>
    </PlateElement>
  );
}

export function MarkdownEditableCodeLineElement(props: PlateElementProps) {
  return <PlateElement {...props} as="span" className="graph-markdown-code-line" />;
}

export function MarkdownEditableCodeSyntaxLeaf(props: PlateLeafProps) {
  const tokenClassName = typeof props.leaf.className === "string" ? props.leaf.className : "";

  return <PlateLeaf {...props} className={cn("graph-markdown-code-syntax", tokenClassName)} />;
}

function MarkdownCodeCopyButton({ code }: { code: string }) {
  const [copyState, setCopyState] = useState<"copied" | "failed" | "idle">("idle");

  useEffect(() => {
    if (copyState === "idle") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setCopyState("idle");
    }, 1500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [copyState]);

  const label =
    copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy code";

  async function copyCode(): Promise<void> {
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }

      await navigator.clipboard.writeText(code);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <Button
      aria-label={label}
      className="graph-markdown-code-block-copy-button"
      onClick={() => void copyCode()}
      size="icon-sm"
      title={label}
      type="button"
      variant="ghost"
    >
      {copyState === "copied" ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}

function codeBlockText(element: MarkdownPlateElementNode): string {
  return element.children.map(markdownPlateNodeText).join("\n");
}

function stringNodeProperty(element: MarkdownPlateElementNode, property: string): string | null {
  const value = element[property];

  return typeof value === "string" ? value : null;
}
