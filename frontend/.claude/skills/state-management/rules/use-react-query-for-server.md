---
title: Use React Query for Server State
impact: HIGH
impactDescription: Using client state for server data leads to stale data and cache inconsistencies
tags: react-query, connect-query, server-state, caching
---

# Use React Query for Server State (HIGH)

## Explanation

Server data (API responses) should always use React Query / Connect Query, not Zustand or useState. React Query provides caching, background refetching, and automatic invalidation that client state solutions don't handle well.

## Incorrect

```tsx
// Using Zustand for server data
const useClusterStore = create((set) => ({
  clusters: [],
  setClusters: (clusters) => set({ clusters }),
}));

function ClusterList() {
  const { clusters, setClusters } = useClusterStore();

  useEffect(() => {
    fetchClusters().then(setClusters);
  }, []);

  return <List items={clusters} />;
}
```

```tsx
// Using useState for server data
function ClusterList() {
  const [clusters, setClusters] = useState([]);

  useEffect(() => {
    fetchClusters().then(setClusters);
  }, []);

  return <List items={clusters} />;
}
```

## Correct

```tsx
import { useQuery } from '@connectrpc/connect-query';
import { getClusters } from 'proto/frontend/controlplane/v1/cluster-ClusterService_connectquery';

function ClusterList() {
  const { data: clusters, isLoading, error } = useQuery(
    getClusters,
    { organizationId },
    {
      staleTime: 1000 * 60 * 5, // 5 minutes
      enabled: !!organizationId,
    }
  );

  if (isLoading) return <Skeleton />;
  if (error) return <Error error={error} />;

  return <List items={clusters} />;
}
```

## When to Use What

| Data Source | Solution |
|-------------|----------|
| API response | React Query / Connect Query |
| User preferences | Zustand |
| Form state | React Hook Form |
| UI state (modal open) | useState |
| URL state | React Router |

## Reference

- [TanStack Query Overview](https://tanstack.com/query/latest/docs/framework/react/overview)
- [Connect Query Docs](https://connectrpc.com/docs/web/query/getting-started)
