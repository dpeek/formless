## MODIFIED Requirements

### Requirement: Schema Control-Plane Protocol

The Site CLI SHALL use the instance protocol to query schema-owned app install,
route, and deployment records when the target supports them.

#### Scenario: CLI reads deployment records

- GIVEN a claimed instance workspace targets a runtime with schema-owned
  control-plane records
- WHEN CLI status, check, pull, push, plan, deploy, or domain workflows need
  instance control-plane state
- THEN they read allowed app install, route, domain, and deployment records
  through the instance control-plane protocol using canonical entity keys such
  as `app-install`, `app-route`, `domain-mapping`,
  `redirect-intent`, `deploy-target`, `provider-config-ref`,
  `deploy-desired-resource`, `deploy-attempt`,
  `deploy-evidence-summary`, and `deploy-drift-report`
- AND provider credentials remain in CLI or runner-held secret locations

#### Scenario: CLI writes qualified workspace record source

- GIVEN a local workspace operation writes reviewable control-plane record
  source
- WHEN CLI save, pull, push, check, deploy, or domain workflows emit record
  entity identity outside the declaring schema
- THEN they use qualified entity names such as `instance:app-install`,
  `instance:app-route`, `instance:domain-mapping`, and
  `instance:deploy-target`
- AND installed app data remains scoped to app archive or app snapshot payloads
  instead of instance control-plane records

#### Scenario: CLI binds exact desired-state version

- GIVEN `formless instance domains run-apply` or a deployment command starts
  against a schema-owned target
- WHEN the command reads desired deployment state
- THEN it binds existing deployment-runtime attempt and writeback calls to the
  exact desired-state version and idempotency key
- AND runner-held credentials remain outside browser, archive, and workspace
  manifest responses

#### Scenario: CLI reads app routes

- GIVEN an instance workspace needs installed app or public Site route state
- WHEN route state is available as schema-owned records
- THEN the CLI reads `app-install` and `app-route` records
- AND route drift is reported by comparing route records rather than
  hand-derived install route strings
- AND external drift output identifies those records as `instance:app-install`
  and `instance:app-route`
