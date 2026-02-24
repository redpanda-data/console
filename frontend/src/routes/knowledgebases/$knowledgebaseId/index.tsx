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
import { GetKnowledgeBaseRequestSchema } from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { getKnowledgeBase } from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base-KnowledgeBaseService_connectquery';

import { KnowledgeBaseDetailsPage } from '../../../components/pages/knowledgebase/details/knowledge-base-details-page';

function KnowledgeBaseNotFound() {
  const { knowledgebaseId } = useParams({ from: '/knowledgebases/$knowledgebaseId/' });
  return (
    <NotFoundContent
      backLink="/knowledgebases"
      backLinkText="Back to Knowledge Bases"
      resourceId={knowledgebaseId}
      resourceType="Knowledge Base"
    />
  );
}

export const Route = createFileRoute('/knowledgebases/$knowledgebaseId/')({
  staticData: {
    title: 'Knowledge Base Details',
  },
  loader: async ({ context: { queryClient, dataplaneTransport }, params: { knowledgebaseId } }) => {
    try {
      await queryClient.ensureQueryData(
        createQueryOptions(getKnowledgeBase, create(GetKnowledgeBaseRequestSchema, { id: knowledgebaseId }), {
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
  notFoundComponent: KnowledgeBaseNotFound,
  component: KnowledgeBaseDetailsPage,
});
