import { zodResolver } from '@hookform/resolvers/zod';
import { type ComponentName, componentLogoMap } from 'assets/connectors/component-logo-map';
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
import { SearchIcon, Settings, Waypoints } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import { ConnectorLogo } from './connector-logo';
import { useResetWizardSessionStorage } from '../hooks/use-reset-wizard-session-storage';
import { CUSTOM_COMPONENT_NAME, customComponentConfig } from '../types/constants';
import type { ConnectComponentSpec, ConnectComponentType, ExtendedConnectComponentSpec } from '../types/schema';
import type { BaseStepRef } from '../types/wizard';
import { type ConnectTilesFormData, connectTilesFormSchema } from '../types/wizard';
import { getAllCategories } from '../utils/categories';
import { getBuiltInComponents } from '../utils/schema';

const getComponentSummary = (component: ConnectComponentSpec, componentTypeFilter?: ConnectComponentType[]) => {
  if (component.name === 'redpanda' && componentTypeFilter?.includes('input')) {
    return 'Add data to a topic on this cluster';
  }
  if (component.name === 'redpanda' && componentTypeFilter?.includes('output')) {
    return 'Read data from a topic on this cluster';
  }
  return component.summary;
};

const getLogoForComponent = (component: ConnectComponentSpec) => {
  if (component.name === CUSTOM_COMPONENT_NAME) {
    return <Settings className="size-6 text-muted-foreground" />;
  }
  if (component?.logoUrl) {
    return <img alt={component.name} className="size-6" src={component.logoUrl} />;
  }
  if (componentLogoMap[component.name as ComponentName]) {
    return (
      <ConnectorLogo
        name={component.name as ComponentName}
        style={{
          width: '24px',
          height: '24px',
        }}
      />
    );
  }
  return <Waypoints className="size-6 text-muted-foreground" />;
};

const PRIORITY_COMPONENTS = [
  CUSTOM_COMPONENT_NAME,
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
  }
): ConnectComponentSpec[] =>
  [
    ...allComponents,
    ...(filters?.types?.includes('input') || filters?.types?.includes('output') ? [customComponentConfig] : []),
  ]
    .flat()
    .sort((a, b) => {
      const aIndex = PRIORITY_COMPONENTS.indexOf(a.name);
      const bIndex = PRIORITY_COMPONENTS.indexOf(b.name);

      // If both are priority components, sort by their priority order
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }

      // If only a is priority, it comes first
      if (aIndex !== -1) {
        return -1;
      }

      // If only b is priority, it comes first
      if (bIndex !== -1) {
        return 1;
      }

      // If neither are priority, sort alphabetically
      return a.name.localeCompare(b.name);
    })
    .filter((component) => {
      // Always show custom component regardless of type filter
      if (
        component.name === CUSTOM_COMPONENT_NAME &&
        (filters?.types?.includes('input') || filters?.types?.includes('output'))
      ) {
        return true;
      }

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
    });

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
  handleSkip?: () => void;
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
      handleSkip: handleSkipProp,
    },
    ref
  ) => {
    const [filter, setFilter] = useState<string>('');
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [showScrollGradient, setShowScrollGradient] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [showDescription, setShowDescription] = useState<string | undefined>(undefined);
    const resetWizardSessionStorage = useResetWizardSessionStorage();

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
      mode: 'onSubmit',
      defaultValues: {
        connectionName: defaultConnectionName,
        connectionType: defaultConnectionType,
      },
    });

    useEffect(() => {
      form.reset({
        connectionName: defaultConnectionName,
        connectionType: defaultConnectionType,
      });
    }, [defaultConnectionName, defaultConnectionType, form]);

    const allComponents = useMemo(
      () => [...getBuiltInComponents(), ...(additionalComponents || [])],
      [additionalComponents]
    );

    const categories = useMemo(() => getAllCategories(allComponents), [allComponents]);

    const filteredComponents = useMemo(
      () =>
        searchComponents(allComponents, filter, {
          types: componentTypeFilter,
          categories: selectedCategories,
        }),
      [componentTypeFilter, filter, selectedCategories, allComponents]
    );

    const handleSkip = useCallback(() => {
      // Reset form state before clearing storage
      form.reset({
        connectionName: undefined,
        connectionType: undefined,
      });
      // Notify parent to reset its state
      resetWizardSessionStorage();
      handleSkipProp?.();
    }, [form, handleSkipProp, resetWizardSessionStorage]);

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
      <Card className={cn(className, 'relative')} size={size} variant={variant}>
        {!hideHeader && (
          <CardHeader className="bg-background">
            <CardTitle>
              <Heading level={2}>{title ?? 'Select a connector'}</Heading>
            </CardTitle>
            <CardDescription className="mt-4">
              <Text>
                Redpanda Connect is a data streaming service for building scalable, high-performance data pipelines that
                drive real-time analytics and actionable business insights. Integrate data across systems with hundreds
                of prebuilt connectors, change data capture (CDC) capabilities, and YAML-configurable pipelines.{' '}
                <Link href="https://docs.redpanda.com/redpanda-connect/home/" target="_blank">
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
                            <div className={cn('grid-auto-rows-fr grid gap-2', `grid-cols-${gridCols}`)}>
                              {filteredComponents.map((component) => {
                                const uniqueKey = `${component.type}-${component.name}`;
                                const isChecked =
                                  field.value === component.name && form.getValues('connectionType') === component.type;
                                const shouldShowDescription = showDescription === component.name && component.summary;

                                return (
                                  <ChoiceboxItem
                                    checked={isChecked}
                                    className={cn('relative h-full', shouldShowDescription && 'hover:shadow-none')}
                                    key={uniqueKey}
                                    onClick={() => {
                                      if (component.name === CUSTOM_COMPONENT_NAME) {
                                        handleSkip();
                                        return;
                                      }
                                      field.onChange(component.name);
                                      form.setValue('connectionType', component.type as ConnectComponentType);
                                      // Only call onChange for non-wizard use cases (e.g., dialog)
                                      // Wizard saves to session storage only after "Next" is clicked
                                      onChange?.(component.name, component.type as ConnectComponentType);
                                    }}
                                    onPointerEnter={() => {
                                      setShowDescription(component.name);
                                    }}
                                    onPointerLeave={() => {
                                      setShowDescription(undefined);
                                    }}
                                    value={component.name}
                                  >
                                    <div className="flex w-full items-center justify-between gap-4">
                                      <div className="flex min-w-0 flex-col gap-1">
                                        <Text className="truncate font-medium">{component.name}</Text>
                                        <AnimatePresence>
                                          {shouldShowDescription && (
                                            <motion.div
                                              animate={{ opacity: 1 }}
                                              className={cn(
                                                '-inset-x-0.5 -top-0.5 absolute z-10 flex min-h-[58px] items-center rounded-md border-2 border-border border-solid bg-white p-4 shadow-elevated',
                                                isChecked && '!border-selected'
                                              )}
                                              exit={{ opacity: 0 }}
                                              initial={{ opacity: 0 }}
                                              key={`component-description-${component.name}`}
                                              transition={{ duration: 0.15, ease: 'easeInOut' }}
                                            >
                                              <Text className="text-muted-foreground text-sm">
                                                {getComponentSummary(component, componentTypeFilter)}
                                              </Text>
                                            </motion.div>
                                          )}
                                        </AnimatePresence>
                                      </div>
                                      <div>{getLogoForComponent(component)}</div>
                                      {isChecked && <ChoiceboxItemIndicator className="absolute top-2 right-2 z-20" />}
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
                <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-20 bg-gradient-to-t from-background via-background/80 to-transparent" />
              )}
            </div>
          </Form>
        </CardContent>
      </Card>
    );
  }
);
