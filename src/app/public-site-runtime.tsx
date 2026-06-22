import type { ElementType } from "react";

import {
  SitePageRoute as PackageSitePageRoute,
  type SitePublicRendererComponent,
  type SitePageLinkMode,
} from "@dpeek/formless-site-app/react";
import { appStorageIdentityForClientTarget, type ClientAppTarget } from "../client/app-target.ts";
import { listenForClientEvents } from "../client/broadcast.ts";
import { startPushSync } from "../client/sync.ts";
import { runtimeTopologyRoutes } from "../shared/runtime-topology.ts";

export type PublicSiteRouteProps = {
  linkMode?: SitePageLinkMode;
  renderer?: SitePublicRendererComponent;
  routeBase?: `/${string}`;
  slug: string;
  target?: ClientAppTarget;
};

export type PublicSiteReactAdapter = {
  renderer?: SitePublicRendererComponent;
  Route: ElementType<PublicSiteRouteProps>;
};

export type PublicSiteReactAdapterRegistry = ReadonlyMap<string, PublicSiteReactAdapter>;

export function createPublicSiteReactAdapterRegistry(
  siteRoute: ElementType<PublicSiteRouteProps> = CoreSitePageRoute,
  renderer?: SitePublicRendererComponent,
): PublicSiteReactAdapterRegistry {
  return new Map([[runtimeTopologyRoutes.publicSitePackageAppKey, { renderer, Route: siteRoute }]]);
}

export function publicSiteReactAdapterForPackageAppKey(
  packageAppKey: string,
  registry: PublicSiteReactAdapterRegistry = createPublicSiteReactAdapterRegistry(),
): PublicSiteReactAdapter | undefined {
  return registry.get(packageAppKey);
}

function CoreSitePageRoute({
  linkMode = "preview",
  renderer,
  routeBase,
  slug,
  target = "site",
}: PublicSiteRouteProps) {
  const identity = appStorageIdentityForClientTarget(target);

  return (
    <PackageSitePageRoute
      apiRoutePrefix={identity.apiRoutePrefix}
      linkMode={linkMode}
      listenForPreviewChanges={(onChanged) => listenForSitePreviewChanges(target, onChanged)}
      renderer={renderer}
      routeBase={routeBase}
      slug={slug}
      startPreviewSync={(onSynced) => startSitePreviewSync(target, onSynced)}
    />
  );
}

function startSitePreviewSync(target: ClientAppTarget, onSynced: () => void) {
  return startPushSync(target, { onSynced });
}

function listenForSitePreviewChanges(target: ClientAppTarget, onChanged: () => void) {
  return listenForClientEvents(target, (event) => {
    if (event.type === "records-updated" || event.type === "schema-updated") {
      onChanged();
    }
  });
}
