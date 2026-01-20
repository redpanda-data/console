---
name: state-management
description: Manage client and server state with Zustand stores and React Query patterns.
---

# State Management

Choose the right state solution for each use case.

## Activation Conditions

- Managing global state
- Persisting state across navigation
- Cross-component data sharing
- Questions about Zustand vs React Query

## Quick Reference

| Action | Rule |
|--------|------|
| Read from store | `use-zustand-selectors.md` |
| Persist state | `use-zustand-persist.md` |
| Fetch server data | `use-react-query-for-server.md` |

## Decision Tree

```
Is it server data (API response)?
├── Yes → React Query / Connect Query
│         (caching, refetching, invalidation)
└── No → Is it URL state?
    ├── Yes → React Router
    │         (search params, path params)
    └── No → Is it form state?
        ├── Yes → React Hook Form
        │         (validation, submission)
        └── No → Is it shared across components?
            ├── Yes → Zustand
            │         (global, persisted)
            └── No → useState / useReducer
                      (local component state)
```

## Rules

See `rules/` directory for detailed guidance.
