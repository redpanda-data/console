import { useEffect, useState } from 'react';

const IS_DEV = process.env.NODE_ENV !== 'production';
const STORAGE_KEY = 'dv';

const readStored = (): boolean => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : false;
  } catch {
    return false;
  }
};

/** `?` toggles the developer view; the choice persists so a reload keeps it. */
const useDeveloperViewDev = (): boolean => {
  const [developerView, setDeveloperView] = useState(readStored);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Not while typing, and not as part of a shortcut.
      const target = event.target as HTMLElement | null;
      const isEditable = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
      if (event.key !== '?' || isEditable || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      setDeveloperView((previous) => {
        const next = !previous;
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Persisting is an optimisation; the toggle still applies for this session.
        }
        return next;
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return developerView;
};

// Read once at mount, not on every render of the app root — the value cannot change in prod.
const useDeveloperViewProd = (): boolean => useState(readStored)[0];

const useDeveloperView = IS_DEV ? useDeveloperViewDev : useDeveloperViewProd;

export default useDeveloperView;
