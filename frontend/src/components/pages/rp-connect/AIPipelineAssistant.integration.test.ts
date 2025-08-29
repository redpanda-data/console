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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIPipelineAssistant } from './AIPipelineAssistant';
import { TaskStatus } from '../../../protogen/redpanda/api/dataplane/v1alpha3/pipeline_pb';

// Mock the config module with a simple client
const mockClient = {
  executePipelineTask: vi.fn(),
};

vi.mock('../../../config', () => ({
  config: {
    pipelineV1Alpha3Client: mockClient,
  },
}));

describe('AIPipelineAssistant Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fixes the main bug: messages property is accessible and defined', () => {
    // This test directly addresses the original error:
    // "Cannot read properties of undefined (reading 'messages')"
    const assistant = new AIPipelineAssistant({});
    
    // The fix ensures that the MobX observable state is properly initialized
    expect(assistant.messages).toBeDefined();
    expect(Array.isArray(assistant.messages)).toBe(true);
    expect(assistant.messages.length).toBe(0);
    
    // Test that we can interact with the messages property without errors
    assistant.messages.push({
      id: 'test-message-1',
      type: 'user',
      content: 'Hello AI!',
      timestamp: new Date(),
    });
    
    expect(assistant.messages.length).toBe(1);
    expect(assistant.messages[0].content).toBe('Hello AI!');
    expect(assistant.messages[0].type).toBe('user');
  });

  it('initializes all MobX observable properties correctly', () => {
    const assistant = new AIPipelineAssistant({});
    
    // Verify all observable properties are properly initialized
    // This prevents the "undefined" access errors
    expect(assistant.messages).toEqual([]);
    expect(assistant.currentStatus).toBe(TaskStatus.UNSPECIFIED);
    expect(assistant.isConnected).toBe(false);
    expect(assistant.isStreaming).toBe(false);
    expect(assistant.error).toBeNull();
    expect(assistant.tokenUsage).toBeNull();
    expect(assistant.yamlContent).toBe('');
    expect(assistant.yamlRevision).toBe(0);
  });

  it('can handle sendMessage without crashing', async () => {
    const assistant = new AIPipelineAssistant({});
    
    // Mock a simple stream that resolves immediately
    mockClient.executePipelineTask.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        // Empty iterator - no responses
      },
    });
    
    // This should not throw the original error
    await expect(assistant.sendMessage('Test message')).resolves.not.toThrow();
    
    // Verify the message was added to the chat
    expect(assistant.messages.length).toBe(1);
    expect(assistant.messages[0].content).toBe('Test message');
    expect(assistant.messages[0].type).toBe('user');
  });

  it('handles missing client gracefully', async () => {
    const assistant = new AIPipelineAssistant({});
    
    // Temporarily remove the client to simulate the error condition
    const originalClient = (assistant as any).config?.pipelineV1Alpha3Client;
    vi.mocked(mockClient.executePipelineTask).mockImplementation(() => {
      throw new Error('Client not available');
    });
    
    // Mock the config to return undefined client
    vi.doMock('../../../config', () => ({
      config: {
        pipelineV1Alpha3Client: undefined,
      },
    }));
    
    await assistant.sendMessage('Test message');
    
    // Should set error state instead of crashing
    expect(assistant.error).toContain('AI Pipeline service not available');
  });

  it('properly manages component lifecycle', () => {
    const assistant = new AIPipelineAssistant({});
    
    // Add some data to verify cleanup
    assistant.messages.push({
      id: 'test',
      type: 'user',
      content: 'Test',
      timestamp: new Date(),
    });
    assistant.isConnected = true;
    assistant.isStreaming = true;
    
    // Test cleanup methods
    expect(() => assistant.disconnect()).not.toThrow();
    expect(assistant.isConnected).toBe(false);
    expect(assistant.isStreaming).toBe(false);
    
    expect(() => assistant.clearConversation()).not.toThrow();
    expect(assistant.messages.length).toBe(0);
    expect(assistant.error).toBeNull();
    
    expect(() => assistant.componentWillUnmount()).not.toThrow();
  });

  it('maintains state consistency during operations', () => {
    const assistant = new AIPipelineAssistant({});
    
    // Test state transitions
    expect(assistant.currentStatus).toBe(TaskStatus.UNSPECIFIED);
    
    assistant.currentStatus = TaskStatus.THINKING;
    expect(assistant.currentStatus).toBe(TaskStatus.THINKING);
    
    assistant.isStreaming = true;
    expect(assistant.isStreaming).toBe(true);
    
    assistant.yamlContent = 'input:\n  kafka:\n    addresses: []\n';
    expect(assistant.yamlContent).toContain('kafka');
    
    assistant.yamlRevision = 5;
    expect(assistant.yamlRevision).toBe(5);
    
    // All properties should remain accessible and not undefined
    expect(assistant.messages).toBeDefined();
    expect(assistant.currentStatus).toBeDefined();
    expect(assistant.isConnected).toBeDefined();
    expect(assistant.isStreaming).toBeDefined();
    expect(assistant.yamlContent).toBeDefined();
    expect(assistant.yamlRevision).toBeDefined();
  });
});