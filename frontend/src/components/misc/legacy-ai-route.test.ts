import { getLegacyAiDestination } from './legacy-ai-route';

describe('getLegacyAiDestination', () => {
  test.each([
    ['/agents', 'https://ai.redpanda.com/agents'],
    ['/agents/agent-123/edit', 'https://ai.redpanda.com/agents'],
    ['/mcp-servers', 'https://ai.redpanda.com/mcp-servers'],
    ['/mcp-servers/server-123', 'https://ai.redpanda.com/mcp-servers'],
    ['/knowledgebases', 'https://ai.redpanda.com/home'],
    ['/knowledgebases/kb-123/documents', 'https://ai.redpanda.com/home'],
    ['/transcripts', 'https://ai.redpanda.com/home'],
    ['/transcripts/transcript-123', 'https://ai.redpanda.com/home'],
  ])('maps %s to %s', (pathname, expectedDestination) => {
    expect(getLegacyAiDestination(pathname)).toBe(expectedDestination);
  });

  test('adds the current cluster as the ADP environment', () => {
    expect(getLegacyAiDestination('/agents/agent-123', 'cluster/with spaces')).toBe(
      'https://ai.redpanda.com/agents?adpEnvironmentId=cluster%2Fwith+spaces'
    );
  });

  test.each([undefined, '', 'default'])('omits the default or missing cluster ID (%s)', (clusterId) => {
    expect(getLegacyAiDestination('/agents', clusterId)).toBe('https://ai.redpanda.com/agents');
  });

  test.each([
    '/agentship',
    '/knowledgebases-old',
    '/mcp-servers2',
    '/transcripts.archive',
    '/topics',
    '/toString',
  ])('does not match a similar or unrelated path: %s', (pathname) => {
    expect(getLegacyAiDestination(pathname)).toBeUndefined();
  });
});
