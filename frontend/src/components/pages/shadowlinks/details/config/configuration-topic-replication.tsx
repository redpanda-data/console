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

const OTHER_CATEGORY = 'Other';

const findCategory = (property: string) =>
  Object.entries(CATEGORY_PROPERTIES_MAP).find(([, properties]) => properties.includes(property))?.[0] ??
  OTHER_CATEGORY;

/** Groups properties by their first matching category, in map order, with uncategorized ones last under "Other". */
const groupPropertiesByCategory = (properties: string[]) => {
  const grouped = new Map<string, string[]>();
  for (const property of properties) {
    const category = findCategory(property);
    grouped.set(category, [...(grouped.get(category) ?? []), property]);
  }
  return [...Object.keys(CATEGORY_PROPERTIES_MAP), OTHER_CATEGORY].flatMap((category) => {
    const categoryProperties = grouped.get(category);
    return categoryProperties ? [{ category, properties: categoryProperties }] : [];
  });
};

export const ConfigurationTopicReplication = ({ shadowLink }: ConfigurationTopicReplicationProps) => {
  const topicSyncOptions = shadowLink.configurations?.topicMetadataSyncOptions;
  const excludeDefault = topicSyncOptions?.excludeDefault ?? false;
  const syncedProperties = shadowLink.syncedShadowTopicProperties || [];

  // Combine default properties (if not excluded) with synced properties
  const allProperties = excludeDefault ? syncedProperties : [...new Set([...DEFAULT_PROPERTIES, ...syncedProperties])];

  if (allProperties.length === 0) {
    return (
      <Card size="full" testId="topic-replication-placeholder-card">
        <CardContent>No topic properties configured for shadowing</CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-heading-lg" data-testid="shadowing-title">
        Topic config shadow
      </h2>
      {groupPropertiesByCategory(allProperties).map(({ category, properties }) => {
        const categoryKey = category.toLowerCase().replace(/\s+/g, '-');

        return (
          <Card key={categoryKey} size="full" testId={`category-${categoryKey}-card`}>
            <CardContent>
              <Accordion defaultValue={[categoryKey]}>
                <AccordionItem value={categoryKey}>
                  <AccordionTrigger data-testid={`category-${categoryKey}-trigger`}>
                    <h3 className="text-heading-md">{category}</h3>
                  </AccordionTrigger>
                  <AccordionContent data-testid={`category-${categoryKey}-content`}>
                    <div className="flex flex-col px-6">
                      {properties.map((property, index) => (
                        <div key={`${categoryKey}-${property}`}>
                          <div className="flex items-center justify-between py-3">
                            <div className="text-body" data-testid={`property-${categoryKey}-${index}`}>
                              {property}
                            </div>
                            <Badge
                              data-testid={`property-${categoryKey}-${index}-badge`}
                              tone="default"
                              variant="subtle"
                            >
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
