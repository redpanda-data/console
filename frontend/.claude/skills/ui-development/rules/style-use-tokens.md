---
title: Use Theme Tokens, Not Raw Colours or Stock Text Sizes
impact: HIGH
impactDescription: Raw palette classes ignore the theme and break dark mode; stock text sizes bypass the type scale
tags: styling, tokens, colour, typography, design-system, theme
---

# Use Theme Tokens (HIGH)

## Explanation

Registry v3 (`src/components/redpanda-ui/style/theme.css`) declares ~160 semantic colour tokens and a
named type scale. Every colour and every font size in app code should come from those. Two reasons this
is not merely stylistic:

1. **Raw palette classes don't flip.** `bg-gray-100` is the same grey in dark mode; a token is not.
2. **v2 token names now compile to nothing.** A removed name produces no CSS at all — no error, no
   warning, just a colour that stops painting. `text-error` is silently invisible; `text-destructive` works.

## Colour: five roles per tone

For a tone `T` (`destructive`, `warning`, `success`, `informative`, `primary`, `secondary`, `brand`):

| Role | Token | Use for |
|------|-------|---------|
| ink | `T` | text and icons on the page |
| wash | `T-wash` (+ `-pressed`) | the one soft tinted ground |
| line | `T-line` (+ `-hover`, `-pressed`) | borders |
| indicator | `T-strong` | dots, progress, saturated marks |
| fill | `surface-T` (+ `-hover`, `-pressed`) | a solid ground you put ink on |

`primary` / `secondary` / `brand` fill from the **bare** token with `T-foreground` as ink.
`destructive` / `warning` / `success` / `informative` are **ink only** and fill from `surface-T`.

Neutrals: `strong` › `foreground` › `subtle` › `disabled` for ink; `page`, `background`, `card`,
`surface-subtle`, `surface-strong`, `surface-recess` for grounds; `border`, `border-subtle`,
`border-strong` (+ `-hover`, `-pressed`) for lines. `accent` is the one row/menu hover wash.
`selected` / `selected-wash` for selection. `static-dark` / `static-light` for grounds that must
**not** flip between themes (each with its own `-foreground`).

## Incorrect

```tsx
<p className="text-gray-600">Secondary copy</p>
<div className="bg-gray-50 border border-gray-200">Panel</div>
<span className="text-red-600">Failed</span>
<div className="bg-white dark:bg-gray-900">Card</div>
<div className="bg-[#F7FAFC] hover:bg-[#F7FAFC]">Row</div>
<span className="text-error">Denied</span>          {/* v2 name — compiles to nothing */}
<div className="bg-surface-default">Page</div>       {/* v2 name — compiles to nothing */}
```

## Correct

```tsx
<p className="text-subtle">Secondary copy</p>
<div className="bg-surface-subtle border">Panel</div>
<span className="text-destructive">Failed</span>
<div className="bg-card">Card</div>                  {/* flips on its own — no dark: needed */}
<div className="hover:bg-accent">Row</div>
<span className="text-destructive">Denied</span>
<div className="bg-background">Page</div>
```

A token that flips per theme needs **no** `dark:` variant. Reach for `dark:` only when the two themes
genuinely need different *roles*, not different values of the same role.

## Typography: use the named scale

Stock Tailwind sizes still compile, so nothing fails — but they skip the scale's line-height, weight
and tracking. Same pixel sizes, so these are drop-in:

| Instead of | Use | Size |
|-----------|-----|------|
| `text-xs` | `text-body-sm` | 12px |
| `text-sm` | `text-body` | 14px (the anchor) |
| `text-base` | `text-body-lg` | 16px |
| `text-lg` | `text-heading-md` or `text-lead` | 18px |
| `text-xl` | `text-heading-lg` | 20px |
| `text-2xl` | `text-heading-xl` | 24px |

`text-heading-*` also set `font-family: var(--font-display)` — use them for headings, not for large
body copy or numerals (`text-lead` is the lede role; a metric value is neither).
Also available: `text-label`, `text-caption`, `text-2xs`.

**The weight trap:** every scale rung sets `font-weight` explicitly, so swapping a stock size for a
rung replaces an *inherited* weight with the rung's own (400 for body, 500 for headings). Where the
old markup relied on inheriting bold, add the weight back — `font-medium` / `font-semibold` win
because Tailwind emits the rung's weight as `var(--tw-font-weight, …)`, which a `font-*` class sets.

Don't hand-roll a rung either: `font-display font-medium text-2xl leading-none` **is**
`text-heading-xl`. Write the utility.

## Verifying

A removed token is invisible, so grep rather than trusting the eye. After any token work:

```bash
# every colour class in app code should be a token — this should print nothing
grep -rInP "(?<![-a-z0-9])(bg|text|border|ring|from|via|to|fill|stroke|divide)-((red|blue|green|indigo|gray|slate|neutral|zinc|stone|orange|yellow|purple|teal|cyan|amber|lime|emerald|sky|violet|rose|pink|fuchsia)-[0-9]+|white|black)(/[0-9]+)?(?![-a-z0-9])" src tests | grep -v redpanda-ui
```

Use `(?![-a-z0-9])` as the boundary, never `\b` — `\b` matches at a hyphen, so `bg-surface` would
false-match `bg-surface-subtle`. And sweep `tests/` too: Playwright page objects assert on class
strings (`toHaveClass(/bg-success-wash text-success/)`), and a stale assertion only fails in e2e.

## Reference

- Token source of truth: `src/components/redpanda-ui/style/theme.css`
- Override sheets are checked by `bun run theme:check` (wired into `bun run build`)
- `registry-upgrade.md` — how to pull a new registry version and migrate removed tokens
