import {
  useId,
  useMemo,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { MarkdownRenderer } from "@dpeek/formless-ui/markdown-renderer";
import { SvgIcon } from "@dpeek/formless-ui/svg-icon";

import {
  SiteFooter,
  SiteFooterSection,
  SiteFooterSocialSection,
  SiteHeader,
  SiteHeaderNavGroup,
} from "./chrome.tsx";
import { displayLabel, PlainText } from "./display.tsx";
import { SiteLinkBlock, blockHref, siteLinkRel, siteLinkTarget } from "./link-rendering.tsx";
import {
  ImageBlock,
  PrimaryImage,
  imagePlacements,
  primaryImagePlacement,
  slottedImagePlacements,
} from "./media.tsx";
import { PagePlacementFlow, useSitePageLinkMode, useSitePageRouteBase } from "./page.tsx";
import { TurnstileChallenge } from "./turnstile.tsx";
import {
  createSitePublicFormSessionController,
  type SitePublicFormField,
  type SitePublicFormFieldValue,
  type SitePublicFormSession,
  type SitePublicFormSessionController,
} from "../public-form-session.ts";
import type { SiteBlockNode, SitePlacementNode } from "../types.ts";

const FEATURE_MEDIA_SLOT = "media";
const FEATURE_ACTIONS_SLOT = "actions";
const siteMarkdownLinkClassName =
  "[&_a]:text-[color:var(--site-link)] [&_a]:decoration-[color:var(--site-link-decoration)] [&_a]:underline-offset-4 [&_a:hover]:decoration-[color:var(--site-link)]";
const siteFormInputClassName =
  "min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-950 shadow-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-500 dark:focus:ring-zinc-800 dark:disabled:bg-zinc-900";
const siteFormTextareaClassName =
  "min-h-32 rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 shadow-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-500 dark:focus:ring-zinc-800 dark:disabled:bg-zinc-900";

export const sitePageRendererParts = {
  Footer: SiteRendererFooter,
  Header: SiteRendererHeader,
  Placement: SitePlacementRenderer,
  PrimaryImage,
};

function SiteRendererHeader({ block }: { block: SiteBlockNode }) {
  return <SiteHeader block={block} Placement={SitePlacementRenderer} />;
}

function SiteRendererFooter({ block }: { block: SiteBlockNode }) {
  return <SiteFooter block={block} Placement={SitePlacementRenderer} />;
}

function SitePlacementRenderer({ placement }: { placement: SitePlacementNode }) {
  return <SiteBlockRenderer block={placement.block} placement={placement} />;
}

function SiteBlockRenderer({
  block,
  placement,
}: {
  block: SiteBlockNode;
  placement?: SitePlacementNode;
}) {
  switch (block.type) {
    case "page":
      return <PageBlock block={block} />;
    case "header":
      return <SiteRendererHeader block={block} />;
    case "headerPrimary":
    case "headerSecondary":
      return <SiteHeaderNavGroup block={block} Placement={SitePlacementRenderer} />;
    case "footer":
      return <SiteRendererFooter block={block} />;
    case "footerSection":
      return <SiteFooterSection block={block} Placement={SitePlacementRenderer} />;
    case "footerSocial":
      return <SiteFooterSocialSection block={block} />;
    case "group":
      return <GroupBlock block={block} placement={placement} />;
    case "hero":
      return <HeroBlock block={block} />;
    case "feature":
      return <FeatureBlock block={block} />;
    case "section":
      return <SectionBlock block={block} />;
    case "cardGrid":
      return <CardGridBlock block={block} />;
    case "card":
      return <CardBlock block={block} />;
    case "metricGrid":
      return <MetricGridBlock block={block} />;
    case "metric":
      return <MetricBlock block={block} />;
    case "markdown":
      return <MarkdownBlock block={block} />;
    case "link":
      return <SiteLinkBlock block={block} placement={placement} />;
    case "image":
      return <ImageBlock block={block} />;
    case "subscribeForm":
      return <SubscribeFormBlock block={block} />;
    case "contactForm":
      return <ContactFormBlock block={block} />;
    case "publicOperationForm":
      return <PublicOperationFormBlock block={block} />;
    case "postList":
    case "projectList":
      return <ContentListBlock block={block} />;
    case "post":
    case "project":
      return <ContentSummary block={block} />;
    default:
      return null;
  }
}

function PageBlock({ block }: { block: SiteBlockNode }) {
  return <PagePlacementFlow page={block} Placement={SitePlacementRenderer} />;
}

function GroupBlock({ block, placement }: { block: SiteBlockNode; placement?: SitePlacementNode }) {
  return (
    <section className="space-y-4" data-block-type={block.type}>
      <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
        {displayLabel(block, placement)}
      </h2>
      {block.body ? (
        <PlainText text={block.body} className="text-sm text-zinc-600 dark:text-zinc-300" />
      ) : null}
      {block.placements.map((placement) => (
        <SitePlacementRenderer key={placement.id} placement={placement} />
      ))}
    </section>
  );
}

function HeroBlock({ block }: { block: SiteBlockNode }) {
  const media = imagePlacements(block);
  const claimed = placementIdSet(media);

  return (
    <section className="grid items-center gap-8 py-4 md:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-5">
        <h1 className="text-5xl font-semibold tracking-normal text-zinc-950 dark:text-zinc-50">
          {block.label}
        </h1>
        {block.body ? (
          <PlainText text={block.body} className="text-base text-zinc-600 dark:text-zinc-300" />
        ) : null}
      </div>
      {media.length > 0 ? (
        <div className="grid gap-4">
          {media.map((placement) => (
            <SitePlacementRenderer key={placement.id} placement={placement} />
          ))}
        </div>
      ) : null}
      {renderUnclaimedPlacements(block, claimed)}
    </section>
  );
}

function FeatureBlock({ block }: { block: SiteBlockNode }) {
  const media = slottedImagePlacements(block, FEATURE_MEDIA_SLOT);
  const actions = slottedPlacements(block, FEATURE_ACTIONS_SLOT, "link");
  const defaultPlacements = block.placements.filter(isDefaultPlacement);
  const mediaSide = featureMediaSide(block);
  const mediaNode =
    media.length > 0 ? (
      <div className="grid gap-4" data-site-feature-media>
        {media.map((placement) => (
          <SitePlacementRenderer key={placement.id} placement={placement} />
        ))}
      </div>
    ) : null;
  const contentNode = (
    <div className="space-y-4">
      <div className="space-y-3">
        <h2 className="text-3xl font-semibold tracking-normal text-zinc-950 dark:text-zinc-50">
          {block.label}
        </h2>
        {block.body ? (
          <MarkdownRenderer
            className={`text-base leading-7 text-zinc-700 dark:text-zinc-300 ${siteMarkdownLinkClassName}`}
            content={block.body}
            minHeadingLevel={3}
          />
        ) : null}
      </div>
      {actions.length > 0 ? (
        <nav
          aria-label={`${block.label} actions`}
          className="flex flex-col gap-3"
          data-site-feature-actions
        >
          <SitePlacementList placements={actions} />
        </nav>
      ) : null}
    </div>
  );

  return (
    <section
      className="space-y-5"
      data-block-type={block.type}
      data-site-feature-alignment={mediaSide}
    >
      {mediaNode ? (
        <div
          className={
            mediaSide === "left"
              ? "grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:items-center"
              : "grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:items-center"
          }
        >
          {mediaSide === "left" ? (
            <>
              {mediaNode}
              {contentNode}
            </>
          ) : (
            <>
              {contentNode}
              {mediaNode}
            </>
          )}
        </div>
      ) : (
        <div className="max-w-3xl">{contentNode}</div>
      )}
      {defaultPlacements.map((placement) => (
        <SitePlacementRenderer key={placement.id} placement={placement} />
      ))}
    </section>
  );
}

function SectionBlock({ block }: { block: SiteBlockNode }) {
  return (
    <section
      className="space-y-6 rounded-md border border-zinc-200 bg-zinc-50/70 p-6 dark:border-zinc-800 dark:bg-zinc-900/35"
      data-block-type={block.type}
      data-site-section
    >
      <div className="max-w-3xl space-y-3">
        <h2 className="text-3xl font-semibold tracking-normal text-zinc-950 dark:text-zinc-50">
          {block.label}
        </h2>
        {block.body ? (
          <MarkdownRenderer
            className={`text-base leading-7 text-zinc-700 dark:text-zinc-300 ${siteMarkdownLinkClassName}`}
            content={block.body}
            minHeadingLevel={3}
          />
        ) : null}
      </div>
      {renderUnclaimedPlacements(block)}
    </section>
  );
}

function CardGridBlock({ block }: { block: SiteBlockNode }) {
  return (
    <section className="space-y-4" data-block-type={block.type}>
      <ContentBlockHeading block={block} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-site-card-grid>
        {renderUnclaimedPlacements(block)}
      </div>
    </section>
  );
}

function CardBlock({ block }: { block: SiteBlockNode }) {
  return (
    <article
      className="h-full space-y-3 rounded-md border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      data-block-type={block.type}
      data-site-card
      style={blockAccentStyle(block)}
    >
      {block.icon ? (
        <div
          className="flex size-9 items-center justify-center rounded-md bg-zinc-100 text-[color:var(--site-block-accent,var(--site-link))] dark:bg-zinc-800"
          data-site-card-icon
        >
          <SvgIcon className="size-5" source={block.icon} />
        </div>
      ) : null}
      <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">{block.label}</h3>
      {block.body ? (
        <MarkdownRenderer
          className={`text-sm leading-6 text-zinc-600 dark:text-zinc-300 ${siteMarkdownLinkClassName}`}
          content={block.body}
          minHeadingLevel={4}
        />
      ) : null}
    </article>
  );
}

function MetricGridBlock({ block }: { block: SiteBlockNode }) {
  return (
    <section className="space-y-4" data-block-type={block.type}>
      <ContentBlockHeading block={block} />
      <div
        className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-4"
        data-site-metric-grid
      >
        {renderUnclaimedPlacements(block)}
      </div>
    </section>
  );
}

function MetricBlock({ block }: { block: SiteBlockNode }) {
  return (
    <div
      className="rounded-md border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
      data-block-type={block.type}
      data-site-metric
      style={blockAccentStyle(block)}
    >
      <p className="text-3xl font-semibold tracking-normal text-[color:var(--site-block-accent,var(--site-link))]">
        {block.label}
      </p>
      {block.body ? (
        <MarkdownRenderer
          className={`mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300 ${siteMarkdownLinkClassName}`}
          content={block.body}
          minHeadingLevel={4}
        />
      ) : null}
    </div>
  );
}

function ContentBlockHeading({ block }: { block: SiteBlockNode }) {
  const hasHeading = block.label || block.body;

  if (!hasHeading) {
    return null;
  }

  return (
    <div className="max-w-3xl space-y-2">
      {block.label ? (
        <h2 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{block.label}</h2>
      ) : null}
      {block.body ? (
        <MarkdownRenderer
          className={`text-base leading-7 text-zinc-700 dark:text-zinc-300 ${siteMarkdownLinkClassName}`}
          content={block.body}
          minHeadingLevel={3}
        />
      ) : null}
    </div>
  );
}

function MarkdownBlock({ block }: { block: SiteBlockNode }) {
  return (
    <section className="max-w-3xl space-y-3">
      {block.label && block.label !== "Body" ? (
        <h2 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{block.label}</h2>
      ) : null}
      {block.body ? (
        <MarkdownRenderer
          className={`text-base leading-7 text-zinc-700 dark:text-zinc-300 ${siteMarkdownLinkClassName}`}
          content={block.body}
          minHeadingLevel={2}
        />
      ) : null}
      {renderUnclaimedPlacements(block)}
    </section>
  );
}

function SubscribeFormBlock({ block }: { block: SiteBlockNode }) {
  const emailInputId = useId();
  const { controller, session } = useLegacySitePublicFormSession(block);
  const email = requiredPublicFormField(session, "email");

  if (session.status === "unavailable") {
    return (
      <section className="max-w-xl space-y-3" data-block-type={block.type}>
        <PublicFormHeading session={session} />
        <UnavailablePublicFormFeedback session={session} />
      </section>
    );
  }

  const publicOperation = requiredPublicFormOperation(block);
  const challenge = requiredPublicFormChallenge(session);
  const validationMessage = email.error ? "Complete the email and challenge." : undefined;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await controller.dispatch(session.submit.intent);
  }

  return (
    <section className="max-w-xl space-y-4" data-block-type={block.type}>
      <PublicFormHeading session={session} />
      <form
        action={publicOperation.route}
        className="space-y-3"
        data-site-subscribe-form={block.id}
        data-site-subscribe-route={publicOperation.route}
        method="post"
        onSubmit={onSubmit}
      >
        <label className="grid gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-200">
          <span>Email</span>
          <input
            aria-describedby={email.error ? `${emailInputId}-error` : undefined}
            aria-invalid={email.error ? true : undefined}
            className={siteFormInputClassName}
            disabled={email.disabled}
            id={emailInputId}
            name="email"
            onChange={(event) =>
              dispatchPublicFormField(controller, email, event.currentTarget.value)
            }
            required={email.required}
            type="email"
            value={publicFormTextValue(email.value)}
          />
        </label>
        <PublicFormFieldError error={email.error} id={`${emailInputId}-error`} />
        <TurnstileChallenge
          onTokenChange={(token) =>
            void controller.dispatch({ ...challenge.tokenChangeIntent, token })
          }
          resetSignal={challenge.resetSignal}
          siteKey={challenge.siteKey}
        />
        <button
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-300"
          disabled={session.disabled}
          type="submit"
        >
          {session.status === "submitting" ? session.submit.pendingLabel : session.submit.label}
        </button>
        <PublicFormOutcome session={session} validationMessage={validationMessage} />
      </form>
    </section>
  );
}

function ContactFormBlock({ block }: { block: SiteBlockNode }) {
  const nameInputId = useId();
  const emailInputId = useId();
  const messageInputId = useId();
  const { controller, session } = useLegacySitePublicFormSession(block);
  const name = requiredPublicFormField(session, "name");
  const email = requiredPublicFormField(session, "email");
  const message = requiredPublicFormField(session, "message");

  if (session.status === "unavailable") {
    return (
      <section className="max-w-2xl space-y-3" data-block-type={block.type}>
        <PublicFormHeading session={session} />
        <UnavailablePublicFormFeedback session={session} />
      </section>
    );
  }

  const publicOperation = requiredPublicFormOperation(block);
  const challenge = requiredPublicFormChallenge(session);
  const validationMessage = session.fields.some((field) => field.error)
    ? "Complete the form and challenge."
    : undefined;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await controller.dispatch(session.submit.intent);
  }

  return (
    <section className="max-w-2xl space-y-4" data-block-type={block.type}>
      <PublicFormHeading session={session} />
      <form
        action={publicOperation.route}
        className="grid gap-4"
        data-site-contact-form={block.id}
        data-site-contact-route={publicOperation.route}
        method="post"
        onSubmit={onSubmit}
      >
        <FixedPublicFormField controller={controller} field={name} inputId={nameInputId} />
        <FixedPublicFormField controller={controller} field={email} inputId={emailInputId} />
        <FixedPublicFormField controller={controller} field={message} inputId={messageInputId} />
        <TurnstileChallenge
          onTokenChange={(token) =>
            void controller.dispatch({ ...challenge.tokenChangeIntent, token })
          }
          resetSignal={challenge.resetSignal}
          siteKey={challenge.siteKey}
        />
        <button
          className="inline-flex min-h-11 w-fit items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-300"
          disabled={session.disabled}
          type="submit"
        >
          {session.status === "submitting" ? session.submit.pendingLabel : session.submit.label}
        </button>
        <PublicFormOutcome session={session} validationMessage={validationMessage} />
      </form>
    </section>
  );
}

function PublicOperationFormBlock({ block }: { block: SiteBlockNode }) {
  const formInputIdPrefix = useId();
  const { controller, session } = useLegacySitePublicFormSession(block);

  if (session.status === "unavailable") {
    return (
      <section className="max-w-2xl space-y-3" data-block-type={block.type}>
        <PublicFormHeading session={session} />
        <UnavailablePublicFormFeedback session={session} />
      </section>
    );
  }

  const publicOperation = requiredPublicFormOperation(block);
  const challenge = requiredPublicFormChallenge(session);
  const validationMessage = session.fields.find((field) => field.error)?.error;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await controller.dispatch(session.submit.intent);
  }

  return (
    <section className="max-w-2xl space-y-4" data-block-type={block.type}>
      <PublicFormHeading session={session} />
      <form
        action={publicOperation.route}
        className="grid gap-4"
        data-site-public-operation-form={block.id}
        data-site-public-operation-key={publicOperation.canonicalKey}
        data-site-public-operation-route={publicOperation.route}
        method="post"
        noValidate
        onSubmit={onSubmit}
      >
        {session.fields.map((field) => (
          <PublicOperationInputField
            controller={controller}
            field={field}
            inputId={`${formInputIdPrefix}-${field.name}`}
            key={field.name}
          />
        ))}
        <TurnstileChallenge
          onTokenChange={(token) =>
            void controller.dispatch({ ...challenge.tokenChangeIntent, token })
          }
          resetSignal={challenge.resetSignal}
          siteKey={challenge.siteKey}
        />
        <button
          className="inline-flex min-h-11 w-fit items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-300"
          disabled={session.disabled}
          type="submit"
        >
          {session.status === "submitting" ? session.submit.pendingLabel : session.submit.label}
        </button>
        <PublicFormOutcome session={session} validationMessage={validationMessage} />
      </form>
    </section>
  );
}

function PublicFormHeading({ session }: { session: SitePublicFormSession }) {
  return (
    <div className="space-y-2">
      <h2 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{session.heading}</h2>
      {session.body ? (
        <MarkdownRenderer
          className={`text-base leading-7 text-zinc-700 dark:text-zinc-300 ${siteMarkdownLinkClassName}`}
          content={session.body}
          minHeadingLevel={3}
        />
      ) : null}
    </div>
  );
}

function PublicOperationInputField({
  controller,
  field,
  inputId,
}: {
  controller: SitePublicFormSessionController;
  field: SitePublicFormField;
  inputId: string;
}) {
  const errorId = field.error === undefined ? undefined : `${inputId}-error`;

  if (field.control === "boolean") {
    return (
      <div className="grid gap-1" data-site-public-operation-field={field.name}>
        <label
          className="flex items-center gap-3 text-sm font-medium text-zinc-700 dark:text-zinc-200"
          htmlFor={inputId}
        >
          <input
            aria-describedby={errorId}
            aria-invalid={field.error === undefined ? undefined : true}
            checked={field.value === true}
            className="size-4 rounded border-zinc-300 text-zinc-950 focus:ring-zinc-300 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-700"
            disabled={field.disabled}
            id={inputId}
            name={field.name}
            onChange={(event) =>
              dispatchPublicFormField(controller, field, event.currentTarget.checked)
            }
            type="checkbox"
            value="true"
          />
          <span>{field.label}</span>
        </label>
        <PublicFormFieldError error={field.error} id={errorId} />
      </div>
    );
  }

  return (
    <label
      className="grid gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-200"
      data-site-public-operation-field={field.name}
      htmlFor={inputId}
    >
      <span>{field.label}</span>
      {renderPublicOperationInputControl({
        controller,
        describedBy: errorId,
        field,
        inputId,
      })}
      <PublicFormFieldError error={field.error} id={errorId} />
    </label>
  );
}

function renderPublicOperationInputControl({
  controller,
  describedBy,
  field,
  inputId,
}: {
  controller: SitePublicFormSessionController;
  describedBy?: string;
  field: SitePublicFormField;
  inputId: string;
}) {
  switch (field.control) {
    case "longText":
      return (
        <textarea
          aria-describedby={describedBy}
          aria-invalid={field.error === undefined ? undefined : true}
          className={siteFormTextareaClassName}
          data-site-public-operation-control="longText"
          disabled={field.disabled}
          id={inputId}
          name={field.name}
          onChange={(event) =>
            dispatchPublicFormField(controller, field, event.currentTarget.value)
          }
          value={publicFormTextValue(field.value)}
        />
      );
    case "enum":
      return (
        <select
          aria-describedby={describedBy}
          aria-invalid={field.error === undefined ? undefined : true}
          className={siteFormInputClassName}
          data-site-public-operation-control="enum"
          disabled={field.disabled}
          id={inputId}
          name={field.name}
          onChange={(event) =>
            dispatchPublicFormField(controller, field, event.currentTarget.value)
          }
          value={publicFormTextValue(field.value)}
        >
          <option disabled={field.required} value="">
            Select...
          </option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    case "date":
      return (
        <input
          aria-describedby={describedBy}
          aria-invalid={field.error === undefined ? undefined : true}
          className={siteFormInputClassName}
          data-site-public-operation-control="date"
          disabled={field.disabled}
          id={inputId}
          name={field.name}
          onChange={(event) =>
            dispatchPublicFormField(controller, field, event.currentTarget.value)
          }
          type="date"
          value={publicFormTextValue(field.value)}
        />
      );
    case "number":
      return (
        <input
          aria-describedby={describedBy}
          aria-invalid={field.error === undefined ? undefined : true}
          className={siteFormInputClassName}
          data-site-public-operation-control="number"
          disabled={field.disabled}
          id={inputId}
          inputMode="decimal"
          name={field.name}
          onChange={(event) =>
            dispatchPublicFormField(controller, field, event.currentTarget.value)
          }
          type="text"
          value={publicFormTextValue(field.value)}
        />
      );
    case "text":
    default:
      return renderPublicOperationTextInput({
        controller,
        describedBy,
        field,
        inputId,
      });
  }
}

function renderPublicOperationTextInput({
  controller,
  describedBy,
  field,
  inputId,
}: {
  controller: SitePublicFormSessionController;
  describedBy?: string;
  field: SitePublicFormField;
  inputId: string;
}) {
  const suggestionsId =
    field.suggestions && field.suggestions.length > 0 ? `${inputId}-suggestions` : undefined;
  const type = field.format === "email" ? "email" : field.format === "phone" ? "tel" : "text";

  return (
    <>
      <input
        aria-describedby={describedBy}
        aria-invalid={field.error === undefined ? undefined : true}
        className={siteFormInputClassName}
        data-site-public-operation-control="text"
        disabled={field.disabled}
        id={inputId}
        list={suggestionsId}
        name={field.name}
        onChange={(event) => dispatchPublicFormField(controller, field, event.currentTarget.value)}
        type={type}
        value={publicFormTextValue(field.value)}
      />
      {suggestionsId ? (
        <datalist id={suggestionsId}>
          {field.suggestions?.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}

function PublicFormFieldError({ error, id }: { error?: string; id?: string }) {
  return error === undefined ? null : (
    <p className="text-xs font-medium text-red-700 dark:text-red-300" id={id}>
      {error}
    </p>
  );
}

function FixedPublicFormField({
  controller,
  field,
  inputId,
}: {
  controller: SitePublicFormSessionController;
  field: SitePublicFormField;
  inputId: string;
}) {
  const errorId = field.error ? `${inputId}-error` : undefined;

  return (
    <label className="grid gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-200">
      <span>{field.label}</span>
      {field.control === "longText" ? (
        <textarea
          aria-describedby={errorId}
          aria-invalid={field.error ? true : undefined}
          className={siteFormTextareaClassName}
          disabled={field.disabled}
          id={inputId}
          name={field.name}
          onChange={(event) =>
            dispatchPublicFormField(controller, field, event.currentTarget.value)
          }
          required={field.required}
          value={publicFormTextValue(field.value)}
        />
      ) : (
        <input
          aria-describedby={errorId}
          aria-invalid={field.error ? true : undefined}
          className={siteFormInputClassName}
          disabled={field.disabled}
          id={inputId}
          name={field.name}
          onChange={(event) =>
            dispatchPublicFormField(controller, field, event.currentTarget.value)
          }
          required={field.required}
          type={field.format === "email" ? "email" : "text"}
          value={publicFormTextValue(field.value)}
        />
      )}
      <PublicFormFieldError error={field.error} id={errorId} />
    </label>
  );
}

function PublicFormOutcome({
  session,
  validationMessage,
}: {
  session: SitePublicFormSession;
  validationMessage?: string;
}) {
  if (session.feedback?.kind === "success") {
    return (
      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
        {session.feedback.message}
      </p>
    );
  }

  const failureMessage =
    session.feedback?.kind === "failure" ? session.feedback.message : validationMessage;

  return failureMessage ? (
    <p className="text-sm font-medium text-red-700 dark:text-red-300">{failureMessage}</p>
  ) : null;
}

function UnavailablePublicFormFeedback({ session }: { session: SitePublicFormSession }) {
  return session.feedback?.kind === "unavailable" ? (
    <p className="text-sm text-zinc-600 dark:text-zinc-300">{session.feedback.message}</p>
  ) : null;
}

function useLegacySitePublicFormSession(block: SiteBlockNode): {
  controller: SitePublicFormSessionController;
  session: SitePublicFormSession;
} {
  const controller = useMemo(() => createSitePublicFormSessionController({ block }), [block]);
  const session = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  return { controller, session };
}

function dispatchPublicFormField(
  controller: SitePublicFormSessionController,
  field: SitePublicFormField,
  value: SitePublicFormFieldValue,
): void {
  void controller.dispatch({ ...field.changeIntent, value });
}

function requiredPublicFormField(
  session: SitePublicFormSession,
  name: string,
): SitePublicFormField {
  const field = session.fields.find((candidate) => candidate.name === name);

  if (!field) {
    throw new Error(`Public ${session.kind} form is missing field "${name}".`);
  }

  return field;
}

function requiredPublicFormOperation(
  block: SiteBlockNode,
): NonNullable<SiteBlockNode["publicOperation"]> {
  if (!block.publicOperation) {
    throw new Error(`Public form block "${block.id}" is missing its operation.`);
  }

  return block.publicOperation;
}

function requiredPublicFormChallenge(session: SitePublicFormSession) {
  if (!session.challenge) {
    throw new Error(`Public form session "${session.formId}" is missing its challenge.`);
  }

  return session.challenge;
}

function publicFormTextValue(value: SitePublicFormFieldValue): string {
  return typeof value === "boolean" ? (value ? "true" : "false") : String(value);
}

function ContentListBlock({ block }: { block: SiteBlockNode }) {
  const items = block.query?.items ?? [];

  return (
    <section className="space-y-4" data-site-content-list={block.type}>
      {block.label ? (
        <h2 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{block.label}</h2>
      ) : null}
      {items.length > 0 ? (
        <div className="flex-col flex gap-4">
          {items.map((item) => (
            <ContentSummary key={item.id} block={item} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          No published {block.type === "projectList" ? "projects" : "posts"} yet.
        </p>
      )}
    </section>
  );
}

function ContentSummary({ block }: { block: SiteBlockNode }) {
  const linkMode = useSitePageLinkMode();
  const routeBase = useSitePageRouteBase();
  const href = blockHref(block, linkMode, routeBase);
  const primaryImage = primaryImagePlacement(block);
  const shouldRenderDate = Boolean(block.date && block.type !== "project");

  return (
    <article
      className="group relative rounded-md border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
      data-block-type={block.type}
    >
      {href ? (
        <a
          aria-label={block.label}
          className="absolute inset-0 z-10 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-600"
          data-site-summary-link={block.type}
          href={href}
          rel={siteLinkRel(href)}
          target={siteLinkTarget(href)}
        >
          <span className="sr-only">{block.label}</span>
        </a>
      ) : null}
      <div
        className={
          primaryImage
            ? "pointer-events-none relative z-20 grid gap-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:items-start md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]"
            : "pointer-events-none relative z-20 space-y-3"
        }
        data-site-summary-layout={primaryImage ? "media-start" : "text-only"}
      >
        {primaryImage ? (
          <div className="w-full max-w-md sm:max-w-none" data-site-summary-media>
            <PrimaryImage placement={primaryImage} variant="summary" />
          </div>
        ) : null}
        <div className="space-y-3" data-site-summary-content>
          {shouldRenderDate ? (
            <time
              className="block text-xs font-medium text-zinc-500 dark:text-zinc-400"
              dateTime={block.date}
            >
              {block.date}
            </time>
          ) : null}
          <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            <span
              className={
                href
                  ? "underline decoration-transparent underline-offset-4 group-hover:decoration-current"
                  : undefined
              }
            >
              {block.label}
            </span>
          </h3>
          <ContentSummaryBody block={block} />
        </div>
      </div>
    </article>
  );
}

function ContentSummaryBody({ block }: { block: SiteBlockNode }) {
  if (!block.body) {
    return null;
  }

  if (block.type === "project") {
    return (
      <MarkdownRenderer
        className={`text-sm text-zinc-600 dark:text-zinc-300 [&_a]:pointer-events-auto [&_a]:relative [&_a]:z-30 ${siteMarkdownLinkClassName}`}
        content={block.body}
        minHeadingLevel={4}
      />
    );
  }

  return <PlainText text={block.body} className="text-sm text-zinc-600 dark:text-zinc-300" />;
}

function SitePlacementList({ placements }: { placements: SitePlacementNode[] }) {
  return (
    <>
      {placements.map((placement) => (
        <SitePlacementRenderer key={placement.id} placement={placement} />
      ))}
    </>
  );
}

function renderUnclaimedPlacements(
  block: SiteBlockNode,
  claimed: Set<string> = new Set(),
): ReactNode {
  return block.placements
    .filter((placement) => !claimed.has(placement.id))
    .map((placement) => <SitePlacementRenderer key={placement.id} placement={placement} />);
}

function slottedPlacements(block: SiteBlockNode, slot: string, type: string): SitePlacementNode[] {
  return block.placements.filter(
    (placement) => placement.slot === slot && placement.block.type === type,
  );
}

function placementIdSet(placements: SitePlacementNode[]): Set<string> {
  return new Set(placements.map((placement) => placement.id));
}

function isDefaultPlacement(placement: SitePlacementNode): boolean {
  return !placement.slot;
}

function featureMediaSide(block: SiteBlockNode): "left" | "right" {
  return block.alignment === "right" ? "right" : "left";
}

function blockAccentStyle(block: SiteBlockNode): CSSProperties | undefined {
  return block.color
    ? ({
        "--site-block-accent": block.color,
      } as CSSProperties)
    : undefined;
}
