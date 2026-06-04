# Package Slices Specification

## Purpose

Package slices define reusable capability package boundaries under
`lib/<package>/` for behavior that crosses runtime surfaces without owning a
bundled app schema or app records.

## Requirements

### Requirement: Package Slice Scope

The system SHALL treat package slices as reusable capability boundaries under
`lib/<package>/`.

#### Scenario: Capability crosses runtime surfaces

- GIVEN behavior spans app, client, React, Worker, archive, provider, or
  runtime-neutral surfaces
- WHEN the behavior does not own a full app schema
- THEN it can be extracted as a package slice

#### Scenario: Package does not own app records

- GIVEN a package slice is extracted for shared capability behavior
- WHEN app data is stored
- THEN app records remain owned by app schemas or runtime storage
- AND the package owns only reusable contracts, pure helpers, adapters, or
  package-specific UI behavior

### Requirement: Package Slice Structure

The system SHALL organize extracted capability slices under `lib/<package>/`
with a minimal package-local contract and adapter layout.

#### Scenario: Capability package scaffold

- GIVEN a capability is extracted as a package
- WHEN the package is scaffolded
- THEN the package contains package-local `AGENTS.md`, `package.json`,
  `tsconfig.json`, and `src/` files for public contract and supported adapters
- AND the package does not require a bundled app schema

### Requirement: Minimal Package Documentation

Package documentation SHALL stay minimal and source-faithful.

#### Scenario: Package docs are introduced

- GIVEN a package slice is created
- WHEN package docs are added
- THEN the package has one `AGENTS.md`
- AND versioned public contract documentation lives with exported declarations
  in `src/types.ts`

#### Scenario: Package AGENTS stays operational

- GIVEN `AGENTS.md` documents a package slice
- WHEN the package changes
- THEN it records package ownership, non-ownership, source map, read path, and
  test rules
- AND it does not duplicate the versioned contract declarations owned by
  `src/types.ts`

#### Scenario: Agent reads package AGENTS

- GIVEN an agent works inside a package slice
- WHEN it gathers package AGENTS
- THEN it reads `AGENTS.md`, then `src/types.ts`, then only the relevant
  adapter file for the task

### Requirement: Public Contract File

The package `src/types.ts` file SHALL be the versioned public interface for
exported package contracts.

#### Scenario: Contract declarations

- GIVEN a package exposes types, public constants, or contract invariants
- WHEN adapter entrypoints need those declarations
- THEN they import declarations from `src/types.ts`
- AND they do not redefine compatible local shapes

#### Scenario: Contract purity

- GIVEN `src/types.ts` is evaluated as a public contract file
- WHEN it is imported
- THEN it contains pure documented types and constants
- AND it does not import runtime code

### Requirement: Runtime-Neutral Root Entrypoint

The package root entrypoint SHALL expose runtime-neutral helpers and public
contract types without pulling client, React, or Worker adapters.

#### Scenario: Root export

- GIVEN a consumer imports the package root
- WHEN the import is evaluated
- THEN it receives public type re-exports and runtime-neutral pure helpers
- AND it does not receive browser-only, React-only, Worker-only, or
  provider-specific dependencies

### Requirement: Adapter Subpath Boundaries

Package adapter subpaths SHALL separate browser/client HTTP, React, and
Worker/runtime responsibilities.

#### Scenario: Package export map

- GIVEN a package exposes adapter subpaths
- WHEN `package.json` declares supported imports
- THEN it documents the root, client, React, and Worker entrypoints
- AND it does not export unowned internal implementation files

#### Scenario: Client adapter

- GIVEN a package exposes `src/client.ts`
- WHEN the client adapter is imported
- THEN that entrypoint owns browser/client HTTP adapters
- AND it does not import React

#### Scenario: React adapter

- GIVEN a package exposes `src/react.tsx`
- WHEN the React adapter is imported
- THEN that entrypoint owns package-specific React controls or React adapters
- AND it does not own generic generated form layout

#### Scenario: Worker adapter

- GIVEN a package exposes `src/worker.ts`
- WHEN the Worker adapter is imported
- THEN that entrypoint owns Worker/runtime adapters
- AND it does not import React

#### Scenario: Sidecar adapter

- GIVEN a package exposes `src/sidecar.ts`
- WHEN the sidecar adapter is imported
- THEN that entrypoint owns local Node sidecar adapters
- AND it does not import React
- AND it does not enter browser or Worker bundles

#### Scenario: Node adapter

- GIVEN a package exposes `src/node.ts`
- WHEN the Node adapter is imported
- THEN that entrypoint owns local Node filesystem or process adapters
- AND it does not import React
- AND it does not enter browser or Worker bundles

### Requirement: Public Import Boundary

External package consumers SHALL import only package roots or documented package
subpaths.

#### Scenario: Runtime code imports package behavior

- GIVEN app, client, Worker, archive, or Site runtime code consumes a package
  slice
- WHEN it imports package behavior
- THEN it imports from package public exports
- AND it does not deep-import unexported package internals

#### Scenario: Package internals remain private

- GIVEN code outside `lib/<package>/` imports package behavior
- WHEN the import path is checked
- THEN the import path is the package root or a documented package subpath
- AND wildcard exports or direct imports from private source files are not
  required

### Requirement: Package-Local Verification

Package tests SHALL be fast, deterministic, and local.

#### Scenario: Package tests run locally

- GIVEN package tests verify a capability slice
- WHEN the tests run
- THEN they live inside the package source or package test tree
- AND they use fake providers or stores, fixed clocks, and fixed ids
- AND they do not call live networks, Cloudflare APIs, or a dev server

#### Scenario: Browser smoke ownership

- GIVEN package implementation does not change visible app behavior
- WHEN package verification runs
- THEN browser smoke is not required for the package task
- AND browser smoke remains app-level when visible app behavior changes

### Requirement: Deploy Package Slice

The system SHALL provide a Deploy package slice under `lib/deploy/` for
deployment schema, projection, protocol, and adapter contracts.

#### Scenario: Deploy package scaffold

- GIVEN the Deploy package slice is introduced
- WHEN the package is scaffolded
- THEN it contains package-local `AGENTS.md`, `package.json`, `tsconfig.json`,
  and `src/` entrypoints for public contracts and supported adapters
- AND the package is published as `@dpeek/formless-deploy` with root,
  `./client`, `./react`, and `./worker` public subpaths
- AND it follows package slice import and documentation boundaries

#### Scenario: Deploy package exports

- GIVEN app, client, Worker, CLI, generated UI, or tests need deploy package
  behavior
- WHEN they import the package
- THEN they import from the package root or documented subpaths
- AND they do not deep-import deploy package internals

### Requirement: Deploy Package Non-Ownership

The Deploy package SHALL own reusable contracts and helpers without owning
provider secrets or canonical provider state.

#### Scenario: Package owns schema contracts

- GIVEN deployment entity shapes, action ids, projection helpers, display
  summaries, or protocol request shapes are needed
- WHEN runtime-neutral contracts are consumed
- THEN they come from `lib/deploy`
- AND provider SDK execution and Alchemy state remain outside the package's
  runtime-neutral contract
- AND app install and app route identity contracts are consumed from the
  instance control-plane model instead of being redefined as deploy-only shapes

### Requirement: Gateway Package Slice

The system SHALL provide a Gateway package slice under `lib/gateway/` for local
workspace gateway transport contracts, browser adapters, Worker proxy adapters,
and local sidecar HTTP adapters.

#### Scenario: Gateway package scaffold

- GIVEN the Gateway package slice is introduced
- WHEN the package is scaffolded
- THEN it contains package-local `AGENTS.md`, `package.json`, `tsconfig.json`,
  and `src/` entrypoints for public contracts and supported adapters
- AND the package is published as `@dpeek/formless-gateway` with root,
  `./client`, `./worker`, and `./sidecar` public subpaths
- AND it follows package slice import and documentation boundaries
- AND it does not expose a React subpath

#### Scenario: Gateway package exports

- GIVEN app, client, Worker, CLI, Site runtime, or tests need workspace gateway
  behavior
- WHEN they import the package
- THEN they import from the package root or documented subpaths
- AND they do not deep-import gateway package internals

### Requirement: Gateway Package Non-Ownership

The Gateway package SHALL own reusable local workspace gateway contracts,
wire-safety helpers, and adapters without owning Formless workspace operations,
owner session storage, runtime topology, provider execution, or app records.

#### Scenario: Package owns gateway contracts and adapters

- GIVEN workspace gateway route constants, proxy header contracts, operation
  intent helpers, browser fetch behavior, Worker proxy behavior, or sidecar
  HTTP routing helpers are needed
- WHEN runtime-neutral, browser, Worker, or sidecar code consumes gateway
  capability behavior
- THEN they come from `lib/gateway`
- AND semantic workspace operation input shapes, display-safe operation state,
  operation result contracts, operation storage, actual save, check, pull,
  push, deploy, credential setup, owner session, runtime topology, Authority,
  provider credential, and filesystem operation implementations remain outside
  the package contract
- AND Gateway may expose transport-facing aliases or response wrappers for
  Workspace operation states, but canonical operation declarations remain in
  the Workspace package

### Requirement: Schema Package Slice

The system SHALL provide a Schema package slice under `lib/schema/` for
runtime-neutral App schema language contracts, parsers, and pure helpers.

#### Scenario: Schema package scaffold

- GIVEN the Schema package slice is introduced
- WHEN the package is scaffolded
- THEN it contains package-local `AGENTS.md`, `package.json`, `tsconfig.json`,
  and `src/` entrypoints for public contracts and runtime-neutral helpers
- AND the package is published as `@dpeek/formless-schema` with a root public
  subpath
- AND it follows package slice import and documentation boundaries
- AND it does not expose client, React, Worker, Node, or sidecar subpaths

#### Scenario: Schema package exports

- GIVEN generated UI models, schema authoring state, Authority validation,
  browser replicas, archives, upgrade migrations, tests, or package slices need
  App schema contracts, parser behavior, field behavior, query helpers, read
  model helpers, schema-local entity key helpers, or qualified entity name
  helpers
- WHEN they import schema language behavior
- THEN they import from `@dpeek/formless-schema`
- AND they do not deep-import schema package internals or old package-owned
  `src/shared/schema*`, `src/shared/field-types`, `src/shared/fields`,
  `src/shared/query`, or `src/shared/read-model` modules
- AND old package-owned shared schema modules are not retained as
  compatibility re-export shims

### Requirement: Schema Package Non-Ownership

The Schema package SHALL own reusable App schema language contracts and pure
helpers without owning bundled app packages, runtime storage, generated React
surfaces, archive execution, or workspace source.

#### Scenario: Package owns schema language contracts

- GIVEN App schema types, schema parsing, schema formatting, schema-local entity
  key parsing, qualified entity name parsing, field type behavior, field value
  validation helpers, query expression helpers, read model numeric and aggregate
  helpers, create-default parsing helpers, runtime schema metadata helpers,
  action capability helpers, or schema section parsers are needed
- WHEN runtime-neutral code consumes schema capability behavior
- THEN they come from `lib/schema`
- AND callers consume the package root rather than knowing the internal parser
  file layout

#### Scenario: Package does not own runtime surfaces

- GIVEN bundled source app package metadata, source schema JSON loading, source
  seed records, schema Builder UI state, generated React rendering, Authority
  table mutation, Durable Object storage, browser replica persistence, archive
  restore execution, Workspace record source, instance control-plane schema
  construction, package app migrations, or provider execution is needed
- WHEN those behaviors are implemented
- THEN they remain owned by their existing app, client, Worker, archive,
  Workspace, Deploy, migration, or runtime modules
- AND the Schema package supplies only runtime-neutral schema contracts, pure
  parser/formatter behavior, and package-local deterministic tests

### Requirement: Workspace Package Slice

The system SHALL provide a Workspace package slice under `lib/workspace/` for
Formless workspace source contracts, ignored local state contracts, semantic
workspace operation contracts, and local Node filesystem adapters.

#### Scenario: Workspace package scaffold

- GIVEN the Workspace package slice is introduced
- WHEN the package is scaffolded
- THEN it contains package-local `AGENTS.md`, `package.json`, `tsconfig.json`,
  and `src/` entrypoints for public contracts and supported adapters
- AND the package is published as `@dpeek/formless-workspace` with root and
  `./node` public subpaths
- AND it follows package slice import and documentation boundaries
- AND it does not expose client, React, Worker, or sidecar subpaths

#### Scenario: Workspace package exports

- GIVEN CLI, Site runtime, Gateway runtime adapters, archive workflows, tests,
  or local agent workflows need workspace source, local state, operation, or
  record-source behavior
- WHEN they import the package
- THEN they import from `@dpeek/formless-workspace` or
  `@dpeek/formless-workspace/node`
- AND they do not deep-import workspace package internals

### Requirement: Workspace Package Non-Ownership

The Workspace package SHALL own reusable Formless workspace source, state, and
operation contracts without owning CLI command policy, gateway transport,
runtime storage, provider execution, or app records.

#### Scenario: Package owns workspace contracts and local adapters

- GIVEN `formless.json` manifest parsing, workspace path defaults, target URL
  normalization, reviewable control-plane record-source file contracts, ignored
  local or secret state file contracts, semantic workspace operation inputs,
  display-safe operation state, operation result shapes, operation redaction, or
  deterministic local filesystem workspace IO are needed
- WHEN runtime-neutral or local Node code consumes workspace capability
  behavior
- THEN they come from `lib/workspace`
- AND Gateway imports or is supplied those semantic operation contracts instead
  of defining Gateway-owned operation shapes
- AND package consumers import Workspace behavior only from
  `@dpeek/formless-workspace` or `@dpeek/formless-workspace/node`, never from
  old `src/site` workspace modules or package internals

#### Scenario: Package does not own runtime execution

- GIVEN workspace operations save, check, pull, push, deploy, credential setup,
  restore, export, import, mutate provider state, read Authority storage, or
  select runtime topology
- WHEN those behaviors are implemented
- THEN CLI, Site runtime, Gateway runtime adapters, Archive workflows, Deploy
  runtime, Worker runtime, or provider adapters own the execution
- AND the Workspace package only supplies contracts, pure helpers, display-safe
  state handling, and local filesystem adapters for workspace source or ignored
  local state
