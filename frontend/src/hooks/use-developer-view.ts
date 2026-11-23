import { useEffect, useState } from 'react';

const IS_DEV = process.env.NODE_ENV !== 'production';
const STORAGE_KEY = 'dv';
const TYPING_TARGET = 'input, textarea, select, [contenteditable], [role="textbox"], [role="combobox"]';

const readStored = () => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'true';
  } catch {
    return false;
  }
};

/** `?` toggles the developer view; the choice persists so a reload keeps it. */
const useDeveloperViewDev = () => {
  const [developerView, setDeveloperView] = useState(readStored);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
        } catch {}
        return next;
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return developerView;
};

const useDeveloperViewProd = () => useState(readStored)[0];

const useDeveloperView = IS_DEV ? useDeveloperViewDev : useDeveloperViewProd;

export default useDeveloperView;
