const sourceSvgElementTags = [
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

const sourceSvgElementTagSet = new Set<string>(sourceSvgElementTags);

const sourceSvgAttributeNameMap: Record<string, string> = {
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

export type SourceSvgElementTag = (typeof sourceSvgElementTags)[number];

export type SourceSvgElement = {
  attributes: Record<string, string>;
  children: SourceSvgChild[];
  tagName: SourceSvgElementTag;
};

export type SourceSvgChild = SourceSvgElement | string;

export function parseSourceSvg(source: string | null | undefined): SourceSvgElement | null {
  const trimmed = source?.trim();

  if (!trimmed || trimmed.length > 50_000) {
    return null;
  }

  const parsed = parseSourceSvgMarkup(trimmed);

  return parsed?.tagName === "svg" ? parsed : null;
}

function parseSourceSvgMarkup(source: string): SourceSvgElement | null {
  let position = 0;
  let root: SourceSvgElement | null = null;
  const stack: SourceSvgElement[] = [];

  while (position < source.length) {
    const tagStart = source.indexOf("<", position);

    if (tagStart === -1) {
      if (!appendSourceSvgText(source.slice(position), stack)) {
        return null;
      }

      break;
    }

    if (!appendSourceSvgText(source.slice(position, tagStart), stack)) {
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

    const tagEnd = findSourceSvgTagEnd(source, tagStart + 1);

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

    if (!isSourceSvgElementTag(tagName)) {
      return null;
    }

    const attributes = parseSourceSvgAttributes(nameMatch[2]);

    if (!attributes) {
      return null;
    }

    const element: SourceSvgElement = { attributes, children: [], tagName };

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

  return stack.length === 0 ? root : null;
}

function appendSourceSvgText(text: string, stack: SourceSvgElement[]): boolean {
  if (!text || text.trim() === "") {
    return true;
  }

  const parent = stack[stack.length - 1];

  if (!parent || (parent.tagName !== "title" && parent.tagName !== "desc")) {
    return false;
  }

  parent.children.push(decodeSourceSvgEntities(text));
  return true;
}

function findSourceSvgTagEnd(source: string, start: number): number {
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

function isSourceSvgElementTag(tagName: string): tagName is SourceSvgElementTag {
  return sourceSvgElementTagSet.has(tagName);
}

function parseSourceSvgAttributes(attributeText: string): Record<string, string> | null {
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

    const sanitizedAttribute = sanitizeSourceSvgAttribute(
      rawName.toLowerCase(),
      decodeSourceSvgEntities(attributeText.slice(position, valueEnd)),
    );

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

function sanitizeSourceSvgAttribute(
  name: string,
  value: string,
): { name: string; value: string } | "unsafe" | null {
  if (name.startsWith("on") || name === "style") {
    return null;
  }

  if (isUnsafeSourceSvgAttributeValue(name, value)) {
    return "unsafe";
  }

  const reactName = sourceSvgAttributeNameMap[name];

  return reactName ? { name: reactName, value } : null;
}

function isUnsafeSourceSvgAttributeValue(name: string, value: string): boolean {
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

function decodeSourceSvgEntities(value: string): string {
  return value.replace(/&(#x?[0-9A-Fa-f]+|[A-Za-z]+);/g, (entity, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return decodeSourceSvgCodePoint(Number.parseInt(body.slice(2), 16), entity);
    }

    if (body.startsWith("#")) {
      return decodeSourceSvgCodePoint(Number.parseInt(body.slice(1), 10), entity);
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

function decodeSourceSvgCodePoint(codePoint: number, fallback: string): string {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return fallback;
  }

  return String.fromCodePoint(codePoint);
}
