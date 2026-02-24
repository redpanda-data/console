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
import { GetShadowLinkRequestSchema } from 'protogen/redpanda/api/dataplane/v1/shadowlink_pb';
import { getShadowLink } from 'protogen/redpanda/api/dataplane/v1/shadowlink-ShadowLinkService_connectquery';

import { ShadowLinkDetailsPage } from '../../../components/pages/shadowlinks/details/shadowlink-details-page';

function ShadowLinkNotFound() {
  const { name } = useParams({ from: '/shadowlinks/$name/' });
  return (
    <NotFoundContent
      backLink="/shadowlinks"
      backLinkText="Back to Shadow Links"
      resourceId={name}
      resourceType="Shadow Link"
    />
  );
}

export const Route = createFileRoute('/shadowlinks/$name/')({
  staticData: {
    title: 'Shadow Link Details',
  },
  loader: async ({ context: { queryClient, dataplaneTransport }, params: { name } }) => {
    try {
      await queryClient.ensureQueryData(
        createQueryOptions(getShadowLink, create(GetShadowLinkRequestSchema, { name }), {
          transport: dataplaneTransport,
        })
      );
    } catch (error) {
      if (error instanceof ConnectError && error.code === Code.NotFound) {
        throw notFound();
      }
      throw error;
    }
  },
  notFoundComponent: ShadowLinkNotFound,
  component: ShadowLinkDetailsPage,
});
