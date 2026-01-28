/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { create } from '@bufbuild/protobuf';
import { createQueryOptions } from '@connectrpc/connect-query';
import { createFileRoute } from '@tanstack/react-router';
import { KeyIcon } from 'components/icons';
import { ListSecretsRequestSchema } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { listSecrets } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import { ListSecretsRequestSchema as ListSecretsRequestSchemaDataPlane } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { MAX_PAGE_SIZE } from 'react-query/react-query.utils';

import { SecretsStoreListPage } from '../../components/pages/secrets-store/secrets-store-list-page';

export const Route = createFileRoute('/secrets/')({
  staticData: {
    title: 'Secrets Store',
    icon: KeyIcon,
  },
  loader: async ({ context: { queryClient, dataplaneTransport } }) => {
    const listSecretsRequestDataPlane = create(ListSecretsRequestSchemaDataPlane, {
      pageSize: MAX_PAGE_SIZE,
    });
    const listSecretsRequest = create(ListSecretsRequestSchema, {
      request: listSecretsRequestDataPlane,
    });
    await queryClient.ensureQueryData(
      createQueryOptions(listSecrets, listSecretsRequest, { transport: dataplaneTransport })
    );
  },
  component: SecretsStoreListPage,
});
