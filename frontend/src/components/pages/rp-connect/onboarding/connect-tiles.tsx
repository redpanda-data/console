import { zodResolver } from '@hookform/resolvers/zod';
import { type ComponentName, componentLogoMap } from 'assets/connectors/componentLogoMap';
import { Badge } from 'components/redpanda-ui/components/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  type CardSize,
  CardTitle,
  type CardVariant,
} from 'components/redpanda-ui/components/card';
import { Choicebox, ChoiceboxItem, ChoiceboxItemIndicator } from 'components/redpanda-ui/components/choicebox';
import { Form, FormControl, FormField, FormItem, FormMessage } from 'components/redpanda-ui/components/form';
import { Input, InputStart } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { SimpleMultiSelect } from 'components/redpanda-ui/components/multi-select';
import { Heading, Link, Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { SearchIcon, Waypoints } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import { getCategoryBadgeProps } from './connector-badges';
import { ConnectorLogo } from './connector-logo';
import type {
  ComponentCategory,
  ConnectComponentSpec,
  ConnectComponentType,
  ExtendedConnectComponentSpec,
} from '../types/schema';
import { type ConnectTilesFormData, connectTilesFormSchema } from '../types/wizard';
import { getAllCategories, getAllComponents } from '../utils/schema';
import type { BaseStepRef } from '../utils/wizard';

const searchComponents = (
  query: string,
  filters?: {
    types?: ConnectComponentType[];
    categories?: (ComponentCategory | string)[];
  },
  additionalComponents?: ExtendedConnectComponentSpec[]
): ConnectComponentSpec[] => {
  return getAllComponents(additionalComponents)
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((component) => {
      // First, filter by component type
      if (filters?.types?.length && !filters.types.includes(component.type)) {
        return false;
      }

      // Then, filter by search text if provided
      if (query.trim()) {
        const searchLower = query.toLowerCase();
        const matchesName = component.name.toLowerCase().includes(searchLower);
        const matchesDescription = component.description?.toLowerCase().includes(searchLower);

        if (!(matchesName || matchesDescription)) {
          return false;
        }
      }

      // Filter by categories
      if (filters?.categories?.length) {
        const hasMatchingCategory = component.categories?.some((cat) => filters.categories?.includes(cat));
        if (!hasMatchingCategory) {
          return false;
        }
      }

      return true;
    });
};

export type ConnectTilesProps = {
  additionalComponents?: ExtendedConnectComponentSpec[];
  componentTypeFilter?: ConnectComponentType[];
  onChange?: (connectionName: string, connectionType: ConnectComponentType) => void;
  hideHeader?: boolean;
  hideFilters?: boolean;
  defaultConnectionName?: string;
  defaultConnectionType?: ConnectComponentType;
  gridCols?: number;
  variant?: CardVariant;
  size?: CardSize;
  className?: string;
  tileWrapperClassName?: string;
  title?: string;
};

export const ConnectTiles = forwardRef<BaseStepRef, ConnectTilesProps>(
  (
    {
      additionalComponents,
      componentTypeFilter,
      onChange,
      hideHeader,
      hideFilters,
      defaultConnectionName,
      defaultConnectionType,
      gridCols = 4,
      variant = 'default',
      size = 'full',
      className,
      tileWrapperClassName,
      title,
    },
    ref
  ) => {
    const [filter, setFilter] = useState<string>('');
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [showScrollGradient, setShowScrollGradient] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Check if content is scrollable and update gradient visibility
    const checkScrollable = useCallback(() => {
      const container = scrollContainerRef.current;
      if (!container) {
        return;
      }

      const { scrollTop, scrollHeight, clientHeight } = container;
      const isScrollable = scrollHeight > clientHeight;
      const isNearBottom = scrollTop + clientHeight >= scrollHeight - 40;

      // Show gradient if scrollable AND not near bottom
      setShowScrollGradient(isScrollable && !isNearBottom);
    }, []);

    const form = useForm<ConnectTilesFormData>({
      resolver: zodResolver(connectTilesFormSchema),
      mode: 'onChange',
      defaultValues: {
        connectionName: defaultConnectionName || '',
        connectionType: defaultConnectionType,
      },
    });

    // Sync form when default values change
    useEffect(() => {
      if (defaultConnectionName && defaultConnectionType) {
        form.reset({
          connectionName: defaultConnectionName,
          connectionType: defaultConnectionType,
        });
      }
    }, [defaultConnectionName, defaultConnectionType, form]);

    const categories = useMemo(() => getAllCategories(additionalComponents), [additionalComponents]);

    // Filter components based on search, categories, and component type
    const filteredComponents = useMemo(
      () =>
        searchComponents(
          filter,
          {
            types: componentTypeFilter,
            categories: selectedCategories,
          },
          additionalComponents
        ),
      [componentTypeFilter, filter, selectedCategories, additionalComponents]
    );

    // Check if scrolling is needed whenever filtered components change
    useEffect(() => {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        checkScrollable();
      });
    }, [checkScrollable]);

    useImperativeHandle(ref, () => ({
      triggerSubmit: async () => {
        const isValid = await form.trigger();
        if (isValid) {
          return {
            success: true,
            message: 'Connector selected successfully',
          };
        }
        return {
          success: false,
          message: 'Please fix the form errors before proceeding',
          error: 'Form validation failed',
        };
      },
      isLoading: false,
    }));

    return (
      <Card className={cn(className, 'relative')} size={size} variant={variant}>
        {!hideHeader && (
          <CardHeader className="bg-background">
            <CardTitle>
              <Heading level={2}>{title ?? 'Select a connector'}</Heading>
            </CardTitle>
            <CardDescription className="mt-4">
              <Text>
                Redpanda Connect is an alternative to Kafka Connect. It allows you to connect to a variety of data
                sources and sinks, and to create pipelines to transform data.{' '}
                <Link href="https://docs.redpanda.com/redpanda-cloud/develop/connect/about/" target="_blank">
                  Learn more.
                </Link>
              </Text>
              <Text>
                For help creating your pipeline see our{' '}
                <Link
                  href="https://docs.redpanda.com/redpanda-cloud/develop/connect/connect-quickstart/"
                  target="_blank"
                >
                  quickstart documentation
                </Link>
                , our{' '}
                <Link href="https://docs.redpanda.com/redpanda-cloud/develop/connect/cookbooks/" target="_blank">
                  library of examples
                </Link>
                , or our{' '}
                <Link
                  href="https://docs.redpanda.com/redpanda-cloud/develop/connect/components/catalog/"
                  target="_blank"
                >
                  connector catalog
                </Link>
              </Text>
            </CardDescription>
          </CardHeader>
        )}
        <CardContent className="mt-2" id="rp-connect-onboarding-wizard">
          <Form {...form}>
            {!hideFilters && (
              <div className="sticky top-0 z-10 mb-0 flex flex-col gap-4 border-b-2 bg-background pt-2 pb-4">
                <div className="flex justify-between gap-4">
                  <Label className="w-[240px]">
                    Search for Connectors
                    <Input
                      className="flex-1"
                      onChange={(e) => {
                        setFilter(e.target.value);
                      }}
                      placeholder="Snowflake, S3..."
                      value={filter}
                    >
                      <InputStart>
                        <SearchIcon className="size-4" />
                      </InputStart>
                    </Input>
                  </Label>
                  <Label className="w-[240px]">
                    Categories
                    <SimpleMultiSelect
                      container={document.getElementById('rp-connect-onboarding-wizard') ?? undefined}
                      maxDisplay={3}
                      onValueChange={setSelectedCategories}
                      options={categories.map((category) => {
                        const { icon, text, variant } = getCategoryBadgeProps(category.id);
                        return {
                          value: category.id,
                          label: (
                            <Badge icon={icon} variant={variant}>
                              {text}
                            </Badge>
                          ),
                        };
                      })}
                      placeholder="Databases, Social..."
                      value={selectedCategories}
                      width="full"
                    />
                  </Label>
                </div>
              </div>
            )}

            <div className="relative">
              <div
                className={cn('max-h-[50vh] min-h-[400px] overflow-y-auto py-4', tileWrapperClassName)}
                onScroll={checkScrollable}
                ref={scrollContainerRef}
              >
                <FormField
                  control={form.control}
                  name="connectionName"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        {filteredComponents.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-8 text-center">
                            <Text className="text-muted-foreground">No connections found matching your filters</Text>
                            <Text className="mt-1 text-muted-foreground text-sm">
                              Try adjusting your search or category filters
                            </Text>
                          </div>
                        ) : (
                          <Choicebox>
                            <div className={cn('grid gap-2', `grid-cols-${gridCols}`)}>
                              {filteredComponents.map((component) => {
                                const uniqueKey = `${component.type}-${component.name}`;

                                return (
                                  <ChoiceboxItem
                                    checked={
                                      field.value === component.name &&
                                      form.getValues('connectionType') === component.type
                                    }
                                    className="relative"
                                    key={uniqueKey}
                                    onClick={() => {
                                      field.onChange(component.name);
                                      form.setValue('connectionType', component.type as ConnectComponentType);
                                      onChange?.(component.name, component.type as ConnectComponentType);
                                    }}
                                    value={component.name}
                                  >
                                    <div className="flex w-full items-center justify-between gap-4">
                                      <div className="flex min-w-0 flex-col gap-1">
                                        <Text className="truncate font-medium">{component.name}</Text>
                                        <Text className="line-clamp-2 text-muted-foreground text-sm">
                                          {component.summary}
                                        </Text>
                                      </div>
                                      {field.value === component.name &&
                                        form.getValues('connectionType') === component.type && (
                                          <ChoiceboxItemIndicator className="absolute top-2 right-2" />
                                        )}
                                      {(() => {
                                        if (component?.logoUrl) {
                                          return (
                                            <img
                                              alt={component.name}
                                              className="size-6 grayscale"
                                              src={component.logoUrl}
                                            />
                                          );
                                        }
                                        if (componentLogoMap[component.name as ComponentName]) {
                                          return (
                                            <ConnectorLogo
                                              className="size-6 text-muted-foreground"
                                              name={component.name as ComponentName}
                                            />
                                          );
                                        }
                                        return <Waypoints className="size-6 text-muted-foreground" />;
                                      })()}
                                    </div>
                                  </ChoiceboxItem>
                                );
                              })}
                            </div>
                          </Choicebox>
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {/* Gradient overlay to indicate scrollability - only show when not at bottom */}
              {showScrollGradient && (
                <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-20 bg-gradient-to-t from-background to-transparent" />
              )}
            </div>
          </Form>
        </CardContent>
      </Card>
    );
  }
);
