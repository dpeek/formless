import * as stylex from "@stylexjs/stylex";
import { DropdownMenu, DropdownMenuItem } from "@astryxdesign/core/DropdownMenu";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import {
  colorVars,
  fontWeightVars,
  radiusVars,
  sizeVars,
  spacingVars,
  typeScaleVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { SourceIcon } from "./field-primitives.tsx";
import { astryxPresentationColors } from "./presentation-color.ts";

export type StateInputOption = {
  color?: string;
  colorToken?: string;
  label: string;
  source?: string;
};

export type StateInputTransition = {
  disabledReason?: string;
  id: string;
  isDisabled?: boolean;
  isHidden?: boolean;
  label: string;
  operationKey: string;
  pending?: {
    isPending: boolean;
  };
  targetValue: string;
};

export type StateInputProps = {
  label: string;
  value: string;
  option?: StateInputOption;
  stateLabel?: string;
  transitions: readonly StateInputTransition[];
  isCompact?: boolean;
  isDisabled?: boolean;
  isPending?: boolean;
  pendingLabel?: string;
  onTransition?: (transition: StateInputTransition) => void;
};

export function StateInput({
  label,
  value,
  option,
  stateLabel,
  transitions,
  isCompact = false,
  isDisabled = false,
  isPending = false,
  pendingLabel,
  onTransition,
}: StateInputProps) {
  const visibleTransitions = transitions.filter((transition) => !transition.isHidden);
  const stateText = option?.label ?? stateLabel ?? (value ? value : "No state");
  const colors = stateInputColors(value, option);
  const controlLabel = isPending
    ? `${label}: ${stateText}. ${pendingLabel ?? "Updating state"}`
    : `${label}: ${stateText}`;
  const isStatic = isDisabled || visibleTransitions.length === 0;
  const displayText = value && !option ? `Unknown: ${stateText}` : stateText;

  const staticContent = (
    <span {...stylex.props(styles.content, isCompact && styles.contentCompact)}>
      {option?.source ? (
        <span {...stylex.props(styles.icon)}>
          <StateIcon option={option} />
        </span>
      ) : null}
      <span {...stylex.props(styles.label)}>{displayText}</span>
    </span>
  );

  if (isStatic) {
    return (
      <span
        aria-label={controlLabel}
        role="status"
        {...stylex.props(
          styles.staticControl,
          isCompact && styles.staticControlCompact,
          dynamicStyles.color(colors.background, colors.foreground, colors.border),
        )}
      >
        {staticContent}
      </span>
    );
  }

  return (
    <DropdownMenu
      button={{
        label: displayText,
        variant: "secondary",
        size: isCompact ? "sm" : "md",
        isLoading: isPending,
        icon: option?.source ? <StateIcon option={option} /> : undefined,
        xstyle: [
          styles.trigger,
          isCompact && styles.triggerCompact,
          dynamicStyles.color(colors.background, colors.foreground, colors.border),
        ],
      }}
      hasChevron={false}
      menuWidth={248}
      placement="below"
    >
      {visibleTransitions.map((transition) => {
        const transitionIsDisabled =
          isDisabled || isPending || transition.isDisabled || transition.pending?.isPending;

        return (
          <DropdownMenuItem
            key={transition.id}
            label={transition.label}
            description={transition.disabledReason}
            icon={transition.pending?.isPending ? <Spinner size="sm" shade="inherit" /> : undefined}
            endContent={
              transition.pending?.isPending ? (
                <Text type="supporting" color="secondary">
                  Running
                </Text>
              ) : undefined
            }
            isDisabled={Boolean(transitionIsDisabled)}
            onClick={() => onTransition?.(transition)}
          />
        );
      })}
    </DropdownMenu>
  );
}

function StateIcon({ option }: { option: StateInputOption | undefined }) {
  if (option?.source) {
    return <SourceIcon source={option.source} size="sm" color="inherit" aria-hidden />;
  }

  return null;
}

type StateInputColor = {
  background: string;
  border: string;
  foreground: string;
};

function stateInputColors(value: string, option: StateInputOption | undefined): StateInputColor {
  const semanticColors = astryxPresentationColors(option?.colorToken);

  if (semanticColors) {
    return semanticColors;
  }

  if (option?.color) {
    return {
      background: option.color,
      border: option.color,
      foreground: readableTextColor(option.color),
    };
  }

  const normalizedValue = value.toLowerCase();

  if (["done", "complete", "completed", "published", "active"].includes(normalizedValue)) {
    return {
      background: colorVars["--color-success"],
      border: colorVars["--color-success"],
      foreground: colorVars["--color-on-success"],
    };
  }

  if (["blocked"].includes(normalizedValue)) {
    return {
      background: colorVars["--color-error"],
      border: colorVars["--color-error"],
      foreground: colorVars["--color-on-error"],
    };
  }

  if (["waiting", "queued", "review"].includes(normalizedValue)) {
    return {
      background: colorVars["--color-warning"],
      border: colorVars["--color-warning"],
      foreground: colorVars["--color-on-warning"],
    };
  }

  if (["open", "draft", "new"].includes(normalizedValue)) {
    return {
      background: colorVars["--color-accent"],
      border: colorVars["--color-accent"],
      foreground: colorVars["--color-on-accent"],
    };
  }

  return {
    background: colorVars["--color-neutral"],
    border: colorVars["--color-neutral"],
    foreground: colorVars["--color-text-primary"],
  };
}

function readableTextColor(color: string) {
  const rgb = parseHexColor(color);

  if (!rgb) {
    return colorVars["--color-on-dark"];
  }

  const luminance = (0.2126 * rgb.red + 0.7152 * rgb.green + 0.0722 * rgb.blue) / 255;

  return luminance > 0.58 ? colorVars["--color-on-light"] : colorVars["--color-on-dark"];
}

function parseHexColor(color: string) {
  const normalized = color.trim().replace(/^#/, "");

  if (/^[0-9a-fA-F]{3}$/.test(normalized)) {
    const [red, green, blue] = normalized
      .split("")
      .map((channel) => parseInt(`${channel}${channel}`, 16));

    return { red, green, blue };
  }

  if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return {
      red: parseInt(normalized.slice(0, 2), 16),
      green: parseInt(normalized.slice(2, 4), 16),
      blue: parseInt(normalized.slice(4, 6), 16),
    };
  }

  return null;
}

const styles = stylex.create({
  trigger: {
    borderRadius: radiusVars["--radius-full"],
  },
  triggerCompact: {
    minWidth: 0,
  },
  staticControl: {
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    height: sizeVars["--size-element-md"],
    borderRadius: radiusVars["--radius-full"],
    overflow: "hidden",
    paddingBlock: 0,
    paddingInline: spacingVars["--spacing-3"],
    fontFamily: "inherit",
    fontSize: typeScaleVars["--text-label-size"],
    lineHeight: typeScaleVars["--text-label-leading"],
    fontWeight: fontWeightVars["--font-weight-medium"],
  },
  staticControlCompact: {
    height: sizeVars["--size-element-sm"],
  },
  content: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
    gap: spacingVars["--spacing-1"],
  },
  contentCompact: {
    maxWidth: "100%",
  },
  label: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  icon: {
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
    lineHeight: 0,
  },
});

const dynamicStyles = stylex.create({
  color: (backgroundColor: string, color: string, borderColor: string) => ({
    backgroundColor,
    borderColor,
    color,
  }),
});
