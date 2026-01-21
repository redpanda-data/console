---
title: Toast Error Messages
impact: HIGH
impactDescription: Consistent error messages help users understand and recover from failures
tags: error-handling, toast, ux, mutations
---

# Toast Error Messages (HIGH)

## Explanation

Use `formatToastErrorMessage` utility for consistent, user-friendly error messages in mutation `onError` handlers. This provides a standard format that includes the action, entity, and error details.

## Incorrect

```tsx
// Generic error message
const mutation = useMutation(deleteCluster, {
  onError: () => {
    toast.error('Something went wrong');
  },
});

// Raw error object
const mutation = useMutation(deleteCluster, {
  onError: (error) => {
    toast.error(error.message); // May be technical/unhelpful
  },
});

// No error handling
const mutation = useMutation(deleteCluster, {
  onSuccess: () => toast.success('Deleted'),
  // Missing onError!
});
```

## Correct

```tsx
import { formatToastErrorMessage } from 'utils/toast.utils';

const mutation = useMutation(deleteCluster, {
  onSuccess: () => {
    toast.success('Cluster deleted');
  },
  onError: (error) => {
    toast.error(formatToastErrorMessage({
      error: {
        reason: error.message,
        internalCode: error.code,
      },
      action: 'delete',
      entity: 'cluster',
    }));
  },
});

// Output: "Failed to delete cluster due to: reason (code: 123)"
```

## Standard Actions

| Action | Use For |
|--------|---------|
| `create` | POST / create operations |
| `update` | PUT / PATCH operations |
| `delete` | DELETE operations |
| `fetch` | GET operations (rare) |

## Error Boundaries for Render Errors

```tsx
import * as Sentry from '@sentry/react';

<Sentry.ErrorBoundary fallback={<ErrorFallback />}>
  <ClusterDashboard />
</Sentry.ErrorBoundary>
```

## Reference

- `src/utils/toast.utils.ts` - Toast utility implementation
