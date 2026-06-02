## MODIFIED Requirements

### Requirement: Domain CLI Workflows

The Site CLI SHALL expose domain inspection and explicit provider cleanup
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
  or a domain-specific provider apply command is invoked as a mutation path
- **THEN** the command does not mutate provider resources
- **AND** output directs the user to `formless deploy`
- **AND** provider credentials are not shown in browser, archive, workspace, or
  command error output

#### Scenario: Explicit cleanup remains

- **GIVEN** recorded provider evidence exists for a domain, DNS, or redirect
  resource
- **WHEN** an authorized explicit cleanup or delete workflow selects that
  recorded resource
- **THEN** cleanup is limited to the selected recorded provider resource or
  selected evidence row
- **AND** cleanup does not delete route intent or mutate app data
