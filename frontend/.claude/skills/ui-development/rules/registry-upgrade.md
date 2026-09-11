---
title: Upgrading the UI Registry
impact: HIGH
impactDescription: A registry pull silently overwrites local component changes and can retire tokens without any build error
tags: registry, upgrade, tokens, sync, design-system
---

# Upgrading the UI Registry (HIGH)

## Explanation

`src/components/redpanda-ui/` is vendored from the registry — it is synced, not edited (see
`use-ui-registry.md`). An upgrade is therefore two jobs, and the second one has no safety net:
**a removed token compiles to nothing.** No error, no warning, just a colour that stops painting.

## 1. Pull only what this app installed

The item name is the vendored filename, so derive the list from disk rather than guessing:

```bash
git rev-parse HEAD > /tmp/sha; BASE=src/components/redpanda-ui
curl -fsSL https://redpanda-ui-registry.netlify.app/r/registry.json \
  | python3 -c "import json;[print(i['name']) for i in json.load(open(0))['items'] if i['type'][9:] in('ui','hook','lib')]" \
  | sort > /tmp/reg.txt
ls $BASE/components $BASE/lib | sed -E 's/\.(tsx|ts)$//' | grep -vE '^$|^__|:$|\.test$' | sort -u > /tmp/disk.txt
comm -12 /tmp/disk.txt /tmp/reg.txt > /tmp/upd.txt   # update these
comm -23 /tmp/disk.txt /tmp/reg.txt                  # not registry items → triage each one
bunx shadcn@latest add --overwrite --yes @redpanda/theme $(sed 's|^|@redpanda/|' /tmp/upd.txt | tr '\n' ' ')
```

`--yes` matters: without it the CLI stops on an interactive "install a new style?" prompt.
`sed -E` matters: BSD sed lacks `\?`. A handful of items means the pipeline failed — check before pulling.

Triage every non-item: renamed upstream (`use-copy` → `use-copy-to-clipboard`), deleted, or an
app-owned file parked in that directory. App-owned files are **not** overwritten but still need step 2.

### Check what the pull took away

The CLI overwrites whole files, so any local change to a registry component is gone. Find them first:

```bash
git grep -n '\[upstream\]' $(cat /tmp/sha) -- src/components/redpanda-ui
```

Every `[upstream]` marker is a deliberate local addition pending upstream. Re-apply each one onto the
new file and keep the marker. These are easy to miss because they fail as *behaviour*, not as a build
error — a dropped `role="button"` or a swallowed clipboard rejection typechecks perfectly.

Verify the pull landed cleanly by diffing each vendored file against the published payload
(`files[].content` / `files[].target` in each item's JSON). Anything differing beyond a leading comment
is either a local change you need to account for or a pull that didn't apply.

## 2. Migrate app code

Derive the removed set — never work from a changelog:

```bash
CSS=src/components/redpanda-ui/style/theme.css
git show $(cat /tmp/sha):./$CSS | grep -oE -- '--color-[a-z0-9-]+' | sort -u > /tmp/old.txt
grep -oE -- '--color-[a-z0-9-]+' $CSS | sort -u > /tmp/new.txt
RE=$(comm -23 /tmp/old.txt /tmp/new.txt | sed 's/--color-//' | sort -r | paste -sd'|' -)
grep -rInP "(?<![-a-z0-9])(bg|text|border|ring|from|via|to|fill|stroke|divide|shadow|outline)-($RE)(?![-a-z0-9])|--color-($RE)(?![-a-z0-9])" src tests
```

Split the removed names in two — they fail in opposite ways:

- **Not Tailwind names** (`base-*`, `grey-*`, `dark-blue-*`, `*-alpha-*`, and every semantic name):
  compile to nothing. Silent and invisible.
- **Tailwind names** (`red-*`, `blue-*`, `green-*`, `indigo-*`…) were registry *overrides*. They now
  fall through to Tailwind's own palette, so they still compile but **change hue**
  (`blue-600` `#45ade8` → `#2563eb`). Migrate these to tokens rather than re-pinning them.

Map by **role**, not by name similarity — resolve the old `var()` chain to a literal in the old
theme.css, then pick the token that plays that role now (`style-use-tokens.md`). Never re-declare a
removed name to make it work again.

Also do the same sweep for non-colour families (`--text-*`, `--radius-*`, `--border-width-*`); most
survive via Tailwind's defaults, but check rather than assume.

## Gotchas

- **Boundaries:** `(?![-a-z0-9])`, never `\b` — `\b` matches at a hyphen, so a short removed name
  (`surface`, `error`, `info`) false-matches every longer live token.
- **Sweep `tests/` too.** Playwright page objects assert on class strings; a stale assertion fails
  only in e2e, long after typecheck and lint are green.
- **Half a family fails silently.** If an override sheet sets a rest value, it must also set that
  family's `-hover` / `-pressed` / `-wash`, in **both** themes or neither. `bun run theme:check`
  enforces this; it's wired into `bun run build`. Pass `--palette <prefixes>` for app-owned scales.
- **Component API removals** typecheck-fail, so they're the easy ones — but check `Button`
  (`inverse-outline`/`inverse-ghost` → `current-*`), `DropdownMenu`, and `Sheet`.
- **Federated apps share one document.** Console is embedded in cloud-ui, so both apps' `@theme`
  blocks land on the same `:root`. Upgrading one and not the other means the host's tokens win and
  the embedded app renders with the wrong palette. **Upgrade them together.**
- **Emotion is unlayered.** Chakra (via `@redpanda-data/ui`) injects
  `*, ::before, ::after { border-color: … }` with no `@layer`, which outranks every Tailwind border
  utility. `src/globals.css` neutralises it with `[class*="border-"] { border-color: revert-layer }`;
  keep that rule identical in console and cloud-ui.

## Done when

- The removed-token sweep is empty across `src` **and** `tests`, and no removed name reappears.
- Every `[upstream]` local addition is re-applied; every non-item triaged.
- `bun run theme:check && bun run type:check && bun run lint && bun run build && bun run test`.
- Rest / hover / pressed / focus checked in **both** themes.
