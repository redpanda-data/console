import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';

import { getInitialSharedConfig } from '../acls/acl-rule-editing';
import { parsePrincipal, type SharedConfig } from '../shared/acl-model';

/**
 * Adopts the principal and host props whenever they change after the first render, since route search
 * params can arrive late. Runs during render, so the form never paints with stale values.
 */
function useAdoptChangedSharedConfigProps(
  propSharedConfig: Partial<SharedConfig> | undefined,
  setSharedConfig: Dispatch<SetStateAction<SharedConfig>>
) {
  const [syncedProps, setSyncedProps] = useState({
    principal: propSharedConfig?.principal,
    host: propSharedConfig?.host,
  });
  if (syncedProps.principal !== propSharedConfig?.principal || syncedProps.host !== propSharedConfig?.host) {
    setSyncedProps({ principal: propSharedConfig?.principal, host: propSharedConfig?.host });
    if (propSharedConfig?.principal) {
      const { principal, host } = propSharedConfig;
      setSharedConfig((prev) => ({ principal, host: host ?? prev.host }));
    }
  }
}

/** Principal and host shared by every rule of the ACL form, plus the principal validation error. */
export function useAclSharedConfig(propSharedConfig: Partial<SharedConfig> | undefined, principalType?: string) {
  const [principalError, setPrincipalError] = useState<string>('');
  const [sharedConfig, setSharedConfig] = useState<SharedConfig>(() =>
    getInitialSharedConfig(propSharedConfig, principalType)
  );

  useAdoptChangedSharedConfigProps(propSharedConfig, setSharedConfig);

  useEffect(
    function clearPrincipalErrorOnTypedPrincipal() {
      if (parsePrincipal(sharedConfig.principal).type) {
        queueMicrotask(() => setPrincipalError(''));
      }
    },
    [sharedConfig.principal]
  );

  const submitIfPrincipalNamed = (submit: () => void) => {
    if (parsePrincipal(sharedConfig.principal).name) {
      submit();
    } else {
      setPrincipalError('Principal is required');
    }
  };

  return { sharedConfig, setSharedConfig, principalError, submitIfPrincipalNamed };
}
