import type { ElementType } from "react";

import {
  SitePageRoute as PackageSitePageRoute,
  type SitePageLinkMode,
} from "@dpeek/formless-site-app/react";
import { appStorageIdentityForClientTarget, type ClientAppTarget } from "../client/app-target.ts";
import { listenForClientEvents } from "../client/broadcast.ts";
import { startPushSync } from "../client/sync.ts";
import { runtimeTopologyRoutes } from "../shared/runtime-topology.ts";

export type PublicSiteRouteProps = {
  linkMode?: SitePageLinkMode;
  routeBase?: `/${string}`;
  slug: string;
  target?: ClientAppTarget;
};

export type PublicSiteReactAdapter = {
  Route: ElementType<PublicSiteRouteProps>;
};

export type PublicSiteReactAdapterRegistry = ReadonlyMap<string, PublicSiteReactAdapter>;

export function createPublicSiteReactAdapterRegistry(
  siteRoute: ElementType<PublicSiteRouteProps> = CoreSitePageRoute,
): PublicSiteReactAdapterRegistry {
  return new Map([[runtimeTopologyRoutes.publicSitePackageAppKey, { Route: siteRoute }]]);
}

export function publicSiteReactAdapterForPackageAppKey(
  packageAppKey: string,
  registry: PublicSiteReactAdapterRegistry = createPublicSiteReactAdapterRegistry(),
): PublicSiteReactAdapter | undefined {
  return registry.get(packageAppKey);
}

function CoreSitePageRoute({
  linkMode = "preview",
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
