# Roadmap

Last updated: 2026-05-26

Purpose: possible directions for what to work on next.

This is not shipped behavior. Shipped behavior lives in `doc/current.md` and
`doc/topics/*.md`.

This is not a backlog. Work starts when a GitHub PRD issue owns the chunk.

## Current Bias

- Prefer work that proves Formless as a schema-as-data app runtime.
- Treat installed app identity as the product app shape.
- Keep Site polish small unless it unlocks real publishing use.
- Keep data flat; compose in view/query layer.
- Promote shipped facts to topic docs after a workstream lands.

## Direction: Complex App Support

Why:

- Formless needs more proof beyond Task, Estii, and Site.
- Complex app work stress-tests schema, relationships, generated UI, actions, and read models together.

Good next chunks:

- Add one richer source app that is not Site-shaped.
- Exercise multi-screen workflows with related records.
- Improve reference workflows and scoped creation.
- Expand schema-declared actions for non-Site use cases.
- Expand query/read-model capability only when a real app chunk needs it.
- Add boards, dashboards, charts, or richer result presentations after one concrete app needs them.

Avoid:

- General platform abstraction without a source app forcing it.
- Deep computed graph work before simpler read-model gaps are exhausted.

## Direction: Site Polish

Why:

- Site is the most complete product path today.
- Site polish can make authoring and publishing smoother without changing the core model.

Good next chunks:

- First-run onboarding for standalone Site projects.
- Starter content and reset flows that are easier to trust.
- Small schema-backed theme settings.
- Better page, post, project, header, and footer authoring affordances.
- Media cleanup and replacement flows.
- Publish status, backup, and deploy feedback.

Avoid:

- Turning Formless into a general visual site builder.
- Large layout or theming systems before their schema ownership is clear.

## Direction: Authoring Ergonomics

Why:

- Generated UI is useful only when edits feel safe and direct.
- Better generic authoring helps both app and Site workstreams.

Good next chunks:

- Draft edit sessions with save/cancel.
- Cross-field validation display.
- Destructive action confirmation.
- More predictable create defaults and scoped child creation.
- Better empty, loading, and error states.
- Import/export workflows for app data.

Avoid:

- One-off UI fixes that cannot be expressed through schema or shared generated primitives.

## Direction: Runtime Productization

Why:

- Current runtime pieces work locally and in Workers.
- Productization decides whether Formless can support real users and deployments.
- The Formless instance direction names the deployment model before onboarding PRDs. See `doc/directions/formless-instance.md`.
- Product instance profile, default installed Site, generic bundled app installs, launch fixtures, portable archives, and claimable instance workspaces now exist.

Good next chunks:

- Core media app for image assets. GitHub issue #28 owns this PRD.
- Common generated media editor path for app records.
- Browser management UI for portable app and instance archives.
- Safer archive review and replacement UX.
- Users and permissions.
- Multi-tenant account routing.
- Admin token and publish hardening.
- Snapshot, backup, and restore UX.
- Observability for Authority writes, sync, and publish.
- Cross-app references or queries when a real workflow needs them.
- Local/offline instance and instance sync after one deployment story works.

Avoid:

- Account or marketplace work before one deployment story is clear.
- Bidirectional sync before local and remote instance identity exists.

## Direction: Extensibility

Why:

- Some app needs will not fit generated lists, tables, trees, and forms.
- Extensibility should preserve schema-as-data rather than bypass it.

Good next chunks:

- Plugin view registry.
- Custom result presentations backed by schema-declared views.
- App marketplace shape after source app packaging is stable.
- General media library after Site image upload limits are understood.

Avoid:

- Arbitrary custom React escape hatches as the first extensibility story.

## Direction: Docs And Examples

Why:

- Project memory is useful only if agents and humans can find the right facts.
- Examples are the clearest way to explain the runtime.

Good next chunks:

- Keep `doc/README.md` as the read map.
- Keep `doc/current.md` as the shipped behavior index.
- Keep topic docs source-faithful and short.
- Retire legacy PRDs after facts move into topic docs.
- Add example-led docs from real source apps.
- Keep direction docs clear when old PRD candidates have since shipped.

Avoid:

- Strategy prose in topic docs.
- New local PRD files.
