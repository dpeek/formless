---
name: Foundation plans
description: "Execution order for architecture hardening before larger Formless feature work."
last_updated: 2026-05-04
---

# Foundation plans

These plans capture the foundation work to do before layering many more product features onto the current runtime.

The core architecture should stay intact:

- flat app-owned records
- schema-owned views, queries, mutations, and actions
- Durable Object authority backed by SQLite
- browser IndexedDB replica
- generic mutations for ordinary edits
- named actions for commands

The risk is not that the model is wrong. The risk is that more features will concentrate too much behavior in a few files and rely on conventions that should become explicit authority guarantees.

## Suggested order

1. [Atomic authority writes](./plan-atomic-authority-writes.md)
2. [Schema constraints](./plan-schema-constraints.md)
3. [Generated runtime modules](./plan-generated-runtime-modules.md)
4. [Schema parser modules](./plan-schema-parser-modules.md)
5. [Field type adapters](./plan-field-type-adapters.md)
6. [View navigation policy](./plan-view-navigation-policy.md) (already shipped on `main`; keep as reference)

## Notes

- `plan-view-navigation-policy.md` is shipped on `main`. Keep it as a reference plan and do not reimplement it.
- The refactor plans should preserve behavior first. Do not mix broad module moves with semantic changes unless a task explicitly calls for it.
- The authority and constraint plans should land before derived rate behavior or richer rate-card actions.
