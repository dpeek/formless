import type { FieldValue, SiteTreeWarning, StoredRecord } from "../shared/protocol.ts";

export const LINK_TARGET_MODE_FIELD = "linkTargetMode";
export const LINK_TARGET_BLOCK_FIELD = "linkTargetBlock";

const INTERNAL_LINK_TARGET_MODE = "internal";
const EXTERNAL_LINK_TARGET_MODE = "external";
const ROUTABLE_TARGET_TYPES = new Set(["page", "post", "project"]);

export type SiteLinkHrefResolution = {
  href?: string;
  icon?: string;
  warnings: SiteTreeWarning[];
};

export function resolveSiteLinkHref(
  link: StoredRecord,
  blocks: Map<string, StoredRecord>,
): SiteLinkHrefResolution {
  const targetMode = stringValue(link.values[LINK_TARGET_MODE_FIELD]);

  if (targetMode === INTERNAL_LINK_TARGET_MODE) {
    return resolveInternalLinkHref(link, blocks);
  }

  if (targetMode === EXTERNAL_LINK_TARGET_MODE) {
    return resolveExternalLinkHref(link);
  }

  return {
    href: stringValue(link.values.href),
    ...optionalStringField("icon", link.values.icon),
    warnings: [],
  };
}

function resolveInternalLinkHref(
  link: StoredRecord,
  blocks: Map<string, StoredRecord>,
): SiteLinkHrefResolution {
  const targetBlockId = stringValue(link.values[LINK_TARGET_BLOCK_FIELD]);

  if (!targetBlockId) {
    const rawTarget = String(link.values[LINK_TARGET_BLOCK_FIELD] ?? "");

    return {
      href: undefined,
      warnings: [missingLinkTargetWarning(link, rawTarget)],
    };
  }

  const target = blocks.get(targetBlockId);

  if (!target || target.entity !== "block" || target.deletedAt) {
    return {
      href: undefined,
      warnings: [missingLinkTargetWarning(link, targetBlockId)],
    };
  }

  const targetType = stringValue(target.values.type);
  const targetHref = stringValue(target.values.href);
  const icon = stringValue(link.values.icon) ?? stringValue(target.values.icon);

  if (!targetType || !ROUTABLE_TARGET_TYPES.has(targetType) || !targetHref) {
    return {
      href: undefined,
      warnings: [nonRoutableLinkTargetWarning(link, target)],
    };
  }

  return {
    href: targetHref,
    ...optionalStringField("icon", icon),
    warnings: [],
  };
}

function resolveExternalLinkHref(link: StoredRecord): SiteLinkHrefResolution {
  const href = stringValue(link.values.href);

  if (!href || !isValidExternalHref(href)) {
    return {
      href: undefined,
      warnings: [invalidExternalLinkWarning(link, href)],
    };
  }

  return {
    href,
    ...optionalStringField("icon", link.values.icon),
    warnings: [],
  };
}

function isValidExternalHref(href: string): boolean {
  if (!/^https?:\/\//i.test(href)) {
    return false;
  }

  try {
    const url = new URL(href);

    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "";
  } catch {
    return false;
  }
}

function missingLinkTargetWarning(link: StoredRecord, targetBlockId: string): SiteTreeWarning {
  return {
    code: "missing-link-target",
    recordId: link.id,
    message: `Link block "${link.id}" references missing target block "${targetBlockId}".`,
  };
}

function nonRoutableLinkTargetWarning(link: StoredRecord, target: StoredRecord): SiteTreeWarning {
  return {
    code: "non-routable-link-target",
    recordId: link.id,
    message: `Link block "${link.id}" targets non-routable block "${target.id}".`,
  };
}

function invalidExternalLinkWarning(link: StoredRecord, href: string | undefined): SiteTreeWarning {
  return {
    code: "invalid-external-link",
    recordId: link.id,
    message: `Link block "${link.id}" has invalid external href "${href ?? ""}".`,
  };
}

function stringValue(value: FieldValue | undefined): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function optionalStringField<Key extends string>(
  key: Key,
  value: FieldValue | undefined,
): Partial<Record<Key, string>> {
  const string = stringValue(value);

  return string === undefined ? {} : ({ [key]: string } as Partial<Record<Key, string>>);
}
