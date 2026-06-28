# Email Runtime Specification

## Purpose

Email runtime owns instance-scoped outbound email configuration, Cloudflare
Email Service deployment intent, queue-backed delivery handoff, and delivery
status records. It gives Site contact notifications one platform email
primitive without making the Site app own provider setup, provider-owned DNS
authentication, sender validation, or delivery evidence.

## Requirements

### Requirement: Instance Email Defaults

The system SHALL derive default email identity from the instance production
identity while allowing deployed preview instances to exist without email.

#### Scenario: Primary domain drives email defaults

- GIVEN an instance has selected a primary HTTP route for production identity
- WHEN email defaults are initialized
- THEN the default sending domain is derived from that route's host
- AND the default sending domain is a managed sending subdomain such as
  `mail.<primary-zone>` or `notify.<primary-zone>` unless the owner explicitly
  chooses an apex sender
- AND email links use the instance canonical origin selected for production
  identity rather than an arbitrary request host

#### Scenario: Workers.dev remains bootstrap-only

- GIVEN an instance has only a workers.dev deployment target
- WHEN the instance is deployed
- THEN deployment may succeed without a primary route or email domain
- AND production identity, canonical auth ceremonies, and default outbound
  email sending remain unavailable until the owner configures a primary route
  and email defaults

#### Scenario: Route is not email identity

- GIVEN the control plane stores route records for HTTP mount and redirect
  behavior
- WHEN email defaults are configured
- THEN email domains and senders are stored as email records that may reference
  the selected primary route
- AND route records are not overloaded with email-only behavior such as sender
  allowlists, SPF, DKIM, DMARC, bounce handling, or recipient verification state

### Requirement: Email Domain And Sender Records

The system SHALL model email configuration as flat instance-owned records.

#### Scenario: Email domain record

- GIVEN an owner enables outbound email for an instance
- WHEN the email domain intent is stored
- THEN an `email-domain` record stores enabled state, provider family, domain,
  deployment config reference, optional primary route reference, display-safe
  DNS or onboarding status, and latest display-safe error
- AND it does not store provider credentials, raw provider responses, raw DNS
  provider truth, API tokens, OAuth tokens, Alchemy state, or runtime secrets

#### Scenario: Email sender record

- GIVEN an email domain is configured
- WHEN sender intent is stored
- THEN an `email-sender` record stores address, display name, purpose, enabled
  state, and email domain reference
- AND the sender address host belongs to the referenced email domain

#### Scenario: Instance settings select defaults

- GIVEN multiple domain or sender records exist
- WHEN the runtime resolves platform email defaults
- THEN the singleton instance settings record selects the default email domain
  and default senders for contact notification and auth messages by stable
  record id
- AND the selected defaults are policy, not duplicated provider resource state

### Requirement: Cloudflare Email Deployment

The system SHALL deploy Cloudflare Email Service resources through the same
projected deployment pipeline used for other provider resources.

#### Scenario: Deploy outbound sending resources

- GIVEN an enabled Cloudflare `email-domain` record
- WHEN the deployer applies the desired resource graph
- THEN it provisions or adopts the Cloudflare Email Sending domain or subdomain
- AND it relies on Cloudflare Email Service onboarding to create and own the DNS
  records required for SPF, DKIM, bounce handling, and DMARC
- AND it binds a Worker `send_email` binding constrained to the enabled
  configured sender addresses for the onboarded domain
- AND the Email Sending domain and Worker binding resources are declared in
  tracked Alchemy state or an equivalent provider reconciler with stable
  logical ids

#### Scenario: Email Sending DNS is provider-owned

- GIVEN email deployment provisions or adopts a Cloudflare Email Sending domain
- WHEN Cloudflare creates or reports the required Email Sending DNS records
- THEN those records remain provider-owned and are not declared as Formless
  Alchemy DNS resources
- AND the deployer does not preflight, update, delete, or adopt those DNS
  records through generic Cloudflare DNS record reconciliation

#### Scenario: OAuth scope boundary

- GIVEN Cloudflare email resources are included in desired deployment state
- WHEN a deployer resolves a Formless-owned Cloudflare OAuth credential
- THEN the credential must include the Cloudflare permissions required for the
  selected Email Sending resources
- AND missing permissions fail provider reconciliation with a display-safe
  observation rather than falling back to broad manual credentials

### Requirement: Outbound Delivery

The system SHALL send email through a platform delivery primitive instead of
app-specific provider calls.

#### Scenario: Delivery record

- GIVEN runtime code schedules an email delivery
- WHEN the delivery intent is accepted
- THEN an `email-delivery` record stores the template or message kind, source
  storage identity, source operation or record id, idempotency key, sender,
  recipients, reply-to address, canonical origin, status, provider message id,
  latest display-safe error, and timestamps
- AND rendered subject, text, and HTML bodies are stored only in internal
  delivery state needed by the delivery attempt runtime
- AND public delivery records, snapshots, archives, public operation responses,
  and app records do not expose rendered provider message bodies
- AND it stores no raw provider credentials, OAuth tokens, Alchemy state,
  Turnstile proof values, or private challenge material

#### Scenario: Idempotent delivery

- GIVEN the same source event is retried with the same delivery purpose and
  idempotency key
- WHEN delivery is scheduled again
- THEN the runtime returns or advances the existing delivery record
- AND it does not send duplicate email for an already accepted provider
  delivery
- AND duplicate queue messages for an already accepted delivery no-op without
  calling the provider again

#### Scenario: Queue-backed delivery handoff

- GIVEN runtime code schedules an email delivery
- WHEN sender configuration and rendered message content are valid
- THEN the instance Authority creates or reuses the `email-delivery` record by
  idempotency scope
- AND the Authority enqueues one `email.delivery.send` runtime job on
  `FORMLESS_EMAIL_DELIVERY_QUEUE`
- AND the schedule path awaits the queue write before returning
- AND the schedule path does not wait for Cloudflare Email Sending provider
  delivery
- AND the queue message is a small envelope containing only schema version, job
  kind, job id, idempotency key, enqueue timestamp, target instance Authority
  name, and delivery id
- AND the queue message does not contain recipients, sender addresses, reply-to
  addresses, subject, text body, HTML body, provider credentials, Turnstile
  proof values, or private challenge material

#### Scenario: Queue consumer delivery attempt

- GIVEN the `email-delivery` queue delivers one or more `email.delivery.send`
  messages to the Formless Worker
- WHEN the queue consumer processes the batch
- THEN it routes each message to the instance Authority by delivery id for one
  delivery attempt
- AND the Authority reads the internal rendered message state, no-ops already
  accepted deliveries, marks attempt state before calling the provider, calls
  `FORMLESS_EMAIL.send()`, and records accepted or failed status with
  display-safe error text
- AND retryable provider failures mark the individual queue message for retry
  without forcing unrelated messages in the same batch to redeliver
- AND permanent runtime configuration failures mark the delivery failed and
  acknowledge the individual queue message
- AND accepted deliveries and permanent failures are terminal for that queue
  message

#### Scenario: Sender and reply-to validation

- GIVEN an app schedules outbound email
- WHEN the runtime builds the provider request
- THEN the `from` address is built from the configured email sender record
- AND user-supplied addresses may be used as `replyTo` only after field-level
  validation
- AND visitor or customer addresses are not spoofed as the sender address

#### Scenario: Template boundary

- GIVEN Site contact notification content is rendered
- WHEN the runtime prepares an outbound message
- THEN the message passes through the same delivery primitive as plain text and
  HTML bodies
- AND template rendering is separate from provider delivery

#### Scenario: Collaborator invitation delivery

- GIVEN the identity auth runtime schedules a collaborator invitation email
- WHEN default auth sender configuration and a production canonical origin are
  available
- THEN the invitation email is scheduled through the same idempotent outbound
  delivery primitive
- AND the delivery uses the configured auth sender, the identity storage
  identity as source storage, the invitation record id as source record, and an
  invitation-specific message kind
- AND public delivery records, queue messages, identity records, app records,
  snapshots, and archives do not expose the raw invite token, token hash,
  rendered email body, or provider response

#### Scenario: Missing collaborator invitation email configuration

- GIVEN collaborator invitation creation requires email delivery
- WHEN default auth sender configuration or production canonical origin is
  unavailable
- THEN no provider send is attempted with incomplete sender, recipient, or link
  origin configuration
- AND the runtime does not claim that an invitation email was delivered

### Requirement: Site Contact Notifications

The system SHALL use Site contact message submission as the first public
outbound email consumer.

#### Scenario: Contact message notification

- GIVEN a public Site contact form submits a valid contact message operation
- WHEN the contact message record is committed
- THEN the runtime may schedule one contact notification delivery to the
  configured contact recipient
- AND the notification uses the configured contact sender
- AND the visitor email is used as `replyTo`, not as the sender address
- AND the public operation response remains based on the contact message
  operation output rather than provider delivery internals

#### Scenario: Missing email configuration

- GIVEN a contact message operation succeeds but email defaults or contact
  notification recipient are not configured
- WHEN post-commit notification scheduling is evaluated
- THEN the contact message remains committed
- AND no provider send is attempted with incomplete sender, recipient, or email
  domain configuration
- AND public responses do not claim that email delivery occurred
