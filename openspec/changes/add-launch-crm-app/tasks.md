## 1. Source App Schema

- [x] 1.1 Add `schema/apps/crm/schema.json` with flat CRM entities, reference fields, relationships, constraints, queries, item/table/create views, and primary workspace screens.
- [x] 1.2 Add `schema/apps/crm/seed-records.json` with small deterministic demo records that validate as source-shaped stored records.
- [x] 1.3 Add schema parser or view-model tests proving CRM entities, relationships, unique constraints, queries, views, and screens parse and select expected generated admin models.

Evidence 2026-06-02 thag:

- Files changed: `schema/apps/crm/schema.json`, `schema/apps/crm/seed-records.json`, `src/client/crm-schema.test.ts`.
- Checks: `devstate check` passed; status showed `vp check --fix` pass, web service ready, watch tests pass.
- Smoke: not run; this section adds the source schema and tests only, while CRM route/package registration remains in later sections.

## 2. Package App Registration

- [x] 2.1 Extend schema app key definitions, source schema loading, worker source app definitions, test fixtures, and source schema hash fixtures to include `crm`.
- [x] 2.2 Add CRM bundled package metadata with package app key `crm`, label `CRM`, default install id `crm`, source schema key `crm`, seed records key `crm`, package revision facts, and non-Site admin/schema route behavior.
- [x] 2.3 Add tests proving package listing, package facts, install creation, unsupported package rejection, and install-scoped CRM bootstrap work.

Evidence 2026-06-02 thag:

- Files changed: `src/shared/schema-apps.ts`, `src/worker/schema-apps.ts`, `src/test/schema-apps.ts`, `src/shared/upgrade-migrations.ts`, `src/shared/app-installs.ts`, `src/shared/app-storage-identity.test.ts`, `src/shared/instance-control-plane.ts`, `src/worker/instance-app-installs-state.ts`, `src/shared/schema-apps.test.ts`, `src/worker/schema-apps.test.ts`, `src/shared/upgrade-migrations.test.ts`, `src/shared/app-installs.test.ts`, `src/shared/instance-control-plane.test.ts`, `src/worker/instance-app-installs.test.ts`, `src/worker/deploy-metadata.test.ts`, `src/app/runtime-profile.test.ts`.
- Checks: `devstate check` passed; status showed `vp check --fix` pass, web service ready, watch tests pass.
- Smoke: `bun browser --ignore-https-errors --session thag-crm open https://thag.formless.local/crm` and `bun browser --ignore-https-errors --session thag-crm snapshot --compact --depth 4` passed; snapshot showed CRM navigation, Contacts/Audiences/Campaigns/Broadcasts screens, CRM settings, and generated Contacts/Email addresses/Companies sections.

## 3. Launch Fixtures And Generated Navigation

- [x] 3.1 Add a `crm` launch fixture that installs CRM at `/apps/crm` and `/apps/crm/schema` without Site public route metadata.
- [x] 3.2 Update generated workbench routing/navigation so `/crm`, `/crm/schema`, and installed CRM app routes mount the generated app/schema surfaces.
- [x] 3.3 Update instance management install controls and tests so CRM appears with the bundled packages and uses its default install draft values.

Evidence 2026-06-02 thag:

- Files changed: `src/shared/launch-fixtures.ts`, `src/shared/launch-fixtures.test.ts`, `src/worker/launch-fixtures.test.ts`, `src/worker/launch-fixture-startup.test.ts`, `src/app.test.tsx`, `src/app/routes/instance-shell.tsx`, `src/app/routes/instance-shell.test.tsx`.
- Checks: `devstate check` passed; status showed `vp check --fix` pass, web service ready, watch tests pass.
- Smoke: `bun browser --ignore-https-errors --session thag-crm open https://thag.formless.local/crm`, `bun browser --ignore-https-errors --session thag-crm snapshot --compact --depth 4`, `bun browser --ignore-https-errors --session thag-crm open https://thag.formless.local/crm/schema`, and `bun browser --ignore-https-errors --session thag-crm snapshot --compact --depth 4` passed; snapshots showed CRM runtime navigation, Contacts/Audiences/Campaigns/Broadcasts links, CRM settings Schema link, generated Contacts/Email addresses/Companies sections, and the CRM schema editor.
