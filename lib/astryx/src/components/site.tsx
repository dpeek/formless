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
  FieldInputAttributes,
  FieldSchema,
  FieldValue,
  GeneratedFieldDraftInput,
  PublicSafeOperationInputField,
} from "@dpeek/formless-schema";
import type {
  FormlessUiFieldAccess,
  FormlessUiFieldControl,
  FormlessUiFieldIntentHandler,
  FormlessUiFieldOptions,
  FormlessUiOperationInputField,
} from "../formless-ui-contract.ts";
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
  const handleIntent: FormlessUiFieldIntentHandler = (intent) => {
    if (intent.type !== "operationDraftChange") {
      return;
    }

    setDraftValues((currentValues) => ({
      ...currentValues,
      [intent.inputName]: intent.inputValue,
    }));
  };

  const updateDraftValue = (inputName: string, value: PublicOperationDraftValue) =>
    handleIntent({
      type: "operationDraftChange",
      inputName,
      inputValue: publicDraftInputFromValue(value),
    });

  const clearDraftValue = (inputName: string) =>
    handleIntent({
      type: "operationDraftChange",
      inputName,
      inputValue: publicDraftInputFromValue(""),
    });

  const setDraftValue = (inputName: string, inputValue: GeneratedFieldDraftInput | undefined) =>
    setDraftValues((currentValues) => ({
      ...currentValues,
      [inputName]: inputValue,
    }));

  if (!operation || fields.length === 0) {
    return null;
  }

  return (
    <VStack gap={3} {...stylex.props(styles.publicFormFields)}>
      {fields.map((field) => {
        const fieldData = toPublicOperationFieldData(field, draftValues, isDisabled);

        return (
          <ProjectedPublicOperationField
            key={fieldData.inputName}
            field={fieldData}
            clearDraftValue={clearDraftValue}
            setDraftValue={setDraftValue}
            updateDraftValue={updateDraftValue}
          />
        );
      })}
    </VStack>
  );
}

function ProjectedPublicOperationField({
  clearDraftValue,
  field,
  setDraftValue,
  updateDraftValue,
}: {
  clearDraftValue: (inputName: string) => void;
  field: ProjectedPublicOperationFieldData;
  setDraftValue: (inputName: string, inputValue: GeneratedFieldDraftInput | undefined) => void;
  updateDraftValue: (inputName: string, value: PublicOperationDraftValue) => void;
}) {
  const isPending = Boolean(field.pending?.isPending);
  const isDisabled = field.access.kind !== "editable" || isPending;
  const sharedProps = {
    description: field.publicDescription,
    isDisabled,
    isLoading: isPending,
    isRequired: field.required,
    label: field.label,
    placeholder: field.publicPlaceholder,
    width: "100%" as const,
  };

  return (
    <div
      data-public-field-control={publicOperationFieldControlName(field)}
      data-public-field-format={field.field.type === "text" ? field.field.format : undefined}
      data-public-field-name={field.inputName}
    >
      {renderPublicOperationFieldControl(field, {
        clearDraftValue,
        setDraftValue,
        sharedProps,
        updateDraftValue,
      })}
    </div>
  );
}

function renderPublicOperationFieldControl(
  field: ProjectedPublicOperationFieldData,
  input: {
    clearDraftValue: (inputName: string) => void;
    setDraftValue: (inputName: string, inputValue: GeneratedFieldDraftInput | undefined) => void;
    sharedProps: {
      description?: string;
      isDisabled: boolean;
      isLoading: boolean;
      isRequired?: boolean;
      label: string;
      placeholder?: string;
      width: "100%";
    };
    updateDraftValue: (inputName: string, value: PublicOperationDraftValue) => void;
  },
) {
  const { clearDraftValue, setDraftValue, sharedProps, updateDraftValue } = input;

  if (field.input.control === "longText") {
    return (
      <TextArea
        {...sharedProps}
        htmlName={field.inputName}
        rows={4}
        value={formatPublicFieldValue(field.draftInput)}
        onChange={(value) => updateDraftValue(field.inputName, value)}
      />
    );
  }

  if (field.input.control === "boolean") {
    return (
      <CheckboxInput
        description={sharedProps.description}
        isDisabled={sharedProps.isDisabled}
        isLoading={sharedProps.isLoading}
        isRequired={sharedProps.isRequired}
        label={sharedProps.label}
        value={field.draftInput?.value === true}
        width="100%"
        onChange={(value) => updateDraftValue(field.inputName, value)}
      />
    );
  }

  if (field.input.control === "date") {
    return (
      <DateInput
        {...sharedProps}
        hasClear={!field.required}
        value={publicDateInputValue(formatPublicFieldValue(field.draftInput))}
        onChange={(value) => updateDraftValue(field.inputName, value ?? "")}
      />
    );
  }

  if (field.input.control === "number") {
    return (
      <NumberInput
        description={sharedProps.description}
        hasClear
        htmlName={field.inputName}
        isDisabled={sharedProps.isDisabled}
        isRequired={sharedProps.isRequired}
        label={sharedProps.label}
        placeholder={sharedProps.placeholder}
        value={publicNumberInputValue(field.draftInput)}
        width={sharedProps.width}
        onChange={(value) =>
          value === null
            ? clearDraftValue(field.inputName)
            : updateDraftValue(field.inputName, value)
        }
      />
    );
  }

  if (field.input.control === "enum") {
    return (
      <ProjectedPublicOperationSelector
        field={field}
        updateDraftValue={updateDraftValue}
        sharedProps={sharedProps}
      />
    );
  }

  if (field.options?.referenceOptions?.length) {
    return (
      <ProjectedPublicOperationTypeahead
        field={field}
        setDraftValue={setDraftValue}
        sharedProps={sharedProps}
      />
    );
  }

  return (
    <TextInput
      {...sharedProps}
      {...publicTextInputElementProps(field)}
      hasClear={!field.required}
      htmlName={field.inputName}
      type={field.field.type === "text" && field.field.format === "email" ? "email" : "text"}
      value={formatPublicFieldValue(field.draftInput)}
      onChange={(value) => updateDraftValue(field.inputName, value)}
    />
  );
}

type PublicSuggestionItem = SearchableItem<{ value: string }>;

function ProjectedPublicOperationTypeahead({
  field,
  setDraftValue,
  sharedProps,
}: {
  field: ProjectedPublicOperationFieldData;
  setDraftValue: (inputName: string, inputValue: GeneratedFieldDraftInput | undefined) => void;
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
  const items = publicSuggestionItems(field.options?.referenceOptions ?? []);
  const searchSource = createStaticSource(items);
  const value = formatPublicFieldValue(field.draftInput);
  const selectedItem = items.find((item) => publicSuggestionItemValue(item) === value) ?? null;

  return (
    <>
      <Typeahead
        description={sharedProps.description}
        emptySearchResultsText="No suggestions"
        hasClear={!field.required}
        hasEntriesOnFocus
        isDisabled={sharedProps.isDisabled}
        isRequired={sharedProps.isRequired}
        label={sharedProps.label}
        placeholder={sharedProps.placeholder}
        searchSource={searchSource}
        value={selectedItem}
        width={sharedProps.width}
        debounceMs={0}
        onChange={(item) => {
          const inputValue = item
            ? publicDraftInputFromValue(publicSuggestionItemValue(item))
            : publicDraftInputFromValue("");

          setDraftValue(field.inputName, inputValue);
        }}
        onChangeQuery={(query) => setDraftValue(field.inputName, publicDraftInputFromValue(query))}
      />
      <input name={field.inputName} readOnly type="hidden" value={value} />
    </>
  );
}

function ProjectedPublicOperationSelector({
  field,
  sharedProps,
  updateDraftValue,
}: {
  field: ProjectedPublicOperationFieldData;
  sharedProps: {
    description?: string;
    isDisabled: boolean;
    isLoading: boolean;
    isRequired?: boolean;
    label: string;
    placeholder?: string;
    width: "100%";
  };
  updateDraftValue: (inputName: string, value: PublicOperationDraftValue) => void;
}) {
  const options = publicSelectorOptions(field.options?.enumOptions ?? []);
  const value = formatPublicFieldValue(field.draftInput);

  if (field.required) {
    return (
      <Selector
        {...sharedProps}
        options={options}
        value={value || undefined}
        onChange={(nextValue) => updateDraftValue(field.inputName, nextValue)}
      />
    );
  }

  return (
    <Selector
      {...sharedProps}
      hasClear
      options={options}
      value={value || null}
      onChange={(nextValue) => updateDraftValue(field.inputName, nextValue ?? "")}
    />
  );
}

type PublicOperationDraftValue = FieldValue;
type PublicOperationDraftValues = Record<string, GeneratedFieldDraftInput | undefined>;
type ProjectedPublicOperationFieldData = FormlessUiOperationInputField & {
  publicDescription?: string;
  publicPlaceholder?: string;
};
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
    values[field.name] = publicDraftInputFromValue(initialPublicOperationFieldValue(field));
  }

  return values;
}

function initialPublicOperationFieldValue(
  field: AstryxProjectedSitePublicOperationInputFieldNode,
): PublicOperationDraftValue {
  if (field.control === "boolean") {
    return false;
  }

  if (field.control === "number") {
    return "";
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
): ProjectedPublicOperationFieldData {
  const draftInput =
    draftValues[field.name] ?? publicDraftInputFromValue(initialPublicOperationFieldValue(field));
  const fieldSchema = toPublicOperationFieldSchema(field);
  const control = toPublicOperationFieldControl(field, fieldSchema);

  return {
    access: publicOperationFieldAccess(isDisabled),
    commit: "submit",
    control,
    draftInput,
    editor: control.editor,
    field: fieldSchema,
    fieldName: field.name,
    input: toPublicOperationInput(field),
    inputName: field.name,
    label: field.label,
    options: toPublicOperationFieldOptions(field),
    publicPlaceholder: publicOperationFieldPlaceholder(field),
    required: field.required,
    mode: "editor",
    surface: "operation",
    value: draftInput.value,
  };
}

function toPublicOperationFieldSchema(
  field: AstryxProjectedSitePublicOperationInputFieldNode,
): FieldSchema {
  if (field.control === "boolean") {
    return { type: "boolean", required: field.required, label: field.label };
  }

  if (field.control === "date") {
    return { type: "date", required: field.required, label: field.label };
  }

  if (field.control === "number") {
    return { type: "number", required: field.required, label: field.label };
  }

  if (field.control === "enum") {
    return {
      type: "enum",
      required: field.required,
      label: field.label,
      values: Object.fromEntries(
        (field.options ?? []).map((option) => [option.value, { label: option.label }]),
      ),
    };
  }

  return {
    type: "text",
    required: field.required,
    label: field.label,
    format: field.control === "longText" ? "longText" : field.format,
    suggestions: field.suggestions ? [...field.suggestions] : undefined,
  };
}

function toPublicOperationFieldOptions(
  field: AstryxProjectedSitePublicOperationInputFieldNode,
): FormlessUiFieldOptions | undefined {
  if (field.control === "enum") {
    return {
      enumOptions: (field.options ?? []).map((option) => ({
        label: option.label,
        presentation: {
          color: {
            intent: "neutral",
            known: false,
          },
          label: option.label,
        },
        value: option.value,
      })),
    };
  }

  if (field.suggestions?.length) {
    return {
      referenceOptions: field.suggestions.map((suggestion) => ({
        id: suggestion,
        label: suggestion,
      })),
    };
  }

  return undefined;
}

function toPublicOperationFieldControl(
  field: AstryxProjectedSitePublicOperationInputFieldNode,
  fieldSchema: FieldSchema,
): FormlessUiFieldControl {
  const common = {
    createDefaultChecked: false,
    createDefaultValue: undefined,
    inputAttributes: publicOperationInputAttributes(fieldSchema),
    label: field.label,
    required: field.required,
  };

  if (fieldSchema.type === "boolean") {
    return {
      ...common,
      control: { kind: "checkbox" },
      controlKind: "checkbox",
      editor: "boolean",
      field: fieldSchema,
      kind: "boolean",
    };
  }

  if (fieldSchema.type === "date") {
    return {
      ...common,
      control: { kind: "input", inputType: "date" },
      controlKind: "date",
      editor: "date",
      field: fieldSchema,
      kind: "date",
    };
  }

  if (fieldSchema.type === "number") {
    return {
      ...common,
      control: { kind: "formattedNumber" },
      controlKind: "number",
      editor: "number",
      field: fieldSchema,
      kind: "number",
    };
  }

  if (fieldSchema.type === "enum") {
    return {
      ...common,
      control: { kind: "select" },
      controlKind: "select",
      editor: "enum",
      field: fieldSchema,
      kind: "enum",
    };
  }

  const textField = fieldSchema as Extract<FieldSchema, { type: "text" }>;

  return {
    ...common,
    control:
      field.control === "longText" ? { kind: "textarea" } : { kind: "input", inputType: "text" },
    controlKind: field.control === "longText" ? "textarea" : "text",
    editor: field.control === "longText" ? "textarea" : "text",
    field: textField,
    kind: "text",
  };
}

function toPublicOperationInput(
  field: AstryxProjectedSitePublicOperationInputFieldNode,
): PublicSafeOperationInputField {
  return {
    name: field.name,
    label: field.label,
    required: field.required,
    control: field.control,
    format: field.format,
    suggestions: field.suggestions ? [...field.suggestions] : undefined,
    options: field.options?.map((option) => ({
      value: option.value,
      label: option.label,
    })),
  };
}

function publicOperationFieldAccess(isDisabled: boolean): FormlessUiFieldAccess {
  if (isDisabled) {
    return { kind: "disabled", canPatch: false, writable: true };
  }

  return { kind: "editable", canPatch: true, writable: true };
}

function publicOperationInputAttributes(field: FieldSchema): FieldInputAttributes {
  if (field.type !== "number") {
    return {};
  }

  return {
    max: field.max,
    min: field.min,
    step: field.integer ? "1" : "any",
  };
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

function publicTextInputElementProps(field: ProjectedPublicOperationFieldData) {
  const format = field.field.type === "text" ? field.field.format : undefined;

  return {
    inputMode: format === "phone" ? "tel" : undefined,
    pattern: format === "phone" ? "[0-9+() -]*" : undefined,
  } satisfies Record<string, string | undefined>;
}

function publicSelectorOptions(
  options: NonNullable<FormlessUiFieldOptions["enumOptions"]>,
): SelectorOptionData[] {
  return options.map((option) => ({
    label: option.label,
    value: option.value,
  }));
}

function publicSuggestionItems(
  options: NonNullable<FormlessUiFieldOptions["referenceOptions"]>,
): PublicSuggestionItem[] {
  return options.map((option) => ({
    id: option.id,
    label: option.label,
    auxiliaryData: {
      value: option.id,
    },
  }));
}

function publicSuggestionItemValue(item: PublicSuggestionItem) {
  return item.auxiliaryData?.value ?? item.id;
}

function publicOperationFieldControlName(field: ProjectedPublicOperationFieldData) {
  return field.input.control;
}

function publicDateInputValue(value: string): ISODateInputValue | undefined {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? (value as ISODateInputValue) : undefined;
}

function publicNumberInputValue(input: GeneratedFieldDraftInput | undefined) {
  const value = input?.value;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function formatPublicFieldValue(input: GeneratedFieldDraftInput | undefined) {
  return String(input?.value ?? "");
}

function publicDraftInputFromValue(value: PublicOperationDraftValue): GeneratedFieldDraftInput {
  if (typeof value === "boolean" || typeof value === "number") {
    return { kind: "value", value };
  }

  return { kind: "input", value };
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
