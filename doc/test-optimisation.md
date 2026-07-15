# Test Optimisation Goal

Last updated: 2026-07-15

Purpose: guide bounded work that improves Formless test performance and stability
without weakening behavioral coverage, test isolation, or production Worker
semantics.

This is an engineering recommendation. Shipped runtime behavior lives in
`openspec/specs/*/spec.md`.

## Workflow Exception

Run this goal as experimental test-infrastructure work in its dedicated
worktree. Do not create or manage `changes/<change-id>` branches, structured
change task metadata, or canonical capability spec patches for each experiment.
Use ordinary goal-worktree commits as reversible checkpoints and keep the goal
ledger current.

This work must not change production runtime behavior. Performance findings
belong in this document or in test configuration and tooling that enforce the
chosen boundary. Update `openspec/specs/*/spec.md` only if the work discovers and
intentionally changes a shipped runtime contract; that is outside this goal and
requires separate user direction.

Benchmark with direct `vp test` commands. Do not use `vp run`, package scripts,
or `devstate` to collect timing evidence because orchestration and stale-state
overhead would contaminate comparisons. Run `devstate check` once after the
final accepted implementation for repository validation, but do not treat its
timings as benchmark evidence.

## Goal

Reduce the wall time and resource instability of the Formless source test suite
while preserving its existing assertions and isolation guarantees.

The primary performance boundary is the complete `./src` test suite.
`src/worker/public-operations.test.ts` is an initial measured hotspot and a
focused diagnostic, not the goal boundary. Optimisations must be evaluated by
their effect on the full source suite; focused-file improvements are supporting
evidence only.

Use measurements to decide how far to proceed. The work is not an open-ended
request to make every test faster. It covers:

1. Reusing repeated direct Miniflare binding variants where every mutable
   resource has an explicit reset contract.
2. Establishing Cloudflare's Vitest Workers integration and migrating a
   representative group of Worker tests.
3. Deciding from full-suite and watch-rerun evidence whether further migration
   should be proposed as follow-up work.

Do not change production Worker behavior, reduce assertion coverage, weaken
test isolation, or increase timeouts to obtain a faster result.

## Performance Ledger

Maintain a running experiment ledger throughout the goal. Record the fresh
baseline before implementation, then add one entry for every candidate change,
including changes that are reverted or rejected.

Each entry must include:

- change or commit identity;
- hypothesis and affected test boundary;
- implementation and maintenance complexity introduced;
- median full-suite, focused-file, and watch-rerun measurements available for
  that experiment;
- test counts, failures, and timeout evidence;
- difference from the fresh baseline and previous accepted experiment; and
- decision: keep, revise, revert, or defer, with the reason.

Keep the ledger in goal progress while experimenting and include the relevant
entry in each goal-worktree checkpoint commit. Do not create a separate planning
or status document. Summarize the complete ledger in the final goal report.

Prefer changes with the largest repeatable improvement for the least additional
configuration, reset machinery, and test-only infrastructure. The agent may
reject or revert an optimisation when its measured improvement is within noise
or does not justify its ongoing complexity, even when the change is technically
correct. Compare cumulative results as well as individual results so interacting
optimisations are not credited incorrectly.

## Completion And Stop Conditions

Complete this goal when all of the following are true:

- the current main branch has a fresh uncached baseline using the benchmark
  protocol below;
- repeated binding variants selected for reuse no longer create equivalent
  Miniflare instances per test, and their reset contracts cover every mutable
  resource they use;
- a narrowly scoped Cloudflare Vitest Workers project runs a representative
  group of request, binding, and Durable Object tests;
- all source and script tests pass without Worker-start, hook, test, or teardown
  timeouts;
- the final report compares median full `./src` suite time, focused Worker-file
  time, and watch-rerun time with the fresh baseline; and
- the evidence supports a clear recommendation to continue, pause, or stop the
  remaining Worker-test migration.

Stop implementation and report the evidence instead of continuing when any of
these conditions is met:

- a candidate optimisation requires weaker assertions, shared mutable state
  without a complete reset, production-only compatibility changes, or larger
  timeouts;
- two consecutive representative migration slices fail to improve either the
  median full-suite time or the watch-rerun time after configuration and
  correctness issues are resolved;
- the Cloudflare project cannot preserve required Node-orchestration tests and
  Worker semantics through a clear project boundary; or
- the representative migration and measurements are complete. Further file
  migration is follow-up work, not part of this goal.

The historical 50.75-second result remains diagnostic context, not the success
threshold. Recommendation 1 has landed, so acceptance decisions must use the
fresh main-branch baseline.

## Scope

The originally investigated command was:

```sh
vp run --no-cache --filter @dpeek/formless test
```

The package script runs the source tests first and the script tests second. Do
not use that orchestration command for new goal measurements. The root Vite Plus
configuration sets `test.cache` to `false`, and direct benchmark commands also
pass `--no-cache` to make that condition explicit.

The source suite contains ordinary Node tests and Worker integration tests in the
same Vitest project. Vitest uses its `forks` pool and all available parallelism by
default. On the measured machine that means eight Node child processes. See:

- `package.json`
- `vite.config.ts`
- <https://vitest.dev/config/maxworkers>
- <https://vitest.dev/guide/improving-performance.html#pool>

## Measurements

Measurements were taken on an eight-core, 16 GiB machine. They are individual
samples, not stable performance guarantees.

| Case                                  | Result                               |
| ------------------------------------- | ------------------------------------ |
| Source suite, four workers, uncached  | 1,722 tests passed in 50.75 seconds  |
| Source suite, two workers, uncached   | 1,722 tests passed in 77.79 seconds  |
| Script suite, four workers, uncached  | 37 tests passed in 0.248 seconds     |
| `public-operations.test.ts`, isolated | 43 tests passed in 13.04 seconds     |
| Cloudflare pool Tasks bootstrap spike | One test passed in 7.72 seconds cold |

An uncapped full-suite sample became resource-starved, failed to start some
Vitest fork workers, and finished with timeout failures after 212.82 seconds.
Other repeated samples also became unstable after sustained Worker test load.
Those failed samples are evidence of oversubscription, not useful throughput
benchmarks.

The four-worker sample is the current comparison baseline. It completed the
source suite without failures and was approximately 35% faster than the
reported 77-second run. The root test configuration therefore limits
`maxWorkers` to `"50%"`, which resolves to four workers on the measured machine
and scales with available parallelism on other machines.

## Current Bottleneck

Worker tests use `createWorkerHarness()` from
`src/worker/miniflare-test.ts`. Static analysis found 48 call sites across 39
test files.

Each harness:

1. Resolves or builds an esbuild bundle.
2. Creates a Miniflare instance.
3. Starts the Worker runtime on the first request.
4. Opens Durable Object, R2, queue, binding, or service-binding state requested
   by that test.
5. Disposes the Miniflare instance after the file or individual test.

The harness maintains an in-memory bundle cache, but Vitest's isolated fork
processes do not share JavaScript memory. Each fork owns its own cache. Cache
hits also call `workerBundleIsFresh()`, which stats every esbuild metafile input
before returning the bundle.

Targeted instrumentation of `src/worker/public-operations.test.ts` measured:

- Initial `src/worker/index.ts` bundle: about 239 milliseconds.
- Generated public-operation harness bundle: about 40 milliseconds.
- Cached bundle validation or rebuild path: about 25–40 milliseconds.
- Miniflare constructor: less than 3 milliseconds.
- First request to the shared main harness: about 158 milliseconds.
- First request to each additional configured harness: about 716–755
  milliseconds.
- Harness disposal: about 2 milliseconds.

The file creates extra harnesses for binding variants such as configured email,
missing email configuration, missing queue bindings, and Turnstile response
variants. Roughly nine seconds of its 13.04-second runtime was first-request
startup for these additional Miniflare instances. Relevant examples are in
`src/worker/public-operations.test.ts` around the notification, queue, and
Turnstile tests.

This means the primary cost is not application assertions or Miniflare object
construction. It is repeated Worker runtime startup and module evaluation.
esbuild work is a smaller secondary cost.

## Immediate Configuration

Keep these settings in the main Node test project:

```ts
test: {
  cache: false,
  maxWorkers: "50%",
}
```

Do not disable file parallelism globally. Two workers were materially slower
than four on the measured machine. The problem is excessive concurrency, not
parallel execution itself.

Do not increase test or hook timeouts to hide resource starvation. Fixed timeout
failures are a symptom of Worker startup or event-loop starvation. Larger
timeouts turn the same problem into a longer wait.

## Stage 1: Reuse Binding Variants Within A File

Where the direct Miniflare harness remains, create stable harness variants in
`beforeAll()` and reset their durable state in `beforeEach()` instead of creating
and disposing an equivalent instance inside each test.

Only reuse a harness when the reset path covers all mutable state used by the
test:

- Durable Object storage.
- R2 objects.
- queued messages or queue observations.
- module-global arrays and spies.
- service-binding request captures.
- runtime variables and configured secrets.

Do not share a harness across tests merely to improve timing. Incomplete reset
coverage creates order-dependent tests. Prefer one shared harness per immutable
binding configuration, with explicit reset helpers for every mutable resource.

Start with repeated configurations in `public-operations.test.ts` because it is
a measured hotspot. Keep unique one-off configurations isolated until a reset
contract exists. Continue only when the change improves or usefully explains
full `./src` suite performance.

## Stage 2: Adopt Cloudflare's Vitest Integration

Cloudflare recommends `@cloudflare/vitest-pool-workers` for Worker unit and
integration tests. The integration runs tests inside workerd, provides direct
bindings and Durable Object access, isolates storage per test file, and reuses
Workers and module caches where possible.

Official references:

- <https://developers.cloudflare.com/workers/testing/vitest-integration/>
- <https://developers.cloudflare.com/workers/testing/vitest-integration/configuration/>
- <https://developers.cloudflare.com/workers/testing/vitest-integration/isolation-and-concurrency/>
- <https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/>
- <https://developers.cloudflare.com/durable-objects/examples/testing-with-durable-objects/>

A disposable spike used `@cloudflare/vitest-pool-workers` 0.18.4 with the
repository's Vitest 4.1.9 runtime. It proved that:

- Vite Plus can invoke the Cloudflare pool.
- `src/worker/wrangler.jsonc` loads successfully.
- The existing `runtimeViteConfig()` plugins must also be included so
  `virtual:formless/site-public-renderer/worker` resolves.
- A request through `SELF` to `/api/tasks/bootstrap` reaches the real Worker and
  SQLite Durable Object and returns the Tasks bootstrap response.
- The passing test body took about 18 milliseconds after pool startup.
- Cold one-file startup took 7.72 seconds.

The cold result is important: the Cloudflare pool is not an automatic win for a
single one-shot test file. Its expected benefit is removing bespoke bundle and
Miniflare lifecycle work across the Worker suite and accelerating repeated watch
runs through Worker and module-cache reuse.

## Recommended Test Project Shape

Use separate Vitest projects rather than moving every test into workerd.

### Node project

Keep these tests in the ordinary Vite Plus project:

- schema parsing and validation;
- pure operation selection;
- projections and read models;
- React and client tests;
- filesystem and package-boundary tests;
- test tooling that requires `node:fs`, temporary directories, or esbuild.

Keep `maxWorkers: "50%"` initially. Re-benchmark Node-only tests after Worker
tests move out; they may safely support higher concurrency once nested workerd
processes are gone.

### Workers project

Move tests that require real Worker semantics:

- Worker routing through `SELF`;
- Durable Object storage and transactions;
- R2 and queue bindings;
- service bindings;
- Worker runtime APIs;
- storage isolation and Durable Object eviction behavior.

Use `SELF` for full request integration, `env` for configured bindings, and
`runInDurableObject()` for direct Durable Object inspection or setup. Keep
production requests as the primary seam when they already express the behavior
under test.

The Workers config should compose the current runtime plugins with
`cloudflareTest()` and load `src/worker/wrangler.jsonc`. A first-pass shape is:

```ts
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import { runtimeViteConfig } from "./src/runtime/vite-config.ts";

const runtime = runtimeViteConfig();

export default defineConfig({
  ...runtime,
  plugins: [
    ...(runtime.plugins ?? []),
    cloudflareTest({
      wrangler: { configPath: "./src/worker/wrangler.jsonc" },
    }),
  ],
});
```

Keep the final config narrowly scoped to Worker test files. Do not load the
Cloudflare pool for all source tests.

## Migration Constraints

The existing suite cannot move unchanged.

1. Many Worker tests import `node:fs`, create temporary TypeScript entrypoints,
   and call esbuild. Cloudflare pool test files run inside workerd. Keep Node
   orchestration in the Node project or move static preparation into supported
   configuration and global setup.
2. Generated harness entrypoints must become static test Workers, auxiliary
   Workers, direct imports, or dedicated Worker test projects.
3. Tests with many binding combinations need explicit project configurations or
   static auxiliary Worker definitions. Do not rebuild the full runtime inside
   individual tests.
4. The pool enables Node compatibility needed by Vitest. Cloudflare warns that
   tests can expose Node APIs unavailable in production unless production uses
   equivalent compatibility flags. Worker tests should continue to avoid Node
   APIs in runtime code.
5. The current virtual Site renderer module must remain resolved through
   `runtimeViteConfig()` or an equivalent narrowly-scoped plugin.

## Goal Work Order

### Phase 1: Establish the Workers project

- Add `@cloudflare/vitest-pool-workers` as a development dependency.
- Add the Worker-specific Vitest configuration.
- Add one Tasks bootstrap test through `SELF`.
- Run the Node and Worker projects through direct `vp test` configuration
  invocations.
- Record cold full-suite and watch-rerun baselines.

### Phase 2: Migrate A Representative Worker Slice

Move tests already using `src/worker/index.ts` with the standard Wrangler
bindings. These are closest to the successful spike and require the least
harness translation. The slice must exercise request routing and Durable Object
storage. Include a binding-dependent test when it fits without introducing a
second project configuration.

Stop and evaluate the goal after this phase. Do not continue migrating files
solely because more direct Miniflare consumers remain.

## Follow-up Candidates

The final report may recommend one or more of these phases. They are not part of
this goal.

### Phase 3: Move Durable Object tests

Replace direct Miniflare namespace access with configured bindings and
`runInDurableObject()` where direct instance or storage access is necessary.
Preserve request-level tests when direct inspection is not required.

### Phase 4: Convert binding-variant harnesses

Translate generated harnesses and per-test binding variants into static
auxiliary Workers or dedicated projects. Start with repeated variants in
`public-operations.test.ts` and `custom-domain-routing.test.ts`.

### Phase 5: Retire direct Miniflare orchestration

Remove `src/worker/miniflare-test.ts`, direct Miniflare test dependencies, and
generated Worker bundle code only after no tests depend on them. Delete obsolete
reset and temporary-file helpers at the same time.

## Benchmark Protocol

Use uncached, passing runs. Do not benchmark while `devstate check`, another
Vitest run, or another workerd-heavy command is active.

For each candidate change:

1. Confirm no previous Vitest or workerd test process remains.
2. Run the source suite three times with cache disabled.
3. Record the median wall time, pass count, file count, and failures.
4. Run the script suite separately; it should remain negligible.
5. Measure one focused Worker file and one pure Node file.
6. Measure a watch rerun after changing one shared Worker module.

Benchmark commands:

```sh
vp test --dir src --configLoader runner --no-cache --maxWorkers 4
vp test --dir scripts --configLoader runner --no-cache --maxWorkers 4
```

The migration should not be accepted on a faster failing run. Required evidence
is a complete passing suite with no worker-start, test, hook, or teardown
timeouts.

## Decision Metrics

Compare the final result with the fresh main-branch baseline. Record:

- median uncached full `./src` suite wall time from three passing runs; this is
  the primary metric;
- focused `public-operations.test.ts` wall time;
- focused representative Cloudflare Worker slice wall time;
- watch-rerun wall time after changing one shared Worker module;
- source and script test, file, and failure counts; and
- Worker-start, hook, test, and teardown timeout counts.

The representative migration is successful when it demonstrates:

- all existing migrated assertions still pass;
- no per-test ad hoc Miniflare creation for migrated files;
- no Worker-start or teardown timeouts;
- a lower median full-suite wall time or a lower watch-rerun time than the fresh
  baseline without materially regressing the other metric;
- unchanged production Worker configuration and behavior.

Do not invent a numeric target before the fresh baseline and representative
migration exist. The historical one-file spike measured compatibility and cold
cost, not full-suite throughput. If improvements are within run-to-run noise,
report the result as inconclusive and stop this goal.
