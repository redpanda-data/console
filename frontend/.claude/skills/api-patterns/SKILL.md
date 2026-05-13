---
name: api-patterns
description: "Implement Connect Query (@connectrpc/connect-query) patterns for type-safe gRPC-Web API calls in React components — generate query hooks from protobuf services, create mutation handlers with cache invalidation, and wire toast error messages. Use when working with useQuery, useMutation, @connectrpc, protobuf services, gRPC-Web, .proto files, Connect Query hooks, cache invalidation after mutations, or formatToastErrorMessage."
---

# API Patterns

Implement type-safe API calls using Connect Query with proper caching, error handling, and cache invalidation in Redpanda Console's React frontend.

## Activation Conditions

- Adding or modifying Connect Query `useQuery` / `useMutation` calls
- Implementing cache invalidation after create/update/delete mutations
- Wiring `formatToastErrorMessage` in mutation `onError` handlers
- Importing from `@connectrpc/connect-query` or `src/protogen/`
- Regenerating protobuf types or working with `.proto` schemas

## Quick Reference

| Action | Rule |
|--------|------|
| Fetch data | `rules/use-connect-query.md` — use `useQuery` with `enabled` guard |
| After mutation | `rules/api-invalidate-cache.md` — invalidate related queries on success |
| Handle errors | `rules/api-toast-errors.md` — use `formatToastErrorMessage` in `onError` |
| Protobuf files | `rules/protobuf-no-edit.md` — never edit `src/protogen/`, extend outside |

## Mutation Workflow

Follow this sequence for every mutation:

1. **Call mutation** — `useMutation(rpcMethod, { onSuccess, onError })`
2. **Handle errors** — pass `formatToastErrorMessage({ error, action, entity })` to `toast.error` in `onError`
3. **Invalidate cache** — call `queryClient.invalidateQueries({ queryKey })` in `onSuccess` for affected queries
4. **Confirm success** — show `toast.success` after invalidation

```tsx
import { useMutation } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import { formatToastErrorMessage } from 'utils/toast.utils';

const queryClient = useQueryClient();

const mutation = useMutation(updateCluster, {
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['getClusters'] });
    toast.success('Cluster updated');
  },
  onError: (error) => {
    toast.error(formatToastErrorMessage({
      error: { reason: error.message, internalCode: error.code },
      action: 'update',
      entity: 'cluster',
    }));
  },
});
```

## Key Locations

| Location | Purpose |
|----------|---------|
| `src/react-query/` | Connect Query hooks and utilities |
| `src/protogen/` | Generated protobuf types (DO NOT EDIT) |
| `src/utils/toast.utils.ts` | `formatToastErrorMessage` implementation |

Regenerate protos: `task proto:generate` (from repo root)

## Rules

See `rules/` directory for detailed guidance on queries, mutations, cache invalidation, and error handling.
