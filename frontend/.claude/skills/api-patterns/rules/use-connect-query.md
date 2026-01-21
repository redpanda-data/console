---
title: Use Connect Query
impact: CRITICAL
impactDescription: Consistent API patterns enable caching, refetching, and error handling
tags: connect-query, react-query, api, grpc
---

# Use Connect Query (CRITICAL)

## Explanation

Always use Connect Query hooks (`useQuery`, `useMutation`) for API calls. These integrate with React Query for caching, background refetching, and optimistic updates. Never use raw fetch or manual state management for server data.

## Incorrect

```tsx
// Manual fetch with useState
function ClusterList() {
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/clusters')
      .then(res => res.json())
      .then(data => {
        setClusters(data);
        setLoading(false);
      });
  }, []);
}
```

```tsx
// Missing enabled flag
const { data } = useQuery(
  getClusters,
  { organizationId: undefined } // Will error!
);
```

## Correct

```tsx
import { useQuery } from '@connectrpc/connect-query';
import { getClusters } from 'proto/frontend/controlplane/v1/cluster-ClusterService_connectquery';

function ClusterList({ organizationId }: Props) {
  const {
    data: clusters,
    isLoading,
    error,
    refetch,
  } = useQuery(
    getClusters,
    { organizationId },
    {
      staleTime: 1000 * 60 * 5, // 5 minutes
      enabled: !!organizationId, // Only fetch when ID exists
    }
  );

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorDisplay error={error} />;

  return <List items={clusters} />;
}
```

## Common Options

| Option | Purpose |
|--------|---------|
| `enabled` | Conditional fetching |
| `staleTime` | Cache duration before refetch |
| `refetchInterval` | Polling interval |
| `refetchOnWindowFocus` | Refetch when tab focused |

## Reference

- [Connect Query Docs](https://connectrpc.com/docs/web/query/getting-started)
- [TanStack Query Options](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery)
