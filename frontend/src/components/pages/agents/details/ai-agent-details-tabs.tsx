/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

'use no memo';

import { TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { MessageSquare, Network, Search, Settings } from 'lucide-react';

export type AIAgentDetailsTab = 'agent-card' | 'configuration' | 'inspector' | 'transcripts';

export const AIAgentDetailsTabs = () => (
  <TabsList>
    <TabsTrigger className="gap-2" value="configuration">
      <div className="flex items-center gap-2">
        <Settings className="h-4 w-4" />
        Configuration
      </div>
    </TabsTrigger>
    <TabsTrigger className="gap-2" value="transcripts">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4" />
        Transcripts
      </div>
    </TabsTrigger>
    <TabsTrigger className="gap-2" value="agent-card">
      <div className="flex items-center gap-2">
        <Network className="h-4 w-4" />
        A2A
      </div>
    </TabsTrigger>
    <TabsTrigger className="gap-2" value="inspector">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4" />
        Inspector
      </div>
    </TabsTrigger>
  </TabsList>
);
