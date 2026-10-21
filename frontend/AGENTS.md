# Redpanda Console Frontend

React 19 · Bun · Rsbuild

## Critical Rules

- New code MUST use Registry components (`src/components/redpanda-ui/`), react-hook-form + Zod, Bun unit tests, Rstest integration/browser/E2E tests, and Connect Query
- See [no-legacy](.claude/skills/code-standards/rules/no-legacy.md) for prohibited patterns
- `src/protogen/` is generated — DO NOT EDIT

## Commands

Always use `bun run <script>` for project tools. Never use `bunx`, `npx`, or run tools directly.

| Command | Purpose |
|---------|---------|
| `bun start` | Dev server :3000 |
| `bun run build` | Production build |
| `bun run test` | Unit, integration, federation and browser checks |
| `bun run test:unit` | `.test.ts` (Bun) |
| `bun run test:integration` | `.test.tsx` (happy-dom) |
| `bun run lint` | Biome/Ultracite linter |
| `bun run type:check` | TypeScript |

## Verify Changes

After changes: `bun run type:check && bun run lint && bun run test`

Classify tests by behavior before choosing filenames. See [test guide](tests/README.md) for full-stack variants, fixtures, coverage and CI.

## Directory Structure

```
src/
├── components/
│   ├── pages/          # Feature pages
│   └── redpanda-ui/    # UI Registry (USE THIS)
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
