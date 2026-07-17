import { createElement, useMemo, type ReactNode, type SVGProps } from "react";
import * as stylex from "@stylexjs/stylex";
import { Icon, type IconProps, type IconType } from "@astryxdesign/core/Icon";
import { Markdown, type MarkdownProps } from "@astryxdesign/core/Markdown";
import { TextArea, type TextAreaProps } from "@astryxdesign/core/TextArea";
import {
  borderVars,
  colorVars,
  spacingVars,
  typographyDefaults,
  typographyVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { parseSourceSvg, type SourceSvgElement } from "@dpeek/formless-source-svg";
import type { AstryxInputDensity } from "./input-density.ts";

export type ColorValueDisplayProps = {
  label?: string;
  density?: AstryxInputDensity;
  swatchValue?: string;
};

export function ColorValueDisplay({
  label = "Color",
  density = "balanced",
  swatchValue,
}: ColorValueDisplayProps) {
  return (
    <div
      {...stylex.props(styles.colorDisplay, density === "compact" && styles.compactColorDisplay)}
      data-astryx-color-display="true"
      data-astryx-color-valid={swatchValue === undefined ? "false" : "true"}
    >
      <span
        aria-hidden={swatchValue === undefined ? true : undefined}
        aria-label={swatchValue === undefined ? undefined : `${label} color swatch`}
        role={swatchValue === undefined ? undefined : "img"}
        {...stylex.props(
          styles.colorSwatch,
          density === "compact" && styles.compactColorSwatch,
          swatchValue === undefined
            ? styles.emptyColorSwatch
            : dynamicStyles.colorSwatch(swatchValue),
        )}
      />
    </div>
  );
}

export type SourceIconProps = Omit<IconProps, "icon"> & {
  source?: string | null;
  fallbackIcon?: IconProps["icon"] | null;
};

export type SourceIconPresentation = {
  icon: IconProps["icon"];
  state: "invalid" | "unset" | "valid";
};

export function useSourceIconPresentation(
  source: string | null | undefined,
  fallbackIcon?: IconProps["icon"] | null,
): SourceIconPresentation {
  const hasSource = Boolean(source?.trim());
  const parsedSvg = useMemo(() => parseSourceSvg(source), [source]);

  return useMemo(
    () => ({
      icon:
        parsedSvg === null
          ? (fallbackIcon ?? (EmptySourceSvgIcon as unknown as IconProps["icon"]))
          : createSourceSvgIcon(parsedSvg),
      state: parsedSvg === null ? (hasSource ? "invalid" : "unset") : "valid",
    }),
    [fallbackIcon, hasSource, parsedSvg],
  );
}

export function SourceIcon({
  source,
  fallbackIcon,
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel,
  role,
  ...iconProps
}: SourceIconProps) {
  const presentation = useSourceIconPresentation(source, fallbackIcon);
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
      icon={presentation.icon}
      data-astryx-source-icon={presentation.state === "valid" ? "svg" : "empty"}
    />
  );
}

export function sourceIconIsRenderable(source: string | null | undefined) {
  return parseSourceSvg(source) !== null;
}

export type MarkdownFieldDisplayProps = Omit<MarkdownProps, "children" | "density"> & {
  value: string;
  density?: AstryxInputDensity;
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

export type MonospaceTextAreaProps = TextAreaProps;

const markdownInputTypography = stylex.createTheme(typographyVars, {
  "--font-family-body": typographyVars[
    "--font-family-code"
  ] as unknown as (typeof typographyDefaults)["--font-family-body"],
});

const markdownInputTypographyClassName = stylex.props(markdownInputTypography).className;

export function MonospaceTextArea({ className, ...textAreaProps }: MonospaceTextAreaProps) {
  return (
    <TextArea
      {...textAreaProps}
      className={[markdownInputTypographyClassName, className].filter(Boolean).join(" ")}
    />
  );
}

export function MarkdownInput({
  className,
  isDisabled = false,
  isReadOnly = false,
  hasSpellCheck = false,
  ...textAreaProps
}: MarkdownInputProps) {
  return (
    <MonospaceTextArea
      {...textAreaProps}
      className={className}
      hasSpellCheck={hasSpellCheck}
      isDisabled={isDisabled || isReadOnly}
      data-astryx-markdown-editor="textarea"
    />
  );
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
    borderRadius: "50%",
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
