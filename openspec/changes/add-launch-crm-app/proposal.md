## Why

Formless needs a flagship non-Site app that proves app schema can model useful product workflows with flat records, install-scoped storage, and generated admin surfaces. CRM is the first step: an installable startup audience and CRM package app that stands apart from Site-owned subscribe behavior.

## What Changes

- Add a bundled `crm` source app schema with flat records for contacts, email addresses, companies, audiences, subscriptions, campaigns, messages, broadcasts, broadcast recipients, and delivery events.
- Add package app metadata for `crm`, including package revision facts, source schema hash, seed record key, default label, default install id, and non-Site admin/schema routes.
- Add default install support for CRM where fixture or starter policy chooses it, without changing the existing default Site install behavior.
- Add generated admin screens and views for reviewing contacts, companies, audiences, subscriptions, campaigns, broadcasts, recipients, and delivery events.
- Add seed/demo records only where they make the generated workflows understandable and remain source-record shaped.
- Keep Site subscribe records, public action bindings, email sending, unsubscribe/preference-center flows, and segments out of this change.

## Capabilities

### New Capabilities

- `crm-app`: Bundled installable CRM package app schema, install metadata, flat CRM records, demo records, and generated admin workflows.

### Modified Capabilities

- `app-schema`: Bundled source app support includes the `crm` schema key and its source seed records.
- `installed-apps`: Bundled package app metadata and install initialization include the `crm` package app.
- `generated-ui`: Source-app and installed-app navigation/install controls include CRM generated admin screens.

## Impact

- Affected files: `schema/apps/crm/`, package app metadata helpers, source schema registry, launch fixture or starter install policy, generated app navigation, and tests for schema parsing/install/bootstrap/UI model selection.
- Affected APIs: existing app install registry and install-scoped bootstrap APIs accept package app key `crm`; no new public write API is added.
- Affected runtime behavior: CRM app data uses its own app install id storage identity, browser replica, Authority storage, broadcast channel, admin route, and schema route.
- Boundary preserved: Site-owned subscriber records and Site subscribe forms continue to work unchanged until later public action binding changes.
