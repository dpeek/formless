# Formless

Formless is a schema-as-data app runtime for building custom software on Cloudflare.

One app definition describes records, fields, relationships, queries, read models, views, screens, actions, public output, and deploy behavior. The runtime turns that definition into storage, sync, generated UI, media, public pages, archives, and deploy paths.

This README is the human overview. Agent instructions live separately in `AGENTS.md`.

## Quick Start

Create a standalone Site project:

```sh
npx @dpeek/formless init my-site
cd my-site
npx @dpeek/formless dev
```

Common commands:

- `formless init <dir>` creates `formless.config.json` and `site.records.json`.
- `formless dev` runs local public preview and `/admin` editor.
- `formless save` writes local Site edits back to project source files.
- `formless deploy setup` stores deploy config and local admin token.
- `formless publish` deploys code, media, and records.

## Packages

- `@dpeek/formless`: Site runtime and CLI package.
- `@dpeek/formless-ui`: shared browser primitives for generated runtime surfaces.

## Current Shape

The runtime already has:

- app schemas for Tasks, Estii, and Site;
- flat record storage through Durable Object Authority;
- source schema and seed bootstrap;
- browser IndexedDB replicas;
- HTTP cursor sync and push sync;
- generated React UI for schema-declared screens, views, tables, trees, fields, and actions;
- Site records projected into public trees and SSR documents;
- standalone Site project CLI;
- local save and publish flows;
- portable app and instance archives;
- installed app identity and routes;
- product instance, dev workbench, app, Site authoring, and published Site runtime profiles;
- custom-domain planning and provider apply paths.

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

The schema stays the product contract. Custom code should extend that contract instead of replacing it.

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
