---
name: change-finalize
description: Finalize a completed Git-backed Formless change branch without OpenSpec archive output. Use when all change metadata tasks are complete and the branch needs rebase, metadata validation, spec validation, checks, and ready-for-review state.
---

# Formless Git-backed Change Finalize

Finalize completed metadata-backed work before human review. The local finalization prompt template is [templates/local-finalize.md](templates/local-finalize.md).

## Quick Start

1. Run `devstate start`.
2. Read `AGENTS.md`.
3. Verify all required tasks in `git log --no-notes -1 --format=%B HEAD` are complete or intentionally closed.
4. Rebase on local main: `git rebase main`.
5. Validate structured metadata from the rebased tip.
6. Validate canonical specs: `openspec validate --specs --strict --no-interactive`.
7. Reuse latest `devstate check` evidence only when finalization did not invalidate it; otherwise run `devstate check`.
8. Amend the tip metadata with finalization evidence and `Formless-Change-State: ready-for-review`.
9. Leave `changes/<change-id>` as the review branch and do not merge into `main`.

## Guardrails

- Do not run `openspec archive`.
- Do not commit archived change files.
- Block on semantic rebase conflicts that require product, storage, security, public API, or user-intent decisions.
- Resolve only clear structural conflicts whose sides can coexist.
- Keep the worker worktree on `agents/<worker-name>`.
- Record command evidence for metadata validation, spec validation, reused or rerun checks, conflicts, and blockers.

## Helper Commands

```bash
bun agents change <change-id> --json
git log --no-notes -1 --format=%B HEAD
git diff --stat --find-renames main..HEAD
git rebase main
openspec validate --specs --strict --no-interactive
devstate check
git commit --amend
```
