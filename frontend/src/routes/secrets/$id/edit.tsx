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
import { Code, ConnectError } from '@connectrpc/connect';
import { createQueryOptions } from '@connectrpc/connect-query';
import { createFileRoute, notFound, useParams } from '@tanstack/react-router';
import { NotFoundContent } from 'components/misc/not-found-content';
import { GetSecretRequestSchema } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { getSecret } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import { GetSecretRequestSchema as GetSecretRequestSchemaDataPlane } from 'protogen/redpanda/api/dataplane/v1/secret_pb';

import { SecretEditPage } from '../../../components/pages/secrets-store/edit/secret-edit-page';

function SecretNotFound() {
  const { id } = useParams({ from: '/secrets/$id/edit' });
  return (
    <NotFoundContent backLink="/secrets" backLinkText="Back to Secrets Store" resourceId={id} resourceType="Secret" />
  );
}

export const Route = createFileRoute('/secrets/$id/edit')({
  staticData: {
    title: 'Edit Secret',
  },
  loader: async ({ context: { queryClient, dataplaneTransport }, params: { id } }) => {
    try {
      const getSecretRequestDataPlane = create(GetSecretRequestSchemaDataPlane, { id });
      const getSecretRequest = create(GetSecretRequestSchema, { request: getSecretRequestDataPlane });
      await queryClient.ensureQueryData(
        createQueryOptions(getSecret, getSecretRequest, { transport: dataplaneTransport })
      );
    } catch (error) {
      if (error instanceof ConnectError && error.code === Code.NotFound) {
        throw notFound();
      }
      throw error;
    }
  },
  notFoundComponent: SecretNotFound,
  component: SecretEditPage,
});
