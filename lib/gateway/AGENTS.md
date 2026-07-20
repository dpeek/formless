# Formless Gateway Agents

Package scope: `@dpeek/formless-gateway`.

Read this when editing `lib/gateway/*`.

## Owns

- Public workspace gateway contract declarations and constants in `src/types.ts`.
- Runtime-neutral route, intent, parsing, and wire-safety helpers exported from the package root.
- Transport-facing aliases for Workspace operation request and response shapes.
- Browser/client workspace gateway fetch, retry, response parsing, and client error behavior.
- Worker/runtime workspace gateway proxy mechanics, request checks, and display-safe response forwarding.
- Local Node sidecar HTTP routing helpers and sidecar request/response adapters.

## Does Not Own

- Owner session cookies or owner setup state.
- Runtime topology selection or route eligibility policy.
- Workspace save, check, pull, push, deploy, cleanup, or credential setup execution.
- Semantic workspace operation input, result, event, log, summary, redaction, or persistence contracts.
- CLI runtime adapter modules that inject operation execution, owner session, and route eligibility dependencies.
- Operation persistence implementation.
- Filesystem source writes or ignored workspace state storage.
- Provider credentials, provider mutation, Alchemy state, or Cloudflare mutation.
- Authority storage, app records, control-plane records, or bundled app schemas.

## Map

- `package.json`: public exports for `.`, `./client`, `./worker`, and `./sidecar`.
- `tsconfig.json`: package-local TypeScript project extending the repo config.
- `src/types.ts`: versioned public gateway contract declarations; imports Workspace semantic operation contracts instead of redefining them.
- `src/index.ts`: runtime-neutral root entrypoint and pure helpers.
- `src/client.ts`: browser/client HTTP adapter entrypoint; no React import.
- `src/worker.ts`: Worker/runtime proxy adapter entrypoint; no React import.
- `src/sidecar.ts`: local Node sidecar adapter entrypoint; no React import.
- `src/*.test.ts`: package-local contract and adapter coverage.

## Read Path

1. Read this file.
2. Read `src/types.ts` for public contract facts.
3. Read only the relevant entrypoint for the task: `src/index.ts`, `src/client.ts`, `src/worker.ts`, or `src/sidecar.ts`.
4. Read matching package-local tests when changing behavior.

## Rules

- Keep app records flat.
- Keep root and type entrypoints runtime-neutral.
- Keep owner sessions, runtime topology, operation execution, operation storage, filesystem writes, and provider mutation injected by runtime adapters.
- Import this package from public subpaths only: `@dpeek/formless-gateway`, `@dpeek/formless-gateway/client`, `@dpeek/formless-gateway/worker`, or `@dpeek/formless-gateway/sidecar`.
- Do not deep-import `lib/gateway/src/*` from external runtime code.
- Keep package tests fast and local. Use fake fetchers, fake sidecars, fixed ids, fixed clocks, and fixed payloads.
- Do not call live networks, Cloudflare APIs, provider APIs, or a dev server from package tests.
