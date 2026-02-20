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
import { BookOpenIcon } from 'components/icons';
import { ListKnowledgeBasesRequestSchema } from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { listKnowledgeBases } from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base-KnowledgeBaseService_connectquery';

import { KnowledgeBaseListPage } from '../../components/pages/knowledgebase/list/knowledge-base-list-page';

export const Route = createFileRoute('/knowledgebases/')({
  staticData: {
    title: 'Knowledge Bases',
    icon: BookOpenIcon,
  },
  loader: async ({ context: { queryClient, dataplaneTransport } }) => {
    await queryClient.ensureQueryData(
      createQueryOptions(listKnowledgeBases, create(ListKnowledgeBasesRequestSchema, {}), {
        transport: dataplaneTransport,
      })
    );
  },
  component: KnowledgeBaseListPage,
});
