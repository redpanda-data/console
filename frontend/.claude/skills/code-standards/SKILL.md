---
name: code-standards
description: TypeScript, React, and JavaScript best practices enforced by Ultracite/Biome.
---

# Code Standards

Write code that is accessible, performant, type-safe, and maintainable.

## Activation Conditions

- Linting errors need fixing
- Code formatting issues
- Code review feedback
- Questions about style guidelines

## Quick Reference

| Action | Rule |
|--------|------|
| Avoid any | `ts-no-any.md` |
| Handle unknowns | `ts-use-unknown.md` |
| Write components | `react-functional-only.md` |
| Async code | `async-await-promises.md` |
| Avoid legacy libs | `no-legacy.md` |

## Commands

```bash
bun x ultracite fix     # Format and fix
bun x ultracite check   # Check for issues
bun x ultracite doctor  # Diagnose setup
```

## Quick Fix

Most issues are auto-fixed:

```bash
bun x ultracite fix
```

## Rules

See `rules/` directory for detailed guidance.
