import { zodResolver } from '@hookform/resolvers/zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  type CardSize,
  CardTitle,
  type CardVariant,
} from 'components/redpanda-ui/components/card';
import { Choicebox } from 'components/redpanda-ui/components/choicebox';
import { Form, FormControl, FormField, FormItem, FormMessage } from 'components/redpanda-ui/components/form';
import { Input, InputStart } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { SimpleMultiSelect } from 'components/redpanda-ui/components/multi-select';
import { Heading, Link, Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { SearchIcon } from 'lucide-react';
import type { MotionProps } from 'motion/react';
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import { ConnectTile } from './connect-tile';
import type { ConnectComponentSpec, ConnectComponentType, ExtendedConnectComponentSpec } from '../types/schema';
import type { BaseStepRef } from '../types/wizard';
import { type ConnectTilesListFormData, connectTilesListFormSchema } from '../types/wizard';
import { getAllCategories } from '../utils/categories';
import { getBuiltInComponents } from '../utils/schema';

const PRIORITY_COMPONENTS = [
  'redpanda',
  'aws_s3',
  'gcp_cloud_storage',
  'azure_blob_storage',
  'gcp_spanner_cdc',
  'postgres_cdc',
  'mysql_cdc',
  'mongodb_cdc',
  'snowflake_streaming',
  'redpanda_migrator',
  'kafka_franz',
  'gcp_pubsub',
  'slack',
  'sftp',
  'nats',
];

const searchComponents = (
  allComponents: ConnectComponentSpec[],
  query: string,
  filters?: {
    types?: ConnectComponentType[];
    categories?: string[];
  },
  additionalComponents?: ExtendedConnectComponentSpec[]
): ConnectComponentSpec[] => {
  const matchesFilters = (component: ConnectComponentSpec) => {
    if (filters?.types?.length && !filters.types.includes(component.type)) {
      return false;
    }

    if (query.trim()) {
      const matchesName = component.name.toLowerCase().includes(query.toLowerCase());
      if (!matchesName) {
        return false;
      }
    }

    if (filters?.categories?.length) {
      const hasMatchingCategory = component.categories?.some((cat: string) => filters.categories?.includes(cat));
      if (!hasMatchingCategory) {
        return false;
      }
    }

    return true;
  };

  const result: ConnectComponentSpec[] = [];

  // 1. Additional components that match filters (in the order provided)
  if (additionalComponents?.length) {
    const filteredAdditional = additionalComponents.filter((comp) => matchesFilters(comp));
    result.push(...filteredAdditional);
  }

  // 2. Priority components that match filters (excluding additional components)
  const additionalNames = new Set(additionalComponents?.map((c) => c.name) || []);
  const priorityComponents = allComponents
    .filter(
      (comp) => !additionalNames.has(comp.name) && PRIORITY_COMPONENTS.includes(comp.name) && matchesFilters(comp)
    )
    .sort((a, b) => {
      const aIndex = PRIORITY_COMPONENTS.indexOf(a.name);
      const bIndex = PRIORITY_COMPONENTS.indexOf(b.name);
      return aIndex - bIndex;
    });
  result.push(...priorityComponents);

  // 3. Remaining components that match filters (alphabetically sorted)
  const remainingComponents = allComponents
    .filter((comp) => {
      const isAdditional = additionalNames.has(comp.name);
      const isPriority = PRIORITY_COMPONENTS.includes(comp.name);
      if (isAdditional || isPriority) {
        return false;
      }
      return matchesFilters(comp);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  result.push(...remainingComponents);

  return result;
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
  title?: React.ReactNode;
  description?: React.ReactNode;
};

export const ConnectTiles = memo(
  forwardRef<BaseStepRef<ConnectTilesListFormData>, ConnectTilesProps & MotionProps>(
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
        description,
        ...motionProps
      },
      ref
    ) => {
      const [filter, setFilter] = useState<string>('');
      const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
      const [showScrollGradient, setShowScrollGradient] = useState(false);
      const scrollContainerRef = useRef<HTMLDivElement>(null);

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

      const defaultValues = useMemo(
        () => ({
          connectionName: defaultConnectionName,
          connectionType: defaultConnectionType,
        }),
        [defaultConnectionName, defaultConnectionType]
      );

      const form = useForm<ConnectTilesListFormData>({
        resolver: zodResolver(connectTilesListFormSchema),
        mode: 'onSubmit',
        defaultValues,
      });

      const allComponents = useMemo(
        () => [...getBuiltInComponents(), ...(additionalComponents || [])],
        [additionalComponents]
      );

      const categories = useMemo(
        () => getAllCategories(allComponents, componentTypeFilter),
        [allComponents, componentTypeFilter]
      );

      const filteredComponents = useMemo(
        () =>
          searchComponents(
            allComponents,
            filter,
            {
              types: componentTypeFilter,
              categories: selectedCategories,
            },
            additionalComponents
          ),
        [componentTypeFilter, filter, selectedCategories, allComponents, additionalComponents]
      );

      useEffect(() => {
        requestAnimationFrame(() => {
          checkScrollable();
        });
      }, [checkScrollable]);

      useImperativeHandle(ref, () => ({
        triggerSubmit: async () => {
          const isValid = await form.trigger();
          if (isValid) {
            const values = form.getValues();
            return {
              success: true,
              message: 'Connector selected successfully',
              data: values,
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
        <Card className={cn(className, 'relative')} size={size} variant={variant} {...motionProps} animated>
          {!hideHeader && (
            <CardHeader className="bg-background">
              <CardTitle>
                <Heading level={2}>{title ?? 'Select a connector'}</Heading>
              </CardTitle>
              <CardDescription className="mt-4">
                {description ?? (
                  <Text>
                    Redpanda Connect is a data streaming service for building scalable, high-performance data pipelines
                    that drive real-time analytics and actionable business insights. Integrate data across systems with
                    hundreds of prebuilt connectors, change data capture (CDC) capabilities, and YAML-configurable
                    pipelines.{' '}
                    <Link href="https://docs.redpanda.com/redpanda-connect/home/" target="_blank">
                      Learn more.
                    </Link>
                  </Text>
                )}
              </CardDescription>
            </CardHeader>
          )}
          <CardContent className="mt-2" id="rp-connect-onboarding-wizard">
            <Form {...form}>
              {!hideFilters && (
                <div className="sticky top-0 z-10 mb-0 flex flex-col gap-4 border-b-2 bg-background pt-2 pb-4">
                  <div className="flex gap-4">
                    <Label className="w-[240px]">
                      Search connectors
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
                        onValueChange={setSelectedCategories}
                        options={categories.map((category) => ({
                          value: category.id,
                          label: category.name,
                        }))}
                        placeholder="All"
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
                              <div className={cn('grid-auto-rows-fr grid gap-2', `grid-cols-${gridCols}`)}>
                                {filteredComponents.map((component) => {
                                  const uniqueKey = `${component.type}-${component.name}`;
                                  const isChecked =
                                    field.value === component.name &&
                                    form.getValues('connectionType') === component.type;

                                  return (
                                    <ConnectTile
                                      checked={isChecked}
                                      component={component}
                                      key={uniqueKey}
                                      onChange={() => {
                                        field.onChange(component.name);
                                        form.setValue('connectionType', component.type as ConnectComponentType);
                                        // Only call onChange for non-wizard use cases (e.g., dialog)
                                        // Wizard saves to session storage only after "Next" is clicked
                                        onChange?.(component.name, component.type as ConnectComponentType);
                                      }}
                                      uniqueKey={uniqueKey}
                                    />
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
                  <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-20 bg-gradient-to-t from-background via-background/60 to-transparent" />
                )}
              </div>
            </Form>
          </CardContent>
        </Card>
      );
    }
  )
);
