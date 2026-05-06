import { matchesQuery } from "../shared/query.ts";
import type {
  FieldValue,
  SiteBlockNode,
  SitePageTreeProjection,
  SitePlacementNode,
  SiteTreeWarning,
  StoredRecord,
} from "../shared/protocol.ts";
import type { AppSchema, CollectionQuerySchema } from "../shared/schema.ts";

export type {
  SiteBlockNode,
  SitePageTree,
  SitePageTreeProjection,
  SitePlacementNode,
  SiteTreeMeta,
  SiteTreeWarning,
} from "../shared/protocol.ts";

export type BuildSitePageTreeOptions = {
  generatedAt?: string;
  maxDepth?: number;
};

type SiteTreeIndexes = {
  blocks: Map<string, StoredRecord>;
  placementsByParent: Map<string, StoredRecord[]>;
};

type SiteTreeBuildContext = {
  schema: AppSchema;
  indexes: SiteTreeIndexes;
  warnings: SiteTreeWarning[];
  maxDepth: number;
};

const DEFAULT_MAX_DEPTH = 16;
const QUERY_BLOCK_TYPES = new Set(["contentList", "contentGrid"]);

export function buildSitePageTree(
  schema: AppSchema,
  records: StoredRecord[],
  slug: string,
  options: BuildSitePageTreeOptions = {},
): SitePageTreeProjection {
  const warnings: SiteTreeWarning[] = [];
  const meta = {
    slug,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    warnings,
  };
  const indexes = indexSiteRecords(records);
  const root = resolveRootPage(indexes.blocks, slug, warnings);

  if (!root) {
    warnings.push({
      code: "missing-root",
      recordId: slug,
      message: `No published page block found for slug "${slug}".`,
    });

    return { tree: null, meta };
  }

  const context = {
    schema,
    indexes,
    warnings,
    maxDepth: normalizeMaxDepth(options.maxDepth),
  };
  const page = buildBlockNode(root, context, 0, new Set());

  return {
    tree: {
      page,
      meta,
    },
    meta,
  };
}

function indexSiteRecords(records: StoredRecord[]): SiteTreeIndexes {
  const blocks = new Map<string, StoredRecord>();
  const placementsByParent = new Map<string, StoredRecord[]>();

  for (const record of records) {
    if (record.entity === "block") {
      blocks.set(record.id, record);
      continue;
    }

    if (record.entity !== "blockPlacement" || record.deletedAt || record.values.visible !== true) {
      continue;
    }

    const parentId = stringValue(record.values.parent);

    if (!parentId) {
      continue;
    }

    const placements = placementsByParent.get(parentId) ?? [];
    placements.push(record);
    placementsByParent.set(parentId, placements);
  }

  for (const placements of placementsByParent.values()) {
    placements.sort(comparePlacements);
  }

  return { blocks, placementsByParent };
}

function resolveRootPage(
  blocks: Map<string, StoredRecord>,
  slug: string,
  warnings: SiteTreeWarning[],
): StoredRecord | undefined {
  const candidates = [...blocks.values()]
    .filter(
      (record) =>
        record.entity === "block" &&
        stringValue(record.values.type) === "page" &&
        stringValue(record.values.slug) === slug,
    )
    .sort(compareRecords);
  const publicCandidates: StoredRecord[] = [];

  for (const candidate of candidates) {
    if (isPublicBlock(candidate)) {
      publicCandidates.push(candidate);
      continue;
    }

    warnings.push({
      code: "skipped-root",
      recordId: candidate.id,
      message: `Skipped non-public page block "${candidate.id}" for slug "${slug}".`,
    });
  }

  const root = publicCandidates[0];

  for (const duplicate of publicCandidates.slice(1)) {
    warnings.push({
      code: "skipped-root",
      recordId: duplicate.id,
      message: `Skipped duplicate published page block "${duplicate.id}" for slug "${slug}".`,
    });
  }

  return root;
}

function buildBlockNode(
  record: StoredRecord,
  context: SiteTreeBuildContext,
  depth: number,
  ancestors: Set<string>,
): SiteBlockNode {
  const node = projectBlock(record);

  if (depth >= context.maxDepth) {
    warnIfDepthStopsTraversal(record, context);
    return node;
  }

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(record.id);
  node.placements = buildPlacementNodes(record.id, context, depth, nextAncestors);
  const query = buildQueryProjection(record, context, depth, nextAncestors);

  if (query) {
    node.query = query;
  }

  return node;
}

function buildPlacementNodes(
  parentId: string,
  context: SiteTreeBuildContext,
  depth: number,
  ancestors: Set<string>,
): SitePlacementNode[] {
  const placements = context.indexes.placementsByParent.get(parentId) ?? [];
  const nodes: SitePlacementNode[] = [];

  for (const placement of placements) {
    const childBlockId = stringValue(placement.values.block);

    if (!childBlockId) {
      warnMissingChild(placement, context.warnings);
      continue;
    }

    const childBlock = context.indexes.blocks.get(childBlockId);

    if (!childBlock) {
      warnMissingChild(placement, context.warnings);
      continue;
    }

    if (!isPublicBlock(childBlock)) {
      continue;
    }

    if (ancestors.has(childBlock.id)) {
      context.warnings.push({
        code: "cycle",
        recordId: placement.id,
        message: `Skipped cyclic placement "${placement.id}" to block "${childBlock.id}".`,
      });
      continue;
    }

    nodes.push(
      projectPlacement(placement, buildBlockNode(childBlock, context, depth + 1, ancestors)),
    );
  }

  return nodes;
}

function buildQueryProjection(
  record: StoredRecord,
  context: SiteTreeBuildContext,
  depth: number,
  ancestors: Set<string>,
): SiteBlockNode["query"] | undefined {
  if (!QUERY_BLOCK_TYPES.has(stringValue(record.values.type) ?? "")) {
    return undefined;
  }

  const queryKey = stringValue(record.values.templateKey) ?? "";
  const query = context.schema.queries[queryKey];

  if (!isBlockQuery(query)) {
    context.warnings.push({
      code: "bad-query-key",
      recordId: record.id,
      message: `Block "${record.id}" references missing or non-block query "${queryKey}".`,
    });

    return { key: queryKey, items: [] };
  }

  const queryRecords = matchPublicQueryBlocks(query, context, record.id);
  const limit = nonNegativeNumberValue(record.values.limit);
  const limitedRecords = limit === undefined ? queryRecords : queryRecords.slice(0, limit);
  const items: SiteBlockNode[] = [];

  for (const item of limitedRecords) {
    if (ancestors.has(item.id)) {
      context.warnings.push({
        code: "cycle",
        recordId: item.id,
        message: `Skipped cyclic query item "${item.id}" for block "${record.id}".`,
      });
      continue;
    }

    items.push(buildBlockNode(item, context, depth + 1, ancestors));
  }

  return { key: queryKey, items };
}

function matchPublicQueryBlocks(
  query: CollectionQuerySchema,
  context: SiteTreeBuildContext,
  sourceRecordId: string,
): StoredRecord[] {
  try {
    return [...context.indexes.blocks.values()]
      .filter(isPublicBlock)
      .filter((record) => matchesQuery(record, query.expression))
      .sort(compareQueryBlocks);
  } catch (error) {
    context.warnings.push({
      code: "bad-query-key",
      recordId: sourceRecordId,
      message: `Block "${sourceRecordId}" query "${query.label}" could not be evaluated: ${
        error instanceof Error ? error.message : "Unknown query error."
      }`,
    });

    return [];
  }
}

function projectBlock(record: StoredRecord): SiteBlockNode {
  return {
    id: record.id,
    type: stringValue(record.values.type) ?? "",
    title: stringValue(record.values.title) ?? "",
    ...optionalStringField("label", record.values.label),
    ...optionalStringField("subtitle", record.values.subtitle),
    ...optionalStringField("body", record.values.body),
    ...optionalStringField("slug", record.values.slug),
    ...optionalStringField("href", record.values.href),
    ...optionalStringField("icon", record.values.icon),
    ...optionalStringField("color", record.values.color),
    ...optionalStringField("templateKey", record.values.templateKey),
    ...optionalStringField("assetKey", record.values.assetKey),
    ...optionalStringField("alt", record.values.alt),
    ...optionalNumberField("width", record.values.width),
    ...optionalNumberField("height", record.values.height),
    placements: [],
  };
}

function projectPlacement(placement: StoredRecord, childBlock: SiteBlockNode): SitePlacementNode {
  return {
    id: placement.id,
    slot: stringValue(placement.values.slot) ?? "",
    order: numberValue(placement.values.order) ?? 0,
    visible: placement.values.visible === true,
    ...optionalStringField("variant", placement.values.variant),
    ...optionalStringField("label", placement.values.label),
    block: childBlock,
  };
}

function warnMissingChild(placement: StoredRecord, warnings: SiteTreeWarning[]) {
  warnings.push({
    code: "missing-child-block",
    recordId: placement.id,
    message: `Placement "${placement.id}" references missing child block "${String(
      placement.values.block,
    )}".`,
  });
}

function warnIfDepthStopsTraversal(record: StoredRecord, context: SiteTreeBuildContext) {
  const hasPlacements = (context.indexes.placementsByParent.get(record.id) ?? []).length > 0;
  const hasQuery = QUERY_BLOCK_TYPES.has(stringValue(record.values.type) ?? "");

  if (!hasPlacements && !hasQuery) {
    return;
  }

  context.warnings.push({
    code: "max-depth",
    recordId: record.id,
    message: `Stopped tree traversal at block "${record.id}" because max depth ${context.maxDepth} was reached.`,
  });
}

function isBlockQuery(query: CollectionQuerySchema | undefined): query is CollectionQuerySchema {
  return query?.entity === "block";
}

function isPublicBlock(record: StoredRecord): boolean {
  return record.entity === "block" && !record.deletedAt && record.values.status === "published";
}

function comparePlacements(a: StoredRecord, b: StoredRecord): number {
  return (
    compareStrings(stringValue(a.values.slot) ?? "", stringValue(b.values.slot) ?? "") ||
    compareNumbers(numberValue(a.values.order), numberValue(b.values.order)) ||
    compareRecords(a, b)
  );
}

function compareQueryBlocks(a: StoredRecord, b: StoredRecord): number {
  const aPublishedAt = stringValue(a.values.publishedAt);
  const bPublishedAt = stringValue(b.values.publishedAt);

  if (aPublishedAt && bPublishedAt && aPublishedAt !== bPublishedAt) {
    return compareStrings(bPublishedAt, aPublishedAt);
  }

  if (aPublishedAt && !bPublishedAt) {
    return -1;
  }

  if (!aPublishedAt && bPublishedAt) {
    return 1;
  }

  return compareRecords(a, b);
}

function compareRecords(a: StoredRecord, b: StoredRecord): number {
  return compareStrings(a.createdAt, b.createdAt) || compareStrings(a.id, b.id);
}

function compareStrings(a: string, b: string): number {
  if (a < b) {
    return -1;
  }

  if (a > b) {
    return 1;
  }

  return 0;
}

function compareNumbers(a: number | undefined, b: number | undefined): number {
  if (a === undefined && b === undefined) {
    return 0;
  }

  if (a === undefined) {
    return 1;
  }

  if (b === undefined) {
    return -1;
  }

  return a - b;
}

function stringValue(value: FieldValue | undefined): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function numberValue(value: FieldValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nonNegativeNumberValue(value: FieldValue | undefined): number | undefined {
  const number = numberValue(value);

  return number === undefined || number < 0 ? undefined : number;
}

function optionalStringField<Key extends string>(
  key: Key,
  value: FieldValue | undefined,
): Partial<Record<Key, string>> {
  const string = stringValue(value);

  return string === undefined ? {} : ({ [key]: string } as Partial<Record<Key, string>>);
}

function optionalNumberField<Key extends string>(
  key: Key,
  value: FieldValue | undefined,
): Partial<Record<Key, number>> {
  const number = numberValue(value);

  return number === undefined ? {} : ({ [key]: number } as Partial<Record<Key, number>>);
}

function normalizeMaxDepth(maxDepth: number | undefined): number {
  if (maxDepth === undefined || !Number.isFinite(maxDepth)) {
    return DEFAULT_MAX_DEPTH;
  }

  return Math.max(0, Math.floor(maxDepth));
}
