## 1. CLI Surface And Validation

- [x] 1.1 Add `formless destroy` and `formless instance destroy` parser support, usage text, and command dispatch with `--workspace`, `--target`, and required `--confirm <workerName>`.
- [x] 1.2 Add destroy input/result types and formatter output that reports workspace, selected target, Worker, domain resources, destroyed resource summary, and ignored state path.
- [x] 1.3 Reuse workspace target selection and deployment plan resolution so destroy binds to the same Worker, Durable Object namespace, R2 media bucket, custom-domain, DNS, and redirect identities as deploy/domain apply.
- [x] 1.4 Validate confirmation, selected target, deploy config, ignored deploy state, and default Alchemy Cloudflare credentials before any provider mutation.

Evidence:

- Files changed: `src/site/cli-command.ts`, `src/site/cli.ts`, `src/site/instance-workspace.ts`, `src/site/instance-onboarding.ts`, `src/site/cli.test.ts`.
- `devstate check` passed on 2026-06-02; `.devstate/status.md` reports checks ok, web service ready, test service pass.

## 2. Provider Destroy And State Handling

- [x] 2.1 Extend the instance deployment adapter boundary with a destroy operation that receives the deployment plan, domain provider plan, credential profile, package root, secrets, and deploy state root.
- [x] 2.2 Move domain provider apply/delete Alchemy ownership to the selected instance app, stage, and `.formless/deploy/<workerName>` state root.
- [x] 2.3 Implement Alchemy destroy by opening the existing Formless instance app/stage with `phase: "destroy"` and the selected `.formless/deploy/<workerName>` state root.
- [x] 2.4 Treat provider already-missing results as successful no-ops when the provider exposes that state, while preserving retryable state on other failures.
- [x] 2.5 After successful provider destroy, remove or mark stale only ignored deploy state for the selected target while preserving `formless.json`, workspace archives, app archives, and ignored automation token state.

Evidence:

- Files changed: `src/site/instance-onboarding.ts`, `src/site/instance-workspace.ts`, `src/site/domain-provider-runner.ts`, `src/site/cli.ts`, `src/site/cli.test.ts`.
- `devstate check` passed on 2026-06-02; `.devstate/status.md` reports checks ok, web service ready, and test service pass.
- Browser smoke not run; this section changes CLI provider destroy/domain-runner behavior, not browser UI behavior.

## 3. Tests And Evidence

- [x] 3.1 Add parser and usage tests for both destroy commands, target options, missing confirmation, wrong confirmation, and unknown options.
- [x] 3.2 Add workspace destroy tests for top-level and advanced commands covering successful destroy, source preservation, ignored state cleanup, missing deploy state, missing target, and enabled domain intent teardown.
- [x] 3.3 Add domain provider tests proving domain apply records resources under the same instance Alchemy app/stage/root as Worker, Durable Object namespace, and R2 resources.
- [x] 3.4 Add deployment adapter tests proving Alchemy uses the existing app/stage/root in destroy phase and does not leak provider credentials into manifests, archives, logs, or specs.
- [x] 3.5 Run `devstate check`, read `.devstate/status.md`, and record check evidence in this task file.

Evidence:

- Files changed: `src/site/cli.ts`, `src/site/cli.test.ts`, `src/site/instance-onboarding.test.ts`.
- Parser coverage now includes destroy `--confirm` missing-value cases in addition to existing usage, target, missing-confirm, and unknown-option cases.
- Workspace destroy coverage now asserts top-level and advanced destroy paths, wrong confirmation pre-mutation guard, missing target guard, source/archive preservation, `.formless/deploy/<workerName>` cleanup, automation token preservation, missing deploy state, incomplete deploy secrets, and enabled domain intent reporting.
- Domain provider coverage proves workspace domain apply resolves to `formless-instance`, the selected Worker stage, and `.formless/deploy/<workerName>` state root with deploy-state secrets.
- Deployment adapter coverage proves Alchemy destroy opens the existing `formless-instance` app/stage/root in `phase: "destroy"`, declares Worker, Durable Object namespace, and R2 resources, wraps provider secrets before Worker props, and reports custom-domain, DNS, redirect, and Alchemy destroy summaries.
- `devstate check` passed on 2026-06-02; `.devstate/status.md` reports checks ok, web service ready, and test service pass.
- Browser smoke not run; this section changes CLI/unit test coverage and one exported test seam, not browser UI behavior.

Finalization:

- Rebased `changes/destroy-instance` on local `main` on 2026-06-02 with no conflicts.
- Promoted shipped destroy command, confirmation, provider resource teardown, ignored state preservation, credential boundary, and unified domain provider Alchemy ownership facts to `openspec/specs/site-cli-publish/spec.md`.
- Finalization `devstate check` passed on 2026-06-02; `.devstate/status.md` reports checks ok, web service ready, and test service pass.
