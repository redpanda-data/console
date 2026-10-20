import { expect, rs, test } from '@rstest/core';

const { cleanup, authenticate, close, storageState } = rs.hoisted(() => ({
  cleanup: rs.fn(),
  authenticate: rs.fn(),
  close: rs.fn(),
  storageState: rs.fn(),
}));
rs.mock('./shared/global-setup.mjs', () => ({ default: async () => cleanup }));
rs.mock('./test-variant-console-enterprise/auth.setup', () => ({ authenticate }));
rs.mock('playwright', () => ({
  chromium: { launch: async () => ({ newPage: async () => ({ context: () => ({ storageState }) }), close }) },
}));

import setup from './test-variant-console-enterprise/rstest-global-setup';

test('enterprise setup preserves authentication and teardown failures', async () => {
  const authenticationError = new Error('Login failed');
  const teardownError = new Error('Container cleanup failed');
  authenticate.mockRejectedValueOnce(authenticationError);
  cleanup.mockRejectedValueOnce(teardownError);
  await expect(setup()).rejects.toMatchObject({ errors: [authenticationError, teardownError] });
  expect(close).toHaveBeenCalledTimes(1);
  expect(cleanup).toHaveBeenCalledTimes(1);
});

test('enterprise setup publishes authenticated storage before starting tests', async () => {
  const teardown = await setup();
  expect(storageState).toHaveBeenCalledWith({ path: 'playwright/.auth/user.json' });
  await teardown();
});
