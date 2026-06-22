import type { ComponentType } from "react";

import type { SitePageLinkMode } from "./react/links.ts";
import type { SitePageTree } from "./types.ts";

export type SitePublicRendererRouteFacts = {
  linkMode?: SitePageLinkMode;
  routeBase?: `/${string}`;
};

export type SitePublicRendererProps = SitePublicRendererRouteFacts & {
  tree: SitePageTree;
};

export type SitePublicRendererComponent = ComponentType<SitePublicRendererProps>;
