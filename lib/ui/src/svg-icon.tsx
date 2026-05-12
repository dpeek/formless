import { createElement, type ReactNode } from "react";

import { cn } from "./utils.js";

export const svgIconClassName = "inline-block size-5 shrink-0 align-middle text-current";

const svgElementTags = [
  "svg",
  "g",
  "path",
  "circle",
  "rect",
  "line",
  "polyline",
  "polygon",
  "ellipse",
  "title",
  "desc",
] as const;

const svgElementTagSet = new Set<string>(svgElementTags);

const svgAttributeNameMap: Record<string, string> = {
  "aria-hidden": "aria-hidden",
  "clip-rule": "clipRule",
  cliprule: "clipRule",
  cx: "cx",
  cy: "cy",
  d: "d",
  fill: "fill",
  "fill-opacity": "fillOpacity",
  "fill-rule": "fillRule",
  fillopacity: "fillOpacity",
  fillrule: "fillRule",
  height: "height",
  opacity: "opacity",
  points: "points",
  r: "r",
  rx: "rx",
  ry: "ry",
  stroke: "stroke",
  "stroke-dasharray": "strokeDasharray",
  "stroke-dashoffset": "strokeDashoffset",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "stroke-miterlimit": "strokeMiterlimit",
  "stroke-opacity": "strokeOpacity",
  "stroke-width": "strokeWidth",
  strokedasharray: "strokeDasharray",
  strokedashoffset: "strokeDashoffset",
  strokelinecap: "strokeLinecap",
  strokelinejoin: "strokeLinejoin",
  strokemiterlimit: "strokeMiterlimit",
  strokeopacity: "strokeOpacity",
  strokewidth: "strokeWidth",
  transform: "transform",
  viewbox: "viewBox",
  width: "width",
  x: "x",
  x1: "x1",
  x2: "x2",
  xmlns: "xmlns",
  y: "y",
  y1: "y1",
  y2: "y2",
};

export type SvgIconElementTag = (typeof svgElementTags)[number];

export type SvgIconElement = {
  attributes: Record<string, string>;
  children: SvgIconChild[];
  tagName: SvgIconElementTag;
};

type SvgIconChild = SvgIconElement | string;

export function SvgIcon({
  ariaLabel,
  className,
  source,
}: {
  ariaLabel?: string;
  className?: string;
  source?: string | null;
}) {
  const svg = parseSvgIconSource(source);

  if (!svg) {
    return <EmptySvgIcon ariaLabel={ariaLabel} className={className} />;
  }

  return renderSvgElement(svg, {
    ariaLabel,
    className,
    key: "svg",
    root: true,
  });
}

export function EmptySvgIcon({ ariaLabel, className }: { ariaLabel?: string; className?: string }) {
  return (
    <svg
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      className={cn(svgIconClassName, "text-muted-foreground", className)}
      data-web-svg-icon="empty"
      data-web-svg-icon-empty="true"
      fill="none"
      focusable="false"
      role={ariaLabel ? "img" : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
    >
      <rect height="15" rx="3" width="15" x="4.5" y="4.5" />
      <path d="M8.5 12h7" />
      <path d="M12 8.5v7" />
    </svg>
  );
}

export function parseSvgIconSource(source: string | null | undefined): SvgIconElement | null {
  const trimmed = source?.trim();

  if (!trimmed || trimmed.length > 50_000) {
    return null;
  }

  const parsed = parseSvgLikeMarkup(trimmed);

  if (!parsed || parsed.tagName !== "svg") {
    return null;
  }

  return parsed;
}

function renderSvgElement(
  element: SvgIconElement,
  context: {
    ariaLabel?: string;
    className?: string;
    key: string;
    root: boolean;
  },
): ReactNode {
  const children = element.children.map((child, index) => {
    if (typeof child === "string") {
      return child;
    }

    return renderSvgElement(child, {
      key: `${context.key}:${index}`,
      root: false,
    });
  });

  if (context.root) {
    return createElement(
      "svg",
      {
        ...element.attributes,
        "aria-hidden": context.ariaLabel ? undefined : true,
        "aria-label": context.ariaLabel,
        className: cn(svgIconClassName, context.className),
        "data-web-svg-icon": "svg",
        fill: element.attributes.fill ?? "currentColor",
        focusable: "false",
        key: context.key,
        role: context.ariaLabel ? "img" : undefined,
      },
      children,
    );
  }

  return createElement(element.tagName, { ...element.attributes, key: context.key }, children);
}

function parseSvgLikeMarkup(source: string): SvgIconElement | null {
  let position = 0;
  let root: SvgIconElement | null = null;
  const stack: SvgIconElement[] = [];

  while (position < source.length) {
    const tagStart = source.indexOf("<", position);

    if (tagStart === -1) {
      if (!appendSvgText(source.slice(position), stack)) {
        return null;
      }

      break;
    }

    if (!appendSvgText(source.slice(position, tagStart), stack)) {
      return null;
    }

    if (source.startsWith("<!--", tagStart)) {
      const commentEnd = source.indexOf("-->", tagStart + 4);

      if (commentEnd === -1) {
        return null;
      }

      position = commentEnd + 3;
      continue;
    }

    if (source.startsWith("<!", tagStart) || source.startsWith("<?", tagStart)) {
      return null;
    }

    const tagEnd = findSvgTagEnd(source, tagStart + 1);

    if (tagEnd === -1) {
      return null;
    }

    const tagContent = source.slice(tagStart + 1, tagEnd).trim();

    if (!tagContent) {
      return null;
    }

    if (tagContent.startsWith("/")) {
      const closingTagName = tagContent.slice(1).trim().toLowerCase();
      const openElement = stack.pop();

      if (!openElement || openElement.tagName !== closingTagName) {
        return null;
      }

      position = tagEnd + 1;
      continue;
    }

    const selfClosing = tagContent.endsWith("/");
    const elementContent = selfClosing ? tagContent.slice(0, -1).trimEnd() : tagContent;
    const nameMatch = /^([A-Za-z][A-Za-z0-9:-]*)([\s\S]*)$/.exec(elementContent);

    if (!nameMatch) {
      return null;
    }

    const tagName = nameMatch[1].toLowerCase();

    if (!isSvgElementTag(tagName)) {
      return null;
    }

    const attributes = parseSvgAttributes(nameMatch[2]);

    if (!attributes) {
      return null;
    }

    const element: SvgIconElement = {
      attributes,
      children: [],
      tagName,
    };

    if (stack.length > 0) {
      stack[stack.length - 1].children.push(element);
    } else if (root === null) {
      root = element;
    } else {
      return null;
    }

    if (!selfClosing) {
      stack.push(element);
    }

    position = tagEnd + 1;
  }

  if (stack.length > 0) {
    return null;
  }

  return root;
}

function appendSvgText(text: string, stack: SvgIconElement[]): boolean {
  if (!text) {
    return true;
  }

  if (text.trim() === "") {
    return true;
  }

  const parent = stack[stack.length - 1];

  if (!parent || (parent.tagName !== "title" && parent.tagName !== "desc")) {
    return false;
  }

  parent.children.push(decodeSvgEntities(text));
  return true;
}

function findSvgTagEnd(source: string, start: number): number {
  let quote: '"' | "'" | null = null;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];

    if (quote) {
      if (character === quote) {
        quote = null;
      }

      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === "<") {
      return -1;
    }

    if (character === ">") {
      return index;
    }
  }

  return -1;
}

function isSvgElementTag(tagName: string): tagName is SvgIconElementTag {
  return svgElementTagSet.has(tagName);
}

function parseSvgAttributes(attributeText: string): Record<string, string> | null {
  const attributes: Record<string, string> = {};
  let position = 0;

  while (position < attributeText.length) {
    while (/\s/.test(attributeText[position] ?? "")) {
      position += 1;
    }

    if (position >= attributeText.length) {
      break;
    }

    const nameMatch = /^[A-Za-z_:][A-Za-z0-9_.:-]*/.exec(attributeText.slice(position));

    if (!nameMatch) {
      return null;
    }

    const rawName = nameMatch[0];
    position += rawName.length;

    while (/\s/.test(attributeText[position] ?? "")) {
      position += 1;
    }

    if (attributeText[position] !== "=") {
      return null;
    }

    position += 1;

    while (/\s/.test(attributeText[position] ?? "")) {
      position += 1;
    }

    const quote = attributeText[position];

    if (quote !== '"' && quote !== "'") {
      return null;
    }

    position += 1;

    const valueEnd = attributeText.indexOf(quote, position);

    if (valueEnd === -1) {
      return null;
    }

    const value = decodeSvgEntities(attributeText.slice(position, valueEnd));
    const normalizedName = rawName.toLowerCase();
    const sanitizedAttribute = sanitizeSvgAttribute(normalizedName, value);

    if (sanitizedAttribute === "unsafe") {
      return null;
    }

    if (sanitizedAttribute) {
      attributes[sanitizedAttribute.name] = sanitizedAttribute.value;
    }

    position = valueEnd + 1;
  }

  return attributes;
}

function sanitizeSvgAttribute(
  name: string,
  value: string,
): { name: string; value: string } | "unsafe" | null {
  if (name.startsWith("on") || name === "style") {
    return null;
  }

  if (isUnsafeSvgAttributeValue(name, value)) {
    return "unsafe";
  }

  const reactName = svgAttributeNameMap[name];

  if (!reactName) {
    return null;
  }

  return {
    name: reactName,
    value,
  };
}

function isUnsafeSvgAttributeValue(name: string, value: string): boolean {
  const normalizedValue = Array.from(value)
    .filter((character) => character.charCodeAt(0) > 31 && !/\s/.test(character))
    .join("")
    .toLowerCase();

  if (normalizedValue.includes("javascript:") || normalizedValue.includes("data:")) {
    return true;
  }

  if (normalizedValue.includes("url(")) {
    return true;
  }

  if (name === "href" || name === "xlink:href" || name === "src") {
    return !normalizedValue.startsWith("#");
  }

  return false;
}

function decodeSvgEntities(value: string): string {
  return value.replace(/&(#x?[0-9A-Fa-f]+|[A-Za-z]+);/g, (entity, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const codePoint = Number.parseInt(body.slice(2), 16);
      return decodeSvgCodePoint(codePoint, entity);
    }

    if (body.startsWith("#")) {
      const codePoint = Number.parseInt(body.slice(1), 10);
      return decodeSvgCodePoint(codePoint, entity);
    }

    switch (body) {
      case "amp":
        return "&";
      case "apos":
        return "'";
      case "gt":
        return ">";
      case "lt":
        return "<";
      case "quot":
        return '"';
      default:
        return entity;
    }
  });
}

function decodeSvgCodePoint(codePoint: number, fallback: string): string {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return fallback;
  }

  return String.fromCodePoint(codePoint);
}
