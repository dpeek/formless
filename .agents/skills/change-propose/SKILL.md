---
name: change-propose
description: Propose a Git-backed Formless change branch with structured commit metadata. Use when creating a new Formless workstream, drafting proposal/design/tasks, or replacing OpenSpec change-directory proposal flow.
---

# Formless Git-backed Change Propose

Use local `changes/<change-id>` branches as the queue. Do not create `openspec/changes/<change-id>/` directories for new Formless work.

## Quick Start

1. Choose a kebab-case `<change-id>` and affected capability names.
2. Read the affected canonical specs under `openspec/specs/<capability>/spec.md`.
3. Check existing branches: `bun agents changes --json`.
4. Create or check out the queue branch from local main: `git checkout -b changes/<change-id> main`.
5. Draft a first-pass spec patch directly in the affected canonical spec files.
6. Write one structured metadata commit with the spec patch, proposal, design, tasks, evidence, blockers, and trailers.
7. Leave `Formless-Change-State: draft` until the first-pass spec patch and task sections are ready; set it to `ready` when workers may claim it.

## First-Pass Spec Patch

The proposal branch starts with a direct canonical spec edit. This mirrors the old OpenSpec change delta: reviewers can inspect the intended behavior as `git diff main..changes/<change-id>` before implementation starts.

- Edit only affected `openspec/specs/*/spec.md` files.
- Keep the patch source-faithful to the proposal and design.
- Capture the intended behavior at reviewable contract level; implementation workers may refine it as they ship sections.
- Do not mark the change `ready` without a first-pass spec patch unless the work is docs or workflow-only and the metadata records why no capability spec changes.

## Change Commit

Use this commit message shape:

- Make the first line an active change summary, for example `Instance overview deployment split cleanup`.

```md
<active change summary>

## Proposal

<what and why>

## Design

<how, constraints, decisions>

## Tasks

### 1. <section>

- [ ] 1.1 <task>

## Evidence

- First-pass spec patch added to `openspec/specs/<capability>/spec.md`.
- Proposal metadata created.

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
git add openspec/specs/<capability>/spec.md
git commit -F <message-file>
```

## Guardrails

- The branch tip commit message is authoritative working memory.
- Git notes and untracked files are not authoritative proposal, design, task, evidence, blocker, or state storage.
- The branch diff against local `main` is the review delta.
- A ready proposal branch includes both structured commit metadata and a first-pass canonical spec patch.
- Shipped spec facts go directly in canonical `openspec/specs/*/spec.md` files on the branch.
- Do not run `openspec new change`, `openspec instructions apply`, or `openspec archive` for new Formless Git-backed changes.
