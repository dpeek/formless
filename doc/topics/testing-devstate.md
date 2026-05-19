# Testing And Devstate

Last updated: 2026-05-19

## Current Facts

- `devstate` owns dev, test, and check output.
- Start dev tools: `devstate start`.
- Run checks: `devstate check`.
- Stop dev tools: `devstate stop`.
- Use `./.devstate/status.md` as check evidence.
- Normal agent work does not run `vp test`, `vp check`, `bun test`, or `bun check` manually.
- Browser smoke runs with `bun browser ...` when app behavior changed.
- Current dev URL comes from `./.devstate/status.md`.

## Main Test Anchors

- App tests: `src/app.test.tsx`.
- Schema parser tests: `src/shared/schema.test.ts`.
- Schema app tests: `src/shared/schema-apps.test.ts`, `src/worker/schema-apps.test.ts`.
- Protocol tests: `src/shared/protocol.test.ts`.
- Query tests: `src/shared/query.test.ts`.
- Read-model tests: `src/shared/read-model.test.ts`.
- Field behavior tests: `src/shared/field-types.test.ts`.
- View model tests: `src/client/views.test.ts`.
- Sync tests: `src/client/sync.test.ts`.
- Local DB tests: `src/client/db.test.ts`.
- Store tests: `src/client/store.test.ts`.
- Browser replica projection tests: `src/client/projections.test.ts`.
- Readiness tests: `src/client/readiness.test.ts`.
- Authority tests: `src/worker/authority.test.ts`.
- Storage tests: `src/worker/storage.test.ts`.
- Site tree tests: `src/site/tree.test.ts`.
- Site media tests: `src/worker/media.test.ts`, `src/client/media.test.ts`.
- Site source media tests: `src/site/source-media.test.ts`.
- Generated format tests: `src/app/generated/format.test.ts`.
- Generated field UI adapter tests: `src/app/generated/field-ui-adapters.test.ts`.
- Generated authoring tests: `src/client/generated-authoring.test.ts`.
- Shared SVG icon tests: `lib/ui/src/svg-icon.test.tsx`.

## Test Helpers

- Schema builder helpers: `src/test/schema-builders.ts`.
- Protocol bootstrap helpers: `src/test/protocol-builders.ts`.
- Generated table render helpers: `src/test/generated-table.tsx`.
- Site editor test helpers: `src/test/site-editor.ts`.
- Authority write test helpers: `src/test/authority-write.ts`.
- Site record fixtures: `src/test/site-records.ts`.
- Site tests use Site record fixtures, not exact `schema/apps/site/seed-records.json` content.

## Browser Smoke

- Browser smoke is required when visible app behavior changes.
- Browser smoke is skipped for docs-only changes.
- Browser smoke is skipped for parser-only or test-only changes unless the parser change affects rendered app behavior.
- Record smoke evidence in the owning GitHub issue or legacy PRD during transition.
