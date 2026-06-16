import {
  DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
  DEFAULT_INSTANCE_WORKSPACE_MEDIA_ROOT,
  DEFAULT_INSTANCE_WORKSPACE_SECRET_STATE_ROOT,
  DEFAULT_INSTANCE_WORKSPACE_STATE_ROOT,
  INSTANCE_WORKSPACE_KIND,
  INSTANCE_WORKSPACE_MANIFEST_FILE,
  INSTANCE_WORKSPACE_MANIFEST_VERSION,
  WORKSPACE_PACKAGE_LINKS_FILE,
  WORKSPACE_PACKAGE_LINKS_KIND,
  WORKSPACE_PACKAGE_LINKS_VERSION,
} from "./types.ts";
import type {
  FormatInstanceWorkspaceManifestInput,
  FormatWorkspacePackageLinksInput,
  InstanceWorkspaceLocalState,
  InstanceWorkspaceManifest,
  InstanceWorkspaceMedia,
  InstanceWorkspaceState,
  WorkspacePackageLink,
  WorkspacePackageLinks,
} from "./types.ts";

const rootKeys = new Set(["kind", "local", "media", "name", "state", "version"]);
const workspacePackageLinksRootKeys = new Set(["kind", "links", "version"]);
const workspacePackageLinkKeys = new Set(["manifest"]);
const removedManifestSourceKeys = new Set([
  "apps",
  "archives",
  "defaultAppPolicy",
  "defaultTarget",
  "deploy",
  "domains",
  "source",
  "targets",
]);
const stateKeys = new Set(["root"]);
const mediaKeys = new Set(["root"]);
const localKeys = new Set(["secretStateRoot", "stateRoot"]);
const urlLikePathPattern = /^[a-z][a-z0-9+.-]*:/i;
const resourceSlugPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const targetAliasPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const forbiddenSecretKeys = new Set([
  "admintoken",
  "alchemy",
  "alchemypassword",
  "alchemysecret",
  "alchemysecrets",
  "alchemystatetoken",
  "alchemytoken",
  "apitoken",
  "cloudflareapitoken",
  "cloudflaretoken",
  "cfapitoken",
  "credential",
  "credentials",
  "formlessadmintoken",
  "mutationcredential",
  "mutationcredentials",
  "password",
  "providercredential",
  "providercredentials",
  "secret",
  "secrets",
  "statetoken",
  "token",
]);

export function defaultInstanceWorkspaceManifest(input: {
  name: string;
  targetUrl?: string | null;
}): InstanceWorkspaceManifest {
  return {
    version: INSTANCE_WORKSPACE_MANIFEST_VERSION,
    kind: INSTANCE_WORKSPACE_KIND,
    name: parseWorkspaceName(`${INSTANCE_WORKSPACE_MANIFEST_FILE} name`, input.name),
    state: {
      root: DEFAULT_INSTANCE_WORKSPACE_STATE_ROOT,
    },
    targets: [],
    media: {
      root: DEFAULT_INSTANCE_WORKSPACE_MEDIA_ROOT,
    },
    local: {
      stateRoot: DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
      secretStateRoot: DEFAULT_INSTANCE_WORKSPACE_SECRET_STATE_ROOT,
    },
    defaultAppPolicy: "none",
    apps: [],
  };
}

export function defaultWorkspacePackageLinks(): WorkspacePackageLinks {
  return {
    version: WORKSPACE_PACKAGE_LINKS_VERSION,
    kind: WORKSPACE_PACKAGE_LINKS_KIND,
    links: [],
  };
}

export function parseInstanceWorkspaceManifestJson(contents: string): InstanceWorkspaceManifest {
  try {
    return parseInstanceWorkspaceManifest(JSON.parse(contents) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${INSTANCE_WORKSPACE_MANIFEST_FILE} must be valid JSON.`);
    }

    throw error;
  }
}

export function parseWorkspacePackageLinksJson(contents: string): WorkspacePackageLinks {
  try {
    return parseWorkspacePackageLinks(JSON.parse(contents) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${WORKSPACE_PACKAGE_LINKS_FILE} must be valid JSON.`);
    }

    throw error;
  }
}

export function parseInstanceWorkspaceManifest(value: unknown): InstanceWorkspaceManifest {
  if (!isRecord(value)) {
    throw new Error(`${INSTANCE_WORKSPACE_MANIFEST_FILE} must be an object.`);
  }

  assertNoForbiddenSecretKeys(value, INSTANCE_WORKSPACE_MANIFEST_FILE);
  assertNoRemovedManifestSourceKeys(value);
  assertOnlyKeys(value, rootKeys, INSTANCE_WORKSPACE_MANIFEST_FILE);

  if (value.version !== INSTANCE_WORKSPACE_MANIFEST_VERSION) {
    throw new Error(
      `${INSTANCE_WORKSPACE_MANIFEST_FILE} version must be ${INSTANCE_WORKSPACE_MANIFEST_VERSION}.`,
    );
  }

  if (value.kind !== INSTANCE_WORKSPACE_KIND) {
    throw new Error(
      `${INSTANCE_WORKSPACE_MANIFEST_FILE} kind must be "${INSTANCE_WORKSPACE_KIND}".`,
    );
  }

  return {
    version: INSTANCE_WORKSPACE_MANIFEST_VERSION,
    kind: INSTANCE_WORKSPACE_KIND,
    name: parseWorkspaceName(`${INSTANCE_WORKSPACE_MANIFEST_FILE} name`, value.name),
    state: parseState(value.state),
    targets: [],
    media: parseMedia(value.media),
    local: parseLocalState(value.local),
    defaultAppPolicy: "none",
    apps: [],
  };
}

export function parseWorkspacePackageLinks(value: unknown): WorkspacePackageLinks {
  if (!isRecord(value)) {
    throw new Error(`${WORKSPACE_PACKAGE_LINKS_FILE} must be an object.`);
  }

  assertNoForbiddenSecretKeys(value, WORKSPACE_PACKAGE_LINKS_FILE, WORKSPACE_PACKAGE_LINKS_FILE);
  assertOnlyKeys(value, workspacePackageLinksRootKeys, WORKSPACE_PACKAGE_LINKS_FILE);

  if (value.version !== WORKSPACE_PACKAGE_LINKS_VERSION) {
    throw new Error(
      `${WORKSPACE_PACKAGE_LINKS_FILE} version must be ${WORKSPACE_PACKAGE_LINKS_VERSION}.`,
    );
  }

  if (value.kind !== WORKSPACE_PACKAGE_LINKS_KIND) {
    throw new Error(
      `${WORKSPACE_PACKAGE_LINKS_FILE} kind must be "${WORKSPACE_PACKAGE_LINKS_KIND}".`,
    );
  }

  return {
    version: WORKSPACE_PACKAGE_LINKS_VERSION,
    kind: WORKSPACE_PACKAGE_LINKS_KIND,
    links: parseWorkspacePackageLinkList(value.links),
  };
}

export function formatInstanceWorkspaceManifest(
  manifest: FormatInstanceWorkspaceManifestInput,
): string {
  const fallback = defaultInstanceWorkspaceManifest({ name: manifest.name });
  const parsed = parseInstanceWorkspaceManifest({
    version: manifest.version,
    kind: manifest.kind,
    name: manifest.name,
    state: {
      root: manifest.state?.root ?? fallback.state.root,
    },
    media: {
      root: manifest.media?.root ?? fallback.media.root,
    },
    local: {
      stateRoot: manifest.local?.stateRoot ?? fallback.local.stateRoot,
      secretStateRoot: manifest.local?.secretStateRoot ?? fallback.local.secretStateRoot,
    },
  });
  const formatted: Record<string, unknown> = {
    version: parsed.version,
    kind: parsed.kind,
    name: parsed.name,
    state: {
      root: parsed.state.root,
    },
    media: {
      root: parsed.media.root,
    },
    local: {
      stateRoot: parsed.local.stateRoot,
      secretStateRoot: parsed.local.secretStateRoot,
    },
  };

  return `${JSON.stringify(formatted, null, 2)}\n`;
}

export function formatWorkspacePackageLinks(manifest: FormatWorkspacePackageLinksInput): string {
  const parsed = parseWorkspacePackageLinks({
    version: manifest.version,
    kind: manifest.kind,
    links: manifest.links.map((link) => ({
      manifest: link.manifest,
    })),
  });
  const formatted: Record<string, unknown> = {
    version: parsed.version,
    kind: parsed.kind,
    links: parsed.links.map((link) => ({
      manifest: link.manifest,
    })),
  };

  return `${JSON.stringify(formatted, null, 2)}\n`;
}

export function parseInstanceWorkspaceTargetAlias(context: string, value: unknown): string {
  const alias = parseRequiredString(context, value);

  if (!targetAliasPattern.test(alias)) {
    throw new Error(
      `${context} must start with a lowercase letter and use lowercase letters, numbers, dots, and single hyphens.`,
    );
  }

  return alias;
}

export function normalizeInstanceWorkspaceTargetUrl(value: string): string {
  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error();
    }

    return url.origin;
  } catch {
    throw new Error(`Formless instance workspace target URL is invalid: ${value}`);
  }
}

export function parseInstanceWorkspaceResourceSlug(context: string, value: unknown): string {
  const slug = parseRequiredString(context, value);

  if (!resourceSlugPattern.test(slug)) {
    throw new Error(
      `${context} must start with a lowercase letter and use lowercase letters, numbers, and single hyphens.`,
    );
  }

  return slug;
}

export function parseInstanceWorkspaceRelativePath(context: string, value: unknown): string {
  const filePath = parseRequiredString(context, value);
  const parts = filePath.split("/");

  if (
    filePath.startsWith("/") ||
    filePath.includes("\\") ||
    parts.some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`${context} must be a relative workspace path.`);
  }

  return filePath;
}

export function parseWorkspacePackageManifestLinkPath(context: string, value: unknown): string {
  const filePath = parseRequiredString(context, value);
  const parts = filePath.split("/");

  if (
    filePath.startsWith("/") ||
    filePath.startsWith("~") ||
    filePath.includes("\\") ||
    urlLikePathPattern.test(filePath) ||
    parts.some((part) => part === "" || part === ".") ||
    parts.at(-1) !== "formless.app.json" ||
    hasNonLeadingParentSegment(parts)
  ) {
    throw new Error(`${context} must be a local relative formless.app.json path.`);
  }

  return filePath;
}

function parseState(value: unknown): InstanceWorkspaceState {
  if (!isRecord(value)) {
    throw new Error(`${INSTANCE_WORKSPACE_MANIFEST_FILE} state must be an object.`);
  }

  assertOnlyKeys(value, stateKeys, `${INSTANCE_WORKSPACE_MANIFEST_FILE} state`);

  return {
    root: parseInstanceWorkspaceRelativePath(
      `${INSTANCE_WORKSPACE_MANIFEST_FILE} state.root`,
      value.root,
    ),
  };
}

function parseMedia(value: unknown): InstanceWorkspaceMedia {
  if (!isRecord(value)) {
    throw new Error(`${INSTANCE_WORKSPACE_MANIFEST_FILE} media must be an object.`);
  }

  assertOnlyKeys(value, mediaKeys, `${INSTANCE_WORKSPACE_MANIFEST_FILE} media`);

  return {
    root: parseInstanceWorkspaceRelativePath(
      `${INSTANCE_WORKSPACE_MANIFEST_FILE} media.root`,
      value.root,
    ),
  };
}

function parseLocalState(value: unknown): InstanceWorkspaceLocalState {
  if (!isRecord(value)) {
    throw new Error(`${INSTANCE_WORKSPACE_MANIFEST_FILE} local must be an object.`);
  }

  assertOnlyKeys(value, localKeys, `${INSTANCE_WORKSPACE_MANIFEST_FILE} local`);

  return {
    stateRoot: parseInstanceWorkspaceRelativePath(
      `${INSTANCE_WORKSPACE_MANIFEST_FILE} local.stateRoot`,
      value.stateRoot,
    ),
    secretStateRoot: parseInstanceWorkspaceRelativePath(
      `${INSTANCE_WORKSPACE_MANIFEST_FILE} local.secretStateRoot`,
      value.secretStateRoot,
    ),
  };
}

function parseWorkspacePackageLinkList(value: unknown): WorkspacePackageLink[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${WORKSPACE_PACKAGE_LINKS_FILE} links must be an array.`);
  }

  const links = value.map((link, index) =>
    parseWorkspacePackageLink(link, `${WORKSPACE_PACKAGE_LINKS_FILE} links[${index}]`),
  );
  const seen = new Set<string>();

  for (const link of links) {
    if (seen.has(link.manifest)) {
      throw new Error(
        `${WORKSPACE_PACKAGE_LINKS_FILE} links has duplicate manifest "${link.manifest}".`,
      );
    }

    seen.add(link.manifest);
  }

  return links;
}

function parseWorkspacePackageLink(value: unknown, context: string): WorkspacePackageLink {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertOnlyKeys(value, workspacePackageLinkKeys, context);

  return {
    manifest: parseWorkspacePackageManifestLinkPath(`${context}.manifest`, value.manifest),
  };
}

function hasNonLeadingParentSegment(parts: string[]) {
  let seenPackagePathSegment = false;

  for (const part of parts) {
    if (part === "..") {
      if (seenPackagePathSegment) {
        return true;
      }
    } else {
      seenPackagePathSegment = true;
    }
  }

  return false;
}

function parseWorkspaceName(context: string, value: unknown): string {
  return parseInstanceWorkspaceResourceSlug(context, value);
}

function parseRequiredString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function assertOnlyKeys(value: Record<string, unknown>, allowedKeys: Set<string>, context: string) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }
}

function assertNoRemovedManifestSourceKeys(value: Record<string, unknown>) {
  for (const key of Object.keys(value)) {
    if (removedManifestSourceKeys.has(key)) {
      throw new Error(
        `${INSTANCE_WORKSPACE_MANIFEST_FILE} key "${key}" was removed from manifest version 1; store instance intent in workspace storage state instead.`,
      );
    }
  }
}

function assertNoForbiddenSecretKeys(
  value: unknown,
  context: string,
  fileName = INSTANCE_WORKSPACE_MANIFEST_FILE,
) {
  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      assertNoForbiddenSecretKeys(child, `${context}[${index}]`, fileName),
    );
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (forbiddenSecretKeys.has(normalizeSecretKey(key))) {
      throw new Error(`${fileName} must not store secret field "${context}.${key}".`);
    }

    assertNoForbiddenSecretKeys(child, `${context}.${key}`, fileName);
  }
}

function normalizeSecretKey(key: string): string {
  return key.toLowerCase().replaceAll(/[-_]/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
