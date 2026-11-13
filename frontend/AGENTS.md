# Redpanda Console Frontend

React 19 · Bun · Rsbuild

## Critical Rules

- New code MUST use Console-owned UI SDK components (`src/components/redpanda-ui/`), react-hook-form + Zod, Bun unit tests, Rstest integration/browser/E2E tests, and Connect Query
- See [no-legacy](.claude/skills/code-standards/rules/no-legacy.md) for prohibited patterns
- `src/protogen/` is generated — DO NOT EDIT

## Shared UI ownership

`src/components/redpanda-ui/` is Console-owned, not synced from `redpanda-data/ui-registry`.
Keep Redpanda tokens and variants; implement behavior with `@ui-sdk/react` / `@ui-sdk/core`.
Before SDK changes, read `node_modules/@ui-sdk/core/skills/ui-sdk/SKILL.md` and
`node_modules/@ui-sdk/react/docs/llms.txt`. For custom primitives, search the installed
`docs/core.md` by heading and read `docs/rendering.md`; these match the pinned version.
Keep framework-free behavior in `redpanda-ui/lib/primitives/`; React adapters use `createParts`.
Declare custom `agent.actions` explicitly and validate arguments to non-setter actions.
Use SDK change callbacks, not native `onChange`, so all sources reach the same validation.
Keep `commitAgentChange` / `withAgentChanges` on controlled value callbacks: agent writes
must commit React state before SDK history checks restoration. Human input stays batched. After awaited button work, use SDK `withSource(details.source, ...)`
when updating a controller so observation/history retain the agent source.

`ConsoleWebMcp` wraps the Console root once, scopes tool output/actions to that boundary,
and owns the `console_` WebMCP tools, observation and human-only activity/approval UI.
Embedded/federated hosts must opt in with `enableWebMcp`; leave it off when the host owns
tools. `enableUiAgentTools` is the kill switch; people can also pause tools in the activity panel.
Mark secrets with `data-agent-secret`, consequential actions with `data-agent-confirm`,
and keep human approval/history controls and Kafka payload previews `data-agent-hidden`. Activity exposes metadata,
not values; memory-only logs/history are bounded and cleared on teardown.

Only explicitly reviewed, local forms may use `data-agent-history="draft"` (currently Produce).
Never mark autosaving settings or remote mutations: SDK staging/seek/undo replays callbacks,
not network transactions. Secret fields cannot be staged/restored; newer human edits must win.
Verify registration failures/abort/unmount, source/cancel behavior, redaction and host isolation.
Run SDK `checkPattern` in the real-browser suite (happy-dom misreports ID references), plus
`checkServer` and `checkDirection` in the core-contract integration suite.

## Async safety

- Await or return work when the caller needs completion or errors. Detached effects,
  timers, and event handlers must report failures through error UI, a handler, or logging.
- Use `void` only when the callee handles its own failures; explain that ownership at
  the call site. Never clear promise diagnostics with empty catches or type escapes.
- Preserve dependent pagination, retries, and ordered mutations. Explain sequential
  chains; parallelize only independent operations. Verify rejection and completion paths.

## Commands

Always use `bun run <script>` for project tools. Never use `bunx`, `npx`, or run tools directly.

| Command | Purpose |
|---------|---------|
| `bun start` | Dev server :3000 |
| `bun run build` | Production build |
| `bun run test` | Unit, integration and federation checks |
| `bun run test:unit` | `.test.ts` (Bun) |
| `bun run test:integration` | `.test.tsx` (happy-dom) |
| `bun run lint` | Biome/Ultracite linter |
| `bun run type:check` | TypeScript |

## Lint policy

- Biome owns general linting and formatting. `bun run lint` / `lint:fix` also run
  the focused [Console policy checks](lint-rules/README.md); `lint:policy` is read-only.
- Pure helpers must not use hook names. Rename them instead of adding a dummy hook.
- Tests await observable completion or drive a controlled clock, not arbitrary sleeps
  or hand-written polling. Keep real browser timing coverage for native behavior.
- Static skipped tests need a tracking issue and reason. Keep timeout/retry budgets
  in suite configuration rather than raising them per test. Focused tests are forbidden.
- Explain approved lint/type exceptions. `@ts-ignore` and `@ts-nocheck` are forbidden.
- Use Console UI SDK tooltips, not native `title` hints; retain independent accessible names
  and legitimate embedded-content titles.
- React Compiler currently uses opt-in annotation mode. Do not remove memoization or
  change compiler directives merely to satisfy a lint check; prove compiler coverage first.

## Verify Changes

After changes: `bun run type:check && bun run lint && bun run test`

Classify tests by behavior before choosing filenames. See [test guide](tests/README.md) for full-stack variants, fixtures, coverage and CI.

## Directory Structure

```
src/
├── components/
│   ├── pages/          # Feature pages
│   └── redpanda-ui/    # Console-owned UI SDK components (USE THIS)
├── react-query/        # Connect Query hooks
├── hooks/              # Custom hooks
├── utils/              # Utilities
└── protogen/           # Generated (DO NOT EDIT)
```

## Plan Mode

- Extremely concise plans. Sacrifice grammar for concision.
- End each plan with unresolved questions, if any.

## Compaction

When compacting, preserve: modified file list, test commands, and error messages.
