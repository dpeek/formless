# Formless Agent

Repo docs are the project memory. Keep them current and source-faithful.

## Agent skills

### Issue tracker

Issues and new PRDs use GitHub Issues for `dpeek/formless`. Legacy `prd/*.md` files remain until retired. See `doc/agents/issue-tracker.md`.

### Triage labels

Use the default five-label triage vocabulary. See `doc/agents/triage-labels.md`.

### Domain docs

Single-context repo: read root `CONTEXT.md` and relevant topic docs when a skill needs domain memory. See `doc/agents/domain.md`.

## Work

1. Run `devstate start` and read `./.devstate/status.md`
1. Read `doc/README.md`, `CONTEXT.md`, `doc/current.md`, `doc/roadmap.md`, and relevant topic docs.
1. Ship the next ready chunk from the assigned GitHub PRD issue or legacy local PRD.
1. Update only the assigned workstream with status, decisions, blockers, and promotion notes.
1. Read `./.devstate/status.md` and fix issues
1. Test app with `bun browser ...` if app behavior changed
1. End turn with changed files, checks, and PRD status.

## Docs

- `doc/current.md` is the shipped behavior index.
- Topic docs say what works today and where the code is.
- Topic docs are caveman style: short, concrete, no strategy prose.
- `doc/README.md` owns the agent read map.
- `doc/topics/*.md` own topic-focused shipped facts.
- `doc/roadmap.md` describes the first-release target.
- `doc/roadmap.md` is release scope, not backlog.
- New PRDs live in GitHub Issues.
- Existing `prd/*.md` files are legacy workstream records until retired.
- Do not create new local PRD files.
- A PRD issue or legacy PRD file owns its decisions, chunks, blockers, dependencies, acceptance checks, and status.
- A normal PRD agent does not edit `doc/current.md`, `doc/roadmap.md`, or `doc/topics/*.md`.
- Put shipped facts for global docs under the PRD's promotion notes.
- Update `doc/current.md`, `doc/roadmap.md`, and `doc/topics/*.md` only in a doc/steward pass or when the user asks.

## Parallel Work

- One agent owns one workstream chunk.
- Two agents can work in parallel only when they own different workstreams or disjoint chunks with disjoint files.
- Do not mark a chunk `doing` if another active agent owns it.
- Preserve user changes.

## Done

When user says `done`:

- Update assigned PRD issue or legacy PRD file.
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
