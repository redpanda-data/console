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
};

/**
 * Renders a tool block that transitions from request → response state
 * Starts with 'input-available', updates in-place to show output when available
 */
export const ToolBlock = ({ toolCallId, toolName, state, input, output, errorText }: ToolBlockProps) => (
  <Tool defaultOpen={false} key={toolCallId}>
    <ToolHeader state={state} title={toolName || 'Tool'} type={`tool-${toolName || 'unknown'}`} />
    <ToolContent>
      <ToolInput input={input} />
      {(state === 'output-available' || state === 'output-error') && (
        <ToolOutput errorText={errorText} output={output} />
      )}
    </ToolContent>
  </Tool>
);
