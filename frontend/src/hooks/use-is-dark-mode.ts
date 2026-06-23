import { useSyncExternalStore } from 'react';

// Tracks the registry `.dark` class on the document root — the source of truth
// the redpanda-ui CSS variables theme off. Lets components that can't read it
// from CSS (e.g. the Sonner toaster, which themes via a JS prop) stay in
// lockstep with the rest of the surface instead of following the OS.
function subscribe(onStoreChange: () => void): () => void {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains('dark');
}

export function useIsDarkMode(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
