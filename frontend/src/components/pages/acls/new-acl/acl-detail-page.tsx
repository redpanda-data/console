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
import { uiState } from 'state/uiState';
import { useGetAclsByPrincipal } from '../../../../react-query/api/acl';
import { Button } from '../../../redpanda-ui/components/button';
import { Text } from '../../../redpanda-ui/components/typography';
import { handleUrlWithHost } from './ACL.model';
import { ACLDetails } from './ACLDetails';
import { HostSelector } from './HostSelector';

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

  if (!acls || !data) {
    return <div>No ACL data found</div>;
  }

  if (!!hosts && hosts.length > 0) {
    return <HostSelector principalName={aclName} hosts={data} baseUrl={`/security/acls/${aclName}/details`} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Text>
          ACL Configuration Details for <strong>{aclName}</strong>
        </Text>
        <Button
          onClick={() => navigate(handleUrlWithHost(`/security/acls/${aclName}/update`, host))}
          data-testid="update-acl-button"
          variant="secondary"
        >
          <Pencil className="w-4 h-4 mr-2" />
          Edit
        </Button>
      </div>
      <ACLDetails sharedConfig={acls.sharedConfig} rules={acls.rules} isSimpleView={false} />
    </div>
  );
};

export default AclDetailPage;
