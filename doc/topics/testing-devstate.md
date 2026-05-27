# Testing And Devstate

Last updated: 2026-05-27

## Current Facts

- `devstate` owns dev, test, and check output.
- Start dev tools: `devstate start`.
- Run checks: `devstate check`.
- Stop dev tools: `devstate stop`.
- Use `./.devstate/status.md` as check evidence.
- Normal agent work does not run `vp test`, `vp check`, `bun test`, or `bun check` manually.
- Browser smoke runs with `bun browser ...` when app behavior changed.
- Current dev URL comes from `./.devstate/status.md`.
- Product instance local launch scripts use `FORMLESS_LAUNCH_FIXTURE`.
- `bun run dev:instance` starts product instance profile with the `default-site` fixture.
- `bun run dev:instance:empty` starts product instance profile with the `empty` fixture.
- `bun run dev:instance:multi-site` starts product instance profile with the `multi-site` fixture.
- The `mixed-apps` launch fixture is available through `FORMLESS_LAUNCH_FIXTURE=mixed-apps`.
- Fixture selection changes initial installed app state, not route shape.

## Main Test Anchors

- App tests: `src/app.test.tsx`.
- Runtime profile tests: `src/app/runtime-profile.test.ts`.
- Schema parser tests: `src/shared/schema.test.ts`.
- Schema app tests: `src/shared/schema-apps.test.ts`, `src/worker/schema-apps.test.ts`.
- App install registry tests: `src/shared/app-installs.test.ts`.
- App storage identity tests: `src/shared/app-storage-identity.test.ts`.
- Launch fixture tests: `src/shared/launch-fixtures.test.ts`, `src/worker/launch-fixtures.test.ts`, `src/worker/launch-fixture-startup.test.ts`.
- Portable archive tests: `src/shared/archive.test.ts`, `src/shared/archive-restore-plan.test.ts`, `src/worker/archive-restore.test.ts`, `src/worker/archive-api.test.ts`.
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
- Runtime topology tests: `src/shared/runtime-topology.test.ts`.
- Authority tests: `src/worker/authority.test.ts`.
- Worker routing tests: `src/worker/routing.test.ts`.
- Storage tests: `src/worker/storage.test.ts`.
- Site tree tests: `src/site/tree.test.ts`.
- Site media tests: `src/worker/media.test.ts`, `src/client/media.test.ts`.
- Core media tests: `src/media/core.test.ts`.
- Site source media tests: `src/site/source-media.test.ts`.
- Site project source media tests: `src/site/project-source.test.ts`.
- Site project archive import tests: `src/site/project-archive.test.ts`.
- Archive API tests: `src/worker/archive-api.test.ts`.
- Generated format tests: `src/app/generated/format.test.ts`.
- Generated field UI adapter tests: `src/app/generated/field-ui-adapters.test.ts`.
- Generated record field authoring tests: `src/app/generated/record-field-authoring.test.ts`.
- Generated record field control tests: `src/app/generated/record-field-control.test.tsx`.
- Generated record field renderer model tests: `src/app/generated/record-field-renderer-model.test.ts`.
- Generated create field authoring tests: `src/app/generated/create-field-authoring.test.ts`.
- Generated authoring tests: `src/client/generated-authoring.test.ts`.
- Schema Builder tests: `src/client/schema-builder.test.ts`, `src/app/routes/schema-draft.test.ts`.
- Shared ObjectList tests: `lib/ui/src/object-list.test.tsx`.
- Shared SVG icon tests: `lib/ui/src/svg-icon.test.tsx`.

## Test Helpers

- Schema builder helpers: `src/test/schema-builders.ts`.
- Protocol bootstrap helpers: `src/test/protocol-builders.ts`.
- Generated table render helpers: `src/test/generated-table.tsx`.
- Site editor test helpers: `src/test/site-editor.ts`.
- Authority write test helpers: `src/test/authority-write.ts`.
- Site record fixtures: `src/test/site-records.ts`.
- Instance workspace tests fake target clients and deployment adapters.
- Site tests use Site record fixtures, not exact `schema/apps/site/seed-records.json` content.

## Browser Smoke

- Browser smoke is required when visible app behavior changes.
- ObjectList smoke script: `bun run smoke:object-list`.
- Browser smoke is skipped for docs-only changes.
- Browser smoke is skipped for parser-only or test-only changes unless the parser change affects rendered app behavior.
- Record smoke evidence in the owning GitHub issue or legacy PRD during transition.
