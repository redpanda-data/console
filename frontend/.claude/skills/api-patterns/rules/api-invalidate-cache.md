---
title: Invalidate Cache After Mutations
impact: HIGH
impactDescription: Stale cache after mutations causes UI to show outdated data
tags: cache, invalidation, mutation, react-query
---

# Invalidate Cache After Mutations (HIGH)

## Explanation

After mutations (create, update, delete), invalidate related queries to ensure the UI reflects the latest server state. Without invalidation, users see stale data until they manually refresh.

## Incorrect

```tsx
// No invalidation after mutation
const mutation = useMutation(updateCluster, {
  onSuccess: () => {
    toast.success('Cluster updated');
    // UI still shows old data!
  },
});
```

```tsx
// Invalidating wrong query key
const mutation = useMutation(updateCluster, {
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['clusters'] }); // Wrong key
  },
});
```

## Correct

```tsx
import { useMutation } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';

const queryClient = useQueryClient();

const mutation = useMutation(updateCluster, {
  onSuccess: () => {
    // Invalidate specific query
    queryClient.invalidateQueries({
      queryKey: ['getCluster', clusterId],
    });

    // Or invalidate all cluster queries
    queryClient.invalidateQueries({
      queryKey: ['getClusters'],
    });

    toast.success('Cluster updated');
  },
});
```

## Optimistic Updates

For instant UI feedback:

```tsx
const mutation = useMutation(updateCluster, {
  onMutate: async (newData) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['getCluster', id] });

    // Snapshot previous value
    const previous = queryClient.getQueryData(['getCluster', id]);

    // Optimistically update
    queryClient.setQueryData(['getCluster', id], newData);

    return { previous };
  },
  onError: (err, newData, context) => {
    // Rollback on error
    queryClient.setQueryData(['getCluster', id], context?.previous);
  },
  onSettled: () => {
    // Always refetch after mutation settles
    queryClient.invalidateQueries({ queryKey: ['getCluster', id] });
  },
});
```

## Reference

- [Query Invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation)
- [Optimistic Updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)
