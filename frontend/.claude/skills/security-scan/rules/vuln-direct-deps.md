---
title: Fix Direct Dependency Vulnerabilities
impact: CRITICAL
impactDescription: Direct vulnerabilities are exploitable and must be fixed immediately
tags: security, npm, dependencies, vulnerabilities
---

# Fix Direct Dependency Vulnerabilities (CRITICAL)

## Explanation

Direct dependencies are packages listed in your `package.json`. When they have vulnerabilities, upgrade to the fixed version directly. Use exact versions (no `^`) for security-critical updates.

## Identifying Direct Dependencies

```bash
# Check if package is in package.json
grep "vulnerable-package" package.json

# Check available versions
npm view vulnerable-package versions --json
```

## Incorrect

```json
// Using caret allows vulnerable minor versions
{
  "dependencies": {
    "lodash": "^4.17.0"
  }
}
```

```json
// Not updating when fix is available
{
  "dependencies": {
    "lodash": "4.17.0"
  }
}
```

## Correct

```json
// Exact version with security fix
{
  "dependencies": {
    "lodash": "4.17.21"
  }
}
```

## Steps

1. **Identify fixed version** from vulnerability report
2. **Update package.json** to exact fixed version
3. **Run install**: `bun i --yarn`
4. **Check for breaking changes**: `bun run type:check`
5. **Fix any issues** in code using the package
6. **Verify**: `bun run test && bun run build`

## Handling Breaking Changes

| Issue | Solution |
|-------|----------|
| Type errors | Check migration guide, update types |
| API changes | Update calling code to new API |
| Import changes | Search and replace across codebase |
| Removed features | Find alternative or workaround |

## Reference

- [npm security advisories](https://www.npmjs.com/advisories)
