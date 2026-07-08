import {
  createElement,
  useMemo,
  type ReactNode,
  type SVGProps,
} from "react";
import * as stylex from "@stylexjs/stylex";
import { Icon, type IconProps, type IconType } from "@astryxdesign/core/Icon";
import { Markdown, type MarkdownProps } from "@astryxdesign/core/Markdown";
import { TextArea, type TextAreaProps } from "@astryxdesign/core/TextArea";
import { Text } from "@astryxdesign/core/Text";
import {
  borderVars,
  colorVars,
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import type { AstryxFieldDensity } from "../field-contract.ts";
import { opaqueHexColorForNativeInput } from "./color-input.tsx";

export { ColorInput, type ColorInputProps } from "./color-input.tsx";

export type ColorValueDisplayProps = {
  value: string;
  label?: string;
  density?: AstryxFieldDensity;
  emptyLabel?: string;
};

export function ColorValueDisplay({
  value,
  label = "Color",
  density = "balanced",
  emptyLabel = "Empty",
}: ColorValueDisplayProps) {
  const swatchColor = opaqueHexColorForNativeInput(value);
  const displayValue = value || emptyLabel;

  return (
    <div
      {...stylex.props(styles.colorDisplay, density === "compact" && styles.compactColorDisplay)}
      data-astryx-color-display="true"
      data-astryx-color-valid={swatchColor ? "true" : "false"}
    >
      <span
        aria-hidden={swatchColor ? undefined : true}
        aria-label={swatchColor ? `${label} color swatch` : undefined}
        role={swatchColor ? "img" : undefined}
        {...stylex.props(
          styles.colorSwatch,
          density === "compact" && styles.compactColorSwatch,
          swatchColor ? dynamicStyles.colorSwatch(swatchColor) : null,
          !swatchColor && styles.emptyColorSwatch,
        )}
      />
      <Text type={density === "compact" ? "supporting" : "body"} maxLines={1}>
        {displayValue}
      </Text>
    </div>
  );
}

export type SourceIconProps = Omit<IconProps, "icon"> & {
  source?: string | null;
  fallbackIcon?: IconProps["icon"] | null;
};

export function SourceIcon({
  source,
  fallbackIcon,
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel,
  role,
  ...iconProps
}: SourceIconProps) {
  const parsedSvg = useMemo(() => parseSourceSvg(source), [source]);
  const sourceIcon = useMemo<IconProps["icon"]>(() => {
    if (parsedSvg) {
      return createSourceSvgIcon(parsedSvg);
    }

    return fallbackIcon ?? (EmptySourceSvgIcon as unknown as IconProps["icon"]);
  }, [fallbackIcon, parsedSvg]);
  const accessibilityProps =
    ariaLabel !== undefined
      ? { "aria-hidden": ariaHidden, "aria-label": ariaLabel, role: role ?? "img" }
      : ariaHidden !== undefined || role !== undefined
        ? { "aria-hidden": ariaHidden, role }
        : {};

  return (
    <Icon
      {...iconProps}
      {...accessibilityProps}
      icon={sourceIcon}
      data-astryx-source-icon={parsedSvg ? "svg" : "empty"}
    />
  );
}

export type MarkdownFieldDisplayProps = Omit<MarkdownProps, "children" | "density"> & {
  value: string;
  density?: AstryxFieldDensity;
};

export function MarkdownFieldDisplay({
  value,
  density = "balanced",
  contentWidth = "100%",
  headingLevelStart = 3,
  ...markdownProps
}: MarkdownFieldDisplayProps) {
  return (
    <div
      {...stylex.props(styles.markdownDisplay, density === "compact" && styles.compactMarkdown)}
      data-astryx-markdown-display="true"
    >
      <Markdown
        {...markdownProps}
        contentWidth={contentWidth}
        density={density === "compact" ? "compact" : "default"}
        headingLevelStart={headingLevelStart}
      >
        {value}
      </Markdown>
    </div>
  );
}

export type MarkdownInputProps = Omit<TextAreaProps, "htmlName"> & {
  isReadOnly?: boolean;
};

export function MarkdownInput({
  isDisabled = false,
  isReadOnly = false,
  hasSpellCheck = false,
  ...textAreaProps
}: MarkdownInputProps) {
  return (
    <TextArea
      {...textAreaProps}
      hasSpellCheck={hasSpellCheck}
      isDisabled={isDisabled || isReadOnly}
      data-astryx-markdown-editor="textarea"
    />
  );
}

type SourceSvgTag =
  | "svg"
  | "g"
  | "path"
  | "circle"
  | "rect"
  | "line"
  | "polyline"
  | "polygon"
  | "ellipse"
  | "title"
  | "desc";

type SourceSvgElement = {
  attributes: Record<string, string>;
  children: SourceSvgChild[];
  tagName: SourceSvgTag;
};

type SourceSvgChild = SourceSvgElement | string;

const sourceSvgTags = new Set<string>([
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
]);

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

function parseSourceSvg(source: string | null | undefined): SourceSvgElement | null {
  const trimmedSource = source?.trim();

  if (!trimmedSource || trimmedSource.length > 50_000 || typeof DOMParser === "undefined") {
    return null;
  }

  const document = new DOMParser().parseFromString(trimmedSource, "image/svg+xml");

  if (document.querySelector("parsererror")) {
    return null;
  }

  const root = readSourceSvgElement(document.documentElement);

  if (!root || root.tagName !== "svg") {
    return null;
  }

  return root;
}

function readSourceSvgElement(element: Element): SourceSvgElement | null {
  const tagName = element.localName.toLowerCase();

  if (!isSourceSvgTag(tagName)) {
    return null;
  }

  const attributes: Record<string, string> = {};

  for (const attribute of Array.from(element.attributes)) {
    const sanitizedAttribute = sanitizeSourceSvgAttribute(
      attribute.name.toLowerCase(),
      attribute.value,
    );

    if (sanitizedAttribute === "unsafe") {
      return null;
    }

    if (sanitizedAttribute) {
      attributes[sanitizedAttribute.name] = sanitizedAttribute.value;
    }
  }

  const children: SourceSvgChild[] = [];

  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === 1 && child instanceof Element) {
      const childElement = readSourceSvgElement(child);

      if (!childElement) {
        return null;
      }

      children.push(childElement);
      continue;
    }

    if (child.nodeType === 3) {
      const text = child.textContent ?? "";

      if (text.trim().length === 0) {
        continue;
      }

      if (tagName !== "title" && tagName !== "desc") {
        return null;
      }

      children.push(text);
    }
  }

  return {
    attributes,
    children,
    tagName,
  };
}

function isSourceSvgTag(tagName: string): tagName is SourceSvgTag {
  return sourceSvgTags.has(tagName);
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

  if (!reactName) {
    return null;
  }

  return {
    name: reactName,
    value,
  };
}

function isUnsafeSourceSvgAttributeValue(name: string, value: string) {
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

function createSourceSvgIcon(root: SourceSvgElement): IconType {
  const SourceSvgIcon = (props: SVGProps<SVGSVGElement>) =>
    renderSourceSvgElement(root, "source-icon", true, props);

  return SourceSvgIcon as unknown as IconType;
}

function renderSourceSvgElement(
  element: SourceSvgElement,
  key: string,
  isRoot: boolean,
  svgProps?: SVGProps<SVGSVGElement>,
): ReactNode {
  const children = element.children.map((child, index) => {
    if (typeof child === "string") {
      return child;
    }

    return renderSourceSvgElement(child, `${key}:${index}`, false);
  });

  if (isRoot) {
    return createElement(
      "svg",
      {
        ...element.attributes,
        fill: element.attributes.fill ?? "currentColor",
        focusable: "false",
        key,
        ...svgProps,
      },
      children,
    );
  }

  return createElement(element.tagName, { ...element.attributes, key }, children);
}

function EmptySourceSvgIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
      {...props}
    >
      <rect height="15" rx="3" width="15" x="4.5" y="4.5" />
      <path d="M8.5 12h7" />
      <path d="M12 8.5v7" />
    </svg>
  );
}

const styles = stylex.create({
  colorDisplay: {
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    gap: spacingVars["--spacing-2"],
    minHeight: spacingVars["--spacing-9"],
    minWidth: 0,
  },
  compactColorDisplay: {
    minHeight: spacingVars["--spacing-7"],
    gap: spacingVars["--spacing-1"],
  },
  colorSwatch: {
    flexShrink: 0,
    width: spacingVars["--spacing-5"],
    height: spacingVars["--spacing-5"],
    borderRadius: radiusVars["--radius-element"],
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: colorVars["--color-border-emphasized"],
  },
  compactColorSwatch: {
    width: spacingVars["--spacing-4"],
    height: spacingVars["--spacing-4"],
  },
  emptyColorSwatch: {
    backgroundColor: colorVars["--color-background-muted"],
  },
  markdownDisplay: {
    minWidth: 0,
  },
  compactMarkdown: {
    fontSize: "inherit",
  },
});

const dynamicStyles = stylex.create({
  colorSwatch: (color: string) => ({
    backgroundColor: color,
  }),
});
