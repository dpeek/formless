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
1. Ship exactly one ready chunk from the assigned GitHub PRD issue or legacy local PRD.
1. Update only the assigned workstream body with chunk status, decisions, blockers, evidence, and promotion notes.
1. Read `./.devstate/status.md` and fix issues
1. Test app with `bun browser ...` if app behavior changed
1. End turn with changed files, checks, and PRD status.

## Docs

- `doc/current.md` is the shipped behavior index.
- Topic docs say what works today and where the code is.
- Topic docs are caveman style: short, concrete, no strategy prose.
- `doc/README.md` owns the agent read map.
- `doc/topics/*.md` own topic-focused shipped facts.
- `doc/roadmap.md` describes possible directions for next work.
- `doc/roadmap.md` is direction map, not shipped behavior or backlog.
- New PRDs live in GitHub Issues.
- Existing `prd/*.md` files are legacy workstream records until retired.
- Do not create new local PRD files.
- A PRD issue or legacy PRD file owns its decisions, chunks, blockers, dependencies, acceptance checks, and status.
- GitHub PRD issue bodies are canonical. Do not add one progress comment per chunk.
- Normal chunk statuses are `ready`, `doing`, `shipped`, `blocked`, and `closed`.
- Mark only one chunk `doing` at a time for your workstream.
- A normal PRD agent does not edit `doc/current.md`, `doc/roadmap.md`, or `doc/topics/*.md`.
- Put shipped facts for global docs under the PRD's promotion notes.
- Update `doc/current.md`, `doc/roadmap.md`, and `doc/topics/*.md` only in a PRD finalization/doc-steward pass or when the user asks.
- PRD finalization happens after implementation review. It rebases on local `main`, resolves clear conflicts, promotes PRD promotion notes into topic docs, runs `devstate check`, updates the issue body, and creates the closing commit with `Fixes #<issue>`.

## Parallel Work

- One agent owns one workstream chunk.
- Two agents can work in parallel only when they own different workstreams or disjoint chunks with disjoint files.
- Do not mark a chunk `doing` if another active agent owns it.
- Do not split work into tiny follow-up chunks unless the PRD body already defines them or a blocker forces a new chunk.
- Preserve user changes.

## Finalization

When user asks to finalize a PRD after review:

- Use `bun ralph finalize --issue <issue>` or `bun ralph finalise --issue <issue>` for the automated finalization pass.
- Verify all required chunks are `shipped` or intentionally `closed`.
- Rebase on local `main` with `git rebase main`, not `origin/main`.
- Resolve rebase conflicts when the resolution is clear; stop and ask when unsure.
- Promote PRD promotion notes into `doc/current.md`, `doc/roadmap.md`, and relevant `doc/topics/*.md`.
- Update the assigned PRD issue body or legacy PRD file.
- Run `devstate check` and fix issues.
- Run `devstate stop`
- Commit with `Fixes #<issue>` for GitHub PRDs.
- Do not merge unless the user explicitly asks.

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
