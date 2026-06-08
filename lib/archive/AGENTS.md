# Formless Archive Agents

Package scope: `@dpeek/formless-archive`.

Read this when editing `lib/archive/*`.

## Owns

- Portable archive kinds, version constants, envelope contracts, parsers, and formatters.
- Archive compatibility normalizers.
- Restore planning contracts and deterministic dry-run planning helpers.
- Local Node archive directory read/write adapters.
- Package-local tests for archive contracts, normalizers, planning, and Node adapters.

## Does Not Own

- CLI command parsing or terminal output.
- Archive export orchestration or restore apply execution.
- Authority storage, Durable Object writes, browser replica state, app records, bundled app schemas, or media storage mutation.
- Provider credentials, Cloudflare resources, Alchemy state, deployment execution, or workspace operation policy.
- Browser UI, React components, client HTTP adapters, Worker route handlers, or sidecar runtime.

## Map

- `package.json`: public exports for `.` and `./node`.
- `tsconfig.json`: package-local TypeScript project extending the repo config.
- `src/types.ts`: public archive contract declarations plus archive parser and formatter behavior.
- `src/normalizers.ts`: compatibility normalizers for supported older archive input.
- `src/restore-plan.ts`: runtime-neutral restore dry-run planner and plan contracts.
- `src/index.ts`: runtime-neutral root export entrypoint.
- `src/node.ts`: local Node archive directory IO; no React, browser, Worker, or provider imports.
- `src/*.test.ts`: package-local contract and adapter coverage.

## Read Path

1. Read this file.
2. Read `src/types.ts` for public contract facts.
3. Read only the relevant helper or adapter file for the task: `src/normalizers.ts`, `src/restore-plan.ts`, or `src/node.ts`.
4. Read matching package-local tests when changing behavior.

## Rules

- Keep app records flat.
- Keep root and type entrypoints runtime-neutral.
- Keep CLI policy, Worker restore apply, Authority storage, media mutation, provider execution, and workspace operation policy outside this package.
- Import this package from public subpaths only: `@dpeek/formless-archive` or `@dpeek/formless-archive/node`.
- Do not deep-import `lib/archive/src/*` from external runtime code.
- Keep package tests fast and local. Use temporary directories, fixed ids, fixed clocks, and fixed payloads.
- Do not call live networks, Cloudflare APIs, provider APIs, or a dev server from package tests.
- During normal agent work, use repo `devstate`.
