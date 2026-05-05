# Formless Agent

Repo docs are the project memory. Keep them current and source-faithful.

## Work

1. Read `doc/overview.md`, `doc/current.md` and `doc/roadmap.md`
2. Ship the next ready chunk from that PRD.
3. Update only the assigned PRD with status, decisions, blockers, and promotion notes.
4. Verify until green:
   - `bun run test`
   - `bun run check`
5. Test app behavior when needed:
   - `bun dev`
   - Use Browser Use.
   - Kill server when done.
6. End turn with changed files, checks, and PRD status.

## Docs

- `doc/current.md` says what works today and where the code is.
- `doc/current.md` is caveman style: short, concrete, no strategy prose.
- `doc/roadmap.md` mirrors `doc/current.md`, but describes the first-release target.
- `doc/roadmap.md` is release scope, not backlog.
- Each `prd/*.md` owns one workstream.
- A PRD owns its decisions, chunks, blockers, dependencies, acceptance checks, and status.
- A normal PRD agent does not edit `doc/current.md` or `doc/roadmap.md`.
- Put shipped facts for global docs under the PRD's `Promote after ship` section.
- Update `doc/current.md` and `doc/roadmap.md` only in a docs/steward pass or when the user asks.
- Do not add a PRD index or archive unless the user asks.

## Parallel Work

- One agent owns one PRD chunk.
- Two agents can work in parallel only when they own different PRDs or disjoint chunks with disjoint files.
- Do not mark a chunk `doing` if another active agent owns it.
- Preserve user changes.

## Done

When user says `done`:

- Make sure the assigned PRD is updated.
- Run `bun run test` and `bun run check`.
- Commit.
- Rebase on main and merge.

## Rules

- Bun scripts only.
- Preserve user changes.
- Keep data model flat; compose in view/query layer.
- Claims in docs must point to code, schema, tests, or shipped behavior.
- Write short: facts, paths, status.
