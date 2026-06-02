import { findAppInstall, type AppInstall } from "../shared/app-installs.ts";
import {
  installedAppStorageIdentity,
  type InstalledAppStorageIdentity,
} from "../shared/app-storage-identity.ts";
import type { InstanceDomainMapping } from "../shared/instance-domain-mappings.ts";
import type { InstanceRuntimeRouteResolution } from "./instance-runtime-routes.ts";

export type MappedAppHost = {
  host: string;
  installId: string;
  target: InstalledAppStorageIdentity;
};

export function mappedAppHostFromDomainMapping(
  mapping: InstanceDomainMapping | undefined,
  installs: readonly AppInstall[],
): MappedAppHost | undefined {
  if (!mapping || mapping.profile !== "app" || !mapping.targetInstallId || !mapping.enabled) {
    return undefined;
  }

  const install = findAppInstall(installs, mapping.targetInstallId);

  if (!install) {
    return undefined;
  }

  const target = installedAppStorageIdentity({
    installId: install.installId,
    packageAppKey: install.packageAppKey,
  });

  return target ? { host: mapping.host, installId: install.installId, target } : undefined;
}

export function mappedAppHostFromRuntimeRoute(
  route: InstanceRuntimeRouteResolution | undefined,
): MappedAppHost | undefined {
  if (
    !route ||
    route.kind !== "mount" ||
    route.targetProfile !== "app" ||
    !route.matchHost ||
    !route.target
  ) {
    return undefined;
  }

  return {
    host: route.matchHost,
    installId: route.target.installId,
    target: route.target,
  };
}
