## Why

Deployed Sites need a safe way to accept public visitor input without exposing
generic app mutations or admin action endpoints. A Turnstile-secured subscribe
form is the first concrete slice, and it should establish the action policy
model that later auth, contacts, CRM, and email broadcasts can reuse.

## What Changes

- Add a public action execution capability with explicit actor mode, challenge,
  origin, rate-limit, input validation, source context, idempotency, write, and
  audit semantics.
- Add contact subscription records for normalized email addresses, contacts,
  audiences, and subscription consent state.
- Add a Site `subscribeForm` block that renders a public form and binds to a
  schema-declared public action.
- Add Turnstile as an action challenge policy for anonymous public actions.
- Keep generic `/mutations` and `/actions` protected; public action execution
  uses a narrow public endpoint and only runs actions that declare compatible
  public access.
- Defer authenticated user accounts, permission roles, topics, segments,
  broadcast authoring, and outbound Cloudflare Email Service delivery to later
  changes.

## Capabilities

### New Capabilities

- `public-actions`: Public-safe schema action execution, action access policy,
  execution envelope, challenge validation, idempotency, source context, and
  narrow public API behavior.
- `contact-subscriptions`: Contact, email address, audience, subscription
  consent, and subscribe action records used by Site forms and future CRM/email
  workflows.

### Modified Capabilities

- `app-schema`: App schemas can declare action access policy and public input
  contracts without opening generic mutations to anonymous callers.
- `site-runtime`: Site schemas and public rendering support `subscribeForm`
  blocks that bind to public actions and carry Site source context.

## Impact

- Affects schema parsing and shared action models.
- Affects Authority or runtime write paths for one narrow public action endpoint.
- Affects Site source schema, Site public tree projection, public renderer, and
  generated Site authoring controls.
- Adds Turnstile configuration and verification boundaries without requiring
  auth to exist first.
- Adds contact/subscription source app schema, storage validation, generated
  admin views, and tests.
- Does not expose protected admin mutations/actions publicly.
- Does not send email broadcasts in this change.
