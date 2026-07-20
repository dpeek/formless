import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import {
  publicSiteThemePalette,
  type PublicSiteThemeMode,
  type SiteSettingsNode,
} from "@dpeek/formless-site-app";
import type { CSSProperties, ReactNode } from "react";

export type FormlessSiteRendererProviderProps = {
  children: ReactNode;
  mode: PublicSiteThemeMode;
  site?: SiteSettingsNode;
};

type PublicSiteProviderStyle = CSSProperties & Record<`--formless-public-site-${string}`, string>;

export function FormlessSiteRendererProvider({
  children,
  mode,
  site,
}: FormlessSiteRendererProviderProps) {
  const palette = publicSiteThemePalette(site, mode);
  const style = {
    colorScheme: mode,
    "--formless-public-site-accent": palette.accent,
    "--formless-public-site-background": palette.background,
    "--formless-public-site-focus": palette.focus,
    "--formless-public-site-link": palette.link,
    "--formless-public-site-link-decoration": palette.linkDecoration,
    "--formless-public-site-on-accent": palette.onAccent,
  } satisfies PublicSiteProviderStyle;

  return (
    <Theme theme={neutralTheme} mode={mode}>
      <div
        data-astryx-public-site-provider
        data-formless-native-navigation
        data-site-theme={mode}
        style={style}
      >
        {children}
      </div>
    </Theme>
  );
}
