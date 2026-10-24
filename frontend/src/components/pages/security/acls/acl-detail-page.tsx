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

import { getRouteApi } from '@tanstack/react-router';

const routeApi = getRouteApi('/security/acls/$aclName/details');

import { useLayoutEffect } from 'react';

import { HostSelector } from './host-selector';
import { useGetAclsByPrincipal } from '../../../../react-query/api/acl';
import { setPageHeader } from '../../../../state/ui-state';
import { Button } from '../../../redpanda-ui/components/button';
import { ACLDetails } from '../shared/acl-details';
import type { AclDetail } from '../shared/acl-model';
import { parsePrincipalFromParam } from '../shared/principal-utils';

const getAclEditHref = (aclName: string, host: string | undefined) => {
  const hostQuery = host ? `?host=${host}` : '';
  return `/security/acls/${aclName}/update${hostQuery}`;
};

type AclDetailContentProps = {
  aclName: string;
  host: string | undefined;
  principalName: string;
  /** One entry per host the principal has ACLs on. */
  data: AclDetail[];
};

const AclDetailContent = ({ aclName, host, principalName, data }: AclDetailContentProps) => {
  const [acls, ...hosts] = data;
  if (!acls) {
    return <div>No ACL data found</div>;
  }
  if (hosts.length > 0) {
    return <HostSelector baseUrl={`/security/acls/${aclName}/details`} hosts={data} principalName={principalName} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="pt-4 pb-3 text-heading-lg font-semibold">ACL: {principalName}</h2>
      <div className="text-body">Configuration details</div>
      <Button
        render={
          <a data-testid="update-acl-button" href={getAclEditHref(aclName, host)}>
            Edit
          </a>
        }
        variant="outline"
      />
      <ACLDetails isSimpleView={false} rules={acls.rules} sharedConfig={acls.sharedConfig} />
    </div>
  );
};

const AclDetailPage = () => {
  const { aclName } = routeApi.useParams();
  const host = routeApi.useSearch().host || undefined;
  const { principalType, principalName } = parsePrincipalFromParam(aclName);
  const { data, isLoading } = useGetAclsByPrincipal(`${principalType}:${principalName}`, host);

  useLayoutEffect(() => {
    setPageHeader(principalName, [
      { title: 'Security', linkTo: '/security/users' },
      { title: 'Permissions', linkTo: '/security/permissions' },
      { title: principalName, linkTo: `/security/acls/${aclName}/details` },
    ]);
  }, [principalName, aclName]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return <AclDetailContent aclName={aclName} data={data ?? []} host={host} principalName={principalName} />;
};

export default AclDetailPage;
