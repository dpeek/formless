import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";
import {
  PORTABLE_ARCHIVE_MANIFEST_FILE,
  readPortableArchiveInputStatus,
} from "./archive-input-status.ts";

describe("portable archive input status", () => {
  it("reads archive envelope kind and version without normalizing unsupported archives", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "formless-archive-status-"));
    const archiveDir = path.join(tempDir, "archive");

    await mkdir(archiveDir, { recursive: true });
    await writeFile(
      path.join(archiveDir, PORTABLE_ARCHIVE_MANIFEST_FILE),
      `${JSON.stringify({
        kind: "formless.instanceArchive",
        version: 0,
      })}\n`,
    );

    await expect(
      readPortableArchiveInputStatus({ archiveDir: "archive", cwd: tempDir }),
    ).resolves.toEqual({
      archivePath: path.join(archiveDir, PORTABLE_ARCHIVE_MANIFEST_FILE),
      kind: "formless.instanceArchive",
      present: true,
      readable: true,
      version: 0,
    });
  });
});
