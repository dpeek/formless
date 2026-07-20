# Formless Media Agents

Package scope: `@dpeek/formless-media`.

Read this when editing `lib/media/*`.

## Owns

- Public media contract declarations and constants in `src/types.ts`.
- Runtime-neutral media helpers exported from the package root.
- Browser/client image upload, list, response parsing, asset-option, and image-dimension adapters.
- Worker/runtime media request routing, image upload/list/restore/delivery orchestration, and provider object-store adapters.

## Does Not Own

- App schema parsing.
- App records or Authority app storage.
- Generic generated form layout, labels, validation placement, or commit policy.
- Generic UI primitives.
- Site usage metadata such as alt text, caption, crop, slot, focal point, poster override, width, height, or fallback href.
- Provider-specific URLs in app records.

## Map

- `package.json`: public exports for `.`, `./client`, and `./worker`.
- `tsconfig.json`: package-local TypeScript project extending the repo config.
- `src/types.ts`: import-free versioned public contract declarations.
- `src/index.ts`: runtime-neutral root entrypoint and pure helpers.
- `src/client.ts`: browser/client HTTP adapter entrypoint; no React import.
- `src/worker.ts`: Worker/runtime adapter entrypoint; no React import.
- `src/*.test.ts`: package-local contract and adapter coverage.

## Read Path

1. Read this file.
2. Read `src/types.ts` for public contract facts.
3. Read only the relevant entrypoint for the task: `src/index.ts`, `src/client.ts`, or `src/worker.ts`.
4. Read matching package-local tests when changing behavior.

## Rules

- Keep app records flat.
- Keep provider storage details outside app records.
- Keep root and type entrypoints runtime-neutral.
- Import this package from public subpaths only: `@dpeek/formless-media`, `@dpeek/formless-media/client`, or `@dpeek/formless-media/worker`.
- Do not deep-import `lib/media/src/*` from external runtime code.
- Keep package tests fast and local. Use fake fetchers, fake stores, fixed ids, and fixed payloads.
- Do not call live networks, Cloudflare APIs, or a dev server from package tests.
