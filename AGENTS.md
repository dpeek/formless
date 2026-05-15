# Formless Agent

Repo docs are the project memory. Keep them current and source-faithful.

## Agent skills

### Issue tracker

Issues use GitHub Issues for `dpeek/formless`; PRD workstreams stay in `prd/*.md`. See `doc/agents/issue-tracker.md`.

### Triage labels

Use the default five-label triage vocabulary. See `doc/agents/triage-labels.md`.

### Domain docs

Single-context repo: read root `CONTEXT.md` and `doc/adr/` when a skill needs domain memory. See `doc/agents/domain.md`.

## Work

1. Run `devstate start` and read `./.devstate/status.md`
1. Read `doc/overview.md`, `doc/current.md` and `doc/roadmap.md`
1. Ship the next ready chunk from the assigned PRD.
1. Update only the assigned PRD with status, decisions, blockers, and promotion notes.
1. Read `./devstate/status.md` and fix issues
1. Test app with `bun browser ...` if app behavior changed
1. End turn with changed files, checks, and PRD status.

## Docs

- `doc/current.md` says what works today and where the code is.
- `doc/current.md` is caveman style: short, concrete, no strategy prose.
- `doc/roadmap.md` mirrors `doc/current.md`, but describes the first-release target.
- `doc/roadmap.md` is release scope, not backlog.
- Each `prd/*.md` owns one workstream.
- A PRD owns its decisions, chunks, blockers, dependencies, acceptance checks, and status.
- A normal PRD agent does not edit `doc/current.md` or `doc/roadmap.md`.
- Put shipped facts for global docs under the PRD's `Promote after ship` section.
- Update `doc/current.md` and `doc/roadmap.md` only in a doc/steward pass or when the user asks.

## Parallel Work

- One agent owns one PRD chunk.
- Two agents can work in parallel only when they own different PRDs or disjoint chunks with disjoint files.
- Do not mark a chunk `doing` if another active agent owns it.
- Preserve user changes.

## Done

When user says `done`:

- Update assigned PRD
- Run `devstate check` and fix issues.
- Run `devstate stop`
- Commit.
- Rebase on main and merge.

## Rules

- Bun scripts only
- `devstate` owns dev, test, and check output
- Do not run `vp test`, `vp check`, `bun test`, or `bun check` manually during normal agent work
- Use `./.devstate/status.md` as check evidence.
- Preserve user changes.
- Keep data model flat; compose in view/query layer.
- Tests must not depend on exact `schema/apps/site/seed-records.json` content; use `src/test/site-records.ts` fixtures for Site record shape.
- Claims in docs must point to code, schema, tests, or shipped behavior.
- Write short: facts, paths, status.
