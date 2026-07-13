import type { MouseEventHandler } from "react";
import * as stylex from "@stylexjs/stylex";
import { Icon } from "@astryxdesign/core/Icon";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import {
  colorVars,
  durationVars,
  easeVars,
  radiusVars,
  shadowVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { useSourceIconPresentation } from "./field-primitives.tsx";

export type IconPreviewSize = "compact" | "default" | "large";

export type IconPreviewProps = {
  label: string;
  source?: string | null;
  id?: string;
  isDecorative?: boolean;
  isDisabled?: boolean;
  isLoading?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  size?: IconPreviewSize;
  tooltip?: string;
};

type IconPreviewState = "invalid" | "unset" | "valid";

export function IconPreview({
  id,
  isDecorative = false,
  isDisabled = false,
  isLoading = false,
  label,
  onClick,
  size = "default",
  source,
  tooltip,
}: IconPreviewProps) {
  const presentation = useSourceIconPresentation(source);
  const state = presentation.state;
  const isInteractive = onClick !== undefined;
  const accessibleLabel = iconPreviewAccessibleLabel(label, state);
  const visual = (
    <div
      {...(isInteractive || isDecorative
        ? { "aria-hidden": true }
        : { "aria-label": accessibleLabel, role: "img" })}
      {...stylex.props(styles.visual)}
    >
      {isLoading ? (
        <Spinner shade="subtle" size="lg" />
      ) : state === "valid" ? (
        <Icon
          icon={presentation.icon}
          color="inherit"
          aria-hidden
          style={{ height: "100%", width: "100%" }}
        />
      ) : state === "invalid" ? (
        <Icon icon="error" color="error" size="lg" aria-hidden />
      ) : (
        <Icon icon={presentation.icon} color="inherit" size="lg" aria-hidden />
      )}
    </div>
  );
  const preview = (
    <div
      aria-hidden={isDecorative || undefined}
      data-astryx-icon-preview={isLoading ? "loading" : state}
      {...stylex.props(
        styles.root,
        size === "compact" && styles.compact,
        size === "large" && styles.large,
        isDisabled && styles.disabled,
      )}
    >
      <div
        {...stylex.props(
          styles.surface,
          state === "invalid" && styles.invalidSurface,
          isInteractive && !isDisabled && !isLoading && styles.interactive,
        )}
      >
        {isInteractive ? (
          <button
            id={id}
            type="button"
            aria-label={accessibleLabel}
            disabled={isDisabled || isLoading}
            onClick={onClick}
            {...stylex.props(styles.interactiveButton)}
          >
            {visual}
          </button>
        ) : (
          <div id={id} {...stylex.props(styles.staticContent)}>
            {visual}
          </div>
        )}
        <div {...stylex.props(styles.insetBorder)} />
      </div>
    </div>
  );

  return tooltip && !isDecorative ? <Tooltip content={tooltip}>{preview}</Tooltip> : preview;
}

function iconPreviewAccessibleLabel(label: string, state: IconPreviewState) {
  if (state === "invalid") {
    return `${label}, invalid SVG`;
  }

  if (state === "unset") {
    return `${label}, unset`;
  }

  return label;
}

const styles = stylex.create({
  root: {
    display: "inline-flex",
    flexShrink: 0,
    width: 64,
  },
  compact: {
    width: 48,
  },
  large: {
    width: 96,
  },
  surface: {
    aspectRatio: "1",
    backgroundColor: colorVars["--color-background-muted"],
    borderRadius: radiusVars["--radius-element"],
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  invalidSurface: {
    backgroundColor: colorVars["--color-error-muted"],
  },
  visual: {
    alignItems: "center",
    color: colorVars["--color-icon-secondary"],
    display: "flex",
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  staticContent: {
    height: "100%",
    width: "100%",
  },
  insetBorder: {
    borderRadius: "inherit",
    boxShadow: `inset 0 0 0 1px ${colorVars["--color-border"]}`,
    inset: 0,
    pointerEvents: "none",
    position: "absolute",
  },
  interactive: {
    cursor: "pointer",
    opacity: {
      default: 1,
      ":hover": {
        "@media (hover: hover)": 0.85,
      },
      ":active": 0.75,
    },
    outline: {
      default: null,
      ":has(:focus-visible)": `2px solid ${colorVars["--color-accent"]}`,
    },
    outlineOffset: {
      default: "0",
      ":has(:focus-visible)": "2px",
    },
    boxShadow: {
      default: "none",
      ":hover": {
        "@media (hover: hover)": shadowVars["--shadow-med"],
      },
    },
    transitionDuration: durationVars["--duration-fast"],
    transitionProperty: "opacity, box-shadow",
    transitionTimingFunction: easeVars["--ease-standard"],
  },
  interactiveButton: {
    all: "unset",
    borderRadius: radiusVars["--radius-element"],
    cursor: "pointer",
    display: "block",
    height: "100%",
    overflow: "hidden",
    width: "100%",
  },
  disabled: {
    opacity: 0.5,
    pointerEvents: "none",
  },
});
