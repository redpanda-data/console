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

import { durationMs, timestampDate } from '@bufbuild/protobuf/wkt';
import { Badge } from 'components/redpanda-ui/components/badge';
import {
  type TranscriptStatus,
  TranscriptStatus as TranscriptStatusEnum,
  TranscriptTurnRole,
  type TranscriptTurnRole as TranscriptTurnRoleType,
} from 'protogen/redpanda/api/dataplane/v1alpha3/transcript_pb';
import { prettyMilliseconds } from 'utils/utils';

export const formatTranscriptDateTime = (value?: Parameters<typeof timestampDate>[0]) => {
  if (!value) {
    return 'N/A';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestampDate(value));
};

export const formatTranscriptDuration = (value?: Parameters<typeof durationMs>[0]) => {
  if (!value) {
    return 'N/A';
  }

  return prettyMilliseconds(durationMs(value), {
    compact: true,
    secondsDecimalDigits: 0,
  });
};

export const formatTranscriptTokens = (count?: number | bigint) => {
  if (count === undefined || count === null) {
    return '0';
  }

  return Number(count).toLocaleString('en-US');
};

export const transcriptRoleLabel = (role: TranscriptTurnRoleType) => {
  switch (role) {
    case TranscriptTurnRole.SYSTEM:
      return 'System';
    case TranscriptTurnRole.USER:
      return 'User';
    case TranscriptTurnRole.ASSISTANT:
      return 'Assistant';
    case TranscriptTurnRole.TOOL:
      return 'Tool';
    default:
      return 'Unknown';
  }
};

export const TranscriptStatusBadge = ({ status }: { status: TranscriptStatus }) => {
  switch (status) {
    case TranscriptStatusEnum.COMPLETED:
      return <Badge variant="success-inverted">Completed</Badge>;
    case TranscriptStatusEnum.ERROR:
      return <Badge variant="destructive-inverted">Error</Badge>;
    case TranscriptStatusEnum.RUNNING:
      return <Badge variant="info-inverted">Running</Badge>;
    default:
      return <Badge variant="neutral">Unknown</Badge>;
  }
};
