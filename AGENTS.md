# Formless Agent

Repo docs are the project memory. Keep them current and source-faithful.

## Work

1. Run `bun start` and read `./tmp/agent-dev.json`, `./tmp/test.txt`, and `./tmp/check.txt`
1. Read `doc/overview.md`, `doc/current.md` and `doc/roadmap.md`
1. Ship the next ready chunk from the assigned PRD.
1. Update only the assigned PRD with status, decisions, blockers, and promotion notes.
1. Read `./tmp/agent-dev.json`, `./tmp/test.txt`, and `./tmp/check.txt` and fix issues
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
- Update `doc/current.md` and `doc/roadmap.md` only in a docs/steward pass or when the user asks.

## Parallel Work

- One agent owns one PRD chunk.
- Two agents can work in parallel only when they own different PRDs or disjoint chunks with disjoint files.
- Do not mark a chunk `doing` if another active agent owns it.
- Preserve user changes.

## Done

When user says `done`:

- Update assigned PRD
- Run `bun stop` and fix issues.
- Commit.
- Rebase on main and merge.

## Rules

- Bun scripts only.
- `bun start` owns dev, test, and check output.
- Do not run `vp test`, `vp check`, `bun test`, or `bun check` manually during normal agent work.
- Use `./tmp/agent-dev.json`, `./tmp/test.txt`, and `./tmp/check.txt` as check evidence.
- Keep stdout logs in `./tmp/*.txt`.
- Do not use `./tmp/*.pid`; process IDs live in `./tmp/agent-dev.json`.
- Preserve user changes.
- Keep data model flat; compose in view/query layer.
- Claims in docs must point to code, schema, tests, or shipped behavior.
- Write short: facts, paths, status.
