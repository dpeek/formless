# Issue Tracker

Issue tracker: GitHub Issues for `dpeek/formless`.

Remote evidence: `git@github.com:dpeek/formless.git`.

Use the `gh` CLI for issue operations from this repo.

## Commands

- Create: `gh issue create --title "..." --body "..."`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open --json number,title,body,labels,comments`
- Edit body: `gh issue edit <number> --body-file <file>`
- Comment, only for discussion or escalation: `gh issue comment <number> --body "..."`
- Label: `gh issue edit <number> --add-label "..."`
- Unlabel: `gh issue edit <number> --remove-label "..."`
- Close: `gh issue close <number> --comment "..."`

## PRDs

- New PRD workstreams live in GitHub Issues.
- Use a `PRD` title prefix or a PRD label when one exists.
- Put `Branch name: <short-name>` near the top of each PRD issue body.
- Keep branch names short, lower-case, and issue-independent, for example `site-publish`.
- Ralph uses `codex/<short-name>` when the value has no slash.
- `bun ralph --branch <name>` is a one-run override, not the PRD-owned default.
- PRD issue bodies own chunks, blockers, decisions, evidence, and promotion notes.
- Use comments for human discussion, review notes, or escalation. Do not add one status comment per shipped chunk.
- Keep a `## Status` section with overall state, active chunk, latest evidence, and finalization state.
- Keep a `## Chunks` table in the issue body. Ralph uses this table to estimate default max iterations.
- Chunk statuses are `ready`, `doing`, `shipped`, `blocked`, and `closed`.
- `ready` means fully specified and safe for one agent to start.
- `doing` means one active agent owns the chunk.
- `shipped` means code, tests, checks, and issue-body evidence are complete for that chunk.
- `blocked` means work stopped with blocker evidence and likely next focus.
- `closed` means intentionally skipped or superseded.
- Chunk rows should name scope, likely files, acceptance checks, and docs impact.
- A chunk should be independently reviewable and normally end in one commit.
- Prefer one vertical user-visible or contract-visible slice over many tiny test-only follow-up chunks.
- If a chunk is too large, split the issue body before starting work.
- If implementation discovers required follow-up work, update the issue body instead of creating progress comments.
- Keep a `## Decisions` section for durable choices made during implementation.
- Keep a `## Evidence` section for latest `devstate` and browser smoke evidence.
- Keep a `## Promotion Notes` section for shipped facts that must later move to topic docs.
- Normal PRD agents add promotion notes but do not edit `doc/current.md`, `doc/roadmap.md`, or `doc/topics/*.md`.
- A PRD is implementation-complete only when required chunks are `shipped` or `closed` and promotion notes are ready for finalization.
- PRD finalization is a separate after-review pass. It rebases on local `main`, promotes notes into docs, runs `devstate check`, updates the issue body, and commits with `Fixes #<issue>`.
- Run finalization with `bun ralph finalize --issue <number>` or `bun ralph finalise --issue <number>`.
- Finalization does not merge unless explicitly requested.
- Existing `prd/*.md` files are legacy workstream records kept until retired.
- Do not create new local PRD files.
- If explicitly assigned a legacy PRD file, update only that file until it is retired.
- Retire legacy PRD files only after their useful shipped facts move into `doc/topics/*.md`.

## PRD Body Skeleton

```md
Branch name: short-name

## Status

- Overall: ready | doing | ready-for-review | finalizing | done | blocked
- Active chunk: C1 | none
- Finalization: not-started | needed | done

## Chunks

| ID  | Status | Scope                 | Files     | Acceptance                                               | Docs impact             |
| --- | ------ | --------------------- | --------- | -------------------------------------------------------- | ----------------------- |
| C1  | ready  | One reviewable slice. | `src/...` | `devstate check`; browser smoke if app behavior changes. | Promotion note or none. |

## Decisions

- Decision facts with source paths or issue context.

## Evidence

- Latest check and smoke evidence.

## Promotion Notes

- Shipped facts to promote into `doc/topics/*.md` during finalization.

## Blockers

- Current blockers, or none.
```
