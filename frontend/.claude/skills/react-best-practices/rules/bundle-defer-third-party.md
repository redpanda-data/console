---
title: Defer Non-Critical Third-Party Libraries
impact: MEDIUM
impactDescription: loads after initial render
tags: bundle, third-party, analytics, defer
---

## Defer Non-Critical Third-Party Libraries

Analytics, logging, and error tracking don't block user interaction. Load them after initial render.

**Incorrect (blocks initial bundle):**

```tsx
import { Analytics } from '@some-vendor/analytics'

export function App({ children }) {
  return (
    <div>
      {children}
      <Analytics />
    </div>
  )
}
```

**Correct (loads after initial render):**

```tsx
import { lazy, Suspense } from 'react'

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
