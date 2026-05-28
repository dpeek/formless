## ADDED Requirements

### Requirement: Contact Subscription Records

The system SHALL model contacts, email addresses, audiences, and subscriptions
as flat records suitable for generated admin surfaces and future CRM workflows.

#### Scenario: Flat contact subscription model

- **WHEN** contact subscription records are stored
- **THEN** contact, email address, audience, and subscription state are represented by normal flat entity records
- **AND** relationships are represented by reference fields rather than nested stored data

#### Scenario: Unique email address

- **WHEN** an email address record is created or updated
- **THEN** the normalized email address is unique within the app storage identity

#### Scenario: Unique subscription membership

- **WHEN** a subscription record is created or updated
- **THEN** the email address and audience pair is unique within the app storage identity

### Requirement: Default Audience

The system SHALL provide a default audience for Site subscribe forms before
topics or segments exist.

#### Scenario: Subscribe without explicit audience

- **WHEN** a subscribe action is submitted without an explicit audience
- **THEN** the action writes or reuses the default audience for the target storage identity
- **AND** the subscription references that audience

### Requirement: Subscribe Action

The system SHALL provide a public subscribe action that upserts reusable contact
subscription records from a visitor email address.

#### Scenario: New email subscribes

- **WHEN** a visitor submits a valid email address through the subscribe action
- **THEN** the runtime creates or reuses a contact record
- **AND** creates or reuses an email address record with a normalized address
- **AND** creates or updates a subscription record with status `subscribed`

#### Scenario: Duplicate email subscribes again

- **WHEN** a visitor submits an email address that already has a subscription for the target audience
- **THEN** the runtime keeps one email address record and one subscription record for that email-address audience pair
- **AND** the action returns a successful subscribed outcome

#### Scenario: Resubscribe after unsubscribe state

- **WHEN** a visitor submits an email address whose subscription status is `unsubscribed`
- **THEN** the runtime updates the subscription status to `subscribed`
- **AND** records the new consent timestamp

### Requirement: Subscription Consent Source

The system SHALL preserve source context for public subscription consent.

#### Scenario: Source fields are written

- **WHEN** a public subscribe action commits a subscription
- **THEN** the subscription records the source kind, target app storage identity, action name, request host, request path, and Site block id when available

#### Scenario: Raw visitor network data is not required

- **WHEN** a public subscribe action commits a subscription
- **THEN** raw IP address and user-agent values are not required subscription fields

### Requirement: Subscription Admin Surface

The system SHALL expose collected email addresses and subscription state through
generated admin screens.

#### Scenario: Owner reviews subscribers

- **WHEN** the Site app admin surface renders contact subscription data
- **THEN** the owner can inspect email addresses, audiences, subscription status, consent time, and source context
- **AND** the public Site renderer does not expose the subscriber list
