## Context

Formless currently ships source app schemas for Tasks, Estii, and Site. Those schemas are loaded through `src/shared/schema-apps.ts`, `src/worker/schema-apps.ts`, package metadata in `src/shared/app-installs.ts`, source schema hash fixtures in `src/shared/upgrade-migrations.ts`, and generated screens/views declared in each source schema.

CRM should prove the same runtime can host a useful non-Site app. The first change establishes the app package and admin workflows only. Site subscribe forms, public action binding, queued email sending, unsubscribe flows, and segment logic stay in later roadmap changes.

## Goals / Non-Goals

**Goals:**

- Add source schema key and package app key `crm`.
- Model CRM data with flat records, reference fields, and join records.
- Make `crm` installable with default package metadata and install-scoped storage.
- Provide generated screens/views that are useful for owner review of contacts, companies, audiences, subscriptions, campaigns, broadcasts, recipients, and delivery events.
- Include small demo seed records when they help validate generated UI flows.

**Non-Goals:**

- Do not wire Site subscribe blocks or forms to CRM.
- Do not change or retire Site-owned subscriber records.
- Do not add public subscribe action bindings for CRM.
- Do not send queued email or call an email provider.
- Do not implement unsubscribe, suppression, or preference-center flows.
- Do not add segments unless implementation discovers they are required to make the first schema valid.
- Do not add custom CRM React surfaces.

## Decisions

### Use a normal bundled source app

CRM uses `schema/apps/crm/schema.json` and `schema/apps/crm/seed-records.json`, then is registered beside Tasks, Estii, and Site. This keeps source schema parsing, seed validation, reset, bootstrap, package revision, and source hash behavior on existing runtime paths.

Alternative considered: implement CRM as a custom app surface with code-owned data types. That would not prove schema-as-data runtime capability and would skip generated UI.

### Keep one package app key and one source schema key

Use `crm` for the schema key, package app key, seed records key, and default install id. Installed instances still choose any valid install id, but package defaults should install `/apps/crm` and `/apps/crm/schema`.

Alternative considered: use a shorter install id such as `crm`. That makes routes friendlier, but splits package identity from the flagship app name and adds a special default.

### Model membership and delivery as join records

Use references for `contact.company`, `email-address.contact`, `subscription.emailAddress`, `subscription.audience`, `campaign-message.campaign`, `broadcast.campaign`, `broadcast.message`, `broadcast.audience`, `broadcast-recipient.broadcast`, `broadcast-recipient.emailAddress`, `broadcast-recipient.subscription`, and `delivery-event.broadcastRecipient`. Add unique constraints where membership identity matters, especially normalized email address and email-address/audience subscription pairs.

Alternative considered: embed email addresses under contacts or recipients under broadcasts. That violates the flat record model and would make generated collection views less useful.

### Start without segments

Audiences are explicit lists through `subscription` records. Broadcast recipients can be demo or manually created records in this first change. Segment rules and automated recipient snapshots belong in later roadmap changes.

Alternative considered: add segments immediately so broadcasts can target computed subsets. That adds query/rule semantics before the app package proves the simpler generated workflows.

### Use generated admin screens as the product surface

The schema should define primary screens such as Contacts, Audiences, Campaigns, and Broadcasts. Screens compose collection views with table/list results, query tabs for useful statuses, create views for owner-managed records, and read-only event/review tables for delivery evidence.

Alternative considered: expose every collection as primary navigation. Screens give the app a coherent CRM workspace while preserving generated UI contracts.

### Keep public action and email boundaries explicit

The CRM schema may include status and source fields needed for future workflows, but this change does not add anonymous public action access, Site block bindings, email provider jobs, unsubscribe links, or preference-center routes.

Alternative considered: include a first subscribe action now. That would couple CRM to Site integration before the standalone app and generated admin surface are established.

## Risks / Trade-offs

- Schema grows faster than generated UI ergonomics → keep the first schema focused on reviewable owner workflows and use existing table/list/create surfaces.
- Demo seed records can become brittle → keep seeds small, deterministic, source-record shaped, and validated against the schema.
- Unique constraints may be too strict for future multi-email/contact workflows → scope uniqueness to normalized email address and join identity within one app storage identity.
- CRM could be mistaken as replacing Site subscribers → keep specs and implementation tests explicit that Site subscribe behavior remains unchanged.
- Adding a new schema key touches many closed unions → update registry, worker source loading, source hash fixtures, package metadata, launch fixtures, tests, and generated navigation together.
