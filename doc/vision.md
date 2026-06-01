# Formless Vision

Last updated: 2026-06-01

Purpose: big-picture product vision for Formless V1.

This is not shipped behavior. Shipped behavior lives in `openspec/specs/*/spec.md`.

This is not a backlog. Backlog and ideas live in `doc/roadmap.md`. Work starts
when a committed OpenSpec change owns the work.

## North Star

Formless is a schema-as-data app runtime for building custom software on
Cloudflare.

One command should give a person or agent a flexible data store in the cloud,
with a generated app, durable storage, sync, auth, media, and deploy paths ready
by default.

From there, humans and agents should be able to shape the runtime into a custom
workflow app without writing the same boilerplate for storage, screens, forms,
permissions, media, jobs, email, and deployment every time.

## Product Promise

Define the app once. Run it many ways.

An app definition should be able to describe:

- records, fields, relationships, queries, read models, views, screens, and
  actions;
- the generated UI humans use to inspect and edit records;
- the API and data surfaces agents use to read, write, and automate work;
- public outputs such as HTML, Markdown, JSON, feeds, and printable documents;
- the Cloudflare primitives the app needs.

The runtime should turn that definition into a working cloud app with strong
defaults and clear escape hatches.

## Current Anchors

- App schema already defines entities, fields, relationships, mutations,
  queries, read models, views, screens, and actions.
- Durable Object Authority storage, browser IndexedDB replicas, HTTP sync, and
  push sync already exist.
- Generated React app surfaces already render schema-declared screens,
  collections, tables, trees, fields, and actions.
- Site already proves one definition can produce generated admin UI and public
  HTML output.
- `formless onboard` already creates a local Formless workspace before
  Cloudflare mutation.
- `formless deploy` is the explicit Cloudflare deployment boundary for a saved
  workspace.
- Portable app and instance archives already prove backup, restore, and import
  plumbing.

## V1 Shape

V1 should make Formless feel like a Cloudflare-native app runtime, not a library
of unrelated helpers.

The runtime owns:

- app installation and routing;
- durable record storage;
- schema parsing and validation;
- generated authoring surfaces;
- local browser replica and sync;
- media upload and delivery;
- auth, roles, orgs, and groups;
- queues, workflows, scheduled work, and long-running jobs;
- AI, agents, browser rendering, image optimization, video delivery, and email
  integration;
- deploy, backup, restore, import, and ejection paths.

The schema stays the product contract. Custom code extends that contract instead
of replacing it.

## Cloudflare Boundary

Formless should wrap Cloudflare primitives in product-shaped defaults:

- Workers and Assets for the runtime shell, API routes, and public output.
- Durable Objects for authority, storage invariants, sync, and app-local state.
- R2 for media originals, generated artifacts, backups, and portable archives.
- Queues for async jobs and fan-out work.
- Workflows for durable multi-step processes.
- Agents and AI Gateway for agentic app behavior and model access.
- Browser Rendering for capture, scrape, preview, and document generation jobs.
- Stream and media transformations for video delivery and derived media.
- Image optimization for responsive public and admin image output.
- Email integration for inbound and outbound product workflows.

The user should not have to start by learning every primitive. The runtime
should provide the first useful path for each primitive, then expose the
underlying Cloudflare concepts when the app needs more control.

## App Definition

An app definition should be a portable, inspectable object.

It should describe:

- flat stored record types;
- field behavior, validation, defaults, and generated editors;
- relationships over stored references;
- queries and read models;
- generated views and screens;
- actions and mutations;
- public routes and output formats;
- automation hooks;
- auth and permission rules;
- integration adapters;
- import, export, and archive behavior.

The runtime should keep data flat and compose richer behavior in the query, view,
projection, and action layers.

## Surfaces

One definition should be able to expose multiple surfaces:

- generated admin UI for humans;
- compact custom UI for a specific workflow;
- public HTML for sites and documents;
- Markdown for content, summaries, and agent-readable output;
- JSON for APIs, automation, and app-to-app exchange;
- feeds, sitemaps, and metadata for public publishing;
- email templates and notifications;
- background-job inputs and outputs.

Generated UI should be the default starting point. Custom UIs should be
first-class when a workflow deserves a custom shape.

## Human And Agent Workflows

Formless should treat humans and agents as collaborators over the same app
definition and data.

Humans need:

- fast generated screens;
- safe edits;
- permissions;
- clear history;
- workflow-specific views;
- understandable deployment and backup controls.

Agents need:

- stable schemas;
- typed data surfaces;
- action contracts;
- Markdown and JSON output;
- safe write paths;
- background jobs;
- audit trails and permission boundaries.

The goal is not generic UI generation for its own sake. The goal is custom-fit
software where agents and humans can both see the domain model and do useful
work.

## Batteries And Escape Hatches

Formless should remove boilerplate without trapping the project.

Built in:

- passkey auth;
- roles;
- orgs and groups;
- app installs;
- admin and public surfaces;
- media;
- email templates;
- common Cloudflare primitive adapters;
- backup, restore, and import;
- local development;
- cloud deployment.

Escape hatches:

- raw schema source editing;
- custom generated view presentations;
- app-specific action handlers;
- custom UI surfaces;
- direct primitive configuration when defaults are too small;
- portable archives;
- ejection into a normal Cloudflare project when ownership matters more than
  runtime convenience.

The happy path should be terse. The advanced path should be explicit.

## One-Command Experience

The target first impression:

```sh
formless onboard
formless dev
```

Those commands should create a reviewable local Formless workspace, run the
product instance locally, and let the user explore before deploying.

From the browser, the user should be able to:

- create the owner identity;
- install or create an app;
- edit the app schema;
- use the generated UI immediately;
- add media, auth, email, jobs, and AI capabilities when the workflow needs
  them;
- save workspace archives locally;
- deploy the workspace to Cloudflare when ready;
- publish or expose the app through HTML, Markdown, JSON, and custom UI
  surfaces.

## Product Principles

- Schema is the durable contract.
- Data stays flat; composition lives in views, queries, projections, and actions.
- Generated UI gets the user to working software quickly.
- Custom UI exists for workflows where generic screens are not enough.
- Cloudflare primitives are wrapped, not hidden forever.
- Local, remote, backup, restore, and ejection paths are part of the product.
- Agents and humans use the same domain model.
- Boilerplate should disappear before power disappears.

## Open Questions

- What is the exact V1 command sequence after `formless onboard`?
- Which Cloudflare primitive gets the next first-class adapter after core
  instance and media work?
- What is the smallest useful permission model for passkeys, roles, orgs, and
  groups?
- What does ejection produce: a generated Worker project, an app package, an
  archive, or all three?
- Which public output formats are V1: HTML, Markdown, JSON, feeds, PDF, or email?
- What is the first agent-native workflow that proves schema, actions, AI, jobs,
  and permissions together?
