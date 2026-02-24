---
title: Defer State Reads to Usage Point
impact: MEDIUM
impactDescription: avoids unnecessary subscriptions
tags: rerender, URLSearchParams, localStorage, optimization
---

## Defer State Reads to Usage Point

Don't subscribe to dynamic state (URL params, localStorage) if you only read it inside callbacks.

**Incorrect (subscribes to URL param changes, re-renders on every change):**

```tsx
function ShareButton({ chatId }: { chatId: string }) {
  // Reading URL params at render time creates a subscription
  const ref = new URLSearchParams(window.location.search).get('ref')

  const handleShare = () => {
    shareChat(chatId, { ref })
  }

  return <button onClick={handleShare}>Share</button>
}
```

**Correct (reads on demand inside callback, no subscription):**

```tsx
function ShareButton({ chatId }: { chatId: string }) {
  const handleShare = () => {
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    shareChat(chatId, { ref })
  }

  return <button onClick={handleShare}>Share</button>
}
```

Same principle applies to localStorage, sessionStorage, and cookies — read inside callbacks rather than at render time.
