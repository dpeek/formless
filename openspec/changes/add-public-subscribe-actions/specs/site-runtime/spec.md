## ADDED Requirements

### Requirement: Subscribe Form Block

The system SHALL support a Site `subscribeForm` block that binds public page
content to a schema-declared public subscribe action.

#### Scenario: Author subscribe form block

- **WHEN** a Site author creates a `subscribeForm` block
- **THEN** the block stores normal flat block fields for label, body, action name, and button label
- **AND** the block can be placed under public page and group composition branches

#### Scenario: Subscribe form variant is parsed

- **WHEN** the Site source schema is parsed
- **THEN** `subscribeForm` is a valid block type and union variant
- **AND** generated Site authoring exposes the fields needed to configure the form

### Requirement: Subscribe Form Public Tree Projection

The system SHALL project subscribe form blocks into public Site trees without
exposing private challenge or runtime secrets.

#### Scenario: Project subscribe form action facts

- **WHEN** the public Site tree includes a `subscribeForm` block
- **THEN** the projected block includes the public action name and target public action route
- **AND** the projected block does not include Turnstile secrets or subscriber data

#### Scenario: Warn for missing public action

- **WHEN** a `subscribeForm` block references an action that is missing or not publicly executable
- **THEN** the public tree includes a warning
- **AND** public rendering does not expose a working form for that block

### Requirement: Subscribe Form Rendering

The system SHALL render subscribe form blocks as public forms on preview,
installed, and mapped public Site routes.

#### Scenario: Render Turnstile-protected subscribe form

- **WHEN** a public Site page renders a valid `subscribeForm` block whose action requires Turnstile
- **THEN** the page renders an email input, submit control, and Turnstile widget using the public site key
- **AND** form submission posts to the target public action route with the email input, source block id, idempotency key, and Turnstile token

#### Scenario: Render successful subscribe outcome

- **WHEN** a public subscribe form submission succeeds
- **THEN** the public page shows the configured success state
- **AND** the visitor is not shown admin-only subscriber records
