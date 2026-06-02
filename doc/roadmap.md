# Roadmap

Last updated: 2026-06-02

Purpose: concise list of possible OpenSpec changes.

This is not shipped behavior. Shipped behavior lives in
`openspec/specs/*/spec.md`.

This is not a commitment. Work starts when a committed OpenSpec change owns the
work.

## Candidate Changes

### Apps And Schema

- `add-rich-source-app`: add a non-Site app proving related records, actions, read models.
- `improve-reference-authoring`: improve generated reference selection and scoped child creation.
- `expand-schema-actions`: add more schema-declared action kinds for non-Site workflows.
- `expand-query-read-models`: add query or read-model capability required by one concrete app.
- `add-board-presentation`: add a schema-backed board result presentation.
- `add-dashboard-presentation`: add schema-backed dashboard or chart result presentations.

### Generated UI

- `add-draft-edit-sessions`: add save/cancel edit sessions for generated record editing.
- `add-cross-field-validation-ui`: show cross-field validation errors in generated forms.
- `add-destructive-action-confirmation`: add generated confirmation flows for destructive actions.
- `improve-create-defaults`: make generated create defaults and scoped creation more predictable.
- `improve-generated-states`: improve generated empty, loading, and error states.
- `add-app-data-import-export`: add generated import/export workflows for app data.

### Site

- `add-site-first-run-onboarding`: add first-run onboarding for standalone Site projects.
- `add-site-starter-reset`: add trustworthy starter content and reset flows.
- `add-site-theme-settings`: add small schema-backed theme settings.
- `improve-site-content-authoring`: improve page, post, project, header, and footer authoring.
- `improve-site-media-replacement`: add media cleanup and replacement flows for Site records.
- `improve-site-publish-feedback`: improve publish status, backup, and deploy feedback.

### Instance And Deployment

- `add-archive-management-ui`: add browser management UI for portable app and instance archives.
- `add-deployment-management-ui`: add browser UI for deploy targets, attempts, drift.
- `add-provider-credential-setup`: add browser provider configuration and least-privilege credential setup.
- `retire-direct-domain-fallback`: remove duplicate direct Cloudflare domain apply paths.
- `add-wildcard-domains`: add wildcard domain mapping and ingress coverage.
- `add-snapshot-backup-restore-ui`: add browser UX for snapshots, backups, and restore.
- `add-runtime-observability`: add observability for Authority writes, sync, publish, and deploy.
- `add-local-offline-instance-sync`: add local/offline instance sync after deployment identity is stable.

### Media

- `add-media-management-ui`: add browser management UI for core media assets.
- `add-video-media-support`: add video upload, storage, delivery, and player support through core media.
- `add-media-provider-adapters`: add provider adapters behind the Media package boundary.
- `add-general-media-library`: add a general media library once core ownership rules need it.

### Auth, People, And Contacts

- `add-roles-groups-orgs`: add role, group, and organization permissions beyond owner sessions.
- `add-multi-tenant-accounts`: add multi-tenant account routing.
- `harden-admin-token-and-publish`: harden admin bearer and publish boundaries.
- `add-authenticated-actions`: add action execution for passkey-backed owner and user sessions.
- `expand-public-action-forms`: reuse public action policy for more public forms.
- `add-contact-unsubscribe-suppression`: add unsubscribe, suppression, and preference-center flows.
- `add-contact-topics-segments`: add contact topics and segments.
- `add-email-broadcast-jobs`: add Cloudflare Email Service sending through queued broadcast jobs.
- `add-turnstile-provisioning`: add Turnstile provisioning through deployment/runtime configuration.
- `promote-contacts-capability`: promote Site contact subscriptions into a shared Contacts or CRM capability.

### Extensibility And New Capabilities

- `add-plugin-view-registry`: add a registry for schema-backed custom view presentations.
- `add-custom-result-presentations`: add custom result presentations backed by schema-declared views.
- `add-app-marketplace-shape`: define app marketplace/package metadata after source app packaging is stable.
- `add-cross-app-references`: add cross-app references or queries when a real workflow needs them.
- `add-job-workflows`: add queues, scheduled work, and durable workflow capability.
- `add-agent-actions`: add agent-facing action routes and audit boundaries.
- `add-browser-rendering-jobs`: add Browser Rendering capture, preview, or document jobs.
- `add-ejection-path`: define ejection into a normal Cloudflare project or portable package.
