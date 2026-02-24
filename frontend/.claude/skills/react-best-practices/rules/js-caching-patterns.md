---
title: Client-Side Caching Patterns
impact: MEDIUM
impactDescription: reduces redundant computation and expensive I/O
tags: javascript, cache, memoization, localStorage, storage, performance
---

## Client-Side Caching Patterns

### Cache Repeated Function Calls

Use a module-level Map to cache function results when the same function is called repeatedly with the same inputs.

```typescript
const slugifyCache = new Map<string, string>()

function cachedSlugify(text: string): string {
  if (slugifyCache.has(text)) return slugifyCache.get(text)!
  const result = slugify(text)
  slugifyCache.set(text, result)
  return result
}
```

Use a Map (not a hook) so it works everywhere: utilities, event handlers, not just React components.

### Cache Storage API Calls

`localStorage`, `sessionStorage`, and `document.cookie` are synchronous and expensive. Cache reads in memory:

```typescript
const storageCache = new Map<string, string | null>()

function getLocalStorage(key: string) {
  if (!storageCache.has(key)) {
    storageCache.set(key, localStorage.getItem(key))
  }
  return storageCache.get(key)
}

function setLocalStorage(key: string, value: string) {
  localStorage.setItem(key, value)
  storageCache.set(key, value)
}
```

Invalidate on external changes:

```typescript
window.addEventListener('storage', (e) => {
  if (e.key) storageCache.delete(e.key)
})
```

### Version localStorage Data

Add version prefix to keys and store only needed fields:

```typescript
const VERSION = 'v2'

function saveConfig(config: { theme: string; language: string }) {
  try {
    localStorage.setItem(`userConfig:${VERSION}`, JSON.stringify(config))
  } catch {
    // Throws in incognito, quota exceeded, or disabled
  }
}
```

Always wrap `getItem()`/`setItem()` in try-catch — they throw in incognito/private browsing (Safari, Firefox).

## Reference

- [How we made the Vercel Dashboard twice as fast](https://vercel.com/blog/how-we-made-the-vercel-dashboard-twice-as-fast)
