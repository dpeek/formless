import type { ComponentType } from "react";

export type SitePublicSystemStateRendererProps =
  | {
      kind: "loading";
      slug: string;
    }
  | {
      homeHref: string;
      kind: "not-found";
      slug: string;
    }
  | {
      kind: "failure";
      message: string;
      slug: string;
    };

export type SitePublicSystemStateRendererComponent =
  ComponentType<SitePublicSystemStateRendererProps>;
