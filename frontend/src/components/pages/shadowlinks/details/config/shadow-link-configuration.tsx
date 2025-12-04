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

'use client';

import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';

import { ConfigurationShadowing } from './configuration-shadowing';
import { ConfigurationSource } from './configuration-source';
import { ConfigurationTopicReplication } from './configuration-topic-replication';
import type { UnifiedShadowLink } from '../../model';

export interface ShadowLinkConfigurationProps {
  shadowLink: UnifiedShadowLink;
}

export const ShadowLinkConfiguration = ({ shadowLink }: ShadowLinkConfigurationProps) => (
  <Tabs defaultValue="all">
    <TabsList testId="configuration-subtabs" variant="default">
      <TabsTrigger testId="all-tab" value="all" variant="underline">
        All
      </TabsTrigger>
      <TabsTrigger testId="source-tab" value="source" variant="underline">
        Source
      </TabsTrigger>
      <TabsTrigger testId="shadowing-tab" value="shadowing" variant="underline">
        Shadowing
      </TabsTrigger>
      <TabsTrigger testId="topic-config-replication-tab" value="topic-config-replication" variant="underline">
        Topic properties shadowed
      </TabsTrigger>
    </TabsList>

    <TabsContents className="w-2/3">
      <TabsContent testId="all-content" value="all">
        <div className="flex flex-col gap-6">
          <ConfigurationSource shadowLink={shadowLink} />
          <ConfigurationShadowing shadowLink={shadowLink} />
          <ConfigurationTopicReplication shadowLink={shadowLink} />
        </div>
      </TabsContent>

      <TabsContent testId="source-content" value="source">
        <ConfigurationSource shadowLink={shadowLink} />
      </TabsContent>

      <TabsContent testId="shadowing-content" value="shadowing">
        <ConfigurationShadowing shadowLink={shadowLink} />
      </TabsContent>

      <TabsContent testId="topic-config-replication-content" value="topic-config-replication">
        <ConfigurationTopicReplication shadowLink={shadowLink} />
      </TabsContent>
    </TabsContents>
  </Tabs>
);
