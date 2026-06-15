import { useEffect, useMemo, useState } from "react";
import { SitePageRenderer } from "./renderer.tsx";
import { sitePagePathForSlug, type SitePageLinkMode } from "./links.ts";
import { readInitialSitePageTree } from "./initial-tree.ts";
import type { SitePageTree, SitePageTreeResponse } from "../types.ts";
import { normalizeSitePageSlug } from "./slug.ts";

export { normalizeSitePageSlug } from "./slug.ts";

const DEFAULT_SITE_API_ROUTE_PREFIX = "/api/site";

export type SitePageRouteState =
  | {
      status: "loading";
      slug: string;
    }
  | {
      status: "ready";
      tree: SitePageTree;
    }
  | {
      status: "not-found";
      slug: string;
    }
  | {
      status: "error";
      message: string;
      slug: string;
    };

type SitePageRouteSessionOptions = {
  apiRoutePrefix?: `/${string}`;
  fetcher?: typeof fetch;
  initialTree?: SitePageTree;
  linkMode: SitePageLinkMode;
  listenForPreviewChanges?: (onChanged: () => void) => () => void;
  onState: (state: SitePageRouteState) => void;
  slug: string;
  startPreviewSync?: (onSynced: () => void) => () => void;
};

export function SitePageRoute({
  apiRoutePrefix = DEFAULT_SITE_API_ROUTE_PREFIX,
  linkMode = "preview",
  listenForPreviewChanges,
  routeBase,
  slug,
  startPreviewSync,
}: {
  apiRoutePrefix?: `/${string}`;
  linkMode?: SitePageLinkMode;
  listenForPreviewChanges?: (onChanged: () => void) => () => void;
  routeBase?: `/${string}`;
  slug: string;
  startPreviewSync?: (onSynced: () => void) => () => void;
}) {
  const normalizedSlug = normalizeSitePageSlug(slug);
  const initialTree = useMemo(
    () => (linkMode === "published" ? readInitialSitePageTree(normalizedSlug) : undefined),
    [linkMode, normalizedSlug],
  );
  const [state, setState] = useState<SitePageRouteState>(() =>
    sitePageRouteInitialState({ initialTree, linkMode, slug: normalizedSlug }),
  );

  useEffect(() => {
    return startSitePageRouteSession({
      apiRoutePrefix,
      initialTree,
      linkMode,
      listenForPreviewChanges,
      onState: setState,
      slug: normalizedSlug,
      startPreviewSync,
    });
  }, [
    apiRoutePrefix,
    initialTree,
    linkMode,
    listenForPreviewChanges,
    normalizedSlug,
    startPreviewSync,
  ]);

  return <SitePageRouteView linkMode={linkMode} routeBase={routeBase} state={state} />;
}

export function startSitePageRouteSession({
  apiRoutePrefix = DEFAULT_SITE_API_ROUTE_PREFIX,
  fetcher,
  initialTree,
  linkMode,
  listenForPreviewChanges,
  onState,
  slug,
  startPreviewSync,
}: SitePageRouteSessionOptions) {
  const normalizedSlug = normalizeSitePageSlug(slug);
  let stopped = false;
  let activeController: AbortController | undefined;
  let stopPreviewChanges = () => {};
  let stopPreviewSync = () => {};

  function loadTree(showLoading: boolean) {
    activeController?.abort();

    const controller = new AbortController();
    activeController = controller;

    if (showLoading) {
      onState({ status: "loading", slug: normalizedSlug });
    }

    void fetchSitePageTree(normalizedSlug, {
      apiRoutePrefix,
      fetcher,
      signal: controller.signal,
    })
      .then((tree) => {
        if (!stopped && activeController === controller && !controller.signal.aborted) {
          onState({ status: "ready", tree });
        }
      })
      .catch((error: unknown) => {
        if (stopped || activeController !== controller || controller.signal.aborted) {
          return;
        }

        if (error instanceof SitePageNotFoundError) {
          onState({ status: "not-found", slug: normalizedSlug });
          return;
        }

        onState({
          status: "error",
          message: error instanceof Error ? error.message : "Site page failed to load.",
          slug: normalizedSlug,
        });
      });
  }

  function refetchActiveTree() {
    loadTree(false);
  }

  if (usesPreviewSync(linkMode)) {
    loadTree(true);
    stopPreviewSync = startPreviewSync?.(refetchActiveTree) ?? (() => {});
    stopPreviewChanges = listenForPreviewChanges?.(refetchActiveTree) ?? (() => {});
  } else if (initialTreeMatchesSlug(initialTree, normalizedSlug)) {
    onState({ status: "ready", tree: initialTree });
  } else {
    loadTree(true);
  }

  return () => {
    stopped = true;
    activeController?.abort();
    stopPreviewChanges();
    stopPreviewSync();
  };
}

function usesPreviewSync(linkMode: SitePageLinkMode): boolean {
  return linkMode === "preview" || linkMode === "authoring" || linkMode === "installed";
}

function sitePageRouteInitialState({
  initialTree,
  linkMode,
  slug,
}: {
  initialTree: SitePageTree | undefined;
  linkMode: SitePageLinkMode;
  slug: string;
}): SitePageRouteState {
  if (linkMode === "published" && initialTreeMatchesSlug(initialTree, slug)) {
    return { status: "ready", tree: initialTree };
  }

  return { status: "loading", slug };
}

function initialTreeMatchesSlug(
  tree: SitePageTree | undefined,
  slug: string,
): tree is SitePageTree {
  return Boolean(tree && normalizeSitePageSlug(tree.meta.slug) === normalizeSitePageSlug(slug));
}

export function SitePageRouteView({
  linkMode = "preview",
  routeBase,
  state,
}: {
  linkMode?: SitePageLinkMode;
  routeBase?: `/${string}`;
  state: SitePageRouteState;
}) {
  switch (state.status) {
    case "ready":
      return <SitePageRenderer linkMode={linkMode} routeBase={routeBase} tree={state.tree} />;
    case "not-found":
      return <SitePageNotFound linkMode={linkMode} routeBase={routeBase} slug={state.slug} />;
    case "error":
      return <SitePageError message={state.message} slug={state.slug} />;
    case "loading":
      return <SitePageLoading slug={state.slug} />;
  }
}

export async function fetchSitePageTree(
  slug: string,
  options: {
    apiRoutePrefix?: `/${string}`;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<SitePageTree> {
  const fetcher = options.fetcher ?? fetch;
  const apiRoutePrefix = options.apiRoutePrefix ?? DEFAULT_SITE_API_ROUTE_PREFIX;
  const response = await fetcher(`${apiRoutePrefix}/tree/${encodeURIComponent(slug)}`, {
    headers: { Accept: "application/json" },
    signal: options.signal,
  });

  if (response.status === 404) {
    throw new SitePageNotFoundError(slug);
  }

  const body = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(
      errorMessage(body) ?? `Site page request failed with status ${response.status}.`,
    );
  }

  return body as SitePageTreeResponse;
}

class SitePageNotFoundError extends Error {
  constructor(slug: string) {
    super(`No site page found for "${slug}".`);
  }
}

function SitePageLoading({ slug }: { slug: string }) {
  return (
    <section className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Loading site page...</h1>
      <p className="mt-2 text-sm text-slate-600">Loading {slug}.</p>
    </section>
  );
}

function SitePageNotFound({
  linkMode,
  routeBase,
  slug,
}: {
  linkMode: SitePageLinkMode;
  routeBase?: `/${string}`;
  slug: string;
}) {
  return (
    <section className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">
        No site page exists for <code>{slug}</code>.
      </p>
      <a
        className="mt-4 inline-flex text-sm font-medium underline"
        href={sitePagePathForSlug("home", linkMode, routeBase)}
      >
        Home
      </a>
    </section>
  );
}

function SitePageError({ message, slug }: { message: string; slug: string }) {
  return (
    <section className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Site page failed to load</h1>
      <p className="mt-2 text-sm text-slate-600">
        {slug}: {message}
      </p>
    </section>
  );
}

function errorMessage(body: unknown): string | undefined {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }

  return undefined;
}
