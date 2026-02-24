---
title: Code Splitting and Lazy Loading
impact: CRITICAL
impactDescription: directly affects TTI and LCP
tags: bundle, dynamic-import, code-splitting, react-lazy, conditional-loading
---

## Code Splitting and Lazy Loading

Use `React.lazy` with `Suspense` to lazy-load large components not needed on initial render. Load large data modules conditionally. Defer non-critical third-party libraries.

### Dynamic Imports for Heavy Components

**Incorrect (Monaco bundles with main chunk ~300KB):**

```tsx
import { MonacoEditor } from './monaco-editor'
```

**Correct (Monaco loads on demand):**

```tsx
import { lazy, Suspense } from 'react'

const MonacoEditor = lazy(() =>
  import('./monaco-editor').then(m => ({ default: m.MonacoEditor }))
)

function CodePanel({ code }: { code: string }) {
  return (
    <Suspense fallback={<div>Loading editor...</div>}>
      <MonacoEditor value={code} />
    </Suspense>
  )
}
```

### Conditional Module Loading

Load large data or modules only when a feature is activated:

```tsx
function AnimationPlayer({ enabled, setEnabled }: Props) {
  const [frames, setFrames] = useState<Frame[] | null>(null)

  useEffect(() => {
    if (enabled && !frames) {
      import('./animation-frames.js')
        .then(mod => setFrames(mod.frames))
        .catch(() => setEnabled(false))
    }
  }, [enabled, frames, setEnabled])

  if (!frames) return <Skeleton />
  return <Canvas frames={frames} />
}
```

### Defer Non-Critical Third-Party Libraries

Analytics, logging, and error tracking don't block user interaction:

```tsx
const Analytics = lazy(() =>
  import('@some-vendor/analytics').then(m => ({ default: m.Analytics }))
)

export function App({ children }) {
  return (
    <div>
      {children}
      <Suspense fallback={null}>
        <Analytics />
      </Suspense>
    </div>
  )
}
```
