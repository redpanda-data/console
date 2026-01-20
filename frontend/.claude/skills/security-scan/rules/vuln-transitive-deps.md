---
title: Fix Transitive Dependency Vulnerabilities
impact: HIGH
impactDescription: Transitive vulnerabilities can still be exploited through parent packages
tags: security, npm, overrides, transitive, dependencies
---

# Fix Transitive Dependency Vulnerabilities (HIGH)

## Explanation

Transitive dependencies are pulled in by other packages. Use npm `overrides` to force a fixed version without waiting for the parent package to update.

## Identifying Transitive Dependencies

```bash
# Check dependency tree
npm ls vulnerable-package

# Example output shows the chain:
# project@1.0.0
# └─┬ parent-package@2.0.0
#   └── vulnerable-package@1.0.0
```

## Incorrect

```json
// Trying to add transitive as direct dep (won't work)
{
  "dependencies": {
    "vulnerable-package": "2.0.0"
  }
}
```

```json
// Override without version constraint
{
  "overrides": {
    "vulnerable-package": "*"
  }
}
```

## Correct

```json
// Override transitive dependency
{
  "overrides": {
    "vulnerable-package": "^2.0.0"
  }
}
```

```json
// Scoped override for specific parent
{
  "overrides": {
    "parent-package": {
      "vulnerable-package": "^2.0.0"
    }
  }
}
```

## Steps

1. **Identify the chain**: `npm ls vulnerable-package`
2. **Find fixed version**: Check npm or vulnerability report
3. **Add override** to package.json
4. **Run install**: `bun i --yarn`
5. **Verify resolution**: `npm ls vulnerable-package`
6. **Test**: `bun run test && bun run build`

## When Override Doesn't Work

| Situation | Solution |
|-----------|----------|
| Major version mismatch | May need to wait for parent update |
| Package unmaintained | Replace parent with alternative |
| Complex dependency tree | Use scoped overrides |

## Reference

- [npm overrides documentation](https://docs.npmjs.com/cli/v8/configuring-npm/package-json#overrides)
