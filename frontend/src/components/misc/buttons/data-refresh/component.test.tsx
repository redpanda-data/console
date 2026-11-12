import { afterEach, expect, rs, test } from '@rstest/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { DataRefreshButton } from './component';
import { appGlobal } from '../../../../state/app-global';
import { reportActionError } from '../../../../utils/toast.utils';

rs.mock('../../../../state/backend-api', () => ({ api: { activeRequests: [] }, REST_CACHE_DURATION_SEC: 20 }));
rs.mock('../../../../utils/toast.utils', () => ({ reportActionError: rs.fn() }));
const originalRefresh = appGlobal.onRefresh;
afterEach(() => {
  appGlobal.onRefresh = originalRefresh;
  rs.mocked(reportActionError).mockClear();
});

test.each(['throw', 'reject'] as const)(
  'reports a refresh failure from the current page callback: %s',
  async (mode) => {
    appGlobal.onRefresh = rs.fn();
    render(<DataRefreshButton />);
    const failure = new Error('Refresh failed');
    // Navigation may replace the page callback without remounting the header.
    appGlobal.onRefresh = () => {
      if (mode === 'throw') {
        throw failure;
      }
      return Promise.reject(failure);
    };
    fireEvent.click(screen.getByRole('button', { name: 'Force refresh' }));
    await waitFor(() => expect(reportActionError).toHaveBeenCalledWith(failure));
    expect(reportActionError).toHaveBeenCalledTimes(1);
  }
);
