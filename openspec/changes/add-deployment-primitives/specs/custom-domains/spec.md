## ADDED Requirements

### Requirement: Custom Domain Deployment Projection

The system SHALL project custom-domain desired state into the generic deployment
runtime without changing custom-domain route semantics.

#### Scenario: Project enabled route mappings

- **WHEN** deployment desired state is built for a target
- **THEN** enabled exact-host `instance`, `app`, and `publicSite` mappings are
  projected into deployment graph resources
- **AND** disabled mappings do not create desired provider resources

#### Scenario: Project redirect intent

- **WHEN** deployment desired state is built for a target
- **THEN** enabled redirect intent is projected into redirect rule and redirect
  DNS graph resources
- **AND** disabled redirect intent does not create desired provider resources

### Requirement: Domain Provider Compatibility Bridge

The system SHALL keep existing domain provider jobs compatible while recording
generic deployment attempt history.

#### Scenario: Apply job records deployment attempt

- **WHEN** an existing domain provider apply job is created
- **THEN** the runtime associates the job with a deployment attempt for the
  current desired-state version
- **AND** existing apply job responses continue to include the reviewed domain
  provider plan and job status

#### Scenario: Apply result records deployment evidence

- **WHEN** an existing domain provider apply job writes a successful result
- **THEN** custom-domain applied provider evidence and generic deployment
  resource evidence summaries are recorded
- **AND** current domain mapping route behavior remains unchanged

#### Scenario: Delete job remains explicit cleanup

- **WHEN** an existing domain provider delete job removes recorded provider
  resources
- **THEN** cleanup remains explicit and limited to selected recorded resources
- **AND** generic deployment attempt history records the cleanup result without
  deleting desired route intent
