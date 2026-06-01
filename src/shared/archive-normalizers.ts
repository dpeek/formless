import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  parsePortableArchive,
  type AppArchive,
  type InstanceArchive,
  type PortableArchive,
} from "./archive.ts";
import { packageAppFactsForKey } from "./app-installs.ts";

export type ArchiveNormalizerArchiveKind = typeof APP_ARCHIVE_KIND | typeof INSTANCE_ARCHIVE_KIND;

export type ArchiveNormalizationEvidence = {
  archiveKind: ArchiveNormalizerArchiveKind;
  fromVersion: number;
  normalizerId: string;
  summary: string;
  toVersion: typeof ARCHIVE_VERSION;
};

export type ArchiveNormalizerDefinition = ArchiveNormalizationEvidence & {
  normalize: (value: Record<string, unknown>) => unknown;
};

export type ArchiveNormalizationResult = {
  archive: PortableArchive;
  evidence: ArchiveNormalizationEvidence[];
};

const archiveNormalizers = createArchiveNormalizerRegistry([
  {
    archiveKind: APP_ARCHIVE_KIND,
    fromVersion: 1,
    normalizerId: "archive.app.v1-to-v2.package-facts",
    normalize: normalizeV1AppArchive,
    summary: "Add package revision and source schema hash facts to app archive installs.",
    toVersion: ARCHIVE_VERSION,
  },
  {
    archiveKind: INSTANCE_ARCHIVE_KIND,
    fromVersion: 1,
    normalizerId: "archive.instance.v1-to-v2.package-facts",
    normalize: normalizeV1InstanceArchive,
    summary: "Add package revision and source schema hash facts to instance archive installs.",
    toVersion: ARCHIVE_VERSION,
  },
] satisfies readonly ArchiveNormalizerDefinition[]);

export function listArchiveNormalizers(): ArchiveNormalizationEvidence[] {
  return archiveNormalizers.map(({ normalize: _normalize, ...evidence }) => evidence);
}

export function findArchiveNormalizer(input: {
  archiveKind: string | null;
  version: number | string | null;
}): ArchiveNormalizationEvidence | undefined {
  const normalizer = archiveNormalizerForInput(input);

  if (!normalizer) {
    return undefined;
  }

  const { normalize: _normalize, ...evidence } = normalizer;

  return evidence;
}

export function normalizePortableArchive(value: unknown): ArchiveNormalizationResult {
  const object = parseArchiveEnvelope("Archive", value);
  const kind = parseArchiveKind(object.kind);
  const version = parseArchiveVersion(object.version);

  if (version === ARCHIVE_VERSION) {
    return {
      archive: parsePortableArchive(object),
      evidence: [],
    };
  }

  const normalizer = archiveNormalizerForInput({ archiveKind: kind, version });

  if (!normalizer) {
    throw new Error(
      `Archive version ${formatArchiveVersion(version)} has no registered normalizer for ${kind}.`,
    );
  }

  const archive = parsePortableArchive(normalizer.normalize(object));
  const { normalize: _normalize, ...evidence } = normalizer;

  return {
    archive,
    evidence: [evidence],
  };
}

export function normalizeAppArchive(value: unknown): {
  archive: AppArchive;
  evidence: ArchiveNormalizationEvidence[];
} {
  const result = normalizePortableArchive(value);

  if (result.archive.kind !== APP_ARCHIVE_KIND) {
    throw new Error(`App archive kind must be "${APP_ARCHIVE_KIND}".`);
  }

  return {
    archive: result.archive,
    evidence: result.evidence,
  };
}

export function normalizeInstanceArchive(value: unknown): {
  archive: InstanceArchive;
  evidence: ArchiveNormalizationEvidence[];
} {
  const result = normalizePortableArchive(value);

  if (result.archive.kind !== INSTANCE_ARCHIVE_KIND) {
    throw new Error(`Instance archive kind must be "${INSTANCE_ARCHIVE_KIND}".`);
  }

  return {
    archive: result.archive,
    evidence: result.evidence,
  };
}

function createArchiveNormalizerRegistry(
  normalizers: readonly ArchiveNormalizerDefinition[],
): ArchiveNormalizerDefinition[] {
  const seen = new Set<string>();

  for (const normalizer of normalizers) {
    const key = archiveNormalizerKey(normalizer.archiveKind, normalizer.fromVersion);

    if (seen.has(key)) {
      throw new Error(`Archive normalizer "${key}" is registered more than once.`);
    }

    seen.add(key);
  }

  return [...normalizers].sort((left, right) =>
    archiveNormalizerKey(left.archiveKind, left.fromVersion).localeCompare(
      archiveNormalizerKey(right.archiveKind, right.fromVersion),
    ),
  );
}

function archiveNormalizerForInput(input: {
  archiveKind: string | null;
  version: number | string | null;
}): ArchiveNormalizerDefinition | undefined {
  if (typeof input.version !== "number") {
    return undefined;
  }

  return archiveNormalizers.find(
    (normalizer) =>
      normalizer.archiveKind === input.archiveKind && normalizer.fromVersion === input.version,
  );
}

function normalizeV1InstanceArchive(value: Record<string, unknown>): unknown {
  assertVersion("Instance archive", value.version, 1);
  const apps = parseArray("Instance archive apps", value.apps);

  return {
    ...value,
    version: ARCHIVE_VERSION,
    apps: apps.map((app, index) =>
      normalizeV1AppArchiveObject(
        parseArchiveEnvelope(`Instance archive apps[${index}]`, app),
        `Instance archive apps[${index}]`,
      ),
    ),
  };
}

function normalizeV1AppArchive(value: Record<string, unknown>): unknown {
  return normalizeV1AppArchiveObject(value, "App archive");
}

function normalizeV1AppArchiveObject(
  value: Record<string, unknown>,
  context: string,
): Record<string, unknown> {
  assertVersion(context, value.version, 1);

  return {
    ...value,
    version: ARCHIVE_VERSION,
    app: normalizeV1ArchivedAppInstall(`${context} app`, value.app),
  };
}

function normalizeV1ArchivedAppInstall(context: string, value: unknown): Record<string, unknown> {
  const app = parseObject(context, value);
  const packageAppKey = typeof app.packageAppKey === "string" ? app.packageAppKey.trim() : "";
  const facts = packageAppKey ? packageAppFactsForKey(packageAppKey) : undefined;

  if (!facts) {
    throw new Error(
      `${context} packageAppKey "${packageAppKey || "unknown"}" has no bundled package facts for archive normalization.`,
    );
  }

  return {
    ...app,
    packageRevision: facts.packageRevision,
    sourceSchemaHash: facts.sourceSchemaHash,
  };
}

function parseArchiveEnvelope(context: string, value: unknown): Record<string, unknown> {
  const object = parseObject(context, value);

  if (typeof object.kind !== "string" || object.kind.trim() === "") {
    throw new Error(`${context} must include "kind".`);
  }

  if (object.kind !== APP_ARCHIVE_KIND && object.kind !== INSTANCE_ARCHIVE_KIND) {
    throw new Error(`Archive kind "${object.kind}" is unsupported.`);
  }

  return object;
}

function parseArchiveKind(value: unknown): ArchiveNormalizerArchiveKind {
  if (value === APP_ARCHIVE_KIND || value === INSTANCE_ARCHIVE_KIND) {
    return value;
  }

  throw new Error(`Archive kind "${String(value)}" is unsupported.`);
}

function parseObject(context: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function parseArray(context: string, value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  return value;
}

function assertVersion(context: string, value: unknown, expected: number): void {
  if (value !== expected) {
    throw new Error(`${context} version must be ${expected} for archive normalization.`);
  }
}

function parseArchiveVersion(value: unknown): number | string | null {
  return typeof value === "number" || typeof value === "string" ? value : null;
}

function archiveNormalizerKey(kind: ArchiveNormalizerArchiveKind, version: number): string {
  return `${kind}@${version}`;
}

function formatArchiveVersion(version: number | string | null): string {
  return version === null ? "unknown" : String(version);
}
