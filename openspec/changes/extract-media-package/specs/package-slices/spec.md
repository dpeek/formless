## ADDED Requirements

### Requirement: Package slice structure

The system SHALL organize extracted capability slices under `lib/<package>/` with a minimal package-local contract and adapter layout.

#### Scenario: Capability package scaffold

- **WHEN** a capability is extracted as a package
- **THEN** the package contains package-local `CONTEXT.md`, `package.json`, `tsconfig.json`, and `src/` files for public contract and supported adapters

#### Scenario: Package is not required to be a full app slice

- **WHEN** a capability crosses multiple Formless runtime surfaces without owning an app schema
- **THEN** it can still be extracted as a package slice

### Requirement: Minimal package documentation

Package documentation SHALL stay minimal and source-faithful.

#### Scenario: Package docs are introduced

- **WHEN** a package slice is created
- **THEN** the package has one `CONTEXT.md`
- **AND** versioned public contract documentation lives with exported declarations in `src/types.ts`

#### Scenario: Agent reads package context

- **WHEN** an agent works inside a package slice
- **THEN** it reads `CONTEXT.md`, then `src/types.ts`, then only the relevant adapter file for the task

### Requirement: Public contract file

The package `src/types.ts` file SHALL be the versioned public interface for exported package contracts.

#### Scenario: Contract declarations

- **WHEN** a package exposes types, public constants, or contract invariants
- **THEN** they are declared and documented in `src/types.ts`

#### Scenario: Contract purity

- **WHEN** `src/types.ts` is evaluated as a public contract file
- **THEN** it contains pure documented types and constants
- **AND** it does not import runtime code

### Requirement: Runtime-neutral root entrypoint

The package root entrypoint SHALL expose runtime-neutral helpers and public contract types without pulling client, React, or Worker adapters.

#### Scenario: Root export

- **WHEN** a consumer imports the package root
- **THEN** it receives public type re-exports and runtime-neutral pure helpers
- **AND** it does not receive browser-only, React-only, Worker-only, or provider-specific dependencies

### Requirement: Adapter subpath boundaries

Package adapter subpaths SHALL separate browser/client HTTP, React, and Worker/runtime responsibilities.

#### Scenario: Client adapter

- **WHEN** a package exposes `src/client.ts`
- **THEN** that entrypoint owns browser/client HTTP adapters
- **AND** it does not import React

#### Scenario: React adapter

- **WHEN** a package exposes `src/react.tsx`
- **THEN** that entrypoint owns package-specific React controls or React adapters
- **AND** it does not own generic generated form layout

#### Scenario: Worker adapter

- **WHEN** a package exposes `src/worker.ts`
- **THEN** that entrypoint owns Worker/runtime adapters
- **AND** it does not import React

### Requirement: Public import boundary

External package consumers SHALL import only package roots or documented package subpaths.

#### Scenario: Runtime code imports package behavior

- **WHEN** app, client, Worker, archive, or site runtime code consumes a package slice
- **THEN** it imports from package public exports
- **AND** it does not deep-import unexported package internals

### Requirement: Package-local verification

Package tests SHALL be fast, deterministic, and local.

#### Scenario: Package tests run locally

- **WHEN** package tests verify a capability slice
- **THEN** they use fake providers or stores, fixed clocks, and fixed ids
- **AND** they do not call live networks, Cloudflare APIs, or a dev server

#### Scenario: Browser smoke ownership

- **WHEN** package implementation does not change visible app behavior
- **THEN** browser smoke is not required for the package task
- **AND** browser smoke remains app-level when visible app behavior changes
