# Package Slices Specification

## Purpose

Package slices and in-repo app packages define package boundaries under
`lib/<package>/`. Capability slices own reusable contracts and adapters without
owning app records. App packages own source schema, seed records, manifests, and
any package-specific adapters for a bundled app.

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

### Requirement: In-Repo App Package Structure

The system SHALL allow in-repo app packages under `lib/<package>/` when the
package owns source schema, seed records, and package-specific runtime
adapters.

#### Scenario: App package scaffold

- GIVEN an app package such as Site or CRM is extracted into an in-repo package
- WHEN the package is scaffolded
- THEN the package contains package-local `AGENTS.md`, `package.json`,
  `tsconfig.json`, `formless.app.json`, `schema.json`, `seed-records.json`,
  and `src/` entrypoints for public contracts and supported runtime adapters
- AND the app package is published as a workspace package with documented root,
  React, Worker, and Node subpaths when those adapters exist
- AND source schema and seed records remain app package source data rather than
  generated runtime state
- AND app packages without package-specific executable adapters do not need to
  expose unused adapter subpaths

#### Scenario: App package adapter ownership

- GIVEN an in-repo app package declares a runtime capability in
  `formless.app.json`
- WHEN core runtime, Worker, React, CLI, archive, or tests need executable
  behavior for that capability
- THEN they import the package root or documented adapter subpaths
- AND the package-owned adapter supplies capability-specific behavior such as
  public tree projection, public document rendering, metadata, icons, or
  indexing
- AND core runtime owns app install identity, route records, Authority storage,
  browser replicas, sync, media storage, and generic archive execution
- AND code outside the package does not deep-import package internals
- AND core runtime may register the package adapter for the current environment,
  but missing adapter registrations are unsupported capability errors rather
  than package-name fallbacks

#### Scenario: App package source replaces root app files

- GIVEN an app package such as Site or CRM owns `formless.app.json`,
  `schema.json`, and `seed-records.json`
- WHEN runtime code composes bundled package metadata, source schemas, or seed
  records
- THEN it imports the package root or documented source JSON subpaths
- AND root runtime does not keep duplicate source schema or seed-record files
  for that app package
- AND root `schema/apps/<packageAppKey>` source files are removed for extracted
  app packages

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

### Requirement: Package Internal Import Boundary

Package source SHALL depend only on package-local source, documented public
workspace package exports, npm dependencies, or Node built-ins.

#### Scenario: Package source avoids root runtime internals

- GIVEN a source file under `lib/<package>/src/` imports another module
- WHEN the import path is resolved
- THEN the dependency is package-local, a documented public workspace package
  root or subpath, an external package, or a Node built-in
- AND it does not resolve into repo-root `src/`, `src/test/`, or another
  package's unexported `lib/<other-package>/src/` internals

#### Scenario: Package tests stay package-local

- GIVEN tests live under `lib/<package>/src/`
- WHEN they need schemas, records, package manifests, storage snapshots, or
  media examples
- THEN they use package-local fixtures or public package exports
- AND they do not import repo-root `src/test/*` fixtures or root runtime-only
  modules

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

### Requirement: Storage Package Slice

The system SHALL provide a Storage package slice under `lib/storage/` for
runtime-neutral storage snapshot and stored-record contracts.

#### Scenario: Storage package scaffold

- GIVEN the Storage package slice is introduced
- WHEN the package is scaffolded
- THEN it contains package-local `AGENTS.md`, `package.json`, `tsconfig.json`,
  and `src/` entrypoints for public contracts and runtime-neutral helpers
- AND the package is published as `@dpeek/formless-storage` with a root public
  subpath
- AND it follows package slice import and documentation boundaries
- AND it does not expose client, React, Worker, Node, or sidecar subpaths

#### Scenario: Storage package exports

- GIVEN Authority storage, browser replicas, archive packages, workspace
  packages, Site runtime, Worker runtime, or tests need storage snapshot kind
  constants, storage snapshot parsing, stored-record contracts, or flat record
  value contracts
- WHEN they import storage snapshot behavior
- THEN they import from `@dpeek/formless-storage`
- AND they do not import those contracts from root runtime protocol modules

### Requirement: Storage Package Non-Ownership

The Storage package SHALL own reusable storage snapshot contracts and parsers
without owning Authority execution or runtime protocol routes.

#### Scenario: Package owns snapshot contracts

- GIVEN storage snapshot kind constants, storage snapshot version constants,
  storage snapshot parsing, storage identity checks, stored-record contracts, or
  flat record value contracts are needed
- WHEN runtime-neutral code consumes storage snapshot behavior
- THEN they come from `lib/storage`
- AND App schema parsing and field behavior come from the Schema package

#### Scenario: Package does not own storage execution

- GIVEN Authority bootstrap, schema storage, change rows, operation
  invocations, sync protocol, mutation routes, Durable Object storage, browser
  replica persistence, or restore execution is needed
- WHEN those behaviors are implemented
- THEN Authority storage, browser replica, Worker runtime, or Site runtime own
  the execution
- AND the Storage package supplies only snapshot contracts, pure parsing, and
  package-local deterministic tests

### Requirement: Installed Apps Package Slice

The system SHALL provide an Installed Apps package slice under
`lib/installed-apps/` for app install identity, package app manifest, package
resolver, package revision, and source schema hash contracts.

#### Scenario: Installed Apps package scaffold

- GIVEN the Installed Apps package slice is introduced
- WHEN the package is scaffolded
- THEN it contains package-local `AGENTS.md`, `package.json`, `tsconfig.json`,
  and `src/` entrypoints for public contracts and runtime-neutral helpers
- AND the package is published as `@dpeek/formless-installed-apps` with a root
  public subpath
- AND it follows package slice import and documentation boundaries
- AND it does not expose client, React, Worker, Node, or sidecar subpaths

#### Scenario: Installed Apps package exports

- GIVEN app, client, Worker, archive, workspace, upgrade, Site runtime, or tests
  need app install id validation, app install contracts, app package manifest
  parsing, package resolver behavior, package revision contracts, or source
  schema hash helpers
- WHEN they import installed-app or app-package behavior
- THEN they import from `@dpeek/formless-installed-apps`
- AND they do not import those contracts from root runtime modules

### Requirement: Installed Apps Package Non-Ownership

The Installed Apps package SHALL own reusable install and package metadata
contracts without owning bundled app sources, app install storage mutation, or
runtime adapter execution.

#### Scenario: Package owns install and package metadata contracts

- GIVEN app install id validation, app install metadata shapes, package app
  manifest parsing, active resolver helpers, package revision contracts, source
  schema hash parsing, or deterministic source schema hash computation are
  needed
- WHEN runtime-neutral code consumes installed-app behavior
- THEN they come from `lib/installed-apps`
- AND source schema parsing comes from the Schema package

#### Scenario: Package does not own bundled defaults

- GIVEN the default runtime resolver needs bundled Site, Tasks, or CRM package
  manifests
- WHEN bundled package metadata is composed
- THEN root runtime code supplies bundled manifests to the Installed Apps
  package resolver
- AND package source does not import bundled schema JSON, seed records, or
  root-only bundled package lists

### Requirement: Instance Control Plane Package Slice

The system SHALL provide an Instance Control Plane package slice under
`lib/instance-control-plane/` for schema-owned instance management contracts and
reviewable control-plane storage snapshot validation.

#### Scenario: Instance Control Plane package scaffold

- GIVEN the Instance Control Plane package slice is introduced
- WHEN the package is scaffolded
- THEN it contains package-local `AGENTS.md`, `package.json`, `tsconfig.json`,
  and `src/` entrypoints for public contracts and runtime-neutral helpers
- AND the package is published as `@dpeek/formless-instance-control-plane`
  with a root public subpath
- AND it follows package slice import and documentation boundaries
- AND it does not expose client, React, Worker, Node, or sidecar subpaths

#### Scenario: Instance Control Plane package exports

- GIVEN Archive, Workspace, Worker runtime, Site runtime, Deploy runtime, or
  tests need instance control-plane schema keys, storage identity constants,
  entity contracts, schema contracts, reviewable record validation, or
  display-safe control-plane storage snapshot canonicalization
- WHEN they import instance control-plane behavior
- THEN they import from `@dpeek/formless-instance-control-plane`
- AND they do not import those contracts from root runtime modules

### Requirement: Instance Control Plane Package Non-Ownership

The Instance Control Plane package SHALL own reusable schema-owned instance
management contracts without owning Authority writes, app records, deployment
execution, or provider state.

#### Scenario: Package owns schema-owned control-plane contracts

- GIVEN app-install, route, or deployment-config entity contracts,
  control-plane schema constants, reviewable storage snapshot validation, or
  display-safe canonicalization are needed
- WHEN runtime-neutral code consumes instance control-plane behavior
- THEN they come from `lib/instance-control-plane`
- AND app install metadata contracts come from the Installed Apps package
- AND deployment projection contracts come from the Deploy package
- AND storage snapshot contracts come from the Storage package

#### Scenario: Package does not own control-plane execution

- GIVEN app install mutation, route mutation, deployment-config mutation,
  Authority storage, owner authorization, deployment projection execution,
  provider execution, or runtime observation persistence is needed
- WHEN those behaviors are implemented
- THEN Worker runtime, Site runtime, Deploy runtime, Gateway runtime adapters,
  or provider adapters own the execution
- AND the Instance Control Plane package supplies only schema contracts,
  reviewable validation, pure helpers, and package-local deterministic tests

### Requirement: Archive Package Slice

The system SHALL provide an Archive package slice under `lib/archive/` for
portable archive contracts, parsers, restore planning, and local
archive filesystem adapters.

#### Scenario: Archive package scaffold

- GIVEN the Archive package slice is introduced
- WHEN the package is scaffolded
- THEN it contains package-local `AGENTS.md`, `package.json`, `tsconfig.json`,
  and `src/` entrypoints for public contracts and supported adapters
- AND the package is published as `@dpeek/formless-archive` with root and
  `./node` public subpaths
- AND it follows package slice import and documentation boundaries
- AND it does not expose client, React, Worker, or sidecar subpaths

#### Scenario: Archive package exports

- GIVEN CLI runtime, Worker restore APIs, Workspace operations, upgrade
  planning, or tests need portable archive behavior
- WHEN they import archive contracts, parsers, restore planning,
  or local archive file adapters
- THEN they import from `@dpeek/formless-archive` or
  `@dpeek/formless-archive/node`
- AND they import Archive package behavior only through exported package
  entrypoints, not source-tree modules or package internals

### Requirement: Archive Package Non-Ownership

The Archive package SHALL own reusable portable archive contracts and pure
helpers without owning runtime storage, app records, media storage, provider
execution, workspace operation execution, or CLI command policy.

#### Scenario: Package owns archive contracts

- GIVEN archive envelope types, archive kind constants, archive version
  constants, archive capability parsing, archive formatting, restore dry-run
  planning, media manifest validation, or local
  archive directory IO are needed
- WHEN runtime-neutral or local Node code consumes portable archive behavior
- THEN they come from `lib/archive`
- AND app schema language behavior comes from the Schema package
- AND core media contracts come from the Media package
- AND local workspace source/state behavior comes from the Workspace package

#### Scenario: Package does not own archive execution

- GIVEN archive export, archive restore apply, app install mutation, Authority
  reads or writes, Durable Object storage, browser replica state, media object
  mutation, provider mutation, workspace save/check/pull/push/deploy, or CLI
  command policy is needed
- WHEN those behaviors are implemented
- THEN CLI runtime, Archive workflows, Workspace runtime, Worker runtime,
  Authority, Media runtime, Deploy runtime, or provider adapters own the
  execution
- AND the Archive package only supplies contracts, parser/formatter behavior,
  current-envelope rejection, deterministic planning, and package-local tests

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
workspace gateway transport contracts, response safety helpers, browser
adapters, Worker proxy adapters, shared local runtime proxy rules, and local
sidecar HTTP adapters.

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

- GIVEN app, client, Worker, CLI runtime, or tests need workspace gateway
  behavior
- WHEN they import the package
- THEN they import from the package root or documented subpaths
- AND they do not deep-import gateway package internals
- AND package-internal shared proxy rules and response safety helpers remain
  private implementation behind documented Worker and sidecar adapter subpaths

### Requirement: Gateway Package Non-Ownership

The Gateway package SHALL own reusable local workspace gateway contracts,
wire-safety helpers, and adapters without owning Formless workspace operations,
owner session storage, runtime topology, provider execution, or app records.

#### Scenario: Package owns gateway contracts and adapters

- GIVEN workspace gateway route constants, proxy header contracts, operation
  intent helpers, browser fetch behavior, response safety helpers, shared local
  runtime proxy rules, Worker proxy behavior, or sidecar HTTP routing helpers
  are needed
- WHEN runtime-neutral, browser, Worker, or sidecar code consumes gateway
  capability behavior
- THEN they come from `lib/gateway`
- AND Worker proxy adapters and local Node runtime proxy adapters share one
  package-owned proxy rules Module for route classification, operation intent
  validation, browser actor policy, CSRF checks, sanitized sidecar forwarding,
  and display-safe response wrapping
- AND Worker proxy adapters, local Node runtime proxy adapters, sidecar adapters,
  and browser client tests share package-owned response safety helpers for JSON
  envelopes, allowed response headers, owner-session CSRF wrapping, sidecar
  fallback errors, and display-safe gateway transport wrappers
- AND direct sidecar automation authorization and sidecar execution ingress
  remain sidecar adapter behavior rather than browser proxy behavior
- AND semantic workspace operation input shapes, display-safe operation state,
  operation result contracts, operation storage, actual save, check, pull,
  push, deploy, credential setup, owner session, runtime topology, Authority,
  provider credential, and filesystem operation implementations remain outside
  the package contract
- AND Gateway may expose transport-facing aliases or response wrappers for
  Workspace operation states, but canonical operation declarations remain in
  the Workspace package

### Requirement: Public Operations Package Slice

The system SHALL provide a Public Operations package slice under
`lib/public-operations/` for reusable public operation route contracts and
browser-safe public operation client protocol helpers.

#### Scenario: Public Operations package scaffold

- GIVEN the Public Operations package slice is introduced
- WHEN the package is scaffolded
- THEN it contains package-local `AGENTS.md`, `package.json`, `tsconfig.json`,
  and `src/` entrypoints for public contracts and runtime-neutral helpers
- AND the package is published as `@dpeek/formless-public-operations` with a
  root public subpath
- AND it follows package slice import and documentation boundaries
- AND it does not expose React, Worker, Node, sidecar, app-schema, app-record,
  challenge, notification, or operation execution ownership subpaths

#### Scenario: Public Operations package exports

- GIVEN Site projection, Worker routing, browser clients, or tests need public
  operation route grammar, browser request envelope helpers, browser response
  guards, browser error extraction, browser idempotency key helpers, or
  Turnstile response token extraction
- WHEN they import public operation package behavior
- THEN they import from `@dpeek/formless-public-operations`
- AND they do not deep-import public operation package internals

### Requirement: Public Operations Package Non-Ownership

The Public Operations package SHALL own reusable public operation route
contracts and browser-safe public operation client protocol helpers without
owning target resolution, schema operation declarations, app storage, challenge
verification, notification delivery, Site records, or product-specific form UI.

#### Scenario: Package owns public operation route contracts

- GIVEN target-scoped public operation routes are built or parsed
- WHEN runtime-neutral, Site projection, browser, Worker, or tests consume public
  operation route behavior
- THEN path suffix construction, segment encoding, segment decoding, and suffix
  validation come from `lib/public-operations`
- AND target API route prefixes, app storage identities, mapped-host policy,
  Authority routing, public operation eligibility, Turnstile verification,
  operation execution, operation audit storage, notification delivery, and
  product-specific subscribe, contact, or generic form UI remain outside the
  package contract

#### Scenario: Package owns browser-safe client helpers

- GIVEN public Site browser forms submit to public operation routes
- WHEN browser code builds the submit envelope, posts JSON, extracts a
  public-safe error, validates a public operation response, creates a form
  idempotency key, or reads the Turnstile response token from `FormData`
- THEN shared protocol behavior comes from `lib/public-operations`
- AND product-specific form input mapping, schema-field form coercion,
  rendered controls, success/error UI, challenge widget rendering, route
  projection, challenge verification, operation execution, and notification
  scheduling remain outside the package contract

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

- GIVEN generated UI models, Authority validation, browser replicas, archives,
  upgrade migrations, tests, or package slices need
  App schema contracts, parser behavior, field behavior, query helpers, read
  model helpers, schema-local entity key helpers, or qualified entity name
  helpers
- WHEN they import schema language behavior
- THEN they import from `@dpeek/formless-schema`
- AND they do not deep-import schema package internals

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
  restore execution, Workspace storage snapshots, instance control-plane schema
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

- GIVEN CLI runtime, Gateway runtime adapters, archive workflows, tests,
  or local agent workflows need workspace source, local state, operation, or
  storage snapshot behavior
- WHEN they import the package
- THEN they import from `@dpeek/formless-workspace` or
  `@dpeek/formless-workspace/node`
- AND they do not deep-import workspace package internals

#### Scenario: Workspace package docs follow current source model

- GIVEN package-local `AGENTS.md` files, import-boundary tests, or local agent
  instructions describe workspace source responsibilities
- WHEN workspace source is represented as storage snapshot state and media
  payloads
- THEN those docs and tests name current workspace source, state, operation,
  manifest, local state, secret state, and storage snapshot helpers
- AND they direct agents and import allowlists toward Workspace package helpers
  and exported entrypoints

### Requirement: Workspace Package Non-Ownership

The Workspace package SHALL own reusable Formless workspace source, state, and
operation contracts without owning CLI command policy, gateway transport,
runtime storage, provider execution, or app records.

#### Scenario: Package owns workspace contracts and local adapters

- GIVEN `formless.json` manifest parsing, workspace path defaults, target URL
  normalization, reviewable control-plane storage snapshot contracts, ignored
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
  source-tree modules or package internals

#### Scenario: Package does not own runtime execution

- GIVEN workspace operations save, check, pull, push, deploy, credential setup,
  restore, export, import, mutate provider state, read Authority storage, or
  select runtime topology
- WHEN those behaviors are implemented
- THEN CLI runtime, Gateway runtime adapters, Archive workflows, Deploy
  runtime, Worker runtime, or provider adapters own the execution
- AND the Workspace package only supplies contracts, pure helpers, display-safe
  state handling, and local filesystem adapters for workspace source or ignored
  local state
