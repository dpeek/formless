# Formless Presentation Agents

Package scope: `@dpeek/formless-presentation`.

Read this when editing `lib/presentation/*`.

## Owns

- Renderer-neutral Formless UI contracts, references, and intents.
- Stable contract-host types, reference helpers, and memory-host behavior.
- The React contract-host provider and scoped subscription hooks.
- Focused contract and host coverage.

## Does Not Own

- Renderer components, styling, themes, CSS, or provider presentation.
- Runtime storage, browser replicas, schema parsing, routing, effects, operation
  execution, or write planning.
- Public Site projection, renderer props, form sessions, SSR document behavior,
  or browser adapters.
- Canonical product specs.

## Map

- `package.json`: explicit contract, contract-host, and React host exports.
- `tsconfig.json`: package-local TypeScript project.
- `src/formless-ui-contract.ts`: renderer-neutral contracts, references, and intents.
- `src/formless-ui-contract-host.ts`: host types, reference helpers, validation,
  publication, and memory host.
- `src/formless-ui-contract-host-react.tsx`: React provider and subscription hooks.
- `src/*contract-host.test.tsx`: package-local contract and host coverage.

## Read Path

1. Read this file.
2. Read the relevant contract, host, or React adapter.
3. Read the matching package-local tests when changing behavior.

## Rules

- Keep Formless UI contracts and hosts renderer-neutral.
- Import this package only through `@dpeek/formless-presentation/contract`,
  `@dpeek/formless-presentation/contract-host`, or
  `@dpeek/formless-presentation/contract-host/react` outside this package.
- Keep snapshots display-safe and immutable at the host boundary.
- Keep reference identity stable and subscriptions scoped.
- Dispatch canonical intents without executing runtime effects.
- Do not import the Renderer package, root `src/*`, or the Site implementation
  package.
- Keep package tests fast, deterministic, and local.
- Use repository-owned `devstate` checks.
