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
import { Badge, type BadgeEmphasis, type BadgeTone, type BadgeVariant } from 'components/redpanda-ui/components/badge';
import { CardContent, CardTitle } from 'components/redpanda-ui/components/card';
import { CollapsibleContent } from 'components/redpanda-ui/components/collapsible';
import { FormControl, FormField, FormItem, FormLabel } from 'components/redpanda-ui/components/form';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from 'components/redpanda-ui/components/item';
import { Switch } from 'components/redpanda-ui/components/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { InlineCode } from 'components/redpanda-ui/components/typography';
import { useEffect, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import {
  CATEGORY_ORDER,
  getDefaultProperties,
  getPropertiesByCategory,
  isPropertyAlwaysReplicated,
  isPropertyEditable,
  type ShadowingStatus,
} from './topic-properties-config';
import { CollapsibleSectionCard } from '../create/collapsible-section-card';
import type { FormValues } from '../create/model';

const getBadgeStyle: (status: ShadowingStatus) => { tone?: BadgeTone; variant: BadgeEmphasis | BadgeVariant } = (
  status
) => {
  switch (status) {
    case 'always':
      return { tone: 'success', variant: 'subtle' };
    case 'default':
      return { tone: 'default', variant: 'subtle' };
    case 'never':
      return { tone: 'destructive', variant: 'subtle' };
    default:
      return { variant: 'outline' };
  }
};

const formatStatusLabel: (status: ShadowingStatus) => string = (status) => {
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

const getTooltipMessage: (property: { status: ShadowingStatus[] }) => string | null = (property) => {
  if (property.status.includes('always')) {
    return 'Required property - always replicated to shadow cluster';
  }
  if (property.status.includes('never')) {
    return 'This configuration is not supported for shadow cluster replication';
  }
  return null;
};

type TopicPropertyItemProps = {
  property: {
    name: string;
    status: ShadowingStatus[];
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
              <Badge data-testid={`badge-${property.name}-${status}`} key={status} {...getBadgeStyle(status)}>
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
              <TooltipTrigger
                render={
                  <div>
                    <Switch
                      checked={isSelected}
                      data-testid={`switch-${property.name}`}
                      disabled={!isEditable}
                      onCheckedChange={(checked) => onToggle(property.name, checked)}
                    />
                  </div>
                }
              />
              <TooltipContent>
                <div className="text-body">{tooltipMessage}</div>
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

const syncDefaultProperties = (topicProperties: string[], excludeDefault: boolean | undefined) => {
  const defaultProps = getDefaultProperties();
  if (excludeDefault) {
    const filteredProperties = topicProperties.filter((prop) => !defaultProps.includes(prop));
    return filteredProperties.length === topicProperties.length ? undefined : filteredProperties;
  }
  const propsToAdd = defaultProps.filter((prop) => !topicProperties.includes(prop));
  return propsToAdd.length > 0 ? [...topicProperties, ...propsToAdd] : undefined;
};

/**
 * Excluding defaults drops those properties; including defaults adds only missing ones. A state already in sync does not write a new form value.
 */
export const TopicConfigTab = () => {
  const { control, setValue } = useFormContext<FormValues>();
  const [isOpen, setIsOpen] = useState(false);
  const prevExcludeDefault = useRef<boolean | undefined>(undefined);

  const topicProperties = useWatch({ control, name: 'topicProperties' }) || [];
  const excludeDefault = useWatch({ control, name: 'excludeDefault' });
  const propertiesByCategory = getPropertiesByCategory();

  useEffect(() => {
    if (prevExcludeDefault.current === excludeDefault) {
      return;
    }

    const previousValue = prevExcludeDefault.current;
    prevExcludeDefault.current = excludeDefault;

    if (previousValue === undefined) {
      return;
    }

    const nextProperties = syncDefaultProperties(topicProperties, excludeDefault);
    if (nextProperties) {
      setValue('topicProperties', nextProperties, { shouldDirty: true });
    }
  }, [excludeDefault, topicProperties, setValue]);

  const handlePropertyToggle = (propertyName: string, checked: boolean) => {
    if (checked) {
      if (!topicProperties.includes(propertyName)) {
        setValue('topicProperties', [...topicProperties, propertyName], { shouldDirty: true });
      }
    } else {
      setValue(
        'topicProperties',
        topicProperties.filter((p) => p !== propertyName),
        { shouldDirty: true }
      );
    }
  };

  const isPropertySelected = (propertyName: string) => {
    if (isPropertyAlwaysReplicated(propertyName)) {
      return true;
    }
    return topicProperties.includes(propertyName);
  };

  return (
    <CollapsibleSectionCard
      heading={
        <div className="space-y-2">
          <CardTitle>Topic properties shadowed</CardTitle>
          <div className="text-body text-muted-foreground">
            Toggle replication on and off for specific topic configurations. When enabled, the configuration will be
            replicated to the shadow cluster.
          </div>
        </div>
      }
      onOpenChange={setIsOpen}
      open={isOpen}
      toggleLabel="Toggle topic properties section"
      toggleTestId="topic-config-toggle-button"
    >
      <CardContent>
        <ExcludeDefaultToggle />

        {!isOpen && (
          <div className="space-y-2">
            <div className="text-body-sm">
              {topicProperties.length} {topicProperties.length === 1 ? 'property' : 'properties'} selected for
              replication
            </div>
          </div>
        )}

        <CollapsibleContent>
          <Accordion defaultValue={CATEGORY_ORDER} multiple>
            {CATEGORY_ORDER.map((category) => {
              const properties = propertiesByCategory.get(category);
              if (!properties || properties.length === 0) {
                return null;
              }

              return (
                <AccordionItem data-testid={`category-${category}`} key={category} value={category}>
                  <AccordionTrigger>{category}</AccordionTrigger>
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
    </CollapsibleSectionCard>
  );
};
