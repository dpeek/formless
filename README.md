# Formless

Formless is a schema-as-data app runtime for building custom software on Cloudflare.

One app definition describes records, fields, relationships, queries, read
models, views, screens, actions, public output, and deploy behavior. The runtime
turns that definition into storage, sync, generated UI, media, public pages,
archives, and deploy paths.

This README is the human overview. Agent instructions live separately in `AGENTS.md`.

## Quick Start

Create a local Formless workspace:

```sh
mkdir my-workspace
cd my-workspace
npx @dpeek/formless onboard
npx @dpeek/formless dev
```

Common commands:

- `formless onboard` creates `formless.json`, empty archive roots, and ignored
  `.formless/` local state without mutating Cloudflare.
- `formless dev` runs the local workspace instance selected by `formless.json`.
- `formless save` writes local Authority-backed instance state to reviewable workspace archives.
- `formless save --check` fails when reviewable workspace source is stale.
- `formless check` compares workspace source and configured target drift.
- `formless deploy` is the explicit Cloudflare boundary: it deploys the
  instance, stores display-safe target intent in `formless.json`, keeps secrets
  under `.formless/`, and pushes saved archives.
- `formless destroy` is the explicit Cloudflare boundary for tearing down the configured deployment.
- `formless instance ...` manages advanced instance workspace pull, check,
  push, dev, deploy, and destroy flows.
- `formless archive import-site --project <path> --install <id> --out <dir>`
  imports a legacy standalone Site project as an app archive.

## Packages

- `@dpeek/formless`: Formless runtime and CLI package.
- `@dpeek/formless-ui`: shared browser primitives for generated runtime surfaces.
- `@dpeek/formless-media`: reusable media contracts, helpers, and adapters.
- `@dpeek/formless-deploy`: reusable deployment contracts, projection helpers, and adapters.

## Current Shape

The runtime already has:

- app schemas for Tasks, Estii, and Site;
- flat record storage through Durable Object Authority;
- source schema and seed bootstrap;
- browser IndexedDB replicas;
- HTTP cursor sync and push sync;
- generated React UI for schema-declared screens, views, tables, trees, fields, and actions;
- Site records projected into public trees and SSR documents;
- local-first workspace CLI for onboard, dev, save, check, and deploy;
- portable app and instance archives;
- explicit legacy Site project archive import;
- installed app identity and routes;
- schema-owned instance control-plane records for installs, routes, domain
  intent, and deployment intent;
- product instance, dev workbench, app, Site authoring, and published Site runtime profiles;
- owner passkey setup, owner sessions, logout, and admin bearer recovery boundaries;
- public action execution and Site contact subscription records;
- deployment desired-state versions, attempts, leases, status, and upgrade metadata;
- custom-domain planning, provider apply/delete, redirects, cleanup, and
  deployment projection paths.

## Product Direction

Formless should feel like a Cloudflare-native app runtime, not a pile of helpers.

The runtime should own:

- app installation and routing;
- durable record storage;
- schema parsing and validation;
- generated authoring surfaces;
- local browser replica and sync;
- media upload and delivery;
- auth, roles, orgs, and groups;
- queues, workflows, scheduled work, and long-running jobs;
- AI, agents, browser rendering, image optimization, video delivery, and email integration;
- deploy, backup, restore, import, and ejection paths.

The schema stays the product contract. Custom code should extend that contract
instead of replacing it.

## Design Principles

- Schema is the durable contract.
- Data stays flat; composition lives in views, queries, projections, and actions.
- Generated UI gets users to working software quickly.
- Custom UI becomes first-class when a workflow deserves a custom shape.
- Humans and agents should work over the same schema and data.
- Cloudflare primitives should have product-shaped defaults and explicit escape hatches.

## Good Next Work

Useful directions:

- prove the runtime with richer non-Site apps;
- improve generated authoring ergonomics;
- make portable archive and instance management safer in-browser;
- keep media ownership core-owned and app usage metadata app-owned;
- add provider adapters behind runtime modules;
- improve Site polish only where it unlocks real publishing use;
- add extensibility through schema-backed view registries and custom result presentations.

Avoid:

- deep platform abstraction before a real source app needs it;
- broad account or marketplace work before one deployment story is clear;
- Site-specific owned media paths outside core media;
- arbitrary custom React escape hatches as the first extensibility story;
- strategy-heavy docs that do not own work.
