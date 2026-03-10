# Fix Snyk Security Vulnerabilities

Scan, analyze, and fix security vulnerabilities reported by Snyk for frontend/JS projects. Creates a PR with minimal, safe dependency fixes.

## Arguments
- `$ARGUMENTS` — optional: Snyk org slug, target branch, or directory to scan (defaults to auto-detect)

## Instructions

### Step 1: Discover and scan

1. Determine the current branch: `git branch --show-current`
2. Identify which frontend directories exist (e.g., `frontend/`, `webui/`, `apps/*/`)
3. Use the **Snyk CLI** as the primary tool:
   - Run `snyk test --severity-threshold=low` in each frontend directory with a `package.json`
   - If Snyk CLI cannot scan locally (e.g., unsupported lockfile), fall back to the **Snyk REST API**:
     - Auth: read OAuth token from `~/.config/configstore/snyk.json` → `INTERNAL_OAUTH_TOKEN_STORAGE` → `access_token`
     - List projects: `GET https://api.snyk.io/rest/orgs/{org_id}/projects?version=2024-10-15`
     - Query issues: `POST https://api.snyk.io/v1/org/{org_slug}/project/{project_id}/aggregated-issues`
   - If neither works, use `snyk auth` to authenticate first
4. Collect all vulnerabilities with severity, CVE, package name, version, and CVSS score

### Step 2: Analyze each vulnerability

For each issue:
1. **Trace the dependency path** — find which direct dependency pulls in the vulnerable transitive dep (check the lockfile)
2. **Check if a fix version exists** — `npm view <package> version` to see latest, cross-reference with Snyk's fix version
3. **Choose the minimal fix strategy** (in order of preference):
   - **Override** (`overrides` in package.json) — best for transitive deps; least invasive
   - **Remove** — if the package has zero imports in `src/` (dead code)
   - **Replace** — if a maintained drop-in alternative exists (e.g., webpack plugin → native rsbuild plugin)
   - **Upgrade** — only if the API surface is compatible; run type check to verify
   - **Accept** — if no fix exists upstream; document in the PR

### Step 3: Apply fixes

- **Prefer `overrides`** in package.json for transitive dependency fixes
- **Verify fix versions actually resolve the CVE** — check the Snyk vulnerability database or advisory
- When removing packages, confirm zero imports in source code first
- After changes, run `rm -rf node_modules && bun install` (or equivalent for the project's package manager) to force resolution
- Verify overrides took effect by checking installed versions in `node_modules`

### Step 4: Verify nothing is broken

Run all verification steps appropriate for the project:
1. **Type check** — `tsc --noEmit` / `tsgo --noEmit` / whatever the project uses
2. **Unit tests** — `bun run test` / `vitest run` / `jest` etc.
3. **Build** — `bun run build` / `rsbuild build` / `vite build` etc.

If an override causes a runtime or build error (e.g., a removed export), revert that specific override and note it as unfixable without an upstream library upgrade.

### Step 5: Create PR

1. Create branch: `security/fix-snyk-vulnerabilities-{branch-name}`
2. Only commit files relevant to the fix (lockfile, package.json, config files if a plugin was swapped)
3. Do NOT commit unrelated changes
4. Push and create PR with `gh pr create`:
   - Base: the target branch
   - Title: `fix: resolve Snyk security vulnerabilities`
   - Labels: `security`, `dependencies`
   - Body: include a table of all vulnerabilities with CVE, package, fix version, CVSS score, and status (fixed/not fixed with reason)

### Principles

- **Minimal changes** — security patch only, no refactors, no feature work
- **No regressions** — type check, tests, and build must all pass
- **Transparency** — every fixed and unfixed vulnerability documented in the PR
- **Use Snyk CLI first** — fall back to API only when the CLI cannot scan the project
