import { useEffect, useMemo, useState } from "react";
import { SitePageRenderer } from "../site-renderer/renderer.tsx";
import { sitePagePathForSlug, type SitePageLinkMode } from "../site-renderer/links.ts";
import { readInitialSitePageTree } from "../site-renderer/initial-tree.ts";
import { listenForClientEvents } from "../../client/broadcast.ts";
import { startPushSync } from "../../client/sync.ts";
import {
  appStorageIdentityForClientTarget,
  type ClientAppTarget,
} from "../../client/app-target.ts";
import type { SitePageTree, SitePageTreeResponse } from "../../shared/protocol.ts";
import { normalizeSitePageSlug } from "./site-page-slug.ts";

export { normalizeSitePageSlug } from "./site-page-slug.ts";

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
  fetcher?: typeof fetch;
  initialTree?: SitePageTree;
  linkMode: SitePageLinkMode;
  listenForPreviewChanges?: (onChanged: () => void) => () => void;
  onState: (state: SitePageRouteState) => void;
  slug: string;
  startPreviewSync?: (onSynced: () => void) => () => void;
  target?: ClientAppTarget;
};

export function SitePageRoute({
  linkMode = "preview",
  slug,
  target = "site",
}: {
  linkMode?: SitePageLinkMode;
  slug: string;
  target?: ClientAppTarget;
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
      initialTree,
      linkMode,
      onState: setState,
      slug: normalizedSlug,
      target,
    });
  }, [linkMode, normalizedSlug, target]);

  return <SitePageRouteView linkMode={linkMode} state={state} />;
}

export function startSitePageRouteSession({
  fetcher,
  initialTree,
  linkMode,
  listenForPreviewChanges,
  onState,
  slug,
  startPreviewSync,
  target = "site",
}: SitePageRouteSessionOptions) {
  const normalizedSlug = normalizeSitePageSlug(slug);
  const listenForPreviewChangesForTarget =
    listenForPreviewChanges ?? ((onChanged) => listenForSitePreviewChanges(target, onChanged));
  const startPreviewSyncForTarget =
    startPreviewSync ?? ((onSynced) => startSitePreviewSync(target, onSynced));
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

    void fetchSitePageTree(normalizedSlug, { fetcher, signal: controller.signal, target })
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
    stopPreviewSync = startPreviewSyncForTarget(refetchActiveTree);
    stopPreviewChanges = listenForPreviewChangesForTarget(refetchActiveTree);
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
  return linkMode === "preview" || linkMode === "authoring";
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

function startSitePreviewSync(target: ClientAppTarget, onSynced: () => void) {
  return startPushSync(target, { onSynced });
}

function listenForSitePreviewChanges(target: ClientAppTarget, onChanged: () => void) {
  return listenForClientEvents(target, (event) => {
    if (event.type === "records-updated" || event.type === "schema-updated") {
      onChanged();
    }
  });
}

export function SitePageRouteView({
  linkMode = "preview",
  state,
}: {
  linkMode?: SitePageLinkMode;
  state: SitePageRouteState;
}) {
  switch (state.status) {
    case "ready":
      return <SitePageRenderer linkMode={linkMode} tree={state.tree} />;
    case "not-found":
      return <SitePageNotFound linkMode={linkMode} slug={state.slug} />;
    case "error":
      return <SitePageError message={state.message} slug={state.slug} />;
    case "loading":
      return <SitePageLoading slug={state.slug} />;
  }
}

export async function fetchSitePageTree(
  slug: string,
  options: { fetcher?: typeof fetch; signal?: AbortSignal; target?: ClientAppTarget } = {},
): Promise<SitePageTree> {
  const fetcher = options.fetcher ?? fetch;
  const identity = appStorageIdentityForClientTarget(options.target ?? "site");
  const response = await fetcher(`${identity.apiRoutePrefix}/tree/${encodeURIComponent(slug)}`, {
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

function SitePageNotFound({ linkMode, slug }: { linkMode: SitePageLinkMode; slug: string }) {
  return (
    <section className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">
        No site page exists for <code>{slug}</code>.
      </p>
      <a
        className="mt-4 inline-flex text-sm font-medium underline"
        href={sitePagePathForSlug("home", linkMode)}
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
