import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import type {
  SitePublicSystemStateRendererComponent,
  SitePublicSystemStateRendererProps,
} from "@dpeek/formless-site-app";
import { AstryxPublicSiteProvider } from "../site-provider.tsx";

export const AstryxSitePublicSystemStateRenderer: SitePublicSystemStateRendererComponent = (
  props,
) => (
  <AstryxPublicSiteProvider mode="light">
    <Layout
      contentWidth={640}
      height="auto"
      padding={6}
      content={
        <LayoutContent role="main">
          <AstryxSitePublicSystemState {...props} />
        </LayoutContent>
      }
    />
  </AstryxPublicSiteProvider>
);

function AstryxSitePublicSystemState(props: SitePublicSystemStateRendererProps) {
  switch (props.kind) {
    case "loading":
      return (
        <section aria-busy="true" data-site-system-state="loading">
          <EmptyState
            headingLevel={1}
            icon={<Icon icon="clock" size="lg" />}
            title="Loading site page..."
            description={`Loading ${props.slug}.`}
          />
        </section>
      );
    case "not-found":
      return (
        <section data-site-system-state="not-found">
          <EmptyState
            headingLevel={1}
            icon={<Icon icon="search" size="lg" />}
            title="Page not found"
            description={`No site page exists for ${props.slug}.`}
            actions={
              <Link href={props.homeHref} hasUnderline isStandalone>
                Home
              </Link>
            }
          />
        </section>
      );
    case "failure":
      return (
        <section data-site-system-state="failure" role="alert">
          <EmptyState
            headingLevel={1}
            icon={<Icon icon="error" size="lg" />}
            title="Site page failed to load"
            description={`${props.slug}: ${props.message}`}
          />
        </section>
      );
  }
}
