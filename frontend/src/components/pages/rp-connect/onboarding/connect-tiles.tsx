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
import { DataTableFilter, type FilterColumnConfig } from 'components/redpanda-ui/components/data-table-filter';
import { Form, FormControl, FormField, FormItem, FormMessage } from 'components/redpanda-ui/components/form';
import { Input, InputStart } from 'components/redpanda-ui/components/input';
import { Skeleton, SkeletonGroup } from 'components/redpanda-ui/components/skeleton';
import { Heading, Link, Text } from 'components/redpanda-ui/components/typography';
import type { FiltersState } from 'components/redpanda-ui/lib/filter-utils';
import { useDataTableFilter } from 'components/redpanda-ui/lib/use-data-table-filter';
import { cn } from 'components/redpanda-ui/lib/utils';
import { Search } from 'lucide-react';
import type { MotionProps } from 'motion/react';
import type { ComponentList } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import { ConnectTile } from './connect-tile';
import type { ConnectComponentSpec, ConnectComponentType, ExtendedConnectComponentSpec } from '../types/schema';
import type { BaseStepRef } from '../types/wizard';
import { type ConnectTilesListFormData, connectTilesListFormSchema } from '../types/wizard';
import { getAllCategories } from '../utils/categories';
import { parseSchema } from '../utils/schema';

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
  'snowflake_put',
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
      const q = query.toLowerCase().trim();
      const matchesText =
        component.name.toLowerCase().includes(q) ||
        (component.summary ?? '').toLowerCase().includes(q) ||
        (component.description ?? '').toLowerCase().includes(q) ||
        (component.categories ?? []).some((c) => c.toLowerCase().includes(q));
      if (!matchesText) {
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

const ConnectTilesSkeleton = memo(
  ({
    children,
    gridCols = 4,
    tileCount = 12,
  }: {
    children?: React.ReactNode;
    gridCols?: number;
    tileCount?: number;
  }) => {
    const skeletonTiles = Array.from({ length: tileCount }, (_, i) => (
      <div className="h-[78px] rounded-lg border bg-card p-4" key={i}>
        <SkeletonGroup direction="horizontal">
          <SkeletonGroup className="flex-1" direction="vertical" spacing="sm">
            <Skeleton variant="heading" width="md" />
            <Skeleton variant="text" width="xs" />
          </SkeletonGroup>
          <Skeleton className="size-6" variant="circle" />
        </SkeletonGroup>
      </div>
    ));

    return (
      <Choicebox>
        <div className={cn('grid-auto-rows-fr grid gap-2', `grid-cols-${gridCols}`)}>
          {children}
          {skeletonTiles}
        </div>
      </Choicebox>
    );
  }
);

ConnectTilesSkeleton.displayName = 'ConnectTilesSkeleton';

export type ConnectTilesProps = {
  components?: ComponentList;
  isLoading?: boolean;
  additionalComponents?: ExtendedConnectComponentSpec[];
  componentTypeFilter?: ConnectComponentType[];
  onChange?: (connectionName: string, connectionType: ConnectComponentType) => void;
  onValidityChange?: (isValid: boolean) => void;
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
        components,
        isLoading,
        additionalComponents,
        componentTypeFilter,
        onChange,
        onValidityChange,
        hideHeader,
        hideFilters,
        defaultConnectionName,
        defaultConnectionType,
        gridCols = 4,
        variant,
        size = 'full',
        className,
        tileWrapperClassName,
        title,
        description,
        ...motionProps
      },
      ref
    ) => {
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
        mode: 'onChange',
        defaultValues,
      });

      const builtInComponents = useMemo(() => (components ? parseSchema(components) : []), [components]);
      const allComponents = useMemo(
        () => [...builtInComponents, ...(additionalComponents || [])],
        [builtInComponents, additionalComponents]
      );

      const categories = useMemo(
        () => getAllCategories(allComponents, componentTypeFilter),
        [allComponents, componentTypeFilter]
      );

      const [searchQuery, setSearchQuery] = useState('');

      const typeOptions = useMemo(() => {
        const types = new Set(allComponents.map((c) => c.type));
        return [...types].sort().map((t) => ({ value: t, label: t.replace(/_/g, ' ') }));
      }, [allComponents]);

      const filterColumns = useMemo<FilterColumnConfig[]>(
        () => [
          {
            id: 'type',
            displayName: 'Type',
            displayNamePlural: 'Types',
            type: 'multiOption',
            options: typeOptions,
          },
          {
            id: 'category',
            displayName: 'Category',
            displayNamePlural: 'Categories',
            type: 'multiOption',
            options: categories.map((cat) => ({ value: cat.id, label: cat.name })),
          },
        ],
        [categories, typeOptions]
      );

      // Pre-select type filter when componentTypeFilter is provided
      const defaultFilterValue = useMemo<FiltersState>(() => {
        if (!componentTypeFilter?.length) {
          return [];
        }
        return [{ columnId: 'type', type: 'multiOption', operator: 'is', values: componentTypeFilter }];
      }, [componentTypeFilter]);

      const { filters, actions } = useDataTableFilter({ columns: filterColumns, defaultValue: defaultFilterValue });

      const selectedTypes = useMemo(() => filters.find((f) => f.columnId === 'type')?.values ?? [], [filters]);
      const selectedCategories = useMemo(() => filters.find((f) => f.columnId === 'category')?.values ?? [], [filters]);

      // Use filter-selected types if any, otherwise fall back to prop
      const effectiveTypeFilter =
        selectedTypes.length > 0 ? (selectedTypes as ConnectComponentType[]) : componentTypeFilter;

      const filteredComponents = useMemo(
        () =>
          searchComponents(
            allComponents,
            searchQuery,
            {
              types: effectiveTypeFilter,
              categories: selectedCategories,
            },
            additionalComponents
          ),
        [effectiveTypeFilter, searchQuery, selectedCategories, allComponents, additionalComponents]
      );

      useEffect(() => {
        requestAnimationFrame(() => {
          checkScrollable();
        });
      }, [checkScrollable]);

      // Notify parent when validity changes
      useEffect(() => {
        onValidityChange?.(form.formState.isValid);
      }, [form.formState.isValid, onValidityChange]);

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
        isPending: false,
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
                      Learn more
                    </Link>
                  </Text>
                )}
              </CardDescription>
            </CardHeader>
          )}
          <CardContent className="mt-2" id="rp-connect-onboarding-wizard">
            <Form {...form}>
              {!hideFilters && (
                <div className="sticky top-0 z-10 mb-0 flex items-center gap-2 border-b-2 bg-background pt-2 pb-4">
                  <Input
                    containerClassName="w-[200px] shrink-0"
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search connectors..."
                    value={searchQuery}
                  >
                    <InputStart>
                      <Search className="size-4 text-muted-foreground" />
                    </InputStart>
                  </Input>
                  <DataTableFilter actions={actions} columns={filterColumns} filters={filters} />
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
                    render={({ field }) => {
                      const tiles = filteredComponents.map((component) => {
                        const uniqueKey = `${component.type}-${component.name}`;
                        const isChecked =
                          field.value === component.name && form.getValues('connectionType') === component.type;

                        return (
                          <ConnectTile
                            checked={isChecked}
                            component={component}
                            key={uniqueKey}
                            onChange={() => {
                              if (isChecked) {
                                // Unselect if already selected
                                field.onChange('');
                                form.setValue('connectionType', '' as ConnectComponentType, { shouldValidate: true });
                              } else {
                                // Select the component
                                field.onChange(component.name);
                                form.setValue('connectionType', component.type as ConnectComponentType, {
                                  shouldValidate: true,
                                });
                                onChange?.(component.name, component.type as ConnectComponentType);
                              }
                            }}
                            uniqueKey={uniqueKey}
                          />
                        );
                      });

                      const hasResults = filteredComponents.length > 0;
                      const showSkeleton = isLoading;
                      // biome-ignore lint/complexity/useSimplifiedLogicExpression: Logic is intentionally explicit for clarity
                      const hasNoResults = !showSkeleton && !hasResults;

                      let content: React.ReactNode;

                      if (hasNoResults) {
                        content = (
                          <div className="flex flex-col items-center justify-center py-8 text-center">
                            <Text className="text-muted-foreground">No connections found matching your filters</Text>
                            <Text className="mt-1 text-muted-foreground text-sm">
                              Try adjusting your search or category filters
                            </Text>
                          </div>
                        );
                      } else if (showSkeleton) {
                        content = (
                          <ConnectTilesSkeleton gridCols={gridCols} tileCount={PRIORITY_COMPONENTS.length}>
                            {tiles}
                          </ConnectTilesSkeleton>
                        );
                      } else {
                        content = (
                          <Choicebox>
                            <div className={cn('grid-auto-rows-fr grid gap-2', `grid-cols-${gridCols}`)}>{tiles}</div>
                          </Choicebox>
                        );
                      }

                      return (
                        <FormItem>
                          <FormControl>{content}</FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </div>
                {/* Gradient overlay to indicate scrollability - only show when not at bottom */}
                {Boolean(showScrollGradient) && (
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
