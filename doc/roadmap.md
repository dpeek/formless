---
name: Formless roadmap
description: "Rough priority order for product and runtime directions after the current prototype."
last_updated: 2026-04-30
---

## Application schema evaluation

Build a small corpus of existing application schemas and run each one through the current Formless model. Track which concepts fit, which fail, and which failures deserve runtime support.

## Relationships and ownership

Define how entities refer to each other, including required references, optional references, inverse names, and ownership rules such as project-owned tasks or account-owned contacts.

## Reference field type

Add a first reference field type that stores target record IDs, validates target entity names, and gives the rest of the runtime a concrete relationship primitive.

## Relationship-aware queries

Extend the portable query model so views and actions can filter by reference fields and simple parent scopes without custom code.

## Multi-entity generated shell

Move the generated app shell beyond the first list entity. Add navigation and view selection for schemas with several related entities.

## Relationship editors and displays

Render reference fields with useful labels, selectors, and scoped create flows so generated views remain usable for connected records.

## Lifecycle rules and constraints

Move defaults, required checks, relationship existence checks, timestamps, and domain validation into declarative create and patch rules.

## Delete and referential behavior

Implement generic delete with tombstones, then add relationship behavior such as restrict, nullify, or cascade where the schema allows it.

## Compact generated rows

Make generated rows denser now that collection query tabs and derived count badges have landed. Focus this slice on scan-friendly row layout, field display policy, and compact inline editors.

## Schema evolution and inspection

Add compatibility reports, richer safe schema-change rules, and generated inspector views for records, schema versions, query and view declarations, changes, and sync state.
