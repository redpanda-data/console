---
name: security-scan
description: Resolve npm dependency vulnerabilities detected by security scans.
---

# Security Scan

Resolve npm dependency vulnerabilities detected by Snyk.io security scans.

## Activation Conditions

- User shares Snyk vulnerability reports
- Mentions CVEs/CWEs
- Asks to fix security issues in npm dependencies

## Quick Reference

| Action | Rule |
|--------|------|
| Fix direct deps | `vuln-direct-deps.md` |
| Fix transitive deps | `vuln-transitive-deps.md` |

## Workflow

### 1. Assess

- Parse vulnerability report: package, version, CVE/CWE, severity, fixed version
- Categorize as **direct** (in package.json) or **transitive** (pulled in by another package)

### 2. Explore

- Check `package.json` for current versions and existing overrides
- Check lockfile for actual resolved versions
- Search source code for direct usage of vulnerable package
- Check npm registry for available fixed versions: `npm view <package> versions --json`

### 3. Fix

See rules for specific fix patterns.

### 4. Verify

```bash
bun i --yarn
bun run type:check
bun run lint
bun run build
bun run test
```

All must pass.

## Tips

- Use exact versions for security fixes (no `^` prefix)
- Fix Critical/High severity first
- Replace unmaintained packages rather than patching
- Document workarounds with comments explaining why

## Rules

See `rules/` directory for detailed guidance.
