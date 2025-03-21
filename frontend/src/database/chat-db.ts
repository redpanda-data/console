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

import Dexie from 'dexie';
import type { Table } from 'dexie';

export interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'system';
  timestamp: Date;
}

class ChatDatabase extends Dexie {
  messages!: Table<ChatMessage, string>;

  constructor() {
    super('ChatDatabase');
    this.version(1).stores({
      messages: 'id, sender, timestamp',
    });
  }

  async getAllMessages(): Promise<ChatMessage[]> {
    return this.messages.orderBy('timestamp').toArray();
  }

  async addMessage(message: ChatMessage): Promise<string> {
    return this.messages.add(message);
  }

  async clearAllMessages(): Promise<void> {
    return this.messages.clear();
  }
}

export const chatDb = new ChatDatabase();
