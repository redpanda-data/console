---
name: tanstack-router-migration
description: "Migrate React applications from React Router to TanStack Router with file-based routing. Use when user requests: (1) Router migration, (2) TanStack Router setup, (3) File-based routing implementation, (4) React Router replacement, (5) Type-safe routing, or mentions 'migrate router', 'tanstack router', 'file-based routes'."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task
---

# React Router to TanStack Router Migration

Migrate React applications from React Router to TanStack Router with file-based routing. This skill provides a structured approach for both incremental and clean migrations.

## Critical Rules

**ALWAYS:**

- Use file-based routing with routes in `src/routes/` directory
- Use `from` parameter in all hooks for type safety (`useParams({ from: '/path' })`)
- Validate search params with Zod schemas using `@tanstack/zod-adapter`
- Configure build tool plugin before creating routes
- Register router type for full TypeScript inference
- Use `fallback()` wrapper for optional search params

**NEVER:**

- Edit `routeTree.gen.ts` (auto-generated file)
- Use React Router hooks in new code during migration
- Forget the `from` parameter (loses type safety)
- Use string-only validation for search params
- Skip the build plugin configuration

## Dependencies

```bash
# Core dependencies
bun add @tanstack/react-router @tanstack/zod-adapter

# Build plugin (choose one based on your bundler)
bun add -d @tanstack/router-plugin

# Optional integrations
bun add nuqs                    # URL state management
bun add @sentry/react           # Error tracking with router integration
```

## Migration Phases

### Phase 1: Assessment

**Audit existing React Router usage:**

```bash
# Find all React Router imports
grep -r "from 'react-router" src/ --include="*.tsx" --include="*.ts"
grep -r 'from "react-router' src/ --include="*.tsx" --include="*.ts"

# Find hook usages
grep -r "useParams\|useSearchParams\|useNavigate\|useLocation\|useMatch" src/
```

**Document:**
- [ ] React Router version (v5 or v6)
- [ ] Number of routes
- [ ] `useParams` usage count
- [ ] `useSearchParams` usage count
- [ ] `useNavigate` usage count
- [ ] Custom Link components
- [ ] Route guards/protected routes
- [ ] Existing route structure

### Phase 2: Setup

**1. Configure Build Tool**

See [references/build-configuration.md](references/build-configuration.md) for full configs.

**Rspack/Rsbuild:**
```typescript
// rsbuild.config.ts
import { TanStackRouterRspack } from '@tanstack/router-plugin/rspack';

export default {
  tools: {
    rspack: (config) => {
      config.plugins?.push(
        TanStackRouterRspack({
          target: 'react',
          autoCodeSplitting: true,
          routesDirectory: './src/routes',
          generatedRouteTree: './src/routeTree.gen.ts',
          quoteStyle: 'single',
          semicolons: true,
        })
      );
      // Prevent rebuild loop
      config.watchOptions = { ignored: ['**/routeTree.gen.ts'] };
      return config;
    },
  },
};
```

**Vite:**
```typescript
// vite.config.ts
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
    }),
    react(),
  ],
});
```

**2. Configure Linter**

```jsonc
// biome.jsonc or eslint config
{
  "files": {
    "ignore": ["**/routeTree.gen.ts"]
  },
  "overrides": [
    {
      "include": ["**/routes/**/*"],
      "linter": {
        "rules": {
          "style": {
            "useFilenamingConvention": "off"  // Allow $param.tsx naming
          }
        }
      }
    }
  ]
}
```

**3. Create Routes Directory**

```bash
mkdir -p src/routes
```

### Phase 3: Router Creation

**Create Router Instance:**

```typescript
// src/app.tsx
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routeTree } from './routeTree.gen';
import { NotFoundPage } from './components/misc/not-found-page';

const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  context: {
    basePath: getBasePath(),
    queryClient,
  },
  basepath: getBasePath(),
  trailingSlash: 'never',
  defaultNotFoundComponent: NotFoundPage,
});

// Register router type for full TypeScript inference
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }

  // Extend HistoryState for typed navigation state
  interface HistoryState {
    // Add your custom state properties here
    returnUrl?: string;
    documentId?: string;
    documentName?: string;
  }
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
```

**Define Router Context Type:**

```typescript
// src/routes/__root.tsx
import type { QueryClient } from '@tanstack/react-query';

export type RouterContext = {
  basePath: string;
  queryClient: QueryClient;
};
```

### Phase 4: Route Migration

**Create Root Layout:**

```typescript
// src/routes/__root.tsx
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import type { QueryClient } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';

export type RouterContext = {
  basePath: string;
  queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <>
      <NuqsAdapter>
        <ErrorBoundary>
          <AppLayout>
            <Outlet />
          </AppLayout>
        </ErrorBoundary>
      </NuqsAdapter>
      {process.env.NODE_ENV === 'development' && (
        <TanStackRouterDevtools position="bottom-right" />
      )}
    </>
  );
}
```

**File-Based Route Structure:**

```
src/routes/
├── __root.tsx                    # Root layout
├── index.tsx                     # / (root redirect)
├── overview/
│   └── index.tsx                 # /overview
├── topics/
│   ├── index.tsx                 # /topics
│   └── $topicName/
│       ├── index.tsx             # /topics/:topicName
│       └── edit.tsx              # /topics/:topicName/edit
├── security/
│   ├── index.tsx                 # /security (redirect)
│   ├── acls/
│   │   ├── index.tsx             # /security/acls
│   │   ├── create.tsx            # /security/acls/create
│   │   └── $aclName/
│   │       └── details.tsx       # /security/acls/:aclName/details
```

See [references/route-templates.md](references/route-templates.md) for complete templates.

### Phase 5: Hook Migration

| React Router | TanStack Router |
|--------------|-----------------|
| `useParams()` | `useParams({ from: '/path/$param' })` |
| `useSearchParams()` | `routeApi.useSearch()` with Zod validation |
| `useNavigate()` | `useNavigate({ from: '/path' })` |
| `useLocation()` | `useLocation()` (same API) |
| `<Link to="/path">` | `<Link to="/path">` (type-safe) |
| `<Navigate to="/path" />` | `<Navigate to="/path" />` |

See [references/migration-patterns.md](references/migration-patterns.md) for detailed before/after examples.

**Navigation State:**

Pass typed state between routes using `HistoryState`:

```typescript
// Navigating with state
const navigate = useNavigate();
navigate({
  to: '/documents/$documentId',
  params: { documentId },
  state: {
    returnUrl: location.pathname,
    documentName: 'My Document',
  },
});

// Reading state in destination component
import { useLocation } from '@tanstack/react-router';

function DocumentPage() {
  const location = useLocation();
  const { returnUrl, documentName } = location.state;
  // Use state values...
}
```

**useParams Migration:**

```typescript
// Before (React Router)
import { useParams } from 'react-router-dom';
const { id } = useParams<{ id: string }>();

// After (TanStack Router)
import { useParams } from '@tanstack/react-router';
const { id } = useParams({ from: '/items/$id' });
```

**useSearch with Zod Validation:**

```typescript
// In route file
import { fallback, zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';

const searchSchema = z.object({
  tab: fallback(z.string().optional(), undefined),
  page: fallback(z.number().optional(), 1),
  q: fallback(z.string().optional(), undefined),
});

export const Route = createFileRoute('/items/')({
  validateSearch: zodValidator(searchSchema),
  component: ItemsPage,
});

// In component
import { getRouteApi, useNavigate } from '@tanstack/react-router';

const routeApi = getRouteApi('/items/');

function ItemsPage() {
  const { tab, page, q } = routeApi.useSearch();
  const navigate = useNavigate({ from: '/items/' });

  const handleTabChange = (newTab: string) => {
    navigate({ search: (prev) => ({ ...prev, tab: newTab }) });
  };
}
```

### Phase 6: Testing

**Create Test Utilities:**

```typescript
// src/test-utils.tsx
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import { routeTree } from './routeTree.gen';
import type { RouterContext } from './routes/__root';

interface RenderWithFileRoutesOptions extends Omit<RenderOptions, 'wrapper'> {
  initialLocation?: string;
  routerContext?: Partial<RouterContext>;
}

export function renderWithFileRoutes(
  ui: React.ReactElement | null = null,
  { initialLocation = '/', routerContext = {}, ...renderOptions }: RenderWithFileRoutesOptions = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialLocation] }),
    context: { basePath: '', queryClient, ...routerContext },
  });

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router}>{children}</RouterProvider>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui ?? <div />, { wrapper: Wrapper, ...renderOptions }),
    router,
  };
}

export async function renderRoute(location: string, options?: RenderWithFileRoutesOptions) {
  const result = renderWithFileRoutes(null, { initialLocation: location, ...options });
  await result.router.load();
  return result;
}
```

**Configure Vitest:**

```typescript
// vitest.config.integration.mts
import { tanstackRouter } from '@tanstack/router-plugin/vite';

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
    }),
    react(),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

### Phase 7: Integrations

**Sentry Integration:**

```typescript
// src/app.tsx
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    Sentry.tanstackRouterBrowserTracingIntegration(router),
  ],
  tracesSampleRate: 1.0,
});
```

**nuqs Integration:**

```typescript
// src/routes/__root.tsx
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';

function RootLayout() {
  return (
    <NuqsAdapter>
      <Outlet />
    </NuqsAdapter>
  );
}
```

**Incremental Migration (Legacy Compatibility):**

See [references/incremental-migration.md](references/incremental-migration.md) for patterns to run both routers together during migration.

## Quick Reference

### Route File Naming

| Pattern | File | URL |
|---------|------|-----|
| Index route | `topics/index.tsx` | `/topics` |
| Dynamic param | `topics/$topicName.tsx` | `/topics/:topicName` |
| Nested dynamic | `topics/$topicName/edit.tsx` | `/topics/:topicName/edit` |
| Pathless layout | `_layout.tsx` | (no URL segment) |
| Catch-all | `$.tsx` | `/*` |

### Common Zod Patterns

```typescript
import { fallback, zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';

const searchSchema = z.object({
  // Optional string with undefined default
  tab: fallback(z.string().optional(), undefined),

  // Optional number with default value
  page: fallback(z.number().optional(), 1),

  // Required string
  id: z.string(),

  // Enum with default
  sort: fallback(z.enum(['asc', 'desc']).optional(), 'asc'),

  // Boolean
  expanded: fallback(z.boolean().optional(), false),
});
```

### Trailing Slash in `from` Parameter

The `from` parameter must exactly match the route path as defined:

```typescript
// Index routes (files named index.tsx) include trailing slash:
useParams({ from: '/topics/$topicName/' })  // Route: topics/$topicName/index.tsx

// Non-index routes do NOT include trailing slash:
useParams({ from: '/topics/$topicName/edit' })  // Route: topics/$topicName/edit.tsx
```

### Type-Safe Navigation

```typescript
// With params
<Link to="/topics/$topicName" params={{ topicName: 'my-topic' }}>
  View Topic
</Link>

// With search params
<Link to="/topics" search={{ page: 2, sort: 'desc' }}>
  Page 2
</Link>

// Programmatic navigation
const navigate = useNavigate({ from: '/topics/$topicName' });
navigate({
  to: '/topics/$topicName/edit',
  params: { topicName },
  search: { tab: 'settings' },
});
```

## Checklist

### Pre-Migration
- [ ] Dependencies installed (`@tanstack/react-router`, `@tanstack/router-plugin`, `@tanstack/zod-adapter`)
- [ ] Build tool plugin configured
- [ ] Linter configured to allow `$param.tsx` naming
- [ ] `src/routes/` directory created

### Route Migration
- [ ] `__root.tsx` created with providers and layout
- [ ] `index.tsx` created for root redirect
- [ ] All routes migrated to file-based structure
- [ ] Search params validated with Zod schemas
- [ ] `staticData` added for titles/icons

### Hook Migration
- [ ] All `useParams` calls updated with `from` parameter
- [ ] All `useSearchParams` replaced with `routeApi.useSearch()`
- [ ] All `useNavigate` calls updated with `from` parameter
- [ ] All `Link` components verified working

### Testing
- [ ] `renderWithFileRoutes` utility created
- [ ] Vitest configured with TanStack Router plugin
- [ ] Existing tests updated to use new utilities

### Integrations
- [ ] Sentry integration configured (if used)
- [ ] nuqs adapter wrapped in root layout (if used)

### Cleanup (after full migration)
- [ ] React Router dependencies removed
- [ ] Legacy route definitions deleted
- [ ] BrowserRouter wrapper removed
- [ ] RouterSync component removed

## Common Pitfalls

1. **Missing `from` parameter** - Always specify `from` in hooks for type safety
2. **Forgetting `fallback()` wrapper** - Optional search params need `fallback(z.string().optional(), undefined)`
3. **Trailing slash inconsistency** - Configure `trailingSlash: 'never'` and be consistent
4. **Editing routeTree.gen.ts** - Never edit; it's auto-generated on file changes
5. **Missing build plugin** - Routes won't generate without the bundler plugin
6. **Async navigation warnings** - `navigate()` returns Promise; use `void navigate()` or await it
7. **Using `<Navigate>` for section redirects** - Use `beforeLoad` with `throw redirect()` instead to prevent navigation loops in embedded mode:
   ```typescript
   beforeLoad: () => {
     throw redirect({ to: '/section/$tab', params: { tab: 'default' }, replace: true });
   }
   ```
8. **Trailing slash in `from` parameter for index routes** - Index routes (files named `index.tsx`) require trailing slash in `from`:
   ```typescript
   // Index route: /topics/$topicName/index.tsx
   useParams({ from: '/topics/$topicName/' })  // ✅ Correct (trailing slash)
   useParams({ from: '/topics/$topicName' })   // ❌ Wrong
   ```
9. **Missing HistoryState extension** - Extend `HistoryState` interface for typed navigation state (see Phase 3)

## Documentation

- [TanStack Router Docs](https://tanstack.com/router/latest/docs)
- [File-Based Routing](https://tanstack.com/router/latest/docs/framework/react/routing/file-based-routing)
- [Testing File-Based Routes](https://tanstack.com/router/latest/docs/framework/react/how-to/test-file-based-routing)
- [Sentry Integration](https://docs.sentry.io/platforms/javascript/guides/react/features/tanstack-router/)
- [nuqs Adapters](https://nuqs.dev/docs/adapters)
