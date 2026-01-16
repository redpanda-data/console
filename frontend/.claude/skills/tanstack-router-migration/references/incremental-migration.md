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

This component bridges TanStack Router with legacy code and embedded mode shell:

```typescript
// src/components/misc/router-sync.tsx
import { useLocation, useNavigate, useRouter } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { isEmbedded } from '../../config';
import { trackHubspotPage } from '../../hubspot/hubspot.helper';
import { appGlobal } from '../../state/app-global';
import { api } from '../../state/backend-api';

/**
 * RouterSync bridges TanStack Router with:
 * 1. Legacy MobX stores (appGlobal.historyPush())
 * 2. Non-React code navigation
 * 3. Analytics tracking (HubSpot)
 * 4. Embedded mode shell synchronization
 *
 * In embedded mode (Cloud UI), Console runs inside a shell that has its own
 * React Router. When Console navigates internally, we dispatch a custom event
 * so the shell can sync its router state and keep the URL in sync.
 */
export const RouterSync = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const router = useRouter();
  const previousPathRef = useRef<string>('');

  // Sync navigation functions to appGlobal for legacy code
  useEffect(() => {
    appGlobal.setNavigate((to: string, options?: { replace?: boolean }) => {
      navigate({ to, replace: options?.replace });
    });
    appGlobal.setRouter(router);
  }, [navigate, router]);

  // Track page navigation and clear errors
  useEffect(() => {
    api.errors = [];
    if (location.pathname) {
      trackHubspotPage(location.pathname);
    }
  }, [location.pathname]);

  // Sync location to appGlobal
  useEffect(() => {
    appGlobal.setLocation(location);
  }, [location]);

  // Notify shell (Cloud UI) when Console navigates internally
  useEffect(() => {
    if (isEmbedded() && location.pathname && previousPathRef.current !== location.pathname) {
      window.dispatchEvent(
        new CustomEvent('[console] navigated', { detail: location.pathname })
      );
      previousPathRef.current = location.pathname;
    }
  }, [location.pathname]);

  return null;
};
```

## Embedded Mode Shell Synchronization

In embedded mode, Console runs inside Cloud UI's shell which has its own router. When Console navigates internally, the shell needs to sync its router state to keep the URL correct.

**How it works:**

```typescript
// Console (inside iframe or embedded context) dispatches this event:
window.dispatchEvent(
  new CustomEvent('[console] navigated', { detail: location.pathname })
);

// Shell (Cloud UI) listens and syncs its router:
window.addEventListener('[console] navigated', (event) => {
  const path = event.detail;
  // Shell's React Router navigates to keep URL in sync
  shellNavigate(path, { replace: true });
});
```

**Path deduplication:**

Use a ref to prevent duplicate events when the path hasn't actually changed:

```typescript
const previousPathRef = useRef<string>('');

useEffect(() => {
  if (location.pathname && previousPathRef.current !== location.pathname) {
    window.dispatchEvent(
      new CustomEvent('[console] navigated', { detail: location.pathname })
    );
    previousPathRef.current = location.pathname;
  }
}, [location.pathname]);
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
import { createRootRouteWithContext, Outlet, useLocation } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';
import type { QueryClient } from '@tanstack/react-query';
import { RouterSync } from '../components/misc/router-sync';
import { isEmbedded } from '../config';

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
      {/* Keep RouterSync for legacy code and embedded mode shell sync */}
      <RouterSync />
      <NuqsAdapter>
        <ErrorBoundary>
          {isEmbedded() ? <EmbeddedLayout /> : <SelfHostedLayout />}
        </ErrorBoundary>
      </NuqsAdapter>
      {process.env.NODE_ENV === 'development' && (
        <TanStackRouterDevtools position="bottom-right" />
      )}
    </>
  );
}

function SelfHostedLayout() {
  const location = useLocation();

  // Bypass main layout for login page
  if (location.pathname.startsWith('/login')) {
    return <Outlet />;
  }

  return (
    <SidebarLayout>
      <SidebarInset>
        <AppContent />
      </SidebarInset>
    </SidebarLayout>
  );
}

function EmbeddedLayout() {
  return <Outlet />;
}
```

**Important:** Keep `RouterSync` even after migration for:
1. **Embedded mode shell sync** - Console notifies shell of internal navigation
2. **Legacy global navigation** - Non-React code may still use `appGlobal.historyPush()`
3. **Analytics tracking** - HubSpot page view tracking

Then remove:
```bash
bun remove react-router-dom
```

And delete:
- `src/components/routes.tsx` (legacy routes file)
- Any `BrowserRouter` wrapper from root layout
- Legacy `MemoryRouter` test utilities (replace with `renderWithFileRoutes`)
