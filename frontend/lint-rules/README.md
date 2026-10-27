# Console policy checks

A small [Oxlint JS plugin](https://oxc.rs/docs/guide/usage/linter/js-plugins) (`console/*`)
for policy Biome does not express. Biome stays the general linter and formatter; every stock
Oxlint category is off in `../.oxlintrc.json`, and each rule here is an error. The rule ideas
come from the Oxlint plugin in [pingdotgg/t3code](https://github.com/pingdotgg/t3code).

```bash
bun run lint:policy        # read-only; `bun run lint` and `lint:fix` also run it
bun run test:file:unit tests/lint-policy.test.ts
```

The test drives `bun run lint:policy` in an OS-temp project whose config extends the
checked-in one, so the real script, config and plugin load. Diagnostics carry no fixes.
React Doctor does not adopt this config (`adoptExistingLintConfig: false` in
`../doctor.config.json`), so `bun run lint` is the one gate for these rules.

## Rules

| Rule | Scope | Reports |
| --- | --- | --- |
| `no-hookless-use-function` | all files | a `use*` function, declaration or `const`, that calls no hook while it runs |
| `no-real-time-wait-in-tests` | test code | sleeps that only the wall clock ends |
| `no-polling-loop-in-tests` | test code | loops that sleep or yield until a condition holds, or only spin the scheduler |
| `no-wall-clock-in-tests` | test code | `Date.now()`, `new Date()`, `Date()`, `performance.now()`, `process.hrtime()` |
| `no-test-timeout-or-unreasoned-skip` | test code | per-test timeout/retry overrides; static skips and todos without an issue and reason |
| `require-suppression-reason` | all files | Biome, Oxlint and ESLint suppressions and `@ts-expect-error` without a reason; any `@ts-ignore` or `@ts-nocheck` |
| `no-native-title-tooltip` | all files | `title` on intrinsic HTML elements and on Registry `Button`/`Input` |

**Test code** is `*.test.*`, `*.spec.*` and shared `*.cases.*` files plus the helpers tests
delegate to: `tests/shared/**`, `tests/test-variant-*/utils/**` and `*-test-helpers.*`. Moving a
wait into a helper does not hide it. The rules themselves hold no path exceptions; the two files
that own real time get narrow overrides in `.oxlintrc.json`:

- `tests/shared/assertions.ts`: `retryAssertion` owns the retry clock other tests delegate to.
- `tests/shared/global-setup.mjs`: waits for real Docker containers to accept connections.

### What the rules accept

- **Hooks**: a call to a hook-named function, a named import whose exported name is a hook
  (`import { useState as state }`), React 19 `use` from `react` (any alias or `React.use`), and
  immediately invoked functions. Hook calls in callbacks the function returns or registers do
  not count. The fix is to rename the helper, not to add a hook call.
- **Waits**: awaiting an observable milestone (`waitFor`, `findBy*`, `retryAssertion`, Playwright
  locator assertions and `expect.poll`, `waitForResponse`, events), timers scheduled as the
  behavior under test, and promises resolved by a timer, frame or tick that fake timers control.
  Rejection-only timers (deadlines in `Promise.race`) are not waits.
- **Fake clocks** cover what they can reach at run time: after `rs.useFakeTimers()` or
  `setSystemTime(...)` inside the same test, or inside the tests and hooks registered beside a
  `beforeEach`/`beforeAll` that installs them. They do not cover other tests, module-level or
  `describe`-level initializers (which run at collection time), or `after*` hooks. Rstest's
  `useFakeTimers` default (everything but `nextTick`/`queueMicrotask`) and literal `toFake` and
  `toNotFake` lists are honored; `setSystemTime` controls `Date` only.
- **Wall clock**: readings under a controlling fake clock, fixed dates (`new Date('2026-01-01')`,
  `Date.UTC`), and readings that seed a mock (`rs.fn`, `spyOn`, `mockReturnValue`,
  `mock.module`, `page.clock.*`). Use `crypto.randomUUID()` for unique names.
- **Polling**: data loops (`for...of` without an early exit, counters bounded by a number or a
  `.length`, stream drains) and loops whose waits are real work rather than sleeps or ticks.
- **Skips**: conditional skips (`skipIf(condition)`, `test.skip(condition, why)`, `test.skip()`
  under `if`, `{ skip: condition }`). A static skip, `fixme` or `todo` passes when a comment
  directly above it, a comment at the start of its body, its skip description or its todo title
  names a tracking issue (`UX-1234`, `#1234`, `owner/repo#1234`, a GitHub issue or pull URL)
  and a reason. Focused tests are left to Biome's `noFocusedTests`, with no quarantine escape.
- **Timeouts**: suite-level budgets in runner configuration and shared fixtures, Playwright
  locator `{ timeout }` options, and `describe.configure` without `timeout`/`retries`.
- **Suppressions**: a reason on the directive itself (`: reason`, `-- reason`, text after
  `@ts-expect-error`), including in JSX comments. Closing directives need none. Directives are
  read from real comments, never from strings, templates or JSX text.
- **Tooltips**: `title` on `iframe`, `frame`, `embed`, `object` (accessible names), `abbr`,
  `dfn`, `link`, `style` (spec-defined meaning), SVG and MathML content, and on components
  other than Registry `Button`/`Input`, such as a domain `Card title`.

## Limits

These are syntactic checks on one file at a time, with no type information.

- Bindings resolve through imports, aliases, namespace imports, `const x = test` and
  `base.extend(...)`, not through re-exports, function arguments or other files. A clock
  installed by a helper function, or a sleep reached only through an imported helper, is not
  seen at the call site; the helper's own file is linted when it is test code.
- A reason is a lexical heuristic: at least two words remain once issue references,
  placeholders such as `<explanation>` and filler such as `todo`, `ok` or `ignore for this test`
  are removed. The rules cannot tell whether a reason is true; reviewers still judge that.
- `UTF-8`-shaped tokens look like Jira keys, so a skip comment could pass on one by accident.
- Registry tooltips are recognized for imports from `redpanda-ui/components/button` and
  `redpanda-ui/components/input`; other components that forward `title` are not tracked.
