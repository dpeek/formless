import type { SitePublicSystemStateRendererProps } from "../public-system-state.ts";

export function LegacySitePublicSystemStateRenderer(props: SitePublicSystemStateRendererProps) {
  switch (props.kind) {
    case "loading":
      return (
        <section className="mx-auto max-w-3xl px-6 py-10">
          <h1 className="text-2xl font-semibold">Loading site page...</h1>
          <p className="mt-2 text-sm text-slate-600">Loading {props.slug}.</p>
        </section>
      );
    case "not-found":
      return (
        <section className="mx-auto max-w-3xl px-6 py-10">
          <h1 className="text-2xl font-semibold">Page not found</h1>
          <p className="mt-2 text-sm text-slate-600">
            No site page exists for <code>{props.slug}</code>.
          </p>
          <a className="mt-4 inline-flex text-sm font-medium underline" href={props.homeHref}>
            Home
          </a>
        </section>
      );
    case "failure":
      return (
        <section className="mx-auto max-w-3xl px-6 py-10">
          <h1 className="text-2xl font-semibold">Site page failed to load</h1>
          <p className="mt-2 text-sm text-slate-600">
            {props.slug}: {props.message}
          </p>
        </section>
      );
  }
}
