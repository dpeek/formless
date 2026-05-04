---
name: Field type adapters
description: "Plan to centralize built-in field behavior before adding richer types."
last_updated: 2026-05-04
---

# Field type adapters

Status: proposed

## Must read

- `doc/overview.md`
- `src/shared/schema.ts`
- `src/shared/fields.ts`
- `src/shared/query.ts`
- `src/worker/authority.ts`
- `src/client/views.ts`
- `src/app.tsx`
- `src/app.test.tsx`

## Goal

Turn built-in field types into small behavior bundles instead of repeated `if (field.type === ...)` branches scattered across parsing, validation, query support, defaults, and rendering.

This is the foundation for money, percent, markdown, richer references, and computed display values.

## Approach

Introduce a shared field-type behavior registry first, then add UI adapters after the generated runtime modules are split.

Shared behavior should cover:

- supported query operators
- allowed editors
- default commit policy
- create default support
- authority value validation
- stored value validation
- display formatting primitives where they do not require React

UI behavior can stay in React modules initially, but should call the same shared type metadata rather than duplicating default policies.

## Rules

- Do not create a public plugin API in this slice.
- Do not change the schema format.
- Do not add money or percent as stored types yet.
- Keep view-owned commit policy as the override point.
- Keep authority validation canonical.

## Open questions

- Should formatting live fully in shared code, or should shared code return normalized display primitives for React to render?
- Should `reference` be one adapter or a family of relationship adapters later?

## Success criteria

- Default commit policy comes from field type behavior, not a local branch in `src/client/views.ts`.
- Field catalog filter operators come from field type behavior, not a local branch in `src/shared/fields.ts`.
- Authority value validation delegates per-type checks to shared behavior.
- Existing editor rendering behaves the same.
- `bun run test` passes.
- `bun run check` passes.

## Tasks

1. Add shared field type behavior.
   - New file: `src/shared/field-types.ts`
   - Define behavior for `text`, `boolean`, `date`, `number`, `enum`, and `reference`.
   - Keep behavior statically registered.

2. Use behavior in field catalogs and view models.
   - Files: `src/shared/fields.ts`, `src/client/views.ts`
   - Replace local branches for filter ops and default commit policy.

3. Use behavior in authority validation.
   - Files: `src/worker/authority.ts`, maybe `src/shared/value-validation.ts`
   - Move per-type field value checks out of the route file.
   - Keep reference existence checks in authority/storage because they need records.

4. Prepare UI adapter boundary.
   - Files: generated runtime modules after `plan-generated-runtime-modules.md`
   - Keep React components local, but route editor selection through a narrow adapter function.

5. Add tests around behavior parity.
   - Files: `src/shared/fields.test.ts` if added, `src/client/views.test.ts`, `src/worker/authority.test.ts`
   - Verify current built-in type behavior stays unchanged.

## Non-goals

- No dynamic field type loading.
- No custom app-defined React components.
- No new stored value types.
- No computed graph engine.
