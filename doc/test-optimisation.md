# Test Optimisation

Last updated: 2026-07-14

Purpose: record the measured causes of slow Formless test runs and the recommended
path from direct Miniflare orchestration to Cloudflare's Vitest integration.

This is an engineering recommendation. Shipped runtime behavior lives in
`openspec/specs/*/spec.md`.

## Scope

The investigated command is:

```sh
vp run --no-cache --filter @dpeek/formless test
```

The package script runs the source tests first and the script tests second. The
root Vite Plus configuration also sets `test.cache` to `false`, so the benchmark
does not depend on Vitest result caching. The `--no-cache` flag remains useful in
benchmark commands because it makes that condition explicit at invocation time.

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

| Case | Result |
| --- | --- |
| Source suite, four workers, uncached | 1,722 tests passed in 50.75 seconds |
| Source suite, two workers, uncached | 1,722 tests passed in 77.79 seconds |
| Script suite, four workers, uncached | 37 tests passed in 0.248 seconds |
| `public-operations.test.ts`, isolated | 43 tests passed in 13.04 seconds |
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
`src/worker/miniflare-test.ts`. Static analysis found 47 call sites across 38
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

## Recommendation 1: Split Pure Tests From Worker Tests

Files should not create a Worker harness for tests that only exercise pure
selection, parsing, validation, or projection functions.

For example, `src/worker/authority-operations.test.ts` creates a generated
Durable Object harness in a file-level `beforeAll()`, but its first tests only
exercise `selectAuthorityOperation()`. A focused run of one selection test took
1.41 seconds even though the assertion body took 2 milliseconds, because the
file-level Worker setup still ran.

Split mixed files into:

- Node unit tests for pure functions.
- Worker integration tests for requests, bindings, storage, and runtime-only
  APIs.

This reduces cold Worker startups without changing test semantics. Apply this
first to files with large pure sections before changing test infrastructure.

## Recommendation 2: Reuse Binding Variants Within A File

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

Start with repeated configurations in `public-operations.test.ts`. Keep unique
one-off configurations isolated until a reset contract exists.

## Recommendation 3: Adopt Cloudflare's Vitest Integration

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

## Migration Order

### Phase 1: Establish the Workers project

- Add `@cloudflare/vitest-pool-workers` as a development dependency.
- Add the Worker-specific Vitest configuration.
- Add one Tasks bootstrap test through `SELF`.
- Run the Node and Worker projects from the package test script.
- Record cold full-suite and watch-rerun baselines.

### Phase 2: Move main Worker request tests

Move tests already using `src/worker/index.ts` with the standard Wrangler
bindings. These are closest to the successful spike and require the least
harness translation.

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

Primary commands:

```sh
vp run --no-cache --filter @dpeek/formless test
vp test --dir src --configLoader runner --no-cache --maxWorkers 4
vp test --dir scripts --configLoader runner --no-cache --maxWorkers 4
```

The migration should not be accepted on a faster failing run. Required evidence
is a complete passing suite with no worker-start, test, hook, or teardown
timeouts.

## Acceptance Targets

Use the four-worker uncached source result, 50.75 seconds, as the initial local
baseline. The first Cloudflare pool migration should demonstrate:

- all existing migrated assertions still pass;
- no per-test ad hoc Miniflare creation for migrated files;
- no Worker-start or teardown timeouts;
- a lower median full-suite wall time than the capped Node/Miniflare baseline;
- materially faster watch reruns for shared Worker module changes;
- unchanged production Worker configuration and behavior.

Do not set a final numeric target until the first representative group of Worker
tests has migrated. The one-file spike measured compatibility and cold cost, not
full-suite throughput.
