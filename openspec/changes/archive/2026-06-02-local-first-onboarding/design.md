## Context

The current first-run paths are split. `formless onboard` discovers a Cloudflare account, deploys a workers.dev instance, creates owner setup capability, and writes global state under `.formless/instances`. Separately, instance workspaces already support reviewable manifests, app archives, local instance dev, pull, check, push, deploy, domains, and token workflows. The standalone Site project CLI still owns the top-level `init`, `dev`, `save`, `deploy setup`, and `publish` path with `formless.config.json` and `site.records.json`.

The target flow makes a local Formless workspace the first artifact and future source of truth. Cloudflare becomes an explicit deploy target after the user has explored the product locally.

## Goals / Non-Goals

**Goals:**

- Make `formless onboard` initialize a local workspace in an empty directory without Cloudflare mutation.
- Use `formless.json` as the reviewable workspace manifest and default CLI discovery file.
- Initialize the workspace without installed apps or default app archives.
- Let `formless dev` run the instance runtime against workspace-local state so the user can install the first app through the local web UI.
- Let `formless save` write local Authority state back to reviewable workspace archives.
- Let `formless deploy` explicitly create or update the Cloudflare instance, store ignored secrets, update target/deploy intent, and push the saved workspace source.
- Remove the old standalone single Site project happy path from the top-level CLI.

**Non-Goals:**

- Do not redesign generated UI, Site authoring UI, or owner setup UI.
- Do not make browser IndexedDB a source of truth.
- Do not store Cloudflare API tokens, Alchemy passwords, admin tokens, or owner setup tokens in `formless.json` or archives.
- Do not preserve legacy workspace manifest read compatibility.
- Do not seed a default Site app during onboarding.
- Do not archive completed OpenSpec changes.
- Do not add new bundled package apps beyond existing Site, Tasks, and Estii packages.
- Do not require a Cloudflare login before local dev.

## Decisions

### Reuse instance workspace primitives

Build local-first onboarding on the existing instance workspace and portable archive model. `formless onboard` should create the same kind of reviewable workspace state that `instance dev`, `check`, `push`, and `deploy` already consume, with a renamed manifest.

Alternative: extend the standalone Site project model. That would keep the current simple Site authoring path but would preserve two source-of-truth formats and would not represent installed apps, routes, deployment intent, domains, or whole-instance archives.

### Rename the manifest to `formless.json`

Use `formless.json` as the canonical workspace manifest. The implementation should update parse, format, error messages, discovery, tests, and docs to the new name. Do not keep read compatibility for `formless.instance-workspace.json` or `formless-workspace.json`; those files should be treated as conflicting legacy workspace files with precise guidance to create a new local-first workspace.

Alternative: keep the current `formless.instance-workspace.json` name. That is accurate to the existing implementation but too long for the first file users inspect and inconsistent with the requested onboarding flow.

### Make onboarding local-only

`formless onboard` should assert that the target directory is empty enough to initialize, write `formless.json`, ensure `.formless/` is ignored, and create empty reviewable archive directories. It must not list Cloudflare accounts, deploy a Worker, create setup capability, open a remote setup URL, write global instance state, declare app installs, or write app archive source.

Alternative: keep `onboard` as remote deploy and add a new `workspace init` command. That keeps compatibility but makes the product promise less direct: the obvious first command would still mutate Cloudflare.

### Do not seed apps during onboarding

The initialized workspace should start with no installed apps. Local `.formless/local` runtime state should boot as an empty product instance when no workspace archives exist. The first app install should be a local web action against the local Authority, and `formless save` should then write the reviewable app archives and control-plane source.

Alternative: seed the default Site app archive during onboarding. That gives a faster first screen but makes an app choice for the user before they have seen the product.

### Promote workspace commands to the top level

Top-level `formless dev`, `formless save`, `formless check`, `formless deploy`, and later pull/push/status shortcuts should resolve the nearest `formless.json` workspace. Existing `formless instance ...` commands can remain for advanced or explicit operations, but onboarding docs and usage should present the workspace path first.

Alternative: require `formless instance dev` after onboarding. That reuses current commands but keeps the first-run flow unnecessarily verbose and exposes internal command taxonomy too early.

### Save from local Authority into archives

`formless save` should read active local instance Authority state through runtime APIs, not browser IndexedDB, and write deterministic app archives plus reviewable control-plane intent back to the workspace. It should preserve archive validation, media payload handling, and secret exclusion.

Alternative: write from browser replica or from generated UI state. That would be easier to access from a local browser session but would violate existing source-of-truth rules and could miss committed Authority state.

### Deploy is the Cloudflare boundary

`formless deploy` should be the first command that needs Cloudflare credentials. It should plan deploy resources from `formless.json`, discover or accept the target account, create or update the Worker/R2/Durable Object resources, verify deploy metadata, write ignored deploy/admin/provider credential state under `.formless/`, update manifest target and deploy intent, create owner setup capability when needed, then dry-run and apply a workspace push to the deployed target.

The `.formless/` deploy state should keep provider facts and secrets in one known ignored location for follow-up commands. It should include Cloudflare account id, credential profile, worker/resource ids, Cloudflare API token when materialized from Alchemy or environment, Alchemy password/state token, and Formless admin token. `formless.json` should store only display-safe target/deploy intent; provider tokens, Alchemy secrets, raw lease/state tokens, and owner setup tokens stay out of manifests and archives.

Alternative: split remote deploy and data push into separate required commands. That is safer for advanced operators, but it makes the first adoption path easy to half-complete. The command can still expose dry-run or explicit flags where existing restore policy requires them.

### Remove old standalone Site project command surface

The old `formless init`, Site-project `formless dev`, Site-project `formless save`, `formless deploy setup`, and `formless publish` path should be removed from usage, tests, docs, and the main command parser. Import from a standalone Site project may remain as an archive migration tool if still needed, but it should not be the onboarding model.

Alternative: keep both command families indefinitely. That lowers migration risk but leaves users with two incompatible mental models and two local source formats.

## Risks / Trade-offs

- Existing users may have standalone Site projects -> provide clear errors or migration guidance to import project data into a workspace archive.
- Existing tests assume top-level Site project commands -> rewrite tests around workspace commands and keep only targeted archive import coverage for legacy Site project parsing.
- Save can overwrite reviewable archives with unintended local runtime state -> add `--check` behavior and deterministic stale-source detection before broad apply behavior.
- Deploy combines infrastructure mutation and data restore -> keep dry-run/validation internally and fail before apply when restore planning or target identity checks fail.
- Manifest rename breaks existing local workspaces -> fail precisely on legacy manifests and require an explicit new workspace or import path.
- Empty onboarding can leave users with no app surface -> make the local product instance expose app installation as the first local web action.
- Local dev first-run restore must not require archives -> empty workspace dev should boot an empty product instance, while `formless reset-local` still rebuilds from workspace source when archives exist.
- Copying provider credentials into `.formless/` increases local secret footprint -> keep `.formless/` ignored, reject secrets in reviewable state, and report the exact ignored secret paths written.

## Migration Plan

1. Introduce `formless.json` manifest constants, parser, formatter, discovery, and error text.
2. Remove legacy workspace manifest compatibility and fail precisely when legacy manifest files are present.
3. Add local-only `formless onboard` workspace creation that writes manifest, `.gitignore`, and empty archive directories without app archives.
4. Move top-level command routing from Site project commands to workspace commands.
5. Ensure empty workspace dev boots a local product instance where the first app can be installed through the local web UI.
6. Add workspace save from local Authority to app archives and control-plane workspace state.
7. Change deploy flow to work from `formless.json`, store ignored provider/admin secrets and copied Cloudflare credential facts locally, update target/deploy intent, verify deploy metadata, and push workspace archives by default.
8. Remove or isolate standalone Site project CLI commands and update README/OpenSpec docs.
9. Keep rollback practical by leaving lower-level archive restore/export and `formless instance ...` commands available while top-level onboarding changes land.
