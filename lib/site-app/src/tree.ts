import type {
  FieldValue,
  SiteBlockNode,
  SiteMediaNode,
  SitePageFrame,
  SiteSettingsNode,
  SitePublicOperationInputFieldNode,
  SitePublicOperationNode,
  SitePublicOperationTargetNode,
  SitePageTreeProjection,
  SitePlacementNode,
  SiteTreeWarning,
  StoredRecord,
} from "./types.ts";
import {
  isOperationHandlerEffectForKind,
  projectPublicSafeOperationInputFields,
  selectAnonymousPublicOperation,
  selectAnonymousPublicOperationByKey,
  type AppSchema,
  type EntityOperationSchema,
} from "@dpeek/formless-schema";
import { coreImageMediaDeliveryFactsForAssetId } from "@dpeek/formless-media";
import {
  resolveSiteRoute,
  routeInfoForResolution,
  type SiteRouteResolution,
} from "./route-resolver.ts";
import { resolveSiteLinkHref } from "./link-targets.ts";

export type {
  SiteBlockNode,
  SitePageFrame,
  SitePageTree,
  SitePageTreeProjection,
  SitePlacementNode,
  SiteTreeMeta,
  SiteTreeWarning,
} from "./types.ts";

export type BuildSitePageTreeOptions = {
  generatedAt?: string;
  maxDepth?: number;
  publicOperationTargetResolver?: SitePublicOperationTargetResolver;
  target?: { apiRoutePrefix: `/${string}` };
  turnstileSiteKey?: string;
};

export type SitePublicOperationTargetRequest =
  | {
      kind: "schemaKey";
      schemaKey: string;
    }
  | {
      kind: "appInstall";
      packageAppKey: string;
      installId: string;
    };

export type SitePublicOperationTargetResolution = {
  route: SitePublicOperationTargetNode;
  schema: AppSchema;
};

export type SitePublicOperationTargetResolver = (
  request: SitePublicOperationTargetRequest,
) => SitePublicOperationTargetResolution | undefined;

type SiteTreeIndexes = {
  blocks: Map<string, StoredRecord>;
  siteSettings: StoredRecord[];
  placementsByParent: Map<string, StoredRecord[]>;
};

type SiteTreeBuildContext = {
  schema: AppSchema;
  indexes: SiteTreeIndexes;
  publicOperationTargetResolver?: SitePublicOperationTargetResolver;
  publicOperationApiRoutePrefix: `/${string}`;
  turnstileSiteKey?: string;
  warnings: SiteTreeWarning[];
  maxDepth: number;
};

const DEFAULT_MAX_DEPTH = 16;
const DEFAULT_SITE_PUBLIC_API_ROUTE_PREFIX = "/api/site";
const PRIMARY_IMAGE_SLOT = "primaryImage";
const LIST_BLOCK_ITEM_TYPES = {
  postList: "post",
  projectList: "project",
} as const;

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
  const site = projectSiteSettings(indexes.siteSettings, warnings);
  const route = resolveSiteRoute(indexes.blocks.values(), slug, warnings);

  if (!route) {
    warnings.push({
      code: "missing-root",
      recordId: slug,
      message: `No Site route found for "${slug}".`,
    });

    return { tree: null, meta };
  }

  const context = {
    schema,
    indexes,
    ...(options.publicOperationTargetResolver === undefined
      ? {}
      : { publicOperationTargetResolver: options.publicOperationTargetResolver }),
    publicOperationApiRoutePrefix:
      options.target?.apiRoutePrefix ?? DEFAULT_SITE_PUBLIC_API_ROUTE_PREFIX,
    ...(options.turnstileSiteKey === undefined
      ? {}
      : { turnstileSiteKey: options.turnstileSiteKey }),
    warnings,
    maxDepth: normalizeMaxDepth(options.maxDepth),
  };
  const frame = buildSitePageFrame(context);
  const page = buildRoutePageNode(route, context);

  return {
    tree: {
      ...(site ? { site } : {}),
      page,
      frame,
      meta,
      route: routeInfoForResolution(route),
    },
    meta,
  };
}

function indexSiteRecords(records: StoredRecord[]): SiteTreeIndexes {
  const blocks = new Map<string, StoredRecord>();
  const siteSettings: StoredRecord[] = [];
  const placementsByParent = new Map<string, StoredRecord[]>();

  for (const record of records) {
    if (record.entity === "site") {
      if (!record.deletedAt) {
        siteSettings.push(record);
      }
      continue;
    }

    if (record.entity === "block") {
      if (!record.deletedAt) {
        blocks.set(record.id, record);
      }
      continue;
    }

    if (record.entity !== "block-placement" || record.deletedAt) {
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

  siteSettings.sort(compareRecords);

  return { blocks, siteSettings, placementsByParent };
}

function projectSiteSettings(
  siteSettings: StoredRecord[],
  warnings: SiteTreeWarning[],
): SiteSettingsNode | undefined {
  const primarySettings = siteSettings.filter(
    (record) => stringValue(record.values.key) === "primary",
  );
  const settings = primarySettings[0];

  if (!settings) {
    warnings.push({
      code: "missing-site-settings",
      recordId: "site",
      message: 'No active Site settings record found for key "primary".',
    });
    return undefined;
  }

  for (const duplicate of primarySettings.slice(1)) {
    warnings.push({
      code: "skipped-site-settings",
      recordId: duplicate.id,
      message: `Skipped duplicate Site settings record "${duplicate.id}".`,
    });
  }

  const label = stringValue(settings.values.label);

  if (!label) {
    warnings.push({
      code: "invalid-site-settings",
      recordId: settings.id,
      message: `Site settings record "${settings.id}" does not have a label.`,
    });
    return undefined;
  }

  return {
    id: settings.id,
    label,
    ...optionalStringField("description", settings.values.description),
    ...optionalStringField("icon", settings.values.icon),
    ...optionalStringField("accentColor", settings.values.accentColor),
    ...optionalStringField("backgroundColor", settings.values.backgroundColor),
  };
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

function buildRoutePageNode(
  route: SiteRouteResolution,
  context: SiteTreeBuildContext,
): SiteBlockNode {
  switch (route.kind) {
    case "page":
      return buildBlockNode(route.page, context, 0, new Set());
    case "post":
      return buildBlockNode(route.post, context, 0, new Set());
  }
}

function buildBlockNode(
  record: StoredRecord,
  context: SiteTreeBuildContext,
  depth: number,
  ancestors: Set<string>,
): SiteBlockNode {
  const node = projectBlock(record, context);
  const listItemType = listItemTypeForBlock(node.type);

  if (listItemType) {
    node.query = {
      key: node.type,
      items: buildContentListItems(listItemType, context),
    };
    return node;
  }

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
  filter?: (placement: StoredRecord) => boolean,
): SitePlacementNode[] {
  const placements = context.indexes.placementsByParent.get(parentId) ?? [];
  const nodes: SitePlacementNode[] = [];

  for (const placement of placements) {
    if (filter && !filter(placement)) {
      continue;
    }

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

    if (!isPublicRenderableBlock(childBlock)) {
      continue;
    }

    nodes.push(
      projectPlacement(placement, buildBlockNode(childBlock, context, depth + 1, ancestors)),
    );
  }

  return nodes;
}

function projectBlock(record: StoredRecord, context: SiteTreeBuildContext): SiteBlockNode {
  const type = stringValue(record.values.type) ?? "";
  const linkProjection = projectedLinkFields(record, type, context);
  const mediaProjection = projectedMediaFields(record, type, context);
  const publicOperationProjection = projectedPublicOperationFields(record, type, context);
  const publicFormBlock = type === "subscribeForm" || type === "contactForm";
  const publicOperationFormBlock = type === "publicOperationForm";
  const operationFormBlock = publicFormBlock || publicOperationFormBlock;

  return {
    id: record.id,
    type,
    label: stringValue(record.values.label) ?? "",
    ...optionalStringField("body", record.values.body),
    ...(publicFormBlock ? optionalStringField("operationName", record.values.operationName) : {}),
    ...(publicOperationFormBlock
      ? optionalStringField("operationKey", record.values.operationKey)
      : {}),
    ...(operationFormBlock ? optionalStringField("buttonLabel", record.values.buttonLabel) : {}),
    ...(type === "contactForm" || publicOperationFormBlock
      ? optionalStringField("successLabel", record.values.successLabel)
      : {}),
    ...(type === "contactForm" ? optionalStringField("nameLabel", record.values.nameLabel) : {}),
    ...(type === "contactForm" ? optionalStringField("emailLabel", record.values.emailLabel) : {}),
    ...(type === "contactForm"
      ? optionalStringField("messageLabel", record.values.messageLabel)
      : {}),
    ...optionalStringField(
      "href",
      linkProjection === null ? record.values.href : linkProjection.href,
    ),
    ...optionalStringField("date", record.values.date),
    ...optionalStringField(
      "icon",
      linkProjection === null ? record.values.icon : linkProjection.icon,
    ),
    ...optionalStringField("color", record.values.color),
    ...optionalStringField("alignment", record.values.alignment),
    ...(mediaProjection ? { media: mediaProjection } : {}),
    ...optionalNumberField("width", record.values.width),
    ...optionalNumberField("height", record.values.height),
    ...(publicOperationProjection ? { publicOperation: publicOperationProjection } : {}),
    placements: [],
  };
}

function projectedPublicOperationFields(
  record: StoredRecord,
  type: string,
  context: SiteTreeBuildContext,
): SitePublicOperationNode | undefined {
  if (type === "publicOperationForm") {
    return projectedGenericPublicOperationFields(record, context);
  }

  if (type !== "subscribeForm" && type !== "contactForm") {
    return undefined;
  }

  const operationName = stringValue(record.values.operationName);
  const formLabel = type === "contactForm" ? "Contact form" : "Subscribe form";

  if (!operationName) {
    context.warnings.push({
      code: "missing-public-operation",
      recordId: record.id,
      message: `${formLabel} block "${record.id}" does not declare an operation name.`,
    });
    return undefined;
  }

  const operation =
    type === "contactForm"
      ? selectPublicContactOperation(context.schema, operationName)
      : selectPublicSubscribeOperation(context.schema, operationName);

  if (operation.kind !== "available") {
    context.warnings.push({
      code: operation.code,
      recordId: record.id,
      message: operation.message,
    });
    return undefined;
  }

  if (context.turnstileSiteKey === undefined) {
    context.warnings.push({
      code: "missing-public-operation-challenge-config",
      recordId: record.id,
      message: `${formLabel} operation "${operationName}" requires Turnstile site key configuration.`,
    });
    return undefined;
  }

  return {
    entityName: operation.entityName,
    operationName,
    canonicalKey: operation.canonicalKey,
    route: `${context.publicOperationApiRoutePrefix}/public/operations/${encodeURIComponent(
      operation.entityName,
    )}/${encodeURIComponent(operationName)}`,
    challenge: {
      kind: "turnstile",
      siteKey: context.turnstileSiteKey,
    },
  };
}

function projectedGenericPublicOperationFields(
  record: StoredRecord,
  context: SiteTreeBuildContext,
): SitePublicOperationNode | undefined {
  const operationKey = stringValue(record.values.operationKey);
  const formLabel = "Public operation form";

  if (!operationKey) {
    context.warnings.push({
      code: "missing-public-operation",
      recordId: record.id,
      message: `${formLabel} block "${record.id}" does not declare an operation key.`,
    });
    return undefined;
  }

  const target = selectPublicOperationFormTarget(record, context);

  if (!target) {
    return undefined;
  }

  const operation = selectGenericPublicOperation(target.schema, operationKey);

  if (operation.kind !== "available") {
    context.warnings.push({
      code: operation.code,
      recordId: record.id,
      message: operation.message,
    });
    return undefined;
  }

  if (context.turnstileSiteKey === undefined) {
    context.warnings.push({
      code: "missing-public-operation-challenge-config",
      recordId: record.id,
      message: `${formLabel} operation "${operationKey}" requires Turnstile site key configuration.`,
    });
    return undefined;
  }

  const fields = projectPublicOperationInputFields({
    entityName: operation.entityName,
    operation: operation.operation,
    recordId: record.id,
    schema: target.schema,
    warnings: context.warnings,
  });

  if (!fields) {
    return undefined;
  }

  return {
    entityName: operation.entityName,
    operationName: operation.operationName,
    canonicalKey: operation.canonicalKey,
    target: target.route,
    route: `${target.route.apiRoutePrefix}/public/operations/${encodeURIComponent(
      operation.entityName,
    )}/${encodeURIComponent(operation.operationName)}`,
    challenge: {
      kind: "turnstile",
      siteKey: context.turnstileSiteKey,
    },
    fields,
  };
}

function selectPublicOperationFormTarget(
  record: StoredRecord,
  context: SiteTreeBuildContext,
): SitePublicOperationTargetResolution | undefined {
  const targetKind = stringValue(record.values.operationTargetKind);

  if (targetKind === "schemaKey") {
    const schemaKey = stringValue(record.values.operationTargetSchemaKey);

    if (!schemaKey) {
      context.warnings.push({
        code: "missing-public-operation-target",
        recordId: record.id,
        message: `Public operation form block "${record.id}" does not declare a target schema key.`,
      });
      return undefined;
    }

    return resolvePublicOperationFormTarget(record, context, {
      kind: "schemaKey",
      schemaKey,
    });
  }

  if (targetKind === "appInstall") {
    const packageAppKey = stringValue(record.values.operationTargetPackageAppKey);
    const installId = stringValue(record.values.operationTargetInstallId);

    if (!packageAppKey || !installId) {
      context.warnings.push({
        code: "missing-public-operation-target",
        recordId: record.id,
        message: `Public operation form block "${record.id}" does not declare an installed app target.`,
      });
      return undefined;
    }

    return resolvePublicOperationFormTarget(record, context, {
      kind: "appInstall",
      packageAppKey,
      installId,
    });
  }

  context.warnings.push({
    code: "missing-public-operation-target",
    recordId: record.id,
    message: `Public operation form block "${record.id}" does not declare a supported target route kind.`,
  });
  return undefined;
}

function resolvePublicOperationFormTarget(
  record: StoredRecord,
  context: SiteTreeBuildContext,
  request: SitePublicOperationTargetRequest,
): SitePublicOperationTargetResolution | undefined {
  const target = context.publicOperationTargetResolver?.(request);

  if (!target) {
    context.warnings.push({
      code: "invalid-public-operation-target",
      recordId: record.id,
      message:
        request.kind === "schemaKey"
          ? `Public operation form target schema key "${request.schemaKey}" is unavailable.`
          : `Public operation form target install "${request.packageAppKey}/${request.installId}" is unavailable.`,
    });
    return undefined;
  }

  return target;
}

function selectGenericPublicOperation(
  schema: AppSchema,
  operationKey: string,
):
  | {
      kind: "available";
      entityName: string;
      operationName: string;
      canonicalKey: string;
      operation: EntityOperationSchema;
    }
  | { kind: "unavailable"; code: string; message: string } {
  const operation = selectAnonymousPublicOperationByKey(schema, operationKey);

  if (operation.kind !== "available") {
    return {
      kind: "unavailable",
      code:
        operation.reason === "missing-operation"
          ? "missing-public-operation"
          : "invalid-public-operation",
      message: operation.message,
    };
  }

  return {
    kind: "available",
    entityName: operation.entityName,
    operationName: operation.operationName,
    canonicalKey: operation.canonicalKey,
    operation: operation.operation,
  };
}

function projectPublicOperationInputFields(input: {
  entityName: string;
  operation: EntityOperationSchema;
  recordId: string;
  schema: AppSchema;
  warnings: SiteTreeWarning[];
}): SitePublicOperationInputFieldNode[] | undefined {
  const entity = input.schema.entities[input.entityName];

  if (!entity) {
    return undefined;
  }

  const projection = projectPublicSafeOperationInputFields({
    entity,
    operation: input.operation,
  });

  for (const inputName of projection.unsupportedRequiredFields) {
    input.warnings.push({
      code: "unsupported-public-operation-input",
      recordId: input.recordId,
      message: `Public operation form block "${input.recordId}" cannot render required input field "${inputName}".`,
    });
  }

  if (projection.unsupportedRequiredFields.length > 0) {
    return undefined;
  }

  return projection.fields;
}

function selectPublicContactOperation(
  schema: AppSchema,
  operationName: string,
):
  | { kind: "available"; entityName: string; canonicalKey: string }
  | { kind: "unavailable"; code: string; message: string } {
  const candidates = operationCandidates(schema, operationName);

  if (candidates.length === 0) {
    return {
      kind: "unavailable",
      code: "missing-public-operation",
      message: `Contact form operation "${operationName}" does not exist.`,
    };
  }

  const publicContactOperations = candidates.flatMap(({ entityName }) => {
    if (entityName !== "contact-message") {
      return [];
    }

    const operation = selectAnonymousPublicOperation(schema, { entityName, operationName });

    return operation.kind === "available" ? [operation] : [];
  });

  if (publicContactOperations.length !== 1) {
    return {
      kind: "unavailable",
      code: "invalid-public-operation",
      message: `Contact form operation "${operationName}" is not publicly executable.`,
    };
  }

  const publicOperation = publicContactOperations[0];

  if (!publicOperation) {
    throw new Error("Public contact operation selection was empty after validation.");
  }

  return {
    kind: "available",
    entityName: publicOperation.entityName,
    canonicalKey: publicOperation.canonicalKey,
  };
}

function selectPublicSubscribeOperation(
  schema: AppSchema,
  operationName: string,
):
  | { kind: "available"; entityName: string; canonicalKey: string }
  | { kind: "unavailable"; code: string; message: string } {
  const candidates = operationCandidates(schema, operationName);

  if (candidates.length === 0) {
    return {
      kind: "unavailable",
      code: "missing-public-operation",
      message: `Subscribe form operation "${operationName}" does not exist.`,
    };
  }

  const publicSubscribeOperations = candidates.flatMap(({ entityName }) => {
    const operation = selectAnonymousPublicOperation(schema, { entityName, operationName });

    return operation.kind === "available" &&
      operation.operation.kind === "command" &&
      isOperationHandlerEffectForKind(operation.operation.effect, "subscribe")
      ? [operation]
      : [];
  });

  if (publicSubscribeOperations.length !== 1) {
    return {
      kind: "unavailable",
      code: "invalid-public-operation",
      message: `Subscribe form operation "${operationName}" is not publicly executable.`,
    };
  }

  const publicOperation = publicSubscribeOperations[0];

  if (!publicOperation) {
    throw new Error("Public subscribe operation selection was empty after validation.");
  }

  return {
    kind: "available",
    entityName: publicOperation.entityName,
    canonicalKey: publicOperation.canonicalKey,
  };
}

function operationCandidates(
  schema: AppSchema,
  operationName: string,
): Array<{ entityName: string; operation: EntityOperationSchema }> {
  return Object.entries(schema.entities)
    .map(([entityName, entity]) => {
      const operation = entity.operations?.[operationName];

      return operation ? { entityName, operation } : undefined;
    })
    .filter(
      (candidate): candidate is { entityName: string; operation: EntityOperationSchema } =>
        candidate !== undefined,
    );
}

function projectedMediaFields(
  record: StoredRecord,
  type: string,
  context: SiteTreeBuildContext,
): SiteMediaNode | undefined {
  if (type !== "image") {
    return undefined;
  }

  const assetId = stringValue(record.values.mediaAssetId);

  if (!assetId) {
    return undefined;
  }

  const media = coreImageMediaDeliveryFactsForAssetId(assetId);

  if (media) {
    return {
      assetId: media.assetId,
      href: media.href,
      kind: media.kind,
    };
  }

  context.warnings.push({
    code: "invalid-media-asset-id",
    recordId: record.id,
    message: `Skipped invalid media asset id "${assetId}" on image block "${record.id}".`,
  });

  return undefined;
}

function projectedLinkFields(
  record: StoredRecord,
  type: string,
  context: SiteTreeBuildContext,
): { href?: string; icon?: string } | null {
  if (type !== "link") {
    return null;
  }

  const resolution = resolveSiteLinkHref(record, context.indexes.blocks);
  context.warnings.push(...resolution.warnings);

  return {
    ...optionalStringField("href", resolution.href),
    ...optionalStringField("icon", resolution.icon),
  };
}

function projectPlacement(placement: StoredRecord, childBlock: SiteBlockNode): SitePlacementNode {
  return {
    id: placement.id,
    order: numberValue(placement.values.order) ?? 0,
    ...optionalStringField("label", placement.values.label),
    ...optionalStringField("slot", placement.values.slot),
    block: childBlock,
  };
}

function buildContentListItems(
  itemType: (typeof LIST_BLOCK_ITEM_TYPES)[keyof typeof LIST_BLOCK_ITEM_TYPES],
  context: SiteTreeBuildContext,
): SiteBlockNode[] {
  return [...context.indexes.blocks.values()]
    .filter(
      (record) => stringValue(record.values.type) === itemType && isPublicRenderableBlock(record),
    )
    .sort(compareDatedContentRecords)
    .map((record) => buildContentListItemNode(record, context));
}

function listItemTypeForBlock(
  type: string,
): (typeof LIST_BLOCK_ITEM_TYPES)[keyof typeof LIST_BLOCK_ITEM_TYPES] | undefined {
  return LIST_BLOCK_ITEM_TYPES[type as keyof typeof LIST_BLOCK_ITEM_TYPES];
}

function buildContentListItemNode(
  record: StoredRecord,
  context: SiteTreeBuildContext,
): SiteBlockNode {
  const node = projectBlock(record, context);
  const ancestors = new Set([record.id]);

  node.placements = buildPlacementNodes(
    record.id,
    context,
    0,
    ancestors,
    (placement) => stringValue(placement.values.slot) === PRIMARY_IMAGE_SLOT,
  ).filter((placement) => placement.block.type === "image");

  return node;
}

function isPublicRenderableBlock(record: StoredRecord): boolean {
  const type = stringValue(record.values.type);

  return type === "post" || type === "project"
    ? stringValue(record.values.date) !== undefined
    : true;
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

function compareDatedContentRecords(a: StoredRecord, b: StoredRecord): number {
  const dateCompare = compareStrings(
    stringValue(b.values.date) ?? "",
    stringValue(a.values.date) ?? "",
  );

  return dateCompare || compareRecords(a, b);
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
