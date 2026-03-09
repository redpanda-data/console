import { useKey, useLocalStorage } from '@redpanda-data/ui';

const IS_DEV = process.env.NODE_ENV !== 'production';

const useDeveloperViewDev = (): boolean => {
  const [developerView, setDeveloperView] = useLocalStorage('dv', false);
  useKey('?', () => {
    setDeveloperView(!developerView);
  });
  return developerView;
};

const useDeveloperViewProd = (): boolean => {
  try {
    const stored = window.localStorage.getItem('dv');
    return stored ? JSON.parse(stored) : false;
  } catch {
    return false;
  }
};

const useDeveloperView = IS_DEV ? useDeveloperViewDev : useDeveloperViewProd;

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
