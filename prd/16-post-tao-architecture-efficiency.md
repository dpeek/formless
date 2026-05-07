# PRD 16: Post-TAO architecture efficiency

Status: active
Current chunk: AEC-04
Last updated: 2026-05-07

## Goal

Clean up architecture and agent efficiency after PRD 14 ships.

The first slice should:

- wait for PRD 14 table actions and ordering to ship;
- add repo-local agent memory for engineering skills;
- promote shipped PRD facts into current docs in one docs/steward pass;
- deepen generated table code after TAO adds row actions, edit views, ordering, and drag reorder;
- deepen authority validation outside the route handler;
- add reusable test builders for schema, generated UI, authority, and site editor flows;
- keep runtime behavior unchanged except where docs/tooling behavior is the work.

This PRD is about post-TAO technical debt and agent throughput. It is not about new product behavior.

## Problem

PRD 14 is the right next feature stream, but it will add pressure to already broad modules.

Current friction:

- Agent memory is split across `AGENTS.md`, `doc/current.md`, `doc/roadmap.md`, and many PRDs.
- There is no `CONTEXT.md`, no `docs/agents/`, and no `docs/adr/`.
- Shipped PRD promote notes are not all reflected in global docs.
- Generated table behavior will span schema parsing, view-model selection, rendering, edit dialogs, row actions, ordering, and drag behavior after TAO.
- Authority route code still owns mutation validation, record value validation, reference checks, and schema compatibility checks.
- Large tests protect behavior but make new chunks slower because setup knowledge is copied by hand.

The result is slower agents, higher merge risk, and shallow modules that require broad file knowledge for small changes.

## Source map

Existing anchors:

- Agent instructions: `AGENTS.md`.
- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- PRD workstreams: `prd/*.md`.
- Active table workstream: `prd/14-table-actions-and-ordering.md`.
- Snapshot workstream that may touch authority/storage: `prd/15-store-snapshot-export-restore.md`.
- Schema parser entrypoint: `src/shared/schema.ts`.
- View parser: `src/shared/schema-views.ts`.
- View and screen model selection: `src/client/views.ts`.
- Generated table renderer: `src/app/generated/table.tsx`.
- Generated collection renderer: `src/app/generated/collection.tsx`.
- Authority routes and validation: `src/worker/authority.ts`.
- Authority actions: `src/worker/actions.ts`.
- Storage writes: `src/worker/storage.ts`.
- Main app tests: `src/app.test.tsx`.
- Schema parser tests: `src/shared/schema.test.ts`.
- View model tests: `src/client/views.test.ts`.
- Authority tests: `src/worker/authority.test.ts`.

Owned files:

- `prd/16-post-tao-architecture-efficiency.md`.

Likely changed files:

- `AGENTS.md`.
- `CONTEXT.md`.
- `docs/agents/issue-tracker.md`.
- `docs/agents/triage-labels.md`.
- `docs/agents/domain.md`.
- `docs/adr/` only if a real decision needs recording.
- `doc/current.md`.
- `doc/roadmap.md` only if release scope wording is stale.
- `src/shared/schema-views.ts`.
- table parser/model modules extracted from `src/shared/schema-views.ts`.
- `src/client/views.ts`.
- table model modules extracted from `src/client/views.ts`.
- `src/app/generated/table.tsx`.
- generated table modules extracted from `src/app/generated/table.tsx`.
- `src/worker/authority.ts`.
- authority validation modules extracted from `src/worker/authority.ts`.
- `src/shared/schema.test.ts`.
- `src/client/views.test.ts`.
- `src/app.test.tsx`.
- `src/worker/authority.test.ts`.
- test helper modules under `src/test/`.

## Requirements

### Scheduling

- Start after PRD 14 is shipped.
- Do not edit active TAO implementation files while PRD 14 is still in flight.
- Coordinate with PRD 15 if snapshot restore work is touching authority validation or storage restore paths.
- Prefer docs/steward changes before code refactors.
- Keep behavior-preserving refactors separate from behavior changes.

### Agent memory behavior

- Add repo-local engineering skill configuration.
- Record issue tracker workflow for this repo.
- Record triage label vocabulary for this repo.
- Record domain-doc layout for this repo.
- Add a single `CONTEXT.md` unless a multi-context repo shape becomes real.
- Add `docs/adr/` only as the home for future decisions; do not invent ADRs without a decision.
- Preserve existing `AGENTS.md` rules.
- Promote shipped facts from completed PRDs into `doc/current.md` in current-doc style.
- Keep `doc/current.md` short, concrete, and source-faithful.
- Keep `doc/roadmap.md` as release scope, not backlog.

### Generated table architecture behavior

- Wait until TAO table behavior is stable.
- Keep table schema syntax shipped by TAO unchanged.
- Keep table runtime behavior shipped by TAO unchanged.
- Concentrate table column, row action, edit view, ordering, and utility-column parsing behind a table parser module.
- Concentrate table render facts behind a table model module.
- Concentrate table row rendering, action cells, edit dialogs, ordering controls, and drag handles behind table-renderer modules.
- Keep collection views as scope/query/context controllers.
- Keep table views as record interaction surfaces.
- Keep generated collection and screen renderers consuming table facts instead of raw schema.
- Keep dnd-kit usage in generated app code, not shared UI primitives.

### Authority validation behavior

- Keep current API paths unchanged.
- Keep HTTP as the write path.
- Keep push sync notification semantics unchanged.
- Keep storage table shape unchanged.
- Keep `AuthorityWriteModule` as the committed-write notification seam.
- Move mutation validation out of the route branch.
- Move record value validation out of the route branch.
- Move reference existence and tombstone validation out of the route branch.
- Move compatible schema-change validation out of the route branch.
- Keep request parsing and HTTP status mapping in the authority route.
- Preserve existing error messages where tests assert them.
- Keep reference existence as an authority invariant, not field behavior.

### Test architecture behavior

- Add reusable schema builders for source-like schemas and narrow invalid-shape cases.
- Add generated table render helpers for table rows, action cells, edit dialogs, and ordering controls.
- Add authority write helpers for committed, failed, and replayed write expectations.
- Add site editor flow helpers for Pages/Header/Footer list-detail and placement table behavior.
- Keep tests asserting external behavior through module interfaces.
- Avoid tests that assert private helper call order.
- Replace copied setup only when the helper improves locality.
- Keep characterization coverage before refactors.

## Decisions

| ID      | Decision                                                            | Reason                                                                  | Evidence                                            |
| ------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| AEC-D1  | Ship after PRD 14.                                                  | TAO will define the table behavior this PRD should clean up.            | `prd/14-table-actions-and-ordering.md`              |
| AEC-D2  | Treat this as a docs/steward plus refactor PRD.                     | It needs global doc updates and behavior-preserving module cleanup.     | `AGENTS.md`, `doc/current.md`, `doc/roadmap.md`     |
| AEC-D3  | Add single-context agent memory first.                              | Formless is one app/runtime repo today, not a multi-context monorepo.   | repo layout, `doc/overview.md`                      |
| AEC-D4  | Keep PRDs as workstream owners.                                     | Existing repo memory model already works for shipped chunks.            | `AGENTS.md`, `prd/*.md`                             |
| AEC-D5  | Deepen table modules after TAO instead of during TAO.               | TAO should ship behavior; this PRD should improve locality afterwards.  | `src/shared/schema-views.ts`, `src/client/views.ts` |
| AEC-D6  | Keep collection/table roles separate.                               | Collections own scope/query/context; tables own row interaction.        | `prd/14-table-actions-and-ordering.md`              |
| AEC-D7  | Deepen authority validation without changing write shape.           | Validation locality can improve without new API or storage behavior.    | `src/worker/authority.ts`, `src/worker/storage.ts`  |
| AEC-D8  | Extract test helpers only when they remove repeated setup.          | Helper indirection should buy real leverage and locality.               | `src/app.test.tsx`, `src/shared/schema.test.ts`     |
| AEC-D9  | Do not add ADRs for obvious or temporary preferences.               | ADRs should record decisions future agents would otherwise re-litigate. | missing `docs/adr/`, skill setup rules              |
| AEC-D10 | Preserve current runtime behavior unless a chunk says docs/tooling. | This PRD is technical debt cleanup, not feature scope.                  | `doc/roadmap.md`                                    |
| AEC-D11 | Use GitHub Issues for issue-tracker skill config.                   | Repo remote is GitHub; PRD workstreams remain local markdown docs.      | `docs/agents/issue-tracker.md`, `prd/*.md`          |
| AEC-D12 | Use one root context and default triage labels.                     | Repo is one runtime context; no existing label override was present.    | `CONTEXT.md`, `docs/agents/triage-labels.md`        |

## Chunks

| ID     | Status  | Depends on       | Main files                        | Acceptance                                                                                                      |
| ------ | ------- | ---------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| AEC-01 | shipped | PRD 14 shipped   | PRD                               | PRD captures scope, decisions, blockers, dependencies, and promote notes.                                       |
| AEC-02 | shipped | AEC-01           | agent docs, global docs           | Repo has agent skill memory, domain docs home, ADR home, and shipped PRD facts promoted source-faithfully.      |
| AEC-03 | shipped | AEC-02, TAO done | table parser/model/renderer files | Post-TAO table behavior is behind deeper table modules with equivalent parser/model/render behavior.            |
| AEC-04 | planned | AEC-02           | authority validation files        | Mutation, record value, reference, and schema compatibility validation move out of the route with same results. |
| AEC-05 | planned | AEC-03, AEC-04   | test helper modules and tests     | Repeated schema, table, authority, and site editor setup is concentrated in tested helpers.                     |
| AEC-06 | planned | AEC-05           | browser smoke if needed, PRD      | Checks pass; browser smoke runs if app behavior was touched; PRD status and promote notes are current.          |

## Chunk details

### AEC-01 PRD draft

Status: shipped 2026-05-07.

Goal: capture the post-TAO cleanup stream.

Tasks:

- Record the four architecture efficiency candidates.
- Make PRD 14 the upstream dependency.
- Preserve existing PRD 15 snapshot work.
- Define chunks that can ship independently.
- Define promote notes for docs/steward work.

Acceptance:

- PRD exists as a numbered workstream after existing PRDs.
- PRD says no runtime behavior changes are intended outside docs/tooling.
- PRD records coordination needs with PRD 14 and PRD 15.

Evidence to record:

- `./tmp/agent-dev.json`.
- `./tmp/test.txt`.
- `./tmp/check.txt`.

### AEC-02 agent memory and docs steward pass

Status: shipped 2026-05-07.

Goal: make repo memory easier for agents to consume.

Tasks:

- Add an `## Agent skills` block to `AGENTS.md`.
- Add `docs/agents/issue-tracker.md`.
- Add `docs/agents/triage-labels.md`.
- Add `docs/agents/domain.md`.
- Add root `CONTEXT.md`.
- Add `docs/adr/` with a minimal README if no ADR exists yet.
- Promote shipped PRD facts into `doc/current.md`.
- Touch `doc/roadmap.md` only for release-scope drift.

Acceptance:

- Engineering skills can find issue tracker, labels, and domain docs.
- `CONTEXT.md` names current Formless domain terms.
- `doc/current.md` reflects shipped PRD facts with code-backed bullets.
- `doc/roadmap.md` remains release target, not backlog.
- No runtime code changes.

Evidence to record:

- `./tmp/agent-dev.json`.
- `./tmp/test.txt`.
- `./tmp/check.txt`.

Shipped:

- Added `AGENTS.md` Agent skills block.
- Added `CONTEXT.md`.
- Added `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, and `docs/agents/domain.md`.
- Added `docs/adr/README.md`.
- Promoted shipped relationship, action, read-model footer, field editor, Site editor, and table action/ordering facts into `doc/current.md`.
- Aligned `doc/roadmap.md` generated-table release scope with shipped table row actions, edit dialogs, ordering controls, and drag handles.
- Browser smoke not run; docs/tooling only, no app behavior changed.

### AEC-03 post-TAO generated table deepening

Status: shipped 2026-05-07.

Goal: make generated table behavior local after TAO ships.

Tasks:

- Characterize post-TAO table parser behavior.
- Characterize post-TAO table model behavior.
- Characterize post-TAO table render behavior.
- Extract table parser helpers or modules from the general view parser.
- Extract table model helpers or modules from the general view model selector.
- Extract row action, edit dialog, ordering, drag, and utility column rendering where it improves locality.
- Keep collection and screen renderers consuming table facts.

Acceptance:

- Existing TAO behavior stays unchanged.
- Table parser tests cross a table parser interface.
- Table model tests cross a table model interface.
- Generated table tests cross rendered behavior, not private helper order.
- `src/shared/schema-views.ts`, `src/client/views.ts`, and `src/app/generated/table.tsx` become easier to navigate.

Evidence to record:

- Parser tests.
- View model tests.
- Generated table/app tests.
- Browser smoke only if rendered behavior changes.
- `./tmp/agent-dev.json`.
- `./tmp/test.txt`.
- `./tmp/check.txt`.

Shipped:

- Added table parser module `src/shared/schema-table-views.ts`.
- Added shared field parser helper `src/shared/schema-view-field-parser.ts`.
- Added table model module `src/client/table-model.ts`.
- Added generated table action module `src/app/generated/table-actions.tsx`.
- Added generated table ordering helper module `src/app/generated/table-ordering-ui.ts`.
- Added parser and model interface tests in `src/shared/schema-table-views.test.ts` and `src/client/table-model.test.ts`.
- Browser smoke not run; rendered behavior was refactored without intended behavior change.

### AEC-04 authority validation module

Status: planned.

Goal: make authority write validation local without changing write behavior.

Tasks:

- Characterize current mutation validation outcomes.
- Characterize current schema compatibility outcomes.
- Characterize current reference validation outcomes.
- Extract mutation validation from `src/worker/authority.ts`.
- Extract record value and reference validation from `src/worker/authority.ts`.
- Extract compatible schema-change validation from `src/worker/authority.ts`.
- Keep route request parsing and HTTP response mapping in `src/worker/authority.ts`.
- Coordinate with PRD 15 if snapshot restore validation exists by then.

Acceptance:

- Existing API status codes and response shapes stay unchanged.
- Existing authority tests pass.
- Failed validation still does not commit.
- Failed validation still does not broadcast.
- Committed writes still route through `AuthorityWriteModule`.
- Reference existence remains authority-owned.

Evidence to record:

- Authority tests.
- Storage tests if storage-facing validation helpers move.
- `./tmp/agent-dev.json`.
- `./tmp/test.txt`.
- `./tmp/check.txt`.

### AEC-05 test helper deepening

Status: planned.

Goal: reduce repeated test setup and make future chunks faster.

Tasks:

- Add schema test builders for common task/rate/site source-like schemas.
- Add invalid schema mutation helpers for parser tests.
- Add generated table render helpers.
- Add authority write test helpers.
- Add site editor flow helpers.
- Replace repeated setup in touched tests.
- Leave one-off tests inline when a helper would be shallow.

Acceptance:

- Test helpers reduce repeated setup in high-churn tests.
- Helpers expose domain facts, not private implementation details.
- Existing coverage stays equivalent or improves.
- Future TAO-adjacent tests are shorter to write and easier to read.

Evidence to record:

- Schema tests.
- View model tests.
- App tests.
- Authority tests.
- `./tmp/agent-dev.json`.
- `./tmp/test.txt`.
- `./tmp/check.txt`.

### AEC-06 closeout

Status: planned.

Goal: verify and close the cleanup stream.

Tasks:

- Read `./tmp/agent-dev.json`, `./tmp/test.txt`, and `./tmp/check.txt`.
- Run browser smoke only if rendered app behavior changed.
- Update this PRD status and chunk table.
- Record blockers.
- Record promote notes.

Acceptance:

- `./tmp/agent-dev.json` shows dev ready, tests pass, and checks pass.
- `./tmp/test.txt` shows passing tests after `bun start`.
- `./tmp/check.txt` shows passing checks after `bun start`.
- Browser smoke evidence exists if app behavior changed.
- PRD status is current.
- Promote notes are ready for docs/steward follow-up if any remain.

## Non-goals

- Do not ship before PRD 14.
- Do not add new generated table features.
- Do not change table schema syntax shipped by TAO.
- Do not change collection context semantics.
- Do not change public site tree behavior.
- Do not add new authority API paths.
- Do not change storage table shape.
- Do not change sync protocol shape.
- Do not change action request or response shapes.
- Do not add users, permissions, sessions, or auth.
- Do not turn `doc/roadmap.md` into backlog.
- Do not create ADRs for decisions that are obvious from code or temporary schedule constraints.

## Blockers

| ID     | Status | Blocks            | Notes                                                               |
| ------ | ------ | ----------------- | ------------------------------------------------------------------- |
| AEC-B1 | closed | AEC-02 through 06 | PRD 14 shipped 2026-05-07; AEC-02 can start.                        |
| AEC-B2 | open   | AEC-04            | Coordinate with PRD 15 if snapshot restore changes validation code. |

## Cross-PRD dependencies

| Dependency                           | Direction  | Notes                                                                               |
| ------------------------------------ | ---------- | ----------------------------------------------------------------------------------- |
| PRD 14 table actions and ordering    | upstream   | Defines table action, edit, ordering, and drag behavior to deepen after ship.       |
| PRD 15 store snapshot export/restore | adjacent   | May touch authority/storage validation paths; coordinate before AEC-04.             |
| Completed PRDs 05-13                 | upstream   | Their promote notes are source material for AEC-02 docs/steward work.               |
| Future feature PRDs                  | downstream | Should benefit from agent memory, table locality, validation locality, and helpers. |

## Parallel shipping

Can ship in parallel with:

- worker-only work that avoids authority validation files;
- UI work that avoids generated table files;
- docs work that coordinates `doc/current.md` and `doc/roadmap.md`.

Should coordinate with:

- PRD 15 restore work;
- any PRD changing generated table behavior;
- any PRD changing schema parser/view model files;
- any PRD changing authority write validation.

Avoid parallel edits with:

- active TAO chunks;
- authority validation refactors;
- broad test-helper rewrites in the same test files.

Recommended order:

1. Finish PRD 14.
2. Ship agent memory and docs steward pass.
3. Deepen generated table modules.
4. Deepen authority validation.
5. Deepen test helpers.
6. Close out with evidence.

## Progress rules

- Mark exactly one AEC chunk as `doing` when implementation starts.
- Do not mark a chunk `doing` while PRD 14 is active.
- Update only this PRD during normal AEC chunk work unless the chunk is explicitly docs/steward.
- Preserve user changes.
- Keep behavior claims backed by code, schema, tests, docs, or shipped behavior.
- Run `bun browser` only if rendered app behavior changes.

## Promote after ship

AEC-01:

- No global-doc promotion. PRD only.

AEC-02:

- Promoted 2026-05-07.
- `doc/current.md` notes `CONTEXT.md`, `docs/agents/`, and `docs/adr/` as repo memory.
- `doc/current.md` promotes missing shipped facts from completed PRDs.
- `doc/roadmap.md` keeps release-scope wording aligned with shipped table action and ordering behavior.

AEC-03:

- `doc/current.md`: note post-TAO table parser/model/renderer module locations if extracted.
- `doc/current.md`: note generated table behavior remains table-owned.
- Ready for docs/steward promotion: `src/shared/schema-table-views.ts`, `src/client/table-model.ts`, `src/app/generated/table-actions.tsx`, and `src/app/generated/table-ordering-ui.ts`.

AEC-04:

- `doc/current.md`: note authority validation module location if extracted.
- `doc/current.md`: note authority route keeps HTTP shape while validation lives behind a deeper module.

AEC-05:

- `doc/current.md`: note shared test helper locations only if they become important agent anchors.

AEC-06:

- PRD 16 is ready for docs/steward promotion.

## Evidence

- 2026-05-07 AEC-01: PRD drafted from architecture review candidates and checked against `doc/overview.md`, `doc/current.md`, `doc/roadmap.md`, `prd/14-table-actions-and-ordering.md`, and existing untracked `prd/15-store-snapshot-export-restore.md`.
- 2026-05-07 AEC-01: PRD 14 is shipped in `prd/14-table-actions-and-ordering.md`; AEC-B1 closed and AEC-02 is the next chunk.
- 2026-05-07 AEC-01: `./tmp/agent-dev.json` shows `devStatus: ready`, `testStatus: pass`, `checkStatus: pass`, and dev URL `https://16-post-tao-architecture-efficiency.formless.local`.
- 2026-05-07 AEC-01: `./tmp/test.txt` shows 29 files and 506 tests passed; `./tmp/check.txt` shows formatting, lint, and type checks passed.
- 2026-05-07 AEC-02: `AGENTS.md`, `CONTEXT.md`, `docs/agents/`, and `docs/adr/README.md` added repo-local agent memory.
- 2026-05-07 AEC-02: `doc/current.md` promoted missing shipped facts from completed PRDs; `doc/roadmap.md` received only generated-table release-scope alignment.
- 2026-05-07 AEC-02: `./tmp/agent-dev.json` shows `devStatus: ready`, `testStatus: pass`, `checkStatus: pass`, and dev URL `https://16-post-tao-architecture-efficiency.formless.local`.
- 2026-05-07 AEC-02: `./tmp/test.txt` shows 29 files and 506 tests passed; `./tmp/check.txt` shows formatting, lint, and type checks passed.
- 2026-05-07 AEC-02: browser smoke not run because no app behavior changed.
- 2026-05-07 AEC-03: Extracted table parser, table model, table action, and table ordering modules while keeping table schema and rendered behavior unchanged.
- 2026-05-07 AEC-03: Added direct parser/model interface coverage in `src/shared/schema-table-views.test.ts` and `src/client/table-model.test.ts`; existing generated table/app tests still pass.
- 2026-05-07 AEC-03: `./tmp/agent-dev.json` shows `devStatus: ready`, `testStatus: pass`, `checkStatus: pass`, and dev URL `https://16-post-tao-architecture-efficiency.formless.local`.
- 2026-05-07 AEC-03: `./tmp/test.txt` shows 31 files and 509 tests passed; `./tmp/check.txt` shows formatting, lint, and type checks passed.
- 2026-05-07 AEC-03: browser smoke not run because this was a behavior-preserving refactor.

## PRD status notes

- PRD drafted 2026-05-07 from user request to expand the architecture efficiency candidates into a post-TAO PRD.
- User direction: ship after TAO.
- Existing `prd/15-store-snapshot-export-restore.md` was present and preserved; this PRD uses number 16.
- AEC-01 shipped 2026-05-07 after PRD 14 was marked shipped.
- AEC-02 shipped 2026-05-07 as a docs/steward chunk.
- AEC-03 shipped 2026-05-07 as a post-TAO table parser/model/renderer deepening chunk.
- Next chunk: AEC-04 authority validation module; coordinate AEC-B2 before editing validation paths.
- Main risk: authority validation extraction may overlap with snapshot restore validation if PRD 15 ships first.
- Current blocker: AEC-B2 still applies before AEC-04 if PRD 15 touches validation.
