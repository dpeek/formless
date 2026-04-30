---
name: Formless roadmap
description: "Rough priority order for product and runtime directions after the current prototype."
last_updated: 2026-04-30
---

# Formless roadmap

1. **Compact generated list rows**: Make list views render practical row layouts with type-aware editors, accessible names, and less visible form chrome.
2. **Collection aggregates**: Support simple derived values such as items left, completed count, and overdue count from local replica collections.
3. **View display policies**: Let views choose labels, compact renderers, field order, grouping, empty states, and commit policy without becoming a full layout DSL.
4. **Relationships and ownership**: Model references between entities, starting with the question of how a user's task collection is represented.
5. **Computed fields and graphs**: Define derived values that can depend on fields, records, collections, and eventually other computed values.
6. **Lifecycle hooks**: Move special behavior such as defaults, timestamps, and domain validation into declarative create/update/delete hooks.
7. **Codec-backed custom types**: Let schema authors define new types with encode, decode, validate, edit, render, and query behavior.
8. **Declarative code attachment**: Explore how schema-owned behavior can reference trusted JavaScript or generated modules without turning every field into arbitrary code.
9. **Schema evolution**: Add explicit rules for safe field renames, type changes, deletes, and backfills once persistence compatibility matters.
10. **Optimistic view policy**: Let specific views or actions choose local echo and rollback behavior while keeping the authority canonical.
11. **Permissions and capabilities**: Separate who can read, create, patch, delete, run actions, and edit schema as the product moves beyond a single-user prototype.
12. **Debug and inspector surfaces**: Add generated admin views for records, tombstones, changes, schema versions, and sync state.
