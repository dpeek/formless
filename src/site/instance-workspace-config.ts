import type { InstanceDomainMappingProfile } from "../shared/instance-domain-mappings.ts";

export const FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE = "formless.json";
export const LEGACY_FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILES = [
  "formless.instance-workspace.json",
  "formless-workspace.json",
] as const;
export const FORMLESS_INSTANCE_WORKSPACE_VERSION = 1;
export const FORMLESS_INSTANCE_WORKSPACE_KIND = "formless-instance-workspace";
export const DEFAULT_FORMLESS_INSTANCE_WORKSPACE_TARGET_ALIAS = "remote";
export const DEFAULT_FORMLESS_INSTANCE_WORKSPACE_ARCHIVE_ROOT = "archives";
export const DEFAULT_FORMLESS_INSTANCE_WORKSPACE_INSTANCE_ARCHIVE_PATH = "archives/instance";
export const DEFAULT_FORMLESS_INSTANCE_WORKSPACE_APP_ARCHIVE_ROOT = "archives/apps";
export const DEFAULT_FORMLESS_INSTANCE_WORKSPACE_RECORD_SOURCE_PATH =
  "records/instance-control-plane";
export const DEFAULT_FORMLESS_INSTANCE_WORKSPACE_MEDIA_ROOT = "media";
export const DEFAULT_FORMLESS_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT = ".formless/local";
export const DEFAULT_FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_ROOT = ".formless";

export type FormlessInstanceWorkspaceDefaultAppPolicy =
  | "declared-installs"
  | "none"
  | "starter-site";

export type FormlessInstanceWorkspaceMigrationPolicy = "existing" | "new";

export type FormlessInstanceWorkspaceManifest = {
  version: typeof FORMLESS_INSTANCE_WORKSPACE_VERSION;
  kind: typeof FORMLESS_INSTANCE_WORKSPACE_KIND;
  name: string;
  source: FormlessInstanceWorkspaceSource;
  defaultTarget?: string;
  targets: FormlessInstanceWorkspaceTarget[];
  archives: FormlessInstanceWorkspaceArchives;
  media: FormlessInstanceWorkspaceMedia;
  local: FormlessInstanceWorkspaceLocalState;
  defaultAppPolicy: FormlessInstanceWorkspaceDefaultAppPolicy;
  apps: FormlessInstanceWorkspaceApp[];
  deploy?: FormlessInstanceWorkspaceDeploy;
  domains?: FormlessInstanceWorkspaceDomainIntent[];
};

export type FormatFormlessInstanceWorkspaceManifestInput = Pick<
  FormlessInstanceWorkspaceManifest,
  "kind" | "name" | "version"
> &
  Partial<
    Omit<FormlessInstanceWorkspaceManifest, "archives" | "kind" | "local" | "name" | "version">
  > & {
    archives?: Partial<FormlessInstanceWorkspaceArchives>;
    local?: Partial<FormlessInstanceWorkspaceLocalState>;
  };

export type FormlessInstanceWorkspaceTarget = {
  alias: string;
  url: string;
};

export type FormlessInstanceWorkspaceSource = {
  records: string;
};

export type FormlessInstanceWorkspaceArchives = {
  instance: string;
  apps: string;
};

export type FormlessInstanceWorkspaceMedia = {
  root: string;
};

export type FormlessInstanceWorkspaceLocalState = {
  stateRoot: string;
  secretStateRoot: string;
};

export type FormlessInstanceWorkspaceDeploy = {
  accountId?: string;
  mediaBucket?: string;
  migrationPolicy: FormlessInstanceWorkspaceMigrationPolicy;
  workerName?: string;
  workersDevUrl?: string;
};

export type FormlessInstanceWorkspaceApp = {
  installId: string;
  packageAppKey: string;
  label: string;
  archivePath: string;
  routes?: FormlessInstanceWorkspaceAppRoutes;
};

export type FormlessInstanceWorkspaceAppRoutes = {
  admin?: `/apps/${string}`;
  schema?: `/apps/${string}/schema`;
  public?: `/sites/${string}`;
};

export type FormlessInstanceWorkspaceDomainIntent = {
  enabled: boolean;
  host: string;
  profile: InstanceDomainMappingProfile;
  targetInstallId?: string;
};

const rootKeys = new Set(["archives", "kind", "local", "media", "name", "source", "version"]);
const removedManifestSourceKeys = new Set([
  "apps",
  "defaultAppPolicy",
  "defaultTarget",
  "deploy",
  "domains",
  "targets",
]);
const sourceKeys = new Set(["records"]);
const archivesKeys = new Set(["apps"]);
const mediaKeys = new Set(["root"]);
const localKeys = new Set(["secretStateRoot", "stateRoot"]);
const targetAliasPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
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

export function defaultFormlessInstanceWorkspaceManifest(input: {
  name: string;
  targetUrl?: string | null;
}): FormlessInstanceWorkspaceManifest {
  return {
    version: FORMLESS_INSTANCE_WORKSPACE_VERSION,
    kind: FORMLESS_INSTANCE_WORKSPACE_KIND,
    name: parseWorkspaceName(`${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} name`, input.name),
    source: {
      records: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_RECORD_SOURCE_PATH,
    },
    targets: [],
    archives: {
      instance: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_INSTANCE_ARCHIVE_PATH,
      apps: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_APP_ARCHIVE_ROOT,
    },
    media: {
      root: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_MEDIA_ROOT,
    },
    local: {
      stateRoot: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
      secretStateRoot: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_ROOT,
    },
    defaultAppPolicy: "none",
    apps: [],
  };
}

export function parseFormlessInstanceWorkspaceManifestJson(
  contents: string,
): FormlessInstanceWorkspaceManifest {
  try {
    return parseFormlessInstanceWorkspaceManifest(JSON.parse(contents) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} must be valid JSON.`);
    }

    throw error;
  }
}

export function parseFormlessInstanceWorkspaceManifest(
  value: unknown,
): FormlessInstanceWorkspaceManifest {
  if (!isRecord(value)) {
    throw new Error(`${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} must be an object.`);
  }

  assertNoForbiddenSecretKeys(value, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE);
  assertNoRemovedManifestSourceKeys(value);
  assertOnlyKeys(value, rootKeys, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE);

  if (value.version !== FORMLESS_INSTANCE_WORKSPACE_VERSION) {
    throw new Error(
      `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} version must be ${FORMLESS_INSTANCE_WORKSPACE_VERSION}.`,
    );
  }

  if (value.kind !== FORMLESS_INSTANCE_WORKSPACE_KIND) {
    throw new Error(
      `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} kind must be "${FORMLESS_INSTANCE_WORKSPACE_KIND}".`,
    );
  }

  return {
    version: FORMLESS_INSTANCE_WORKSPACE_VERSION,
    kind: FORMLESS_INSTANCE_WORKSPACE_KIND,
    name: parseWorkspaceName(`${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} name`, value.name),
    source: parseSource(value.source),
    targets: [],
    archives: parseArchives(value.archives),
    media: parseMedia(value.media),
    local: parseLocalState(value.local),
    defaultAppPolicy: "none",
    apps: [],
  };
}

export function formatFormlessInstanceWorkspaceManifest(
  manifest: FormatFormlessInstanceWorkspaceManifestInput,
): string {
  const fallback = defaultFormlessInstanceWorkspaceManifest({ name: manifest.name });
  const parsed = parseFormlessInstanceWorkspaceManifest({
    version: manifest.version,
    kind: manifest.kind,
    name: manifest.name,
    source: {
      records: manifest.source?.records ?? fallback.source.records,
    },
    archives: {
      apps: manifest.archives?.apps ?? fallback.archives.apps,
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
    source: {
      records: parsed.source.records,
    },
    archives: {
      apps: parsed.archives.apps,
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

export function parseFormlessInstanceWorkspaceTargetAlias(context: string, value: unknown): string {
  const alias = parseRequiredString(context, value);

  if (!targetAliasPattern.test(alias)) {
    throw new Error(
      `${context} must start with a lowercase letter and use lowercase letters, numbers, and single hyphens.`,
    );
  }

  return alias;
}

export function normalizeFormlessInstanceWorkspaceTargetUrl(value: string): string {
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

function parseSource(value: unknown): FormlessInstanceWorkspaceSource {
  if (!isRecord(value)) {
    throw new Error(`${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} source must be an object.`);
  }

  assertOnlyKeys(value, sourceKeys, `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} source`);

  return {
    records: parseRelativeWorkspacePath(
      `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} source.records`,
      value.records,
    ),
  };
}

function parseArchives(value: unknown): FormlessInstanceWorkspaceArchives {
  if (!isRecord(value)) {
    throw new Error(`${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} archives must be an object.`);
  }

  assertOnlyKeys(value, archivesKeys, `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} archives`);

  return {
    instance: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_INSTANCE_ARCHIVE_PATH,
    apps: parseRelativeWorkspacePath(
      `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} archives.apps`,
      value.apps,
    ),
  };
}

function parseMedia(value: unknown): FormlessInstanceWorkspaceMedia {
  if (!isRecord(value)) {
    throw new Error(`${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} media must be an object.`);
  }

  assertOnlyKeys(value, mediaKeys, `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} media`);

  return {
    root: parseRelativeWorkspacePath(
      `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} media.root`,
      value.root,
    ),
  };
}

function parseLocalState(value: unknown): FormlessInstanceWorkspaceLocalState {
  if (!isRecord(value)) {
    throw new Error(`${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} local must be an object.`);
  }

  assertOnlyKeys(value, localKeys, `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} local`);

  return {
    stateRoot: parseRelativeWorkspacePath(
      `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} local.stateRoot`,
      value.stateRoot,
    ),
    secretStateRoot: parseRelativeWorkspacePath(
      `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} local.secretStateRoot`,
      value.secretStateRoot,
    ),
  };
}

function parseWorkspaceName(context: string, value: unknown): string {
  return parseResourceSlug(context, value);
}

function parseResourceSlug(context: string, value: unknown): string {
  const slug = parseRequiredString(context, value);

  if (!targetAliasPattern.test(slug)) {
    throw new Error(
      `${context} must start with a lowercase letter and use lowercase letters, numbers, and single hyphens.`,
    );
  }

  return slug;
}

function parseRelativeWorkspacePath(context: string, value: unknown): string {
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
        `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} key "${key}" was removed from manifest version 1; store instance intent in workspace record source instead.`,
      );
    }
  }
}

function assertNoForbiddenSecretKeys(value: unknown, context: string) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoForbiddenSecretKeys(child, `${context}[${index}]`));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (forbiddenSecretKeys.has(normalizeSecretKey(key))) {
      throw new Error(
        `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} must not store secret field "${context}.${key}".`,
      );
    }

    assertNoForbiddenSecretKeys(child, `${context}.${key}`);
  }
}

function normalizeSecretKey(key: string): string {
  return key.toLowerCase().replaceAll(/[-_]/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
