## Context

Formless already has schema-declared actions and action kind dispatch for
generated/admin workflows. Public Sites currently render read-only documents
from Site records while generic storage writes remain protected by owner session
or admin authorization.

Subscribe forms need a narrower path: an anonymous visitor should be able to
submit one validated action from a deployed Site without gaining access to
generic mutations, generic actions, schema writes, snapshots, resets, or admin
surfaces.

The first use case is a Turnstile-secured landing page subscribe form. The
larger pattern is public and authenticated action execution over the same
schema-as-data model.

## Goals / Non-Goals

**Goals:**

- Introduce an action access policy model that supports anonymous public
  execution before full auth exists.
- Add a public action execution envelope with actor, proof, source, input,
  idempotency, effects, and audit facts.
- Keep public execution on a narrow endpoint under the active app storage
  identity.
- Use Turnstile as a challenge guard for anonymous subscribe actions.
- Store contacts, normalized email addresses, default audience, and
  subscription consent as flat records.
- Render and author a Site `subscribeForm` block that binds to a declared
  public action.

**Non-Goals:**

- No user account, passkey, role, organization, or group implementation.
- No authenticated public actions beyond reserving policy vocabulary.
- No topics, segments, preference center, unsubscribe flow, or broadcast UI.
- No outbound Cloudflare Email Service sending.
- No cross-app references or shared instance-wide contact store.
- No public generic `/mutations` or `/actions` access.

## Decisions

### Public access belongs on actions

Action definitions get an access policy such as `admin`, `anonymous`, or
`authenticated`. The Site block binds to an action; it does not own the security
policy.

Alternative: put Turnstile and public handling directly on `subscribeForm`
blocks. That is quicker for one block type, but it creates a Site-only escape
hatch and does not help future lead forms, feedback forms, comments, or
authenticated actions.

### Public action execution uses a target-scoped endpoint

Add public action routes under the same storage identity prefixes used by the
app:

- schema-key preview: `/api/:schemaKey/public/actions/:actionName`
- installed app: `/api/app-installs/:packageAppKey/:installId/public/actions/:actionName`

Mapped public Site hosts may route the installed-app public action endpoint for
their target install while continuing to block admin shell and schema-key admin
APIs.

Alternative: use `/api/formless/subscribe`. That is easy to discover, but it
hard-codes a product-specific command outside the app schema.

### Execution envelope is explicit

Every public action request is normalized to an execution envelope:

- `actor`: `anonymous` for the first slice;
- `proof`: Turnstile token and verification result;
- `source`: host, path, app storage identity, Site block id, and action name;
- `input`: schema-validated public input;
- `idempotencyKey`: client-supplied or server-derived replay key;
- `effects`: committed flat records and action response;
- `audit`: created time and rejection reason when applicable.

Alternative: pass raw form data directly to the action runtime. That keeps code
small, but weakens validation, replay handling, tests, and later auth reuse.

### Turnstile is a challenge policy

Turnstile is selected by action access policy, not by the contact model. The
public action executor verifies the token server-side before writing. Missing
secret configuration, failed verification, expired tokens, or replayed tokens
fail closed and do not commit records.

The renderer only receives the public site key. The Turnstile secret stays in
runtime configuration or secret storage and is never embedded in public tree
responses, HTML, browser state, snapshots, or archives.

Alternative: require Turnstile globally for all anonymous actions. That is
secure by default, but too blunt for future low-risk public actions and local
development.

### Subscribe writes normal contact records

The subscribe action upserts reusable records:

- `contact`;
- `emailAddress`;
- `audience`;
- `subscription`.

`subscriber` is not a durable entity. A subscriber is an email address or
contact with an active subscription to an audience.

Alternative: store a single `subscriber` record with an email field. That is
the shortest path to a waitlist, but it creates migration work when the same
person becomes a CRM contact, customer, user, or organization member.

### Contacts live in the Site storage identity for the first slice

The first implementation adds contact subscription entities to the Site package
schema so a landing page owner can collect and inspect subscribers immediately.
The model stays generic enough to be promoted later to an instance-level contact
capability or shared CRM app when cross-app references exist.

Alternative: create a separate Contacts app install immediately. That is closer
to the long-term CRM model, but it requires cross-app writes or references
before the first subscribe form can ship.

## Risks / Trade-offs

- Public endpoints can accidentally bypass admin guards -> keep them separate
  from generic `/mutations` and `/actions`, require action access policy, and
  test protected endpoints remain protected.
- Turnstile setup can block local testing -> support explicit dev/test
  configuration and fail closed in production-like runtimes when secrets are
  missing.
- Duplicate email submissions can create noisy records -> normalize email
  addresses and enforce unique constraints for email and subscription keys.
- Contact model can overreach into CRM too early -> keep MVP fields minimal and
  put segments, topics, users, organizations, and groups in later roadmap work.
- Storing source context can collect too much visitor data -> store Site/action
  source facts and avoid raw IP/user-agent unless a later compliance need owns
  it.
- Broadcast needs unsubscribe and suppression semantics -> include status fields
  now, but defer sending and preference management to a later email change.

## Migration Plan

1. Extend shared schema types and parser support for public action access and
   public input contracts.
2. Add public action executor models, request parsing, Turnstile verification
   boundary, and target-scoped route handling.
3. Add contact subscription entities and the subscribe action kind to the Site
   package schema.
4. Add Site public tree projection and renderer support for `subscribeForm`.
5. Add generated Site authoring controls for subscribe form blocks.
6. Add tests proving generic protected writes remain protected while public
   subscribe execution can commit only the declared subscription records.
7. Run `devstate check`; run browser smoke because public Site behavior changes.

Rollback is schema-compatible for existing Site installs because the change adds
new entities and block variants. If public action routing is disabled, existing
Site rendering and admin writes continue to use the current protected paths.

## Open Questions

- Exact field name for the action access object: `access`, `execution`, or
  `policy`.
- Whether public action routes should accept action names, action binding ids,
  or both.
- Whether the first Turnstile provisioning path is automatic Cloudflare API
  widget creation or manual secret/site-key configuration.
- Whether subscription confirmation email is required before any future
  broadcast feature.
