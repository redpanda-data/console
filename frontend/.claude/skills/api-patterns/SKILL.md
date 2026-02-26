---
name: api-patterns
description: Connect Query patterns for API calls. Use when working with mutations, queries, or data fetching.
---

# API Patterns

Make API calls with Connect Query and handle responses properly.

## Activation Conditions

- Making API calls
- Using Connect Query hooks
- Cache invalidation
- Mutations and optimistic updates
- Toast notifications for errors

## Quick Reference

| Action | Rule |
|--------|------|
| Fetch data | `use-connect-query.md` |
| After mutation | `api-invalidate-cache.md` |
| Handle errors | `api-toast-errors.md` (use `formatToastErrorMessage` in onError) |
| Protobuf files | `protobuf-no-edit.md` |

## Key Locations

| Location | Purpose |
|----------|---------|
| `/src/react-query/` | Connect Query hooks |
| `/src/protogen/` | Generated protos (DO NOT EDIT) |

Regenerate protos: `task proto:generate` (from repo root)

## Rules

See `rules/` directory for detailed guidance on queries, mutations, cache invalidation, and error handling.
