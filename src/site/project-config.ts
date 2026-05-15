export const SITE_PROJECT_CONFIG_FILE = "formless.config.json";
export const SITE_PROJECT_CONFIG_VERSION = 1;
export const SITE_PROJECT_KIND = "site";
export const SITE_PROJECT_RECORDS_FILE = "site.records.json";
export const SITE_PROJECT_MEDIA_ROOT = "media";

export type SiteProjectDeployConfig = {
  workerName?: string;
  accountId?: string;
  publishUrl?: string;
  mediaBucket?: string;
};

export type SiteProjectConfig = {
  version: typeof SITE_PROJECT_CONFIG_VERSION;
  kind: typeof SITE_PROJECT_KIND;
  recordsPath: typeof SITE_PROJECT_RECORDS_FILE;
  mediaRoot: typeof SITE_PROJECT_MEDIA_ROOT;
  deploy?: SiteProjectDeployConfig;
};

const rootKeys = new Set(["version", "kind", "recordsPath", "mediaRoot", "deploy"]);
const deployKeys = new Set(["workerName", "accountId", "publishUrl", "mediaBucket"]);
const forbiddenSecretKeys = new Set([
  "admintoken",
  "apitoken",
  "cloudflareapitoken",
  "cloudflaretoken",
  "cfapitoken",
  "formlessadmintoken",
  "secret",
  "secrets",
]);

export function defaultSiteProjectConfig(): SiteProjectConfig {
  return {
    version: SITE_PROJECT_CONFIG_VERSION,
    kind: SITE_PROJECT_KIND,
    recordsPath: SITE_PROJECT_RECORDS_FILE,
    mediaRoot: SITE_PROJECT_MEDIA_ROOT,
  };
}

export function parseSiteProjectConfigJson(contents: string): SiteProjectConfig {
  try {
    return parseSiteProjectConfig(JSON.parse(contents) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${SITE_PROJECT_CONFIG_FILE} must be valid JSON.`);
    }

    throw error;
  }
}

export function parseSiteProjectConfig(value: unknown): SiteProjectConfig {
  if (!isRecord(value)) {
    throw new Error(`${SITE_PROJECT_CONFIG_FILE} must be an object.`);
  }

  assertNoForbiddenSecretKeys(value, SITE_PROJECT_CONFIG_FILE);
  assertOnlyKeys(value, rootKeys, SITE_PROJECT_CONFIG_FILE);

  if (value.version !== SITE_PROJECT_CONFIG_VERSION) {
    throw new Error(`${SITE_PROJECT_CONFIG_FILE} version must be ${SITE_PROJECT_CONFIG_VERSION}.`);
  }

  if (value.kind !== SITE_PROJECT_KIND) {
    throw new Error(`${SITE_PROJECT_CONFIG_FILE} kind must be "${SITE_PROJECT_KIND}".`);
  }

  const recordsPath = parseDefaultPath(
    `${SITE_PROJECT_CONFIG_FILE} recordsPath`,
    value.recordsPath,
    SITE_PROJECT_RECORDS_FILE,
  );
  const mediaRoot = parseDefaultPath(
    `${SITE_PROJECT_CONFIG_FILE} mediaRoot`,
    value.mediaRoot,
    SITE_PROJECT_MEDIA_ROOT,
  );
  const deploy = parseDeployConfig(value.deploy);

  return {
    version: SITE_PROJECT_CONFIG_VERSION,
    kind: SITE_PROJECT_KIND,
    recordsPath,
    mediaRoot,
    ...(deploy ? { deploy } : {}),
  };
}

export function formatSiteProjectConfig(config: SiteProjectConfig): string {
  const parsed = parseSiteProjectConfig(config);
  const formatted: Record<string, unknown> = {
    version: parsed.version,
    kind: parsed.kind,
    recordsPath: parsed.recordsPath,
    mediaRoot: parsed.mediaRoot,
  };

  if (parsed.deploy) {
    formatted.deploy = {
      ...(parsed.deploy.workerName === undefined ? {} : { workerName: parsed.deploy.workerName }),
      ...(parsed.deploy.accountId === undefined ? {} : { accountId: parsed.deploy.accountId }),
      ...(parsed.deploy.publishUrl === undefined ? {} : { publishUrl: parsed.deploy.publishUrl }),
      ...(parsed.deploy.mediaBucket === undefined
        ? {}
        : { mediaBucket: parsed.deploy.mediaBucket }),
    };
  }

  return `${JSON.stringify(formatted, null, 2)}\n`;
}

function parseDeployConfig(value: unknown): SiteProjectDeployConfig | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${SITE_PROJECT_CONFIG_FILE} deploy must be an object.`);
  }

  assertOnlyKeys(value, deployKeys, `${SITE_PROJECT_CONFIG_FILE} deploy`);

  const deploy: SiteProjectDeployConfig = {};
  const workerName = parseOptionalNonEmptyString(
    `${SITE_PROJECT_CONFIG_FILE} deploy.workerName`,
    value.workerName,
  );
  const accountId = parseOptionalNonEmptyString(
    `${SITE_PROJECT_CONFIG_FILE} deploy.accountId`,
    value.accountId,
  );
  const publishUrl = parseOptionalPublishUrl(
    `${SITE_PROJECT_CONFIG_FILE} deploy.publishUrl`,
    value.publishUrl,
  );
  const mediaBucket = parseOptionalNonEmptyString(
    `${SITE_PROJECT_CONFIG_FILE} deploy.mediaBucket`,
    value.mediaBucket,
  );

  if (workerName !== undefined) {
    deploy.workerName = workerName;
  }

  if (accountId !== undefined) {
    deploy.accountId = accountId;
  }

  if (publishUrl !== undefined) {
    deploy.publishUrl = publishUrl;
  }

  if (mediaBucket !== undefined) {
    deploy.mediaBucket = mediaBucket;
  }

  return Object.keys(deploy).length === 0 ? undefined : deploy;
}

function parseDefaultPath<
  TExpected extends typeof SITE_PROJECT_RECORDS_FILE | typeof SITE_PROJECT_MEDIA_ROOT,
>(context: string, value: unknown, expected: TExpected): TExpected {
  if (value !== expected) {
    throw new Error(`${context} must be "${expected}".`);
  }

  return expected;
}

function parseOptionalNonEmptyString(context: string, value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value;
}

function parseOptionalPublishUrl(context: string, value: unknown): string | undefined {
  const rawUrl = parseOptionalNonEmptyString(context, value);

  if (rawUrl === undefined) {
    return undefined;
  }

  try {
    const url = new URL(rawUrl);

    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${context} must be a valid URL.`);
  }
}

function assertOnlyKeys(value: Record<string, unknown>, allowedKeys: Set<string>, context: string) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
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
        `${SITE_PROJECT_CONFIG_FILE} must not store secret field "${context}.${key}".`,
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
