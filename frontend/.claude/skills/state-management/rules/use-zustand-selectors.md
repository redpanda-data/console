---
title: Use Zustand Selectors
impact: CRITICAL
impactDescription: Missing selectors cause unnecessary re-renders on every store update
tags: zustand, selectors, performance, react
---

# Use Zustand Selectors (CRITICAL)

## Explanation

Always use selectors when accessing Zustand store state. Without selectors, components re-render on ANY store change, even unrelated ones. Selectors ensure components only re-render when their specific data changes.

## Incorrect

```tsx
// Subscribing to entire store - rerenders on ANY change
function Component() {
  const store = usePreferencesStore();
  return <div>{store.theme}</div>;
}

// Destructuring without selector - still subscribes to all
function Component() {
  const { theme } = usePreferencesStore();
  return <div>{theme}</div>;
}
```

## Correct

```tsx
// Selector for specific value - only rerenders when theme changes
function Component() {
  const theme = usePreferencesStore((state) => state.theme);
  return <div>{theme}</div>;
}

// Multiple selectors for multiple values
function Component() {
  const theme = usePreferencesStore((state) => state.theme);
  const sidebarCollapsed = usePreferencesStore((state) => state.sidebarCollapsed);
  return <div>{theme} - {sidebarCollapsed}</div>;
}

// Selector for computed values
function Component() {
  const isDarkMode = usePreferencesStore((state) => state.theme === 'dark');
  return <div>{isDarkMode ? 'Dark' : 'Light'}</div>;
}
```

## Actions Are Safe Without Selectors

```tsx
// Actions don't cause re-renders
function Component() {
  const setTheme = usePreferencesStore((state) => state.setTheme);
  // OR (actions are stable references)
  const { setTheme } = usePreferencesStore.getState();
}
```

## Reference

- [Zustand Auto Generating Selectors](https://docs.pmnd.rs/zustand/guides/auto-generating-selectors)
