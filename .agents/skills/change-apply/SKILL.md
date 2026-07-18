---
name: change-apply
description: Implement one ready task section from a Git-backed Formless change branch. Use when applying, continuing, or fixing implementation work for local Formless change branches.
---

# Formless Git-backed Change Apply

Implement exactly one ready task section from the change commit metadata, then stop. The local worker prompt template is [templates/local-implement.md](templates/local-implement.md).

## Quick Start

1. Read `AGENTS.md`.
2. Query parsed metadata: `bun agents change <change-id> --json`.
3. Read authoritative metadata: `git log --no-notes -1 --format=%B HEAD`.
4. Select the next task section with unchecked tasks before broad context reads.
5. Inspect the branch delta: `git diff --stat --find-renames main..HEAD` and `git diff --name-status --find-renames main..HEAD`.
6. Implement only the selected section.
7. Run `devstate check`.
8. Amend the branch tip with code changes, completed task checkboxes, evidence, blockers if any, and updated trailers: `git add -A` then `git commit --amend --cleanup=verbatim`.
9. Validate the amended metadata: `bun agents change <change-id> --json`.

## Worker Guardrails

- Stay on `agents/<worker-name>` and update the branch tip; do not merge into `main`.
- Always use `--cleanup=verbatim` when creating or amending structured change commits. Git's default cleanup can treat Markdown `#` headings as comments and strip required metadata sections.
- Do not cross into another task section.
- Preserve user changes.
- Keep data flat and compose in query, view, projection, and action layers.
- Record changed files, check evidence, browser smoke evidence when app behavior changed, blockers, and split guidance in commit metadata.
- Stop with `<blocked/>` when the selected section is too large, internally inconsistent, or crosses unclear architecture, storage, security, public API, or design boundaries.
- Do not run `openspec instructions apply`, `openspec status --change`, or `openspec archive` for Git-backed Formless changes.

## Helper Commands

```bash
bun agents changes --json
bun agents change <change-id> --json
git log --no-notes -1 --format=%B HEAD
git diff --stat --find-renames main..HEAD
git diff --name-status --find-renames main..HEAD
devstate check
git commit --amend --cleanup=verbatim
```
