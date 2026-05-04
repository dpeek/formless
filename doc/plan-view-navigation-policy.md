---
name: View navigation policy
description: "Plan to let schema keep admin/debug collection views while choosing primary navigation."
last_updated: 2026-05-04
---

# View navigation policy

Status: shipped on `main`

## Must read

- `schema/samples/rate-card.json`
- `src/shared/schema.ts`
- `src/shared/schema.test.ts`
- `src/client/views.ts`
- `src/client/views.test.ts`
- `src/app.tsx`
- `src/app.test.tsx`

## Goal

Let a schema keep standalone collection views for admin/debug use without forcing them into the primary generated workspace navigation.

The rate-card sample should open primarily on `rateHome` while retaining `resourceHome` and `cardHome` as valid collection views.

## Current note

This plan is kept as a reference for the already-shipped primary navigation slice. On `main`, collection views support `navigation.primary`, the rate-card sample marks `rateHome` as primary, and `resourceHome`/`cardHome` remain valid non-primary collection views.

## Approach

Add an optional nested navigation policy to collection views:

```json
"navigation": {
  "primary": false
}
```

Default `primary` to `true` when omitted. This keeps existing schemas unchanged and makes the rate-card sample explicit.

Keep model selection for all collection views available to tests and future admin routes. Add a separate primary selector for the home route.

## Rules

- Do not delete `resourceHome` or `cardHome`.
- Do not hard-code rate-card view names.
- Do not make hidden/admin routing in this slice.
- Keep the schema shape reversible and additive.

## Open questions

- Should non-primary views get a generated debug URL now, or should that wait until admin routing exists?
- Should navigation policy eventually include ordering and grouping?

## Success criteria

- Existing schemas without `navigation` behave as they do today.
- Rate-card primary home navigation shows only `rateHome`.
- `resourceHome` and `cardHome` still parse and can still be selected by all-view model helpers.
- `bun run test` passes.
- `bun run check` passes.
- Browser smoke shows the rate-card workspace as the primary surface after resetting to the rate-card sample.

## Tasks

1. Extend collection view schema.
   - Files: `src/shared/schema.ts`, `src/shared/schema.test.ts`
   - Add optional `navigation.primary`.
   - Reject unsupported navigation keys and non-boolean `primary`.

2. Carry navigation into view models.
   - Files: `src/client/views.ts`, `src/client/views.test.ts`
   - Keep `selectCollectionModels` returning all collection models.
   - Add `selectPrimaryCollectionModels` or equivalent for primary navigation.

3. Update the home route.
   - Files: `src/app.tsx`, `src/app.test.tsx`
   - Use primary collection models for generated home navigation.
   - Preserve fallback behavior if no view explicitly marks itself primary.

4. Update the rate-card sample.
   - File: `schema/samples/rate-card.json`
   - Mark `rateHome.navigation.primary` as `true`.
   - Mark `resourceHome` and `cardHome` as `false`.

5. Verify browser behavior.
   - Run `bun run test`.
   - Run `bun run check`.
   - Smoke the app after rate-card reset if the local browser target is available.

## Non-goals

- No admin/debug route.
- No view ordering or grouping.
- No permissions model.
- No deletion of fallback collection views.
