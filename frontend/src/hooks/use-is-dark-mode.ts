import { useSyncExternalStore } from 'react';

// Tracks the dark theme on the document root — the source of truth the
// redpanda-ui CSS variables theme off. Lets components that can't read it
// from CSS (e.g. the Sonner toaster, which themes via a JS prop) stay in
// lockstep with the rest of the surface instead of following the OS.
//
// Both signals, because registry theme.css keys on `[data-theme='dark'], .dark`
// and calls the class a compatibility selector due to be dropped — watching
// only `class` would go quiet the moment a host moves to the attribute.
function subscribe(onStoreChange: () => void): () => void {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  return () => observer.disconnect();
}

function getSnapshot(): boolean {
  const root = document.documentElement;
  return root.dataset.theme === 'dark' || root.classList.contains('dark');
}

export function useIsDarkMode(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
