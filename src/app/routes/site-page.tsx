import { useEffect, useState } from "react";
import { SitePageRenderer } from "../site-renderer/renderer.tsx";
import { sitePagePathForSlug, type SitePageLinkMode } from "../site-renderer/links.ts";
import { listenForClientEvents } from "../../client/broadcast.ts";
import { startPushSync } from "../../client/sync.ts";
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
  linkMode: SitePageLinkMode;
  listenForPreviewChanges?: (onChanged: () => void) => () => void;
  onState: (state: SitePageRouteState) => void;
  slug: string;
  startPreviewSync?: (onSynced: () => void) => () => void;
};

export function SitePageRoute({
  linkMode = "preview",
  slug,
}: {
  linkMode?: SitePageLinkMode;
  slug: string;
}) {
  const normalizedSlug = normalizeSitePageSlug(slug);
  const [state, setState] = useState<SitePageRouteState>({
    status: "loading",
    slug: normalizedSlug,
  });

  useEffect(() => {
    return startSitePageRouteSession({
      linkMode,
      onState: setState,
      slug: normalizedSlug,
    });
  }, [linkMode, normalizedSlug]);

  return <SitePageRouteView linkMode={linkMode} state={state} />;
}

export function startSitePageRouteSession({
  fetcher,
  linkMode,
  listenForPreviewChanges = listenForSitePreviewChanges,
  onState,
  slug,
  startPreviewSync = startSitePreviewSync,
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

    void fetchSitePageTree(normalizedSlug, { fetcher, signal: controller.signal })
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

  loadTree(true);

  if (linkMode === "preview") {
    stopPreviewSync = startPreviewSync(refetchActiveTree);
    stopPreviewChanges = listenForPreviewChanges(refetchActiveTree);
  }

  return () => {
    stopped = true;
    activeController?.abort();
    stopPreviewChanges();
    stopPreviewSync();
  };
}

function startSitePreviewSync(onSynced: () => void) {
  return startPushSync("site", { onSynced });
}

function listenForSitePreviewChanges(onChanged: () => void) {
  return listenForClientEvents("site", (event) => {
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
  options: { fetcher?: typeof fetch; signal?: AbortSignal } = {},
): Promise<SitePageTree> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`/api/site/tree/${encodeURIComponent(slug)}`, {
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
