import { renderHook } from '@testing-library/react';
import { act } from 'react';

import useDeveloperView from './use-developer-view';

describe('useDeveloperView', () => {
  test('does not toggle in production when pressing ?', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    window.localStorage.setItem('dv', JSON.stringify(false));

    const { result } = renderHook(() => useDeveloperView());

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
    });

    expect(result.current).toBe(false);
    expect(window.localStorage.getItem('dv')).toBe(JSON.stringify(false));

    process.env.NODE_ENV = originalEnv;
  });
});
