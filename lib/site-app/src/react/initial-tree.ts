import type { SitePageTree } from "../types.ts";
import { normalizeSitePageSlug } from "./slug.ts";

export const INITIAL_SITE_PAGE_TREE_SCRIPT_ID = "formless-site-page-tree";
const INITIAL_SITE_PAGE_TREE_KIND = "formless.sitePageTree";
const INITIAL_SITE_PAGE_TREE_VERSION = 1;

type InitialSitePageTreePayload = {
  kind: typeof INITIAL_SITE_PAGE_TREE_KIND;
  version: typeof INITIAL_SITE_PAGE_TREE_VERSION;
  tree: SitePageTree;
};

type InitialSitePageTreeDocument = {
  getElementById(id: string): { textContent: string | null } | null;
};

export function renderInitialSitePageTreeScript(tree: SitePageTree): string {
  return [
    `<script id="${INITIAL_SITE_PAGE_TREE_SCRIPT_ID}" type="application/json">`,
    serializeInitialSitePageTree(tree),
    "</script>",
  ].join("");
}

export function readInitialSitePageTree(
  slug: string,
  doc: InitialSitePageTreeDocument | undefined = browserDocument(),
): SitePageTree | undefined {
  const element = doc?.getElementById(INITIAL_SITE_PAGE_TREE_SCRIPT_ID);
  const text = element?.textContent;

  if (!text) {
    return undefined;
  }

  try {
    const payload = JSON.parse(text) as unknown;
    const tree = initialSitePageTreeFromPayload(payload);

    return tree && normalizeSitePageSlug(tree.meta.slug) === normalizeSitePageSlug(slug)
      ? tree
      : undefined;
  } catch {
    return undefined;
  }
}

function serializeInitialSitePageTree(tree: SitePageTree): string {
  return escapeJsonForScript(
    JSON.stringify({
      kind: INITIAL_SITE_PAGE_TREE_KIND,
      version: INITIAL_SITE_PAGE_TREE_VERSION,
      tree,
    } satisfies InitialSitePageTreePayload),
  );
}

function initialSitePageTreeFromPayload(payload: unknown): SitePageTree | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  if (
    payload.kind !== INITIAL_SITE_PAGE_TREE_KIND ||
    payload.version !== INITIAL_SITE_PAGE_TREE_VERSION ||
    !isRecord(payload.tree)
  ) {
    return undefined;
  }

  const tree = payload.tree;

  if (!isRecord(tree.meta) || typeof tree.meta.slug !== "string") {
    return undefined;
  }

  return tree as SitePageTree;
}

function escapeJsonForScript(json: string): string {
  return json.replace(/[<>&\u2028\u2029]/g, (character) => {
    switch (character) {
      case "<":
        return "\\u003C";
      case ">":
        return "\\u003E";
      case "&":
        return "\\u0026";
      case "\u2028":
        return "\\u2028";
      case "\u2029":
        return "\\u2029";
      default:
        return character;
    }
  });
}

function browserDocument(): InitialSitePageTreeDocument | undefined {
  return typeof document === "undefined" ? undefined : document;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
