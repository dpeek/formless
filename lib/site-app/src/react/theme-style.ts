import type { CSSProperties } from "react";

import type { SiteSettingsNode } from "../types.ts";
import type { PublicSiteTheme } from "./theme.ts";

type Rgb = {
  r: number;
  g: number;
  b: number;
};

type SiteThemeVariables = CSSProperties & Record<`--${string}`, string>;

const DEFAULT_ACCENT_COLOR = "#C98A2E";
const DEFAULT_BACKGROUND_COLOR = "#09090B";
const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const MINIMUM_LINK_CONTRAST = 4.5;
const hexColorPattern = /^#?(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/i;

export function publicSiteThemeVariables(
  site: SiteSettingsNode | undefined,
  theme: PublicSiteTheme,
): SiteThemeVariables {
  const accent = parseHexColor(site?.accentColor) ?? parseHexColor(DEFAULT_ACCENT_COLOR)!;
  const background =
    parseHexColor(site?.backgroundColor) ?? parseHexColor(DEFAULT_BACKGROUND_COLOR)!;
  const canvas = theme === "dark" ? darkCanvas(background) : lightCanvas(background);
  const link = readableAccent(accent, canvas);

  return {
    backgroundColor: "var(--site-bg)",
    "--site-bg": rgbCss(canvas),
    "--site-link": rgbCss(link),
    "--site-link-decoration": rgbaCss(link, 0.35),
    "--site-focus": rgbaCss(link, 0.45),
  };
}

function parseHexColor(value: string | undefined): Rgb | undefined {
  if (!value || !hexColorPattern.test(value.trim())) {
    return undefined;
  }

  const clean = expandHexColor(value).replace("#", "");

  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}

function expandHexColor(value: string): string {
  const clean = value.trim().replace(/^#/, "");

  if (clean.length === 3 || clean.length === 4) {
    return `#${clean
      .slice(0, 3)
      .split("")
      .map((part) => `${part}${part}`)
      .join("")
      .toUpperCase()}`;
  }

  return `#${clean.slice(0, 6).toUpperCase()}`;
}

function lightCanvas(background: Rgb): Rgb {
  return relativeLuminance(background) > 0.82 ? background : mix(background, WHITE, 0.97);
}

function darkCanvas(background: Rgb): Rgb {
  return relativeLuminance(background) < 0.08 ? background : mix(background, BLACK, 0.58);
}

function readableAccent(accent: Rgb, canvas: Rgb): Rgb {
  if (contrastRatio(accent, canvas) >= MINIMUM_LINK_CONTRAST) {
    return accent;
  }

  const target = relativeLuminance(canvas) > relativeLuminance(accent) ? BLACK : WHITE;

  for (let amount = 0.08; amount <= 1; amount += 0.08) {
    const candidate = mix(accent, target, amount);

    if (contrastRatio(candidate, canvas) >= MINIMUM_LINK_CONTRAST) {
      return candidate;
    }
  }

  return contrastRatio(BLACK, canvas) > contrastRatio(WHITE, canvas) ? BLACK : WHITE;
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return {
    r: Math.round(from.r + (to.r - from.r) * amount),
    g: Math.round(from.g + (to.g - from.g) * amount),
    b: Math.round(from.b + (to.b - from.b) * amount),
  };
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const light = Math.max(relativeLuminance(a), relativeLuminance(b));
  const dark = Math.min(relativeLuminance(a), relativeLuminance(b));

  return (light + 0.05) / (dark + 0.05);
}

function relativeLuminance(color: Rgb): number {
  const [r, g, b] = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255;

    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function rgbCss(color: Rgb): string {
  return `rgb(${color.r} ${color.g} ${color.b})`;
}

function rgbaCss(color: Rgb, alpha: number): string {
  return `rgb(${color.r} ${color.g} ${color.b} / ${alpha})`;
}
