# Formless Tasks App Agents

Package scope: `@dpeek/formless-tasks-app`.

Read this when editing `lib/tasks-app/*`.

## Owns

- Tasks app package manifest in `formless.app.json`.
- Tasks source schema in `schema.json`.
- Tasks source seed records in `seed-records.json`.
- Runtime-neutral Tasks package contracts in `src/`.

## Does Not Own

- App install identity, route records, Authority storage, browser replicas, sync, or media storage.
- Generic generated UI layout, schema parsing, archive envelopes, deploy execution, or workspace operation policy.

## Map

- `package.json`: package metadata and exported root and source JSON subpaths.
- `tsconfig.json`: package-local TypeScript project extending the repo config.
- `formless.app.json`: runtime-neutral Tasks app package manifest.
- `schema.json`: flat Tasks app schema source.
- `seed-records.json`: stored-record shaped Tasks starter records.
- `src/types.ts`: versioned public Tasks package constants.
- `src/index.ts`: runtime-neutral Tasks package exports.

## Rules

- Keep Tasks records flat.
- Keep source schema and seed records as package source data, not generated runtime state.
- During normal agent work, use repo `devstate`.
