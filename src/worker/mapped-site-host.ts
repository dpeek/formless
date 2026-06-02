import {
  installedAppStorageIdentity,
  type InstalledAppStorageIdentity,
} from "../shared/app-storage-identity.ts";
import type { InstanceDomainMapping } from "../shared/instance-domain-mappings.ts";
import type { InstanceRuntimeRouteResolution } from "./instance-runtime-routes.ts";

export type MappedSiteHost = {
  host: string;
  installId: string;
  target: InstalledAppStorageIdentity;
};

export function mappedSiteHostFromDomainMapping(
  mapping: InstanceDomainMapping | undefined,
): MappedSiteHost | undefined {
  if (
    !mapping ||
    mapping.profile !== "publicSite" ||
    mapping.surface !== "site" ||
    !mapping.targetInstallId ||
    !mapping.enabled
  ) {
    return undefined;
  }

  const target = installedAppStorageIdentity({
    installId: mapping.targetInstallId,
    packageAppKey: "site",
  });

  return target ? { host: mapping.host, installId: mapping.targetInstallId, target } : undefined;
}

export function mappedSiteHostFromRuntimeRoute(
  route: InstanceRuntimeRouteResolution | undefined,
): MappedSiteHost | undefined {
  if (
    !route ||
    route.kind !== "mount" ||
    route.targetProfile !== "public-site" ||
    route.surface !== "public-site" ||
    !route.matchHost ||
    !route.target ||
    route.target.packageAppKey !== "site"
  ) {
    return undefined;
  }

  return {
    host: route.matchHost,
    installId: route.target.installId,
    target: route.target,
  };
}
