/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { useGetAIAgentQuery } from 'react-query/api/ai-agent';
import { useParams } from 'react-router-dom';

import { AIAgentStateBadge } from './ai-agent-state-badge';
import { AIAgentToggleButton } from './ai-agent-toggle-button';

export const AIAgentDetailsHeader = () => {
  const { id } = useParams<{ id: string }>();
  const { data: aiAgentData } = useGetAIAgentQuery({ id: id || '' }, { enabled: !!id });

  if (!aiAgentData?.aiAgent) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Heading level={1}>{aiAgentData.aiAgent.displayName}</Heading>
        <AIAgentStateBadge />
        <AIAgentToggleButton />
      </div>
    </div>
  );
};
