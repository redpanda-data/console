import { useQuery } from '@connectrpc/connect-query';

import { listACLs } from '../../../../protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';

/** Whether any ACL names this principal (such as `User:alice`) directly. */
export function usePrincipalHasAcls(principal: string, enabled: boolean) {
  const { data } = useQuery(
    listACLs,
    { filter: { principal } },
    { enabled, select: (response) => response.resources.length > 0 }
  );
  return data === true;
}
