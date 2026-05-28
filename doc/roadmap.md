# Roadmap

Last updated: 2026-05-28

Purpose: backlog and ideas for possible next work.

This is not shipped behavior. Shipped behavior lives in `openspec/specs/*/spec.md`.

This is not a commitment. Work starts when a committed OpenSpec change owns
the work.

## Current Bias

- Prefer work that proves Formless as a schema-as-data app runtime.
- Treat installed app identity as the product app shape.
- Keep Site polish small unless it unlocks real publishing use.
- Keep data flat; compose in view/query layer.

## Complex Apps

Why:

- Formless needs more proof beyond Task, Estii, and Site.
- Complex app work stress-tests schema, relationships, generated UI, actions, and read models together.

Good next OpenSpec changes:

- Add one richer source app that is not Site-shaped.
- Exercise multi-screen workflows with related records.
- Use the existing action kind module seams when adding future schema-declared actions.
- Improve reference workflows and scoped creation.
- Expand schema-declared actions for non-Site use cases.
- Expand query/read-model capability only when a real app change needs it.
- Reuse collection result model slices when adding boards, dashboards, charts, or richer result presentations after one concrete app needs them.

Avoid:

- General platform abstraction without a source app forcing it.
- Deep computed graph work before simpler read-model gaps are exhausted.

## Site

Why:

- Site is the most complete product path today.
- Site polish can make authoring and publishing smoother without changing the core model.

Good next OpenSpec changes:

- First-run onboarding for standalone Site projects.
- Starter content and reset flows that are easier to trust.
- Small schema-backed theme settings.
- Better page, post, project, header, and footer authoring affordances.
- Media cleanup and replacement flows.
- Publish status, backup, and deploy feedback.

Avoid:

- Turning Formless into a general visual site builder.
- Large layout or theming systems before their schema ownership is clear.

## Direction: Authoring Ergonomics

Why:

- Generated UI is useful only when edits feel safe and direct.
- Better generic authoring helps both app and Site workstreams.
- Generated field authoring now centralizes render-ready editor facts, inline field commit helpers,
  and create-field authoring facts.

Good next OpenSpec changes:

- Draft edit sessions with save/cancel.
- Cross-field validation display.
- Destructive action confirmation.
- More predictable create defaults and scoped child creation.
- Better empty, loading, and error states.
- Import/export workflows for app data.
- Extend generated field authoring adapters only when a real app workflow needs new behavior.

Avoid:

- One-off UI fixes that cannot be expressed through schema or shared generated primitives.

## Runtime

Why:

- Current runtime pieces work locally and in Workers.
- Productization decides whether Formless can support real users and deployments.
- Product instance profile, default installed Site, generic bundled app installs, launch fixtures, portable archives, core-media-only archive restore, claimable instance workspaces, profile-based custom domains, brokered domain provider apply, provider redirects, explicit provider delete, and domain provider cleanup actions now exist.
- Shared runtime topology now centralizes runtime profile and route policy facts before auth, permissions, agent routes, or job routes attach to them.

Good next OpenSpec changes:

- Browser management UI for portable app and instance archives.
- Safer archive review and replacement UX.
- Browser management UI for core media assets.
- Video media assets on the core image asset spine.
- Keep media asset metadata separate from app-owned usage metadata such as Site alt text, caption, crop, focal point, slot, or poster override.
- Keep one core `mediaAsset` shape with media kind, status, provider, storage/provider id, dimensions, duration, and optional poster until separate lifecycles force split entities.
- Resolve video playback through Media module playback facts and an app-facing `MediaPlayer`; the first video adapter can use Cloudflare Stream behind that boundary.
- Add provider adapters behind the Media module instead of exposing provider-specific URLs directly to Site or other app records.
- Browser provider configuration and least-privilege credential setup.
- Direct Cloudflare domain CLI fallback retirement after remote runner use is proven.
- Wildcard domains when a concrete deployment needs them.
- Users and permissions.
- Multi-tenant account routing.
- Admin token and publish hardening.
- Snapshot, backup, and restore UX.
- Observability for Authority writes, sync, and publish.
- Cross-app references or queries when a real workflow needs them.
- Local/offline instance and instance sync after one deployment story works.

Avoid:

- Account or marketplace work before one deployment story is clear.
- Bidirectional sync before local and remote instance identity exists.
- New Site-specific owned media paths outside core media.
- Schema composition or true cross-app references before multiple non-media workflows need them.
- Custom HLS, DASH, captions, transcripts, analytics, or live streaming before a video OpenSpec change needs them.

## Direction: Public Actions And Contacts

Why:

- Public subscribe forms are the first concrete need for anonymous writes from
  deployed Sites.
- Public, authenticated, admin, system, and agent actions should share one
  action execution model instead of one-off endpoints.
- Contacts, email addresses, subscriptions, users, groups, and organizations
  will become one of the core unified data problems for Formless.

Good next OpenSpec changes:

- Prove `anonymous + Turnstile` public action execution through Site subscribe
  forms.
- Reuse public action policy for lead forms, feedback forms, invite requests,
  waitlists, comments, and other anonymous public inputs.
- Add authenticated action execution after passkey/session auth exists.
- Model user accounts as auth identities that can link to contacts instead of
  replacing contacts.
- Model organization and group membership as flat join records connected to
  contacts or user accounts.
- Promote contact subscription data into a shared CRM/contact capability only
  after cross-app references or an installed Contacts app needs it.
- Add topics, segments, unsubscribe, suppression, and preference-center records
  before outbound broadcasts.
- Add Cloudflare Email Service sending through queued broadcast jobs after the
  contact and subscription model can represent consent and suppression.
- Add Turnstile provisioning through deployment/runtime configuration after the
  Cloudflare account/token boundary is clear.

Avoid:

- Hard-wiring Turnstile into Site block types instead of action policy.
- Treating `subscriber` as a durable core entity separate from contacts and
  email addresses.
- Sending broadcasts before unsubscribe, suppression, and delivery status are
  modeled.
- Building a cross-app contact store before one real workflow needs references
  across app storage identities.

## Direction: Extensibility

Why:

- Some app needs will not fit generated lists, tables, trees, and forms.
- Extensibility should preserve schema-as-data rather than bypass it.

Good next OpenSpec changes:

- Plugin view registry.
- Custom result presentations backed by schema-declared views.
- Extend collection result dispatch for schema-backed custom result presentations.
- App marketplace shape after source app packaging is stable.
- General media library after core image asset ownership rules need browser management.

Avoid:

- Arbitrary custom React escape hatches as the first extensibility story.

## Deployment

- migrate-domain-runner-to-deployments: CLI run-apply uses generic attempt APIs directly.
- add-wildcard-ingress: Add Ingress + runtime HostRoute coverage rules.
- retire-direct-domain-fallback: Remove duplicate direct Cloudflare apply path after the runner path is proven.

## Media

- media-video-support: add support for uploading and serving video using cloudflare's video APIs and player
