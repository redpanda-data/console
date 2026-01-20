# Redpanda Console Frontend

React 18.3 · Bun · Rsbuild

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

## Critical Rules

### Legacy Patterns

See [no-legacy](.claude/skills/code-standards/rules/no-legacy.md) for prohibited patterns.

### ALWAYS Use (Modern)

- Registry: `src/components/redpanda-ui/`
- react-hook-form + Zod
- Vitest, Playwright
- Connect Query

## Directory Structure

```
src/
├── components/
│   ├── pages/          # Feature pages
│   └── redpanda-ui/    # Modern UI (USE THIS)
├── react-query/        # Connect Query hooks
├── hooks/              # Custom hooks
├── utils/              # Utilities
└── protogen/           # Generated (DO NOT EDIT)
```

## Quick Patterns

**Query:**
```typescript
useQuery(getResource, request, { enabled: !!id })
```

**Mutation:**
```typescript
useMutation(updateResource, { onSuccess: invalidate })
```

**Store:**
```typescript
const v = useStore((s) => s.value) // always use selectors
```

**Tests:**
- `.test.ts` = unit (node)
- `.test.tsx` = integration (jsdom)

## On-Demand Skills

Load skill when task matches trigger:

| Task Type | Skill |
|-----------|-------|
| Tests (unit/integration) | [testing](.claude/skills/testing/SKILL.md) |
| E2E / Playwright | [e2e-tester](.claude/skills/e2e-tester/SKILL.md) |
| UI components | [ui-development](.claude/skills/ui-development/SKILL.md) |
| Forms | [form-refactorer](.claude/skills/form-refactorer/SKILL.md) |
| API calls | [api-patterns](.claude/skills/api-patterns/SKILL.md) |
| Global state | [state-management](.claude/skills/state-management/SKILL.md) |
| Performance | [react-best-practices](.claude/skills/react-best-practices/SKILL.md) |
| Linting | [code-standards](.claude/skills/code-standards/SKILL.md) |
| Security | [security-scan](.claude/skills/security-scan/SKILL.md) |
| Router migration | [tanstack-router-migration](.claude/skills/tanstack-router-migration/SKILL.md) |
| Design review | [web-design-guidelines](.claude/skills/web-design-guidelines/SKILL.md) |

## Plan Mode

- Make the plan extremely concise. Sacrifice grammar for the sake of concision.
- At the end of each plan, give me a list of unresolved questions to answer, if any.
