import type {
  FieldValue,
  SiteBlockNode,
  SitePageFrame,
  SitePageTreeProjection,
  SitePlacementNode,
  SiteTreeWarning,
  StoredRecord,
} from "../shared/protocol.ts";
import type { AppSchema } from "../shared/schema.ts";

export type {
  SiteBlockNode,
  SitePageFrame,
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
      message: `No page block found for route "${slug}".`,
    });

    return { tree: null, meta };
  }

  const context = {
    schema,
    indexes,
    warnings,
    maxDepth: normalizeMaxDepth(options.maxDepth),
  };
  const frame = buildSitePageFrame(context);
  const page = buildBlockNode(root, context, 0, new Set());

  return {
    tree: {
      page,
      frame,
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
      if (!record.deletedAt) {
        blocks.set(record.id, record);
      }
      continue;
    }

    if (record.entity !== "blockPlacement" || record.deletedAt) {
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
        hrefMatchesRoute(stringValue(record.values.href), slug),
    )
    .sort(compareRecords);

  const root = candidates[0];

  for (const duplicate of candidates.slice(1)) {
    warnings.push({
      code: "skipped-root",
      recordId: duplicate.id,
      message: `Skipped duplicate page block "${duplicate.id}" for route "${slug}".`,
    });
  }

  return root;
}

function buildSitePageFrame(context: SiteTreeBuildContext): SitePageFrame {
  return {
    ...optionalFrameRoot("header", context),
    ...optionalFrameRoot("footer", context),
  };
}

function optionalFrameRoot(
  type: "header" | "footer",
  context: SiteTreeBuildContext,
): Partial<SitePageFrame> {
  const root = resolveFrameRoot(context.indexes.blocks, type, context.warnings);

  if (!root) {
    return {};
  }

  return {
    [type]: buildBlockNode(root, context, 0, new Set()),
  };
}

function resolveFrameRoot(
  blocks: Map<string, StoredRecord>,
  type: "header" | "footer",
  warnings: SiteTreeWarning[],
): StoredRecord | undefined {
  const candidates = [...blocks.values()]
    .filter((record) => record.entity === "block" && stringValue(record.values.type) === type)
    .sort(compareRecords);

  const root = candidates[0];

  if (!root) {
    warnings.push({
      code: "missing-frame-root",
      recordId: type,
      message: `No ${type} block found for the Site frame.`,
    });
    return undefined;
  }

  for (const duplicate of candidates.slice(1)) {
    warnings.push({
      code: "skipped-frame-root",
      recordId: duplicate.id,
      message: `Skipped duplicate ${type} frame block "${duplicate.id}".`,
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

function projectBlock(record: StoredRecord): SiteBlockNode {
  return {
    id: record.id,
    type: stringValue(record.values.type) ?? "",
    label: stringValue(record.values.label) ?? "",
    ...optionalStringField("body", record.values.body),
    ...optionalStringField("href", record.values.href),
    ...optionalStringField("icon", record.values.icon),
    ...optionalStringField("color", record.values.color),
    ...optionalStringField("templateKey", record.values.templateKey),
    ...optionalNumberField("width", record.values.width),
    ...optionalNumberField("height", record.values.height),
    placements: [],
  };
}

function projectPlacement(placement: StoredRecord, childBlock: SiteBlockNode): SitePlacementNode {
  return {
    id: placement.id,
    order: numberValue(placement.values.order) ?? 0,
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

  if (!hasPlacements) {
    return;
  }

  context.warnings.push({
    code: "max-depth",
    recordId: record.id,
    message: `Stopped tree traversal at block "${record.id}" because max depth ${context.maxDepth} was reached.`,
  });
}

function comparePlacements(a: StoredRecord, b: StoredRecord): number {
  return (
    compareNumbers(numberValue(a.values.order), numberValue(b.values.order)) || compareRecords(a, b)
  );
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

function hrefMatchesRoute(href: string | undefined, slug: string): boolean {
  if (!href) {
    return false;
  }

  const hrefPath = normalizeHrefPath(href);
  const routePath = normalizeRoutePath(slug);
  const previewPath = `/pages/${routePath}`;
  const publishedPath = routePath === "home" ? "/" : `/${routePath}`;

  return hrefPath === previewPath || hrefPath === publishedPath;
}

function normalizeHrefPath(href: string): string {
  const path = href.split(/[?#]/, 1)[0] ?? "";
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;

  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, "") : withLeadingSlash;
}

function normalizeRoutePath(slug: string): string {
  const trimmed = slug.trim().replace(/^\/+/, "").replace(/\/+$/, "");

  return trimmed === "" ? "home" : trimmed;
}
