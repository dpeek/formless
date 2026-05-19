# Roadmap

Last updated: 2026-05-19

Release target: first usable Formless release.

Workstreams: GitHub Issues for `dpeek/formless`.

## Runtime

- Direct dev app routes stay `/tasks`, `/estii`, and `/site`.
- Schema editor routes stay `/tasks/schema`, `/estii/schema`, and `/site/schema`.
- Public site routes stay `/pages` and `/pages/*`.
- One schema key maps to one source schema.
- One schema key maps to one authority instance.
- One schema key maps to one browser local DB.
- API paths stay schema-keyed.
- Current API paths: `/api/:schemaKey/bootstrap`, `/api/:schemaKey/schema`, `/api/:schemaKey/tree/:slug`, `/api/:schemaKey/sync`, `/api/:schemaKey/sync/ws`, `/api/:schemaKey/mutations`, `/api/:schemaKey/actions`, `/api/:schemaKey/reset/schema`, `/api/:schemaKey/reset/seed`.
- Site media API paths include `/api/site/media/images` and `/api/site/media/*`.
- Reset schema and reset seed data stay separate.
- Fresh route bootstrap loads source schema and source seed records.
- Push sync stays at `/api/:schemaKey/sync/ws`.
- Browser replicas receive authority-pushed changes.
- Push sync is keyed by schema app.
- Push sync preserves route isolation.
- HTTP remains the write path for mutations, actions, schema, and reset.
- Authority writes stay atomic across primary and caused records.
- Authority constraints protect shipped invariants.
- Browser push sync has no polling fallback.

## Source Schemas

- Source app files live under `schema/apps/`.
- Task source: `schema/apps/tasks/schema.json`.
- Task seed: `schema/apps/tasks/seed-records.json`.
- Estii source: `schema/apps/estii/schema.json`.
- Estii seed: `schema/apps/estii/seed-records.json`.
- Site source: `schema/apps/site/schema.json`.
- Site seed: `schema/apps/site/seed-records.json`.
- Seed records stay close to `StoredRecord` shape.
- Seed files do not store change rows.
- Storage derives seed create changes during reset/bootstrap.

## Screens

- App schemas can declare top-level `screens`.
- Workspace screens compose existing collection views.
- First layout primitive is `stack`.
- Screen navigation owns primary route workspace selection when `screens` exists.
- Collection navigation remains legacy fallback when `screens` is absent.
- Task and Estii source schemas define screens.
- General layout DSL stays out of first release.

## Read Models

- App schemas can declare `readModels.computedValues`.
- App schemas can declare `readModels.aggregates`.
- Computed values are read-only display values over flat records.
- Aggregates are read-only display values over query results.
- Generated tables can render computed columns.
- Generated collections can render aggregate summary slots.
- Derived Estii rate display values are covered by read-model computed values and aggregates.
- Full computed graph engine stays out of first release.

## Task App

- `/tasks` opens the task app.
- `/tasks/schema` edits the task runtime schema.
- Task records and schema edits are isolated from `/estii`.
- `clearCompletedTasks` still runs as a schema-declared action.
- Task screen stays one primary workspace.

## Estii App

- `/estii` opens the Estii app.
- `/estii/schema` edits the Estii runtime schema.
- Estii records and schema edits are isolated from `/tasks`.
- `rateHome` remains the primary workspace.
- Records stay flat: resources, cards, rates.
- Rate matrix integrity stays authority-enforced.
- Estii source schema uses read-model output for margin and totals.
- Rate setup can stay non-primary.

## Site App

- `/site` opens the site admin app.
- `/site/schema` edits the site runtime schema.
- `/pages` redirects to `/pages/home`.
- `/pages/*` renders public site pages.
- Public pages fetch `/api/site/tree/:slug`.
- Site records stay flat: blocks and block placements.
- Media stays in block records.
- First media upload support is Site image upload only.
- Uploaded images are stored in R2.
- Image blocks store the served media URL in `block.href`.
- Image blocks can exist before an image URL is set.
- Public image rendering uses the same Site tree and renderer path as authored image URLs.
- `blockPlacement.parent` and `blockPlacement.block` stay the composition edge.
- Header and footer stay nested blocks/groups in source seeds.
- Public tree output excludes drafts, archived blocks, invisible placements, and tombstones.
- First public renderer stays site-specific.
- Site editor first-release surface uses Pages, Header, and Footer roots.
- Site editor root selection uses generated list/detail context presentation.
- Raw Blocks and Placements are not the primary Site editor surface.
- Inline scoped child creation is later than the list/detail workstream.

## Generated UI

- Route shell shows `Tasks`, `Estii`, `Site`, and the current app's `Schema`.
- Generated create, patch, and action paths submit to the active schema key.
- Reset controls are route-scoped.
- Global schema swap UI is removed.
- Switching routes in one browser session keeps each route's local state.
- Public site routes do not show generated admin navigation.
- Generated screen renderer owns route workspace layout.
- Generated collection renderer owns query tabs, context selection, summaries, actions, and result rendering.
- Generated table renderer owns field, reference-field, value/unit, computed, invoke-action, and ordering-handle columns.
- Generated table renderer owns table-local row actions, edit dialogs, ordering controls, and drag handles.
- Generated field editors use shared UI primitives for richer scalar editing.
- Generated Site image field editing can upload image files and patch flat block fields.
- Generated edit dialogs can use per-field patching before draft save flows exist.
- Table row reordering uses generic patch writes; atomic batch mutations are later.

## Docs

- `doc/README.md` is the agent docs map.
- `doc/current.md` is the shipped-behavior index for agents.
- `doc/topics/*.md` own topic-focused shipped facts.
- `doc/roadmap.md` is the first-release target.
- New PRDs live in GitHub Issues for `dpeek/formless`.
- Existing `prd/*.md` files are legacy workstream records until retired.
- Shipped PRD facts get promoted into topic docs.
- External memory is not required for normal Formless work.

## Not First Release

- Users and permissions.
- Multi-tenant account routing.
- Cross-app references.
- Cross-app queries.
- General import/export UI.
- App marketplace.
- Full layout DSL.
- Full computed graph engine.
- Draft edit sessions with save/cancel.
- Cross-field draft validation UI.
- Proper delete mutations and generated delete UI.
- Destructive action confirmation flow.
- Atomic batch mutation endpoint.
- Boards.
- Dashboards.
- Charts.
- Plugin view registry.
- General media library.
- Video upload.
- File upload.
- Image transforms.
- Media garbage collection.
