## Context

Current local workers already coordinate through Git state: leases live under the Git common directory, worker branches use `agents/<worker-name>`, review branches use `changes/<change-id>`, and final review remains a human merge boundary. The OpenSpec-specific parts still embedded in `scripts/agents.ts` are queue discovery from committed `openspec/changes/<change-id>/` directories, task state from `openspec instructions apply`, prompt rendering around OpenSpec artifacts, and finalization through `openspec validate <change-id>` plus `openspec archive <change-id> --yes`.

The new workflow keeps the branch and lease model but changes the change record. A change is a `changes/<change-id>` branch created from local `main`. Its tip commit message stores proposal, design, tasks, evidence, blocker, and metadata. Its diff from `main` stores the implementation and direct canonical spec changes. The lasting repository documentation after merge is the canonical spec diff and normal Git history, not an archived change directory.

## Goals / Non-Goals

**Goals:**

- Remove tracked `openspec/changes/archive/*` output from completed local worker changes.
- Make the review diff show code and canonical spec changes directly against `main`.
- Preserve one active worker lease per change, named worker worktrees, idle rebase maintenance, and the human merge boundary.
- Provide a machine-readable query API for change branches, task state, evidence, blockers, and ready-for-review status.
- Keep worker prompts self-contained and concrete, without asking workers to infer OpenSpec artifact state manually.
- Make repo-owned skills the single source for Git-backed change workflow instructions.

**Non-Goals:**

- Do not migrate historical archived OpenSpec changes.
- Do not introduce an external queue or status store.
- Do not use Git notes as authoritative proposal, design, task, or status storage.
- Do not require multi-commit finalization in v1; one change commit is the default.
- Do not preserve backwards compatibility with the old committed OpenSpec change-directory queue.

## Decisions

### Decision: Use `changes/<change-id>` branches as the queue

Workers SHALL discover claimable work by scanning local `changes/*` refs and parsing the tip commit metadata. A branch is claimable when its metadata is valid, its state allows implementation, it has remaining task work, and no active lease blocks it.

This replaces `git ls-tree main -- openspec/changes` discovery. Branch existence becomes the change object, while the existing lease directory remains the ownership guard.

Alternative considered: keep committed proposal directories on `main` but drop archive output. That reduces final noise but keeps two sources of truth during implementation: branch commits plus change files.

### Decision: Store change memory in structured commit messages

The tip commit message SHALL use stable Markdown sections for human content and Git trailers for machine metadata.

Proposed section names:

- `Proposal`
- `Design`
- `Tasks`
- `Evidence`
- `Blockers`

Proposed trailers:

- `Formless-Change-Id`
- `Formless-Change-Version`
- `Formless-Change-State`
- `Formless-Capabilities`
- `Formless-Last-Evidence-At`

The parser treats trailers as authoritative for identifiers and state. The Markdown sections carry the agent-readable working memory.

Alternative considered: Git notes. Notes are hidden from normal review, require extra fetch/push configuration, and are easy to detach from rebased or amended commits, so they are not suitable as primary workflow state.

### Decision: Add helper commands instead of relying on manual message edits

`bun agents` SHOULD expose a small change query/update API around Git commit messages. Implementation can live in `scripts/agents.ts` initially or split into a local module if that keeps tests focused.

Useful commands:

- `bun agents changes --json`
- `bun agents change <change-id> --json`
- `bun agents change init <change-id>`
- `bun agents change evidence <change-id> ...`
- `bun agents change state <change-id> <state>`

Workers can still read the commit message directly, but status, queue discovery, and evidence updates should use parser/formatter helpers.

### Decision: Merge prompt docs into repo-owned skills

The Git-backed workflow SHALL use repo-owned skills as the single authored instruction surface. New skills should cover propose, apply, finalize, and exploration for Formless changes. The supervisor can render implementation and finalization prompts from those skill definitions or adjacent templates inside the same skill directories, but workflow rules should not live in separate `doc/agents/local-openspec-*` files.

`doc/agents/local-agent-workers.md` can remain as human and supervisor reference for branch lifecycle, leases, and status semantics. The old `doc/agents/local-openspec-implement.md` and `doc/agents/local-openspec-finalize.md` content should be removed, generated from, or folded into the new skill-owned prompt material.

The existing `.agents/skills/openspec-*` skills should become legacy OpenSpec-only wrappers or be replaced after active OpenSpec directory changes are gone. New work should route agents to Formless Git-backed skills so the skill name and body match the workflow.

Alternative considered: keep prompt docs in `doc/agents` and update them for Git-backed branches. That preserves the current supervisor integration but leaves two instruction surfaces for agents to reconcile.

### Decision: Directly edit canonical specs on the branch

The branch diff SHALL include updates to `openspec/specs/*/spec.md` when shipped behavior changes. Finalization validates canonical specs with `openspec validate --specs --strict --no-interactive` instead of applying OpenSpec deltas through archive.

This makes spec conflicts normal Git conflicts during rebase and removes the archive promotion step.

### Decision: Keep one change commit by default

Implementation sessions SHOULD update the branch tip and amend the structured commit message as task state and evidence change. Finalization MAY split a branch into logical commits only when the implementation naturally needs separate review chunks. The v1 ready-for-review contract remains valid with a single commit.

This changes the current "do not amend" OpenSpec section-commit rule for this workflow. The amend behavior is intentional because the commit message is the working memory.

### Decision: Finalization validates metadata, rebases, checks, and publishes

Finalization SHALL:

- Rebase `agents/<worker-name>` on local `main`.
- Resolve structural conflicts and block on semantic conflicts.
- Validate structured change metadata.
- Validate canonical specs.
- Reuse prior `devstate check` evidence only when rebase and finalization did not invalidate it.
- Run `devstate check` when code changed, conflicts were resolved, generated output changed, or evidence validity is unclear.
- Publish the finalized tip to `changes/<change-id>` and mark the lease `ready-for-review`.

Finalization SHALL NOT run `openspec archive` and SHALL NOT commit archived change files.

## Risks / Trade-offs

- Commit-message edits can be awkward -> provide parser/formatter helper commands and cover them with tests.
- A single commit can hide reviewable implementation phases -> allow optional finalization splitting, but keep one commit as the default contract.
- Direct canonical spec edits can conflict more often during rebase -> treat those as normal Git conflicts and block only on semantic product/spec conflicts.
- Removing OpenSpec delta validation loses one guardrail -> replace it with structured metadata validation plus strict canonical spec validation.
- Existing worker prompt docs, repo skills, and AGENTS text reference OpenSpec artifacts heavily -> consolidate workflow instructions into repo-owned Git-backed skills and update AGENTS in the same change as supervisor behavior.

## Migration Plan

1. Add branch metadata parser/formatter tests and helper functions.
2. Switch discovery and status commands from OpenSpec artifact directories to `changes/*` branch metadata.
3. Add repo-owned Git-backed change skills and migrate implementation/finalization prompt content from `doc/agents/local-openspec-*` into those skill definitions or skill-local templates.
4. Replace OpenSpec archive finalization with metadata validation, canonical spec validation, and check evidence handling.
5. Update `AGENTS.md`, `doc/agents/local-agent-workers.md`, and legacy `openspec-*` skills so agents choose the Git-backed workflow for new work.
6. Leave existing archived OpenSpec directories untouched; future completed changes stop adding new archive output.

## Open Questions

- Should `bun agents change init <change-id>` create an empty metadata commit, or should humans create the first proposal commit manually and let the query API validate it?
- Should finalization ever split commits automatically, or should it only do so when explicitly requested in the change metadata?
- Which exact states should `Formless-Change-State` support beyond `draft`, `ready`, `working`, `blocked`, and `ready-for-review`?
