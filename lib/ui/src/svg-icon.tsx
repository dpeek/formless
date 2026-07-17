import { createElement, type ReactNode } from "react";

import {
  parseSourceSvg,
  type SourceSvgElement,
  type SourceSvgElementTag,
} from "@dpeek/formless-source-svg";

import { cn } from "./primitive";

export const svgIconClassName = "inline-block size-5 shrink-0 align-middle text-current";

export type SvgIconElementTag = SourceSvgElementTag;
export type SvgIconElement = SourceSvgElement;

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
      className={cn(svgIconClassName, "text-muted-fg", className)}
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

export const parseSvgIconSource = parseSourceSvg;

function renderSvgElement(
  element: SourceSvgElement,
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
