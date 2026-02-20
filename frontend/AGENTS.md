# Redpanda Console Frontend

React 18.3 · Bun · Rsbuild

## Critical Rules

- New code MUST use Registry components (`src/components/redpanda-ui/`), react-hook-form + Zod, Vitest, and Connect Query
- See [no-legacy](.claude/skills/code-standards/rules/no-legacy.md) for prohibited patterns
- `src/protogen/` is generated — DO NOT EDIT

## Commands

| Command | Purpose |
|---------|---------|
| `bun start` | Dev server :3000 |
| `bun run build` | Production build |
| `bun run test` | All tests |
| `bun run test:unit` | `.test.ts` (node) |
| `bun run test:integration` | `.test.tsx` (jsdom) |
| `bun run lint` | Biome linter |
| `bun run type:check` | TypeScript |

## Verify Changes

After changes: `bun run type:check && bun run lint && bun run test`

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
