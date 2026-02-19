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
import { ActivityIcon } from 'components/icons';
import { TRANSCRIPTS_PAGE_SIZE, TranscriptListPage } from 'components/pages/transcripts/transcript-list-page';
import { ListTracesRequestSchema } from 'protogen/redpanda/api/dataplane/v1alpha3/tracing_pb';
import { listTraces } from 'protogen/redpanda/api/dataplane/v1alpha3/tracing-TracingService_connectquery';

export const Route = createFileRoute('/transcripts/')({
  staticData: {
    title: 'Transcripts',
    icon: ActivityIcon,
  },
  loader: async ({ context: { queryClient, dataplaneTransport } }) => {
    await queryClient.ensureQueryData(
      createQueryOptions(listTraces, create(ListTracesRequestSchema, { pageSize: TRANSCRIPTS_PAGE_SIZE }), {
        transport: dataplaneTransport,
      })
    );
  },
  component: TranscriptListPage,
});
