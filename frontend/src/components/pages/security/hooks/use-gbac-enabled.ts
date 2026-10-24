import { useApiStoreHook } from '../../../../state/backend-api';

/** Whether group-based access control is licensed and enabled, so groups can be principals. */
export function useGbacEnabled() {
  return useApiStoreHook((s) => s.enterpriseFeaturesUsed.some((f) => f.name === 'gbac' && f.enabled));
}
