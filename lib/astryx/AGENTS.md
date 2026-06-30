# Formless Astryx Agents

Package scope: `@dpeek/formless-astryx`.

Read this when editing `lib/astryx/*`.

## Owns

- Standalone Vite app for Astryx-based Formless UX iteration.
- App shell and navigation prototype code in `src/`.
- Package-local Vite and TypeScript configuration.

## Does Not Own

- Formless runtime storage, schema parsing, or generated UI behavior.
- Shared Formless UI primitives.
- Canonical product specs.

## Map

- `package.json`: package scripts and app dependencies.
- `vite.config.ts`: Vite React app config.
- `tsconfig.json`: package-local TypeScript project.
- `index.html`: Vite HTML entrypoint.
- `src/global.css`: Astryx reset, core CSS, and neutral theme imports.
- `src/main.tsx`: React root.
- `src/components/`: focused app shell modules grouped by area.

## Read Path

1. Read this file.
2. Read relevant `src/components/*.tsx` files for shell behavior.
3. Read `src/main.tsx` and `src/global.css` for setup changes.

## Rules

- Use Astryx components for layout.
- Keep custom styling out unless needed; prefer component props first.
- If custom styling is needed, use StyleX with Astryx tokens.
- Do not add app schema, seed records, runtime storage, or generated UI behavior here.
- Do not run or check devstate while iterating in this package
- Start and keep the vite dev server running so that I can see changes as you make them
- Use `bun browser` from the the repo root for browser testing (calls agent-browser)
