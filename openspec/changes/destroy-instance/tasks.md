## 1. CLI Surface And Validation

- [ ] 1.1 Add `formless destroy` and `formless instance destroy` parser support, usage text, and command dispatch with `--workspace`, `--target`, and required `--confirm <workerName>`.
- [ ] 1.2 Add destroy input/result types and formatter output that reports workspace, selected target, Worker, domain resources, destroyed resource summary, and ignored state path.
- [ ] 1.3 Reuse workspace target selection and deployment plan resolution so destroy binds to the same Worker, Durable Object namespace, R2 media bucket, custom-domain, DNS, and redirect identities as deploy/domain apply.
- [ ] 1.4 Validate confirmation, selected target, deploy config, ignored deploy state, and default Alchemy Cloudflare credentials before any provider mutation.

## 2. Provider Destroy And State Handling

- [ ] 2.1 Extend the instance deployment adapter boundary with a destroy operation that receives the deployment plan, domain provider plan, credential profile, package root, secrets, and deploy state root.
- [ ] 2.2 Move domain provider apply/delete Alchemy ownership to the selected instance app, stage, and `.formless/deploy/<workerName>` state root.
- [ ] 2.3 Implement Alchemy destroy by opening the existing Formless instance app/stage with `phase: "destroy"` and the selected `.formless/deploy/<workerName>` state root.
- [ ] 2.4 Treat provider already-missing results as successful no-ops when the provider exposes that state, while preserving retryable state on other failures.
- [ ] 2.5 After successful provider destroy, remove or mark stale only ignored deploy state for the selected target while preserving `formless.json`, workspace archives, app archives, and ignored automation token state.

## 3. Tests And Evidence

- [ ] 3.1 Add parser and usage tests for both destroy commands, target options, missing confirmation, wrong confirmation, and unknown options.
- [ ] 3.2 Add workspace destroy tests for top-level and advanced commands covering successful destroy, source preservation, ignored state cleanup, missing deploy state, missing target, and enabled domain intent teardown.
- [ ] 3.3 Add domain provider tests proving domain apply records resources under the same instance Alchemy app/stage/root as Worker, Durable Object namespace, and R2 resources.
- [ ] 3.4 Add deployment adapter tests proving Alchemy uses the existing app/stage/root in destroy phase and does not leak provider credentials into manifests, archives, logs, or specs.
- [ ] 3.5 Run `devstate check`, read `.devstate/status.md`, and record check evidence in this task file.
