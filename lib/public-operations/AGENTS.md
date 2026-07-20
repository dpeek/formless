# Formless Public Operations Agents

Package scope: `@dpeek/formless-public-operations`.

Read this when editing `lib/public-operations/*`.

## Owns

- Runtime-neutral public operation route suffix constants and helpers.
- Public operation path segment encoding and decoding.
- Public operation suffix parsing and validation.
- Target public operation route construction from a runtime-owned API route prefix.
- Browser-safe public operation request envelope, JSON submit, response guard,
  public-safe error extraction, idempotency key, and Turnstile token helpers.
- Package-local deterministic route and browser protocol contract tests.

## Does Not Own

- Target app storage identity resolution.
- Mapped-host policy, Authority routing, public operation eligibility,
  Turnstile verification, operation execution, audit storage, or notifications.
- Site records, app schemas, app records, browser state, React UI, Worker
  adapters, Node adapters, provider SDKs, or filesystem APIs.

## Map

- `package.json`: package metadata and root public export for
  `@dpeek/formless-public-operations`.
- `tsconfig.json`: package-local TypeScript project extending the repo config.
- `src/index.ts`: runtime-neutral package root entrypoint, pure route helpers,
  and browser-safe public operation protocol helpers.
- `src/*.test.ts`: package-local contract coverage.

## Read Path

1. Read this file.
2. Read `src/index.ts` when changing route or browser protocol helper behavior.
3. Read matching package-local tests when changing behavior.

## Rules

- Keep the package runtime-neutral.
- Import this package from the public root only:
  `@dpeek/formless-public-operations`.
- Do not add client, React, Worker, Node, sidecar, schema, app-record,
  challenge, notification, or operation execution subpaths.
- Do not deep-import `lib/public-operations/src/*` from external runtime code.
- Keep package tests fast, deterministic, and local.
- Do not call live networks, Cloudflare APIs, a database, or a dev server from
  package tests.
