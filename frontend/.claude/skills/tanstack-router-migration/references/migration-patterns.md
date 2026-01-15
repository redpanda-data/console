# Migration Patterns

Before and after examples for migrating from React Router to TanStack Router.

## useParams Migration

### Basic Usage

**Before (React Router):**
```typescript
import { useParams } from 'react-router-dom';

function TopicDetails() {
  const { topicName } = useParams<{ topicName: string }>();

  return <div>Topic: {topicName}</div>;
}
```

**After (TanStack Router):**
```typescript
import { useParams } from '@tanstack/react-router';

function TopicDetails() {
  const { topicName } = useParams({ from: '/topics/$topicName/' });

  return <div>Topic: {topicName}</div>;
}
```

### Multiple Parameters

**Before (React Router):**
```typescript
import { useParams } from 'react-router-dom';

function DocumentDetails() {
  const { knowledgebaseId, documentId } = useParams<{
    knowledgebaseId: string;
    documentId: string;
  }>();

  return <div>Document: {documentId} in KB: {knowledgebaseId}</div>;
}
```

**After (TanStack Router):**
```typescript
import { useParams } from '@tanstack/react-router';

function DocumentDetails() {
  const { knowledgebaseId, documentId } = useParams({
    from: '/knowledgebases/$knowledgebaseId/documents/$documentId',
  });

  return <div>Document: {documentId} in KB: {knowledgebaseId}</div>;
}
```

### Using getRouteApi (Recommended for Reusable Components)

```typescript
import { getRouteApi } from '@tanstack/react-router';

// Define route API once at module level
const routeApi = getRouteApi('/topics/$topicName/');

function TopicHeader() {
  const { topicName } = routeApi.useParams();
  return <h1>{topicName}</h1>;
}

function TopicActions() {
  const { topicName } = routeApi.useParams();
  return <button>Delete {topicName}</button>;
}
```

## useSearchParams Migration

### Basic Read/Write

**Before (React Router):**
```typescript
import { useSearchParams } from 'react-router-dom';

function TopicList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'overview';
  const query = searchParams.get('q') || '';

  const handleTabChange = (newTab: string) => {
    setSearchParams({ tab: newTab, q: query });
  };

  const handleSearch = (newQuery: string) => {
    setSearchParams({ tab, q: newQuery });
  };

  return (
    <div>
      <Tabs value={tab} onChange={handleTabChange} />
      <SearchInput value={query} onChange={handleSearch} />
    </div>
  );
}
```

**After (TanStack Router):**

First, define schema in route file:
```typescript
// src/routes/topics/index.tsx
import { fallback, zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';

const searchSchema = z.object({
  tab: fallback(z.string().optional(), 'overview'),
  q: fallback(z.string().optional(), ''),
});

export const Route = createFileRoute('/topics/')({
  validateSearch: zodValidator(searchSchema),
  component: TopicList,
});
```

Then use in component:
```typescript
import { getRouteApi, useNavigate } from '@tanstack/react-router';

const routeApi = getRouteApi('/topics/');

function TopicList() {
  const { tab, q } = routeApi.useSearch();
  const navigate = useNavigate({ from: '/topics/' });

  const handleTabChange = (newTab: string) => {
    navigate({ search: (prev) => ({ ...prev, tab: newTab }) });
  };

  const handleSearch = (newQuery: string) => {
    navigate({ search: (prev) => ({ ...prev, q: newQuery }) });
  };

  return (
    <div>
      <Tabs value={tab} onChange={handleTabChange} />
      <SearchInput value={q} onChange={handleSearch} />
    </div>
  );
}
```

### Selective Search Param Subscription

**TanStack Router advantage:** Subscribe to only the params you need to avoid re-renders:

```typescript
const routeApi = getRouteApi('/topics/');

function TabSelector() {
  // Only re-renders when 'tab' changes, not when 'q' changes
  const tab = routeApi.useSearch({ select: (s) => s.tab });

  return <Tabs value={tab} />;
}

function SearchBox() {
  // Only re-renders when 'q' changes, not when 'tab' changes
  const q = routeApi.useSearch({ select: (s) => s.q });

  return <SearchInput value={q} />;
}
```

## useNavigate Migration

### Basic Navigation

**Before (React Router):**
```typescript
import { useNavigate } from 'react-router-dom';

function CreateButton() {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate('/topics/create');
  };

  return <button onClick={handleClick}>Create Topic</button>;
}
```

**After (TanStack Router):**
```typescript
import { useNavigate } from '@tanstack/react-router';

function CreateButton() {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate({ to: '/topics/create' });
  };

  return <button onClick={handleClick}>Create Topic</button>;
}
```

### Navigation with Parameters

**Before (React Router):**
```typescript
import { useNavigate, useParams } from 'react-router-dom';

function EditButton() {
  const navigate = useNavigate();
  const { topicName } = useParams<{ topicName: string }>();

  const handleClick = () => {
    navigate(`/topics/${topicName}/edit`);
  };

  return <button onClick={handleClick}>Edit</button>;
}
```

**After (TanStack Router):**
```typescript
import { useNavigate, useParams } from '@tanstack/react-router';

function EditButton() {
  const navigate = useNavigate({ from: '/topics/$topicName/' });
  const { topicName } = useParams({ from: '/topics/$topicName/' });

  const handleClick = () => {
    navigate({
      to: '/topics/$topicName/edit',
      params: { topicName },
    });
  };

  return <button onClick={handleClick}>Edit</button>;
}
```

### Navigation with Search Params

**Before (React Router):**
```typescript
import { useNavigate } from 'react-router-dom';

function FilterButton() {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate('/topics?tab=settings&q=test');
  };

  return <button onClick={handleClick}>Show Settings</button>;
}
```

**After (TanStack Router):**
```typescript
import { useNavigate } from '@tanstack/react-router';

function FilterButton() {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate({
      to: '/topics',
      search: { tab: 'settings', q: 'test' },
    });
  };

  return <button onClick={handleClick}>Show Settings</button>;
}
```

### Replace vs Push

**Before (React Router):**
```typescript
navigate('/topics', { replace: true });
```

**After (TanStack Router):**
```typescript
navigate({ to: '/topics', replace: true });
```

## Link Component Migration

### Basic Link

**Before (React Router):**
```typescript
import { Link } from 'react-router-dom';

<Link to="/topics">View Topics</Link>
```

**After (TanStack Router):**
```typescript
import { Link } from '@tanstack/react-router';

<Link to="/topics">View Topics</Link>
```

### Link with Parameters

**Before (React Router):**
```typescript
import { Link } from 'react-router-dom';

<Link to={`/topics/${topicName}`}>View Topic</Link>
```

**After (TanStack Router):**
```typescript
import { Link } from '@tanstack/react-router';

// Type-safe with params object
<Link to="/topics/$topicName" params={{ topicName }}>
  View Topic
</Link>

// Or with string (less type-safe but works)
<Link to={`/topics/${topicName}`}>View Topic</Link>
```

### Link with Search Params

**Before (React Router):**
```typescript
import { Link } from 'react-router-dom';

<Link to="/topics?tab=settings">Settings</Link>
```

**After (TanStack Router):**
```typescript
import { Link } from '@tanstack/react-router';

<Link to="/topics" search={{ tab: 'settings' }}>
  Settings
</Link>
```

### Active Link Styling

**Before (React Router):**
```typescript
import { NavLink } from 'react-router-dom';

<NavLink
  to="/topics"
  className={({ isActive }) => isActive ? 'active' : ''}
>
  Topics
</NavLink>
```

**After (TanStack Router):**
```typescript
import { Link } from '@tanstack/react-router';

<Link
  to="/topics"
  activeProps={{ className: 'active' }}
  inactiveProps={{ className: '' }}
>
  Topics
</Link>
```

## useLocation Migration

**Before (React Router):**
```typescript
import { useLocation } from 'react-router-dom';

function Breadcrumb() {
  const location = useLocation();
  return <div>Current path: {location.pathname}</div>;
}
```

**After (TanStack Router):**
```typescript
import { useLocation } from '@tanstack/react-router';

function Breadcrumb() {
  const location = useLocation();
  return <div>Current path: {location.pathname}</div>;
}
```

## Navigate Component Migration

**Before (React Router):**
```typescript
import { Navigate } from 'react-router-dom';

function ProtectedRoute({ isAuth, children }) {
  if (!isAuth) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
```

**After (TanStack Router):**
```typescript
import { Navigate } from '@tanstack/react-router';

function ProtectedRoute({ isAuth, children }) {
  if (!isAuth) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
```

### Section Redirects (Preferred: beforeLoad)

For section/index redirects, prefer `beforeLoad` with `throw redirect()` over `<Navigate>` component. This prevents navigation loops in embedded mode:

**Before (React Router):**
```typescript
// Section redirects using Navigate component
<Route path="/security" element={<Navigate replace to="/security/users" />} />
```

**After (TanStack Router - PREFERRED):**
```typescript
// src/routes/security/index.tsx
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/security/')({
  beforeLoad: () => {
    throw redirect({
      to: '/security/$tab',
      params: { tab: 'users' },
      replace: true,
    });
  },
});
```

**After (TanStack Router - Alternative):**
```typescript
// Simple redirect without embedded mode concerns
import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/security/')({
  component: () => <Navigate replace to="/security/users" />,
});
```

## Custom Hook Migration

### usePaginationParams Example

**Before (React Router):**
```typescript
import { useSearchParams } from 'react-router-dom';

export function usePaginationParams(defaultPageSize = 25) {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page')) || 1;
  const pageSize = Number(searchParams.get('pageSize')) || defaultPageSize;

  const setPage = (newPage: number) => {
    setSearchParams((prev) => {
      prev.set('page', String(newPage));
      return prev;
    });
  };

  const setPageSize = (newSize: number) => {
    setSearchParams((prev) => {
      prev.set('pageSize', String(newSize));
      prev.set('page', '1'); // Reset to page 1
      return prev;
    });
  };

  return { page, pageSize, setPage, setPageSize };
}
```

**After (TanStack Router):**

First, ensure route has the search schema:
```typescript
// In route file
const searchSchema = z.object({
  page: fallback(z.number().optional(), 1),
  pageSize: fallback(z.number().optional(), 25),
});
```

Then create the hook:
```typescript
import { useNavigate, useSearch } from '@tanstack/react-router';

export function usePaginationParams(routePath: string) {
  const search = useSearch({ from: routePath });
  const navigate = useNavigate({ from: routePath });

  const setPage = (newPage: number) => {
    navigate({ search: (prev) => ({ ...prev, page: newPage }) });
  };

  const setPageSize = (newSize: number) => {
    navigate({ search: (prev) => ({ ...prev, pageSize: newSize, page: 1 }) });
  };

  return {
    page: search.page ?? 1,
    pageSize: search.pageSize ?? 25,
    setPage,
    setPageSize,
  };
}

// Usage
const { page, pageSize, setPage, setPageSize } = usePaginationParams('/topics/');
```

## Button with Link Behavior

**Before (React Router):**
```typescript
import { Link } from 'react-router-dom';
import { Button } from '@chakra-ui/react';

<Button as={Link} to="/topics/create">
  Create Topic
</Button>
```

**After (TanStack Router):**
```typescript
import { Link } from '@tanstack/react-router';
import { Button } from 'components/redpanda-ui/components/button';

// Option 1: Wrap button with Link
<Link to="/topics/create">
  <Button>Create Topic</Button>
</Link>

// Option 2: Use Button as anchor for external links
<Button as="a" href="https://example.com" target="_blank" rel="noopener">
  External Link
</Button>
```

## External Links

**Before (might use React Router Link):**
```typescript
import { Link } from 'react-router-dom';

<Link to="https://docs.redpanda.com" target="_blank">
  Documentation
</Link>
```

**After (use native anchor):**
```typescript
// Don't use TanStack Router Link for external URLs
<a href="https://docs.redpanda.com" target="_blank" rel="noopener">
  Documentation
</a>

// Or with Button component
<Button as="a" href="https://docs.redpanda.com" target="_blank" rel="noopener">
  Documentation
</Button>
```

## HistoryState Extension

Extend `HistoryState` for typed navigation state between routes:

```typescript
// In app.tsx or a dedicated types file
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }

  // Extend HistoryState for typed navigation state
  interface HistoryState {
    // Document viewer state
    chunkId?: string;
    topic?: string;
    documentName?: string;
    content?: string;
    score?: number;

    // Navigation state
    returnUrl?: string;
    fromTab?: string;
  }
}
```

This enables type-safe state passing during navigation.

## Navigate with State

**Before (React Router):**
```typescript
import { useNavigate, useLocation } from 'react-router-dom';

const navigate = useNavigate();
navigate('/documents/123', {
  state: { returnUrl: '/list', documentName: 'My Doc' }
});

// Reading state
import { useLocation } from 'react-router-dom';
const location = useLocation();
const { returnUrl, documentName } = location.state || {};
```

**After (TanStack Router):**
```typescript
import { useNavigate, useLocation } from '@tanstack/react-router';

const navigate = useNavigate();
navigate({
  to: '/documents/$documentId',
  params: { documentId: '123' },
  state: { returnUrl: '/list', documentName: 'My Doc' },
});

// Reading state (typed via HistoryState extension)
const location = useLocation();
const { returnUrl, documentName } = location.state;
```

**Complex state example:**
```typescript
// Passing search result context to document viewer
const handleResultClick = (result: SearchResult) => {
  navigate({
    to: '/knowledgebases/$knowledgebaseId/documents/$documentId',
    params: {
      knowledgebaseId: result.knowledgebase_id,
      documentId: result.document_id,
    },
    state: {
      chunkId: result.chunk_id,
      topic: result.topic,
      documentName: result.document_name,
      content: result.text,
      score: result.score,
      returnUrl: location.pathname,
    },
  });
};

// In destination component
function DocumentViewer() {
  const location = useLocation();
  const { chunkId, documentName, returnUrl } = location.state;

  // Use chunkId to scroll to specific section
  // Use returnUrl for back navigation
}
```
