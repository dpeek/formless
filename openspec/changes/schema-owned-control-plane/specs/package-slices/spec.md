## ADDED Requirements

### Requirement: Deploy Package Slice

The system SHALL provide a Deploy package slice under `lib/deploy/` for
deployment schema, projection, protocol, and adapter contracts.

#### Scenario: Deploy package scaffold

- **WHEN** the Deploy package slice is introduced
- **THEN** it contains package-local `AGENTS.md`, `package.json`,
  `tsconfig.json`, and `src/` entrypoints for public contracts and supported
  adapters
- **AND** it follows package slice import and documentation boundaries

#### Scenario: Deploy package exports

- **WHEN** app, client, Worker, CLI, generated UI, or tests need deploy package
  behavior
- **THEN** they import from the package root or documented subpaths
- **AND** they do not deep-import deploy package internals

### Requirement: Deploy Package Non-Ownership

The Deploy package SHALL own reusable contracts and helpers without owning
provider secrets or canonical provider state.

#### Scenario: Package owns schema contracts

- **WHEN** deployment entity shapes, action ids, projection helpers, display
  summaries, or protocol request shapes are needed
- **THEN** they come from `lib/deploy`
- **AND** provider SDK execution and Alchemy state remain outside the package's
  runtime-neutral contract
- **AND** app install and app route identity contracts are consumed from the
  instance control-plane model instead of being redefined as deploy-only shapes
