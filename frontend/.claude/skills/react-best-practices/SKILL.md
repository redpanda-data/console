---
name: react-best-practices
description: Client-side React performance optimization patterns.
---

# React Best Practices

Client-side React optimization patterns for Cloud UI. 29 rules organized by category and impact.

## Activation Conditions

- Performance optimization tasks
- Component re-render issues
- Bundle size concerns
- useEffect/useMemo patterns

## Rules by Category

### Bundle Optimization (CRITICAL)
| Rule | Key Point |
|------|-----------|
| `bundle-barrel-imports` | Import from source files, not barrel `index.ts` |
| `bundle-code-splitting` | `React.lazy` + `Suspense` for heavy components, conditional loads, deferred 3rd-party |
| `bundle-preload` | Preload critical resources |

### Re-render Prevention (HIGH)
| Rule | Key Point |
|------|-----------|
| `rerender-memo` | Memoize expensive computations |
| `rerender-dependencies` | Minimize hook dependency arrays |
| `rerender-derived-state` | Compute during render, not in effects |
| `rerender-functional-setstate` | `setState(prev => ...)` to avoid stale closures |
| `rerender-lazy-state-init` | `useState(() => expensive())` not `useState(expensive())` |
| `rerender-simple-expression-in-memo` | Don't memoize trivial expressions |
| `rerender-transitions` | `useTransition` for non-urgent updates |
| `rerender-defer-reads` | Read URL params / storage inside callbacks, not at render |

### Rendering (MEDIUM)
| Rule | Key Point |
|------|-----------|
| `rendering-conditional-render` | Short-circuit with `&&` / ternary, avoid render in effects |
| `rendering-hoist-jsx` | Move static JSX outside components |
| `rendering-content-visibility` | CSS `content-visibility: auto` for off-screen |
| `rendering-activity` | React `<Activity>` for hidden UI |
| `rendering-animate-svg-wrapper` | Wrap animated SVGs to isolate re-renders |
| `rendering-svg-precision` | Limit SVG coordinate precision |

### Async (MEDIUM)
| Rule | Key Point |
|------|-----------|
| `async-suspense-boundaries` | Granular `<Suspense>` boundaries |
| `async-defer-await` | Don't await non-blocking work |
| `async-dependencies` | Load deps in parallel, not sequentially |

### JavaScript (MEDIUM)
| Rule | Key Point |
|------|-----------|
| `js-caching-patterns` | Module-level Map caches for repeated calls + storage reads |
| `js-batch-dom-css` | Batch DOM reads/writes to avoid layout thrashing |
| `js-index-maps` | Pre-index arrays into Maps for O(1) lookups |
| `js-length-check-first` | Check `.length` before expensive operations |
| `js-tosorted-immutable` | Use `.toSorted()` / `.toReversed()` for immutable transforms |

RegExp hoisting is enforced by Biome (`useTopLevelRegex`).

### Browser (MEDIUM)
| Rule | Key Point |
|------|-----------|
| `client-event-listeners` | Clean up event listeners in useEffect return |
| `client-passive-event-listeners` | `{ passive: true }` for scroll/touch handlers |

### Advanced (LOW)
| Rule | Key Point |
|------|-----------|
| `advanced-event-handler-refs` | Stable callback refs to avoid child re-renders |
| `advanced-use-latest` | `useLatest` pattern for always-current values in callbacks |
