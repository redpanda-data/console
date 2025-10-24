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

import { useEffect, useState } from 'react';
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from 'components/ai-elements/tool';

type ToolBlockProps = {
  toolCallId: string;
  toolName: string;
  state: 'input-available' | 'output-available' | 'output-error';
  input: unknown;
  output?: unknown;
  errorText?: string;
  timestamp: Date;
  messageId?: string;
  isLastBlock: boolean;
};

/**
 * Renders a tool block that transitions from request → response state
 * Spawns open initially, then syncs with isLastBlock (open when last, closed when not)
 * User can manually toggle, but isLastBlock changes override manual state
 */
export const ToolBlock = ({ toolCallId, toolName, state, input, output, errorText, isLastBlock }: ToolBlockProps) => {
  // Always spawn open
  const [isOpen, setIsOpen] = useState(true);

  // Sync with isLastBlock changes
  useEffect(() => {
    setIsOpen(isLastBlock);
  }, [isLastBlock]);

  return (
    <Tool key={toolCallId} onOpenChange={setIsOpen} open={isOpen}>
      <ToolHeader
        state={state}
        title={toolName || 'Tool'}
        toolCallId={toolCallId}
        type={`tool-${toolName || 'unknown'}`}
      />
      <ToolContent>
        <ToolInput input={input} />
        {(state === 'output-available' || state === 'output-error') && (
          <ToolOutput errorText={errorText} output={output} />
        )}
      </ToolContent>
    </Tool>
  );
};
