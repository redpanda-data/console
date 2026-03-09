import { useLocalStorage } from '@redpanda-data/ui';
import { useEffect } from 'react';

const useDeveloperView = (): boolean => {
  const [developerView, setDeveloperView] = useLocalStorage('dv', false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '?') {
        setDeveloperView((prev) => !prev);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setDeveloperView]);

  return developerView;
};

// non-hook version
export const runDeveloperView = (): boolean => {
  let developerView = false;

  try {
    const storedViewSetting = window.localStorage.getItem('dv');
    developerView = storedViewSetting ? JSON.parse(storedViewSetting) : false;
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error(error);
  }

  const onDown = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() === '?' && process.env.NODE_ENV !== 'production') {
      window.localStorage.setItem('dv', JSON.stringify(!developerView));
    }
  };

  window.addEventListener('keydown', onDown);

  return developerView;
};

export default useDeveloperView;
