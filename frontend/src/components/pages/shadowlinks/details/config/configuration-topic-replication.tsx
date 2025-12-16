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

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from 'components/redpanda-ui/components/accordion';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Card, CardContent } from 'components/redpanda-ui/components/card';
import { Separator } from 'components/redpanda-ui/components/separator';
import { Heading, Text } from 'components/redpanda-ui/components/typography';

import type { UnifiedShadowLink } from '../../model';

export type ConfigurationTopicReplicationProps = {
  shadowLink: UnifiedShadowLink;
};

// Default properties that are synced when excludeDefault is false
const DEFAULT_PROPERTIES = [
  'compression.type',
  'retention.bytes',
  'retention.ms',
  'delete.retention.ms',
  'replication.factor',
  'min.compaction.lag.ms',
  'max.compaction.lag.ms',
];

// Category mapping: category name -> array of property names
const CATEGORY_PROPERTIES_MAP: Record<string, string[]> = {
  Retention: ['retention.bytes', 'retention.ms', 'delete.retention.ms'],
  Compaction: ['min.compaction.lag.ms', 'max.compaction.lag.ms', 'min.cleanable.dirty.ratio'],
  Replication: ['replication.factor'],
  'Tiered Storage': [
    'retention.local.target.bytes',
    'retention.local.target.ms',
    'redpanda.remote.read',
    'redpanda.remote.write',
  ],
  'Write Caching': ['write.caching', 'flush.bytes', 'flush.ms'],
  Compression: ['compression.type'],
};

export const ConfigurationTopicReplication = ({ shadowLink }: ConfigurationTopicReplicationProps) => {
  const topicSyncOptions = shadowLink.configurations?.topicMetadataSyncOptions;
  const excludeDefault = topicSyncOptions?.excludeDefault ?? false;
  const syncedProperties = shadowLink.syncedShadowTopicProperties || [];

  // Combine default properties (if not excluded) with synced properties
  const allProperties = excludeDefault ? syncedProperties : [...new Set([...DEFAULT_PROPERTIES, ...syncedProperties])];

  // Group properties by category based on the map
  const categorizedProperties: Record<string, string[]> = {};
  const uncategorizedProperties: string[] = [];

  for (const property of allProperties) {
    let found = false;
    for (const [category, properties] of Object.entries(CATEGORY_PROPERTIES_MAP)) {
      if (properties.includes(property)) {
        if (!categorizedProperties[category]) {
          categorizedProperties[category] = [];
        }
        categorizedProperties[category].push(property);
        found = true;
        break;
      }
    }
    if (!found) {
      uncategorizedProperties.push(property);
    }
  }

  // Add uncategorized properties to "Other" category if any exist
  if (uncategorizedProperties.length > 0) {
    categorizedProperties.Other = uncategorizedProperties;
  }

  // Get categories in the order they appear in CATEGORY_PROPERTIES_MAP, plus Other at the end
  const sortedCategories = [
    ...Object.keys(CATEGORY_PROPERTIES_MAP).filter((category) => categorizedProperties[category]),
    ...(categorizedProperties.Other ? ['Other'] : []),
  ];

  if (allProperties.length === 0) {
    return (
      <Card size="full" testId="topic-replication-placeholder-card">
        <CardContent className="py-8 text-center">
          <Text className="text-muted-foreground">No topic properties configured for shadowing</Text>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Heading level={2} testId="shadowing-title">
        Topic config shadow
      </Heading>
      {sortedCategories.map((category) => {
        const properties = categorizedProperties[category];
        const categoryKey = category.toLowerCase().replace(/\s+/g, '-');

        return (
          <Card key={categoryKey} size="full" testId={`category-${categoryKey}-card`}>
            <CardContent className="p-0">
              <Accordion collapsible defaultValue={categoryKey} type="single">
                <AccordionItem value={categoryKey}>
                  <AccordionTrigger className="py-4" data-testid={`category-${categoryKey}-trigger`}>
                    <Heading level={3}>{category}</Heading>
                  </AccordionTrigger>
                  <AccordionContent className="px-6 pb-4" data-testid={`category-${categoryKey}-content`}>
                    <div className="flex flex-col">
                      {properties.map((property, index) => (
                        <div key={`${property}-${index}`}>
                          <div className="flex items-center justify-between py-3">
                            <Text data-testid={`property-${categoryKey}-${index}`}>{property}</Text>
                            <Badge data-testid={`property-${categoryKey}-${index}-badge`} variant="gray">
                              Shadowed
                            </Badge>
                          </div>
                          {index < properties.length - 1 && (
                            <Separator data-testid={`property-${categoryKey}-${index}-separator`} />
                          )}
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
