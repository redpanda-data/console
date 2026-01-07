# CLAUDE.md

Guidance for Claude Code when working with this repository.

When creating user interfaces, refer to @.claude/UI.md

## Project Overview

Frontend for Redpanda Console - web app for managing Kafka/Redpanda clusters. React 18.3 + TypeScript with Rsbuild (Rspack).

## Commands

### Package Management
**CRITICAL**: Use `bun` as package manager. Run `bun i --yarn` after installing packages (generates `yarn.lock` for Snyk).

```bash
bun install                    # Install dependencies
bun i --yarn                   # Generate yarn.lock
bun add <package>              # Add dependency
bun add -d <package>           # Add dev dependency
```

### Development
```bash
bun start                      # Dev server http://localhost:3000
bun start2 --port=3004         # With additional features (SSO, REASSIGN_PARTITIONS)
```
Dev server proxies `/api`, `/redpanda.api`, `/auth`, `/logout` to `http://localhost:9090`.

### Testing
```bash
bun run test                   # All tests (unit + integration)
bun run test:unit              # Unit tests (*.test.ts)
bun run test:integration       # Integration tests (*.test.tsx)
bun run e2e-test               # E2E tests (Playwright)
bun run e2e-test:ui            # E2E with UI mode
```

**Three-Tier Testing Strategy:**

| Type | Files | Environment | Purpose |
|------|-------|-------------|---------|
| Unit | `*.test.ts` | Node.js | Pure functions, utilities, data transforms (NO React) |
| Integration | `*.test.tsx` | jsdom | Component + API integration, hooks, forms (NO rendering tests) |
| E2E | `*.spec.ts` in `tests/` | Playwright | Multi-page workflows, browser interactions |

**CRITICAL**: Use `.test.tsx` if file uses `render`, `renderHook`, or JSX. Otherwise use `.test.ts`.

#### Unit Tests (`*.test.ts`) - Pure Logic Examples

```typescript
// ✅ GOOD - Pure utility function
describe('formatDate', () => {
  it('should format ISO date to human readable', () => {
    expect(formatDate('2025-01-01')).toBe('January 1, 2025');
  });
});

// ✅ GOOD - Data transformation
describe('transformUserData', () => {
  it('should map API response to User model', () => {
    const apiData = { name: 'John', email: 'john@example.com' };
    expect(transformUserData(apiData)).toEqual({
      name: 'John',
      email: 'john@example.com',
      displayName: 'John (john@example.com)'
    });
  });
});

// ❌ BAD - This belongs in integration tests (*.test.tsx)
import { renderHook } from '@testing-library/react';
describe('useCustomHook', () => {
  it('should return data', () => {
    const { result } = renderHook(() => useCustomHook());
    expect(result.current.data).toBeDefined();
  });
});
```

#### Integration Tests (`*.test.tsx`) - Component + API Examples

```tsx
// ✅ GOOD - API integration test with mocked transport
import { render, waitFor, fireEvent } from 'test-utils';
import { createRouterTransport } from '@connectrpc/connect';

describe('CreateServerModal', () => {
  it('should call createServer API with correct data', async () => {
    const mockCreateServer = vi.fn(() =>
      Promise.resolve({ id: '123', name: 'test-server' })
    );

    const transport = createRouterTransport(({ rpc }) => {
      rpc(createServer, mockCreateServer);
    });

    const { getByRole, getByLabelText } = render(
      <CreateServerModal />,
      { transport }
    );

    fireEvent.change(getByLabelText('Name'), { target: { value: 'test-server' } });
    fireEvent.click(getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockCreateServer).toHaveBeenCalledWith({
        name: 'test-server'
      });
    });
  });
});

// ✅ GOOD - Testing custom React hooks
import { renderHook } from '@testing-library/react';

describe('usePaginationParams', () => {
  it('should parse pagination from URL params', () => {
    const { result } = renderHook(() => usePaginationParams());
    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(20);
  });
});

// ❌ BAD - Testing UI component rendering (belongs in UI registry)
test('button has correct background color', () => {
  render(<Button variant="primary">Click me</Button>);
  expect(screen.getByRole('button')).toHaveClass('bg-blue-500');
});
```

#### E2E Tests (`*.spec.ts`) - Complex Workflows

```typescript
// ✅ GOOD - Multi-step workflow
test('user can create and configure MCP server', async ({ page }) => {
  await page.goto('/remote-mcp');
  await page.click('text=Create Server');
  await page.fill('[name="name"]', 'My Server');
  await page.fill('[name="url"]', 'http://example.com');
  await page.click('text=Submit');

  // Navigate to configuration
  await expect(page.locator('text=My Server')).toBeVisible();
  await page.click('text=My Server');
  await page.click('text=Configure');

  // Multi-step configuration
  await page.selectOption('[name="protocol"]', 'https');
  await page.click('text=Save Configuration');
  await expect(page.locator('text=Configuration saved')).toBeVisible();
});
```

**E2E Test Setup:**
1. Navigate to `tests/e2e-ui` and run `bun install && bunx playwright install`
2. Get secrets from @Beniamin Malinski (1Password link)
3. Add secrets to `.env` file under `tests/e2e-ui`

**E2E Test Checklist:**
```bash
bunx playwright test --update-snapshots              # Run all tests
bunx playwright test namespace.spec.ts --update-snapshots  # Single test
bunx playwright test --ui                             # UI mode
bunx playwright codegen https://dev--redpanda-cloud.netlify.app/  # Generate code
```

**Important**: Add `testId` attributes to UI components when modifying them for easier E2E testing.

### Code Quality
```bash
bun run type:check             # TypeScript check
bun run lint                   # Biome lint + fix
bun run format                 # Biome format
```

### Building
```bash
bun run build                  # Production build
bun run preview                # Preview build
bun run analyze                # Bundle analyzer
```

## Architecture

### Technology Stack

⚠️ **Codebase in transition - use modern patterns for all new code**

**❌ LEGACY (Don't Use)**
- `@redpanda-data/ui` (Chakra-based)
- Chakra UI
- MobX, class components, decorators
- Yup validation
- Jest

**✅ MODERN (Use These)**
- Redpanda UI Registry (`src/components/redpanda-ui/`) - Tailwind + shadcn
- Functional components with hooks
- Local state (`useState`) or Zustand (global state)
- React Query for data fetching
- Vitest (unit/integration), Playwright (E2E)
- React Hook Form (complex forms) or AutoForm (simple forms)
- Zod or protovalidate-es validation

### Directory Structure
```
src/
├── components/
│   ├── pages/              # Feature pages (routes)
│   ├── redpanda-ui/        # ✅ Modern UI components (shadcn)
│   ├── ui/                 # ❌ Legacy UI
│   ├── layout/             # Layout components
│   └── form/               # ❌ Legacy forms
├── state/                  # ❌ Legacy MobX (don't expand)
├── react-query/            # ✅ React Query hooks
├── hooks/                  # Custom hooks
├── utils/                  # Utilities
├── protogen/               # Auto-generated protobuf (DO NOT EDIT)
└── config.ts               # App config
```

## Core Principles

### 1. Separate Business Logic from Styling
**GOAL**: Minimal CSS/className in business logic. Push styling to UI registry components and layouts.

```tsx
// ✅ GOOD
export const UserListPage = () => {
  const { data, isLoading } = useQuery(...);
  return (
    <PageLayout>
      <PageHeader title="Users" />
      <UserList users={data} loading={isLoading} />
    </PageLayout>
  );
};

// ❌ BAD - inline styling in business logic
export const UserListPage = () => {
  return (
    <div className="flex flex-col w-full h-full p-8 gap-6 bg-gray-50">
      <div className="flex items-center justify-between border-b pb-4">
        ...
```

### 2. Component Guidelines
1. Use Redpanda UI Registry components from `src/components/redpanda-ui/`
2. If component doesn't exist, create it in registry (not inline)
3. Use functional components with hooks
4. Minimal className in page/feature components

```tsx
// ✅ GOOD - Registry components
import { Button } from "components/redpanda-ui/components/button";
import { Dialog } from "components/redpanda-ui/components/dialog";

// ❌ BAD - Legacy
import { Button } from "@redpanda-data/ui";
import { Button } from "@chakra-ui/react";
```

### 3. State Management
**Philosophy: Local First, Global When Needed**

**Use Local State (`useState`) for:**
- Component-specific UI state
- Temporary data
- State used by 1-2 components

**Use Zustand for:**
- Cross-component state
- User preferences
- Multi-step forms persisting across navigation
- SessionStorage persistence

**Never use MobX for new code**

```typescript
// Zustand example
import { create } from "zustand";

export const usePreferencesStore = create<State>((set) => ({
  theme: "light",
  setTheme: (theme) => set({ theme }),
}));

// Usage - use selectors
const theme = usePreferencesStore((state) => state.theme);
```

### 4. Forms

```tsx
// ✅ EXCELLENT - AutoForm for simple forms
import { AutoForm } from "@autoform/react";
import { ZodProvider } from "@autoform/zod";

<AutoForm schema={zodSchema} onSubmit={handleSubmit} provider={ZodProvider} />

// ✅ GOOD - React Hook Form for complex forms
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const { register, handleSubmit } = useForm({ resolver: zodResolver(schema) });
```

### 5. API Communication
**gRPC-Web via Connect Protocol**

- Use React Query hooks from `/src/react-query/`
- Protobuf schemas in `/src/protogen/` are auto-generated (never edit)
- Regenerate: `task proto:generate` from repo root

```tsx
import { useQuery } from "@tanstack/react-query";

const { data, isLoading } = useQuery({
  queryKey: ["resource", id],
  queryFn: () => fetchResource(id),
});
```

### 6. Icons
**Central Icon System**: All icons are imported from `src/components/icons/index.tsx`

**Allowed Icon Packages:**
- `lucide-react` - Primary icon library (1600+ icons)
- Custom SVGs - For brand-specific or unique icons
- `@icons-pack/react-simple-icons` - **ONLY for Redpanda Connect brand logos** (GitHub, Slack, etc.)

**Forbidden Packages** (removed from codebase):
- ❌ `react-icons`
- ❌ `@chakra-ui/icons`
- ❌ `@heroicons/react`
- ❌ `@primer/octicons-react`

**Usage:**
```tsx
// ✅ GOOD - Import from central icon system
import { CheckIcon, TrashIcon, AlertIcon } from 'components/icons';

<CheckIcon size={20} />
<TrashIcon size={16} color="#ff0000" />

// ✅ GOOD - Brand icons for Redpanda Connect features only
import { GitHubIcon, SlackIcon } from 'components/icons';

// ❌ BAD - Direct imports from icon packages
import { Check } from 'lucide-react';
import { FaGithub } from 'react-icons/fa';
import { CheckIcon } from '@chakra-ui/icons';
```

**Icon Props:**
- `size`: Number or string (e.g., `16`, `"20px"`)
- `color`: CSS color value (e.g., `"#ff0000"`, `"currentColor"`)
- `strokeWidth`: Number (lucide icons only, default: 2)
- Standard SVG props: `className`, `style`, etc.

**Adding New Icons:**
1. Check if icon exists in `src/components/icons/index.tsx`
2. If not, add export from `lucide-react` with descriptive name
3. Document the mapping if replacing a legacy icon
4. For brand logos, use `@icons-pack/react-simple-icons` (Redpanda Connect only)

**Icon Naming Convention:**
- Suffix with `Icon` for consistency: `CheckIcon`, `TrashIcon`, `AlertIcon`
- Use semantic names: `ErrorIcon` (not `XCircleIcon`), `WarningIcon` (not `AlertTriangleIcon`)

## Development Workflow

### Adding New Feature
1. Create page in `src/components/pages/your-feature/`
2. Use functional components + hooks
3. Compose with Redpanda UI components (create in registry if needed)
4. Minimize className usage
5. Add route in `src/components/routes.tsx`
6. Use local state or Zustand (not MobX)
7. Write integration tests (Vitest) - focus on API calls and business logic
8. Write E2E tests (Playwright) - for complex user journeys

```tsx
// ✅ GOOD - Clean structure
export const MyFeaturePage = () => {
  const { data } = useMyFeatureData();
  return (
    <PageLayout>
      <PageHeader title="My Feature" />
      <MyFeatureList items={data} />
    </PageLayout>
  );
};
```

### Testing Patterns

```tsx
// ✅ Integration test - API calls with mocked transport
describe('CreateServerModal', () => {
  it('calls API with correct data', async () => {
    const mockTransport = vi.fn(() => Promise.resolve({ id: '123' }));
    const transport = createRouterTransport(({ rpc }) => {
      rpc(createServer, mockTransport);
    });

    const { getByRole } = render(<CreateServerModal />, { transport });
    fireEvent.click(getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockTransport).toHaveBeenCalledWith({ name: 'test' });
    });
  });
});

// ✅ E2E test - Complex workflow
test('user creates and configures server', async ({ page }) => {
  await page.goto('/remote-mcp');
  await page.click('text=Create Server');
  await page.fill('[name="name"]', 'My Server');
  await page.click('text=Submit');
  await expect(page.locator('text=My Server')).toBeVisible();
});

// ❌ DON'T test UI component rendering (tested in UI registry)
```

### Styling Approach

```tsx
// ✅ Create UI component in registry
// src/components/redpanda-ui/components/status-badge.tsx
export const StatusBadge = ({ status, children }: Props) => {
  return (
    <div className={cn(
      "inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm",
      status === 'active' && "bg-green-100 text-green-800"
    )}>
      {children}
    </div>
  );
};

// Use without styling in business logic
<StatusBadge status={server.status}>{server.name}</StatusBadge>
```

## Key Files
- `src/App.tsx` - Main app with providers
- `src/components/routes.tsx` - Route definitions
- `src/config.ts` - App config & feature flags
- `rsbuild.config.ts` - Build config
- `tsconfig.base.json` - TypeScript config
- `biome.json` - Linter/formatter config

## Environment Variables
Prefix: `REACT_APP_`
- `REACT_APP_ENABLED_FEATURES` - Feature flags (comma-separated)
- `REACT_APP_CONSOLE_GIT_SHA` - Git SHA
- `REACT_APP_BUSINESS` - Business features
- `REACT_APP_DEV_HINT` - Dev hints

## Migration Checklist

**✅ DO:**
- Minimize CSS/className in business logic
- Create UI components in registry (`src/components/redpanda-ui/`)
- Use component composition
- Functional components + hooks
- Local state or Zustand
- Vitest (unit/integration), Playwright (E2E)
- AutoForm (simple) or React Hook Form (complex)
- Zod or protovalidate-es validation
- Run `bun i --yarn` after package installs

**❌ DON'T:**
- Heavy styling in business logic
- `@redpanda-data/ui` or Chakra UI
- MobX or class components
- Decorators (`@observable`, `@action`)
- Yup validation or Jest
- Test UI component rendering (tested in registry)
- Expand legacy patterns
