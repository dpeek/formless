import { useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import {
  borderVars,
  colorVars,
  fontWeightVars,
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { Card } from "@astryxdesign/core/Card";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout, LayoutContent, LayoutFooter, LayoutHeader } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { MobileNav } from "@astryxdesign/core/MobileNav";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector, type SelectorOptionData } from "@astryxdesign/core/Selector";
import { SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { createStaticSource, Typeahead, type SearchableItem } from "@astryxdesign/core/Typeahead";
import {
  TopNav,
  TopNavHeading,
  TopNavItem,
  type TopNavHeadingProps,
  type TopNavProps,
} from "@astryxdesign/core/TopNav";
import { VStack } from "@astryxdesign/core/VStack";
import { FormlessThemeToggle } from "./theme.tsx";
import { CubeIcon } from "@heroicons/react/24/outline";
import { Markdown } from "@astryxdesign/core/Markdown";
import { NavIcon } from "@astryxdesign/core/NavIcon";
import {
  publicSitePageFixture,
  type AstryxProjectedSiteBlockNode,
  type AstryxProjectedSitePageFixture,
  type AstryxProjectedSitePlacementNode,
  type AstryxProjectedSitePublicOperationInputFieldNode,
  type AstryxProjectedSiteRouteFacts,
  type AstryxProjectedSiteTreeWarning,
  type AstryxPublicFormPrototypeState,
} from "../fixtures/public-site-page.ts";
import type {
  AstryxFieldEditorData,
  AstryxFieldIntentHandlers,
  AstryxFieldOption,
  AstryxFieldValue,
} from "../field-contract.ts";
import { SourceIcon } from "./field-primitives.tsx";

export function FormlessSiteLayout() {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const fixture = publicSitePageFixture;
  const siteLabel = fixture.tree.site?.label ?? fixture.tree.page.label;
  const headerLinks = projectedFrameLinks(fixture.tree.frame.header, fixture.routeFacts);

  return (
    <FormlessSiteShell
      header={
        <LayoutHeader hasDivider>
          <TopNav
            xstyle={siteTopNavXstyle}
            heading={
              <TopNavHeading
                xstyle={siteTopNavHeadingXstyle}
                heading={siteLabel}
                headingHref="#public-site"
                logo={
                  <NavIcon
                    icon={
                      <SourceIcon
                        source={fixture.tree.site?.icon}
                        fallbackIcon={CubeIcon}
                        color="inherit"
                        aria-hidden
                      />
                    }
                  />
                }
              />
            }
            centerContent={!isMobile ? <FormlessSitePrimaryNav items={headerLinks} /> : null}
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
          <FormlessPublicSiteRouteEntrypoint fixture={fixture} />
        </LayoutContent>
      }
      footer={
        <LayoutFooter>
          <FormlessSiteFooter fixture={fixture} />
        </LayoutFooter>
      }
      mobileNav={
        <MobileNav
          isOpen={isMobileNavOpen}
          onOpenChange={setIsMobileNavOpen}
          header={siteLabel}
          label="Public site navigation"
        >
          <FormlessSiteMobileNav items={headerLinks} onNavigate={() => setIsMobileNavOpen(false)} />
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
  pageHero: {
    paddingBlockEnd: spacingVars["--spacing-4"],
  },
  siteIdentity: {
    alignSelf: "flex-start",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: spacingVars["--spacing-10"],
    height: spacingVars["--spacing-10"],
    color: colorVars["--color-icon-primary"],
  },
  blockStack: {
    width: "100%",
  },
  sectionBlock: {
    borderTopWidth: borderVars["--border-width"],
    borderTopStyle: "solid",
    borderTopColor: colorVars["--color-border"],
    paddingBlockStart: spacingVars["--spacing-8"],
  },
  sectionContent: {
    maxWidth: 720,
  },
  markdownBody: {
    color: colorVars["--color-text-secondary"],
  },
  cardBody: {
    minHeight: 150,
  },
  cardIcon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: spacingVars["--spacing-9"],
    height: spacingVars["--spacing-9"],
    borderRadius: radiusVars["--radius-element"],
    backgroundColor: colorVars["--color-background-muted"],
  },
  metricBody: {
    minHeight: 132,
  },
  metricValue: {
    color: colorVars["--color-text-primary"],
    fontWeight: fontWeightVars["--font-weight-semibold"],
  },
  publicFormGrid: {
    width: "100%",
  },
  publicFormCard: {
    minHeight: 260,
  },
  publicFormHeader: {
    minWidth: 0,
  },
  publicForm: {
    width: "100%",
  },
  publicFormFields: {
    width: "100%",
  },
  publicFormNotice: {
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: radiusVars["--radius-element"],
    paddingBlock: spacingVars["--spacing-3"],
    paddingInline: spacingVars["--spacing-3"],
    backgroundColor: colorVars["--color-background-muted"],
  },
  publicFormNoticeSuccess: {
    borderColor: colorVars["--color-success"],
    backgroundColor: colorVars["--color-success-muted"],
  },
  publicFormNoticeWarning: {
    borderColor: colorVars["--color-warning"],
    backgroundColor: colorVars["--color-warning-muted"],
  },
  publicFormNoticeError: {
    borderColor: colorVars["--color-error"],
    backgroundColor: colorVars["--color-error-muted"],
  },
  publicFormActions: {
    paddingBlockStart: spacingVars["--spacing-1"],
  },
  imageFigure: {
    margin: 0,
    width: "100%",
  },
  imageFrame: {
    overflow: "hidden",
    width: "100%",
    aspectRatio: "3 / 2",
    borderRadius: radiusVars["--radius-container"],
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    backgroundColor: colorVars["--color-background-muted"],
  },
  image: {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  linkList: {
    minWidth: 160,
  },
  footerColumns: {
    alignItems: "flex-start",
  },
  inlineLinkIcon: {
    display: "inline-flex",
    alignItems: "center",
  },
});

const dynamicStyles = stylex.create({
  accentColor: (color: string) => ({
    color,
  }),
  imageAspect: (width: number, height: number) => ({
    aspectRatio: `${width} / ${height}`,
  }),
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

type ProjectedShellLink = {
  label: string;
  publicHref: string;
  shellHref: string;
  sourceHref: string;
  isExternal: boolean;
  isSelected: boolean;
  icon?: string;
};

type ProjectedFormRenderingFacts = {
  states: readonly AstryxPublicFormPrototypeState[];
  warnings: readonly AstryxProjectedSiteTreeWarning[];
};

function FormlessSitePrimaryNav({ items }: { items: readonly ProjectedShellLink[] }) {
  return (
    <>
      {items.map((item) => (
        <TopNavItem
          key={`${item.label}:${item.publicHref}`}
          label={item.label}
          href={item.shellHref}
          target={item.isExternal ? "_blank" : undefined}
          rel={item.isExternal ? "noopener noreferrer" : undefined}
          isSelected={item.isSelected}
          data-public-href={item.publicHref}
        />
      ))}
    </>
  );
}

type FormlessSiteMobileNavProps = {
  items: readonly ProjectedShellLink[];
  onNavigate: () => void;
};

function FormlessSiteMobileNav({ items, onNavigate }: FormlessSiteMobileNavProps) {
  return (
    <SideNavSection title="Pages">
      {items.map((item) => (
        <SideNavItem
          key={`${item.label}:${item.publicHref}`}
          label={item.label}
          href={item.shellHref}
          isSelected={item.isSelected}
          onClick={onNavigate}
          data-public-href={item.publicHref}
        />
      ))}
    </SideNavSection>
  );
}

function FormlessPublicSiteRouteEntrypoint({
  fixture,
}: {
  fixture: AstryxProjectedSitePageFixture;
}) {
  const rootPlacements = orderedPlacements(fixture.tree.page.placements);
  const formFacts = {
    states: fixture.formStates,
    warnings: fixture.tree.meta.warnings,
  } satisfies ProjectedFormRenderingFacts;

  return (
    <VStack gap={8} {...stylex.props(styles.mainContent)}>
      <VStack gap={4} {...stylex.props(styles.pageHero)}>
        <span {...stylex.props(styles.siteIdentity)}>
          <SourceIcon
            source={fixture.tree.site?.icon}
            fallbackIcon={CubeIcon}
            color="inherit"
            size="lg"
            aria-hidden
          />
        </span>
        <Heading level={1}>{fixture.tree.page.label}</Heading>
        <ProjectedMarkdown body={fixture.tree.page.body} headingLevelStart={2} />
      </VStack>
      <ProjectedPlacementList
        formFacts={formFacts}
        placements={rootPlacements}
        routeFacts={fixture.routeFacts}
      />
    </VStack>
  );
}

function FormlessSiteFooter({ fixture }: { fixture: AstryxProjectedSitePageFixture }) {
  const footerGroups = projectedFooterGroups(fixture.tree.frame.footer, fixture.routeFacts);

  return (
    <VStack gap={8}>
      <HStack gap={10} hAlign="start" wrap="wrap" {...stylex.props(styles.footerColumns)}>
        {footerGroups.map((group) => (
          <VStack key={group.label} gap={2} {...stylex.props(styles.linkList)}>
            <Text type="supporting" weight="semibold" as="p">
              {group.label}
            </Text>
            {group.links.map((item) => (
              <Link
                key={`${item.label}:${item.publicHref}`}
                href={item.shellHref}
                isExternalLink={item.isExternal}
                isStandalone
                data-public-href={item.publicHref}
              >
                <ProjectedLinkLabel item={item} />
              </Link>
            ))}
          </VStack>
        ))}
      </HStack>
      <Text type="supporting" as="p">
        {fixture.tree.site?.description ?? fixture.tree.page.label}
      </Text>
    </VStack>
  );
}

function ProjectedPlacementList({
  formFacts,
  placements,
  routeFacts,
}: {
  formFacts: ProjectedFormRenderingFacts;
  placements: readonly AstryxProjectedSitePlacementNode[];
  routeFacts: AstryxProjectedSiteRouteFacts;
}) {
  const ordered = orderedPlacements(placements);

  if (ordered.length === 0) {
    return null;
  }

  return (
    <VStack gap={8} {...stylex.props(styles.blockStack)}>
      {ordered.map((placement) => (
        <ProjectedSiteBlock
          key={placement.id}
          block={placement.block}
          formFacts={formFacts}
          routeFacts={routeFacts}
        />
      ))}
    </VStack>
  );
}

function ProjectedSiteBlock({
  block,
  formFacts,
  routeFacts,
}: {
  block: AstryxProjectedSiteBlockNode;
  formFacts: ProjectedFormRenderingFacts;
  routeFacts: AstryxProjectedSiteRouteFacts;
}) {
  switch (block.type) {
    case "section":
      return <ProjectedSectionBlock block={block} formFacts={formFacts} routeFacts={routeFacts} />;
    case "cardGrid":
      return <ProjectedCardGridBlock block={block} formFacts={formFacts} routeFacts={routeFacts} />;
    case "card":
      return <ProjectedCardBlock block={block} formFacts={formFacts} routeFacts={routeFacts} />;
    case "metricGrid":
      return (
        <ProjectedMetricGridBlock block={block} formFacts={formFacts} routeFacts={routeFacts} />
      );
    case "metric":
      return <ProjectedMetricBlock block={block} />;
    case "image":
      return <ProjectedImageBlock block={block} />;
    case "link":
      return <ProjectedInlineLinkBlock block={block} routeFacts={routeFacts} />;
    case "subscribeForm":
    case "contactForm":
    case "publicOperationForm":
      return <ProjectedPublicFormBlock block={block} formFacts={formFacts} />;
    default:
      return <ProjectedFallbackBlock block={block} formFacts={formFacts} routeFacts={routeFacts} />;
  }
}

function ProjectedSectionBlock({
  block,
  formFacts,
  routeFacts,
}: {
  block: AstryxProjectedSiteBlockNode;
  formFacts: ProjectedFormRenderingFacts;
  routeFacts: AstryxProjectedSiteRouteFacts;
}) {
  return (
    <section id={block.id} data-site-block-type={block.type} {...stylex.props(styles.sectionBlock)}>
      <VStack gap={5}>
        <VStack gap={2} {...stylex.props(styles.sectionContent)}>
          <Heading level={2}>{block.label}</Heading>
          <ProjectedMarkdown body={block.body} headingLevelStart={3} />
        </VStack>
        <ProjectedPlacementList
          formFacts={formFacts}
          placements={block.placements}
          routeFacts={routeFacts}
        />
      </VStack>
    </section>
  );
}

function ProjectedCardGridBlock({
  block,
  formFacts,
  routeFacts,
}: {
  block: AstryxProjectedSiteBlockNode;
  formFacts: ProjectedFormRenderingFacts;
  routeFacts: AstryxProjectedSiteRouteFacts;
}) {
  const cards = orderedPlacements(block.placements);

  return (
    <VStack gap={3}>
      <Heading level={3}>{block.label}</Heading>
      <Grid columns={{ minWidth: 220, max: 3, repeat: "fit" }} gap={4} width="100%">
        {cards.map((placement) => (
          <ProjectedSiteBlock
            key={placement.id}
            block={placement.block}
            formFacts={formFacts}
            routeFacts={routeFacts}
          />
        ))}
      </Grid>
    </VStack>
  );
}

function ProjectedCardBlock({
  block,
  formFacts,
  routeFacts,
}: {
  block: AstryxProjectedSiteBlockNode;
  formFacts: ProjectedFormRenderingFacts;
  routeFacts: AstryxProjectedSiteRouteFacts;
}) {
  return (
    <Card padding={5} minHeight={180}>
      <VStack gap={3} {...stylex.props(styles.cardBody)}>
        {block.icon ? (
          <span
            {...stylex.props(
              styles.cardIcon,
              block.color ? dynamicStyles.accentColor(block.color) : null,
            )}
          >
            <SourceIcon source={block.icon} color="inherit" aria-hidden />
          </span>
        ) : null}
        <Heading level={4}>{block.label}</Heading>
        <ProjectedMarkdown body={block.body} headingLevelStart={5} />
        <ProjectedPlacementList
          formFacts={formFacts}
          placements={block.placements}
          routeFacts={routeFacts}
        />
      </VStack>
    </Card>
  );
}

function ProjectedMetricGridBlock({
  block,
  formFacts,
  routeFacts,
}: {
  block: AstryxProjectedSiteBlockNode;
  formFacts: ProjectedFormRenderingFacts;
  routeFacts: AstryxProjectedSiteRouteFacts;
}) {
  const metrics = orderedPlacements(block.placements);

  return (
    <VStack gap={3}>
      <Heading level={3}>{block.label}</Heading>
      <Grid columns={{ minWidth: 180, max: 3, repeat: "fit" }} gap={3} width="100%">
        {metrics.map((placement) => (
          <ProjectedSiteBlock
            key={placement.id}
            block={placement.block}
            formFacts={formFacts}
            routeFacts={routeFacts}
          />
        ))}
      </Grid>
    </VStack>
  );
}

function ProjectedMetricBlock({ block }: { block: AstryxProjectedSiteBlockNode }) {
  return (
    <Card padding={4} minHeight={140} variant="muted">
      <VStack gap={2} {...stylex.props(styles.metricBody)}>
        <Text
          type="large"
          as="p"
          {...stylex.props(
            styles.metricValue,
            block.color ? dynamicStyles.accentColor(block.color) : null,
          )}
        >
          {block.label}
        </Text>
        <ProjectedMarkdown body={block.body} headingLevelStart={4} />
      </VStack>
    </Card>
  );
}

function ProjectedImageBlock({ block }: { block: AstryxProjectedSiteBlockNode }) {
  const preferredHref = block.media?.href ?? block.href;
  const fallbackHref = block.media?.href ? block.href : undefined;

  if (!preferredHref) {
    return null;
  }

  return (
    <figure {...stylex.props(styles.imageFigure)} data-media-asset-id={block.media?.assetId}>
      <div
        {...stylex.props(
          styles.imageFrame,
          block.width && block.height ? dynamicStyles.imageAspect(block.width, block.height) : null,
        )}
      >
        <img
          src={preferredHref}
          alt={block.label}
          loading="lazy"
          data-preferred-src={preferredHref}
          data-fallback-src={fallbackHref}
          onError={(event) => {
            if (fallbackHref && event.currentTarget.src !== fallbackHref) {
              event.currentTarget.src = fallbackHref;
            }
          }}
          {...stylex.props(styles.image)}
        />
      </div>
      <figcaption>
        <Text type="supporting" as="span" color="secondary">
          {block.label}
        </Text>
      </figcaption>
    </figure>
  );
}

function ProjectedInlineLinkBlock({
  block,
  routeFacts,
}: {
  block: AstryxProjectedSiteBlockNode;
  routeFacts: AstryxProjectedSiteRouteFacts;
}) {
  if (!block.href) {
    return null;
  }

  const item = toProjectedShellLink(block, block.href, routeFacts);

  return (
    <Link
      href={item.shellHref}
      isExternalLink={item.isExternal}
      isStandalone
      data-public-href={item.publicHref}
    >
      <ProjectedLinkLabel item={item} />
    </Link>
  );
}

function ProjectedFallbackBlock({
  block,
  formFacts,
  routeFacts,
}: {
  block: AstryxProjectedSiteBlockNode;
  formFacts: ProjectedFormRenderingFacts;
  routeFacts: AstryxProjectedSiteRouteFacts;
}) {
  return (
    <Card padding={5}>
      <VStack gap={3}>
        <Heading level={3}>{block.label}</Heading>
        <ProjectedMarkdown body={block.body} headingLevelStart={4} />
        <ProjectedPlacementList
          formFacts={formFacts}
          placements={block.placements}
          routeFacts={routeFacts}
        />
      </VStack>
    </Card>
  );
}

function ProjectedPublicFormBlock({
  block,
  formFacts,
}: {
  block: AstryxProjectedSiteBlockNode;
  formFacts: ProjectedFormRenderingFacts;
}) {
  const variants = projectedFormStateVariants(block, formFacts);

  if (variants.length === 1) {
    return (
      <ProjectedPublicFormVariant
        block={block}
        formState={variants[0]}
        warning={projectedFormWarning(block, formFacts, variants[0])}
      />
    );
  }

  return (
    <Grid
      columns={{ minWidth: 280, max: 2, repeat: "fit" }}
      gap={4}
      width="100%"
      {...stylex.props(styles.publicFormGrid)}
    >
      {variants.map((formState, index) => (
        <ProjectedPublicFormVariant
          key={`${formState.blockId}:${formState.state}:${index}`}
          block={block}
          formState={formState}
          warning={projectedFormWarning(block, formFacts, formState)}
        />
      ))}
    </Grid>
  );
}

function ProjectedPublicFormVariant({
  block,
  formState,
  warning,
}: {
  block: AstryxProjectedSiteBlockNode;
  formState: AstryxPublicFormPrototypeState;
  warning?: AstryxProjectedSiteTreeWarning;
}) {
  const hasProjectedOperation = Boolean(block.publicOperation);
  const isUnavailable = formState.state === "unavailable" || !hasProjectedOperation;
  const isComplete = formState.state === "success";
  const isSubmitting = formState.state === "submitting";
  const canRenderFields = !isUnavailable && !isComplete;
  const message = publicFormStateMessage(block, formState, warning, hasProjectedOperation);
  const noticeState = isUnavailable ? "unavailable" : formState.state;
  const shouldRenderNoticeBeforeActions = noticeState === "failed" && canRenderFields;

  return (
    <Card padding={5} variant={isUnavailable ? "muted" : undefined}>
      <form
        aria-label={`${block.label} ${publicFormStateLabel(formState.state)}`}
        data-public-form-kind={block.type}
        data-public-form-state={isUnavailable ? "unavailable" : formState.state}
        data-public-operation-key={block.publicOperation?.canonicalKey}
        data-site-block-type={block.type}
        onSubmit={(event) => event.preventDefault()}
        {...stylex.props(styles.publicForm, styles.publicFormCard)}
      >
        <VStack gap={4}>
          <HStack hAlign="between" vAlign="start" gap={3} wrap="wrap">
            <VStack gap={2} {...stylex.props(styles.publicFormHeader)}>
              <Heading level={3}>{block.label}</Heading>
              <ProjectedMarkdown body={block.body} headingLevelStart={4} />
            </VStack>
          </HStack>
          {message && !shouldRenderNoticeBeforeActions ? (
            <PublicFormStateNotice state={noticeState}>{message}</PublicFormStateNotice>
          ) : null}
          {canRenderFields ? (
            <ProjectedPublicFormFields block={block} isDisabled={isSubmitting} />
          ) : null}
          {message && shouldRenderNoticeBeforeActions ? (
            <PublicFormStateNotice state={noticeState}>{message}</PublicFormStateNotice>
          ) : null}
          {canRenderFields ? (
            <div {...stylex.props(styles.publicFormActions)}>
              <Button
                label={isSubmitting ? "Submitting" : (block.buttonLabel ?? "Submit")}
                type="submit"
                variant="primary"
                isDisabled={isSubmitting}
                isLoading={isSubmitting}
              />
            </div>
          ) : null}
        </VStack>
      </form>
    </Card>
  );
}

function PublicFormStateNotice({
  children,
  state,
}: {
  children: ReactNode;
  state: AstryxPublicFormPrototypeState["state"];
}) {
  return (
    <div
      role={state === "failed" ? "alert" : "status"}
      {...stylex.props(
        styles.publicFormNotice,
        state === "success" ? styles.publicFormNoticeSuccess : null,
        state === "unavailable" ? styles.publicFormNoticeWarning : null,
        state === "failed" ? styles.publicFormNoticeError : null,
      )}
    >
      <Text type="supporting" as="p">
        {children}
      </Text>
    </div>
  );
}

function ProjectedPublicFormFields({
  block,
  isDisabled,
}: {
  block: AstryxProjectedSiteBlockNode;
  isDisabled: boolean;
}) {
  if (block.type === "subscribeForm") {
    return <ProjectedSubscribeFormFields block={block} isDisabled={isDisabled} />;
  }

  if (block.type === "contactForm") {
    return <ProjectedContactFormFields block={block} isDisabled={isDisabled} />;
  }

  return <ProjectedPublicOperationFormFields block={block} isDisabled={isDisabled} />;
}

function ProjectedSubscribeFormFields({
  block,
  isDisabled,
}: {
  block: AstryxProjectedSiteBlockNode;
  isDisabled: boolean;
}) {
  const [email, setEmail] = useState("reader@example.com");

  return (
    <VStack gap={3} {...stylex.props(styles.publicFormFields)}>
      <TextInput
        data-public-fixed-field="email"
        htmlName="email"
        isDisabled={isDisabled}
        isRequired
        label={block.emailLabel ?? "Email"}
        type="email"
        value={email}
        width="100%"
        onChange={setEmail}
      />
    </VStack>
  );
}

function ProjectedContactFormFields({
  block,
  isDisabled,
}: {
  block: AstryxProjectedSiteBlockNode;
  isDisabled: boolean;
}) {
  const [name, setName] = useState("Dana Peek");
  const [email, setEmail] = useState("dana@example.com");
  const [message, setMessage] = useState("I want to review the public Site renderer.");

  return (
    <VStack gap={3} {...stylex.props(styles.publicFormFields)}>
      <TextInput
        data-public-fixed-field="name"
        htmlName="name"
        isDisabled={isDisabled}
        isRequired
        label={block.nameLabel ?? "Name"}
        value={name}
        width="100%"
        onChange={setName}
      />
      <TextInput
        data-public-fixed-field="email"
        htmlName="email"
        isDisabled={isDisabled}
        isRequired
        label={block.emailLabel ?? "Email"}
        type="email"
        value={email}
        width="100%"
        onChange={setEmail}
      />
      <TextArea
        data-public-fixed-field="message"
        htmlName="message"
        isDisabled={isDisabled}
        isRequired
        label={block.messageLabel ?? "Message"}
        rows={4}
        value={message}
        width="100%"
        onChange={setMessage}
      />
    </VStack>
  );
}

function ProjectedPublicOperationFormFields({
  block,
  isDisabled,
}: {
  block: AstryxProjectedSiteBlockNode;
  isDisabled: boolean;
}) {
  const operation = block.publicOperation;
  const fields = operation?.fields ?? [];
  const [draftValues, setDraftValues] = useState(() => createInitialPublicOperationDraft(fields));
  const handlers = {
    onDraftChange: (fieldId, value) =>
      setDraftValues((currentValues) => ({
        ...currentValues,
        [fieldId]: value,
      })),
  } satisfies AstryxFieldIntentHandlers;

  if (!operation || fields.length === 0) {
    return null;
  }

  return (
    <VStack gap={3} {...stylex.props(styles.publicFormFields)}>
      {fields.map((field) => {
        const fieldData = toPublicOperationFieldData(field, draftValues, isDisabled);

        return (
          <ProjectedPublicOperationField key={fieldData.id} field={fieldData} handlers={handlers} />
        );
      })}
    </VStack>
  );
}

function ProjectedPublicOperationField({
  field,
  handlers,
}: {
  field: AstryxFieldEditorData;
  handlers: AstryxFieldIntentHandlers;
}) {
  const isPending = Boolean(field.pending?.isPending);
  const isDisabled = field.accessMode !== "editable" || isPending;
  const sharedProps = {
    description: field.description,
    isDisabled,
    isLoading: isPending,
    isRequired: field.isRequired,
    label: field.label,
    placeholder: field.presentation?.placeholder,
    width: "100%" as const,
  };

  return (
    <div
      data-public-field-control={publicOperationFieldControlName(field)}
      data-public-field-format={field.presentation?.format}
      data-public-field-name={field.name}
    >
      {renderPublicOperationFieldControl(field, handlers, sharedProps)}
    </div>
  );
}

function renderPublicOperationFieldControl(
  field: AstryxFieldEditorData,
  handlers: AstryxFieldIntentHandlers,
  sharedProps: {
    description?: string;
    isDisabled: boolean;
    isLoading: boolean;
    isRequired?: boolean;
    label: string;
    placeholder?: string;
    width: "100%";
  },
) {
  if (field.kind === "long-text") {
    return (
      <TextArea
        {...sharedProps}
        htmlName={field.name}
        rows={4}
        value={formatPublicFieldValue(field.draftValue)}
        onChange={(value) => handlers.onDraftChange?.(field.id, value)}
      />
    );
  }

  if (field.kind === "boolean") {
    return (
      <CheckboxInput
        description={sharedProps.description}
        isDisabled={sharedProps.isDisabled}
        isLoading={sharedProps.isLoading}
        isRequired={sharedProps.isRequired}
        label={sharedProps.label}
        value={field.draftValue === true}
        width="100%"
        onChange={(value) => handlers.onDraftChange?.(field.id, value)}
      />
    );
  }

  if (field.kind === "date") {
    return (
      <DateInput
        {...sharedProps}
        hasClear={!field.isRequired}
        value={publicDateInputValue(formatPublicFieldValue(field.draftValue))}
        onChange={(value) => handlers.onDraftChange?.(field.id, value ?? "")}
      />
    );
  }

  if (field.kind === "number") {
    return (
      <NumberInput
        description={sharedProps.description}
        hasClear
        htmlName={field.name}
        isDisabled={sharedProps.isDisabled}
        isRequired={sharedProps.isRequired}
        label={sharedProps.label}
        placeholder={sharedProps.placeholder}
        value={publicNumberInputValue(field.draftValue)}
        width={sharedProps.width}
        onChange={(value) => handlers.onDraftChange?.(field.id, value)}
      />
    );
  }

  if (field.kind === "enum") {
    return (
      <ProjectedPublicOperationSelector
        field={field}
        handlers={handlers}
        sharedProps={sharedProps}
      />
    );
  }

  if (field.options?.length) {
    return (
      <ProjectedPublicOperationTypeahead
        field={field}
        handlers={handlers}
        sharedProps={sharedProps}
      />
    );
  }

  return (
    <TextInput
      {...sharedProps}
      {...publicTextInputElementProps(field)}
      hasClear={!field.isRequired}
      htmlName={field.name}
      type={field.presentation?.format === "email" ? "email" : "text"}
      value={formatPublicFieldValue(field.draftValue)}
      onChange={(value) => handlers.onDraftChange?.(field.id, value)}
    />
  );
}

type PublicSuggestionItem = SearchableItem<{ value: string }>;

function ProjectedPublicOperationTypeahead({
  field,
  handlers,
  sharedProps,
}: {
  field: AstryxFieldEditorData;
  handlers: AstryxFieldIntentHandlers;
  sharedProps: {
    description?: string;
    isDisabled: boolean;
    isLoading: boolean;
    isRequired?: boolean;
    label: string;
    placeholder?: string;
    width: "100%";
  };
}) {
  const items = publicSuggestionItems(field.options ?? []);
  const searchSource = createStaticSource(items);
  const value = formatPublicFieldValue(field.draftValue);
  const selectedItem = items.find((item) => publicSuggestionItemValue(item) === value) ?? null;

  return (
    <>
      <Typeahead
        description={sharedProps.description}
        emptySearchResultsText="No suggestions"
        hasClear={!field.isRequired}
        hasEntriesOnFocus
        isDisabled={sharedProps.isDisabled}
        isRequired={sharedProps.isRequired}
        label={sharedProps.label}
        placeholder={sharedProps.placeholder}
        searchSource={searchSource}
        value={selectedItem}
        width={sharedProps.width}
        debounceMs={0}
        onChange={(item) =>
          handlers.onDraftChange?.(field.id, item ? publicSuggestionItemValue(item) : "")
        }
        onChangeQuery={(query) => handlers.onDraftChange?.(field.id, query)}
      />
      <input name={field.name} readOnly type="hidden" value={value} />
    </>
  );
}

function ProjectedPublicOperationSelector({
  field,
  handlers,
  sharedProps,
}: {
  field: AstryxFieldEditorData;
  handlers: AstryxFieldIntentHandlers;
  sharedProps: {
    description?: string;
    isDisabled: boolean;
    isLoading: boolean;
    isRequired?: boolean;
    label: string;
    placeholder?: string;
    width: "100%";
  };
}) {
  const options = publicSelectorOptions(field.options ?? []);
  const value = formatPublicFieldValue(field.draftValue);

  if (field.isRequired) {
    return (
      <Selector
        {...sharedProps}
        options={options}
        value={value || undefined}
        onChange={(nextValue) => handlers.onDraftChange?.(field.id, nextValue)}
      />
    );
  }

  return (
    <Selector
      {...sharedProps}
      hasClear
      options={options}
      value={value || null}
      onChange={(nextValue) => handlers.onDraftChange?.(field.id, nextValue ?? "")}
    />
  );
}

type PublicOperationDraftValues = Record<string, AstryxFieldValue>;
type ISODateInputValue =
  `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

function projectedFormStateVariants(
  block: AstryxProjectedSiteBlockNode,
  formFacts: ProjectedFormRenderingFacts,
) {
  const explicitStates = formFacts.states.filter((state) => state.blockId === block.id);

  if (explicitStates.length > 0) {
    return explicitStates;
  }

  const warning = formFacts.warnings.find((candidate) => candidate.recordId === block.id);

  return [
    {
      blockId: block.id,
      state: block.publicOperation && !warning ? "valid" : "unavailable",
      message: warning?.message,
      warningCode: warning?.code,
    },
  ] satisfies readonly AstryxPublicFormPrototypeState[];
}

function projectedFormWarning(
  block: AstryxProjectedSiteBlockNode,
  formFacts: ProjectedFormRenderingFacts,
  formState: AstryxPublicFormPrototypeState,
) {
  return formFacts.warnings.find(
    (warning) =>
      warning.recordId === block.id &&
      (!formState.warningCode || warning.code === formState.warningCode),
  );
}

function publicFormStateLabel(state: AstryxPublicFormPrototypeState["state"]) {
  switch (state) {
    case "valid":
      return "Ready";
    case "unavailable":
      return "Unavailable";
    case "submitting":
      return "Submitting";
    case "success":
      return "Success";
    case "failed":
      return "Failed";
  }
}

function publicFormStateMessage(
  block: AstryxProjectedSiteBlockNode,
  formState: AstryxPublicFormPrototypeState,
  warning: AstryxProjectedSiteTreeWarning | undefined,
  hasProjectedOperation: boolean,
) {
  if (!hasProjectedOperation || formState.state === "unavailable") {
    return formState.message ?? warning?.message ?? "This form is unavailable.";
  }

  if (formState.state === "success") {
    return formState.message ?? block.successLabel ?? "Submitted.";
  }

  if (formState.state === "failed") {
    return formState.message ?? "Submission failed. Try again.";
  }

  return null;
}

function createInitialPublicOperationDraft(
  fields: readonly AstryxProjectedSitePublicOperationInputFieldNode[],
) {
  const values: PublicOperationDraftValues = {};

  for (const field of fields) {
    values[field.name] = initialPublicOperationFieldValue(field);
  }

  return values;
}

function initialPublicOperationFieldValue(
  field: AstryxProjectedSitePublicOperationInputFieldNode,
): AstryxFieldValue {
  if (field.control === "boolean") {
    return false;
  }

  if (field.control === "number") {
    return null;
  }

  if (field.control === "date") {
    return "2026-07-15";
  }

  if (field.control === "enum") {
    return field.options?.[0]?.value ?? "";
  }

  if (field.format === "email") {
    return "dana@example.com";
  }

  if (field.format === "phone") {
    return "+1 555 0100";
  }

  if (field.suggestions?.[0]) {
    return field.suggestions[0];
  }

  return field.control === "longText" ? "Review the projected public page." : "Dana Peek";
}

function toPublicOperationFieldData(
  field: AstryxProjectedSitePublicOperationInputFieldNode,
  draftValues: PublicOperationDraftValues,
  isDisabled: boolean,
): AstryxFieldEditorData {
  const draftValue = draftValues[field.name] ?? initialPublicOperationFieldValue(field);

  return {
    id: field.name,
    name: field.name,
    label: field.label,
    isRequired: field.required,
    surface: "public-action",
    density: "balanced",
    accessMode: isDisabled ? "disabled" : "editable",
    kind: toPublicOperationFieldKind(field),
    options: toPublicOperationFieldOptions(field),
    presentation: {
      format: field.format,
      placeholder: publicOperationFieldPlaceholder(field),
    },
    mode: "editor",
    draftValue,
    committedDisplayValue: formatPublicFieldValue(draftValue),
    commitPolicy: "submit",
  };
}

function toPublicOperationFieldKind(
  field: AstryxProjectedSitePublicOperationInputFieldNode,
): AstryxFieldEditorData["kind"] {
  if (field.control === "longText") {
    return "long-text";
  }

  return field.control;
}

function toPublicOperationFieldOptions(
  field: AstryxProjectedSitePublicOperationInputFieldNode,
): readonly AstryxFieldOption[] | undefined {
  if (field.control === "enum") {
    return field.options;
  }

  if (field.suggestions?.length) {
    return field.suggestions.map((suggestion) => ({
      value: suggestion,
      label: suggestion,
    }));
  }

  return undefined;
}

function publicOperationFieldPlaceholder(field: AstryxProjectedSitePublicOperationInputFieldNode) {
  if (field.suggestions?.[0]) {
    return field.suggestions[0];
  }

  if (field.format === "phone") {
    return "+1 555 0100";
  }

  if (field.format === "email") {
    return "name@example.com";
  }

  return undefined;
}

function publicTextInputElementProps(field: AstryxFieldEditorData) {
  return {
    inputMode: field.presentation?.format === "phone" ? "tel" : undefined,
    pattern: field.presentation?.format === "phone" ? "[0-9+() -]*" : undefined,
  } satisfies Record<string, string | undefined>;
}

function publicSelectorOptions(options: readonly AstryxFieldOption[]): SelectorOptionData[] {
  return options.map((option) => ({
    disabled: option.isDisabled,
    label: option.label,
    value: option.value,
  }));
}

function publicSuggestionItems(options: readonly AstryxFieldOption[]): PublicSuggestionItem[] {
  return options.map((option) => ({
    id: option.value,
    label: option.label,
    auxiliaryData: {
      value: option.value,
    },
  }));
}

function publicSuggestionItemValue(item: PublicSuggestionItem) {
  return item.auxiliaryData?.value ?? item.id;
}

function publicOperationFieldControlName(field: AstryxFieldEditorData) {
  if (field.kind === "long-text") {
    return "longText";
  }

  return field.kind;
}

function publicDateInputValue(value: string): ISODateInputValue | undefined {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? (value as ISODateInputValue) : undefined;
}

function publicNumberInputValue(value: AstryxFieldValue) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function formatPublicFieldValue(value: AstryxFieldValue) {
  if (value === null) {
    return "";
  }

  return String(value);
}

function ProjectedMarkdown({
  body,
  headingLevelStart,
}: {
  body?: string;
  headingLevelStart: 1 | 2 | 3 | 4 | 5 | 6;
}) {
  if (!body) {
    return null;
  }

  return (
    <div {...stylex.props(styles.markdownBody)}>
      <Markdown headingLevelStart={headingLevelStart} contentWidth="100%">
        {body}
      </Markdown>
    </div>
  );
}

function ProjectedLinkLabel({ item }: { item: ProjectedShellLink }) {
  return (
    <HStack gap={1} vAlign="center">
      <ProjectedLinkIcon item={item} />
      <span>{item.label}</span>
    </HStack>
  );
}

function ProjectedLinkIcon({ item }: { item: ProjectedShellLink }) {
  if (item.icon && isSourceSvg(item.icon)) {
    return (
      <span {...stylex.props(styles.inlineLinkIcon)}>
        <SourceIcon source={item.icon} color="inherit" size="sm" aria-hidden />
      </span>
    );
  }

  return null;
}

function projectedFrameLinks(
  block: AstryxProjectedSiteBlockNode | undefined,
  routeFacts: AstryxProjectedSiteRouteFacts,
): ProjectedShellLink[] {
  if (!block) {
    return [];
  }

  const links: ProjectedShellLink[] = [];
  collectProjectedLinks(block, links, routeFacts);

  return links;
}

function projectedFooterGroups(
  block: AstryxProjectedSiteBlockNode | undefined,
  routeFacts: AstryxProjectedSiteRouteFacts,
) {
  if (!block) {
    return [];
  }

  return orderedPlacements(block.placements)
    .map((placement) => ({
      label: placement.block.label,
      links: projectedFrameLinks(placement.block, routeFacts),
    }))
    .filter((group) => group.links.length > 0);
}

function collectProjectedLinks(
  block: AstryxProjectedSiteBlockNode,
  links: ProjectedShellLink[],
  routeFacts: AstryxProjectedSiteRouteFacts,
): void {
  if (block.type === "link" && block.href) {
    links.push(toProjectedShellLink(block, block.href, routeFacts));
  }

  for (const placement of orderedPlacements(block.placements)) {
    collectProjectedLinks(placement.block, links, routeFacts);
  }
}

function orderedPlacements(
  placements: readonly AstryxProjectedSitePlacementNode[],
): AstryxProjectedSitePlacementNode[] {
  return [...placements].sort((first, second) => first.order - second.order);
}

function toProjectedShellLink(
  block: AstryxProjectedSiteBlockNode,
  sourceHref: string,
  routeFacts: AstryxProjectedSiteRouteFacts,
): ProjectedShellLink {
  const publicHref = projectedPublicHref(sourceHref, routeFacts);
  const isExternal = isExternalHref(publicHref);

  return {
    label: block.label,
    sourceHref,
    publicHref,
    shellHref: isExternal ? publicHref : "#public-site",
    isExternal,
    isSelected: isProjectedHrefSelected(publicHref, routeFacts),
    icon: block.icon,
  };
}

function projectedPublicHref(href: string, routeFacts: AstryxProjectedSiteRouteFacts) {
  if (isExternalHref(href) || href.startsWith("#")) {
    return href;
  }

  const routeBase = trimTrailingSlash(routeFacts.routeBase ?? "");

  if (href.startsWith("/")) {
    if (routeBase && (href === routeBase || href.startsWith(`${routeBase}/`))) {
      return href;
    }

    return `${routeBase}${href}`;
  }

  return `${routeBase}/${href}`;
}

function isProjectedHrefSelected(publicHref: string, routeFacts: AstryxProjectedSiteRouteFacts) {
  if (isExternalHref(publicHref) || publicHref.startsWith("#")) {
    return false;
  }

  return normalizePathname(publicHref) === normalizePathname(routeFacts.currentPath);
}

function normalizePathname(pathname: string) {
  return trimTrailingSlash(pathname.split(/[?#]/)[0] || "/") || "/";
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function isExternalHref(href: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(href);
}

function isSourceSvg(source: string) {
  return source.trimStart().startsWith("<svg");
}
