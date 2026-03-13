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

export default useDeveloperView;
