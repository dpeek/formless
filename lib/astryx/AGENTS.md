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
- Keep prototypes focused on real product behaviour. Avoid proof badges, labels, descriptions and prototype cruft where possible. Where we need to explore multiple states, keep the UI for doing so minimal (see auth layout for and example)
- Do not invent shit. UI labels, icons, colors, states, disabled reasons, primary actions, hidden behavior, and semantic affordances must come from the passed data, Astryx component contract, or an explicit user request.
- Don't start the dev server, I've got one running at http://localhost:5173 and don't worry about browser testing, I'll provide feedback. Just check types.
