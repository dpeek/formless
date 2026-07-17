import type { SitePublicRendererProps } from "@dpeek/formless-site-app";

import { publicSiteRendererPropsFixture } from "./public-site.ts";

export type AstryxPublicSitePageFixture = {
  rendererProps: SitePublicRendererProps;
};

export const publicSitePageFixture = {
  rendererProps: publicSiteRendererPropsFixture,
} satisfies AstryxPublicSitePageFixture;
