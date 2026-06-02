## Why

Local-first onboarding now lets users move from `formless onboard` to a
deployed Cloudflare instance, but testing first-owner passkey setup requires a
clean remote instance. Re-deploying over the same target preserves Durable
Object storage, so users need an explicit way to tear down the deployed
instance and recreate it from workspace source.

## What Changes

- Add a workspace-selected `formless destroy` command for local-first
  workspaces.
- Add an advanced `formless instance destroy` command for workspaces with a
  configured remote target.
- Destroy the Cloudflare resources owned by the workspace deploy target:
  Worker, Durable Object namespace, R2 media bucket, Worker assets, Worker
  secrets, custom-domain provider resources, DNS and redirect provider
  resources, and Alchemy state for that instance deploy.
- Move instance deploy resources and custom-domain provider resources under the
  same Alchemy app/stage so teardown can destroy one provider-owned graph.
- Keep reviewable source untouched: `formless.json`, workspace archives, and
  app archives remain in place unless the user explicitly removes them.
- Remove or mark stale only ignored deploy/runtime state under `.formless/`
  after provider destroy succeeds.
- Require an explicit confirmation value tied to the selected Worker name before
  destructive provider mutation.
- Keep secrets out of manifests, archives, browser responses, and specs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `site-cli-publish`: Add explicit workspace and instance destroy commands for
  Cloudflare-backed Formless instances.

## Impact

- CLI parser, usage text, command dispatch, formatting, and tests under
  `src/site/`.
- Instance workspace deployment planning and ignored deploy-state handling.
- Alchemy Cloudflare deployment adapter use for unified deploy and destroy
  modes.
- Domain provider runner Alchemy app/stage ownership.
- OpenSpec `site-cli-publish` requirements for local workspace command
  families and deployment lifecycle commands.
