import { getUserTagEntries } from './constants';
import { expect, test } from 'bun:test';

test('omits cloud-managed and internal tags from the user-visible entries', () => {
  expect(
    getUserTagEntries({
      rp_cloud_service_account_id: 'service-account',
      rp_cloud_secret_id: 'secret',
      __internal: 'internal',
      _custom: 'example',
      env: 'production',
    })
  ).toEqual([
    { key: '_custom', value: 'example' },
    { key: 'env', value: 'production' },
  ]);
});
