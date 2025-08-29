/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { AIPipelineAssistant } from './AIPipelineAssistant';
import { TaskStatus } from '../../../protogen/redpanda/api/dataplane/v1alpha3/pipeline_pb';

// Mock the config module
const mockClient = {
  executePipelineTask: vi.fn(),
};

vi.mock('../../../config', () => ({
  config: {
    pipelineV1Alpha3Client: mockClient,
  },
}));

// Mock the streaming indicators component
vi.mock('./StreamingIndicators', () => ({
  StreamingIndicators: () => <div data-testid="streaming-indicators">Streaming Status</div>,
}));

// Mock react-router-dom since the component might use it indirectly
vi.mock('react-router-dom', () => ({
  ...vi.importActual('react-router-dom'),
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/' }),
}));

describe('AIPipelineAssistant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders chat interface correctly', () => {
    render(<AIPipelineAssistant />);
    
    expect(screen.getByText('AI Pipeline Assistant')).toBeInTheDocument();
    expect(screen.getByText('👋 Welcome to the AI Pipeline Assistant')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Describe your pipeline/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('has proper initial state', () => {
    const assistant = new AIPipelineAssistant({});
    
    expect(assistant.messages).toHaveLength(0);
    expect(assistant.currentStatus).toBe(TaskStatus.UNSPECIFIED);
    expect(assistant.isConnected).toBe(false);
    expect(assistant.isStreaming).toBe(false);
    expect(assistant.error).toBeNull();
    expect(assistant.tokenUsage).toBeNull();
    expect(assistant.yamlContent).toBe('');
    expect(assistant.yamlRevision).toBe(0);
  });

  it('can send message when client is available', async () => {
    const assistant = new AIPipelineAssistant({});
    const user = userEvent.setup();
    
    // Mock a simple stream that resolves immediately
    mockClient.executePipelineTask.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        // Empty iterator to avoid hanging
      },
    });
    
    render(<AIPipelineAssistant />);
    
    const input = screen.getByPlaceholderText(/Describe your pipeline/);
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    await user.type(input, 'Test message');
    await user.click(sendButton);
    
    // Check that the message was added to chat
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('properly manages component lifecycle', () => {
    const assistant = new AIPipelineAssistant({});
    
    // Test cleanup
    assistant.componentWillUnmount();
    
    // Should not throw errors
    expect(assistant.isConnected).toBe(false);
    expect(assistant.isStreaming).toBe(false);
  });

  it('can clear conversation', () => {
    const assistant = new AIPipelineAssistant({});
    
    // Add some test data
    assistant.messages.push({
      id: 'test-1',
      type: 'user',
      content: 'Test message',
      timestamp: new Date(),
    });
    assistant.error = 'Some error';
    
    // Clear conversation
    assistant.clearConversation();
    
    expect(assistant.messages).toHaveLength(0);
    expect(assistant.currentStatus).toBe(TaskStatus.UNSPECIFIED);
    expect(assistant.error).toBeNull();
    expect(assistant.tokenUsage).toBeNull();
  });
});

describe('Integration Tests', () => {
  it('verifies the main fix - messages property is accessible', () => {
    const assistant = new AIPipelineAssistant({});
    
    // This is the core fix - ensuring that the messages property is properly defined and accessible
    // The original error was "Cannot read properties of undefined (reading 'messages')"
    expect(assistant.messages).toBeDefined();
    expect(Array.isArray(assistant.messages)).toBe(true);
    expect(assistant.messages.length).toBe(0);
    
    // Test that we can add messages without error
    assistant.messages.push({
      id: 'test',
      type: 'user',
      content: 'Test message',
      timestamp: new Date(),
    });
    
    expect(assistant.messages.length).toBe(1);
    expect(assistant.messages[0].content).toBe('Test message');
  });

  it('verifies observable state management works', () => {
    const assistant = new AIPipelineAssistant({});
    
    // Test that MobX observables are properly initialized
    expect(assistant.messages).toEqual([]);
    expect(assistant.currentStatus).toBe(TaskStatus.UNSPECIFIED);
    expect(assistant.isConnected).toBe(false);
    expect(assistant.isStreaming).toBe(false);
    expect(assistant.yamlContent).toBe('');
    expect(assistant.yamlRevision).toBe(0);
    
    // These should not throw errors when accessed
    expect(() => assistant.clearConversation()).not.toThrow();
    expect(() => assistant.disconnect()).not.toThrow();
  });
});