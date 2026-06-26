# Identity Control Plane Specification

## Purpose

Identity control plane defines the runtime-owned, reviewable identity records
for a Formless instance. It supplies common principal, email, group,
organization, role, membership, app registration, and invitation contracts while
keeping credentials, challenges, token hashes, sessions, grants, and provider
state outside reviewable app records.

## Requirements

### Requirement: Runtime-Owned Identity Schema

The system SHALL model instance identity facts as a separate runtime-owned App
schema source.

#### Scenario: Identity control-plane contract

- GIVEN the identity control-plane schema is loaded
- WHEN its storage identity is selected
- THEN it uses schema key `identity-control-plane`, boundary schema key `auth`,
  storage identity `instance:identity`, and API prefix `/api/formless/identity`
- AND it defines flat records for principals, principal emails, groups,
  organizations, memberships, roles, role assignments, app registrations, and
  invitations
- AND broad identity records are not added to the instance control-plane schema
  that owns app installs, routes, deployments, production identity, and email
  intent
- AND credentials, passkey challenges, email verification challenge secrets,
  invite token hashes, auth sessions, cross-domain grants, raw recovery
  material, and provider responses are not identity control-plane records

#### Scenario: Normal App schema provenance

- GIVEN the runtime loads the identity control-plane schema contract
- WHEN the schema is parsed for storage, generated UI, workspace, archive, or
  future sync workflows
- THEN it uses the normal App schema parser and App schema source hash rules
- AND entity, field, relationship, query, read model, view, screen, operation,
  and runtime metadata changes all affect identity schema provenance
- AND entity records remain flat Authority records with system-owned created
  and updated timestamps

#### Scenario: Identity package boundary

- GIVEN runtime, archive, workspace, generated UI, tests, or future auth
  runtime code needs identity-control-plane schema keys, storage identity
  constants, API route constants, entity names, role keys, schema contracts,
  record value contracts, validation helpers, or display-safe canonicalization
- WHEN those contracts are imported
- THEN they come from `@dpeek/formless-identity-control-plane`
- AND the package root remains runtime-neutral and does not import browser,
  React, Worker, provider SDK, filesystem, app package registry, or live
  network behavior

### Requirement: Principal And Email Records

The system SHALL represent every authenticated human or future service subject
as an instance-local principal.

#### Scenario: Principal record shape

- GIVEN the identity control-plane schema defines `principal`
- WHEN principal records are inspected
- THEN each principal stores display name, kind, and status as flat values
- AND supported first-pass principal kinds are `human` and `service`
- AND supported principal statuses are `active`, `invited`, and `disabled`
- AND owner is not a separate principal kind
- AND no passkey credential, password hash, OAuth token, session id, grant id,
  recovery secret, raw invite token, or provider response is stored on the
  principal record

#### Scenario: Principal email record shape

- GIVEN the identity control-plane schema defines `principal-email`
- WHEN principal email records are inspected
- THEN each principal email stores a principal reference, display email,
  normalized email, verification status, primary flag, recovery flag, and
  optional verified timestamp as flat values
- AND supported first-pass verification statuses are `unverified` and
  `verified`
- AND normalized active email values are unique within the instance identity
  storage
- AND email verification token hashes and challenge attempt state remain
  private auth runtime state

### Requirement: Groups, Organizations, And Memberships

The system SHALL model shared authorization containers and tenant/account
boundaries as flat identity records.

#### Scenario: Group and organization records

- GIVEN the identity control-plane schema defines `group` and `organization`
- WHEN those records are inspected
- THEN each record stores display name and status as flat values
- AND supported first-pass statuses are `active` and `disabled`
- AND groups act as permission containers
- AND organizations act as tenant or account containers
- AND neither record stores nested members, nested roles, credentials, sessions,
  provider state, or app-owned profile records

#### Scenario: Membership record shape

- GIVEN the identity control-plane schema defines `membership`
- WHEN a membership is created or patched
- THEN it stores one principal reference, one target kind, one target reference,
  and one status as flat values
- AND supported target kinds are `group` and `organization`
- AND the target reference resolves to the target kind selected by the record
- AND supported first-pass statuses are `active`, `invited`, and `disabled`
- AND active memberships are unique by principal, target kind, and selected
  target record
- AND membership facts do not duplicate app-specific account or profile records

### Requirement: Roles And Role Assignments

The system SHALL represent runtime-enforceable authorization as role records and
flat role assignment records.

#### Scenario: Runtime role vocabulary

- GIVEN the identity control-plane package exposes first-pass runtime role keys
- WHEN role keys are inspected
- THEN the supported role keys are `instance.owner`, `instance.admin`,
  `app.admin`, `app.editor`, `app.viewer`, and `app.user`
- AND app packages may model richer domain roles in their own app records later
- AND the identity control plane only ships role keys the runtime can enforce
  directly

#### Scenario: Role record shape

- GIVEN the identity control-plane schema defines `role`
- WHEN role records are inspected
- THEN each role stores a role key, display label, and status as flat values
- AND supported first-pass role statuses are `active` and `disabled`
- AND active role keys are unique within the instance identity storage

#### Scenario: Role assignment record shape

- GIVEN the identity control-plane schema defines `role-assignment`
- WHEN role assignments are inspected
- THEN each assignment stores one role reference, one target kind, one target
  reference, one scope kind, optional scope id, and one status as flat values
- AND supported target kinds are `principal`, `group`, and `organization`
- AND supported scope kinds are `instance`, `app-install`, and `organization`
- AND `instance` scope does not require a scope id
- AND `app-install` and `organization` scopes require a scope id
- AND supported first-pass statuses are `active` and `disabled`
- AND active role assignments are unique by role, target kind, selected target
  record, scope kind, and selected scope id
- AND the first owner is represented as an `instance.owner` role assignment for
  a principal at instance scope when owner identity is moved to the principal
  model by a later instance-auth change

### Requirement: App Registration And Invitation Records

The system SHALL store display-safe app identity enrollment and pending invite
facts without storing raw auth secrets.

#### Scenario: App registration record shape

- GIVEN the identity control-plane schema defines `app-registration`
- WHEN app registration records are inspected
- THEN each registration stores an app install id, target kind, target
  reference, registration status, and optional selected organization reference
  as flat values
- AND supported target kinds are `principal` and `organization`
- AND supported first-pass statuses are `active`, `pending`, and `disabled`
- AND active app registrations are unique by app install id, target kind, and
  selected target record
- AND app-specific profile or account records remain app-owned records and
  reference identity records by id when cross-schema identity references are
  enabled by a later app-schema change

#### Scenario: Invitation record shape

- GIVEN the identity control-plane schema defines `invitation`
- WHEN invitation records are inspected
- THEN each invitation stores display-safe pending invite facts such as target
  email, target surface, invited principal, inviter principal, status, expiry,
  and optional accepted timestamp as flat values
- AND supported first-pass statuses are `pending`, `accepted`, `revoked`, and
  `expired`
- AND raw invite tokens, token hashes, verification challenge secrets, delivery
  provider responses, and email recovery secrets remain private runtime state

### Requirement: Target-Aware Identity Uniqueness

The system SHALL enforce identity uniqueness according to the record's selected
target and scope rather than raw optional fields.

#### Scenario: Do not use generic unique constraints for alternative targets

- GIVEN an identity record uses a selector such as target kind or scope kind
- AND the selected value decides which reference or scope field is meaningful
- WHEN the identity control-plane schema declares uniqueness
- THEN it does not declare generic App schema unique constraints over mutually
  exclusive optional target or scope fields
- AND selected-target uniqueness is enforced by identity-control-plane
  validation helpers or runtime-owned identity operation validation
- AND unselected optional target and scope fields are ignored for uniqueness
  decisions

#### Scenario: Membership uniqueness allows multiple containers

- GIVEN one active principal belongs to two different groups
- OR the same active principal belongs to two different organizations
- WHEN identity-control-plane records are validated
- THEN the records are valid
- AND a duplicate active membership for the same principal, target kind, and
  selected target record is rejected
- AND tombstoned duplicate memberships do not block the active membership

#### Scenario: Role assignment uniqueness allows multiple targets

- GIVEN two different active principals receive the same role in the same scope
- OR the same active principal receives the same role in two different app
  install scopes
- WHEN identity-control-plane records are validated
- THEN the records are valid
- AND a duplicate active assignment for the same role, target kind, selected
  target record, scope kind, and selected scope id is rejected
- AND tombstoned duplicate role assignments do not block the active assignment

#### Scenario: App registration uniqueness allows multiple users

- GIVEN two different active principals register for the same app install
- OR one active principal registers for two different app installs
- WHEN identity-control-plane records are validated
- THEN the records are valid
- AND a duplicate active registration for the same app install id, target kind,
  and selected target record is rejected
- AND tombstoned duplicate app registrations do not block the active
  registration

### Requirement: Identity Boundary For Future App References

The system SHALL expose identity records through stable qualified entity names
without making app schemas own auth records.

#### Scenario: Qualified identity entity names

- GIVEN an external boundary combines identity records with records from another
  schema
- WHEN identity entity names are emitted
- THEN they use qualified names such as `auth:principal`, `auth:organization`,
  and `auth:group`
- AND the right-hand side remains the local identity entity key
- AND normal record values remain flat record ids

#### Scenario: App-owned profile extension

- GIVEN an app needs app-specific profile, account, customer, or tenant facts
- WHEN that app models those facts
- THEN it stores normal flat app records that reference identity records by id
- AND principal, email verification, credential, session, role assignment,
  group, organization, and invitation state remain identity or private auth
  runtime state
- AND direct auth-runtime materialization of arbitrary app records is not the
  identity control-plane contract

### Requirement: Private Auth State Boundary

The system MUST keep authentication secrets and session material outside
reviewable identity records.

#### Scenario: Private credential and session state

- GIVEN passkeys, future OAuth, magic links, passwords, SSO, central auth
  sessions, host sessions, cross-domain grants, recovery challenges, invite
  tokens, or revocation rows are stored
- WHEN storage is inspected through identity control-plane records, workspace
  state, archives, sync payloads, generated UI, or reviewable snapshots
- THEN those private auth facts are absent
- AND display-safe identity records may reference principals, roles, groups,
  organizations, app installs, invitations, and verification status without
  exposing raw secrets

#### Scenario: Owner and admin bearer boundaries remain separate

- GIVEN the first identity control-plane package and schema source are present
- WHEN existing owner setup, owner sessions, passkey credential storage, local
  dev owner bootstrap, or admin bearer authorization run
- THEN those existing instance-auth behaviors remain owned by the instance-auth
  runtime until a later change moves owner identity to principal and role
  records
- AND admin bearer authorization remains separate from browser login and
  identity-control-plane records
