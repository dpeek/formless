## MODIFIED Requirements

### Requirement: Domain CLI Workflows

The system SHALL expose domain inspection and explicit provider cleanup
workflows while provider mutation for domain, DNS, and redirect desired
resources runs through generic deployment attempts.

#### Scenario: Domain resources deploy through workspace deploy

- **GIVEN** a claimed instance workspace has enabled route records that project
  DNS, custom-domain, or redirect desired resources
- **WHEN** `formless deploy` runs
- **THEN** the CLI or trusted deployer applies those resources through the
  generic deployment path
- **AND** deployment attempts, evidence, and status identify the applied
  resources
- **AND** route records remain desired intent rather than provider truth

#### Scenario: Direct fallback retired

- **GIVEN** direct Cloudflare credentials are available to the CLI
- **WHEN** `formless instance domains plan`, `formless instance domains apply`,
  `formless instance domains run-apply`, browser domain apply controls, or a
  domain-specific provider apply API is invoked as a mutation path
- **THEN** the command does not mutate provider resources
- **AND** output directs the user to `formless deploy`
- **AND** provider credentials are not shown in browser, archive, workspace, or
  command error output

#### Scenario: Domain apply jobs retired

- **GIVEN** domain, DNS, or redirect desired resources exist
- **WHEN** a request attempts to create, poll as a mutation flow, or complete a
  domain-provider apply job
- **THEN** the request fails before creating provider jobs, deployment attempts,
  Authority writes, filesystem writes, or provider mutations
- **AND** provider apply job response shapes are not exposed as supported
  product behavior

#### Scenario: Explicit cleanup remains

- **GIVEN** recorded provider evidence exists for a domain, DNS, or redirect
  resource
- **WHEN** an authorized explicit cleanup or delete workflow selects that
  recorded resource
- **THEN** cleanup is limited to the selected recorded provider resource or
  selected evidence row
- **AND** cleanup does not delete route intent or mutate app data

#### Scenario: Pure planning helper reuse

- **GIVEN** generic deployment, destroy, inspection, or explicit cleanup needs
  route-derived provider resource planning
- **WHEN** implementation reuses domain-provider planning helpers
- **THEN** those helpers remain pure projection or inspection code
- **AND** they do not expose direct fallback apply, apply-job, or separate domain
  mutation behavior
