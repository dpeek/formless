import { useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout, LayoutContent, LayoutFooter, LayoutHeader } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { MobileNav } from "@astryxdesign/core/MobileNav";
import { SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { Heading, Text } from "@astryxdesign/core/Text";
import {
  TopNav,
  TopNavHeading,
  TopNavItem,
  type TopNavHeadingProps,
  type TopNavProps,
} from "@astryxdesign/core/TopNav";
import { VStack } from "@astryxdesign/core/VStack";
import { FormlessThemeToggle } from "./theme.tsx";
import { Github, Linkedin, X } from "@thesvg/react";
import { CubeIcon } from "@heroicons/react/24/outline";
import { Markdown } from "@astryxdesign/core/Markdown";
import { NavIcon } from "@astryxdesign/core/NavIcon";

const primaryNavItems = [
  { label: "Product", href: "#public-site" },
  { label: "Guides", href: "#public-site" },
  { label: "Docs", href: "#public-site" },
];

const secondaryNavItems = [
  { label: "Blog", href: "#public-site" },
  { label: "Contact", href: "#public-site" },
];

const footerNavItems = [
  { label: "Product", href: "#public-site" },
  { label: "Docs", href: "#public-site" },
  { label: "Blog", href: "#public-site" },
  { label: "Contact", href: "#public-site" },
];

const socialLinks = [
  { label: "GitHub", href: "https://github.com/dpeek", icon: Github },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/dpeek/", icon: Linkedin },
  { label: "X", href: "https://x.com/dpeek", icon: X },
];

const featureCards = [
  {
    title: "Schema as Data",
    description:
      "Entities, fields, relationships, views, screens, and actions stay runtime-readable.",
  },
  {
    title: "Flat Records",
    description:
      "Stored data remains flat. Composition happens in query, projection, view, and action layers.",
  },
  {
    title: "Generated Surfaces",
    description: "Public pages and product workspaces can share the same runtime primitives.",
  },
];

export function FormlessSiteLayout() {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 768px)");

  return (
    <FormlessSiteShell
      header={
        <LayoutHeader hasDivider>
          <TopNav
            xstyle={siteTopNavXstyle}
            heading={
              <TopNavHeading
                xstyle={siteTopNavHeadingXstyle}
                heading="Formless"
                headingHref="#public-site"
                logo={<NavIcon icon={<Icon icon={CubeIcon} color="inherit" />} />}
              />
            }
            centerContent={!isMobile ? <FormlessSitePrimaryNav /> : null}
            endContent={
              <FormlessSiteHeaderActions
                isMobile={isMobile}
                onOpenMobileNav={() => setIsMobileNavOpen(true)}
              />
            }
          />
        </LayoutHeader>
      }
      content={
        <LayoutContent role="main">
          <FormlessSitePlaceholderContent />
        </LayoutContent>
      }
      footer={
        <LayoutFooter>
          <FormlessSiteFooter />
        </LayoutFooter>
      }
      mobileNav={
        <MobileNav
          isOpen={isMobileNavOpen}
          onOpenChange={setIsMobileNavOpen}
          header="Formless"
          label="Public site navigation"
        >
          <FormlessSiteMobileNav onNavigate={() => setIsMobileNavOpen(false)} />
        </MobileNav>
      }
    />
  );
}

const styles = stylex.create({
  siteShell: {
    minHeight: "100vh",
    backgroundColor: colorVars["--color-background-body"],
    color: colorVars["--color-text-primary"],
  },
  siteTopNav: {
    paddingInlineStart: 0,
    paddingInlineEnd: 0,
  },
  siteTopNavHeading: {
    paddingInlineStart: 0,
  },
  mainContent: {
    paddingBlockStart: spacingVars["--spacing-12"],
    paddingBlockEnd: spacingVars["--spacing-12"],
  },
});

// Astryx core and this package can resolve different StyleX type brands.
// The runtime style objects are compatible; keep the cast at the boundary.
const siteTopNavXstyle = styles.siteTopNav as unknown as NonNullable<TopNavProps["xstyle"]>;
const siteTopNavHeadingXstyle = styles.siteTopNavHeading as unknown as NonNullable<
  TopNavHeadingProps["xstyle"]
>;

type FormlessSiteShellProps = {
  content: ReactNode;
  footer: ReactNode;
  header: ReactNode;
  mobileNav?: ReactNode;
};

export function FormlessSiteShell({ content, footer, header, mobileNav }: FormlessSiteShellProps) {
  const shellStyles = stylex.props(styles.siteShell);

  return (
    <>
      <Layout
        {...shellStyles}
        height="auto"
        padding={6}
        contentWidth={960}
        header={header}
        content={content}
        footer={footer}
      />
      {mobileNav}
    </>
  );
}

type FormlessSiteHeaderActionsProps = {
  isMobile: boolean;
  onOpenMobileNav: () => void;
};

function FormlessSiteHeaderActions({ isMobile, onOpenMobileNav }: FormlessSiteHeaderActionsProps) {
  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      <FormlessThemeToggle />
      {isMobile ? (
        <IconButton
          label="Open navigation"
          tooltip="Open navigation"
          variant="ghost"
          icon={<Icon icon="menu" color="inherit" />}
          onClick={onOpenMobileNav}
        />
      ) : null}
    </HStack>
  );
}

function FormlessSitePrimaryNav() {
  return (
    <>
      {primaryNavItems.map((item) => (
        <TopNavItem key={item.label} {...item} />
      ))}
    </>
  );
}

type FormlessSiteMobileNavProps = {
  onNavigate: () => void;
};

function FormlessSiteMobileNav({ onNavigate }: FormlessSiteMobileNavProps) {
  return (
    <SideNavSection title="Pages">
      {[...primaryNavItems, ...secondaryNavItems].map((item) => (
        <SideNavItem key={item.label} {...item} onClick={onNavigate} />
      ))}
    </SideNavSection>
  );
}

const markdown = `# Formless

Formless is a schema-driven software platform that enables developers to build and maintain complex applications without having to rebuild the runtime. It provides a flexible and extensible framework for defining data models, relationships, and business logic, allowing developers to focus on building features rather than infrastructure.

## Features

- Schema as Data: Entities, fields, relationships, views, screens, and actions stay runtime-readable.
- Flat Records: Stored data remains flat. Composition happens in query, projection, view, and action layers.
- Generated Surfaces: Public pages and product workspaces can share the same runtime primitives.`;

function FormlessSitePlaceholderContent() {
  return (
    <VStack gap={8} {...stylex.props(styles.mainContent)}>
      <VStack gap={4}>
        <Heading level={1}>Build schema-shaped software without rebuilding the runtime.</Heading>
        <Text type="large" as="p" color="secondary">
          Public site placeholder for exploring how Formless marketing, docs, and product pages feel
          on Astryx defaults.
        </Text>
      </VStack>
      <Grid columns={{ minWidth: 240, max: 3 }} gap={5} width="100%">
        {featureCards.map((card) => (
          <Card key={card.title}>
            <VStack gap={2}>
              <Heading level={2}>{card.title}</Heading>
              <Text type="body" as="p" color="secondary">
                {card.description}
              </Text>
            </VStack>
          </Card>
        ))}
      </Grid>
      <Markdown headingLevelStart={2} contentWidth="100%">
        {markdown}
      </Markdown>
    </VStack>
  );
}

function FormlessSiteFooter() {
  return (
    <VStack gap={8}>
      <HStack gap={10} hAlign="start">
        <VStack gap={2}>
          {footerNavItems.map((item) => (
            <Link key={item.label} href={item.href} isStandalone>
              {item.label}
            </Link>
          ))}
        </VStack>
        <VStack gap={2}>
          {socialLinks.map((item) => (
            <Link key={item.label} href={item.href} isStandalone>
              {item.label}
            </Link>
          ))}
        </VStack>
      </HStack>
      <Text type="supporting" as="p">
        Formless public site prototype.
      </Text>
    </VStack>
  );
}
