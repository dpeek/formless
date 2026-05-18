import { parseSvgIconSource, type SvgIconElement } from "@dpeek/formless-ui/svg-icon";

export const DEFAULT_SITE_ICON_SVG =
  '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" rx="12" fill="#111827"/><path d="M18 42V22h28v6H25v8h17v6H18Z" fill="#fff"/></svg>';

const svgAttributeNameMap: Record<string, string> = {
  "aria-hidden": "aria-hidden",
  clipRule: "clip-rule",
  cx: "cx",
  cy: "cy",
  d: "d",
  fill: "fill",
  fillOpacity: "fill-opacity",
  fillRule: "fill-rule",
  height: "height",
  opacity: "opacity",
  points: "points",
  r: "r",
  rx: "rx",
  ry: "ry",
  stroke: "stroke",
  strokeDasharray: "stroke-dasharray",
  strokeDashoffset: "stroke-dashoffset",
  strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin",
  strokeMiterlimit: "stroke-miterlimit",
  strokeOpacity: "stroke-opacity",
  strokeWidth: "stroke-width",
  transform: "transform",
  viewBox: "viewBox",
  width: "width",
  x: "x",
  x1: "x1",
  x2: "x2",
  xmlns: "xmlns",
  y: "y",
  y1: "y1",
  y2: "y2",
};

export function resolveSiteIconSvgSource(source: string | null | undefined): string {
  return (
    sanitizeSiteIconSvgSource(source) ??
    sanitizeSiteIconSvgSource(DEFAULT_SITE_ICON_SVG) ??
    DEFAULT_SITE_ICON_SVG
  );
}

export function sanitizeSiteIconSvgSource(source: string | null | undefined): string | undefined {
  const parsed = parseSvgIconSource(source);

  return parsed ? serializeSvgElement(parsed, { root: true }) : undefined;
}

function serializeSvgElement(element: SvgIconElement, options: { root?: boolean } = {}): string {
  const attributes = { ...element.attributes };

  if (options.root && !attributes.xmlns) {
    attributes.xmlns = "http://www.w3.org/2000/svg";
  }

  const serializedAttributes = Object.entries(attributes)
    .map(([name, value]) => {
      const svgName = svgAttributeNameMap[name];

      return svgName ? ` ${svgName}="${escapeSvgAttribute(value)}"` : "";
    })
    .join("");
  const children = element.children
    .map((child) =>
      typeof child === "string"
        ? escapeSvgText(child)
        : serializeSvgElement(child, { root: false }),
    )
    .join("");

  return `<${element.tagName}${serializedAttributes}>${children}</${element.tagName}>`;
}

function escapeSvgText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeSvgAttribute(value: string): string {
  return escapeSvgText(value).replaceAll('"', "&quot;");
}
