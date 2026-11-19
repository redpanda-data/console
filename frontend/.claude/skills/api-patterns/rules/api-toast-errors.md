---
title: Toast Error Messages
impact: HIGH
impactDescription: Consistent error messages help users understand and recover from failures
tags: error-handling, toast, ux, mutations
---

# Toast Error Messages (HIGH)

## Explanation

Toast through `showToast` from `utils/toast.utils`, Console's façade over the registry toast manager. Never import `sonner`; it has been removed. In mutation `onError` handlers, build the title with `formatToastErrorMessageGRPC` (Connect errors) or `formatToastErrorMessage` (HTTP payloads), so every message names the action, the entity and the error details. Error toasts stay until the user closes them; other statuses close after 5 seconds.

## Incorrect

```tsx
// Generic error message
const mutation = useMutation(deleteCluster, {
  onError: () => {
    showToast({ status: 'error', title: 'Something went wrong' });
  },
});

// Raw error object
const mutation = useMutation(deleteCluster, {
  onError: (error) => {
    showToast({ status: 'error', title: error.message }); // May be technical/unhelpful
  },
});

// No error handling
const mutation = useMutation(deleteCluster, {
  onSuccess: () => showToast({ status: 'success', title: 'Deleted' }),
  // Missing onError!
});
```

## Correct

```tsx
import { formatToastErrorMessageGRPC, showToast } from 'utils/toast.utils';

const mutation = useMutation(deleteCluster, {
  onSuccess: () => {
    showToast({ status: 'success', title: 'Cluster deleted' });
  },
  onError: (error) => {
    showToast({
      status: 'error',
      title: formatToastErrorMessageGRPC({ error, action: 'delete', entity: 'cluster' }),
    });
  },
});

// Title: "Failed to delete cluster: <message> (reason: <reason>)"
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

- `src/utils/toast.utils.tsx` - `showToast` / `updateToast` / `closeToast` and the message formatters
