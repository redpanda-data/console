# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

When creating user interfaces, refer to @.claude/UI.md

## Project Overview

This is the frontend for Redpanda Console, a web application for managing Kafka/Redpanda clusters. Built with React 18.3 + TypeScript using Rsbuild (Rspack-based bundler).

## Commands

### Package Management

**IMPORTANT**: Always use `bun` as the package manager. After installing packages, run `bun i --yarn` to generate `yarn.lock` for Snyk security tracking.

```bash
bun install              # Install dependencies
bun i --yarn             # Generate yarn.lock for Snyk tracking
bun add <package>        # Add a new dependency
bun add -d <package>     # Add a dev dependency
```

### Development

```bash
bun start                # Start dev server on http://localhost:3000
bun start2 --port=3004   # Start with additional features enabled
```

Dev server proxies API requests to `http://localhost:9090` for `/api`, `/redpanda.api`, `/auth`, `/logout`.

### Testing

**Three-Tier Testing Pyramid:**
- **E2E Tests** (Playwright): Complex user journeys, multi-page flows
- **Integration Tests** (Vitest + jsdom): React components + API integration
- **Unit Tests** (Vitest + Node): Pure functions, business logic

```bash
# Run all tests
bun run test             # Unit + integration tests
bun run test:unit        # Only unit tests (*.test.ts)
bun run test:integration # Only integration tests (*.test.tsx)
bun run e2e-test         # E2E tests with Playwright

# Development
bun run test:watch       # Watch mode with UI
bun run test:coverage    # Generate coverage report
```

#### Unit Tests (`*.test.ts`)
**Purpose:** Test pure logic/utilities in isolation. Node.js environment (no DOM/React).

✅ **DO:** Pure functions, data transformations, business logic, type guards, protobuf parsing
❌ **DON'T:** React components/hooks, DOM APIs, network requests

```typescript
// ✅ GOOD - Pure function test
describe('formatDate', () => {
  it('formats ISO date', () => {
    expect(formatDate('2025-01-01')).toBe('January 1, 2025');
  });
});

// ❌ BAD - React/DOM (use integration tests)
test('component renders', () => render(<MyComponent />));
```

#### Integration Tests (`*.test.tsx`)
**Purpose:** Test React components with mocked APIs. jsdom environment. Sharded across 4 parallel runners.

✅ **DO:** Component behavior, API calls, hooks, forms, validation, state integration
❌ **DON'T:** UI styling details, complex multi-page flows (use E2E)

```tsx
// ✅ GOOD - API integration test
it('calls createServer with correct data', async () => {
  const mock = vi.fn(() => Promise.resolve({ server: { id: '123' } }));
  const transport = createRouterTransport(({ rpc }) => {
    rpc(createServer, mock);
  });

  render(<CreateModal />, { wrapper: createWrapper({ transport }) });

  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));

  await waitFor(() => {
    expect(mock).toHaveBeenCalledWith({ name: 'test' });
  });
});
```

**Best Practices:**
- Always mock gRPC transports using `createRouterTransport`
- Test user interactions, not implementation details
- Verify API calls with correct parameters
- Test error states and edge cases

#### E2E Tests (`*.spec.ts`)
**Purpose:** Test complete user journeys in real browsers. Chromium via Playwright.

✅ **DO:** Multi-step workflows, navigation, auth flows, browser-specific behavior
❌ **DON'T:** Component logic (use integration), pure functions (use unit)

```typescript
// ✅ GOOD - Multi-step workflow
test('user creates and configures server', async ({ page }) => {
  await page.goto('/servers');
  await page.click('text=Create Server');
  await page.fill('[name="name"]', 'My Server');
  await page.click('text=Create');
  await expect(page.locator('text=My Server')).toBeVisible();
});
```

**Setup:** `bun install` → `bun run install:chromium`

#### File Naming (CRITICAL)
- `*.test.ts` - Unit tests (pure TypeScript, no JSX/React)
- `*.test.tsx` - Integration tests (React components)
- `*.spec.ts` - E2E tests (Playwright)

### Code Quality

```bash
bun run type:check       # TypeScript type checking
bun run lint             # Run Biome linter and auto-fix
bun run format           # Format code with Biome
```

### Building

```bash
bun run build            # Production build
bun run preview          # Preview production build
bun run analyze          # Build with bundle analyzer
```

## Architecture

### Technology Stack - Legacy vs Modern

⚠️ **IMPORTANT**: This codebase is in transition. Use modern patterns for all new code.

#### ❌ LEGACY (Do Not Use)
- `@redpanda-data/ui` - Chakra UI-based (migrating away)
- Chakra UI, MobX, Class components, Decorators, Yup, Jest

#### ✅ MODERN (Use for All New Code)
- **Redpanda UI Registry** (`src/components/redpanda-ui/`) - Tailwind + shadcn
- **Tailwind CSS v4** - Minimal usage in business components
- **Functional components** - React hooks pattern
- **Local state** (`useState`) or **Zustand** (global/persisted)
- **Vitest** (unit/integration), **Playwright** (E2E)
- **React Hook Form** or **AutoForm** for forms
- **Zod** or **protovalidate-es** for validation

### Directory Structure

```
src/
├── components/
│   ├── pages/              # Feature pages (routes)
│   ├── redpanda-ui/        # ✅ Modern shadcn components
│   ├── ui/                 # ❌ Legacy UI
│   ├── layout/             # Layout components
│   └── form/               # Legacy forms
├── state/                  # ❌ Legacy MobX stores
├── react-query/            # ✅ React Query hooks
├── hooks/                  # Custom React hooks
├── utils/                  # Utility functions
├── protogen/               # Auto-generated protobuf (DO NOT EDIT)
└── config.ts              # App configuration
```

### Component Guidelines

**Philosophy: Separate Business Logic from Styling**

Push styling into Layout components and Redpanda UI Registry. Keep business logic components clean.

```tsx
// ✅ EXCELLENT - Clean separation
export const UserPage = () => {
  const { data, isLoading } = useQuery(...);
  return (
    <PageLayout>
      <PageHeader title="Users" />
      <UserList users={data} loading={isLoading} />
    </PageLayout>
  );
};

// ❌ BAD - Heavy inline styling
export const UserPage = () => {
  return (
    <div className="flex flex-col w-full h-full p-8 gap-6 bg-gray-50">
      <div className="flex items-center justify-between border-b pb-4">
        {/* ... lots of className styling ... */}
      </div>
    </div>
  );
};
```

**For New Features:**
1. Use Redpanda UI Registry components (NOT `@redpanda-data/ui`)
2. Create new registry components instead of inline styling
3. Minimize `className` in business logic components
4. Use functional components with hooks

### State Management

**Philosophy: Local First, Global When Needed**

**Use `useState` for:**
- Component-specific UI state
- Temporary data
- State only 1-2 components need

**Use Zustand for:**
- Cross-component state
- User preferences/settings
- Multi-step forms persisting across navigation
- SessionStorage persistence

**Never use MobX for new code.**

```typescript
// Basic Zustand store
export const useStore = create<State>((set) => ({
  data: null,
  setData: (data) => set({ data }),
  reset: () => set({ data: null }),
}));

// Use selectors to optimize rerenders
const data = useStore((state) => state.data);
```

### API Communication

Frontend uses Connect protocol (`@connectrpc/connect-web`) with gRPC.

- Use React Query hooks from `/src/react-query/`
- Protobuf schemas in `/src/protogen/` are auto-generated (never edit)
- Regenerate with `task proto:generate` from repo root

### Forms

```tsx
// ✅ EXCELLENT - AutoForm for simple forms
import { AutoForm } from '@autoform/react';
import { ZodProvider } from '@autoform/zod';

<AutoForm schema={zodSchema} onSubmit={handleSubmit} provider={ZodProvider} />

// ✅ GOOD - React Hook Form for complex forms
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const { register, handleSubmit } = useForm({
  resolver: zodResolver(schema),
});
```

### Common Testing Patterns

```typescript
// Mock gRPC transports
const transport = createRouterTransport(({ rpc }) => {
  rpc(createServer, async (req) => ({ server: { id: '123' } }));
});

// Test error states
rpc(fetchData, () => {
  throw new ConnectError('Network error', Code.Unavailable);
});

// Test Zustand stores
beforeEach(() => {
  sessionStorage.clear();
  useStore.getState().reset();
});
```

## Development Workflow

### Adding a New Feature Page

1. Create component in `src/components/pages/your-feature/`
2. Use functional components + hooks
3. Compose with Redpanda UI Registry components
4. Minimize `className` usage
5. Add route in `src/components/routes.tsx`
6. Use local state or Zustand (not MobX)
7. Write tests: `.test.ts` (unit), `.test.tsx` (integration), `.spec.ts` (E2E)

### Working with Legacy Code

- Small changes: maintain existing patterns
- Major refactors: migrate to modern patterns
- Never expand MobX, Chakra UI, or class components

## Key Files

- `src/App.tsx` - Main app with providers
- `src/components/routes.tsx` - Route definitions
- `src/config.ts` - Configuration/feature flags
- `rsbuild.config.ts` - Build config
- `vitest.config.unit.mts` - Unit test config
- `vitest.config.integration.mts` - Integration test config
- `playwright.config.ts` - E2E test config

## Migration Strategy Summary

**DO:**
- ✅ Minimize CSS/className in business logic
- ✅ Create reusable UI in Redpanda Registry (`src/components/redpanda-ui/`)
- ✅ Use component composition to separate styling
- ✅ Use functional components + React hooks
- ✅ Use local state or Zustand
- ✅ Write unit (`.test.ts`), integration (`.test.tsx`), E2E (`.spec.ts`) tests
- ✅ Use AutoForm or React Hook Form
- ✅ Use Zod or protovalidate-es
- ✅ Run `bun i --yarn` after installing packages

**DON'T:**
- ❌ Heavy styling in business components
- ❌ Use `@redpanda-data/ui` or Chakra UI
- ❌ Use MobX, class components, decorators
- ❌ Use Yup or Jest
- ❌ Test UI styling in integration tests
- ❌ Test business logic in E2E tests
