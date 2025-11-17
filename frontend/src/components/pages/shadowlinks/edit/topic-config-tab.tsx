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

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from 'components/redpanda-ui/components/accordion';
import { Badge, type BadgeVariant } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import { FormControl, FormField, FormItem, FormLabel } from 'components/redpanda-ui/components/form';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from 'components/redpanda-ui/components/item';
import { Switch } from 'components/redpanda-ui/components/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { InlineCode, Text } from 'components/redpanda-ui/components/typography';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import {
  CATEGORY_ORDER,
  getPropertiesByCategory,
  isPropertyAlwaysReplicated,
  isPropertyEditable,
  type MirroringStatus,
} from './topic-properties-config';
import type { FormValues } from '../create/model';

/**
 * Get badge variant based on status
 */
const getBadgeVariant = (status: MirroringStatus): BadgeVariant => {
  switch (status) {
    case 'always':
      return 'green';
    case 'default':
      return 'secondary';
    case 'optional':
      return 'outline';
    case 'never':
      return 'destructive';
    default:
      return 'outline';
  }
};

/**
 * Format status label for display
 */
const formatStatusLabel = (status: MirroringStatus): string => {
  switch (status) {
    case 'always':
      return 'Always';
    case 'default':
      return 'Default';
    case 'optional':
      return 'Optional';
    case 'never':
      return 'Never';
    default:
      return status;
  }
};

/**
 * Get tooltip message for disabled properties
 */
const getTooltipMessage = (property: { status: MirroringStatus[] }): string | null => {
  if (property.status.includes('always')) {
    return 'Required property - always replicated to shadow cluster';
  }
  if (property.status.includes('never')) {
    return 'This configuration is not supported for shadow cluster replication';
  }
  return null;
};

/**
 * Individual property item with toggle switch
 */
type TopicPropertyItemProps = {
  property: {
    name: string;
    status: MirroringStatus[];
  };
  isSelected: boolean;
  isEditable: boolean;
  onToggle: (propertyName: string, checked: boolean) => void;
};

const TopicPropertyItem = ({ property, isSelected, isEditable, onToggle }: TopicPropertyItemProps) => {
  const tooltipMessage = getTooltipMessage(property);

  return (
    <Item data-testid={`property-${property.name}`} variant="outline">
      <ItemContent>
        <ItemTitle>
          <InlineCode>{property.name}</InlineCode>
          <div className="flex gap-1">
            {property.status.map((status) => (
              <Badge data-testid={`badge-${property.name}-${status}`} key={status} variant={getBadgeVariant(status)}>
                {formatStatusLabel(status)}
              </Badge>
            ))}
          </div>
        </ItemTitle>
      </ItemContent>
      <ItemActions>
        {tooltipMessage ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Switch
                    checked={isSelected}
                    data-testid={`switch-${property.name}`}
                    disabled={!isEditable}
                    onCheckedChange={(checked) => onToggle(property.name, checked)}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <Text>{tooltipMessage}</Text>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Switch
            checked={isSelected}
            data-testid={`switch-${property.name}`}
            disabled={!isEditable}
            onCheckedChange={(checked) => onToggle(property.name, checked)}
          />
        )}
      </ItemActions>
    </Item>
  );
};

/**
 * Exclude default properties toggle
 */
const ExcludeDefaultToggle = () => {
  const { control } = useFormContext<FormValues>();

  return (
    <FormField
      control={control}
      name="excludeDefault"
      render={({ field }) => (
        <FormItem className="mb-4">
          <Item variant="outline">
            <ItemContent>
              <ItemTitle>
                <FormLabel>Exclude default properties</FormLabel>
              </ItemTitle>
              <ItemDescription>
                When enabled, only explicitly selected properties will be synced (default properties will not be
                automatically included)
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <FormControl>
                <Switch checked={field.value} data-testid="exclude-default-switch" onCheckedChange={field.onChange} />
              </FormControl>
            </ItemActions>
          </Item>
        </FormItem>
      )}
    />
  );
};

export const TopicConfigTab = () => {
  const { control, setValue } = useFormContext<FormValues>();
  const [isOpen, setIsOpen] = useState(false);

  const topicProperties = useWatch({ control, name: 'topicProperties' }) || [];
  const propertiesByCategory = getPropertiesByCategory();

  /**
   * Toggle a property in the topicProperties array
   */
  const handlePropertyToggle = (propertyName: string, checked: boolean) => {
    if (checked) {
      // Add property if not already in the list
      if (!topicProperties.includes(propertyName)) {
        setValue('topicProperties', [...topicProperties, propertyName], { shouldDirty: true });
      }
    } else {
      // Remove property from the list
      setValue(
        'topicProperties',
        topicProperties.filter((p) => p !== propertyName),
        { shouldDirty: true }
      );
    }
  };

  /**
   * Check if a property is currently selected for replication
   */
  const isPropertySelected = (propertyName: string): boolean => {
    // Always replicated properties are always "on"
    if (isPropertyAlwaysReplicated(propertyName)) {
      return true;
    }
    return topicProperties.includes(propertyName);
  };

  return (
    <Collapsible onOpenChange={setIsOpen} open={isOpen}>
      <Card className="gap-0" size="full">
        <CardHeader>
          <div className="space-y-2">
            <CardTitle>Topic properties shadowed</CardTitle>
            <Text variant="muted">
              Toggle replication on and off for specific topic configurations. When enabled, the configuration will be
              replicated to the shadow cluster.
            </Text>
          </div>
          <CardAction>
            <CollapsibleTrigger asChild>
              <Button className="w-fit p-0" data-testid="topic-config-toggle-button" size="sm" variant="ghost">
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
          </CardAction>
        </CardHeader>

        <CardContent>
          {/* Exclude Default Toggle */}
          <ExcludeDefaultToggle />

          {/* Summary view when collapsed */}
          {!isOpen && (
            <div className="space-y-2">
              <Text variant="small">
                {topicProperties.length} {topicProperties.length === 1 ? 'property' : 'properties'} selected for
                replication
              </Text>
            </div>
          )}

          {/* Full editable view when expanded */}
          <CollapsibleContent>
            <Accordion className="space-y-2" defaultValue={CATEGORY_ORDER} type="multiple">
              {CATEGORY_ORDER.map((category) => {
                const properties = propertiesByCategory.get(category);
                if (!properties || properties.length === 0) {
                  return null;
                }

                return (
                  <AccordionItem data-testid={`category-${category}`} key={category} value={category}>
                    <AccordionTrigger className="font-medium text-base">{category}</AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3">
                        {properties.map((property) => {
                          const isEditable = isPropertyEditable(property.name);
                          const isSelected = isPropertySelected(property.name);

                          return (
                            <FormField
                              control={control}
                              key={property.name}
                              name="topicProperties"
                              render={() => (
                                <FormItem>
                                  <TopicPropertyItem
                                    isEditable={isEditable}
                                    isSelected={isSelected}
                                    onToggle={handlePropertyToggle}
                                    property={property}
                                  />
                                </FormItem>
                              )}
                            />
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  );
};
