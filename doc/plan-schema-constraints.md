---
name: Schema constraints
description: "Plan to add authority-enforced uniqueness and invariant constraints."
last_updated: 2026-05-04
---

# Schema constraints

Status: implemented

## Must read

- `doc/overview.md`
- `schema/samples/rate-card.json`
- `src/shared/schema.ts`
- `src/worker/authority.ts`
- `src/worker/storage.ts`
- `src/worker/actions.ts`
- `src/worker/authority.test.ts`
- `src/shared/schema.test.ts`

## Goal

Move important domain invariants out of UI conventions and into the authority.

The first constraints should protect the rate-card model:

- only one active `rate` per `(resource, card)`
- eventually only one active default card

## Approach

Add a narrow schema-owned constraints model and enforce it for create, patch, and action-created records.

Start with tuple uniqueness because it protects the join-record lifecycle directly:

```json
"constraints": {
  "uniqueRatePair": {
    "kind": "unique",
    "fields": ["resource", "card"]
  }
}
```

Then add partial uniqueness only when needed for default cards:

```json
"constraints": {
  "oneDefaultCard": {
    "kind": "uniqueWhere",
    "fields": ["isDefault"],
    "where": {
      "kind": "where",
      "ref": { "kind": "value", "name": "isDefault" },
      "op": "eq",
      "value": true
    }
  }
}
```

The first implementation can scan active records in the Durable Object rather than generating SQLite indexes. The important foundation is semantic enforcement in one authority path.

## Rules

- Constraints are authority guarantees, not view hints.
- Constraints apply to generic create, generic patch, and named actions that create or update records.
- Soft-deleted records do not participate in uniqueness checks.
- Do not make the rate table responsible for preventing duplicates.
- Keep error messages stable enough for tests.

## Open questions

- Should partial uniqueness use the existing query expression model or a smaller predicate shape?
- Should constraint violations return field-specific errors later, or is a request-level error enough for now?

## Success criteria

- Duplicate `rate(resource, card)` records are rejected by the authority.
- `rate.regenerateMissingRates` remains idempotent even if duplicate creation is attempted.
- Patch mutations cannot move an existing rate onto another rate's `(resource, card)` pair.
- Existing schemas without constraints still parse and run.
- `bun run test` passes.
- `bun run check` passes.

## Tasks

1. Parse entity constraints.
   - Files: `src/shared/schema.ts`, `src/shared/schema.test.ts`
   - Add optional `constraints` to entities.
   - Validate field names, required field counts, and allowed constraint kinds.
   - Reject empty constraints and unsupported keys.

2. Enforce uniqueness for generic mutations.
   - Files: `src/worker/authority.ts`, `src/worker/storage.ts`, `src/worker/authority.test.ts`
   - Validate create values before inserting.
   - Validate merged patch values before updating.
   - Ignore the record being patched.

3. Enforce constraints for action-created records.
   - Files: `src/worker/actions.ts`, `src/worker/storage.ts`, `src/worker/authority.test.ts`
   - Ensure `create-missing-join-records` cannot write duplicate pairs even if selection logic misses one.

4. Update the rate-card sample.
   - File: `schema/samples/rate-card.json`
   - Add `uniqueRatePair` on the `rate` entity.
   - Add default-card uniqueness only after the partial predicate shape is implemented.

5. Add schema update compatibility checks.
   - File: `src/worker/authority.ts`
   - Reject adding a constraint when existing active records violate it.

## Non-goals

- No SQL index generation in the first slice.
- No foreign key cascade behavior.
- No delete mutation.
- No permissions model.
- No user-facing conflict resolution UI.
