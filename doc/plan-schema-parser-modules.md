---
name: Schema parser modules
description: "Plan to split schema parsing by concern while keeping the public schema API stable."
last_updated: 2026-05-04
---

# Schema parser modules

Status: implemented

## Must read

- `src/shared/schema.ts`
- `src/shared/schema.test.ts`
- `src/shared/query.ts`
- `src/shared/fields.ts`
- `src/client/views.ts`
- `src/worker/authority.ts`

## Goal

Keep `parseAppSchema` strict and well-tested while splitting the implementation by schema concern.

`src/shared/schema.ts` is now responsible for type definitions, field parsing, mutation policy parsing, action parsing, query/view cross-reference checks, table view parsing, helper validation, and JSON stringification. That is too much surface area for continued schema growth.

## Approach

Keep `src/shared/schema.ts` as the public facade. Extract private implementation into sibling modules because a `src/shared/schema/` directory would conflict with the existing `schema.ts` file.

Suggested modules:

- `src/shared/schema-types.ts`
- `src/shared/schema-parse-helpers.ts`
- `src/shared/schema-fields.ts`
- `src/shared/schema-mutations.ts`
- `src/shared/schema-actions.ts`
- `src/shared/schema-views.ts`

The public import path should remain:

```ts
import { parseAppSchema, type AppSchema } from "./shared/schema.ts";
```

## Rules

- Preserve exact-key validation.
- Preserve current error messages unless a test needs to be updated for a clearer message.
- Do not switch to a broad Zod schema unless there is a concrete benefit.
- Do not add new schema features in the same patch.
- Keep cross-reference validation explicit and readable.

## Open questions

- Should schema type definitions stay in `schema.ts` until the split is stable?
- Should parser helpers be exported only for tests, or tested through `parseAppSchema`?

## Success criteria

- `src/shared/schema.ts` becomes a small facade around type exports, `parseAppSchema`, and `stringifySchema`.
- Field, mutation/action, and view parsing are independently readable.
- Existing schema tests continue to pass.
- `bun run test` passes.
- `bun run check` passes.

## Tasks

1. Extract shared parser helpers.
   - Files: `src/shared/schema.ts`, `src/shared/schema-parse-helpers.ts`
   - Move `isRecord`, `assertExactKeys`, string parsers, and small enum parsers where practical.

2. Extract field parsing and field-schema types.
   - Files: `src/shared/schema-fields.ts`, `src/shared/schema-types.ts`
   - Keep built-in field shapes unchanged.
   - Keep default validation unchanged.

3. Extract mutation and action parsing.
   - Files: `src/shared/schema-mutations.ts`, `src/shared/schema-actions.ts`
   - Preserve create hook validation and action target validation.

4. Extract view parsing.
   - Files: `src/shared/schema-views.ts`
   - Preserve collection context validation, result validation, table columns, and action slots.

5. Keep the public facade stable.
   - File: `src/shared/schema.ts`
   - Re-export the same public types and functions.
   - Update internal imports only.

## Non-goals

- No schema format changes.
- No generated code.
- No runtime plugin system.
- No broad parser rewrite.
