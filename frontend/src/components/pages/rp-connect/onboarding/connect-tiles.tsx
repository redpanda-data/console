import { zodResolver } from '@hookform/resolvers/zod';
import { type ComponentName, componentLogoMap } from 'assets/connectors/componentLogoMap';
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
import type { ConnectComponentSpec, ConnectComponentType, ExtendedConnectComponentSpec } from '../types/schema';
import { type ConnectTilesFormData, connectTilesFormSchema } from '../types/wizard';
import { getAllCategories, getAllComponents } from '../utils/schema';
import type { BaseStepRef } from '../utils/wizard';
import { ConnectorLogo } from './connector-logo';

const searchComponents = (
  query: string,
  filters?: {
    types?: ConnectComponentType[];
    categories?: string[];
  },
  additionalComponents?: ExtendedConnectComponentSpec[],
): ConnectComponentSpec[] => {
  return getAllComponents(additionalComponents)
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((component) => {
      if (filters?.types?.length && !filters.types.includes(component.type)) {
        return false;
      }

      if (query.trim()) {
        const searchLower = query.toLowerCase();
        const matchesName = component.name.toLowerCase().includes(searchLower);
        const matchesDescription = component.description?.toLowerCase().includes(searchLower);

        if (!matchesName && !matchesDescription) {
          return false;
        }
      }

      if (filters?.categories?.length) {
        const hasMatchingCategory = component.categories?.some((cat) => filters.categories?.includes(cat));
        if (!hasMatchingCategory) return false;
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
    ref,
  ) => {
    const [filter, setFilter] = useState<string>('');
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [showScrollGradient, setShowScrollGradient] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const checkScrollable = useCallback(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

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

    useEffect(() => {
      if (defaultConnectionName && defaultConnectionType) {
        form.reset({
          connectionName: defaultConnectionName,
          connectionType: defaultConnectionType,
        });
      }
    }, [defaultConnectionName, defaultConnectionType, form]);

    const categories = useMemo(() => getAllCategories(additionalComponents), [additionalComponents]);

    const filteredComponents = useMemo(() => {
      return searchComponents(
        filter,
        {
          types: componentTypeFilter,
          categories: selectedCategories,
        },
        additionalComponents,
      );
    }, [componentTypeFilter, filter, selectedCategories, additionalComponents]);

    useEffect(() => {
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
      <Card size={size} variant={variant} className={cn(className, 'relative')}>
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
        <CardContent id="rp-connect-onboarding-wizard" className="mt-2">
          <Form {...form}>
            {!hideFilters && (
              <div className="flex flex-col gap-4 sticky top-0 bg-background z-10 border-b-2 pb-4 mb-0 pt-2">
                <div className="flex justify-between gap-4">
                  <Label className="w-[240px]">
                    Search for Connectors
                    <Input
                      value={filter}
                      onChange={(e) => {
                        setFilter(e.target.value);
                      }}
                      placeholder="Snowflake, S3..."
                      className="flex-1"
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
                      options={categories.map((category) => ({
                        value: category.id,
                        label: category.name,
                      }))}
                      value={selectedCategories}
                      onValueChange={setSelectedCategories}
                      placeholder="Databases, Social..."
                      maxDisplay={3}
                      width="full"
                    />
                  </Label>
                </div>
              </div>
            )}

            <div className="relative">
              <div
                ref={scrollContainerRef}
                className={cn('max-h-[50vh] min-h-[400px] overflow-y-auto py-4', tileWrapperClassName)}
                onScroll={checkScrollable}
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
                            <Text className="text-sm text-muted-foreground mt-1">
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
                                    value={component.name}
                                    checked={
                                      field.value === component.name &&
                                      form.getValues('connectionType') === component.type
                                    }
                                    key={uniqueKey}
                                    onClick={() => {
                                      field.onChange(component.name);
                                      form.setValue('connectionType', component.type as ConnectComponentType);
                                      onChange?.(component.name, component.type as ConnectComponentType);
                                    }}
                                    className="relative"
                                  >
                                    <div className="flex gap-4 items-center justify-between w-full">
                                      <div className="flex flex-col gap-1 min-w-0">
                                        <Text className="truncate font-medium">{component.name}</Text>
                                        <Text className="text-sm text-muted-foreground line-clamp-2">
                                          {component.summary}
                                        </Text>
                                      </div>
                                      {field.value === component.name &&
                                        form.getValues('connectionType') === component.type && (
                                          <ChoiceboxItemIndicator className="absolute right-2 top-2" />
                                        )}
                                      {component?.logoUrl ? (
                                        <img
                                          src={component.logoUrl}
                                          alt={component.name}
                                          className="size-6 grayscale"
                                        />
                                      ) : componentLogoMap[component.name as ComponentName] ? (
                                        <ConnectorLogo
                                          name={component.name as ComponentName}
                                          className="size-6 text-muted-foreground"
                                        />
                                      ) : (
                                        <Waypoints className="size-6 text-muted-foreground" />
                                      )}
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
                <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-background to-transparent pointer-events-none" />
              )}
            </div>
          </Form>
        </CardContent>
      </Card>
    );
  },
);
