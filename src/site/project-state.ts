import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const SITE_PROJECT_STATE_DIRECTORY = ".formless";
export const SITE_PROJECT_GITIGNORE_FILE = ".gitignore";
export const SITE_PROJECT_GITIGNORE_ENTRY = ".formless/";

export function siteProjectStatePath(projectRoot: string, ...segments: string[]): string {
  return path.join(projectRoot, SITE_PROJECT_STATE_DIRECTORY, ...segments);
}

export async function prepareSiteProjectStateDirectory(projectRoot: string) {
  await mkdir(siteProjectStatePath(projectRoot), { recursive: true });
  await ensureSiteProjectStateIgnored(projectRoot);
}

export async function ensureSiteProjectStateIgnored(projectRoot: string) {
  const gitignorePath = path.join(projectRoot, SITE_PROJECT_GITIGNORE_FILE);
  const current = (await readTextFileIfExists(gitignorePath)) ?? "";
  const lines = current.split(/\r?\n/);

  if (lines.some((line) => isSiteProjectStateIgnoreLine(line))) {
    return;
  }

  const prefix = current.length === 0 || current.endsWith("\n") ? current : `${current}\n`;

  await writeFile(gitignorePath, `${prefix}${SITE_PROJECT_GITIGNORE_ENTRY}\n`);
}

function isSiteProjectStateIgnoreLine(line: string): boolean {
  const value = line.trim();

  return value === SITE_PROJECT_STATE_DIRECTORY || value === SITE_PROJECT_GITIGNORE_ENTRY;
}

async function readTextFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}
