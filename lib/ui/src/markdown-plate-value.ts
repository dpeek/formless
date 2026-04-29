import type { Value } from "platejs";

import { lowlightLanguageForMarkdownCode } from "./markdown-code-info.js";
import { createMarkdownPlateEditor } from "./markdown-plate-kit.js";

export type MarkdownPlateTextNode = {
  text: string;
  [key: string]: unknown;
};

export type MarkdownPlateElementNode = {
  children: MarkdownPlateNode[];
  type: string;
  [key: string]: unknown;
};

export type MarkdownPlateNode = MarkdownPlateElementNode | MarkdownPlateTextNode;

export type MarkdownPlateValue = MarkdownPlateElementNode[];
export type MarkdownHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type MarkdownPlateOptions = {
  readonly minHeadingLevel?: MarkdownHeadingLevel;
};

export function emptyMarkdownPlateValue(): MarkdownPlateValue {
  return [
    {
      children: [{ text: "" }],
      type: "p",
    },
  ];
}

export function deserializeMarkdownToPlateValue(
  markdown: string,
  options: MarkdownPlateOptions = {},
): MarkdownPlateValue {
  if (!markdown.trim()) {
    return emptyMarkdownPlateValue();
  }

  const editor = createMarkdownPlateEditor();
  const value = editor.api.markdown.deserialize(markdown, {
    withoutMdx: true,
  });

  return normalizeMarkdownPlateValue(value, options);
}

export function serializePlateValueToMarkdown(
  value: unknown,
  options: MarkdownPlateOptions = {},
): string {
  const normalizedValue = normalizeMarkdownPlateValue(value, options);

  if (isEmptyParagraphValue(normalizedValue)) {
    return "";
  }

  const editor = createMarkdownPlateEditor();

  return editor.api.markdown.serialize({ value: normalizedValue as Value }).trimEnd();
}

export function normalizeMarkdownPlateValue(
  value: unknown,
  options: MarkdownPlateOptions = {},
): MarkdownPlateValue {
  if (!Array.isArray(value)) {
    return emptyMarkdownPlateValue();
  }

  const normalizedValue = value
    .map((node) => normalizeTopLevelNode(node))
    .map((node) => (node ? applyMarkdownPlateOptions(node, options) : null))
    .filter((node): node is MarkdownPlateElementNode => node !== null);

  return normalizedValue.length > 0 ? normalizedValue : emptyMarkdownPlateValue();
}

export function decorateMarkdownPlateValue(
  value: unknown,
  sourceMarkdown = "",
  options: MarkdownPlateOptions = {},
): MarkdownPlateValue {
  const codeBlockMetadata = extractMarkdownCodeBlockMetadata(sourceMarkdown);
  let codeBlockIndex = 0;
  const headingSlugger = createHeadingSlugger();

  return normalizeMarkdownPlateValue(value, options).map((node) =>
    decorateMarkdownPlateNode(node, {
      headingSlugger,
      nextCodeBlockMetadata() {
        return codeBlockMetadata[codeBlockIndex++] ?? null;
      },
    }),
  );
}

export function markdownPlateNodeText(node: unknown): string {
  if (Array.isArray(node)) {
    return node.map(markdownPlateNodeText).join("");
  }

  if (!isRecord(node)) {
    return "";
  }

  if (typeof node.text === "string") {
    return node.text;
  }

  return Array.isArray(node.children) ? node.children.map(markdownPlateNodeText).join("") : "";
}

export function hasMarkdownHeadingBelowMinimum(
  value: unknown,
  minHeadingLevel: MarkdownHeadingLevel | undefined,
): boolean {
  if (!minHeadingLevel) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((node) => hasMarkdownHeadingBelowMinimum(node, minHeadingLevel));
  }

  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.type === "string") {
    const level = headingLevel(value.type);
    if (level !== null && level < minHeadingLevel) {
      return true;
    }
  }

  return Array.isArray(value.children)
    ? value.children.some((node) => hasMarkdownHeadingBelowMinimum(node, minHeadingLevel))
    : false;
}

function normalizeTopLevelNode(node: unknown): MarkdownPlateElementNode | null {
  const normalizedNode = normalizePlateNode(node);

  if (!normalizedNode) {
    return null;
  }

  if (isMarkdownPlateTextNode(normalizedNode)) {
    return {
      children: [normalizedNode],
      type: "p",
    };
  }

  return normalizedNode;
}

function normalizePlateNode(node: unknown): MarkdownPlateNode | null {
  if (!isRecord(node)) {
    return null;
  }

  if (typeof node.text === "string") {
    return {
      ...node,
      text: node.text,
    };
  }

  if (!Array.isArray(node.children)) {
    return null;
  }

  const children = node.children
    .map((child) => normalizePlateNode(child))
    .filter((child): child is MarkdownPlateNode => child !== null);

  return {
    ...node,
    children: children.length > 0 ? children : [{ text: "" }],
    type: typeof node.type === "string" ? node.type : "p",
  };
}

function applyMarkdownPlateOptions(
  node: MarkdownPlateElementNode,
  options: MarkdownPlateOptions,
): MarkdownPlateElementNode {
  const children = node.children.map((child) =>
    isMarkdownPlateTextNode(child) ? child : applyMarkdownPlateOptions(child, options),
  );
  const type = normalizeHeadingType(node.type, options.minHeadingLevel);

  return {
    ...node,
    children,
    type,
  };
}

function isEmptyParagraphValue(value: MarkdownPlateValue): boolean {
  const paragraph = value[0];
  const child = paragraph?.children[0];

  return (
    value.length === 1 &&
    paragraph?.type === "p" &&
    paragraph.children.length === 1 &&
    child !== undefined &&
    isMarkdownPlateTextNode(child) &&
    child.text === ""
  );
}

function isMarkdownPlateTextNode(node: MarkdownPlateNode): node is MarkdownPlateTextNode {
  return "text" in node;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringNodeProperty(node: MarkdownPlateElementNode, property: string): string | null {
  const value = node[property];

  return typeof value === "string" ? value : null;
}

type MarkdownCodeBlockMetadata = {
  language: string | null;
  meta: string | null;
};

type MarkdownPlateDecorationContext = {
  headingSlugger: ReturnType<typeof createHeadingSlugger>;
  nextCodeBlockMetadata(): MarkdownCodeBlockMetadata | null;
};

function decorateMarkdownPlateNode(
  node: MarkdownPlateElementNode,
  context: MarkdownPlateDecorationContext,
): MarkdownPlateElementNode {
  const decoratedChildren = node.children.map((child) =>
    isMarkdownPlateTextNode(child) ? { ...child } : decorateMarkdownPlateNode(child, context),
  );
  const decoratedNode: MarkdownPlateElementNode = {
    ...node,
    children: decoratedChildren,
  };

  if (isHeadingNode(decoratedNode)) {
    decoratedNode.headingId = context.headingSlugger.slug(markdownPlateNodeText(decoratedNode));
  }

  if (decoratedNode.type === "code_block") {
    const metadata = context.nextCodeBlockMetadata();
    const markdownLanguage =
      stringNodeProperty(decoratedNode, "markdownLanguage") ??
      metadata?.language ??
      stringNodeProperty(decoratedNode, "lang");
    const markdownMeta =
      stringNodeProperty(decoratedNode, "markdownMeta") ??
      metadata?.meta ??
      stringNodeProperty(decoratedNode, "meta");

    decoratedNode.lang = lowlightLanguageForMarkdownCode({
      language: markdownLanguage,
      meta: markdownMeta,
    });

    if (markdownLanguage) {
      decoratedNode.markdownLanguage = markdownLanguage;
    }

    if (markdownMeta) {
      decoratedNode.markdownMeta = markdownMeta;
    }
  }

  return decoratedNode;
}

function isHeadingNode(node: MarkdownPlateElementNode): boolean {
  return /^h[1-6]$/.test(node.type);
}

function headingLevel(type: string): MarkdownHeadingLevel | null {
  if (!/^h[1-6]$/.test(type)) {
    return null;
  }

  return Number(type.slice(1)) as MarkdownHeadingLevel;
}

function normalizeHeadingType(type: string, minHeadingLevel: MarkdownHeadingLevel | undefined) {
  const level = headingLevel(type);

  if (level === null || !minHeadingLevel || level >= minHeadingLevel) {
    return type;
  }

  return `h${minHeadingLevel}`;
}

function createHeadingSlugger() {
  const occurrences = new Map<string, number>();

  return {
    slug(value: string): string {
      const baseSlug = githubStyleSlug(value);
      const previousOccurrences = occurrences.get(baseSlug);

      if (previousOccurrences === undefined) {
        occurrences.set(baseSlug, 0);
        return baseSlug;
      }

      const nextOccurrences = previousOccurrences + 1;
      occurrences.set(baseSlug, nextOccurrences);

      return `${baseSlug}-${nextOccurrences}`;
    },
  };
}

function githubStyleSlug(value: string): string {
  return Array.from(value.toLowerCase())
    .filter((character) => {
      const code = character.charCodeAt(0);

      return !(
        code <= 0x1f ||
        (code >= 0x21 && code <= 0x2f) ||
        (code >= 0x3a && code <= 0x40) ||
        (code >= 0x5b && code <= 0x5e) ||
        code === 0x60 ||
        (code >= 0x7b && code <= 0x7e)
      );
    })
    .join("")
    .replaceAll(" ", "-");
}

function extractMarkdownCodeBlockMetadata(markdown: string): MarkdownCodeBlockMetadata[] {
  const metadata: MarkdownCodeBlockMetadata[] = [];
  const lines = markdown.split(/\r\n|\r|\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const openingFence = parseOpeningFenceLine(lines[index] ?? "");

    if (!openingFence) {
      continue;
    }

    metadata.push(parseCodeBlockInfo(openingFence.info));

    while (index + 1 < lines.length) {
      index += 1;

      if (isClosingFenceLine(lines[index] ?? "", openingFence.character, openingFence.length)) {
        break;
      }
    }
  }

  return metadata;
}

function parseOpeningFenceLine(
  line: string,
): { character: "`" | "~"; info: string; length: number } | null {
  const match = /^(?: {0,3})(`{3,}|~{3,})(.*)$/.exec(line);

  if (!match) {
    return null;
  }

  const fence = match[1] ?? "";
  const info = match[2] ?? "";
  const character = fence[0] === "~" ? "~" : "`";

  if (character === "`" && info.includes("`")) {
    return null;
  }

  return {
    character,
    info: info.trim(),
    length: fence.length,
  };
}

function isClosingFenceLine(line: string, character: "`" | "~", length: number): boolean {
  const trimmedIndent = line.replace(/^ {0,3}/, "");
  let fenceLength = 0;

  while (trimmedIndent[fenceLength] === character) {
    fenceLength += 1;
  }

  return fenceLength >= length && trimmedIndent.slice(fenceLength).trim() === "";
}

function parseCodeBlockInfo(info: string): MarkdownCodeBlockMetadata {
  if (!info) {
    return { language: null, meta: null };
  }

  const firstWhitespace = info.search(/\s/);

  if (firstWhitespace === -1) {
    return { language: info, meta: null };
  }

  const language = info.slice(0, firstWhitespace).trim();
  const meta = info.slice(firstWhitespace + 1).trim();

  return {
    language: language || null,
    meta: meta || null,
  };
}
