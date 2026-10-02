# Copilot instructions: Redpanda Console

Go backend (`backend/`) + React 19 SPA (`frontend/`) sharing a protobuf contract (`proto/`).
Task drives builds from the repository root.

## Where the rules live

Area rules are **not** repeated here. They live in `AGENTS.md` files and the nearest one to a
changed file wins:

| Path | Governing file |
|---|---|
| `backend/**` | `backend/AGENTS.md` |
| `frontend/**` | `frontend/AGENTS.md` |
| `proto/**`, root config, `taskfiles/**` | `AGENTS.md` |
| commits, PR description, review conduct | this file |

When a review comment enforces an area rule, name the file it came from so the author can
read the rule in context.

## Commit messages

Format is `area[/detail]: short description`.

example:
```
backend: resolve schema IDs in the topic's registry context

Before this change the message viewer always looked schemas up in the
default context, so a topic bound to a named context returned a decode
error. Resolution now takes the topic's context, which also removes the
special case in the sample handler.
```

- Subject: 50 characters or fewer, lowercase after the prefix, no trailing period.
- Common areas: `backend`, `frontend`, `proto`, `topics`, `chore`, `deps`.
- Body: wrap at 72 columns. Explain **why**, not what: the state being moved away from, why
  it is no longer wanted, and how the new state addresses that. Then any non-obvious
  technical detail.
- A commit message must stand alone. No "in the previous commit", no references to meetings
  or threads. That context goes in the PR description.
- One logical change per commit, and every commit must build on its own so `git bisect`
  works.

Parts of the history use Conventional Commits (`feat(frontend): ...`). `area:` is the
documented standard in `CONTRIBUTING.md` and the form to use for new work.

## Pull requests

- Title follows the same `area: description` convention.
- The description carries the high-level narrative that individual commits must not depend
  on, plus examples of what's being added.
- Fold review fixups back into the commits they modify before merge. Do not leave
  "address review feedback" commits in the final history.
- `git rebase --keep-base` keeps the diff for reviewers minimal on a force-push.
- Call out explicitly when a change touches `backend/pkg/api/hooks.go` or `proto/`. Those are
  the contract surfaces `console-enterprise` builds on, and a signature change there breaks
  it. (`backend/pkg/api/hooks/` is a stale duplicate that nothing imports.)

## Comments

Repo-wide: keep comments to a minimum. Less is more. Full rules in
[backend/AGENTS.md](../backend/AGENTS.md#comments).

- Comment the **why**, never the what. A non-obvious constraint, a protocol quirk, a
  deliberate deviation. Not `// increment the offset` above `offset++`.
- Doc comments on exported Go identifiers are mandatory (`revive` runs with all rules on) and
  are the exception to this, not a license to annotate everything.
- No banner comments, no commented-out code, no comments that exist to describe what the diff
  changed. That belongs in the commit message.
- `TODO`/`FIXME` must name a ticket or an owner.
- Prefer a better name or a small extracted function over a paragraph explaining the code.

When reviewing, flag added comments that restate the code and suggest deleting them. This is
the most common form of bloat in AI-assisted pull requests.

## Review priorities

In order:

1. **Correctness.** Wrong behavior, unhandled errors, swallowed errors, nil dereferences,
   races, resource leaks, missing `ctx` propagation.
2. **The area rules** in the relevant `AGENTS.md`, especially the "Hard rules" section of
   `backend/AGENTS.md` and the "Critical Rules" of `frontend/AGENTS.md`.
3. **Contract and compatibility.** Proto changes that are not wire-compatible, hook signature
   changes, API version placement, generated output not regenerated.
4. **Tests.** New behavior needs a test. Backend prefers table-driven with `t.Run`; frontend
   splits `.test.ts` (unit, node) from `.test.tsx` (integration, happy-dom).
5. **Noise.** Comments that restate the code, commented-out code, and dead scaffolding. See
   Comments above.

## Do not flag

- Anything under a generated or vendored path: `backend/pkg/protogen/`,
  `frontend/src/protogen/`, `frontend/src/routeTree.gen.ts`,
  `frontend/src/components/redpanda-ui/`, `build/`. Changes there are either generated output
  or upstream registry content.
- Formatting and style nits already enforced by tooling. `golangci-lint` 2.10 (37 linters,
  `revive` with all rules on, `sloglint`, `gci`) and Biome/Ultracite gate those in CI, and a
  duplicate review comment adds noise without adding information.
- Line length, import order, or trailing whitespace. The formatters own those.

## What CI enforces

| Workflow | Gate |
|---|---|
| `backend-lint-test.yml` | `golangci-lint` + unit and integration tests |
| `frontend-verify.yml` | Biome/Ultracite (with a dirty-tree check), `ultracite doctor`, type check, build, tests |
| `buf.yml` | proto lint, format, and breaking-change detection |
| `proto-generate.yml` | fails if generated proto output is not committed |
| `frontend-react-doctor.yml` | React Doctor on frontend changes |
| `frontend-ui-audit.yml` | advisory only: registry drift, off-token colors, ad-hoc utility classes |
| `repository-dispatch.yml` | triggers the `console-enterprise` build after verify |

Prefer pointing at the gate that will catch an issue over restating what the gate already
says.
