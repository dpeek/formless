import { type ReactNode, useMemo } from "react";
import { ActiveAppSurface } from "./app-surface.tsx";
import {
  runtimeAppManagementHref,
  runtimeScreenPathFromRoute,
  type RuntimeProfile,
  type RuntimeWorldMount,
} from "./runtime-profile.ts";
import {
  appStorageIdentityForClientTarget,
  clientTargetForSchemaKey,
  clientTargetSourceSchemaKey,
} from "../client/app-target.ts";
import { useActiveClientStorageName, useActiveSchemaKey, useSchema } from "../client/store.ts";
import { selectPrimaryScreenModels } from "../client/views.ts";
import type { AppInstall, AppPackageResolver } from "@dpeek/formless-installed-apps";

export type GeneratedAppFrameProps = {
  activePackageResolver?: AppPackageResolver | undefined;
  children: ReactNode;
  currentPath: string;
  installedAppRouteInstalls?: readonly AppInstall[] | undefined;
  routeWorld: RuntimeWorldMount | undefined;
  runtimeProfile: RuntimeProfile;
};

export function GeneratedAppFrame({
  activePackageResolver,
  children,
  currentPath,
  installedAppRouteInstalls,
  routeWorld,
  runtimeProfile,
}: GeneratedAppFrameProps) {
  const routeApp = routeWorld?.app;
  const activeClientStorageName = useActiveClientStorageName();
  const activeSchemaKey = useActiveSchemaKey();
  const activeSchema = useSchema();
  const routeAppTarget = routeWorld ? runtimeWorldClientTarget(routeWorld) : undefined;
  const routeAppTargetIdentity = routeAppTarget
    ? appStorageIdentityForClientTarget(routeAppTarget)
    : undefined;
  const routeAppSchemaKey = routeAppTarget
    ? clientTargetSourceSchemaKey(routeAppTarget)
    : undefined;
  const routeStoreMatchesTarget =
    activeClientStorageName === null ||
    (routeAppTargetIdentity !== undefined &&
      activeClientStorageName === routeAppTargetIdentity.browserDatabaseName);
  const routeAppSchema =
    routeApp &&
    routeStoreMatchesTarget &&
    (activeSchemaKey === null || activeSchemaKey === routeAppSchemaKey)
      ? activeSchema
      : null;
  const routeAppScreenModels = useMemo(
    () => (routeAppSchema ? selectPrimaryScreenModels(routeAppSchema) : []),
    [routeAppSchema],
  );
  const activeScreenPath = routeWorld
    ? runtimeScreenPathFromRoute(routeWorld, currentPath)
    : undefined;
  const instanceRailInstalls = runtimeProfileSupportsInstanceRail(runtimeProfile)
    ? (installedAppRouteInstalls ?? [])
    : undefined;

  return (
    <ActiveAppSurface
      activePackageResolver={activePackageResolver}
      activeScreenPath={activeScreenPath}
      currentPath={currentPath}
      instanceRailInstalls={instanceRailInstalls}
      managementHref={runtimeAppManagementHref(runtimeProfile, routeWorld)}
      screenModels={routeAppScreenModels}
      world={routeWorld}
    >
      {children}
    </ActiveAppSurface>
  );
}

function runtimeProfileSupportsInstanceRail(runtimeProfile: RuntimeProfile): boolean {
  return runtimeProfile.shell === "instance" || runtimeProfile.shell === "dev";
}

function runtimeWorldClientTarget(world: RuntimeWorldMount) {
  return world.target ?? clientTargetForSchemaKey(world.app.key);
}
