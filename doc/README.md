# Agent Docs Map

Last updated: 2026-05-25

Repo docs are project memory. Keep claims source-faithful: point to code, schema, tests, shipped behavior, or the owning GitHub issue.

## Start Here

- `AGENTS.md`: agent workflow and repo rules.
- `CONTEXT.md`: project vocabulary.
- `doc/current.md`: shipped behavior index.
- `doc/roadmap.md`: possible directions for next work.
- `doc/directions/`: larger product direction docs before PRD issues.
- `doc/agents/`: skill and tracker configuration.

## Topic Map

Read only the topics needed for the work.

| Read when                                                                                                     | Topic doc                              |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Changing schema parsing, source schemas, relationships, screens, actions, read models, or field behavior.     | `doc/topics/schema-runtime.md`         |
| Changing Authority routes, Durable Object storage, sync, browser replica, or reset behavior.                  | `doc/topics/authority-storage-sync.md` |
| Changing generated React surfaces, field editors, app shells, screen rendering, or browser route composition. | `doc/topics/generated-ui.md`           |
| Changing Site records, public tree projection, public rendering, media, metadata, links, or indexing.         | `doc/topics/site-runtime.md`           |
| Changing the standalone Site project loop, CLI commands, save, deploy setup, or publish.                      | `doc/topics/site-cli-publish.md`       |
| Running checks, interpreting devstate, adding tests, or deciding browser smoke scope.                         | `doc/topics/testing-devstate.md`       |

## Workstreams

- New PRDs live in GitHub Issues for `dpeek/formless`.
- GitHub PRD issue bodies are canonical for status, chunks, decisions, evidence, blockers, and promotion notes.
- Per-chunk progress comments are not the normal workflow.
- Existing `prd/*.md` files are legacy workstream records kept until their facts are promoted into topic docs and the files are retired.
- Do not create new local PRD files.
- Do not read every legacy PRD by default; read one only when assigned, retiring it, or chasing a specific historical decision.
- Direction docs can shape PRDs but do not own implementation status.
- PRD finalization is a separate after-review pass that rebases on local `main` and promotes issue-body promotion notes into topic docs before closing.
- Run PRD finalization with `bun ralph finalize --issue <number>` or `bun ralph finalise --issue <number>`.

## Removed Homes

- The old overview doc is retired. Use this map plus `CONTEXT.md`.
- Durable-decision docs are created lazily only when a real decision needs one.
- Exploration docs have no active home right now. Add one only when it has a clear owner and reading path.
