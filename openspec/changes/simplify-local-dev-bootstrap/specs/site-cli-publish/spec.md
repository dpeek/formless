## MODIFIED Requirements

### Requirement: Local First Onboarding

The CLI SHALL start the local Formless workspace runtime through `formless dev`
before any Cloudflare account or deployment mutation, while browser onboarding
owns workspace initialization, local session bootstrap, and first app install.

#### Scenario: Start local workspace runtime

- **WHEN** `formless dev` runs for an empty or layout-only workspace
- **THEN** the product instance runtime starts with workspace-local persistence
- **AND** first-run local runtime state starts from workspace control-plane
  record source and app archives
- **AND** the browser can complete onboarding before any Cloudflare deploy
- **AND** before a local owner session is established, the browser can use only
  local bootstrap capabilities needed to read workspace status, initialize the
  resolved workspace root, and exchange a CLI-minted local session bootstrap
  token for an owner session
- **AND** workspace initialization, first app install, save, check, credential
  setup, and deploy entry points are available through browser-owned local
  gateway operations after local session bootstrap

#### Scenario: Open authenticated local session

- **WHEN** a user runs `formless dev --open`
- **THEN** the CLI opens a same-origin local session bootstrap URL for the
  running local workspace runtime
- **AND** successful bootstrap issues an owner session cookie and redirects the
  browser to the instance shell
- **AND** the instance shell can install the first package app through the
  normal app install flow without passkey setup

#### Scenario: Onboard command removed

- **WHEN** a user invokes `formless onboard`
- **THEN** the command is not exposed as a supported workspace command
- **AND** if a retained parser path sees the command during transition, it
  fails before filesystem, Authority, Cloudflare, Alchemy, or provider mutation
- **AND** output directs the user to run `formless dev` and complete setup in
  the browser

#### Scenario: Install first app locally

- **WHEN** the user installs a package app through the local web UI
- **THEN** the local Authority records schema-owned `app-install` and `route`
  records and initializes install-scoped app state
- **AND** no Cloudflare resource is mutated
