# Formless overview

## What Formless is

Formless is a schema-as-data app runtime.

The schema defines:

- entities
- fields
- mutations
- queries
- views
- actions

The runtime gives that schema:

- a generated app surface
- local browser replica
- authoritative Durable Object storage
- generic edits
- named domain actions

## Why this exists

Most schema tools stop at storage and validation.
Formless should make the schema describe enough behavior to build a usable app surface.

## Core bets

- Schema is runtime data.
- Records stay flat.
- Views compose records into workspaces.
- Generic mutations handle ordinary edits.
- Named actions handle commands.
- The browser is local-first, but not authoritative.
- Field types own validation, editing, and display behavior.
- The authority owns invariants.

## Runtime shape

Short bullets for browser replica, authority, schema parser, generated UI.

## What to read next

- Current behavior: `doc/current.md`
- Release target: `doc/roadmap.md`
- Workstreams: `prd/*.md`
