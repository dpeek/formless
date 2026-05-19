# Site CLI And Publish

Last updated: 2026-05-19

## Current Facts

- Package CLI entrypoint source: `src/site/cli.ts`.
- Site project config source: `src/site/project-config.ts`.
- Site project source helpers: `src/site/project-source.ts`.
- Site source snapshot helpers: `src/site/source-snapshot.ts`.
- Site seed promotion helpers: `src/site/seed-promotion.ts`.
- Site publish workflow source: `src/site/publish.ts`.
- Editing and publish workflow source: `src/site/editing-publish-workflow.test.ts`.
- Local browser publish client: `src/client/local-publish.ts`.
- Local publish UI: `src/app/local-site-publish.tsx`.
- Site project files: `formless.config.json`, `site.records.json`, and `media/`.

## CLI Commands

- `formless init <dir>` creates `formless.config.json`, `site.records.json`, and starter media.
- `formless dev` runs the local public preview and `/admin` editor.
- `formless save` writes local Site edits back to project source files.
- `formless deploy setup` stores deploy config and local admin token.
- `formless publish` deploys code, media, and records.

## Publish Rules

- Browser IndexedDB is not the source of truth for publish.
- Save and publish read from the local Authority state.
- Publish backs up live data before restore.
- Publish restores media before records.
- Publish uses guarded snapshot restore.
- Local Site admin publish is brokered by the CLI dev server.
- Browser publish receives only a localhost broker endpoint and token.

## Key Tests

- CLI tests: `src/site/cli.test.ts`.
- Project config tests: `src/site/project-config.test.ts`.
- Project source tests: `src/site/project-source.test.ts`.
- Source snapshot tests: `src/site/source-snapshot.test.ts`.
- Seed promotion tests: `src/site/seed-promotion.test.ts`.
- Publish tests: `src/site/publish.test.ts`.
- Local publish client tests: `src/client/local-publish.test.ts`.
- Editing publish workflow tests: `src/site/editing-publish-workflow.test.ts`.
