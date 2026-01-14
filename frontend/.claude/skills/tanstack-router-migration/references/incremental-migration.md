# Incremental Migration

Patterns for running both React Router and TanStack Router together during migration.

## Why Incremental Migration?

Large applications can't migrate all routes at once. Incremental migration allows:
- Gradual transition without breaking existing features
- Team members to continue working on legacy code
- Testing migration patterns before full rollout
- Rollback capability if issues arise

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      TanStack Router                         │
│                     (Primary Router)                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   __root.tsx                         │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │            BrowserRouter                     │    │    │
│  │  │         (Legacy Compatibility)               │    │    │
│  │  │  ┌─────────────────────────────────────┐    │    │    │
│  │  │  │         RouterSync                   │    │    │    │
│  │  │  │   (Syncs navigation to legacy)       │    │    │    │
│  │  │  └─────────────────────────────────────┘    │    │    │
│  │  │  ┌─────────────────────────────────────┐    │    │    │
│  │  │  │           <Outlet />                 │    │    │    │
│  │  │  │    (TanStack Router content)         │    │    │    │
│  │  │  └─────────────────────────────────────┘    │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Root Layout with Legacy Compatibility

```typescript
// src/routes/__root.tsx
import { createRootRouteWithContext, Outlet, useLocation, useNavigate, useRouter } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { BrowserRouter } from 'react-router-dom';
import type { QueryClient } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';
import { useEffect } from 'react';
import { appGlobal } from '../state/app-global';

export type RouterContext = {
  basePath: string;
  queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  const basePath = Route.useRouteContext({ select: (s) => s.basePath });

  return (
    <>
      {/* Sync TanStack Router navigation to legacy global state */}
      <RouterSync />

      {/* BrowserRouter wrapper for legacy React Router hooks */}
      {/* TODO: Remove BrowserRouter once all components are migrated to TanStack Router */}
      <BrowserRouter basename={basePath}>
        <NuqsAdapter>
          <ErrorBoundary>
            <AppLayout>
              <Outlet />
            </AppLayout>
          </ErrorBoundary>
        </NuqsAdapter>
      </BrowserRouter>

      {process.env.NODE_ENV === 'development' && (
        <TanStackRouterDevtools position="bottom-right" />
      )}
    </>
  );
}
```

## RouterSync Component

This component bridges TanStack Router with legacy code that uses global navigation:

```typescript
// src/components/misc/router-sync.tsx
import { useLocation, useNavigate, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { appGlobal } from '../../state/app-global';

/**
 * RouterSync bridges TanStack Router with legacy code that uses
 * appGlobal.historyPush() or appGlobal.location for navigation.
 *
 * This allows:
 * 1. Legacy MobX stores to trigger navigation
 * 2. Non-React code to navigate programmatically
 * 3. Analytics tracking (e.g., HubSpot page views)
 *
 * Remove this component after full migration is complete.
 */
export const RouterSync = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const router = useRouter();

  // Provide navigate function to legacy code
  useEffect(() => {
    appGlobal.setNavigate((to: string, options?: { replace?: boolean }) => {
      navigate({ to, replace: options?.replace });
    });
    appGlobal.setRouter(router);
  }, [navigate, router]);

  // Sync location changes to legacy global state
  useEffect(() => {
    appGlobal.setLocation(location);

    // Track page view in analytics
    if (typeof window !== 'undefined' && window._hsq) {
      window._hsq.push(['setPath', location.pathname]);
      window._hsq.push(['trackPageView']);
    }
  }, [location]);

  // Clear any error state on navigation
  useEffect(() => {
    appGlobal.clearError();
  }, [location.pathname]);

  return null;
};
```

## Legacy Global State Interface

```typescript
// src/state/app-global.ts
import type { Router, Location, NavigateOptions } from '@tanstack/react-router';

class AppGlobal {
  private _navigate: ((to: string, options?: { replace?: boolean }) => void) | null = null;
  private _router: Router | null = null;
  private _location: Location | null = null;

  setNavigate(fn: (to: string, options?: { replace?: boolean }) => void) {
    this._navigate = fn;
  }

  setRouter(router: Router) {
    this._router = router;
  }

  setLocation(location: Location) {
    this._location = location;
  }

  /**
   * Navigate programmatically from non-React code.
   * @deprecated Use TanStack Router's useNavigate hook in React components
   */
  historyPush(to: string, options?: { replace?: boolean }) {
    if (this._navigate) {
      this._navigate(to, options);
    } else {
      console.warn('Router not initialized, falling back to window.location');
      window.location.href = to;
    }
  }

  /**
   * Get current location for non-React code.
   * @deprecated Use TanStack Router's useLocation hook in React components
   */
  get location(): Location | null {
    return this._location;
  }

  clearError() {
    // Clear any global error state
  }
}

export const appGlobal = new AppGlobal();
```

## Wrapper Pattern for Legacy Page Components

When migrating page components that expect legacy props:

```typescript
// src/routes/topics/$topicName/index.tsx
import { createFileRoute, useParams } from '@tanstack/react-router';
import TopicDetails from '../../../components/pages/topics/topic-details';

export const Route = createFileRoute('/topics/$topicName/')({
  staticData: {
    title: 'Topic Details',
  },
  component: TopicDetailsWrapper,
});

/**
 * Wrapper component that bridges TanStack Router params
 * to legacy TopicDetails component props.
 */
function TopicDetailsWrapper() {
  const { topicName } = useParams({ from: '/topics/$topicName/' });

  // Legacy components often expect:
  // - matchedPath: Full matched URL for breadcrumbs
  // - Raw param values as props
  return (
    <TopicDetails
      topicName={topicName}
      matchedPath={`/topics/${topicName}`}
    />
  );
}
```

## nuqs Dual Adapter Setup

If using nuqs for URL state, you may need both adapters during migration:

```typescript
// src/routes/__root.tsx
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';

// TanStack Router routes use this adapter
function RootLayout() {
  return (
    <NuqsAdapter>
      <Outlet />
    </NuqsAdapter>
  );
}
```

```typescript
// src/components/routes.tsx (legacy)
import { NuqsAdapter } from 'nuqs/adapters/react-router/v6';

// Legacy routes still using React Router use this adapter
function LegacyRouteView() {
  return (
    <NuqsAdapter>
      <Routes>
        {/* Legacy routes */}
      </Routes>
    </NuqsAdapter>
  );
}
```

## Migration Checklist by Phase

### Phase 1: Setup Dual Router
- [ ] Install TanStack Router alongside React Router
- [ ] Configure build plugin
- [ ] Create `src/routes/` directory
- [ ] Create `__root.tsx` with BrowserRouter wrapper
- [ ] Create `RouterSync` component
- [ ] Add global state bridge

### Phase 2: Migrate Routes (One at a Time)
- [ ] Create route file in `src/routes/`
- [ ] Add wrapper component for legacy page
- [ ] Test route works with both navigation methods
- [ ] Update any internal links to use TanStack Router `Link`

### Phase 3: Migrate Components
- [ ] Replace `useParams` imports
- [ ] Replace `useSearchParams` with Zod-validated search
- [ ] Replace `useNavigate` imports
- [ ] Update `Link` components

### Phase 4: Remove Legacy Code
- [ ] Remove `BrowserRouter` wrapper from root
- [ ] Remove `RouterSync` component
- [ ] Remove legacy `src/components/routes.tsx`
- [ ] Remove `react-router-dom` dependency
- [ ] Remove global navigation bridge

## Testing During Migration

Test both navigation paths work:

```typescript
// test-utils.tsx
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { routeTree } from './routeTree.gen';

// For testing new TanStack Router routes
export function renderWithFileRoutes(ui, { initialLocation = '/' } = {}) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialLocation] }),
    context: { basePath: '', queryClient },
  });

  return render(
    <RouterProvider router={router}>{ui}</RouterProvider>
  );
}

// For testing legacy components that still use React Router hooks
export function renderWithLegacyRouter(ui, { initialEntries = ['/'] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      {ui}
    </MemoryRouter>
  );
}
```

## Common Issues During Migration

### 1. Navigation Not Working
**Symptom:** Clicking links doesn't navigate
**Cause:** Mixed router contexts
**Solution:** Ensure all navigation uses the same router instance

### 2. Search Params Not Syncing
**Symptom:** URL changes but component doesn't update
**Cause:** Using wrong adapter or hook
**Solution:** Use TanStack Router hooks for TanStack routes

### 3. Page Flicker
**Symptom:** Page briefly shows wrong content
**Cause:** Both routers trying to render
**Solution:** Ensure only one router handles each route

### 4. Type Errors
**Symptom:** TypeScript errors about route types
**Cause:** Route not registered or `from` parameter wrong
**Solution:** Check route path matches exactly, including trailing slashes

## Removing Legacy Router

When all routes are migrated:

```typescript
// src/routes/__root.tsx (final version)
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
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

Then remove:
```bash
bun remove react-router-dom
```

And delete:
- `src/components/routes.tsx`
- `src/components/misc/router-sync.tsx`
- Any `appGlobal` navigation methods
