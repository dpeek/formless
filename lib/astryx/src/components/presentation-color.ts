import { colorVars } from "@astryxdesign/core/theme/tokens.stylex";

export type AstryxPresentationColors = {
  background: string;
  border: string;
  foreground: string;
  visual: string;
};

const paletteColors = {
  blue: {
    background: colorVars["--color-background-blue"],
    border: colorVars["--color-border-blue"],
    foreground: colorVars["--color-text-blue"],
    visual: colorVars["--color-icon-blue"],
  },
  cyan: {
    background: colorVars["--color-background-cyan"],
    border: colorVars["--color-border-cyan"],
    foreground: colorVars["--color-text-cyan"],
    visual: colorVars["--color-icon-cyan"],
  },
  gray: {
    background: colorVars["--color-background-gray"],
    border: colorVars["--color-border-gray"],
    foreground: colorVars["--color-text-gray"],
    visual: colorVars["--color-icon-gray"],
  },
  green: {
    background: colorVars["--color-background-green"],
    border: colorVars["--color-border-green"],
    foreground: colorVars["--color-text-green"],
    visual: colorVars["--color-icon-green"],
  },
  orange: {
    background: colorVars["--color-background-orange"],
    border: colorVars["--color-border-orange"],
    foreground: colorVars["--color-text-orange"],
    visual: colorVars["--color-icon-orange"],
  },
  pink: {
    background: colorVars["--color-background-pink"],
    border: colorVars["--color-border-pink"],
    foreground: colorVars["--color-text-pink"],
    visual: colorVars["--color-icon-pink"],
  },
  purple: {
    background: colorVars["--color-background-purple"],
    border: colorVars["--color-border-purple"],
    foreground: colorVars["--color-text-purple"],
    visual: colorVars["--color-icon-purple"],
  },
  red: {
    background: colorVars["--color-background-red"],
    border: colorVars["--color-border-red"],
    foreground: colorVars["--color-text-red"],
    visual: colorVars["--color-icon-red"],
  },
  teal: {
    background: colorVars["--color-background-teal"],
    border: colorVars["--color-border-teal"],
    foreground: colorVars["--color-text-teal"],
    visual: colorVars["--color-icon-teal"],
  },
  yellow: {
    background: colorVars["--color-background-yellow"],
    border: colorVars["--color-border-yellow"],
    foreground: colorVars["--color-text-yellow"],
    visual: colorVars["--color-icon-yellow"],
  },
} satisfies Record<string, AstryxPresentationColors>;

const statusColors = {
  danger: {
    background: colorVars["--color-error"],
    border: colorVars["--color-error"],
    foreground: colorVars["--color-on-error"],
    visual: colorVars["--color-error"],
  },
  error: {
    background: colorVars["--color-error"],
    border: colorVars["--color-error"],
    foreground: colorVars["--color-on-error"],
    visual: colorVars["--color-error"],
  },
  success: {
    background: colorVars["--color-success"],
    border: colorVars["--color-success"],
    foreground: colorVars["--color-on-success"],
    visual: colorVars["--color-success"],
  },
  warning: {
    background: colorVars["--color-warning"],
    border: colorVars["--color-warning"],
    foreground: colorVars["--color-on-warning"],
    visual: colorVars["--color-warning"],
  },
} satisfies Record<string, AstryxPresentationColors>;

export function astryxPresentationColors(
  token: string | undefined,
): AstryxPresentationColors | undefined {
  if (!token) {
    return undefined;
  }

  return (
    paletteColors[token as keyof typeof paletteColors] ??
    statusColors[token as keyof typeof statusColors]
  );
}
