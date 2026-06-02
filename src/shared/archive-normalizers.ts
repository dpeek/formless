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
import {
  formatInstanceControlPlaneBoundaryEntityName,
  isInstanceControlPlaneEntityName,
  type InstanceControlPlaneEntityName,
} from "./instance-control-plane.ts";

export type ArchiveNormalizerArchiveKind = typeof APP_ARCHIVE_KIND | typeof INSTANCE_ARCHIVE_KIND;

export type ArchiveNormalizationEvidence = {
  archiveKind: ArchiveNormalizerArchiveKind;
  details?: string[];
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

const legacyInstanceControlPlaneEntityNames: Record<string, InstanceControlPlaneEntityName> = {
  appInstall: "app-install",
  appRoute: "app-route",
  deployAttempt: "deploy-attempt",
  deployDesiredResource: "deploy-desired-resource",
  deployDriftReport: "deploy-drift-report",
  deployEvidenceSummary: "deploy-evidence-summary",
  deployTarget: "deploy-target",
  domainMapping: "domain-mapping",
  providerConfigRef: "provider-config-ref",
  redirectIntent: "redirect-intent",
};

const instanceControlPlaneEntityNameNormalizerId = "archive.instance.control-plane-entity-names";

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
  let normalizedObject = object;

  if (version === ARCHIVE_VERSION) {
    const entityNormalization = normalizeArchiveControlPlaneEntityNames(normalizedObject);

    return {
      archive: parsePortableArchive(entityNormalization.value),
      evidence: entityNormalization.evidence,
    };
  }

  const normalizer = archiveNormalizerForInput({ archiveKind: kind, version });

  if (!normalizer) {
    throw new Error(
      `Archive version ${formatArchiveVersion(version)} has no registered normalizer for ${kind}.`,
    );
  }

  const { normalize: _normalize, ...evidence } = normalizer;
  normalizedObject = parseArchiveEnvelope("Archive", normalizer.normalize(object));
  const entityNormalization = normalizeArchiveControlPlaneEntityNames(normalizedObject);

  return {
    archive: parsePortableArchive(entityNormalization.value),
    evidence: [evidence, ...entityNormalization.evidence],
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

function normalizeArchiveControlPlaneEntityNames(input: Record<string, unknown>): {
  evidence: ArchiveNormalizationEvidence[];
  value: Record<string, unknown>;
} {
  if (input.kind !== INSTANCE_ARCHIVE_KIND) {
    return { evidence: [], value: input };
  }

  const controlPlane = input.controlPlane;

  if (!isPlainObject(controlPlane)) {
    return { evidence: [], value: input };
  }

  if (!Array.isArray(controlPlane.records)) {
    return { evidence: [], value: input };
  }

  const normalized = normalizeControlPlaneRecordEntityNames(controlPlane.records);

  if (normalized.evidenceDetails.length === 0) {
    return { evidence: [], value: input };
  }

  return {
    evidence: [
      {
        archiveKind: INSTANCE_ARCHIVE_KIND,
        details: normalized.evidenceDetails,
        fromVersion: ARCHIVE_VERSION,
        normalizerId: instanceControlPlaneEntityNameNormalizerId,
        summary:
          "Normalize legacy instance control-plane entity names to qualified kebab-case names.",
        toVersion: ARCHIVE_VERSION,
      },
    ],
    value: {
      ...input,
      controlPlane: {
        ...controlPlane,
        records: normalized.records,
      },
    },
  };
}

function normalizeControlPlaneRecordEntityNames(records: unknown[]): {
  evidenceDetails: string[];
  records: unknown[];
} {
  const spellingsByEntity = new Map<InstanceControlPlaneEntityName, Set<"canonical" | "legacy">>();
  const replacementsByOriginal = new Map<string, { count: number; to: string }>();

  for (const record of records) {
    if (!isPlainObject(record) || typeof record.entity !== "string") {
      continue;
    }

    const spelling = classifyInstanceControlPlaneEntitySpelling(record.entity);

    if (!spelling) {
      continue;
    }

    const spellings = spellingsByEntity.get(spelling.entity) ?? new Set();
    spellings.add(spelling.kind);
    spellingsByEntity.set(spelling.entity, spellings);

    if (spelling.kind === "legacy") {
      const to = formatInstanceControlPlaneBoundaryEntityName(spelling.entity);
      const existing = replacementsByOriginal.get(record.entity);

      replacementsByOriginal.set(record.entity, {
        count: (existing?.count ?? 0) + 1,
        to,
      });
    }
  }

  for (const [entity, spellings] of spellingsByEntity) {
    if (spellings.has("legacy") && spellings.has("canonical")) {
      throw new Error(
        `Instance archive controlPlane records mix legacy and canonical entity names for "${formatInstanceControlPlaneBoundaryEntityName(entity)}".`,
      );
    }
  }

  if (replacementsByOriginal.size === 0) {
    return { evidenceDetails: [], records };
  }

  const normalizedRecords = records.map((record) => {
    if (!isPlainObject(record) || typeof record.entity !== "string") {
      return record;
    }

    const spelling = classifyInstanceControlPlaneEntitySpelling(record.entity);

    if (!spelling || spelling.kind !== "legacy") {
      return record;
    }

    return {
      ...record,
      entity: formatInstanceControlPlaneBoundaryEntityName(spelling.entity),
    };
  });

  return {
    evidenceDetails: [...replacementsByOriginal.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([from, replacement]) => {
        const recordLabel = replacement.count === 1 ? "record" : "records";

        return `${from} -> ${replacement.to} (${replacement.count} ${recordLabel})`;
      }),
    records: normalizedRecords,
  };
}

function classifyInstanceControlPlaneEntitySpelling(value: string):
  | {
      entity: InstanceControlPlaneEntityName;
      kind: "canonical" | "legacy";
    }
  | undefined {
  const legacy = legacyInstanceControlPlaneEntityNames[value];

  if (legacy) {
    return { entity: legacy, kind: "legacy" };
  }

  if (isInstanceControlPlaneEntityName(value)) {
    return { entity: value, kind: "canonical" };
  }

  const [schemaKey, entityKey, extra] = value.split(":");

  if (schemaKey !== "instance" || entityKey === undefined || extra !== undefined) {
    return undefined;
  }

  const legacyQualified = legacyInstanceControlPlaneEntityNames[entityKey];

  if (legacyQualified) {
    return { entity: legacyQualified, kind: "legacy" };
  }

  if (isInstanceControlPlaneEntityName(entityKey)) {
    return { entity: entityKey, kind: "canonical" };
  }

  return undefined;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
