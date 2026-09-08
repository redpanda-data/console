import { useEffect, useState } from 'react';

const IS_DEV = process.env.NODE_ENV !== 'production';
const STORAGE_KEY = 'dv';
// Where `?` is a character being typed, not a shortcut.
const TYPING_TARGET = 'input, textarea, select, [contenteditable], [role="textbox"], [role="combobox"]';

const readStored = (): boolean => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'true';
  } catch {
    return false;
  }
};

/** `?` toggles the developer view; the choice persists so a reload keeps it. */
const useDeveloperViewDev = (): boolean => {
  const [developerView, setDeveloperView] = useState(readStored);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Not while typing, not on key repeat, and not as part of a shortcut.
      const target = event.target instanceof HTMLElement ? event.target : null;
      const isEditable = Boolean(target?.isContentEditable || target?.closest(TYPING_TARGET));
      if (
        event.key !== '?' ||
        event.repeat ||
        event.defaultPrevented ||
        event.isComposing ||
        isEditable ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
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
