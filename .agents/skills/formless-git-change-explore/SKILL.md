---
name: formless-git-change-explore
description: Explore Formless Git-backed change ideas and branch metadata without implementing. Use when brainstorming, investigating, clarifying requirements, or reviewing a `changes/<change-id>` branch before propose/apply/finalize work.
---

# Formless Git-backed Change Explore

Explore before implementation. Read code, specs, branch metadata, and diffs as needed; do not change files unless the user explicitly asks to capture the decision.

## Quick Start

1. List local change branches: `bun agents changes --json`.
2. Inspect a specific change: `bun agents change <change-id> --json`.
3. Read authoritative metadata: `git log --no-notes -1 --format=%B changes/<change-id>`.
4. Inspect the review delta: `git diff --stat --find-renames main..changes/<change-id>` and `git diff --name-status --find-renames main..changes/<change-id>`.
5. Read only the canonical specs, docs, and code relevant to the question.

## Guardrails

- Exploration is not implementation.
- Do not create `openspec/changes/<change-id>/` directories for new Formless work.
- Do not run `openspec archive`.
- Treat Git notes and untracked files as non-authoritative.
- When work is ready to formalize, use `formless-git-change-propose`.
- When implementation starts, use `formless-git-change-apply`.
- When all tasks are complete, use `formless-git-change-finalize`.
