declare module "virtual:formless/site-public-renderer/browser" {
  import type { SitePublicRendererComponent } from "@dpeek/formless-site-app/react";

  export const sitePublicRenderer: SitePublicRendererComponent | undefined;
}

declare module "virtual:formless/site-public-renderer/worker" {
  import type { SitePublicRendererComponent } from "@dpeek/formless-site-app/worker";

  export const sitePublicRenderer: SitePublicRendererComponent | undefined;
}
