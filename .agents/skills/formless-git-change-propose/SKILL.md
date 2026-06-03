---
name: formless-git-change-propose
description: Propose a Git-backed Formless change branch with structured commit metadata. Use when creating a new Formless workstream, drafting proposal/design/tasks, or replacing OpenSpec change-directory proposal flow.
---

# Formless Git-backed Change Propose

Use local `changes/<change-id>` branches as the queue. Do not create `openspec/changes/<change-id>/` directories for new Formless work.

## Quick Start

1. Choose a kebab-case `<change-id>` and affected capability names.
2. Check existing branches: `bun agents changes --json`.
3. Create or check out the queue branch from local main: `git checkout -b changes/<change-id> main`.
4. Write one structured metadata commit with proposal, design, tasks, evidence, blockers, and trailers.
5. Leave `Formless-Change-State: draft` until the task sections are ready; set it to `ready` when workers may claim it.

## Metadata Commit

Use this commit message shape:

```md
<title>

## Proposal

<what and why>

## Design

<how, constraints, decisions>

## Tasks

### 1. <section>

- [ ] 1.1 <task>

## Evidence

- Proposal created.

## Blockers

-

Formless-Change-Id: <change-id>
Formless-Change-Version: 1
Formless-Change-State: ready
Formless-Capabilities: <capability-a>, <capability-b>
Formless-Last-Evidence-At:
```

Concrete commit command:

```bash
git commit --allow-empty -F <message-file>
```

## Guardrails

- The branch tip commit message is authoritative working memory.
- Git notes and untracked files are not authoritative proposal, design, task, evidence, blocker, or state storage.
- The branch diff against local `main` is the review delta.
- Shipped spec facts go directly in canonical `openspec/specs/*/spec.md` files on the branch.
- Do not run `openspec new change`, `openspec instructions apply`, or `openspec archive` for new Formless Git-backed changes.
