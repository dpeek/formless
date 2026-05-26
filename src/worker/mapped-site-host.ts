import {
  installedAppStorageIdentity,
  type InstalledAppStorageIdentity,
} from "../shared/app-storage-identity.ts";
import type { InstanceDomainMapping } from "../shared/instance-domain-mappings.ts";

export type MappedSiteHost = {
  host: string;
  installId: string;
  target: InstalledAppStorageIdentity;
};

export function mappedSiteHostFromDomainMapping(
  mapping: InstanceDomainMapping | undefined,
): MappedSiteHost | undefined {
  if (!mapping || mapping.surface !== "site" || !mapping.enabled) {
    return undefined;
  }

  const target = installedAppStorageIdentity({
    installId: mapping.installId,
    packageAppKey: "site",
  });

  return target ? { host: mapping.host, installId: mapping.installId, target } : undefined;
}
