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
import { ShieldIcon } from 'components/icons';
import { ListShadowLinksRequestSchema } from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import { listShadowLinks } from 'protogen/redpanda/api/console/v1alpha1/shadowlink-ShadowLinkService_connectquery';

import { ShadowLinkListPage } from '../../components/pages/shadowlinks/list/shadowlink-list-page';

export const Route = createFileRoute('/shadowlinks/')({
  staticData: {
    title: 'Shadow Links',
    icon: ShieldIcon,
  },
  loader: async ({ context: { queryClient, dataplaneTransport } }) => {
    await queryClient.ensureQueryData(
      createQueryOptions(listShadowLinks, create(ListShadowLinksRequestSchema, {}), { transport: dataplaneTransport })
    );
  },
  component: ShadowLinkListPage,
});
