# Astryx Site Tree Builder

## Outcome

Project generated tree-result authoring through a renderer-neutral tree-builder
contract, move production Site composition behind a legacy adapter, and
implement the complete contract with Astryx without activating the Astryx
production renderer.

The completed change should:

- extend the canonical generated workspace result contract with a complete
  tree-builder result instead of an opaque React slot or separate runtime path;
- extend the landed contract host with a typed tree-result reference and node so
  tree-backed sections use the same subscribed workspace path as list, table,
  and record results;
- project flat placement and child records into a nested presentation tree
  before rendering while keeping storage flat;
- keep replica reads, tree model selection, relationship traversal, branch
  policy, active unions, field drafts, readiness, ordering plans, operation
  controllers, writes, and sync feedback in generated runtime foundations;
- compose existing canonical field, create-surface, operation-control,
  confirmation, warning, empty-state, and semantic ordering contracts;
- replace tree drag gestures with explicit in-scope move actions rather than
  rebuilding DnD in Astryx;
- preserve create-child, remove-placement, nested editing, context navigation,
  readiness, missing-child, cycle, and maximum-depth behavior;
- make the production subscribed legacy renderer consume only the canonical
  tree-result reference and snapshot;
- implement an Astryx hierarchy outline and focused node editor using Astryx
  tree, layout, form, menu, dialog, status, and action components;
- add data-only Site composition fixtures and a focused prototype layout; and
- leave production renderer selection unchanged so the later application
  cutover remains mechanical.

This change preserves authoring capability, not the legacy nested cards,
always-expanded hierarchy, inline form density, drag handles, Tailwind
structure, or exact test markup.

## Preconditions

- `astryx-public-site` is complete and landed on `main`.
- `astryx-generated-workspace` is complete and the canonical workspace contract
  supports list, table, record, context, and list-detail results while
  explicitly deferring tree results.
- The stable generated workspace contract host publishes workspace manifests,
  section shells, and scoped list, table, and record-result nodes atomically;
  tree result references and nodes are the missing host member.
- Canonical create-surface, record-field, display-field, field-set,
  operation-control, destructive-confirmation, warning, empty-state, and
  semantic ordering contracts are available for composition.
- The production generated workspace still selects the legacy renderer.
- Site app schema branch policy and tree composition operations remain current
  and source-declared.

The public-Site dependency is primarily sequencing and package stability. This
change does not depend on public page rendering behavior.

## Current Baseline

The baseline observed while writing this plan is:

- `src/client/tree-result-model.ts` selects a generic generated tree result from
  schema relationship, child field, item views, union variants, branch policy,
  composition operations, ordering, and maximum depth.
- Site composition is the first production tree-result consumer. It stores
  blocks and block placements as separate flat records.
- `src/app/generated/tree.tsx` is approximately 1,290 lines and combines
  replica record reads, relationship traversal, ordering, DnD, operation
  controllers, create dialogs, remove confirmation, readiness warnings,
  context selection, record-field editing, and Tailwind rendering.
- recursive React components call `useRecordsById` and readiness hooks while
  deriving child placements and structural states during rendering.
- tree-child creation selects allowed union variants from the parent branch
  policy, derives hidden discriminator and literal placement values, opens a
  generated create dialog, executes `create-tree-child`, and selects the
  created child record from operation output.
- placement removal executes `remove-tree-placement` against the placement edge
  and intentionally does not expose child-record deletion on tree nodes.
- ordering is scoped by parent and slot, uses sparse numeric ranks, and the Site
  tree currently requests drag-handle presentation.
- tree DnD rejects cross-scope moves, reports rebalance requirements through
  sync status, and is the remaining direct `@dnd-kit/react` consumer observed
  in the current tree path.
- tree nodes may render separate placement fields and child-record fields,
  active union fields, context links, slot badges, readiness warnings, missing
  child warnings, cycle warnings, and maximum-depth warnings.
- the Site tree schema allows a maximum depth of eight, while Astryx `TreeList`
  guidance discourages presenting more than four or five visibly nested levels
  at once.
- Astryx provides an accessible, data-driven `TreeList` with tree roles,
  keyboard navigation, selection, nested children, expansion, start content,
  and end content.
- Astryx `TreeList` does not provide a sortable tree-builder contract or a
  suitable surface for full inline record forms inside every visible row.
- no canonical tree-builder presentation contract or Astryx tree-builder
  fixture currently exists.
- the planned generated workspace contract leaves tree-backed sections on their
  existing production path until this change can add them completely.
- non-tree production workspaces already render through the stable host and
  subscribed legacy workspace entrypoint; any tree section currently makes the
  generated workspace ineligible and retains the direct tree path.

Future exploration must treat these as observations, not guaranteed facts.

## Scope

### In scope

- A generic Formless UI tree-builder contract in `lib/astryx`, with Site
  composition as the first production consumer.
- A canonical tree result member in generated screen, collection, context, and
  list-detail workspace composition.
- A typed main tree-result reference, host node, snapshot mapping, validation,
  subscription hook, production publication adapter, and memory-host fixture
  support.
- Projection of selected root, ordered placement edges, child records, branch
  state, stable item identity, labels, variant display facts, slots, and nested
  children.
- Controlled tree-item selection and a focused editor for the selected
  placement and child record.
- Canonical nested placement and child field sets, active union fields,
  `visibleWhen`, specialized fields, commit behavior, pending state, and
  display-safe errors.
- Context-link actions for child records whose item-view presentation selects a
  valid workspace context.
- Allowed child variants, parent and slot policy, controlled active variant,
  canonical create surface, operation execution, success handling, and retry.
- Remove-placement operation control and destructive confirmation.
- Parent-and-slot-scoped top, up, down, and bottom ordering actions, pending
  state, rank execution, rebalance feedback, and boundary availability.
- Empty, unavailable, missing-child, cycle, leaf, maximum-depth, readiness,
  operation-failure, and editing-disabled presentation.
- Legacy and Astryx renderers, data-only fixtures, layout scenarios, focused
  tests, workspace integration, and canonical spec changes.
- Deletion of direct tree DnD code and the root DnD dependency if no current
  consumer remains after migration.

### Out of scope

- Public Site tree projection or public page rendering.
- Changes to Site block, placement, relationship, union, branch, slot, or
  operation schema.
- New block types, stored nesting, stored presentation trees, or denormalized
  child arrays.
- Site root navigation group redesign, new root types, or changes to the
  generated list-detail context contract beyond composing the tree result.
- Moving records between different parents or slots, arbitrary reparenting, or
  cross-scope drag and drop.
- Deleting child block records from placement controls. Tree removal continues
  to remove the placement edge only.
- A live public preview pane, visual page-builder canvas, freeform layout,
  resize handles, per-block styling controls, or WYSIWYG authoring.
- Preserving always-expanded depth-eight presentation or putting full editors
  inside every Astryx `TreeList` row.
- Moving records, queries, schemas, relationship models, operation bindings,
  rank plans, update resolution, media clients, sync status, or storage hooks
  into `lib/astryx`.
- Production Astryx renderer selection, global CSS changes, Tailwind removal
  outside the tree path, or deletion of legacy renderers still required before
  the final application cutover.
- Compatibility shims, duplicate tree contracts, React-node escape hatches, or
  one-to-one legacy markup tests.

## Contract Direction

### Generic generated tree result

The canonical tree-builder contract belongs with the other renderer-neutral
Formless UI contracts in `lib/astryx`. It should be generic over generated tree
results even though Site composition is its first consumer.

The top-level contract should carry renderer-facing facts such as:

- stable tree id, label, accessibility label, density, and editing
  availability;
- unavailable, empty, and ready state;
- root identity and root-level add-child control;
- recursively projected tree items;
- controlled selected item identity and selection intent;
- selected item editor state;
- display-safe tree-level warnings or feedback; and
- nested intent routing for fields, create surfaces, operations, ordering, and
  context navigation.

It must not carry `TreeResultModel`, `HomeContextConfig`, `QueryEvaluationContext`,
`StoredRecord`, schema types, relationships, record maps, operation configs,
controllers, DnD events, rank plans, sync functions, React components,
renderer props, or Tailwind classes.

The complete tree contract is the snapshot behind one scoped main-result
reference. Extend the existing result-reference and host-node unions rather
than putting the nested tree inside a section shell or adding a tree-specific
Context. The workspace manifest continues to own section order, the section
shell continues to own collection chrome, and the tree-result node owns the
complete projected hierarchy and focused editor.

Runtime may still reproject the complete tree on a relevant transition. The
host reuses semantically unchanged workspace and section snapshots, publishes
the complete next node set atomically, and notifies only the tree-result
subscriber when shell structure and collection chrome did not change. Do not
normalize every tree item, field, warning, or operation until profiling shows a
hot boundary.

### Tree items and flat-data boundaries

Each tree item represents one placement edge plus its projected child record.
Keep those identities distinct even when the UI presents one node.

An item may carry:

- stable item, placement, and child ids;
- child label and schema-projected variant label or semantic icon id;
- optional placement slot label;
- selected, disabled, and initial-disclosure facts;
- leaf, branch, missing-child, cycle-stopped, or depth-stopped structural state;
- ordered child items;
- placement and child field-set contracts;
- optional context action;
- optional add-child control and active create surface;
- optional remove-placement operation control;
- optional semantic ordering control; and
- separate placement, child, readiness, and structural warnings.

The nested contract is a presentation projection. Storage remains flat block
and placement records, and runtime rebuilds the projection from the current
record snapshot.

Do not expose recursion bookkeeping such as ancestor sets, raw depth counters,
ordering scope keys, record maps, or relationship fields merely because the
current React renderer uses them.

### Selection and focused editing

Use a hierarchy outline plus a focused selected-node editor as the Astryx
direction.

- `TreeList` renders concise node identity, hierarchy, selection, disclosure,
  slot or state facts, and compact structural actions.
- the selected-node editor renders placement fields separately from child
  fields, preserving the flat edge-versus-record distinction;
- context-link items expose a projected open-context action only when the
  selected child is an allowed context target;
- selecting an item is presentation state and must not patch records or change
  the workspace root;
- opening a context target remains a runtime navigation intent; and
- removal or refresh of the selected placement resolves through an explicit
  stable fallback rather than leaving a stale editor.

On narrow viewports the outline and editor may stack or progressively disclose.
Do not silently truncate valid depth-eight trees. Prefer collapsed branches,
selected-path visibility, and focused editing so more than four or five levels
are not all expanded at once.

### Child creation

Tree child creation should compose the canonical create-surface contract.

The tree contract may add a narrow child-variant chooser containing stable
option id, label, disabled state, and selection intent. Runtime retains:

- parent record lookup;
- allowed variant selection from branch policy;
- discriminator field and hidden default derivation;
- literal placement values such as semantic slots;
- create operation binding and controller;
- create draft session and field projection;
- `create-tree-child` execution;
- created record selection from command output; and
- operation and sync feedback.

After a variant is selected, the renderer receives the canonical create
surface for that variant. Do not add tree-specific field or dialog contracts.
The option label already carries schema-declared distinctions such as
`Primary image`, `Feature image`, or `Action link`; the renderer should not
infer variants from stored type strings.

### Removal and ordering

Placement removal should compose the canonical operation-control and
destructive-confirmation contracts. The renderer emits the operation intent;
runtime executes `remove-tree-placement` against the placement record.

Normalize tree ordering to semantic `top`, `up`, `down`, and `bottom` actions,
following the generated-list migration direction:

- actions operate only within the exact projected parent-and-slot scope;
- structurally unavailable boundary moves are omitted or disabled as the
  canonical ordering contract requires;
- pending state prevents concurrent moves;
- runtime retains sparse-rank calculation, rebalance decisions, update
  operation execution, and sync feedback; and
- no drag data, scope key, target index, DnD provider, or suspended drop crosses
  the renderer contract.

This intentionally replaces the schema-requested drag gesture with equivalent
ordering capability. Do not add cross-parent or cross-slot movement.

### Diagnostics and readiness

Project diagnostics before rendering:

- missing child record;
- cycle traversal stopped;
- maximum traversal depth reached with hidden descendants;
- placement readiness warnings;
- child readiness warnings;
- create, update, remove, and ordering unavailable or failed state; and
- tree-level unavailable or empty state.

Warnings must contain stable ids, public display-safe codes or labels, and
display-safe messages. Do not expose raw records, exception objects, operation
responses, mutation payloads, sync internals, or schema parser errors.

Structural warnings belong to the relevant item. Field validation stays with
the nested field contract, operation feedback stays with the nested operation
contract, and global sync status stays outside the renderer.

## Astryx Direction

Use Astryx components according to their intended roles:

- `TreeList` for accessible hierarchy, keyboard movement, selection, and branch
  disclosure;
- concise node rows with schema-derived labels, badges, semantic icons, and an
  accessible overflow menu;
- a focused editor surface using Astryx layout, sections, cards only where they
  improve grouping, canonical field renderers, and status components;
- `DropdownMenu` for short action-oriented child-variant and node-action menus,
  grouped when the current allowed variants are numerous;
- canonical form-purpose dialogs for active create surfaces;
- canonical alert dialogs for remove-placement confirmation;
- explicit semantic ordering actions rather than a custom sortable TreeList;
  and
- `EmptyState`, status, and warning surfaces for projected state.

Do not pass React nodes through the canonical contract because Astryx
`TreeList` accepts React content. The Astryx adapter may create its own label,
start-content, and end-content React nodes from contract data.

The renderer may own ephemeral disclosure mechanics required by `TreeList`, but
selected item, active create variant, dialogs, async state, and all
runtime-affecting interactions remain controlled by canonical facts and
intents.

## Migration Rules

- Formalize the complete tree contract before routing production through it.
- Extend the landed host reference, snapshot, node, validation, React hook, and
  memory implementation with the complete tree result before removing the tree
  workspace fallback.
- Prove the outline-plus-editor direction with canonical-shaped data before
  deleting the current tree component.
- Reuse canonical field, create, operation, confirmation, warning, empty-state,
  and ordering contracts rather than creating tree-only copies.
- Move production to a subscribed legacy renderer that reads the tree result
  from the same stable host before completing the Astryx renderer.
- Keep direct `@dpeek/formless-ui` imports for tree-backed workspace surfaces
  inside the owned legacy seam modules identified by the change. Foundation,
  projection, runtime, and canonical contract modules contain none.
- Remove tree DnD while production is still on the legacy renderer so the later
  renderer switch does not change ordering semantics.
- Keep tree-backed generated workspace sections on one complete path. Do not
  add an opaque tree slot, direct React renderer handoff, or partial tree
  placeholder.
- Publish tree, section, and workspace changes in one commit-phase transaction;
  do not publish or notify during render.
- Preserve operation capability and display-safe failure behavior, not legacy
  sync messages, class names, DOM order, or drag tests.
- Leave production renderer selection unchanged after both renderers support
  the contract.
- Delete superseded direct record hooks, DnD code, and markup-characterization
  tests instead of retaining compatibility layers.

## Implementation Tasks

Each numbered section is intended to become one task section in Git-backed
change metadata. `change-explore` and `change-propose` may merge or split a
section when landed contracts make the boundary materially different.

### 1. Define the canonical generated tree-builder contract

- Add renderer-neutral tree, state, item, structural status, selected editor,
  child-variant chooser, context action, warning, and tree-intent contracts in
  `lib/astryx`.
- Compose canonical field-set, create-surface, operation-control,
  confirmation, empty-state, and semantic ordering contracts.
- Keep placement identity and child-record identity separate in every item and
  selected editor.
- Add a complete tree member to the canonical generated workspace result union
  without adding React nodes or renderer callbacks.
- Add a typed main tree-result reference and host node, extend snapshot typing,
  reference keys, complete-set validation, subscription hooks, and memory-host
  publication, and preserve current server snapshot and hydration semantics.
- Add focused type and serialization coverage excluding raw runtime and
  renderer-specific values.

### 2. Project the tree structure from the current record snapshot

- Add a pure generated tree foundation that receives runtime-owned record and
  result facts and projects ordered nested items for the selected root.
- Resolve child placement edges, deleted records, stable sibling order, child
  records, branch and leaf state, allowed traversal, cycles, and maximum depth
  before rendering.
- Keep relationship lookup, union policy, ancestor tracking, record maps,
  ordering fields, and schema-rich tree models outside the returned contract.
- Project unavailable and empty states explicitly, including root-level child
  creation availability.
- Flatten each complete workspace projection into the existing manifest and
  section-shell nodes plus one tree-result node and publish it through the
  stable runtime-owned host.
- Add focused foundation coverage for flat, nested, empty, missing, cyclic,
  leaf, and depth-stopped trees.

### 3. Project controlled tree selection and stable fallback

- Add runtime-owned selected placement state and a canonical item-selection
  intent.
- Project selected state onto items and one selected editor contract instead of
  rendering every full editor inside the hierarchy outline.
- Resolve initial selection, retained selection after refresh, selection after
  create, selection fallback after removal, and no-selection empty state.
- Keep selecting a node free of storage writes and workspace-root navigation.
- Add focused state and intent coverage for selection across tree refresh and
  structural mutations.

### 4. Project placement fields, child fields, and context actions

- Project separate canonical field sets for the selected placement edge and
  child record using active union, `visibleWhen`, density, heading, label,
  specialized field, draft, pending, and error facts.
- Route field intents back to generated record foundations while retaining
  reads, option loading, drafts, update resolution, operations, media effects,
  and sync feedback in runtime.
- Project context-link labels, availability, disabled reason, and navigation
  intent from the active union item-view presentation.
- Keep non-selected item rows concise and schema-derived rather than projecting
  duplicate full form layouts for every branch.
- Add focused coverage for empty placement fields, ordinary and specialized
  child fields, active variants, missing references, context links, disabled
  context targets, and failed commits.

### 5. Project allowed-child selection and canonical create surfaces

- Project parent-specific allowed child variant options with stable ids,
  schema-declared labels, disabled state, and selection intents.
- Keep active variant selection controlled in runtime and project the canonical
  create surface for only the active variant.
- Derive discriminator defaults, variant fields, hidden literal defaults, and
  placement slot values in runtime without exposing schema or raw defaults to
  the tree renderer.
- Route canonical create field, cancel, open, submit, retry, and success intents
  through the existing generated create foundation and `create-tree-child`
  operation.
- Add focused coverage for root and nested parents, leaf parents, slot-specific
  variants, validation, pending, failure retry, created selection, and closed
  dialogs.

### 6. Project remove-placement operations and confirmation

- Project one canonical remove operation control for each removable placement
  edge.
- Keep `remove-tree-placement` binding, operation controller, caller input,
  execution, refresh, and sync feedback in runtime.
- Preserve canonical destructive confirmation, pending state, display-safe
  errors, success close behavior, and retry.
- Ensure the renderer never receives a child-delete control from the placement
  removal capability.
- Add focused projection and intent coverage for unavailable, confirm, cancel,
  pending, failed, successful, and stale-selected-placement cases.

### 7. Replace tree drag behavior with semantic ordering actions

- Project top, up, down, and bottom ordering actions for each ordered placement
  within its exact parent-and-slot scope.
- Reuse or factor the canonical semantic ordering shape established by list and
  table contracts instead of exposing tree DnD props.
- Retain rank-plan calculation, boundary selection, rebalance handling, update
  operation execution, pending state, and sync feedback in runtime intent
  handling.
- Remove cross-scope drag handling, sortable refs, drag data, suspended drops,
  and renderer-owned target indexes from the tree path.
- Add focused coverage for multiple scopes, boundary actions, pending moves,
  no-op moves, rebalance failures, operation failures, and successful reorder.

### 8. Project readiness and structural diagnostics

- Project placement and child readiness warnings through canonical warning
  facts without renderer hooks.
- Add item-local structural diagnostics for missing child, cycle stopped, and
  maximum depth reached.
- Keep field errors, operation feedback, and structural warnings in their
  correct nested contracts rather than flattening all messages into one list.
- Project editing-disabled and unavailable reasons explicitly.
- Add focused coverage for combined warnings, display-safe messages, stable
  warning identity, and exclusion of records, payloads, exceptions, and sync
  internals.

### 9. Add canonical tree-builder fixtures and settle the Astryx layout

- Add package-local data-only fixtures using the production tree contract
  before replacing `src/app/generated/tree.tsx`.
- Prototype the hierarchy-outline plus focused-editor direction with Astryx
  `TreeList`, responsive layout, compact row actions, and canonical nested
  renderer fixtures.
- Cover shallow and depth-eight trees, collapsed branches, selected paths,
  empty, unavailable, missing child, cycle, depth stopped, leaf, slots,
  warnings, editing-disabled, and pending states.
- Verify that important content is discoverable without expanding every branch
  or placing every field inside a tree row.
- Keep the prototype free of records, schemas, generated runtime, operation
  controllers, DnD, storage, sync, and proof-oriented UI.
- Wrap fixture snapshots in the reusable memory host and render through the
  subscribed Astryx workspace entrypoint while retaining direct pure renderer
  tests.

### 10. Move production tree results behind the legacy renderer seam

- Add pure and subscribed legacy tree-builder renderers; the subscribed wrapper
  reads only the scoped tree-result reference and delegates presentation to the
  pure complete-snapshot renderer.
- Route production tree-result sections through the generated tree foundation,
  controlled state, intent runtime, and legacy adapter.
- Extend the canonical generated workspace foundation and legacy workspace
  host publication so tree sections no longer bypass workspace result
  composition.
- Remove direct replica and readiness hooks, operation controllers, create
  orchestration, ordering plans, and context resolution from legacy
  presentation code.
- Replace nested-card, drag-handle, Tailwind, and exact-markup assertions with
  contract, intent, capability, warning, selection, and visible-behavior
  coverage.

### 11. Implement the Astryx tree outline and selection renderer

- Implement an unexported Astryx tree-builder renderer that maps canonical
  items into Astryx `TreeList` data and adapter-created React content.
- Render concise schema-derived labels, variant facts, slots, structural state,
  selection, disclosure, and accessible item identity.
- Dispatch canonical selection and context-navigation intents without reading
  records, routes, contexts, or browser location.
- Preserve selected-path discoverability for deep trees and responsive
  hierarchy behavior without silently truncating contract items.
- Add focused renderer coverage for tree roles, keyboard behavior, disclosure,
  selection, disabled nodes, deep nesting, context actions, and narrow layouts.

### 12. Implement the Astryx selected-node editor

- Render the selected placement and child field sets in distinct, clearly
  labelled editor regions.
- Compose the canonical Astryx field renderer for ordinary, specialized,
  heading, compact, visible-label, read-only, dirty, invalid, pending, and
  missing-reference states.
- Keep auto-save and commit policy represented through field state and intents
  rather than adding a tree-specific save form.
- Render no-selection, missing-child, editing-disabled, and unavailable editor
  states through Astryx status or empty-state patterns.
- Add focused coverage for field-intent routing, edge-versus-child grouping,
  active variants, pending commits, failures, and responsive editor placement.

### 13. Implement Astryx tree child creation

- Render allowed child variants through an accessible, action-oriented Astryx
  menu, grouping only when current option count requires it.
- Dispatch controlled variant selection and render the active canonical create
  surface with the existing Astryx create renderer.
- Support root and nested add controls, disabled parents, slot-specific option
  labels, validation, cancel, pending, failure retry, and successful close.
- Keep discriminator, placement values, record creation, operation output, and
  created selection outside `lib/astryx`.
- Add focused renderer coverage for option labels, accessibility, create field
  intents, dialog state, async feedback, and leaf nodes without add controls.

### 14. Implement Astryx ordering, removal, and diagnostic actions

- Render available semantic ordering actions and remove-placement controls in a
  concise accessible node action hierarchy.
- Compose canonical operation progress, feedback, status, and destructive
  confirmation renderers for removal.
- Render readiness and structural warnings near the selected node without
  turning all tree rows into warning cards.
- Respect pending, disabled, boundary, editing-disabled, and unavailable states
  entirely from projected contract facts.
- Add focused renderer coverage for action grouping, ordering boundaries,
  pending moves, confirmation, failure retry, warnings, and absence of child
  delete behavior.

### 15. Complete tree-builder fixtures and generated workspace composition

- Expand the data-only fixture matrix to cover representative Site root types,
  allowed child policy, slot scopes, nested fields, specialized fields,
  context links, creation, ordering, removal, warnings, and async states.
- Add minimal fixture reducers for selection, field, create, operation,
  confirmation, and reorder intents behind the reusable memory host without
  simulating runtime plans.
- Compose the complete Astryx tree-builder renderer into the canonical Astryx
  subscribed generated workspace renderer for tree-result references while
  retaining the direct snapshot entrypoint.
- Verify list-detail root selection, root record detail, tree outline, selected
  node editor, and tree actions form one coherent workspace without an opaque
  tree slot.
- Keep the production renderer selector on the legacy workspace renderer.

### 16. Consolidate the tree path and remove obsolete dependencies

- Delete the superseded monolithic direct tree renderer and retain only clear
  generated foundation, runtime intent, legacy adapter, and Astryx renderer
  modules.
- Remove tree `@dnd-kit/react` imports and dependency entries if current
  exploration confirms no remaining consumer.
- Delete obsolete drag, direct-record-hook, raw-model handoff, Tailwind-markup,
  and exact-DOM tests while retaining behavior and contract coverage.
- Run current devstate checks and browser smoke the production legacy Site
  composition workspace for root selection, editing, child creation, ordering,
  removal, warning, and responsive behavior.
- Record that both renderers support the complete workspace contract and no
  production Astryx selection occurred.

## Expected Evidence

The proposed change should collect evidence for:

- complete renderer-neutral tree, item, editor, create, operation, ordering,
  warning, and intent contracts;
- generated workspace tree-result composition without React-node escape
  hatches;
- atomic host publication, stable unchanged workspace and section identities,
  tree-result-only notification, removal, server snapshots, and hydration;
- flat records remaining runtime input rather than renderer input;
- nested structure, leaf policy, missing children, cycles, and maximum depth;
- separate placement-edge and child-record field projection;
- active unions, `visibleWhen`, specialized fields, drafts, pending state, and
  failed commits;
- root and nested allowed child variants plus slot-specific creation;
- remove-placement confirmation with no child delete control;
- parent-and-slot-scoped semantic ordering and no tree DnD contract;
- selection retention and fallback after create, remove, and refresh;
- readiness and structural diagnostics with private data excluded;
- subscribed legacy renderer consumption of the scoped complete tree snapshot;
- import-confinement evidence that tree-backed production surfaces have no
  direct `@dpeek/formless-ui` imports outside their owned legacy seam modules;
- Astryx hierarchy, editor, create, action, warning, and responsive behavior;
- production legacy browser smoke after the contract migration;
- removal of obsolete tree DnD dependency when unused; and
- unchanged production renderer selection.

## Proposal-Time Spec Work

`change-propose` should reconcile at least:

- `openspec/specs/generated-ui/spec.md` for the canonical tree-builder contract,
  tree-result host reference and node, generated workspace subscribed
  composition, legacy adapter, semantic ordering, Astryx renderer, fixtures,
  and deferred production activation; and
- `openspec/specs/site-runtime/spec.md` for current Site authoring behavior,
  allowed child policy, flat placement composition, remove-placement semantics,
  and renderer-neutral tree authoring where those facts are Site-specific.

Do not change app-schema tree syntax, Site public rendering, public actions,
media, storage, or operation-handler requirements unless current exploration
finds a real behavior change.

## Completion Gate

The change is complete when:

- tree results are a complete member of the canonical generated workspace
  contract;
- tree results publish through the existing stable contract host and unchanged
  workspace or section nodes retain identity without notification;
- production Site composition projects flat records into renderer-neutral tree
  data and intents before rendering;
- the legacy renderer receives no records, schema models, relationship models,
  operation controllers, rank plans, DnD events, storage hooks, sync functions,
  or Tailwind classes through the contract;
- create-child, remove-placement, nested field editing, context navigation,
  readiness, missing-child, cycle, maximum-depth, and editing-disabled behavior
  remain supported;
- ordering uses semantic in-scope actions and tree DnD is removed;
- the Astryx renderer supports the complete contract through an accessible
  hierarchy outline and focused editor;
- canonical data-only fixtures cover real Site composition states without
  runtime imports;
- legacy and Astryx generated workspace renderers both compose tree results
  by scoped reference without an opaque slot;
- all direct `@dpeek/formless-ui` imports for tree-backed workspace surfaces are
  confined to the owned legacy seam modules identified by the change;
- obsolete monolithic tree and drag code is deleted rather than retained as a
  fallback; and
- production remains on the legacy renderer so the final renderer switch is a
  later mechanical change.
