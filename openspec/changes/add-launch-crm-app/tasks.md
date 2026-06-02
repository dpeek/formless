## 1. Source App Schema

- [ ] 1.1 Add `schema/apps/crm/schema.json` with flat CRM entities, reference fields, relationships, constraints, queries, item/table/create views, and primary workspace screens.
- [ ] 1.2 Add `schema/apps/crm/seed-records.json` with small deterministic demo records that validate as source-shaped stored records.
- [ ] 1.3 Add schema parser or view-model tests proving CRM entities, relationships, unique constraints, queries, views, and screens parse and select expected generated admin models.

## 2. Package App Registration

- [ ] 2.1 Extend schema app key definitions, source schema loading, worker source app definitions, test fixtures, and source schema hash fixtures to include `crm`.
- [ ] 2.2 Add CRM bundled package metadata with package app key `crm`, label `CRM`, default install id `crm`, source schema key `crm`, seed records key `crm`, package revision facts, and non-Site admin/schema route behavior.
- [ ] 2.3 Add tests proving package listing, package facts, install creation, unsupported package rejection, and install-scoped CRM bootstrap work.

## 3. Launch Fixtures And Generated Navigation

- [ ] 3.1 Add a `crm` launch fixture that installs CRM at `/apps/crm` and `/apps/crm/schema` without Site public route metadata.
- [ ] 3.2 Update generated workbench routing/navigation so `/crm`, `/crm/schema`, and installed CRM app routes mount the generated app/schema surfaces.
- [ ] 3.3 Update instance management install controls and tests so CRM appears with the bundled packages and uses its default install draft values.
