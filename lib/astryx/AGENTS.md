# Formless Renderer Agents

Package scope: `@dpeek/formless-astryx`.

Read this when editing `lib/astryx/*`.

## Owns

- Astryx-backed Formless Renderer presentation for application and public Site
  surfaces.
- Renderer-neutral Formless UI contracts and stable React contract hosts.
- Application and Site assembly, providers, StyleX presentation, and CSS entries.
- Standalone Vite fixture explorer and package-local build configuration.

## Does Not Own

- Formless runtime storage, schema parsing, projections, route policy, effects, or
  write planning.
- Renderer-neutral Site contracts, public form sessions, or Site runtime behavior.
- Canonical product specs.

## Map

- `package.json`: documented package subpaths, scripts, and dependencies.
- `vite.config.ts`: fixture-explorer Vite config.
- `tsconfig.json`: package-local TypeScript project.
- `index.html`: Vite HTML entrypoint.
- `src/formless-ui-contract*.ts*`: renderer-neutral contracts and hosts.
- `src/application-*`: production application assembly, provider, and CSS.
- `src/site-*`: production public Site renderer and provider.
- `src/components/`: application, generated-field, management, auth, access, and
  Site presentation.
- `src/global.css`: public Site reset, core CSS, and neutral theme imports.
- `src/main.tsx`, `src/root.tsx`: fixture-explorer entry and layout catalog.

## Read Path

1. Read this file.
2. Read the relevant exported contract, provider, assembly, or renderer.
3. Read focused `src/components/*` implementation and tests.
4. Read the matching CSS entry or fixture-explorer files only when changing them.

## Rules

- Use **Formless Renderer** for product behavior and **Astryx** only for concrete
  package, component, token, StyleX, CSS, or source facts.
- Keep Formless UI contracts and hosts renderer-neutral.
- Consume projected contract facts and dispatch canonical intents. Do not read app
  records, parse schema, execute operations, or plan writes in renderer code.
- Use Astryx components for layout and controls.
- Keep custom styling out unless needed; prefer component props first.
- If custom styling is needed, use StyleX with Astryx tokens.
- Do not add app schema, seed records, runtime storage, or generated UI behavior here.
- Keep fixture layouts focused on real product behavior and representative contract
  states. Avoid migration proof UI and prototype cruft.
- UI labels, icons, colors, states, disabled reasons, primary actions, hidden
  behavior, and semantic affordances must come from passed contract data, concrete
  Astryx component behavior, or an explicit product requirement.
- Use repository-owned `devstate` checks. Do not start a separate package dev
  server during normal agent work.
