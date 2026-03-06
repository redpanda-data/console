import { useKey, useLocalStorage } from '@redpanda-data/ui';
import { IsDev } from 'utils/env';

const useDeveloperView = (): boolean => {
  const [developerView, setDeveloperView] = useLocalStorage('dv', false);
  useKey('?', () => {
    if (IsDev) {
      setDeveloperView(!developerView);
    }
  });
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

  if (IsDev) {
    const onDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === '?') {
        window.localStorage.setItem('dv', JSON.stringify(!developerView));
      }
    };

    window.addEventListener('keydown', onDown);
  }

  return developerView;
};

export default useDeveloperView;
