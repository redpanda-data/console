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

import { A2AClient } from '@a2a-js/sdk/client';
import { config } from 'config';
import { getAgentCardUrls } from 'utils/ai-agent.utils';

/**
 * Create A2A client with the same fetch implementation used for messaging
 * This ensures the client has proper JWT auth and fetch context
 */
export async function createA2AClient(agentCardUrl: string): Promise<A2AClient> {
  const fetchWithCustomHeader: typeof fetch = async (url, init) => {
    const headers = new Headers(init?.headers);
    if (config.jwt) {
      headers.set('Authorization', `Bearer ${config.jwt}`);
    }

    const newInit = { ...init, headers };

    return fetch(url, newInit);
  };

  const urls = getAgentCardUrls({ agentUrl: agentCardUrl });
  const errors: Error[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const isLastUrl = i === urls.length - 1;

    try {
      const client = await A2AClient.fromCardUrl(url, {
        fetchImpl: fetchWithCustomHeader,
      });
      return client;
    } catch (error) {
      errors.push(error as Error);
      console.log(`Failed to fetch agent card from ${url}, ${isLastUrl ? 'no more URLs to try' : 'trying next URL...'}`);

      if (!isLastUrl) {
        continue;
      }
    }
  }

  // All URLs failed
  const errorMessage = `Failed to create A2A client. Tried URLs: ${urls.join(', ')}. Errors: ${errors.map((e) => e.message).join('; ')}`;
  throw new Error(errorMessage);
}
