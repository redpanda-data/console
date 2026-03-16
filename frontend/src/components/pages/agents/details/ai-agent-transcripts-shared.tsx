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
  type AIAgentTranscriptStatus,
  AIAgentTranscriptStatus as AIAgentTranscriptStatusEnum,
  AIAgentTranscriptTurnRole,
  type AIAgentTranscriptTurnRole as AIAgentTranscriptTurnRoleType,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
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

export const transcriptRoleLabel = (role: AIAgentTranscriptTurnRoleType) => {
  switch (role) {
    case AIAgentTranscriptTurnRole.AI_AGENT_TRANSCRIPT_TURN_ROLE_SYSTEM:
      return 'System';
    case AIAgentTranscriptTurnRole.AI_AGENT_TRANSCRIPT_TURN_ROLE_USER:
      return 'User';
    case AIAgentTranscriptTurnRole.AI_AGENT_TRANSCRIPT_TURN_ROLE_ASSISTANT:
      return 'Assistant';
    case AIAgentTranscriptTurnRole.AI_AGENT_TRANSCRIPT_TURN_ROLE_TOOL:
      return 'Tool';
    default:
      return 'Unknown';
  }
};

export const TranscriptStatusBadge = ({ status }: { status: AIAgentTranscriptStatus }) => {
  switch (status) {
    case AIAgentTranscriptStatusEnum.AI_AGENT_TRANSCRIPT_STATUS_COMPLETED:
      return <Badge variant="success-inverted">Completed</Badge>;
    case AIAgentTranscriptStatusEnum.AI_AGENT_TRANSCRIPT_STATUS_ERROR:
      return <Badge variant="destructive-inverted">Error</Badge>;
    case AIAgentTranscriptStatusEnum.AI_AGENT_TRANSCRIPT_STATUS_RUNNING:
      return <Badge variant="info-inverted">Running</Badge>;
    default:
      return <Badge variant="neutral">Unknown</Badge>;
  }
};
