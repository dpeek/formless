---
name: change-finalize
description: Finalize a completed Git-backed Formless change branch without OpenSpec archive output. Use when all change metadata tasks are complete and the branch needs rebase, metadata validation, spec validation, checks, and ready-for-review state.
---

# Formless Git-backed Change Finalize

Finalize completed metadata-backed work before human review. The local finalization prompt template is [templates/local-finalize.md](templates/local-finalize.md).

## Quick Start

1. Read `AGENTS.md`.
2. Verify all required tasks in `git log --no-notes -1 --format=%B HEAD` are complete or intentionally closed.
3. Rebase on local main: `git rebase main`.
4. Validate structured metadata from the rebased tip.
5. Validate canonical specs: `openspec validate --specs --strict --no-interactive`.
6. Run `devstate check`.
7. Amend the tip metadata with finalization evidence and `Formless-Change-State: ready-for-review` using `git commit --amend --cleanup=verbatim`.
8. Validate the amended metadata: `bun agents change <change-id> --json`.
9. Leave `changes/<change-id>` as the review branch and do not merge into `main`.

## Guardrails

- Do not run `openspec archive`.
- Do not commit archived change files.
- Always use `--cleanup=verbatim` when creating or amending structured change commits. Git's default cleanup can treat Markdown `#` headings as comments and strip required metadata sections.
- Block on semantic rebase conflicts that require product, storage, security, public API, or user-intent decisions.
- Resolve only clear structural conflicts whose sides can coexist.
- Keep the worker worktree on `agents/<worker-name>`.
- Record command evidence for metadata validation, spec validation, checks, conflicts, and blockers.

## Helper Commands

```bash
bun agents change <change-id> --json
git log --no-notes -1 --format=%B HEAD
git diff --stat --find-renames main..HEAD
git rebase main
openspec validate --specs --strict --no-interactive
devstate check
git commit --amend --cleanup=verbatim
```
