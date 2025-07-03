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

import type { Table } from 'dexie';
import Dexie from 'dexie';

export interface ChatMessage {
  id: string;
  agentId: string;
  content: string;
  sender: 'user' | 'system';
  timestamp: Date;
  failure: boolean;
}

class ChatDatabase extends Dexie {
  messages!: Table<ChatMessage, string>;

  constructor() {
    super('ChatDatabase');
    this.version(2).stores({
      messages: 'id, agentId, sender, timestamp',
    });
  }

  async getAllMessages(agentId: string): Promise<ChatMessage[]> {
    return this.messages.where('agentId').equals(agentId).sortBy('timestamp');
  }

  async addMessage(message: ChatMessage): Promise<string> {
    return this.messages.add(message);
  }

  async clearAllMessages(agentId: string): Promise<void> {
    await this.messages.where('agentId').equals(agentId).delete();
  }
}

export const chatDb = new ChatDatabase();
