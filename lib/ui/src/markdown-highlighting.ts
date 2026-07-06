import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import scss from "highlight.js/lib/languages/scss";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { createLowlight } from "lowlight";

export const markdownLowlight = createLowlight();

// Lowlight core needs explicit Highlight.js grammars for the renderer.
markdownLowlight.register({
  bash,
  css,
  diff,
  javascript,
  json,
  markdown,
  scss,
  sql,
  typescript,
  xml,
  yaml,
});

type HighlightNode = {
  children?: HighlightNode[];
  properties?: Record<string, unknown>;
  tagName?: string;
  type?: string;
  value?: string;
};

export function isMarkdownHighlightLanguageRegistered(language: string): boolean {
  return markdownLowlight.registered(language);
}

export function highlightMarkdownCodeHtml(code: string, language: string): string | null {
  if (!markdownLowlight.registered(language)) {
    return null;
  }

  try {
    return highlightNodeToHtml(markdownLowlight.highlight(language, code) as HighlightNode);
  } catch {
    return null;
  }
}

function highlightNodeToHtml(node: HighlightNode): string {
  if (node.type === "text") {
    return escapeHtml(node.value ?? "");
  }

  const children = node.children?.map(highlightNodeToHtml).join("") ?? "";

  if (node.type !== "element" || node.tagName !== "span") {
    return children;
  }

  const className = highlightClassName(node.properties);
  const classAttribute = className ? ` class="${className}"` : "";

  return `<span${classAttribute}>${children}</span>`;
}

function highlightClassName(properties: Record<string, unknown> | undefined): string | null {
  const className = properties?.className;
  const names = Array.isArray(className)
    ? className
    : typeof className === "string"
      ? className.split(/\s+/)
      : [];
  const safeNames = names.filter(
    (name): name is string => typeof name === "string" && /^hljs[\w-]*$/.test(name),
  );

  return safeNames.length > 0 ? safeNames.join(" ") : null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
