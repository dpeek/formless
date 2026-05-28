## ADDED Requirements

### Requirement: Deployment-Aware Domain Runner CLI

The Site CLI SHALL keep existing instance domain runner commands while reporting
generic deployment protocol facts when the target supports them.

#### Scenario: Remote runner apply shows deployment attempt

- **WHEN** `formless instance domains run-apply` starts an apply against a target
  that exposes deployment runtime status
- **THEN** CLI output includes the desired-state version, attempt id, target,
  resource counts, and writeback status
- **AND** the command still uses runner-held provider credentials rather than
  browser, archive, or workspace manifest credentials

#### Scenario: Remote runner failure writes exact version

- **WHEN** `formless instance domains run-apply` fails after creating an attempt
- **THEN** the CLI writes failure details for the exact desired-state version
- **AND** the command exits with a failure after writeback is attempted

#### Scenario: Existing command surface remains stable

- **WHEN** users run existing domain remote-plan, run-apply, run-delete,
  forget-route, forget-redirect, or mark-manually-removed commands
- **THEN** the commands remain available with their existing credential boundary
- **AND** direct Cloudflare fallback plan/apply commands remain labeled fallback
  and explicit
