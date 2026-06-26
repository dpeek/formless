# Formless CRM App Agents

Package scope: `@dpeek/formless-crm-app`.

Read this when editing `lib/crm-app/*`.

## Owns

- CRM app package manifest in `formless.app.json`.
- CRM source schema in `schema.json`.
- CRM source seed records in `seed-records.json`.
- Runtime-neutral CRM package contracts in `src/`.

## Does Not Own

- App install identity, route records, Authority storage, browser replicas, sync, or media storage.
- Site subscribe form writes, Site-owned subscriber records, public CRM write routes, or email queue execution.
- Generic generated UI layout, schema parsing, archive envelopes, deploy execution, or workspace operation policy.

## Map

- `package.json`: package metadata and exported root and source JSON subpaths.
- `tsconfig.json`: package-local TypeScript project extending the repo config.
- `formless.app.json`: runtime-neutral CRM app package manifest.
- `schema.json`: flat CRM app schema source.
- `seed-records.json`: stored-record shaped CRM starter records.
- `src/types.ts`: versioned public CRM package constants.
- `src/index.ts`: runtime-neutral CRM package exports.

## Rules

- Keep CRM records flat.
- Keep source schema and seed records as package source data, not generated runtime state.
- Do not add public CRM subscribe writes or email sending here.
- During normal agent work, use repo `devstate`.
