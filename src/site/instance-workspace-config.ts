import { validateAppInstallId } from "../shared/app-installs.ts";
import {
  normalizeInstanceDomainHost,
  resolveInstanceDomainMappingProfile,
  type InstanceDomainMappingProfile,
} from "../shared/instance-domain-mappings.ts";

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
export const DEFAULT_FORMLESS_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT = ".formless/local";

export type FormlessInstanceWorkspaceDefaultAppPolicy =
  | "declared-installs"
  | "none"
  | "starter-site";

export type FormlessInstanceWorkspaceMigrationPolicy = "existing" | "new";

export type FormlessInstanceWorkspaceManifest = {
  version: typeof FORMLESS_INSTANCE_WORKSPACE_VERSION;
  kind: typeof FORMLESS_INSTANCE_WORKSPACE_KIND;
  name: string;
  defaultTarget?: string;
  targets: FormlessInstanceWorkspaceTarget[];
  archives: FormlessInstanceWorkspaceArchives;
  local: FormlessInstanceWorkspaceLocalState;
  defaultAppPolicy: FormlessInstanceWorkspaceDefaultAppPolicy;
  apps: FormlessInstanceWorkspaceApp[];
  deploy?: FormlessInstanceWorkspaceDeploy;
  domains?: FormlessInstanceWorkspaceDomainIntent[];
};

export type FormlessInstanceWorkspaceTarget = {
  alias: string;
  url: string;
};

export type FormlessInstanceWorkspaceArchives = {
  instance: string;
  apps: string;
};

export type FormlessInstanceWorkspaceLocalState = {
  stateRoot: string;
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

const rootKeys = new Set([
  "apps",
  "archives",
  "defaultAppPolicy",
  "defaultTarget",
  "deploy",
  "domains",
  "kind",
  "local",
  "name",
  "targets",
  "version",
]);
const targetKeys = new Set(["alias", "url"]);
const archivesKeys = new Set(["apps", "instance"]);
const localKeys = new Set(["stateRoot"]);
const deployKeys = new Set([
  "accountId",
  "mediaBucket",
  "migrationPolicy",
  "workerName",
  "workersDevUrl",
]);
const appKeys = new Set(["archivePath", "installId", "label", "packageAppKey", "routes"]);
const appRouteKeys = new Set(["admin", "public", "schema"]);
const domainKeys = new Set([
  "enabled",
  "host",
  "installId",
  "profile",
  "surface",
  "targetInstallId",
]);
const targetAliasPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const packageAppKeyPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
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
  const targets =
    input.targetUrl === undefined || input.targetUrl === null
      ? []
      : [
          {
            alias: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_TARGET_ALIAS,
            url: normalizeFormlessInstanceWorkspaceTargetUrl(input.targetUrl),
          },
        ];

  return {
    version: FORMLESS_INSTANCE_WORKSPACE_VERSION,
    kind: FORMLESS_INSTANCE_WORKSPACE_KIND,
    name: parseWorkspaceName(`${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} name`, input.name),
    ...(targets.length === 0
      ? {}
      : { defaultTarget: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_TARGET_ALIAS }),
    targets,
    archives: {
      instance: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_INSTANCE_ARCHIVE_PATH,
      apps: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_APP_ARCHIVE_ROOT,
    },
    local: {
      stateRoot: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
    },
    defaultAppPolicy: "starter-site",
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

  const targets = parseTargets(value.targets);
  const defaultTarget = parseOptionalTargetAlias(
    `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} defaultTarget`,
    value.defaultTarget,
  );

  if (defaultTarget !== undefined && !targets.some((target) => target.alias === defaultTarget)) {
    throw new Error(
      `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} defaultTarget must match a target alias.`,
    );
  }

  return {
    version: FORMLESS_INSTANCE_WORKSPACE_VERSION,
    kind: FORMLESS_INSTANCE_WORKSPACE_KIND,
    name: parseWorkspaceName(`${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} name`, value.name),
    ...(defaultTarget === undefined ? {} : { defaultTarget }),
    targets,
    archives: parseArchives(value.archives),
    local: parseLocalState(value.local),
    defaultAppPolicy: parseDefaultAppPolicy(value.defaultAppPolicy),
    apps: parseApps(value.apps),
    ...(value.deploy === undefined ? {} : { deploy: parseDeploy(value.deploy) }),
    ...(value.domains === undefined ? {} : { domains: parseDomains(value.domains) }),
  };
}

export function formatFormlessInstanceWorkspaceManifest(
  manifest: FormlessInstanceWorkspaceManifest,
): string {
  const parsed = parseFormlessInstanceWorkspaceManifest(manifest);
  const formatted: Record<string, unknown> = {
    version: parsed.version,
    kind: parsed.kind,
    name: parsed.name,
    ...(parsed.defaultTarget === undefined ? {} : { defaultTarget: parsed.defaultTarget }),
    targets: parsed.targets.map((target) => ({
      alias: target.alias,
      url: target.url,
    })),
    archives: {
      instance: parsed.archives.instance,
      apps: parsed.archives.apps,
    },
    local: {
      stateRoot: parsed.local.stateRoot,
    },
    defaultAppPolicy: parsed.defaultAppPolicy,
    apps: parsed.apps.map((app) => ({
      installId: app.installId,
      packageAppKey: app.packageAppKey,
      label: app.label,
      archivePath: app.archivePath,
      ...(app.routes === undefined
        ? {}
        : {
            routes: {
              ...(app.routes.admin === undefined ? {} : { admin: app.routes.admin }),
              ...(app.routes.schema === undefined ? {} : { schema: app.routes.schema }),
              ...(app.routes.public === undefined ? {} : { public: app.routes.public }),
            },
          }),
    })),
    ...(parsed.deploy === undefined
      ? {}
      : {
          deploy: {
            ...(parsed.deploy.workerName === undefined
              ? {}
              : { workerName: parsed.deploy.workerName }),
            ...(parsed.deploy.accountId === undefined
              ? {}
              : { accountId: parsed.deploy.accountId }),
            ...(parsed.deploy.workersDevUrl === undefined
              ? {}
              : { workersDevUrl: parsed.deploy.workersDevUrl }),
            ...(parsed.deploy.mediaBucket === undefined
              ? {}
              : { mediaBucket: parsed.deploy.mediaBucket }),
            migrationPolicy: parsed.deploy.migrationPolicy,
          },
        }),
    ...(parsed.domains === undefined
      ? {}
      : {
          domains: parsed.domains.map((domain) => ({
            enabled: domain.enabled,
            host: domain.host,
            profile: domain.profile,
            ...(domain.targetInstallId === undefined
              ? {}
              : { targetInstallId: domain.targetInstallId }),
          })),
        }),
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

function parseTargets(value: unknown): FormlessInstanceWorkspaceTarget[] {
  if (!Array.isArray(value)) {
    throw new Error(`${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} targets must be an array.`);
  }

  const targets = value.map((target, index) => parseTarget(target, index));
  const seen = new Set<string>();

  for (const target of targets) {
    if (seen.has(target.alias)) {
      throw new Error(
        `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} targets include duplicate alias "${target.alias}".`,
      );
    }

    seen.add(target.alias);
  }

  return targets.sort((left, right) => left.alias.localeCompare(right.alias));
}

function parseTarget(value: unknown, index: number): FormlessInstanceWorkspaceTarget {
  const context = `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} targets[${index}]`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertOnlyKeys(value, targetKeys, context);

  return {
    alias: parseFormlessInstanceWorkspaceTargetAlias(`${context} alias`, value.alias),
    url: normalizeFormlessInstanceWorkspaceTargetUrl(
      parseRequiredString(`${context} url`, value.url),
    ),
  };
}

function parseArchives(value: unknown): FormlessInstanceWorkspaceArchives {
  if (!isRecord(value)) {
    throw new Error(`${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} archives must be an object.`);
  }

  assertOnlyKeys(value, archivesKeys, `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} archives`);

  return {
    instance: parseRelativeWorkspacePath(
      `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} archives.instance`,
      value.instance,
    ),
    apps: parseRelativeWorkspacePath(
      `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} archives.apps`,
      value.apps,
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
  };
}

function parseDefaultAppPolicy(value: unknown): FormlessInstanceWorkspaceDefaultAppPolicy {
  if (value === "declared-installs" || value === "none" || value === "starter-site") {
    return value;
  }

  throw new Error(
    `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} defaultAppPolicy must be "starter-site", "declared-installs", or "none".`,
  );
}

function parseApps(value: unknown): FormlessInstanceWorkspaceApp[] {
  if (!Array.isArray(value)) {
    throw new Error(`${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} apps must be an array.`);
  }

  const apps = value.map((app, index) => parseApp(app, index));
  const seen = new Set<string>();

  for (const app of apps) {
    if (seen.has(app.installId)) {
      throw new Error(
        `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} apps include duplicate install id "${app.installId}".`,
      );
    }

    seen.add(app.installId);
  }

  return apps.sort((left, right) => left.installId.localeCompare(right.installId));
}

function parseApp(value: unknown, index: number): FormlessInstanceWorkspaceApp {
  const context = `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} apps[${index}]`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertOnlyKeys(value, appKeys, context);

  return {
    installId: parseAppInstallId(`${context} installId`, value.installId),
    packageAppKey: parsePackageAppKey(`${context} packageAppKey`, value.packageAppKey),
    label: parseRequiredString(`${context} label`, value.label),
    archivePath: parseRelativeWorkspacePath(`${context} archivePath`, value.archivePath),
    ...(value.routes === undefined ? {} : { routes: parseAppRoutes(value.routes, context) }),
  };
}

function parseAppRoutes(value: unknown, appContext: string): FormlessInstanceWorkspaceAppRoutes {
  const context = `${appContext} routes`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertOnlyKeys(value, appRouteKeys, context);

  const admin = parseOptionalRoute(`${context}.admin`, value.admin, "/apps/");
  const schema = parseOptionalRoute(`${context}.schema`, value.schema, "/apps/", "/schema");
  const publicRoute = parseOptionalRoute(`${context}.public`, value.public, "/sites/");
  const routes: FormlessInstanceWorkspaceAppRoutes = {};

  if (admin !== undefined) {
    routes.admin = admin as `/apps/${string}`;
  }

  if (schema !== undefined) {
    routes.schema = schema as `/apps/${string}/schema`;
  }

  if (publicRoute !== undefined) {
    routes.public = publicRoute as `/sites/${string}`;
  }

  return routes;
}

function parseDeploy(value: unknown): FormlessInstanceWorkspaceDeploy {
  if (!isRecord(value)) {
    throw new Error(`${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} deploy must be an object.`);
  }

  assertOnlyKeys(value, deployKeys, `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} deploy`);

  return {
    ...(value.workerName === undefined
      ? {}
      : {
          workerName: parseResourceSlug(
            `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} deploy.workerName`,
            value.workerName,
          ),
        }),
    ...(value.accountId === undefined
      ? {}
      : {
          accountId: parseRequiredString(
            `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} deploy.accountId`,
            value.accountId,
          ),
        }),
    ...(value.workersDevUrl === undefined
      ? {}
      : {
          workersDevUrl: normalizeFormlessInstanceWorkspaceTargetUrl(
            parseRequiredString(
              `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} deploy.workersDevUrl`,
              value.workersDevUrl,
            ),
          ),
        }),
    ...(value.mediaBucket === undefined
      ? {}
      : {
          mediaBucket: parseResourceSlug(
            `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} deploy.mediaBucket`,
            value.mediaBucket,
          ),
        }),
    migrationPolicy: parseMigrationPolicy(value.migrationPolicy),
  };
}

function parseDomains(value: unknown): FormlessInstanceWorkspaceDomainIntent[] {
  if (!Array.isArray(value)) {
    throw new Error(`${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} domains must be an array.`);
  }

  const domains = value.map((domain, index) => parseDomain(domain, index));
  const seen = new Set<string>();

  for (const domain of domains) {
    const key = domain.host;

    if (seen.has(key)) {
      throw new Error(
        `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} domains include duplicate host "${domain.host}".`,
      );
    }

    seen.add(key);
  }

  return domains.sort((left, right) => {
    const hostOrder = left.host.localeCompare(right.host);
    const profileOrder = left.profile.localeCompare(right.profile);
    const leftTarget = left.targetInstallId ?? "";
    const rightTarget = right.targetInstallId ?? "";

    return hostOrder === 0
      ? profileOrder === 0
        ? leftTarget.localeCompare(rightTarget)
        : profileOrder
      : hostOrder;
  });
}

function parseDomain(value: unknown, index: number): FormlessInstanceWorkspaceDomainIntent {
  const context = `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} domains[${index}]`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertOnlyKeys(value, domainKeys, context);

  const profileResult = resolveInstanceDomainMappingProfile({
    profile:
      value.profile === undefined
        ? undefined
        : parseRequiredString(`${context} profile`, value.profile),
    surface:
      value.surface === undefined
        ? undefined
        : parseRequiredString(`${context} surface`, value.surface),
  });

  if (!profileResult.ok) {
    throw new Error(
      `${context} ${profileResult.error.field ?? "profile"} is invalid: ${profileResult.error.message}`,
    );
  }

  const targetInstallId = parseDomainTargetInstallId(context, value, profileResult.profile);

  return {
    enabled: parseOptionalBoolean(`${context} enabled`, value.enabled) ?? true,
    host: parseHostname(`${context} host`, value.host),
    profile: profileResult.profile,
    ...(targetInstallId === undefined ? {} : { targetInstallId }),
  };
}

function parseDomainTargetInstallId(
  context: string,
  value: Record<string, unknown>,
  profile: InstanceDomainMappingProfile,
): string | undefined {
  const targetInstallId =
    value.targetInstallId === undefined
      ? undefined
      : parseAppInstallId(`${context} targetInstallId`, value.targetInstallId);
  const installId =
    value.installId === undefined
      ? undefined
      : parseAppInstallId(`${context} installId`, value.installId);

  if (targetInstallId !== undefined && installId !== undefined && targetInstallId !== installId) {
    throw new Error(`${context} targetInstallId and installId must match.`);
  }

  const target = targetInstallId ?? installId;

  if (profile === "instance") {
    if (target !== undefined) {
      throw new Error(`${context} instance profile must not include a target install id.`);
    }

    return undefined;
  }

  if (target === undefined) {
    throw new Error(`${context} ${profile} profile requires a target install id.`);
  }

  return target;
}

function parseOptionalTargetAlias(context: string, value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseFormlessInstanceWorkspaceTargetAlias(context, value);
}

function parseAppInstallId(context: string, value: unknown): string {
  const raw = parseRequiredString(context, value);
  const result = validateAppInstallId(raw);

  if (!result.ok) {
    throw new Error(`${context} is invalid: ${result.error.message}`);
  }

  return result.installId;
}

function parsePackageAppKey(context: string, value: unknown): string {
  const packageAppKey = parseRequiredString(context, value);

  if (!packageAppKeyPattern.test(packageAppKey)) {
    throw new Error(
      `${context} must start with a lowercase letter and use lowercase letters, numbers, and single hyphens.`,
    );
  }

  return packageAppKey;
}

function parseOptionalRoute(
  context: string,
  value: unknown,
  prefix: string,
  suffix = "",
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const route = parseRequiredString(context, value);

  if (!route.startsWith(prefix) || !route.endsWith(suffix) || route.includes("?")) {
    throw new Error(`${context} must be a static route starting with "${prefix}".`);
  }

  return route;
}

function parseMigrationPolicy(value: unknown): FormlessInstanceWorkspaceMigrationPolicy {
  if (value === "existing" || value === "new") {
    return value;
  }

  throw new Error(
    `${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE} deploy.migrationPolicy must be "new" or "existing".`,
  );
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

function parseHostname(context: string, value: unknown): string {
  const host = normalizeInstanceDomainHost(parseRequiredString(context, value));

  if (!host.ok) {
    throw new Error(`${context} must be a hostname.`);
  }

  return host.host;
}

function parseRequiredString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function parseOptionalBoolean(context: string, value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${context} must be a boolean.`);
  }

  return value;
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
