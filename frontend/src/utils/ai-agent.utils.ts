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

/**
 * Resolves the full agent card URL from a given agent URL.
 *
 * According to the A2A (Agent-to-Agent) protocol specification, agent cards
 * are typically located at `/.well-known/agent-card.json` relative to the agent's base URL.
 *
 * @param agentUrl - The agent URL
 *
 * @returns The full URL to the agent card JSON file
 */
export function getAgentCardUrl({ agentUrl }: { agentUrl: string }): string {
  // Normalize URL by removing trailing slash
  const normalizedUrl = agentUrl.endsWith('/') ? agentUrl.slice(0, -1) : agentUrl;

  // If the URL already points to an agent card (contains 'agent-card.json' or '.well-known'),
  // assume it's the full path and use it as-is
  const isFullPath = normalizedUrl.includes('agent-card.json') || normalizedUrl.includes('well-known');

  if (isFullPath) {
    return normalizedUrl;
  }

  // Otherwise, append the standard A2A agent card path
  return `${normalizedUrl}/.well-known/agent-card.json`;
}

/**
 * Returns a list of agent card URLs to try, in order of preference.
 * First tries agent-card.json, then falls back to agent.json for compatibility.
 *
 * @param agentUrl - The agent URL
 *
 * @returns Array of URLs to try, in order
 */
export function getAgentCardUrls({ agentUrl }: { agentUrl: string }): string[] {
  // Normalize URL by removing trailing slash
  const normalizedUrl = agentUrl.endsWith('/') ? agentUrl.slice(0, -1) : agentUrl;

  // If the URL already points to a specific file, use it as-is
  const isFullPath =
    normalizedUrl.includes('agent-card.json') ||
    normalizedUrl.includes('agent.json') ||
    normalizedUrl.includes('well-known');

  if (isFullPath) {
    return [normalizedUrl];
  }

  // Try agent-card.json first, fall back to agent.json
  return [`${normalizedUrl}/.well-known/agent-card.json`, `${normalizedUrl}/.well-known/agent.json`];
}
