import { useEffect, useState } from "react";
import { SitePageRenderer } from "../site-renderer/renderer.tsx";
import { sitePagePathForSlug, type SitePageLinkMode } from "../site-renderer/links.ts";
import type { SitePageTree, SitePageTreeResponse } from "../../shared/protocol.ts";

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
    const controller = new AbortController();

    setState({ status: "loading", slug: normalizedSlug });

    void fetchSitePageTree(normalizedSlug, { signal: controller.signal })
      .then((tree) => {
        if (!controller.signal.aborted) {
          setState({ status: "ready", tree });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof SitePageNotFoundError) {
          setState({ status: "not-found", slug: normalizedSlug });
          return;
        }

        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Site page failed to load.",
          slug: normalizedSlug,
        });
      });

    return () => {
      controller.abort();
    };
  }, [normalizedSlug]);

  return <SitePageRouteView linkMode={linkMode} state={state} />;
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

export function normalizeSitePageSlug(slug: string | undefined): string {
  const trimmed = (slug ?? "").replace(/^\/+/, "").trim();

  if (trimmed === "") {
    return "home";
  }

  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

class SitePageNotFoundError extends Error {
  constructor(slug: string) {
    super(`No published site page found for "${slug}".`);
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
        No published site page exists for <code>{slug}</code>.
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
