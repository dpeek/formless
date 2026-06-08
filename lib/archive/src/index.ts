/**
 * Runtime-neutral Archive package entrypoint.
 */
export * from "./types.ts";
export * from "./normalizers.ts";
export * from "./restore-plan.ts";

import {
  INSTANCE_ARCHIVE_KIND,
  formatAppArchive,
  formatInstanceArchive,
  type AppArchive,
  type PortableArchive,
} from "./types.ts";

export const PORTABLE_ARCHIVE_MANIFEST_FILE = "archive.json";

export function formatPortableArchive(archive: PortableArchive): string {
  return archive.kind === INSTANCE_ARCHIVE_KIND
    ? formatInstanceArchive(archive)
    : formatAppArchive(archive);
}

export function archiveApps(archive: PortableArchive): AppArchive[] {
  return archive.kind === INSTANCE_ARCHIVE_KIND ? archive.apps : [archive];
}

export function archiveRecordCount(archive: PortableArchive): number {
  return archiveApps(archive).reduce((count, app) => count + appRecordCount(app), 0);
}

function appRecordCount(app: AppArchive): number {
  return app.data.kind === "storeSnapshot"
    ? app.data.snapshot.records.length
    : app.data.records.length;
}
