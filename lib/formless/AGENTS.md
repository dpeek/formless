# Formless Package Agents

Package scope: `lib/formless`.

## Owns

- Published `@dpeek/formless` runtime and CLI package.
- `bin/formless.ts`: Bun-native package executable.
- `src/app/`: React application routes and generated runtime composition.
- `src/client/`: browser replica, projections, and generated view models.
- `src/shared/`: runtime protocols, read models, field behavior, and app identities.
- `src/worker/`: Worker routes, Authority, storage, installed apps, and public SSR.
- `src/cli/`: CLI command parsing, workspace workflows, publishing, and deployment.
- `src/test/`: package-local shared runtime fixtures.

## Boundaries

- Consume reusable `lib/<package>` capabilities through public workspace package exports.
- Keep stored records flat and compose through query, view, projection, and action layers.
- Read `src/cli/AGENTS.md` before editing CLI source.
- Keep package execution under Bun.

## Checks

- Run `bun check:packages` from the repository root.
