# Issue Tracker

Tracker: GitHub Issues for `dpeek/formless`.

Remote: `git@github.com:dpeek/formless.git`.

Use `gh` CLI from repo root.

## Commands

- Create: `gh issue create --title "..." --body "..."`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open --json number,title,body,labels,comments`
- Edit body: `gh issue edit <number> --body-file <file>`
- Comment, only discussion or escalation: `gh issue comment <number> --body "..."`
- Label: `gh issue edit <number> --add-label "..."`
- Unlabel: `gh issue edit <number> --remove-label "..."`
- Close: `gh issue close <number> --comment "..."`

## PRDs

- New PRD workstreams live in GitHub Issues.
- Local OpenSpec worker workstreams live in committed `openspec/changes/<change-id>/` directories and use `doc/agents/local-agent-workers.md`.
- GitHub Issues are not required for local OpenSpec worker queue, locks, or status.
- Use `PRD` title prefix or PRD label when one exists.
- Put `Branch name: <short-name>` near top of issue body.
- Branch names: short, lower-case, issue-independent. Example: `site-publish`.
- Ralph uses `codex/<short-name>` when branch has no slash.
- `bun ralph --branch <name>` is one-run override, not PRD default.
- Issue body owns chunks, blockers, decisions, evidence, promotion notes.
- Comments are for human discussion, review, escalation.
- No per-chunk status comments.

## Body Shape

- `## Status`: overall state, active chunk, latest evidence, finalization state.
- `## Chunks`: table with chunk id, status, scope, files, acceptance, docs impact.
- `## Decisions`: durable choices with source paths or issue context.
- `## Evidence`: latest `devstate` and browser smoke evidence.
- `## Promotion Notes`: facts to promote into specs during finalization.
- `## Blockers`: current blockers, or none.

## Chunk Rules

- Statuses: `ready`, `doing`, `shipped`, `blocked`, `closed`.
- `ready`: fully specified and safe for one agent.
- `doing`: one active agent owns it.
- `shipped`: code, tests, checks, issue-body evidence done.
- `blocked`: stopped with blocker evidence and likely next focus.
- `closed`: skipped or superseded.
- One chunk should be independently reviewable.
- One chunk normally ends in one commit.
- Prefer one vertical user-visible or contract-visible slice.
- If chunk too large, split issue body before starting.
- If implementation finds follow-up, update issue body.
- Normal PRD agent adds promotion notes but does not edit specs unless user asks.
- Implementation complete only when required chunks are `shipped` or `closed`.

## Finalization

- Finalization is after review.
- Rebase on local `main`.
- Resolve clear conflicts.
- Promote notes into relevant `openspec/specs/*/spec.md`.
- Run `devstate check`.
- Update issue body.
- Commit with `Fixes #<issue>`.
- Do not merge unless user asks.
- Run with `bun ralph finalize --issue <number>` or `bun ralph finalise --issue <number>`.
- Local OpenSpec worker finalization is part of `bun agents watch <worker-name>` before the branch is marked ready for review.

## PRD Body Skeleton

```md
Branch name: short-name

## Status

- Overall: ready | doing | ready-for-review | finalizing | done | blocked
- Active chunk: C1 | none
- Finalization: not-started | needed | done

## Chunks

| ID  | Status | Scope                 | Files     | Acceptance                                               | Docs impact     |
| --- | ------ | --------------------- | --------- | -------------------------------------------------------- | --------------- |
| C1  | ready  | One reviewable slice. | `src/...` | `devstate check`; browser smoke if app behavior changes. | Promotion note. |

## Decisions

- Decision facts with source paths or issue context.

## Evidence

- Latest check and smoke evidence.

## Promotion Notes

- Shipped facts to promote into `openspec/specs/*/spec.md` during finalization.

## Blockers

- Current blockers, or none.
```
