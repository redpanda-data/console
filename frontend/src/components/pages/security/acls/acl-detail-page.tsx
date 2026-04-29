/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { getRouteApi, useNavigate } from '@tanstack/react-router';

const routeApi = getRouteApi('/security/acls/$aclName/details');

import { Pencil } from 'lucide-react';

import { HostSelector } from './host-selector';
import { useGetAclsByPrincipal } from '../../../../react-query/api/acl';
import { Button } from '../../../redpanda-ui/components/button';
import { Text } from '../../../redpanda-ui/components/typography';
import { useSecurityBreadcrumbs } from '../hooks/use-security-breadcrumbs';
import { ACLDetails } from '../shared/acl-details';
import { parsePrincipalFromParam } from '../shared/principal-utils';

const AclDetailPage = () => {
  const { aclName } = routeApi.useParams();
  const navigate = useNavigate({ from: '/security/acls/$aclName/details' });
  const search = routeApi.useSearch();
  const host = search.host || undefined;

  const { principalType, principalName } = parsePrincipalFromParam(aclName);
  const { data, isLoading } = useGetAclsByPrincipal(`${principalType}:${principalName}`, host);

  const [acls, ...hosts] = data || [];

  useSecurityBreadcrumbs([
    { title: 'ACLs', linkTo: '/security/acls' },
    { title: principalName, linkTo: `/security/acls/${aclName}/details` },
  ]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!(acls && data)) {
    return <div>No ACL data found</div>;
  }

  if (hosts.length > 0) {
    return <HostSelector baseUrl={`/security/acls/${aclName}/details`} hosts={data} principalName={principalName} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="pt-4 pb-3 font-semibold text-xl">ACL: {principalName}</h2>
      <div className="flex items-center justify-between">
        <Text>Configuration details</Text>
        <Button
          data-testid="update-acl-button"
          onClick={() =>
            navigate({
              to: `/security/acls/${aclName}/update`,
              search: { host },
            })
          }
          variant="outline"
        >
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </Button>
      </div>
      <ACLDetails isSimpleView={false} rules={acls.rules} sharedConfig={acls.sharedConfig} />
    </div>
  );
};

export default AclDetailPage;
