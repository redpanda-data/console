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

import { Pencil } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { uiState } from 'state/ui-state';

import { handleUrlWithHost } from './acl.model';
import { ACLDetails } from './acl-details';
import { HostSelector } from './host-selector';
import { useGetAclsByPrincipal } from '../../../../react-query/api/acl';
import { Button } from '../../../redpanda-ui/components/button';
import { Text } from '../../../redpanda-ui/components/typography';

const AclDetailPage = () => {
  const { aclName = '' } = useParams<{ aclName: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const host = searchParams.get('host') || undefined;

  const { data, isLoading } = useGetAclsByPrincipal(`User:${aclName}`, host);

  const [acls, ...hosts] = data || [];

  useEffect(() => {
    uiState.pageBreadcrumbs = [
      { title: 'Security', linkTo: '/security' },
      { title: 'ACLs', linkTo: '/security/acls' },
      { title: aclName, linkTo: `/security/acls/${aclName}/details` },
      { title: 'ACL Configuration Details', linkTo: '', heading: '' },
    ];
  }, [aclName]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!(acls && data)) {
    return <div>No ACL data found</div>;
  }

  if (!!hosts && hosts.length > 0) {
    return <HostSelector baseUrl={`/security/acls/${aclName}/details`} hosts={data} principalName={aclName} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Text>
          ACL Configuration Details for <strong>{aclName}</strong>
        </Text>
        <Button
          data-testid="update-acl-button"
          onClick={() => navigate(handleUrlWithHost(`/security/acls/${aclName}/update`, host))}
          variant="secondary"
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
